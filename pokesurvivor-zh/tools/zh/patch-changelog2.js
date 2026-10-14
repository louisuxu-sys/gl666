/* 在我們新增的更新紀錄條目裡，補上「視野範圍」那一行（西班牙文／英文，中文在 changelog-zh.js）。可重複執行。 */
const fs = require("fs");
const file = __dirname + "/../../js/data/changelog.js";
let s = fs.readFileSync(file, "utf8");
if (s.includes("Campo de visión")) { console.log("= 已套用"); process.exit(0); }
const re = /(Pokémon, move, item and type names use the official Taiwanese names\.'\])(\r?\n)(\s*\] \},)/;
if (!re.test(s)) throw new Error("找不到我們的更新紀錄條目");
s = s.replace(re, (_, a, nl, b) =>
  `${a.slice(0, -1)}],${nl}    ['Nuevo ajuste "Campo de visión" (Ajustes > Gráficos) para ver más o menos mapa en pantalla.',${nl}     'New "Field of view" setting (Settings > Graphics) to see more or less of the map.']${nl}${b}`);
fs.writeFileSync(file, s);
console.log("✓ 已補上視野範圍那一行");
