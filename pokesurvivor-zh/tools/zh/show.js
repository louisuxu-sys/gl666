/* 列出待翻譯詞條的某一批。用法：node tools/zh/show.js <批次> [每批數量=130] */
"use strict";
const fs = require("fs");
const path = require("path");

const todo = JSON.parse(fs.readFileSync(path.join(__dirname, "out", "todo.json"), "utf8"));
const entries = Object.entries(todo);
const batch = Number(process.argv[2] || 0);
const size = Number(process.argv[3] || 130);
const from = batch * size;
const slice = entries.slice(from, from + size);
console.log(`# 批次 ${batch}：第 ${from}～${from + slice.length - 1} 條，共 ${entries.length} 條`);
slice.forEach(([es, en], i) => console.log(`${from + i}\t${es}\t${en}`));
