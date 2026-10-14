const fs = require("fs");
const file = __dirname + "/../../js/data/changelog.js";
let s = fs.readFileSync(file, "utf8");
if (s.includes("Versión en chino tradicional")) { console.log("= 已套用  changelog.js"); process.exit(0); }
const marker = "G.CHANGELOG = [";
const i = s.indexOf(marker);
if (i < 0) throw new Error("找不到 G.CHANGELOG");
const entry = `
  { d: '2026-10-14', title: ['Versión en chino tradicional', 'Traditional Chinese version'], new: [
    ['Nuevo idioma: chino tradicional (Taiwán). Se elige en Ajustes > Gráficos > Idioma. Los nombres de Pokémon, movimientos, objetos y tipos usan los nombres oficiales de Taiwán.',
     'New language: Traditional Chinese (Taiwan). Choose it in Settings > Graphics > Language. Pokémon, move, item and type names use the official Taiwanese names.']
  ] },`;
const at = i + marker.length;
s = s.slice(0, at) + entry + s.slice(at);
fs.writeFileSync(file, s);
console.log("✓ 已加入更新紀錄");
