/* 摸魚農場 前端：只負責顯示與送出「請求」。金幣、庫存、成熟判斷全部由伺服器計算。 */
(() => {
  "use strict";
  if (window.__farmLoaded) return;
  window.__farmLoaded = true;
  const root = document.getElementById("farm-root");
  if (!root) return;

  let catalog = null;
  let state = null;
  let tab = "farm";
  let seedSel = null;
  let authMode = "login";
  let busy = false;
  let skew = 0;
  let lastKey = "";
  let createDraft = null;

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmt = (n) => Number(n).toLocaleString("en-US");
  const nowMs = () => Date.now() + skew;
  const clock = (ms) => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };

  async function api(method, url, body) {
    const res = await fetch(url, {
      method,
      credentials: "same-origin",
      headers: { "X-Requested-With": "farm", ...(body !== undefined ? { "Content-Type": "application/json" } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    let json = null;
    try { json = await res.json(); } catch (_) { /* 非 JSON */ }
    if (!res.ok) {
      const err = new Error((json && json.error && json.error.message) || "連線發生問題，請稍後再試");
      err.status = res.status;
      throw err;
    }
    return json;
  }

  let toastTimer;
  function toast(msg, isErr) {
    let el = document.querySelector(".fm-toast");
    if (!el) { el = document.createElement("div"); el.className = "fm-toast"; document.body.appendChild(el); }
    el.textContent = msg;
    el.className = "fm-toast show" + (isErr ? " err" : "");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("show"), 2400);
  }

  function setState(s) {
    state = s;
    skew = s.serverNow - Date.now();
  }

  const shade = (hex, f = 0.78) => {
    const n = parseInt(hex.slice(1), 16);
    const c = (v) => Math.max(0, Math.min(255, Math.round(v * f)));
    return `rgb(${c(n >> 16)},${c((n >> 8) & 255)},${c(n & 255)})`;
  };

  // 寵物外觀（暫用向量圖形與 emoji 當佔位圖，之後可整組換成正式美術）
  function petSvg(pet, px = 120) {
    const col = pet.color;
    const dark = "#2b2d33";
    const outfit = (catalog.cosmetics.outfit[pet.outfit] || {}).color || "#ccc";
    const ears = {
      cat: `<polygon points="30,42 36,10 58,30" fill="${col}"/><polygon points="90,42 84,10 62,30" fill="${col}"/><polygon points="37,34 39,19 50,30" fill="#f7b9c4"/><polygon points="83,34 81,19 70,30" fill="#f7b9c4"/>`,
      dog: `<ellipse cx="29" cy="58" rx="12" ry="24" fill="${shade(col)}" transform="rotate(14 29 58)"/><ellipse cx="91" cy="58" rx="12" ry="24" fill="${shade(col)}" transform="rotate(-14 91 58)"/>`,
      rabbit: `<ellipse cx="44" cy="22" rx="9" ry="27" fill="${col}"/><ellipse cx="76" cy="22" rx="9" ry="27" fill="${col}"/><ellipse cx="44" cy="24" rx="4.5" ry="18" fill="#f7b9c4"/><ellipse cx="76" cy="24" rx="4.5" ry="18" fill="#f7b9c4"/>`,
      fox: `<polygon points="28,48 33,8 58,32" fill="${col}"/><polygon points="92,48 87,8 62,32" fill="${col}"/><polygon points="34,38 36,18 49,32" fill="${dark}"/><polygon points="86,38 84,18 71,32" fill="${dark}"/>`,
      panda: `<circle cx="33" cy="36" r="12" fill="${dark}"/><circle cx="87" cy="36" r="12" fill="${dark}"/>`,
    }[pet.species] || "";
    const patches = pet.species === "panda"
      ? `<ellipse cx="46" cy="70" rx="8" ry="10" fill="${dark}" transform="rotate(-18 46 70)"/><ellipse cx="74" cy="70" rx="8" ry="10" fill="${dark}" transform="rotate(18 74 70)"/>` : "";
    const hairColor = "#5b3a29";
    const hair = {
      short: `<path d="M27 68 Q28 30 60 30 Q92 30 93 68 Q82 48 60 48 Q38 48 27 68Z" fill="${hairColor}"/>`,
      long: `<path d="M25 68 Q25 30 60 30 Q95 30 95 68 L95 108 Q89 112 84 103 L84 64 Q60 48 36 64 L36 103 Q31 112 25 108Z" fill="${hairColor}"/>`,
      curly: [[36, 46, 11], [50, 38, 11], [66, 38, 11], [82, 46, 11], [60, 34, 10], [28, 58, 9], [92, 58, 9]].map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${hairColor}"/>`).join(""),
      ponytail: `<path d="M27 68 Q28 30 60 30 Q92 30 93 68 Q82 48 60 48 Q38 48 27 68Z" fill="${hairColor}"/><ellipse cx="100" cy="64" rx="9" ry="14" fill="${hairColor}" transform="rotate(-18 100 64)"/>`,
    }[pet.hair] || "";
    const hat = (catalog.cosmetics.hat[pet.hat] || {}).emoji;
    const acc = (catalog.cosmetics.accessory[pet.accessory] || {}).emoji;
    const hatSvg = hat ? `<text x="${pet.hat === "ribbon" ? 84 : 60}" y="${pet.hat === "ribbon" ? 40 : 42}" font-size="40" text-anchor="middle">${hat}</text>` : "";
    const accPos = { flower: [88, 44, 26], glasses: [60, 78, 44], scarf: [60, 112, 44], backpack: [98, 126, 36] }[pet.accessory];
    const accSvg = acc && accPos ? `<text x="${accPos[0]}" y="${accPos[1]}" font-size="${accPos[2]}" text-anchor="middle">${acc}</text>` : "";
    return `<svg viewBox="0 0 120 150" width="${px}" height="${px * 1.25}" role="img" aria-label="寵物外觀">
      ${ears}
      <ellipse cx="60" cy="124" rx="30" ry="26" fill="${outfit}" stroke="rgba(0,0,0,.25)"/>
      <circle cx="34" cy="122" r="8" fill="${col}"/><circle cx="86" cy="122" r="8" fill="${col}"/>
      <circle cx="60" cy="72" r="34" fill="${col}" stroke="rgba(0,0,0,.18)"/>
      ${hair}${patches}
      <circle cx="47" cy="70" r="3.4" fill="${pet.species === "panda" ? "#fff" : dark}"/><circle cx="73" cy="70" r="3.4" fill="${pet.species === "panda" ? "#fff" : dark}"/>
      <ellipse cx="60" cy="82" rx="4.5" ry="3.4" fill="${dark}"/><path d="M53 88 Q60 95 67 88" stroke="${dark}" stroke-width="2" fill="none" stroke-linecap="round"/>
      ${accSvg}${hatSvg}
    </svg>`;
  }

  // ---------- 畫面 ----------
  function renderAuth() {
    if (catalog.guestMode) {
      root.innerHTML = `<div class="fm-panel fm-auth"><h3 class="fm-title">農場連線已中斷</h3>
        <p class="fm-note">找不到你的農場資料（可能是瀏覽器資料被清除，或登入已過期）。</p>
        <div style="margin-top:16px"><button type="button" class="fm-btn primary block" data-act="new-guest">建立新的農場</button></div></div>`;
      return;
    }
    const isReg = authMode === "register";
    root.innerHTML = `<div class="fm-panel fm-auth">
      <h3 class="fm-title">歡迎來到摸魚農場</h3>
      <div class="fm-switch">
        <button type="button" class="fm-btn ${isReg ? "" : "on"}" data-act="auth-mode" data-mode="login">登入</button>
        <button type="button" class="fm-btn ${isReg ? "on" : ""}" data-act="auth-mode" data-mode="register">註冊</button>
      </div>
      <form id="fm-auth-form" autocomplete="on" novalidate>
        <label class="fm-label" for="fm-user">帳號（3～20 個英數字或底線）</label>
        <input class="fm-input" id="fm-user" name="username" autocomplete="username" maxlength="20" required>
        ${isReg ? `<label class="fm-label" for="fm-nick">暱稱（1～12 字，其他同事看到的名字）</label>
        <input class="fm-input" id="fm-nick" name="nickname" maxlength="12">` : ""}
        <label class="fm-label" for="fm-pass">密碼（至少 8 個字元）</label>
        <input class="fm-input" id="fm-pass" name="password" type="password" autocomplete="${isReg ? "new-password" : "current-password"}" maxlength="128" required>
        <div class="fm-error" id="fm-auth-err" role="alert"></div>
        <div style="margin-top:16px"><button class="fm-btn primary block" type="submit">${isReg ? "建立帳號" : "登入"}</button></div>
      </form>
      <p class="fm-note" style="margin-top:14px">這是同事專用的遊戲，請不要使用你的公司或其他網站的密碼。</p>
    </div>`;
  }

  function createView() {
    const d = createDraft;
    const free = (slot) => Object.entries(catalog.cosmetics[slot]).filter(([, v]) => v.price === 0);
    const group = (slot, label) => `<label class="fm-label">${label}</label><div class="fm-opts">${free(slot).map(([id, v]) =>
      `<button type="button" class="fm-chip ${d[slot] === id ? "on" : ""}" data-act="draft" data-slot="${slot}" data-id="${id}">${esc(v.name)}</button>`).join("")}</div>`;
    root.innerHTML = `<div class="fm-panel"><h3 class="fm-title">建立你的寵物</h3>
      <div class="fm-create">
        <div class="fm-pet">${petSvg(d, 150)}</div>
        <div>
          <label class="fm-label">種類</label><div class="fm-opts">${Object.entries(catalog.species).map(([id, v]) =>
            `<button type="button" class="fm-chip ${d.species === id ? "on" : ""}" data-act="draft" data-slot="species" data-id="${id}">${esc(v.name)}</button>`).join("")}</div>
          <label class="fm-label">毛色</label><div class="fm-opts">${catalog.colors.map((c) =>
            `<button type="button" class="fm-swatch ${d.color === c ? "on" : ""}" style="background:${c}" aria-label="毛色 ${c}" data-act="draft" data-slot="color" data-id="${c}"></button>`).join("")}</div>
          ${group("hair", "髮型")}${group("outfit", "服裝")}${group("accessory", "配件")}
          <div style="margin-top:18px"><button type="button" class="fm-btn primary" data-act="create-pet">就決定是你了！</button></div>
          <p class="fm-note" style="margin-top:10px">帽子和更多服裝可以之後在「衣櫃」用金幣購買。</p>
        </div>
      </div></div>`;
  }

  function plotHtml(p) {
    const crops = catalog.crops;
    if (!p.unlocked) {
      const next = p.idx === state.user.unlockedPlots;
      return `<div class="fm-plot locked"><div class="em">🔒</div><div class="nm">${next ? "可開墾" : "尚未開墾"}</div>
        ${next ? `<button class="fm-btn small" data-act="unlock">開墾 🪙${fmt(state.nextPlotCost)}</button>` : ""}</div>`;
    }
    if (!p.crop) {
      const sel = seedSel && state.inventory.seed[seedSel] > 0 ? seedSel : null;
      return `<div class="fm-plot"><div class="em">🟫</div><div class="nm">空地</div>
        ${sel ? `<button class="fm-btn small" data-act="plant" data-plot="${p.idx}">種下 ${crops[sel].emoji}</button>` : `<div class="nm">先選一包種子</div>`}</div>`;
    }
    const c = crops[p.crop];
    if (p.ready) {
      return `<div class="fm-plot ready"><div class="em">${c.emoji}</div><div class="nm">${esc(c.name)} 成熟了！</div>
        <button class="fm-btn primary small" data-act="harvest" data-plot="${p.idx}">收成</button></div>`;
    }
    const left = catalog.constants.maxWater - p.waterCount;
    return `<div class="fm-plot" data-planted="${p.plantedAt}" data-ready="${p.readyAt}"><div class="em">🌱</div><div class="nm">${esc(c.name)}</div>
      <div class="fm-bar"><i></i></div><div class="tm"></div>
      <button class="fm-btn small" data-act="water" data-plot="${p.idx}" ${left <= 0 ? "disabled" : ""}>💧 澆水（剩 ${left} 次）</button></div>`;
  }

  function farmTab() {
    const seeds = Object.entries(state.inventory.seed);
    if (!seedSel || !state.inventory.seed[seedSel]) seedSel = seeds.length ? seeds[0][0] : null;
    return `<div class="fm-panel"><h3 class="fm-title">我的農場</h3>
      <div class="fm-seedbar"><span class="fm-note">手上的種子：</span>${seeds.length ? seeds.map(([id, n]) =>
        `<button class="fm-chip ${seedSel === id ? "on" : ""}" data-act="seed" data-id="${id}">${catalog.crops[id].emoji} ${esc(catalog.crops[id].name)} ×${n}</button>`).join("")
        : `<span class="fm-note">沒有種子了，到「商店」買吧</span>`}</div>
      <div class="fm-grid">${state.plots.map(plotHtml).join("")}</div>
      <p class="fm-note" style="margin-top:12px">澆水可縮短 ${Math.round(catalog.constants.waterRatio * 100)}% 的成長時間，每株最多 ${catalog.constants.maxWater} 次。收成後的作物放在「背包」，賣出才會變成金幣。</p></div>`;
  }

  function shopTab() {
    return `<div class="fm-panel"><h3 class="fm-title">種子商店</h3>${Object.values(catalog.crops).map((c) => {
      const mins = Math.round(c.growMs / 60000 * 10) / 10;
      return `<div class="fm-row"><span class="em">${c.emoji}</span>
        <div class="nm">${esc(c.name)}種子<small>成長約 ${mins} 分鐘 · 賣出 🪙${fmt(c.sellPrice)}</small></div>
        <span class="fm-coins" style="font-size:14px;padding:3px 10px">🪙${fmt(c.seedPrice)}</span>
        <button class="fm-btn small" data-act="buy-seed" data-id="${c.id}" data-qty="1">買 1 包</button>
        <button class="fm-btn small" data-act="buy-seed" data-id="${c.id}" data-qty="5">買 5 包</button></div>`;
    }).join("")}</div>`;
  }

  function wardrobeTab() {
    const slots = [["hair", "髮型"], ["outfit", "服裝"], ["hat", "帽子"], ["accessory", "配件"]];
    return `<div class="fm-panel"><h3 class="fm-title">衣櫃與服裝店</h3><div class="fm-split">
      <div class="fm-pet">${petSvg(state.pet, 150)}<div class="fm-note">${esc(state.user.nickname)}</div></div>
      <div>${slots.map(([slot, label]) => `<div class="fm-slot"><h4>${label}</h4><div class="fm-items">${Object.entries(catalog.cosmetics[slot]).map(([id, v]) => {
        const owned = v.price === 0 || !!state.inventory.cosmetic[`${slot}:${id}`];
        const worn = state.pet[slot] === id;
        const btn = worn ? `<button class="fm-btn small" disabled>穿著中</button>`
          : owned ? `<button class="fm-btn small" data-act="equip" data-slot="${slot}" data-id="${id}">穿上</button>`
          : `<button class="fm-btn small" data-act="buy-cos" data-slot="${slot}" data-id="${id}">購買</button>`;
        return `<div class="fm-item ${worn ? "worn" : ""}"><span>${v.emoji ? v.emoji + " " : ""}${esc(v.name)}</span>
          <span class="pr">${owned ? "已擁有" : "🪙" + fmt(v.price)}</span>${btn}</div>`;
      }).join("")}</div></div>`).join("")}</div></div></div>`;
  }

  function bagTab() {
    const produce = Object.entries(state.inventory.produce);
    const total = produce.reduce((s, [id, n]) => s + catalog.crops[id].sellPrice * n, 0);
    const seeds = Object.entries(state.inventory.seed);
    return `<div class="fm-panel"><h3 class="fm-title">背包</h3>
      <h4 class="fm-label" style="margin-top:0">收成的作物</h4>${produce.length ? produce.map(([id, n]) => {
        const c = catalog.crops[id];
        return `<div class="fm-row"><span class="em">${c.emoji}</span><div class="nm">${esc(c.name)} ×${n}<small>每個 🪙${fmt(c.sellPrice)}</small></div>
          <button class="fm-btn small" data-act="sell" data-id="${id}" data-qty="1">賣 1 個</button>
          <button class="fm-btn small" data-act="sell" data-id="${id}" data-qty="${n}">全部賣出 🪙${fmt(c.sellPrice * n)}</button></div>`;
      }).join("") + `<p class="fm-note">全部作物合計 🪙${fmt(total)}</p>` : `<p class="fm-note">還沒有作物，去農場收成吧。</p>`}
      <h4 class="fm-label">種子</h4>${seeds.length ? seeds.map(([id, n]) => `<div class="fm-row"><span class="em">${catalog.crops[id].emoji}</span><div class="nm">${esc(catalog.crops[id].name)}種子 ×${n}</div></div>`).join("") : `<p class="fm-note">沒有種子。</p>`}</div>`;
  }

  function settingsTab() {
    return `<div class="fm-panel"><h3 class="fm-title">設定</h3>
      <label class="fm-label" for="fm-newnick">暱稱（1～12 字）</label>
      <div style="display:flex;gap:8px;max-width:420px"><input class="fm-input" id="fm-newnick" maxlength="12" value="${esc(state.user.nickname)}">
      <button class="fm-btn primary" data-act="save-nick">儲存</button></div>
      <p class="fm-note" style="margin-top:14px">${catalog.guestMode
        ? "目前是免登入模式：進度綁定在這個瀏覽器。清除瀏覽器資料或換一台電腦，就會變成一座新的農場。"
        : `帳號：${esc(state.user.username)}`}</p></div>`;
  }

  function gameView() {
    const tabs = [["farm", "🌾 農場"], ["shop", "🛒 商店"], ["wardrobe", "👗 衣櫃"], ["bag", "🎒 背包"], ["settings", "⚙ 設定"]];
    const body = { farm: farmTab, shop: shopTab, wardrobe: wardrobeTab, bag: bagTab, settings: settingsTab }[tab]();
    root.innerHTML = `<div class="fm-panel"><div class="fm-top">${petSvg(state.pet, 56)}
      <div class="who"><b>${esc(state.user.nickname)}</b>${catalog.guestMode ? "" : `<small>@${esc(state.user.username)}</small>`}</div>
      <span class="fm-coins" title="金幣">🪙 ${fmt(state.user.coins)}</span>
      ${catalog.guestMode ? "" : `<button class="fm-btn small" data-act="logout">登出</button>`}</div>
      <div class="fm-tabs">${tabs.map(([id, label]) => `<button class="fm-tab ${tab === id ? "on" : ""}" data-act="tab" data-tab="${id}">${label}</button>`).join("")}</div></div>${body}`;
    tick();
  }

  function render() {
    if (!state) { renderAuth(); return; }
    if (!state.pet) {
      createDraft ||= { species: "cat", color: catalog.colors[0], hair: "short", outfit: "tee", hat: "none", accessory: "none" };
      createView();
    } else gameView();
  }

  // 每秒更新成長進度條與倒數（只改文字，不重畫整個畫面）
  function tick() {
    if (!state || !state.pet) return;
    let needRefresh = false;
    root.querySelectorAll(".fm-plot[data-ready]").forEach((el) => {
      const start = Number(el.dataset.planted);
      const end = Number(el.dataset.ready);
      const t = nowMs();
      const pct = Math.max(0, Math.min(100, ((t - start) / Math.max(1, end - start)) * 100));
      el.querySelector(".fm-bar i").style.width = pct + "%";
      el.querySelector(".tm").textContent = clock(end - t);
      el.querySelector(".em").textContent = pct >= 50 ? "🌿" : "🌱";
      if (t >= end) needRefresh = true;
    });
    if (needRefresh && !busy) refresh();
  }

  async function refresh() {
    try {
      const s = await api("GET", "/api/me");
      const key = JSON.stringify({ ...s, serverNow: 0 });
      const editing = root.contains(document.activeElement) && document.activeElement.tagName === "INPUT";
      setState(s);
      if (key !== lastKey && !editing) { lastKey = key; render(); }
    } catch (e) {
      if (e.status === 401) { state = null; lastKey = ""; render(); }
    }
  }

  async function run(fn, okMsg) {
    if (busy) return;
    busy = true;
    try {
      const result = await fn();
      if (result && result.user) { setState(result); lastKey = JSON.stringify({ ...result, serverNow: 0 }); render(); }
      if (okMsg) toast(okMsg);
    } catch (e) {
      if (e.status === 401) { state = null; lastKey = ""; render(); }
      toast(e.message, true);
    } finally { busy = false; }
  }

  // ---------- 事件 ----------
  root.addEventListener("click", (ev) => {
    const el = ev.target.closest("[data-act]");
    if (!el || !root.contains(el)) return;
    const d = el.dataset;
    const post = (url, body) => api("POST", url, body);
    switch (d.act) {
      case "auth-mode": authMode = d.mode; renderAuth(); break;
      case "tab": tab = d.tab; render(); break;
      case "seed": seedSel = d.id; render(); break;
      case "draft": createDraft[d.slot] = d.id; createView(); break;
      case "create-pet": run(() => post("/api/pet", createDraft), "寵物建立完成！"); break;
      case "plant": run(() => post("/api/farm/plant", { plot: Number(d.plot), crop: seedSel })); break;
      case "water": run(() => post("/api/farm/water", { plot: Number(d.plot) }), "澆水完成 💧"); break;
      case "harvest": run(() => post("/api/farm/harvest", { plot: Number(d.plot) }), "收成成功！已放入背包"); break;
      case "unlock": run(() => post("/api/farm/unlock", {}), "新的土地開墾完成"); break;
      case "buy-seed": run(() => post("/api/shop/buy", { kind: "seed", id: d.id, qty: Number(d.qty) }), "購買成功"); break;
      case "buy-cos": run(() => post("/api/shop/buy", { kind: "cosmetic", slot: d.slot, id: d.id }), "購買成功"); break;
      case "equip": run(() => post("/api/pet/equip", { slot: d.slot, id: d.id })); break;
      case "sell": run(() => post("/api/inventory/sell", { crop: d.id, qty: Number(d.qty) }), "賣出成功"); break;
      case "save-nick": run(() => post("/api/nickname", { nickname: (document.getElementById("fm-newnick") || {}).value }), "暱稱已更新"); break;
      case "new-guest": run(async () => { await post("/api/guest", {}); createDraft = null; tab = "farm"; return api("GET", "/api/me"); }); break;
      case "logout": run(async () => { await post("/api/logout", {}); state = null; lastKey = ""; createDraft = null; authMode = "login"; tab = "farm"; renderAuth(); }); break;
      default: break;
    }
  });

  root.addEventListener("submit", async (ev) => {
    if (ev.target.id !== "fm-auth-form") return;
    ev.preventDefault();
    const f = ev.target;
    const errEl = document.getElementById("fm-auth-err");
    const body = { username: f.username.value.trim(), password: f.password.value };
    if (authMode === "register") body.nickname = f.nickname.value.trim() || body.username;
    errEl.classList.remove("show");
    if (busy) return;
    busy = true;
    try {
      await api("POST", authMode === "register" ? "/api/register" : "/api/login", body);
      setState(await api("GET", "/api/me"));
      lastKey = JSON.stringify({ ...state, serverNow: 0 });
      createDraft = null;
      tab = "farm";
      render();
    } catch (e) {
      errEl.textContent = e.message;
      errEl.classList.add("show");
    } finally { busy = false; }
  });

  window.addEventListener("pageshow", () => { if (state) refresh(); });

  async function boot() {
    root.innerHTML = `<div class="fm-panel"><p class="fm-note">載入中…</p></div>`;
    try {
      catalog = await api("GET", "/api/catalog");
      const loadMe = async () => { setState(await api("GET", "/api/me")); lastKey = JSON.stringify({ ...state, serverNow: 0 }); };
      try { await loadMe(); } catch (e) {
        state = null;
        // 免登入模式：第一次來就自動建立一位匿名玩家，直接進入建立寵物畫面
        if (e.status === 401 && catalog.guestMode) {
          try { await api("POST", "/api/guest", {}); await loadMe(); } catch (e2) { state = null; toast(e2.message, true); }
        }
      }
      render();
      setInterval(() => { if (root.offsetParent !== null) tick(); }, 1000);
      setInterval(() => { if (root.offsetParent !== null && state) refresh(); }, 8000);
    } catch (e) {
      root.innerHTML = `<div class="fm-panel"><p class="fm-note">無法連線到遊戲伺服器：${esc(e.message)}</p></div>`;
    }
  }
  boot();
})();
