import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { PrintData, type JsonObject } from "@pao-at-office/reports-web";
export const SAMPLES: Record<string, string> = {
  "quick-start": "あっという間に帳票出力",
  "multiples-of-ten": "10のサンプル",
  postal: "郵便番号一覧（定義切替）",
  estimate: "見積書（表紙＋明細）",
  invoice: "請求書",
  products: "商品大小分類（途中で小計）",
  "business-card": "名刺",
  "design-showcase": "デザイン機能見本",
};
export type QueryRows = (
  sample: string,
  sheet: number,
) => Promise<JsonObject[]>;
const number = (v: any) =>
  Number(v).toLocaleString("en-US", { maximumFractionDigits: 0 });

// Reports.NET invoice: round operands to even before multiplying; N0 is display-only.
const invoiceValue = (v: any): number => {
  if (v == null || String(v).trim() === '') throw new Error('Invoice numeric value is required');
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error('Invalid invoice numeric value');
  return n;
};
const invoiceEven = (n: number): number => {
  const a = Math.abs(n), f = Math.floor(a), d = a - f;
  return Math.sign(n) * (d < .5 ? f : d > .5 ? f + 1 : f % 2 === 0 ? f : f + 1);
};
const invoiceInteger = (v: any): number => {
  const n = invoiceEven(invoiceValue(v));
  if (!Number.isSafeInteger(n)) throw new Error('Invoice integer exceeds exact JavaScript range');
  return n === 0 ? 0 : n;
};
const invoiceNumber = (v: any): string => {
  const n = invoiceEven(invoiceValue(v));
  if (!Number.isSafeInteger(n)) throw new Error('Invoice display exceeds exact JavaScript range');
  return n.toLocaleString('en-US', {maximumFractionDigits:0});
};

const date = (v: Date, japanese = false) => {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Tokyo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(v)
      .map((x) => [x.type, x.value]),
  );
  return japanese
    ? `${p.year}年${+p.month}月${+p.day}日`
    : `${p.year}/${p.month}/${p.day} ${p.hour}:${p.minute}:${p.second}`;
};
const obj = (d: JsonObject, n: string) => {
  const o = d.Objects.find((o: JsonObject) => o.Name === n);
  if (!o) throw new Error("Missing object " + n);
  return o;
};
export class SampleCatalog {
  constructor(
    private root: string,
    private query: QueryRows,
    private clock = () => new Date(),
  ) {}
  private async load(n: string) {
    const d = JSON.parse(
      await readFile(join(this.root, "definitions", n), "utf8"),
    );
    PrintData.assertDefinition(d);
    if ((d.CoordinateUnit ?? "mm") !== "mm")
      throw new Error("Original definition must use mm");
    return d;
  }
  async definition(s: string) {
    if (!Object.hasOwn(SAMPLES, s)) throw new Error("Unknown sample");
    return this.load((s === "postal" ? "postal-1" : s) + ".prepdj");
  }
  async printData(s: string) {
    const d = await this.definition(s);
    switch (s) {
      case "multiples-of-ten":
        return this.multiples(d);
      case "postal":
        return this.postal();
      case "estimate":
        return this.estimate();
      case "invoice":
        return this.invoice(d);
      case "products":
        return this.products(d);
      default: {
        const p = new PrintData().setDefinition(d).pageStart();
        if (s === "quick-start")
          p.setValue("Text2", "Webブラウザで作った\n印刷データです。");
        // 名刺は 5 段。繰返しの物体は、何も書かないと 1 段目にしか描かない（原本と同じ、D-37）。
        // 各段に定義の文字をそのまま書く。
        if (s === "business-card")
          for (const o of d.Objects)
            for (let i = 0; i < (o.RepeatCount ?? o.Repeat ?? 0); i++)
              p.setValue(o.Name, o.Text ?? "", i);
        return p.pageEnd();
      }
    }
  }
  private multiples(d: JsonObject) {
    const p = new PrintData().setDefinition(d);
    for (let page = 1; page <= 4; page++) {
      p.pageStart()
        .setValue("日付", date(this.clock()))
        .setValue("頁数", "Page - " + page)
        .setValue("フォントサイズ", "フォントサイズ\n 変更後")
        .changeAttributes("フォントサイズ", { fontSize: 12 });
      // 2ページ目だけ、ページ上部の線「Line3」を非表示にする。空文字と drawing=false を指定する。
      if (page === 2) p.setValue("Line3", "", 0, false);
      for (let line = 0; line < 15; line++) {
        const i = (page - 1) * 15 + line + 1;
        p.setValue("行番号", i, line)
          .setValue("10倍数", i * 10, line)
          .drawObject("横線", line); // 罫線は値を書かずに描く（"" を書くと描かない。原本と同じ、D-33）
        // 100で割り切れる値だけ、この行の文字色を青にする。
        if ((i * 10) % 100 === 0) p.changeAttributes("10倍数", { foreground: "#FF0000FF" }, line);
      }
      p.pageEnd();
    }
    return p;
  }
  private async postal() {
    const rows = await this.query("postal", 1),
      first = await this.load("postal-1.prepdj"),
      second = await this.load("postal-2.prepdj"),
      p = new PrintData().setDefinition(first);
    for (let offset = 0, page = 0; offset < rows.length; offset += 32, page++) {
      const chunk = rows.slice(offset, offset + 32);
      p.pageStart(page < 5 ? first : second)
        .setValue("ページ", "Page-" + (page + 1))
        .setValue("日時", date(this.clock()));
      chunk.forEach((row, i) => {
        const v = Object.values(row);
        p.setValue("郵便番号", v[0] ?? "", i)
          .setValue("市区町村", v[1] ?? "", i)
          .setValue("住所", v[2] ?? "", i)
          .drawObject("横罫線", i);
        if (page >= 5 && i % 2 === 1) p.drawObject("網掛け", i);
      });
      if (page < 5) {
        const v = Object.values(chunk[0]);
        p.setValue("QR", `${v[0] ?? ""} ${v[1] ?? ""}${v[2] ?? ""}`.trim());
      }
      p.pageEnd();
    }
    return p;
  }
  private async estimate() {
    const headers = await this.query("estimate", 1),
      details = await this.query("estimate", 2),
      cover = await this.load("estimate-cover.prepdj"),
      body = await this.load("estimate.prepdj"),
      p = new PrintData().setDefinition(cover);
    for (const h of headers) {
      p.pageStart(cover)
        .setValue("お客様名", h["お客様名"])
        .setValue("担当者名", h["担当者名"])
        .pageEnd()
        .pageStart(body)
        .setValue("見積番号", h["見積番号"])
        .setValue("お客様名", h["お客様名"])
        .setValue("担当者名", h["担当者名"])
        .setValue("見積日", date(new Date(h["見積日"]), true))
        .setValue("ヘッダ合計", "\\ " + number(h["合計金額"]))
        .setValue("消費税額", number(h["消費税額"]))
        .setValue("フッタ合計", number(h["合計金額"]));
      for (let i = 0; i <= 6; i++)
        for (const n of [
          "品番白",
          "品名白",
          "数量白",
          "単価白",
          "金額白",
          "品番青",
          "品名青",
          "数量青",
          "単価青",
          "金額青",
          // 品名青・単価青と同じ位置の帯。何も書かないと 1 行目にしか描かない（D-37）。
          "Square5",
          "Square10",
        ])
          p.drawObject(n, i); // 白・青の帯（四角形）。"" を書くと描かない（D-33）
      details
        .filter((r) => String(r["見積番号"]) === String(h["見積番号"]))
        .forEach((r, i) =>
          p
            .setValue("品番", r["品番"], i)
            .setValue("品名", r["品名"], i)
            .setValue("数量", r["数量"], i)
            .setValue("単価", number(r["単価"]), i)
            .setValue("金額", number(r["金額"]), i),
        );
      p.pageEnd();
    }
    return p;
  }
  private async invoice(d: JsonObject) {
    const headers = await this.query("invoice", 1),
      details = await this.query("invoice", 2),
      p = new PrintData().setDefinition(d),
      px = 96 / 25.4,
      image =
        "data:image/png;base64," +
        (await readFile(join(this.root, "images", "kakuin.png"))).toString(
          "base64",
        );
    for (const h of headers) {
      const maxH = Math.max(
          4,
          (obj(d, "hLine").Repeat ?? obj(d, "hLine").RepeatCount) - 1,
        ),
        maxV = Math.max(
          1,
          (obj(d, "vLine").Repeat ?? obj(d, "vLine").RepeatCount) - 1,
        );
      p.pageStart()
        .setValue("txtNo", h["請求番号"])
        .setValue("txtCustomer", h["お客様名"])
        .setValue("txtDate", date(this.clock(), true))
        .setValue("Image1", image);
      const adjust = [-5, 44, -20, -10, -9],
        columnX: number[] = [];
      let nextX = 0;
      for (let j = 0; j < maxV; j++) {
        const base = obj(d, "field" + (j + 1)),
          x = j === 0 ? base.X * px : nextX;
        columnX.push(x);
        nextX = x + (base.Width + adjust[j]) * px;
      }
      for (let i = 0; i < maxH; i++) {
        p.drawObject("hLine", i).drawObject("LineRect", i); // 罫線・背景は値を書かずに描く（D-33）
        if (i === 0) p.changeAttributes("hLine", { borderWidth: 0.5 * px }, i);
        if (i === 1) p.changeAttributes("hLine", { strokeStyle: "Double" }, i);
        const color =
          i === 0
            ? "#FFFFDAB9"
            : i < maxH - 3
              ? i % 2 === 1
                ? "#FFFFFFFF"
                : "#FF87CEFA"
              : "#FFFFFFB4";
        p.changeAttributes(
          "LineRect",
          { background: color, fillEnabled: true, fillStyle: "Solid", borderColor: "#FFFFFFFF" },
          i,
        );
        for (let j = 0; j < maxV; j++) {
          // Native SetObject does not paint an unwritten product/quantity cell.
          if (j < 3 && i > details.filter(r => String(r["請求番号"]) === String(h["請求番号"])).length) continue;
          const base = obj(d, "field" + (j + 1));
          p.setValue("field" + (j + 1), "", i).changeAttributes(
            "field" + (j + 1),
            {
              x: columnX[j],
              width: (base.Width + adjust[j]) * px,
              bold: i === 0,
              fontSize: i === 0 ? base.FontSizePt : 12,
              horizontalAlignment:
                i === 0
                  ? "Center"
                  : j === 1
                    ? "Left"
                    : j === 0
                      ? "Center"
                      : "Right",
            },
            i,
          );
        }
      }
      for (let j = 0; j <= maxV; j++) {
        p.drawObject("vLine", j).changeAttributes(
          "vLine",
          { x: j < maxV ? columnX[j] : nextX },
          j,
        );
        if (j === 0 || j === maxV)
          p.changeAttributes("vLine", { borderWidth: 0.5 * px }, j);
      }
      ["品番", "品名", "数量", "単価", "金額"].forEach((n, j) =>
        p.setValue("field" + (j + 1), n, 0),
      );
      let total = 0;
      details
        .filter((r) => String(r["請求番号"]) === String(h["請求番号"]))
        .forEach((r, i) => {
          const amount = invoiceInteger(r["数量"]) * invoiceInteger(r["単価"]);
          if (!Number.isSafeInteger(amount) || !Number.isSafeInteger(total + amount)) throw new Error('Invoice total exceeds exact JavaScript range');
          total += amount;
          const row = i + 1;
          p.setValue("field1", r["品番"], row)
            .setValue("field2", r["品名"], row)
            .setValue("field3", r["数量"], row)
            .setValue("field4", invoiceNumber(r["単価"]), row)
            .setValue("field5", invoiceNumber(amount), row);
        });
      const tax = total * 0.05;
      ["小計", "消費税", "合計"].forEach((label, k) => {
        const row = maxH - 3 + k;
        p.setValue("field4", label, row)
          .setValue("field5", invoiceNumber([total, tax, total + tax][k]), row)
          .changeAttributes(
            "field4",
            { fontSize: 16, bold: true, horizontalAlignment: "Center" },
            row,
          );
      });
      p.setValue("txtTotal", invoiceNumber(total + tax))
        .changeAttributes("hLine", { strokeStyle: "Double" }, maxH - 3)
        .drawObject("hLine", maxH)
        .changeAttributes("hLine", { borderWidth: 0.5 * px }, maxH)
        .pageEnd();
    }
    return p;
  }
  private async products(d: JsonObject) {
    const big = new Map(
        (await this.query("products", 1)).map((r) => [
          String(r["大分類コード"]),
          r["大分類名称"],
        ]),
      ),
      small = new Map(
        (await this.query("products", 2)).map((r) => [
          r["大分類コード"] + ":" + r["小分類コード"],
          r["小分類名称"],
        ]),
      );
    const rows = await this.query("products", 3);
    rows.sort(
      (a, b) =>
        Number(a["大分類コード"]) - Number(b["大分類コード"]) ||
        Number(a["小分類コード"]) - Number(b["小分類コード"]),
    );
    const stream: JsonObject[] = [];
    let prevBig: string | null = null,
      prevSmall: string | null = null,
      prevBigCode: string | null = null,
      prevSmallCode: string | null = null,
      bigCount = 0,
      smallCount = 0;
    const subtotal = (kind: string, n: string, count: number) =>
      stream.push({
        大分類: "",
        小分類: `${kind === "small" ? "小分類" : "大分類"}(${n})小計`,
        品番: count + " 冊",
        品名: "",
        kind,
      });
    for (const r of rows) {
      const bigCode = String(r["大分類コード"]),
        smallCode = String(r["小分類コード"]),
        bn = big.get(bigCode) ?? "",
        sn = small.get(bigCode + ":" + smallCode) ?? "",
        bigChanged = prevBigCode !== bigCode,
        smallChanged = bigChanged || prevSmallCode !== smallCode;
      if (prevSmallCode !== null && smallChanged) {
        subtotal("small", prevSmall ?? "", smallCount);
        smallCount = 0;
      }
      if (prevBigCode !== null && bigChanged) {
        subtotal("big", prevBig ?? "", bigCount);
        bigCount = 0;
      }
      stream.push({
        大分類: bigChanged ? bn : "",
        小分類: smallChanged ? sn : "",
        品番: r["品番"],
        品名: r["品名"],
        kind: "detail",
      });
      prevBig = bn;
      prevSmall = sn;
      prevBigCode = bigCode;
      prevSmallCode = smallCode;
      bigCount++;
      smallCount++;
    }
    if (prevSmall !== null) subtotal("small", prevSmall ?? "", smallCount);
    if (prevBig !== null) subtotal("big", prevBig ?? "", bigCount);
    const p = new PrintData().setDefinition(d);
    for (let offset = 0; offset < stream.length; offset += 20) {
      p.pageStart();
      stream.slice(offset, offset + 20).forEach((r, i) => {
        for (const n of ["大分類", "小分類", "品番", "品名"])
          p.setValue(n, r[n], i);
        for (const n of ["枠_大分類", "枠_小分類", "枠_品番", "枠_品名"]) {
          p.drawObject(n, i); // 枠（四角形）。"" を書くと描かない（D-33）
          if (r.kind !== "detail")
            p.changeAttributes(
              n,
              {
                background: r.kind === "small" ? "#FFFFFFE0" : "#FFFFB6C1",
                fillEnabled: true, fillStyle: "Solid",
              },
              i,
            );
        }
      });
      p.pageEnd();
    }
    return p;
  }
}
