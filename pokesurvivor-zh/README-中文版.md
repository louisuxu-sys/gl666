# PokéSurvivor 繁體中文版（台灣）

這是 [PokéSurvivor](https://pokesurvivor.com/)（作者 JPTER78，原始碼：<https://github.com/JPTER78/pokesurvivor>）的**非官方繁體中文翻譯版**，只供個人與同事在內部遊玩，**不得收費、不得放廣告**。

## 啟動（Windows）

需要 Node.js 18 以上。

1. 雙擊 `啟動中文版.bat`（或在這個資料夾執行 `node tools/zh/serve.js 8765`）。
2. 開啟 <http://localhost:8765/>。
3. 同事請用你電腦的區網 IP 連線，例如 `http://192.168.1.20:8765/`；第一次執行時 Windows 防火牆會詢問，請選「允許」。

遊戲以未混淆的原始碼（`dev.html`）執行。語言可在「設定 > 圖形 > 語言」切換（繁體中文／Español／English），預設是繁體中文。

## 與原版的差異

- 新增 `js/data/lang-zh.js`（繁體中文字典），招式、道具、屬性與寶可夢名稱使用台灣官方譯名（資料來源：PokeAPI）。
- `js/core/i18n.js`、`js/ui/settings-ui.js` 等少數檔案加入中文語言支援（日期、數字、等級縮寫、視野範圍）。
- 沿用原作者的 Firebase 專案 `pokesurvivor-free` 與 TURN 服務 `turn.pokesurvivor.com`，可用登入、雲端存檔、好友、合作與排行榜。帳號與遊戲資料由原作者服務處理，不是私人資料庫；合作時 Firebase ID token 會送到原作者 TURN 服務。詳見 `docs/FIREBASE-中文.md`。
- 「最新消息」有繁體中文翻譯；原作者日後新增的項目如果沒有對應翻譯，會退回顯示英文。
- `dev.html` 的 `PS_PAGES` 設為 `false`，不顯示會連到原作者網站的指南／圖鑑連結。

重新產生翻譯：`node tools/zh/gen-names.js && node tools/zh/build-zh.js`。手動翻譯放在 `tools/zh/manual/`。

## 授權與來源（請保留）

- **程式碼**：MIT 授權，Copyright (c) 2026 JPTER78，見 `LICENSE`。
- **寶可夢圖像**：PMD SpriteCollab（<https://github.com/PMDCollab/SpriteCollab>），**CC BY-NC 4.0**，僅限非商業使用並須標示來源，作者名單見 `CREDITS.md`。
- **寶可夢資料與譯名**：PokeAPI（<https://pokeapi.co/>）。
- **字型**：Pixelify Sans（SIL OFL 1.1）。
- 寶可夢及相關名稱與角色是任天堂、Creatures Inc.、GAME FREAK 與 The Pokémon Company 的商標與財產。本專案與他們**沒有任何關聯**，也未獲其贊助或認可。

本中文版不是原作者製作，翻譯錯誤與問題請勿向原作者回報。
