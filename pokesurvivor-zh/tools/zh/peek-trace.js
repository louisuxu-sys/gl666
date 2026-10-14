const fs = require("fs");
const rows = fs.readFileSync(__dirname + "/out/trace.tsv", "utf8").split("\n").map((l) => l.split("\t"));
const by = (label) => rows.filter((r) => r[0] === label);
const show = (label, from = 0, to = 999) =>
  console.log(`--- ${label}（共 ${by(label).length}）---\n` + by(label).slice(from, to).map((r) => `${r[1]}｜${r[2]}=${r[3]}`).join("\n"));
const arg = process.argv[2] || "道具";
show(arg, Number(process.argv[3] || 0), Number(process.argv[4] || 999));
