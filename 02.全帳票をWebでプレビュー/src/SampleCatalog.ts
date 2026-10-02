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
          .setValue("横線", "", line);
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
          .setValue("横罫線", "", i);
        if (page >= 5 && i % 2 === 1) p.setValue("網掛け", "", i);
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
        ])
          p.setValue(n, "", i);
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
        p.setValue("hLine", "", i).setValue("LineRect", "", i);
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
        p.setValue("vLine", "", j).changeAttributes(
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
          const amount = Number(r["数量"]) * Number(r["単価"]);
          total += amount;
          const row = i + 1;
          p.setValue("field1", r["品番"], row)
            .setValue("field2", r["品名"], row)
            .setValue("field3", r["数量"], row)
            .setValue("field4", number(r["単価"]), row)
            .setValue("field5", number(amount), row);
        });
      const tax = total * 0.05;
      ["小計", "消費税", "合計"].forEach((label, k) => {
        const row = maxH - 3 + k;
        p.setValue("field4", label, row)
          .setValue("field5", number([total, tax, total + tax][k]), row)
          .changeAttributes(
            "field4",
            { fontSize: 16, bold: true, horizontalAlignment: "Center" },
            row,
          );
      });
      p.setValue("txtTotal", number(total + tax))
        .changeAttributes("hLine", { strokeStyle: "Double" }, maxH - 3)
        .setValue("hLine", "", maxH)
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
      const bn = big.get(String(r["大分類コード"])) ?? "",
        sn = small.get(r["大分類コード"] + ":" + r["小分類コード"]) ?? "";
      if (prevSmall !== null && prevSmall !== sn) {
        subtotal("small", prevSmall, smallCount);
        smallCount = 0;
      }
      if (prevBig !== null && prevBig !== bn) {
        subtotal("big", prevBig, bigCount);
        bigCount = 0;
      }
      stream.push({
        大分類: prevBig !== bn ? bn : "",
        小分類: prevSmall !== sn ? sn : "",
        品番: r["品番"],
        品名: r["品名"],
        kind: "detail",
      });
      prevBig = bn;
      prevSmall = sn;
      bigCount++;
      smallCount++;
    }
    if (prevSmall !== null) subtotal("small", prevSmall, smallCount);
    if (prevBig !== null) subtotal("big", prevBig, bigCount);
    const p = new PrintData().setDefinition(d);
    for (let offset = 0; offset < stream.length; offset += 20) {
      p.pageStart();
      stream.slice(offset, offset + 20).forEach((r, i) => {
        for (const n of ["大分類", "小分類", "品番", "品名"])
          p.setValue(n, r[n], i);
        for (const n of ["枠_大分類", "枠_小分類", "枠_品番", "枠_品名"]) {
          p.setValue(n, "", i);
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
