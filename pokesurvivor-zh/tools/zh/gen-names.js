/* 產生繁體中文（台灣）官方名稱對照。
 * 來源：PokeAPI 的 CSV（local_language_id 4 = zh-Hant 台灣，9 = en）。
 * 用法：node tools/zh/gen-names.js
 * 輸出：tools/zh/out/auto.json（lang-en 詞條中可自動對應的）、todo.json（需要手動翻譯的）、pokemon.json（寶可夢名稱） */
"use strict";
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "..");
const DATA = path.join(__dirname, "data");
const OUT = path.join(__dirname, "out");
fs.mkdirSync(OUT, { recursive: true });

function parseCsv(file) {
  const rows = [];
  for (const line of fs.readFileSync(path.join(DATA, file), "utf8").split(/\r?\n/).slice(1)) {
    if (!line) continue;
    const cells = [];
    let cur = "", q = false;
    for (const ch of line) {
      if (ch === '"') q = !q;
      else if (ch === "," && !q) { cells.push(cur); cur = ""; } else cur += ch;
    }
    cells.push(cur);
    rows.push(cells);
  }
  return rows;
}

const norm = (s) => s.normalize("NFKD").replace(/[\u2019']/g, "'").toLowerCase().trim();

/** 回傳 英文名(正規化) -> 繁中名 */
function namesMap(file) {
  const byId = new Map();
  for (const [id, lang, name] of parseCsv(file)) {
    if (!byId.has(id)) byId.set(id, {});
    if (lang === "9") byId.get(id).en = name;
    if (lang === "4") byId.get(id).zh = name;
  }
  const m = new Map();
  for (const v of byId.values()) if (v.en && v.zh) m.set(norm(v.en), v.zh);
  return m;
}

// 屬性要排最前面：例如 Psychic 同時是屬性（超能力）和招式（精神強念），遊戲裡的 'Psíquico' 是屬性。
const sources = {
  屬性: namesMap("type_names.csv"),
  招式: namesMap("move_names.csv"),
  道具: namesMap("item_names.csv"),
  特性: namesMap("ability_names.csv"),
  地區: namesMap("region_names.csv"),
};

// 載入 lang-en 字典
let dict = {};
new Function("G", fs.readFileSync(path.join(ROOT, "js/data/lang-en.js"), "utf8"))({ I18n: { lang: "en", add: (d) => { dict = { ...dict, ...d }; } } });

const auto = {}, todo = {}, trace = [];
for (const [es, en] of Object.entries(dict)) {
  if (es.includes("{x}") || /[.!?¡¿,:;]/.test(en) || en.split(/\s+/).length > 4) { todo[es] = en; continue; }
  let hit = null;
  for (const [label, m] of Object.entries(sources)) {
    if (m.has(norm(en))) { hit = [label, m.get(norm(en))]; break; }
  }
  if (hit) { auto[es] = hit[1]; trace.push(`${hit[0]}\t${es}\t${en}\t${hit[1]}`); } else todo[es] = en;
}

// 寶可夢名稱：pokedex.js 的 name -> 台灣譯名（以全國圖鑑編號對應 species id）
const G = {};
new Function("G", fs.readFileSync(path.join(ROOT, "js/data/pokedex.js"), "utf8"))(G);
const species = new Map();
for (const [id, lang, name] of parseCsv("pokemon_species_names.csv")) if (lang === "4") species.set(Number(id), name);
const pokemon = {}, missing = [];
for (const p of G.DEX) {
  const zh = species.get(p.dex);
  if (zh) pokemon[p.name] = zh; else missing.push(`${p.dex} ${p.name}`);
}

fs.writeFileSync(path.join(OUT, "auto.json"), JSON.stringify(auto, null, 1));
fs.writeFileSync(path.join(OUT, "todo.json"), JSON.stringify(todo, null, 1));
fs.writeFileSync(path.join(OUT, "pokemon.json"), JSON.stringify(pokemon, null, 1));
fs.writeFileSync(path.join(OUT, "trace.tsv"), trace.join("\n"));

console.log("lang-en 詞條總數：", Object.keys(dict).length);
console.log("自動對應（官方名稱）：", Object.keys(auto).length);
console.log("需要手動翻譯：", Object.keys(todo).length);
console.log("寶可夢：", G.DEX.length, "隻，找到台灣譯名：", Object.keys(pokemon).length, "，沒有譯名：", missing.length);
if (missing.length) console.log("  沒有譯名的前 15 隻：", missing.slice(0, 15).join("、"));
