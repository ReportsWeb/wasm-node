import { test } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import { PrintData } from "@pao-at-office/reports-web";
import { SampleCatalog, SAMPLES } from "../SampleCatalog.js";
import { config, createApplication, BASE, inlineAssets } from "../server.js";
import pg from "pg";
const definition = { Version: "1.0", Objects: [], CoordinateUnit: "mm" };
test("helper lifecycle rejects unfinished and malformed data", () => {
  const p = new PrintData();
  assert.throws(() => p.pageStart());
  assert.throws(() => p.setDefinition({}));
  p.setDefinition(definition).pageStart();
  assert.throws(() => p.pageStart());
  assert.throws(() => p.setDefinition(definition));
  assert.throws(() => p.toJson());
  p.pageEnd();
  assert.equal(p.toObject().Pages.length, 1);
});
test("helper typed/repeated attributes and snapshots preserve exact values", () => {
  const d = structuredClone(definition);
  const p = new PrintData()
    .setDefinition(d)
    .pageStart()
    .setValue("number", 12)
    .setImage("image", "data:image/png;base64,AA==")
    .setBarcode("barcode", "123")
    .drawObject("line")
    .setRepeatedValue("cell", true, 2, 3)
    .changeRepeatedAttributes("cell", { x: 12, bold: true }, 0, 2, 3)
    .pageEnd();
  d.CoordinateUnit = "px";
  const out = p.toObject();
  assert.equal(out.Definition.CoordinateUnit, "mm");
  assert.equal(out.Pages[0].Values[4].IndexY, 3);
  assert.equal(out.Pages[0].Values[4].Value, "true");
  assert.equal(out.Pages[0].DynamicAttributes[0].Values.bold, "true");
  out.Pages.length = 0;
  assert.equal(p.toObject().Pages.length, 1);
});
test("helper rejects invalid indexes, numeric values and null attributes", () => {
  const p = new PrintData().setDefinition(definition).pageStart();
  assert.throws(() => p.setValue("x", 1, -1));
  assert.throws(() => p.setValue("x", NaN));
  assert.throws(() => p.changeAttributes("x", { bold: null }));
  assert.throws(() => p.changeRepeatedAttributes("x", {}, 0, 1));
  assert.throws(() => p.setValue("", 1));
});
test("root definition replacement does not rewrite previous pages", () => {
  const p = new PrintData()
    .setDefinition(definition)
    .pageStart()
    .pageEnd()
    .setDefinition({ ...definition, CoordinateUnit: "px" })
    .pageStart()
    .pageEnd();
  assert.equal(p.toObject().Pages[0].Definition.CoordinateUnit, "mm");
  assert.equal(p.toObject().Definition.CoordinateUnit, "px");
});
test("catalog simple and multiples use original definitions and irregular operations", async () => {
  const catalog = new SampleCatalog(config.resourceRoot, async () => []);
  for (const s of ["quick-start", "business-card", "design-showcase"])
    assert.equal((await catalog.printData(s)).toObject().Pages.length, 1);
  const p = (await catalog.printData("multiples-of-ten")).toObject();
  assert.equal(p.Pages.length, 4);
  assert(
    p.Pages[1].Values.some(
      (v: any) => v.Name === "Line3" && v.Drawing === false,
    ),
  );
  assert(
    p.Pages[0].DynamicAttributes.some(
      (v: any) => v.Name === "フォントサイズ" && v.Values.fontSize === "12",
    ),
  );
  await assert.rejects(() => catalog.definition("x"));
});
test("asset resolver uses exact registered local bytes and refuses remote/path names", async () => {
  const c = {
    ...config,
    trustedAssetBases: ["http://trusted/api?action=asset&name="],
  };
  assert.match(
    await inlineAssets("http://trusted/api?action=asset&name=kakuin.png", c),
    /^data:image\/png;base64,/,
  );
  await assert.rejects(() =>
    inlineAssets({ ImagePath: "https://evil.test/x" }, c),
  );
  await assert.rejects(() => inlineAssets(c.assetBase + "../secret", c));
  await assert.rejects(() => inlineAssets(JSON.parse('{"__proto__":{}}'), c));
});
test("HTTP catalog/data/definition/static/asset and validation", async () => {
  const app = createApplication(
    config,
    new SampleCatalog(config.resourceRoot, async () => []),
  );
  app.listen(0, "127.0.0.1");
  await once(app, "listening");
  const port = (app.address() as any).port,
    base = `http://127.0.0.1:${port}`;
  try {
    const catalog = await fetch(base + BASE + "/api?action=catalog");
    assert.deepEqual(await catalog.json(), SAMPLES);
    assert.equal(
      (await fetch(base + BASE + "/api.php?sample=quick-start")).status,
      200,
    );
    assert.equal(
      (await fetch(base + BASE + "/api?action=asset&name=kakuin.png")).status,
      200,
    );
    assert.equal(
      (await fetch(base + BASE + "/api?action=asset&name=../x")).status,
      400,
    );
    assert.equal((await fetch(base + BASE + "/api?sample=x")).status, 400);
    assert.equal(
      (await fetch(base + BASE + "/api?action=server-pdf")).status,
      405,
    );
    assert.equal(
      (
        await fetch(base + BASE + "/api?action=server-pdf", {
          method: "POST",
          body: "{}",
        })
      ).status,
      400,
    );
    const html = await (await fetch(base + BASE + "/")).text();
    assert(html.includes("TypeScript / Node.js"));
    assert(html.includes('value="invoice" selected'));
    assert(!html.includes(" th:"));
    assert.equal(
      (await fetch(base + "/demo/reports.web/preview/?empty=1")).status,
      200,
    );
    assert.equal(
      (await fetch(base + "/demo/reports.web/samples/java/pom.xml")).status,
      404,
    );
  } finally {
    app.closeAllConnections();
    await new Promise<void>((r) => app.close(() => r()));
  }
});
test("server PDF route forwards PREPEJ to common engine, returns PDF and rejects invalid response", async () => {
  let valid = true,
    received: any;
  const engine = createServer(async (req, res) => {
    const chunks = [];
    for await (const b of req) chunks.push(b);
    received = JSON.parse(Buffer.concat(chunks).toString());
    res.end(valid ? "%PDF-1.7\n test" : "invalid");
  });
  engine.listen(0, "127.0.0.1");
  await once(engine, "listening");
  const c = {
      ...config,
      engineUrl: `http://127.0.0.1:${(engine.address() as any).port}`,
    },
    app = createApplication(
      c,
      new SampleCatalog(c.resourceRoot, async () => []),
    );
  app.listen(0, "127.0.0.1");
  await once(app, "listening");
  try {
    const url = `http://127.0.0.1:${(app.address() as any).port}${BASE}/api?action=server-pdf`,
      doc = new PrintData()
        .setDefinition(definition)
        .pageStart()
        .setImage("x", c.assetBase + "kakuin.png")
        .pageEnd()
        .toJson();
    const response = await fetch(url, { method: "POST", body: doc });
    assert.equal(response.status, 200);
    assert.match(await response.text(), /^%PDF-/);
    assert.match(received.Pages[0].Values[0].Value, /^data:image\/png;base64,/);
    valid = false;
    assert.equal((await fetch(url, { method: "POST", body: doc })).status, 502);
  } finally {
    app.closeAllConnections();
    engine.closeAllConnections();
    await Promise.all([
      new Promise<void>((r) => app.close(() => r())),
      new Promise<void>((r) => engine.close(() => r())),
    ]);
  }
});
test(
  "PostgreSQL integration: all8 original samples produce96pages",
  { skip: process.env.REPORTS_TEST_DATABASE !== "1" },
  async () => {
    const pool = new pg.Pool({
      host: "127.0.0.1",
      port: Number(process.env.PGPORT ?? 5434),
      database: "reports_web_sample",
      user: "reports_web",
      password: process.env.PGPASSWORD ?? "reports-web-local-only",
    });
    try {
      const catalog = new SampleCatalog(config.resourceRoot, async (s, n) =>
        (
          await pool.query(
            "SELECT row_data FROM reports_framework_rows WHERE sample_key=$1 AND sheet_no=$2 ORDER BY row_no",
            [s, n],
          )
        ).rows.map((r) =>
          typeof r.row_data === "string" ? JSON.parse(r.row_data) : r.row_data,
        ),
      );
      const expected = [1, 4, 81, 4, 2, 2, 1, 1];
      let i = 0;
      for (const s of Object.keys(SAMPLES)) {
        const d = (await catalog.printData(s)).toObject();
        assert.equal(d.Pages.length, expected[i++], s);
        if (s === "invoice") assert(d.Pages[0].DynamicAttributes.length > 50);
        if (s === "estimate")
          assert(
            d.Pages[1].Values.some(
              (v: any) => v.Name === "ヘッダ合計" && v.Value.startsWith("\\ "),
            ),
          );
      }
    } finally {
      await pool.end();
    }
  },
);
