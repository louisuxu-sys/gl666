/* 最簡單的靜態伺服器：不需要安裝任何套件。
 * 用法：node tools/zh/serve.js [埠號=8765] [位址=0.0.0.0]
 * 開啟 http://localhost:8765/ 就會載入 dev.html（中文版，未混淆的原始碼）。 */
"use strict";
const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "..");
const PORT = Number(process.argv[2]) || 8765;
const HOST = process.argv[3] || "0.0.0.0";
const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".png": "image/png", ".jpg": "image/jpeg", ".ico": "image/x-icon",
  ".svg": "image/svg+xml", ".woff2": "font/woff2", ".woff": "font/woff", ".ttf": "font/ttf", ".webmanifest": "application/manifest+json",
  ".txt": "text/plain; charset=utf-8", ".xml": "application/xml",
};
// 只提供遊戲需要的資料夾與檔案，不提供 .git、tools、docs 等
const ALLOW_DIRS = ["js", "css", "assets", "guia", "en", "pokedex", "apoyar", "contacto", "legendarios", "logros", "movimientos", "novedades", "objetos", "shinies", "tipos"];
const ALLOW_FILES = new Set(["dev.html", "index.html", "favicon.ico", "manifest.webmanifest", "sw.js", "version.json", "robots.txt", "404.html"]);

http.createServer((req, res) => {
  let rel;
  try { rel = decodeURIComponent(new URL(req.url, "http://x").pathname); } catch (_) { res.writeHead(400).end("bad request"); return; }
  if (rel === "/") rel = "/dev.html";
  const file = path.resolve(ROOT, "." + rel);
  const inside = file === ROOT || file.startsWith(ROOT + path.sep);
  const top = path.relative(ROOT, file).split(path.sep)[0];
  const allowed = inside && (ALLOW_FILES.has(top) || ALLOW_DIRS.includes(top));
  if (!allowed) { res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("找不到頁面"); return; }
  let target = file;
  try { if (fs.statSync(target).isDirectory()) target = path.join(target, "index.html"); } catch (_) { /* 下面處理 */ }
  fs.readFile(target, (err, data) => {
    if (err) { res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("找不到頁面"); return; }
    res.writeHead(200, {
      "Content-Type": TYPES[path.extname(target).toLowerCase()] || "application/octet-stream",
      "Cache-Control": "no-cache", "X-Content-Type-Options": "nosniff",
    });
    res.end(data);
  });
}).listen(PORT, HOST, () => {
  console.log(`PokéSurvivor 中文版：http://localhost:${PORT}/`);
  console.log("同事請用你電腦的區網 IP 連線，例如 http://192.168.x.x:" + PORT + "/");
});
