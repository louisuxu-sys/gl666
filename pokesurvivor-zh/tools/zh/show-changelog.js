/* 列出 G.CHANGELOG（西班牙文 + 英文）供翻譯對照。用法：node tools/zh/show-changelog.js [起] [止] */
const fs = require("fs");
const path = require("path");
const G = {};
new Function("G", fs.readFileSync(path.join(__dirname, "../../js/data/changelog.js"), "utf8"))(G);
const from = Number(process.argv[2] || 0), to = Number(process.argv[3] || G.CHANGELOG.length - 1);
G.CHANGELOG.forEach((v, i) => {
  if (i < from || i > to) return;
  console.log(`\n##### [${i}] ${v.d}  標題：${v.title[0]}  ／ ${v.title[1]}`);
  for (const k of ["new", "chg", "fix"]) (v[k] || []).forEach((l, j) => console.log(`  ${k}[${j}] ES: ${l[0]}\n         EN: ${l[1]}`));
});
