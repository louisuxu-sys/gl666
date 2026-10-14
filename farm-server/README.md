# 歸歸伺服器（寶可夢生存＋摸魚農場）

同事專用。伺服器同時提供上一層的 `歸歸.html`，左側選單的「寶可夢生存」會內嵌 PokéSurvivor 繁體中文版（檔案在上一層的 `pokesurvivor-zh/`，由 `/pokesurvivor/` 提供）。

摸魚農場的伺服器程式與測試仍保留在這個資料夾，只是目前不在選單裡。

**寶可夢生存**：沿用原作者的 Firebase 與 TURN 線上服務（帳號、存檔、好友、合作與排行榜），資料由原作者服務處理。細節與限制見 `../pokesurvivor-zh/docs/FIREBASE-中文.md`。Google 登入只能用 `http://localhost:3000`；同事用區網 IP 連線時請用「名稱＋密碼」登入。

## 啟動（Windows）

需要 Node.js 22.13 以上（本專案以 Node 24 測試）。

```
cd farm-server
npm install
npm start
```

開啟 `http://localhost:3000`。同事請用你電腦的區網 IP（`ipconfig` 查 IPv4），例如 `http://192.168.1.20:3000`；第一次執行時 Windows 防火牆會詢問，選「允許」。

## 設定（環境變數，皆為選填）

| 變數 | 預設 | 說明 |
|---|---|---|
| `PORT` | `3000` | 連接埠 |
| `HOST` | `0.0.0.0` | 監聽位址；只想自己玩可設 `127.0.0.1` |
| `FARM_DB` | `data/farm.db` | 資料庫檔案位置 |
| `GUEST_MODE` | 開啟 | 設為 `0` 改成需要註冊登入 |
| `COOKIE_SECURE` | 關閉 | 使用 HTTPS 時設為 `1` |
| `TRUST_PROXY` | 關閉 | 放在反向代理後面時設定 |
| `HTML_FILE` | `../歸歸.html` | 要提供的首頁檔案 |
| `PS_DIR` | `../pokesurvivor-zh` | PokéSurvivor 中文版的資料夾 |

## 測試

```
npm test
```

## 注意

- 玩家資料存在 `data/farm.db`（已被 `.gitignore` 排除），請自行備份這個檔案。
- 免登入模式下進度綁定瀏覽器的 cookie，清除瀏覽器資料就會變成新的農場。
- GitHub 本身只能存放程式碼，無法執行這個伺服器；要讓同事連線，需要在一台電腦或雲端主機上執行 `npm start`。
- 目前沒有 HTTPS，只適合在公司內網使用。
