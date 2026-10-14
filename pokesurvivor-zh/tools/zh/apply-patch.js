/* 把「繁體中文」支援套用到原版 PokéSurvivor 原始碼。每一項都會檢查是否真的替換成功。
 * 重複執行是安全的（已套用的項目會顯示「已套用」並略過）。 */
"use strict";
const fs = require("fs");
const path = require("path");
const ROOT = path.resolve(__dirname, "..", "..");
const rd = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
const wr = (f, s) => fs.writeFileSync(path.join(ROOT, f), s);

let failed = 0;
function patch(file, label, from, to, { all = false, applied } = {}) {
  let s = rd(file);
  if (applied ? s.includes(applied) : s.includes(to) && !s.includes(from)) { console.log(`= 已套用  ${file}  ${label}`); return; }
  if (!s.includes(from)) { console.log(`✗ 找不到  ${file}  ${label}`); failed++; return; }
  const n = s.split(from).length - 1;
  if (!all && n !== 1) { console.log(`✗ 出現 ${n} 次（預期 1 次）  ${file}  ${label}`); failed++; return; }
  s = all ? s.split(from).join(to) : s.replace(from, () => to);
  wr(file, s);
  console.log(`✓ 已修改  ${file}  ${label}${all ? `（${n} 處）` : ""}`);
}

// 1) i18n：支援 zh（預設中文；有儲存的選擇則照它）
patch("js/core/i18n.js", "語言偵測",
  "const lang = saved === 'es' || saved === 'en' ? saved : byPath || (nav.startsWith('es') ? 'es' : 'en');",
  "const lang = saved === 'es' || saved === 'en' || saved === 'zh' ? saved : byPath || (nav ? 'zh' : 'zh'); // 中文版：沒有儲存過選擇時預設為繁體中文");
patch("js/core/i18n.js", "文件語言標記",
  "document.documentElement.lang = lang;",
  "document.documentElement.lang = lang === 'zh' ? 'zh-TW' : lang;");
patch("js/core/i18n.js", "英文版連結只在英文時改",
  "    document.querySelectorAll('a[href]').forEach(a => { const h = a.getAttribute('href'); if (EN_LINKS[h]) a.setAttribute('href', EN_LINKS[h]); });",
  "    if (lang === 'en') document.querySelectorAll('a[href]').forEach(a => { const h = a.getAttribute('href'); if (EN_LINKS[h]) a.setAttribute('href', EN_LINKS[h]); });");
patch("js/core/i18n.js", "匯出數字格式",
  "  return { lang, add, t, f, set, startDom, walk };",
  "  // 數字格式：中文用 1,000；其他語言維持原本的設定。\n  const numLocale = lang === 'zh' ? 'zh-TW' : 'es';\n\n  return { lang, numLocale, add, t, f, set, startDom, walk };");

// 1b) 等級縮寫：西班牙文 "Nv." 太短，字典的片段比對不會處理（畫面左上角、結算畫面），中文版統一改成 "Lv."
patch("js/core/i18n.js", "等級縮寫 Nv. → Lv.",
  "let r = core(s);",
  "let r = core(s);\n    if (lang === 'zh') r = r.replace(/\\bNv\\./g, 'Lv.');",
  { applied: "r.replace(/\\bNv\\./g, 'Lv.')" });

// 1c) 視野（畫面縮放）：原版固定顯示 768 單位寬的世界，視窗越大畫面就放得越大；新增「視野」設定可看到更大範圍
patch("js/core/settings.js", "新增 view 設定預設值",
  "quality: 'auto', dmgNumbers: true, calm: false, fps: false, stick: 1 };",
  "quality: 'auto', dmgNumbers: true, calm: false, fps: false, stick: 1, view: 'normal' };");
patch("js/core/camera.js", "依視野設定計算縮放",
  "this.scale = Math.min(cssW / this.VIEW_W, cssH / this.MIN_VIEW_H);",
  "const vw = ({ near: 576, normal: 768, far: 1152, wide: 1536 })[G.Settings.get('view')] || this.VIEW_W;   // 視野：近/標準/遠/很遠\n    this.scale = Math.min(cssW / vw, cssH / (this.MIN_VIEW_H * vw / this.VIEW_W));");
patch("js/ui/settings-ui.js", "圖形頁加入視野選項",
  "+ choice('quality', [['auto', 'Auto'], ['high', 'Alta'], ['mid', 'Media'], ['low', 'Baja']])",
  "+ choice('quality', [['auto', 'Auto'], ['high', 'Alta'], ['mid', 'Media'], ['low', 'Baja']])\n        + section('Campo de visión', 'Cuánto mapa se ve en pantalla. Más lejos = ves más enemigos, pero más pequeños.')\n        + choice('view', [['near', 'Cerca'], ['normal', 'Estándar'], ['far', 'Lejos'], ['wide', 'Muy lejos']])",
  { applied: "choice('view', [['near'" });
patch("js/ui/settings-ui.js", "改視野時重新計算畫面",
  "$('set-close').onclick = close;",
  "$('set-close').onclick = close;\n    G.Settings.on(k => { if (k === 'view') dispatchEvent(new Event('resize')); });",
  { applied: "if (k === 'view') dispatchEvent" });

// 1e) 拿掉原作者的 Ko-fi／GitHub Sponsors 募款連結（內部使用的中文版不需要，也避免誤導）
patch("js/data/funding.js", "移除 Ko-fi", "kofi: 'jpter78',", "kofi: '',");
patch("js/data/funding.js", "移除 Sponsors", "sponsors: 'JPTER78',", "sponsors: '',");

// 1g) 「最新消息」中文版：每一行多一個第三欄（中文）；沒有中文的行改顯示英文
patch("js/ui/news-ui.js", "選擇語言欄位（es=0, en=1, zh=2）",
  "const en = G.I18n.lang === 'es' ? 0 : 1;", "const en = { es: 0, en: 1, zh: 2 }[G.I18n.lang] ?? 1;");
patch("js/ui/news-ui.js", "區塊標籤加中文",
  "[['new', ['Nuevo', 'New']], ['chg', ['Cambios', 'Changes']], ['fix', ['Arreglos', 'Fixes']]]",
  "[['new', ['Nuevo', 'New', '新增']], ['chg', ['Cambios', 'Changes', '調整']], ['fix', ['Arreglos', 'Fixes', '修正']]]");
patch("js/ui/news-ui.js", "標題缺中文時退回英文", "esc(v.title ? v.title[en] : '')", "esc(v.title ? (v.title[en] || v.title[1]) : '')");
patch("js/ui/news-ui.js", "標籤缺中文時退回英文", "${lbl[en]}", "${lbl[en] || lbl[1]}");
patch("js/ui/news-ui.js", "內文缺中文時退回英文", "esc(t[en])", "esc(t[en] || t[1])");
patch("dev.html", "載入 changelog-zh.js",
  '<script defer src="js/data/changelog.js"></script>',
  '<script defer src="js/data/changelog.js"></script>\n<script defer src="js/data/changelog-zh.js"></script>',
  { applied: "js/data/changelog-zh.js" });

// 1h) 載入畫面：dev.html 開頭的小腳本自己判斷語言（會在遊戲腳本之前執行），要讓它也認得中文
patch("dev.html", "載入畫面語言判斷",
  "var l = s === 'es' || s === 'en' ? s : (/\\/en(\\/|$)/.test(location.pathname) ? 'en' : (n.indexOf('es') === 0 ? 'es' : 'en'));",
  "var l = s === 'es' || s === 'en' || s === 'zh' ? s : (/\\/en(\\/|$)/.test(location.pathname) ? 'en' : 'zh'); void n;");
patch("dev.html", "載入畫面 lang 屬性", "document.documentElement.lang = l;", "document.documentElement.lang = l === 'zh' ? 'zh-TW' : l;",
  { applied: "document.documentElement.lang = l === 'zh'" });
patch("dev.html", "載入畫面中文字", "if (l === 'en') {", "if (l === 'en' || l === 'zh') {");
patch("dev.html", "載入畫面中文字 1",
  "p[0].textContent = 'A Pokémon survival game, free in your browser and on mobile.';",
  "p[0].textContent = l === 'zh' ? '寶可夢生存遊戲，免費在瀏覽器和手機上遊玩。' : 'A Pokémon survival game, free in your browser and on mobile.';");
patch("dev.html", "載入畫面中文字 2", "p[1].textContent = 'Loading…';", "p[1].textContent = l === 'zh' ? '載入中…' : 'Loading…';");

// 2) 英文字典只在英文時載入（否則中文模式會混進英文詞條）
patch("js/data/lang-en.js", "只在英文模式加入字典", "G.I18n.add({", "if (G.I18n.lang === 'en') G.I18n.add({", { applied: "if (G.I18n.lang === 'en') G.I18n.add({" });

// 3) 設定頁語言選項
patch("js/ui/settings-ui.js", "加入中文選項",
  "[['es', 'Español'], ['en', 'English']]", "[['zh', '繁體中文'], ['es', 'Español'], ['en', 'English']]");

// 4) 日期、月份、貨幣的在地化
patch("js/ui/news-ui.js", "日期格式",
  "G.I18n.lang === 'en' ? 'en-GB' : 'es-ES'", "{ en: 'en-GB', zh: 'zh-TW' }[G.I18n.lang] || 'es-ES'");
patch("js/net/signups.js", "月份名稱",
  "return d.toLocaleString(en ? 'en-US' : 'es-ES', { month: 'long' });",
  "return d.toLocaleString(G.I18n && G.I18n.lang === 'zh' ? 'zh-TW' : en ? 'en-US' : 'es-ES', { month: 'long' });");
patch("js/ui/support-ui.js", "貨幣格式",
  "toLocaleString(G.I18n.lang === 'en' ? 'en' : 'es',", "toLocaleString({ en: 'en', zh: 'zh-TW' }[G.I18n.lang] || 'es',");

// 5) 數字千分位
for (const f of ["js/data/missions.js", "js/ui/goals-ui.js", "js/ui/menu.js", "js/ui/mod-ui.js", "js/ui/ui.js"]) {
  patch(f, "數字格式", ".toLocaleString('es')", ".toLocaleString(G.I18n.numLocale)", { all: true });
}

// 6) 單機模式：不連作者的 Firebase 專案
{
  const f = "js/core/firebase-config.js";
  let s = rd(f);
  if (/G\.FIREBASE_CONFIG\s*=\s*null\s*;/.test(s)) console.log(`= 已套用  ${f}  單機模式`);
  else {
    const m = s.match(/G\.FIREBASE_CONFIG = \{[\s\S]*?\n\};/);
    if (!m) { console.log(`✗ 找不到  ${f}  FIREBASE_CONFIG`); failed++; }
    else {
      s = s.replace(m[0], () => "// 中文版：預設單機模式（進度只存在瀏覽器），不連線到原作者的 Firebase 專案。\n// 要啟用登入／合作／排行榜，請改成「你自己的」Firebase 專案設定（見 docs/FIREBASE.md）。\nG.FIREBASE_CONFIG = null;");
      wr(f, s);
      console.log(`✓ 已修改  ${f}  單機模式`);
    }
  }
}

// 7) 字型：中文備援
patch("css/style.css", "中文字型備援",
  "--font: 'Pixelify', 'Segoe UI', system-ui, sans-serif;",
  "--font: 'Pixelify', 'Segoe UI', 'Microsoft JhengHei', 'PingFang TC', 'Noto Sans TC', system-ui, sans-serif;");

// 8) dev.html：載入中文字典、關閉會連到作者網站的頁面連結
patch("dev.html", "載入 lang-zh.js",
  '<script defer src="js/data/lang-en.js"></script>',
  '<script defer src="js/data/lang-en.js"></script>\n<script defer src="js/data/lang-zh.js"></script>',
  { applied: 'js/data/lang-zh.js' });
patch("dev.html", "關閉 SEO 頁面連結", "<script>window.PS_PAGES = true;</script>", "<script>window.PS_PAGES = false;</script>");

if (failed) { console.log(`\n✗ ${failed} 項失敗`); process.exit(1); }
console.log("\n✓ 全部完成");
