/* ============ news-ui.js — "Novedades" ============
 * Botón en la barra de arriba que abre la lista de cambios del juego
 * (js/data/changelog.js). Lleva un punto mientras haya algo que no has visto.
 */
G.NewsUI = (() => {
  const $ = G.UI.$;
  const KEY = 'ps.news.seen';
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const latest = () => (G.CHANGELOG[0] || {}).d || '';
  function seen() { try { return localStorage.getItem(KEY) || ''; } catch (e) { return ''; } }

  function init() {
    const b = $('btn-news');
    b.innerHTML = G.Icons.html('book', 18) + ' <span>Novedades</span><i class="dot"></i>';
    b.onclick = open;
    $('news-close').onclick = close;
    refresh();
  }
  function refresh() { $('btn-news').classList.toggle('new', seen() < latest()); }

  function fmt(d) {
    const [y, m, day] = d.split('-').map(Number);
    return new Date(y, m - 1, day).toLocaleDateString({ en: 'en-GB', zh: 'zh-TW' }[G.I18n.lang] || 'es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
  }

  function open() {
    const en = { es: 0, en: 1, zh: 2 }[G.I18n.lang] ?? 1;
    // Cada texto ya va en su idioma: translate="no" para que no lo toque i18n.
    const PARTS = [['new', ['Nuevo', 'New', '新增']], ['chg', ['Cambios', 'Changes', '調整']], ['fix', ['Arreglos', 'Fixes', '修正']]];
    $('news-body').innerHTML = G.CHANGELOG.map(v =>
      `<div class="news-day" translate="no"><h3>${esc(v.title ? (v.title[en] || v.title[1]) : '')}<small>${fmt(v.d)}</small></h3>` +
      PARTS.filter(([k]) => v[k] && v[k].length).map(([k, lbl]) =>
        `<div class="news-part"><span class="news-tag ${k}">${lbl[en] || lbl[1]}</span><ul>${v[k].map(t => `<li>${esc(t[en] || t[1])}</li>`).join('')}</ul></div>`).join('') +
      '</div>').join('');
    $('news-body').scrollTop = 0;
    $('scr-news').classList.remove('hidden');
    try { localStorage.setItem(KEY, latest()); } catch (e) { /* nada */ }
    refresh();
  }
  function close() { $('scr-news').classList.add('hidden'); }

  return { init, open, close };
})();
