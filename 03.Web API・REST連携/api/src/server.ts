import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { readFile, stat } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolve, extname, sep } from "node:path";
import pg from "pg";
import { SampleCatalog, SAMPLES } from "./SampleCatalog.js";
import { ReportsWebEngine, ReportsWebEngineError, type JsonObject } from "@pao-at-office/reports-web";
export const BASE = "/demo/reports.web/samples/node";
const MAX = 32 * 1024 * 1024;
const HERE = fileURLToPath(new URL("..", import.meta.url));
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export interface Config {
  port: number;
  resourceRoot: string;
  webRoot: string;
  assetBase: string;
  trustedAssetBases: string[];
  engineUrl: string;
  template: string;
}
export const config: Config = {
  port: Number(process.env.PORT ?? 8092),
  resourceRoot: resolve(
    process.env.REPORTS_RESOURCE_ROOT ?? resolve(HERE, "../php/resources"),
  ),
  webRoot: resolve(
    process.env.REPORTS_WEB_ROOT ?? resolve(HERE, "../../deploy/reports.web"),
  ),
  assetBase:
    process.env.REPORTS_PUBLIC_ASSET_BASE ??
    `http://127.0.0.1:${process.env.PORT ?? 8092}${BASE}/api?action=asset&name=`,
  trustedAssetBases: (process.env.REPORTS_TRUSTED_ASSET_BASES ?? "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean),
  engineUrl: process.env.REPORTS_ENGINE_URL ?? "http://127.0.0.1:3107",
  template: resolve(HERE, "public/index.html"),
};
const assets = new Set(["kakuin.png", "estimate-header.jpg"]);
const mime = (name: string) =>
  name.endsWith(".jpg") ? "image/jpeg" : "image/png";
async function asset(c: Config, n: string) {
  if (!assets.has(n)) throw new HttpError(400, "未登録の画像資源です。");
  return readFile(resolve(c.resourceRoot, "images", n));
}
export async function inlineAssets(
  value: any,
  c: Config,
  depth = 0,
): Promise<any> {
  if (depth > 100) throw new HttpError(400, "印刷データの階層が深すぎます。");
  if (Array.isArray(value))
    return Promise.all(value.map((v) => inlineAssets(v, c, depth + 1)));
  if (value && typeof value === "object") {
    const result: JsonObject = {};
    for (const [k, v] of Object.entries(value)) {
      if (k === "__proto__" || k === "constructor" || k === "prototype")
        throw new HttpError(400, "不正な項目です。");
      result[k] = await inlineAssets(v, c, depth + 1);
      if (
        k === "ImagePath" &&
        typeof result[k] === "string" &&
        result[k] &&
        !result[k].startsWith("data:")
      )
        throw new HttpError(400, "登録済みの画像を指定してください。");
    }
    return result;
  }
  if (typeof value === "string") {
    for (const base of [c.assetBase, ...c.trustedAssetBases])
      if (value.startsWith(base)) {
        const n = value.slice(base.length);
        if (!assets.has(n)) throw new HttpError(400, "未登録の画像資源です。");
        return (
          "data:" +
          mime(n) +
          ";base64," +
          (await asset(c, n)).toString("base64")
        );
      }
  }
  return value;
}
async function embedDefinitionImages(d: JsonObject, s: string, c: Config) {
  for (const o of d.Objects ?? []) {
    let a: string | undefined;
    if ((s === "invoice" || s === "estimate") && o.Name === "Image1")
      a = "kakuin.png";
    if (s === "estimate" && o.Name === "Image2") a = "estimate-header.jpg";
    if (a) {
      o.ImagePath = "data:" + mime(a) + ";base64," + (await asset(c, a)).toString("base64");
      o.ImageDataBase64 = "";
    }
  }
}
async function readBody(req: IncomingMessage) {
  if (Number(req.headers["content-length"] ?? 0) > MAX)
    throw new HttpError(413, "印刷データは32MiB以内にしてください。");
  let n = 0;
  const chunks: Buffer[] = [];
  for await (const part of req) {
    const b = Buffer.from(part);
    n += b.length;
    if (n > MAX)
      throw new HttpError(413, "印刷データは32MiB以内にしてください。");
    chunks.push(b);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new HttpError(400, "JSON形式が不正です。");
  }
}
function json(
  res: ServerResponse,
  v: any,
  status = 200,
  type = "application/json; charset=utf-8",
) {
  res.writeHead(status, { "Content-Type": type });
  res.end(JSON.stringify(v));
}
export function createApplication(c: Config, catalog: SampleCatalog) {
  let busy = false;
  return createServer(async (req, res) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Referrer-Policy", "same-origin");
    try {
      const url = new URL(req.url ?? "/", "http://localhost"),
        path = url.pathname;
      if (path === "/health" || path === BASE + "/health") {
        json(res, { status: "UP" });
        return;
      }
      if (path === "/" || path === BASE) {
        res.writeHead(302, { Location: BASE + "/" });
        res.end();
        return;
      }
      if (path === BASE + "/") {
        if (req.method !== "GET")
          throw new HttpError(405, "GETを使用してください。");
        const s = url.searchParams.get("sample") ?? "invoice",
          selected = Object.hasOwn(SAMPLES, s) ? s : "invoice";
        const html = (await readFile(c.template, "utf8")).replace(
          "{{SAMPLES}}",
          Object.entries(SAMPLES)
            .map(
              ([key, label]) =>
                `<option value="${key}"${key === selected ? " selected" : ""}>${label}</option>`,
            )
            .join(""),
        );
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.end(html);
        return;
      }
      if (path === BASE + "/api" || path === BASE + "/api.php") {
        const action = url.searchParams.get("action") ?? "data",
          s = url.searchParams.get("sample") ?? "invoice";
        if (action === "server-pdf") {
          if (req.method !== "POST")
            throw new HttpError(405, "POSTを使用してください。");
          if (busy)
            throw new HttpError(
              429,
              "PDF作成中です。少し待ってからお試しください。",
            );
          busy = true;
          try {
            const body = await readBody(req);
            if (
              !body ||
              !Array.isArray(body.Pages) ||
              !body.Pages.length ||
              (body.Format !== undefined &&
                body.Format !== "Reports.net PrintData")
            )
              throw new HttpError(
                400,
                "PREPEJ形式の印刷データではありません。",
              );
            const data = await inlineAssets(body, c),
              payload = JSON.stringify(data);
            if (Buffer.byteLength(payload) > MAX)
              throw new HttpError(413, "展開後の印刷データが32MiBを超えます。");
            let pdf: Buffer;
            try {
              // @pao-at-office/reports-web: POST /render/pdf to the Reports.Web engine.
              pdf = await new ReportsWebEngine({ url: c.engineUrl, maxBytes: MAX }).renderPdf(payload);
            } catch (error) {
              if (error instanceof ReportsWebEngineError)
                throw new HttpError(502, "サーバーでPDFを作成できませんでした。");
              throw error;
            }
            res.writeHead(200, {
              "Content-Type": "application/pdf",
              "X-Reports-Engine": "server-wasm",
              "Content-Disposition": `inline; filename="${s.replace(/[^A-Za-z0-9_.-]/g, "_")}.pdf"`,
            });
            res.end(pdf);
          } finally {
            busy = false;
          }
          return;
        }
        if (req.method !== "GET")
          throw new HttpError(405, "GETを使用してください。");
        if (action === "catalog") {
          json(res, SAMPLES);
          return;
        }
        if (action === "asset") {
          const n = url.searchParams.get("name") ?? "";
          const bytes = await asset(c, n);
          res.writeHead(200, {
            "Content-Type": mime(n),
            "Cache-Control": "public, max-age=86400",
          });
          res.end(bytes);
          return;
        }
        if (!Object.hasOwn(SAMPLES, s))
          throw new HttpError(400, "帳票を選択してください。");
        if (action === "definition") {
          const d = await catalog.definition(s);
          await embedDefinitionImages(d, s, c);
          res.setHeader(
            "Content-Disposition",
            `inline; filename="${s}.prepdj"`,
          );
          json(
            res,
            d,
            200,
            "application/vnd.pao.reports-definition+json; charset=utf-8",
          );
          return;
        }
        if (action !== "data") throw new HttpError(400, "未対応の操作です。");
        const d = (await catalog.printData(s)).toObject();
        if (d.Definition) await embedDefinitionImages(d.Definition, s, c);
        for (const p of d.Pages) {
          if (p.Definition) await embedDefinitionImages(p.Definition, s, c);
          if (s === "invoice")
            for (const v of p.Values)
              if (v.Name === "Image1") v.Value = "data:image/png;base64," + (await asset(c, "kakuin.png")).toString("base64");
        }
        res.setHeader("Content-Disposition", `inline; filename="${s}.prepej"`);
        json(
          res,
          d,
          200,
          "application/vnd.pao.reports-printdata+json; charset=utf-8",
        );
        return;
      }
      if (req.method !== "GET" && req.method !== "HEAD")
        throw new HttpError(405, "GETを使用してください。");
      if (!path.startsWith("/demo/reports.web/"))
        throw new HttpError(404, "見つかりません。");
      let relative = decodeURIComponent(
        path.slice("/demo/reports.web/".length),
      );
      if (
        !/^(preview|design|assets|barcode|fonts|wasm)(\/|$)/.test(relative) &&
        !["fontmap.json", "font-map.json", "preview-help.html"].includes(relative)
      )
        throw new HttpError(404, "見つかりません。");
      if (
        relative.endsWith("/") ||
        relative === "preview" ||
        relative === "design"
      )
        relative = relative.replace(/\/$/, "") + "/index.html";
      const file = resolve(c.webRoot, relative);
      if (!file.startsWith(c.webRoot + sep))
        throw new HttpError(404, "見つかりません。");
      const info = await stat(file).catch(() => null);
      if (!info?.isFile()) throw new HttpError(404, "見つかりません。");
      const types: Record<string, string> = {
        ".html": "text/html; charset=utf-8",
        ".js": "text/javascript",
        ".css": "text/css",
        ".json": "application/json",
        ".wasm": "application/wasm",
        ".svg": "image/svg+xml",
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".ttf": "font/ttf",
        ".woff2": "font/woff2",
        ".woff": "font/woff",
      };
      res.writeHead(200, {
        "Content-Type": types[extname(file)] ?? "application/octet-stream",
        "Content-Length": info.size,
      });
      if (req.method === "HEAD") res.end();
      else
        createReadStream(file)
          .on("error", () => res.destroy())
          .pipe(res);
    } catch (error) {
      const e =
        error instanceof HttpError
          ? error
          : new HttpError(
              500,
              "処理に失敗しました。設定とサーバーログを確認してください。",
            );
      if (!(error instanceof HttpError))
        console.error(
          error instanceof Error ? error.message : "Request failed",
        );
      if (!res.headersSent) json(res, { error: e.message }, e.status);
      else res.destroy();
    }
  });
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const pool = new pg.Pool({
    host: process.env.PGHOST ?? "127.0.0.1",
    port: Number(process.env.PGPORT ?? 5434),
    database: process.env.PGDATABASE ?? "reports_web_sample",
    user: process.env.PGUSER ?? "reports_web",
    password: process.env.PGPASSWORD ?? "reports-web-local-only",
    max: 3,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 10000,
  });
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
  const app = createApplication(config, catalog);
  // Default remains loopback. Containers explicitly opt into their private interface.
  app.listen(config.port, process.env.HOST ?? "127.0.0.1", () =>
    console.log(
      `Reports Web TypeScript / Node.js: http://127.0.0.1:${config.port}${BASE}/`,
    ),
  );
  for (const signal of ["SIGINT", "SIGTERM"] as const)
    process.on(signal, () =>
      app.close(() => void pool.end().then(() => process.exit(0))),
    );
}
