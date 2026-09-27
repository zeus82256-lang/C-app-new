// web/src/reader/worShell.js
// Builds the complete Galaxy Novels ("wor-reader") reader interface as a single
// self-contained HTML document, rendered inside the ReaderScreen WebView.
//
// The DOM structure, class names and interactions mirror the original
// galaxynovels.com reader (wor-reader theme) one-to-one:
//   - wor-topbar (drawer / search / brand / theme / comments)
//   - wor-drawer side menu, wor-search overlay
//   - wor-reading-page (novel link + h1 + text surface)
//   - wor-reader-chapter-progress (thin colored progress bar)
//   - wor-reader-dock with 6 panels (book / text / font / background / settings / report)
//   - wor-reader-chapters-sheet + wor-reader-words-sheet
//   - wor-chapter-report-modal
//   - floating dock toggle
//
// RN <=> WebView bridge:
//   web -> rn : window.__wor.send(obj)  => postMessage(JSON)
//   rn -> web : injectJavaScript('window.__wor.receive(<json>)')

import WOR_CSS from './worCSS';
import { WOR_FONTS } from './worFonts';

// ---------------------------------------------------------------------------
// App-specific CSS layered on top of the original bundle (chapter sections,
// dialogue/markdown/bracket highlighting, separators, publisher card, ...).
// ---------------------------------------------------------------------------
export const WOR_APP_CSS = `
  /* ---- hidden attribute must always win ---- */
  [hidden] { display: none !important; }

  /* ---- reading page typography (driven by --wor-reader-* vars) ---- */
  .wor-reader-text-surface { padding-bottom: 8px; }
  .wor-reader-text-surface p { margin: 0 0 1.45em; }
  .wor-chapter-sec { display: block; }
  .wor-chapter-title-block {
    font-size: calc(var(--wor-reader-font-size, 18px) + 7px);
    font-weight: 900; color: var(--wor-reader-effective-fg, var(--wor-text));
    line-height: 1.55; margin: 4px 0 6px;
  }
  .wor-chapter-title-block--sub { margin-top: 54px; }
  .wor-custom-sep {
    text-align: center; color: var(--wor-reader-page-muted, var(--wor-muted));
    font-size: .92em; padding: 10px 0; margin: 4px 0 18px; letter-spacing: 2px;
    user-select: none; white-space: pre-wrap;
  }
  .wor-chapter-sep { text-align: center; margin: 46px 0 12px; user-select: none; }
  .wor-chapter-sep .sep-orn {
    display: inline-block; color: var(--wor-reader-page-muted, var(--wor-muted));
    font-size: 14px; padding: 0 18px; position: relative; letter-spacing: 4px; opacity: .8;
  }
  .wor-chapter-sep .sep-orn::before, .wor-chapter-sep .sep-orn::after {
    content: ''; position: absolute; top: 50%; width: 44px; height: 1px;
    background: linear-gradient(to right, transparent, color-mix(in srgb, var(--wor-text) 38%, transparent));
  }
  .wor-chapter-sep .sep-orn::before { right: 100%; }
  .wor-chapter-sep .sep-orn::after { left: 100%; transform: scaleX(-1); }
  .wor-end-mark {
    text-align: center; color: var(--wor-reader-page-muted, var(--wor-muted));
    font-size: 13px; letter-spacing: 8px; margin: 34px 0 6px; user-select: none; opacity: .75;
  }
  .wor-app-copyright { line-height: 1.6; padding: 14px 0; margin: 8px 0; }
  .wor-chapter-divider { border: 0; height: 1px; background: color-mix(in srgb, var(--wor-text) 22%, transparent); margin: 10px 0 26px; }

  /* ---- advanced formatting (dialogue / markdown / brackets / custom) ---- */
  .cm-dialogue-text   { color: var(--wor-fmt-dialogue-color, inherit); font-size: var(--wor-fmt-dialogue-size, 100%); font-weight: var(--wor-fmt-dialogue-weight, inherit); transition: color .3s ease, font-size .3s ease; }
  .cm-markdown-bold   { font-weight: 700; color: var(--wor-fmt-markdown-color, inherit); font-size: var(--wor-fmt-markdown-size, 100%); transition: color .3s ease, font-size .3s ease; }
  .bracket-formatted  { color: var(--wor-fmt-bracket-color, inherit); font-size: var(--wor-fmt-bracket-size, 100%); font-weight: var(--wor-fmt-bracket-weight, inherit); transition: color .3s ease, font-size .3s ease; }
  .custom-formatted   { color: var(--wor-fmt-custom-color, inherit); font-size: var(--wor-fmt-custom-size, 100%); font-weight: var(--wor-fmt-custom-weight, inherit); transition: color .3s ease, font-size .3s ease; }
  .qmark, .mmark, .bmark, .cmark { opacity: 1; transition: opacity .3s ease; }
  body.wor-fmt-hide-quotes   .qmark, body.wor-fmt-hide-quotes   .mq-style { opacity: 0; font-size: 0; }
  body.wor-fmt-hide-markdown .mmark { opacity: 0; font-size: 0; }
  body.wor-fmt-hide-brackets .bmark, body.wor-fmt-hide-brackets .bq-style { opacity: 0; font-size: 0; }
  body.wor-fmt-hide-custom   .cmark { opacity: 0; font-size: 0; }

  /* ---- hide chapter title toggle ---- */
  body.wor-hide-chapter-title .wor-reading-page__header h1 { display: none; }

  /* ---- publisher (author) card ---- */
  .wor-author-section-wrapper { margin-top: 46px; margin-bottom: 18px; border-top: 1px solid color-mix(in srgb, var(--wor-text) 16%, transparent); padding-top: 20px; }
  .wor-author-section-title { color: var(--wor-text); font-size: 16px; font-weight: 800; margin-bottom: 12px; text-align: right; }
  .wor-author-card { border-radius: 18px; overflow: hidden; margin-top: 10px; border: 1px solid color-mix(in srgb, var(--wor-text) 22%, transparent); position: relative; height: 148px; width: 100%; cursor: pointer; }
  .wor-author-banner { position: absolute; width: 100%; height: 100%; background-size: cover; background-position: center; }
  .wor-author-overlay { position: absolute; inset: 0; background: linear-gradient(to bottom, rgba(0,0,0,.2), rgba(0,0,0,.82)); z-index: 1; }
  .wor-author-content { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; z-index: 2; width: 100%; }
  .wor-author-avatar-wrapper { width: 76px; height: 76px; border-radius: 38px; border: 3px solid #fff; background-color: #333; margin-bottom: 8px; overflow: hidden; }
  .wor-author-avatar-img { width: 100%; height: 100%; object-fit: cover; }
  .wor-author-name { color: #fff; font-size: 20px; font-weight: 700; text-shadow: 0 1px 6px rgba(0,0,0,.9); text-align: center; }

  /* ---- comments trigger at the end of the chapter ---- */
  .wor-comments-trigger-wrap { margin: 6px 0 42px; padding: 0 4px; }
  .wor-comments-trigger {
    width: 100%; background: color-mix(in srgb, var(--wor-text) 7%, transparent);
    border: 1px solid color-mix(in srgb, var(--wor-text) 15%, transparent);
    color: var(--wor-text); padding: 16px; border-radius: 14px;
    font: inherit; font-size: 15px; font-weight: 700; cursor: pointer;
    display: flex; align-items: center; justify-content: center; gap: 10px;
  }
  .wor-comments-trigger:active { transform: scale(.99); }

  /* ---- continuous-scroll footer ---- */
  .wor-continuous-footer { text-align: center; color: var(--wor-muted); font-size: .85rem; font-weight: 700; padding: 14px 0 6px; user-select: none; }

  /* ---- reading-area padding above the dock (no fixed topbar) ---- */
  :root { --wor-topbar-h: 0px; }
  .wor-reader-main { padding-top: calc(var(--wor-topbar-h, 0px) + var(--wor-safe-top, 0px) + 14px); padding-bottom: calc(var(--wor-reader-dock-height, 242px) + var(--wor-safe-bottom, 0px) + 30px); }
  body.wor-reader-dock-collapsed .wor-reader-main { padding-bottom: calc(96px + var(--wor-safe-bottom, 0px)); }

  /* ---- toast ---- */
  .wor-mini-toast { position: fixed; inset-inline: 0; bottom: calc(var(--wor-safe-bottom, 0px) + 84px); display: flex; justify-content: center; z-index: 3000; pointer-events: none; }
  .wor-mini-toast span { background: color-mix(in srgb, var(--wor-surface-solid) 92%, transparent); border: 1px solid var(--wor-border); color: var(--wor-text); border-radius: 999px; padding: 9px 18px; font-size: .8rem; font-weight: 800; box-shadow: var(--wor-shadow); opacity: 0; transform: translateY(6px); transition: opacity .25s ease, transform .25s ease; }
  .wor-mini-toast.is-visible span { opacity: 1; transform: translateY(0); }

  /* ---- boot loader ---- */
  .wor-boot-loading { position: fixed; inset: 0; display: grid; place-items: center; z-index: 4000; background: var(--wor-bg, #000); transition: opacity .3s ease; }
  .wor-boot-loading.is-done { opacity: 0; pointer-events: none; }
  .wor-boot-spinner { width: 42px; height: 42px; border-radius: 50%; border: 3px solid color-mix(in srgb, var(--wor-text, #fff) 18%, transparent); border-top-color: var(--wor-accent, #808080); animation: wor-boot-spin 1s linear infinite; }
  @keyframes wor-boot-spin { to { transform: rotate(360deg); } }

  /* ---- search results reuse chapter items ---- */
  .wor-search__results { display: grid; gap: 7px; max-height: 46dvh; overflow: auto; padding: 4px 2px; }

  /* ---- drawer user card ---- */
  .wor-drawer-user { display: flex; align-items: center; gap: 12px; padding: 14px; border: 1px solid var(--wor-border); border-radius: 16px; background: var(--wor-surface-soft); margin: 0 0 14px; }
  .wor-drawer-user__avatar { flex: 0 0 44px; width: 44px; height: 44px; border-radius: 50%; display: grid; place-items: center; background: var(--wor-accent-soft); color: var(--wor-accent); font-weight: 900; font-size: 1.05rem; }
  .wor-drawer-user__meta { min-width: 0; display: grid; gap: 2px; }
  .wor-drawer-user__meta strong { color: var(--wor-text); font-size: .92rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .wor-drawer-user__meta small { color: var(--wor-muted); font-size: .74rem; font-weight: 700; }

  /* ---- report types ---- */
  .wor-chapter-report-modal__types { display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 8px; }
  .wor-chapter-report-type { min-block-size: 44px; padding: 8px 12px; border: 1px solid var(--wor-border); border-radius: 12px; background: var(--wor-surface-soft); color: var(--wor-text); font: inherit; font-size: .8rem; font-weight: 800; cursor: pointer; }
  .wor-chapter-report-type.is-selected { border-color: var(--wor-accent); background: var(--wor-accent-soft); color: var(--wor-accent); }

  /* ---- color picker canvases ---- */
  .wor-reader-background-picker__canvas, .wor-reader-chapter-progress-color-picker__canvas { position: relative; overflow: hidden; }
  .wor-reader-background-picker__canvas canvas, .wor-reader-chapter-progress-color-picker__canvas canvas { position: absolute; inset: 0; width: 100%; height: 100%; }
  .wor-reader-background-picker__handle, .wor-reader-chapter-progress-color-picker__canvas .wor-picker-handle { z-index: 2; }

  /* ---- words sheet additions (folders tabs, list) ---- */
  .wor-reader-words-tabs { display: flex; gap: 8px; overflow-x: auto; padding-bottom: 4px; scrollbar-width: none; }
  .wor-reader-words-tabs::-webkit-scrollbar { display: none; }
  .wor-reader-words-tab { flex: 0 0 auto; padding-inline: 14px; }
  .wor-reader-words-tab.is-active { border-color: var(--wor-accent); background: var(--wor-accent-soft); color: var(--wor-accent); }
  .wor-reader-words-list { display: grid; gap: 10px; }
  .wor-reader-words-item.is-editing { border-color: var(--wor-accent); }
  .wor-reader-words-btn--danger { color: var(--wor-danger, #fb7185); }

  /* ---- active states for background presets ---- */
  .wor-reader-background-preset.is-active { border-color: color-mix(in srgb, var(--wor-accent) 60%, var(--wor-border)); background: var(--wor-accent-soft); }

  /* ---- misc ---- */
  .wor-icon-btn[disabled], .wor-reader-dock__nav[disabled] { opacity: .35; pointer-events: none; }
  #worTextSurface { min-height: 40dvh; }

  /* ==========================================================================
     18e fixes & polish
     ========================================================================== */

  /* The panel UI must always use the modern UI font — never the reading font.
     (The shell body was also missing the "wor-body" class, which left the whole
     chrome on the browser default serif.) */
  :root { --wor-ui-font: -apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Arabic", system-ui, "Segoe UI", Tahoma, Arial, sans-serif; }
  .wor-reader-dock, .wor-reader-dock button, .wor-reader-dock input, .wor-reader-dock output,
  .wor-reader-chapters-sheet, .wor-reader-words-sheet, .wor-search, .wor-drawer,
  .wor-chapter-report-modal, .wor-mini-toast, .wor-boot-loading {
    font-family: var(--wor-ui-font);
  }

  /* Dock grid: [nav][panel -> the ONE flexible/scrollable row][tabs fixed].
     The bundled stylesheet assumed an in-dock toggle as a 4th row, so with our
     DOM the panel sat on an "auto" row (growing with its content and pushing /
     squeezing the tab bar). Pinning the rows fixes tabs that moved or vanished. */
  .wor-reader-dock:is([data-wor-reader-active-panel="text"],[data-wor-reader-active-panel="font"],[data-wor-reader-active-panel="background"],[data-wor-reader-active-panel="color"],[data-wor-reader-active-panel="settings"],[data-wor-reader-active-panel="report"]) {
    grid-template-rows: auto minmax(0, 1fr) auto;
  }
  .wor-reader-dock__panel { min-block-size: 0; }
  .wor-reader-dock__tabs { grid-template-columns: repeat(7, minmax(0, 1fr)); }

  /* Text brightness slider was dead — the bundle hardcodes filter:none on the
     surface and nothing consumed --wor-reader-text-brightness. Wire it up. */
  .wor-reader-text-surface { filter: brightness(var(--wor-reader-text-brightness, 1)); transition: filter .25s ease; }

  /* Scrolling smoothness: no CSS smooth-scroll fighting the finger, and no
     permanent backdrop blur repaint over the whole dock while the page moves. */
  html { scroll-behavior: auto !important; }
  .wor-reader-dock {
    -webkit-backdrop-filter: none; backdrop-filter: none;
    background: linear-gradient(150deg, color-mix(in srgb, var(--wor-surface-solid) 99%, transparent), color-mix(in srgb, var(--wor-surface) 97%, transparent));
  }

  /* Panel switch animation (keyframes ship with the bundle) */
  .wor-reader-dock__panel.is-entering { animation: worReaderPanelIn 150ms ease-out both; }

  /* ---- coloring panel (التلوين) ---- */
  .wor-color-wrap { display: grid; gap: 9px; align-content: start; padding-block-end: 4px; }
  .wor-color-hint { margin: 0 2px; color: var(--wor-muted); font-size: .74rem; font-weight: 700; line-height: 1.6; }
  .wor-fmt-card { display: grid; gap: 10px; padding: 12px; border: 1px solid color-mix(in srgb, var(--wor-border) 88%, transparent); border-radius: 15px; background: color-mix(in srgb, var(--wor-surface) 89%, transparent); transition: opacity .25s ease; }
  .wor-fmt-card.is-off { opacity: .62; }
  .wor-fmt-card__head { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
  .wor-fmt-card__head h3 { margin: 0; color: var(--wor-text); font-size: .82rem; font-weight: 950; }
  .wor-fmt-card__sub { margin: 0; color: var(--wor-muted); font-size: .7rem; font-weight: 850; }
  .wor-fmt-card__label { color: var(--wor-muted); font-size: .72rem; font-weight: 900; margin-inline: 2px; }
  .wor-color-grid { display: flex; flex-wrap: wrap; gap: 7px; }
  .wor-color-dot { inline-size: 30px; block-size: 30px; padding: 0; border-radius: 50%; border: 2px solid color-mix(in srgb, var(--wor-border) 90%, transparent); cursor: pointer; transition: transform 90ms ease, border-color 150ms ease, box-shadow 150ms ease; }
  .wor-color-dot:active { transform: scale(.9); }
  .wor-color-dot.is-active { border-color: var(--wor-text); box-shadow: 0 0 0 2px color-mix(in srgb, var(--wor-accent) 55%, transparent), 0 2px 10px rgba(0,0,0,.28); }
  .wor-style-row { display: flex; flex-wrap: wrap; gap: 7px; }
  .wor-style-chip { min-block-size: 40px; padding: 8px 12px; border: 1px solid var(--wor-border); border-radius: 12px; background: var(--wor-surface-soft); color: var(--wor-text); font: inherit; font-size: .78rem; font-weight: 900; cursor: pointer; transition: transform 90ms ease, border-color 150ms ease, color 150ms ease, background-color 150ms ease; }
  .wor-style-chip:active { transform: scale(.97); }
  .wor-style-chip.is-active { border-color: var(--wor-accent); background: var(--wor-accent-soft); color: var(--wor-accent); }
  .wor-custom-marks { display: grid; grid-template-columns: 1fr auto 1fr; gap: 8px; align-items: center; }
  .wor-custom-marks input { min-block-size: 42px; padding: 8px 10px; border: 1px solid var(--wor-border); border-radius: 12px; background: var(--wor-surface-soft); color: var(--wor-text); font: inherit; font-size: .95rem; font-weight: 800; text-align: center; outline: none; }
  .wor-custom-marks input:focus { border-color: color-mix(in srgb, var(--wor-accent) 55%, var(--wor-border)); }
  .wor-custom-marks__arrow { color: var(--wor-muted); font-weight: 900; }
`;

// ---------------------------------------------------------------------------
// Background presets offered by the "الخلفية" panel (labels + order identical
// to the original reader; values chosen to match the original dark family).
// ---------------------------------------------------------------------------
export const WOR_BG_PRESETS = [
  { value: 'black',    name: 'أسود',      bg: '#000000', text: '#ffffff' },
  { value: 'soft',     name: 'داكن مريح', bg: '#16181d', text: '#eef1f6' },
  { value: 'charcoal', name: 'فحمي',      bg: '#232323', text: '#f3f3f3' },
  { value: 'gray',     name: 'رمادي',     bg: '#2e2e2e', text: '#f5f5f5' },
  { value: 'darker',   name: 'داكن جداً', bg: '#0b0b0b', text: '#ededed' },
];

// Palette offered by the coloring panel (same swatches as the classic reader)
export const WOR_FORMAT_COLORS = ['#ffffff', '#f97316', '#ec4899', '#a855f7', '#fbbf24', '#ef4444', '#3b82f6', '#4ade80', '#06b6d4', '#8b5cf6', '#f472b6', '#34d399', '#f87171', '#facc15', '#818cf8', '#888888', '#000000'];

const REPORT_TYPES = [
  'مشكلة في عرض النص',
  'فصل مكرر',
  'فصل ناقص أو مبتور',
  'ترتيب الفصول',
  'محتوى غير لائق',
  'أخرى',
];

// ---------------------------------------------------------------------------
// The bridge script (runs inside the WebView). Placeholders wrapped in single
// quotes ('__WOR_*__') are replaced with real JSON in buildWorShell below.
// ---------------------------------------------------------------------------
function bridgeScript() {
  return `
(function () {
  'use strict';
  // ============================ state ============================
  var S = '__WOR_SETTINGS__';
  var USER = '__WOR_USER__';
  var FONTS = '__WOR_FONTS__';
  var BG_PRESETS = '__WOR_BG_PRESETS__';
  var REPORT_TYPES = '__WOR_REPORT_TYPES__';
  var CH = null;
  var CHAPTERS = [];
  var WORDS = { folders: [], activeId: null, editing: null, sortDesc: true };
  var CHAPTERS_PAGE = 100;
  var chaptersPageCount = 1;
  var chaptersSortDesc = false;
  var chaptersSearch = '';
  var searchQ = '';
  var dockOpen = true;
  var dockEl = null;
  var autoScrollRaf = null;
  var lastTouchAt = 0;
  var userTouched = false;
  var touchStartScrollY = 0;
  var favOn = false;
  var customColors = false;
  var pickers = {};
  var pendingScroll = 0;

  // ============================ helpers ============================
  function $(sel, root) { try { return (root || document).querySelector(sel); } catch (e) { return null; } }
  function $all(sel, root) { try { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); } catch (e) { return []; } }
  function send(o) { try { if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(o)); else if (window.parent) window.parent.postMessage(JSON.stringify(o), '*'); } catch (e) {} }
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function debounce(fn, ms) { var t; return function () { var a = arguments, c = this; clearTimeout(t); t = setTimeout(function () { fn.apply(c, a); }, ms); }; }
  function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }

  function hexToRgb(hex) {
    hex = String(hex || '#000000').replace('#', '');
    if (hex.length === 3) hex = hex[0]+hex[0]+hex[1]+hex[1]+hex[2]+hex[2];
    var n = parseInt(hex, 16);
    if (isNaN(n)) n = 0;
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }
  function rgba(hex, a) { var c = hexToRgb(hex); return 'rgba(' + c.r + ',' + c.g + ',' + c.b + ',' + a + ')'; }
  function mix(hexA, hexB, t) {
    var a = hexToRgb(hexA), b = hexToRgb(hexB);
    function m(x, y) { return Math.round(x * (1 - t) + y * t); }
    function h(v) { var s = v.toString(16); return s.length < 2 ? '0' + s : s; }
    return '#' + h(m(a.r, b.r)) + h(m(a.g, b.g)) + h(m(a.b, b.b));
  }
  function isLight(hex) { var c = hexToRgb(hex); return (0.299 * c.r + 0.587 * c.g + 0.114 * c.b) > 150; }

  var toastTimer = null;
  function toast(text) {
    var el = $('#worMiniToast'); if (!el) return;
    $('span', el).textContent = text;
    el.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('is-visible'); }, 1800);
  }

  // ============================ fonts ============================
  var loadedFonts = {};
  function fontByValue(value) {
    for (var i = 0; i < FONTS.length; i++) if (FONTS[i].value === value) return FONTS[i];
    return FONTS[0];
  }
  function ensureFont(value) {
    var f = fontByValue(value);
    if (!f || !f.google || loadedFonts[f.value]) return;
    loadedFonts[f.value] = true;
    var link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=' + f.google + '&display=swap';
    document.head.appendChild(link);
  }
  function preloadFonts() {
    // Load ONLY the active font at boot. Preloading six Google-Font stylesheets
    // caused several late font swaps right while the reader starts scrolling,
    // and every swap reflows the whole chapter (stutter / sudden scroll stops).
    // Other fonts lazy-load the moment they are picked from the font panel.
    if (S.fontValue && S.fontValue !== 'default') ensureFont(S.fontValue);
  }

  // ============================ theme ============================
  function applyTheme() {
    var root = document.documentElement;
    var bg = S.bgColor || '#000000';
    var text = S.textColor || '#ffffff';
    var accent = S.accent || '#808080';
    var dark = !isLight(bg);
    var soft = mix(bg, dark ? '#ffffff' : '#000000', 0.055);
    root.setAttribute('data-wor-theme', 'custom');
    root.setAttribute('style', ''
      + '--wor-bg:' + bg + ';'
      + '--wor-surface:' + rgba(bg, dark ? 0.9 : 0.96) + ';'
      + '--wor-surface-solid:' + mix(bg, dark ? '#0a0a0a' : '#ffffff', 0.35) + ';'
      + '--wor-surface-soft:' + soft + ';'
      + '--wor-text:' + text + ';'
      + '--wor-muted:' + rgba(text, 0.66) + ';'
      + '--wor-accent:' + accent + ';'
      + '--wor-accent-soft:' + rgba(accent, 0.16) + ';'
      + '--wor-border:' + rgba(text, 0.15) + ';'
      + '--wor-danger:#fb7185;--wor-success:#4ade80;--wor-warning:#fbbf24;'
      + '--wor-shadow:0 18px 50px rgba(0,0,0,' + (dark ? 0.4 : 0.18) + ');'
      + '--wor-reader-page-bg:' + bg + ';'
      + '--wor-reader-page-fg:' + text + ';'
      + '--wor-reader-effective-fg:' + text + ';'
      + '--wor-reader-page-muted:' + rgba(text, 0.68) + ';'
      + '--wor-reader-font-family-active:inherit;'
      + '--wor-reader-chapter-progress-color:' + (S.progressBarColor || '#00ffff') + ';'
      + 'color-scheme:' + (dark ? 'dark' : 'light') + ';'
      + '--wor-safe-top:' + (S.safeTop || 0) + 'px;'
      + '--wor-safe-bottom:' + (S.safeBottom || 0) + 'px;'
    );
    document.body.style.background = bg;
    document.body.style.color = text;
  }

  function applyTypography() {
    var root = document.documentElement;
    var fam = 'inherit';
    var f = fontByValue(S.fontValue || 'default');
    if (f) fam = f.family;
    if (S.fontValue && S.fontValue !== 'default') ensureFont(S.fontValue);
    var dir = S.direction === 'ltr' ? 'ltr' : 'rtl';
    var align = S.direction === 'center' ? 'center' : (S.direction === 'ltr' ? 'left' : 'right');
    root.style.setProperty('--wor-reader-font-size', (S.fontSize || 18) + 'px');
    root.style.setProperty('--wor-reader-line-height', String(S.lineHeight || 2.3));
    root.style.setProperty('--wor-reader-word-spacing', (S.wordSpacing || 0) + 'px');
    root.style.setProperty('--wor-reader-text-brightness', String(S.brightness || 1));
    root.style.setProperty('--wor-reader-font-weight', String(S.fontWeight || 400));
    root.style.setProperty('--wor-reader-text-direction', dir);
    root.style.setProperty('--wor-reader-text-align', align);
    root.style.setProperty('--wor-reader-font-family', fam);
    var fmt = [
      ['--wor-fmt-dialogue-color', S.enableDialogue ? S.dialogueColor : null],
      ['--wor-fmt-dialogue-size', S.enableDialogue ? (S.dialogueSize + '%') : null],
      ['--wor-fmt-dialogue-weight', S.enableDialogue ? '700' : null],
      ['--wor-fmt-markdown-color', S.enableMarkdown ? S.markdownColor : null],
      ['--wor-fmt-markdown-size', S.enableMarkdown ? (S.markdownSize + '%') : null],
      ['--wor-fmt-bracket-color', S.enableBracket ? S.bracketColor : null],
      ['--wor-fmt-bracket-size', S.enableBracket ? (S.bracketSize + '%') : null],
      ['--wor-fmt-bracket-weight', S.enableBracket ? '700' : null],
      ['--wor-fmt-custom-color', S.enableCustom ? S.customColor : null],
      ['--wor-fmt-custom-size', S.enableCustom ? (S.customSize + '%') : null],
      ['--wor-fmt-custom-weight', S.enableCustom ? '700' : null]
    ];
    fmt.forEach(function (p) { if (p[1] != null) root.style.setProperty(p[0], p[1]); else root.style.removeProperty(p[0]); });
    document.body.classList.toggle('wor-fmt-hide-quotes', !!S.hideQuotes);
    document.body.classList.toggle('wor-fmt-hide-markdown', !!S.hideMarkdownMarks);
    document.body.classList.toggle('wor-fmt-hide-brackets', !!S.hideBracketMarks);
    document.body.classList.toggle('wor-fmt-hide-custom', !!S.hideCustomMarks);
    document.body.classList.toggle('wor-hide-chapter-title', !!S.hideTitle);
  }

  function applyProgressBar() {
    var bar = $('.wor-reader-chapter-progress');
    if (bar) {
      if (S.showProgressBar === false) { bar.setAttribute('aria-hidden', 'true'); bar.style.display = 'none'; }
      else { bar.removeAttribute('aria-hidden'); bar.style.display = ''; }
    }
    document.documentElement.style.setProperty('--wor-reader-chapter-progress-color', S.progressBarColor || '#00ffff');
  }

  function setRangeValue(id, value, suffix) {
    var el = document.getElementById(id);
    if (!el) return;
    el.value = value;
    var out = el.parentElement.querySelector('output');
    if (out) out.textContent = value + suffix;
  }
  function setActiveChoice(scopeSel, value) {
    $all(scopeSel + ' [data-value]').forEach(function (b) {
      b.classList.toggle('is-active', b.getAttribute('data-value') === String(value));
    });
  }
  function setSwitch(sel, on) {
    var el = $(sel);
    if (!el) return;
    el.classList.toggle('is-active', !!on);
    el.textContent = on ? 'مفعّل' : 'مغلق';
  }

  function updateColorDots(key, val) {
    $all('[data-wor-color-for="' + key + '"] .wor-color-dot').forEach(function (d) {
      d.classList.toggle('is-active', String(d.getAttribute('data-value') || '').toLowerCase() === String(val || '').toLowerCase());
    });
  }
  function updateFmtCards() {
    [['dialogue', 'enableDialogue'], ['markdown', 'enableMarkdown'], ['bracket', 'enableBracket'], ['custom', 'enableCustom']].forEach(function (p) {
      var card = $('.wor-fmt-card[data-wor-fmt-card="' + p[0] + '"]');
      if (card) card.classList.toggle('is-off', !S[p[1]]);
    });
  }

  function applySettingsUI() {
    applyTheme();
    applyTypography();
    applyProgressBar();
    setRangeValue('worRangeFontSize', S.fontSize || 18, 'px');
    setRangeValue('worRangeLineHeight', S.lineHeight || 2.3, '');
    setRangeValue('worRangeWordSpacing', S.wordSpacing || 0, 'px');
    setRangeValue('worRangeBrightness', S.brightness || 1, '');
    setActiveChoice('#wor-reader-panel-text [data-wor-weight]', S.fontWeight || 400);
    setActiveChoice('#wor-reader-panel-text [data-wor-direction]', S.direction || 'rtl');
    setActiveChoice('[data-wor-font-choice]', S.fontValue || 'default');
    setActiveChoice('[data-wor-bg-preset]', customColors ? '__none__' : (S.bgPreset || '__none__'));
    setSwitch('[data-wor-chapter-progress-toggle]', S.showProgressBar !== false);
    setSwitch('[data-wor-switch="continuous"]', !!S.continuousMode);
    setSwitch('[data-wor-switch="autoscroll"]', !!S.autoScroll);
    setSwitch('[data-wor-switch="keepawake"]', !!S.keepAwake);
    setSwitch('[data-wor-switch="hidetitle"]', !!S.hideTitle);
    setSwitch('[data-wor-switch="taptoggle"]', S.tapToToggle !== false);
    // coloring panel (التلوين)
    setSwitch('[data-wor-switch="dialogue"]', !!S.enableDialogue);
    setSwitch('[data-wor-switch="markdown"]', !!S.enableMarkdown);
    setSwitch('[data-wor-switch="bracket"]', !!S.enableBracket);
    setSwitch('[data-wor-switch="custom"]', !!S.enableCustom);
    setSwitch('[data-wor-switch="hidequotes"]', !!S.hideQuotes);
    setSwitch('[data-wor-switch="hidemarkdown"]', !!S.hideMarkdownMarks);
    setSwitch('[data-wor-switch="hidebrackets"]', !!S.hideBracketMarks);
    setSwitch('[data-wor-switch="hidecustom"]', !!S.hideCustomMarks);
    setRangeValue('worRangeDialogueSize', S.dialogueSize || 100, '%');
    setRangeValue('worRangeMarkdownSize', S.markdownSize || 100, '%');
    setRangeValue('worRangeBracketSize', S.bracketSize || 110, '%');
    setRangeValue('worRangeCustomSize', S.customSize || 105, '%');
    setActiveChoice('[data-wor-fmt-style="quote"]', S.selectedQuoteStyle || 'all');
    setActiveChoice('[data-wor-fmt-style="markdown"]', S.selectedMarkdownStyle || 'all');
    setActiveChoice('[data-wor-fmt-style="bracket"]', S.selectedBracketStyle || 'all');
    updateColorDots('dialogueColor', S.dialogueColor);
    updateColorDots('markdownColor', S.markdownColor);
    updateColorDots('bracketColor', S.bracketColor);
    updateColorDots('customColor', S.customColor);
    var coIn = $('#worCustomOpenMark'), ccIn = $('#worCustomCloseMark');
    if (coIn && document.activeElement !== coIn) coIn.value = S.customOpenMark || '';
    if (ccIn && document.activeElement !== ccIn) ccIn.value = S.customCloseMark || '';
    updateFmtCards();
    var ct = $('[data-wor-background-custom-toggle]');
    if (ct) {
      ct.classList.toggle('is-active', !!customColors);
      ct.classList.toggle('is-inactive', !customColors);
      var lab = $('[data-wor-background-custom-toggle-label]', ct);
      if (lab) lab.textContent = customColors ? 'مفعّل' : 'غير مفعّل';
      var pal = $('#wor-reader-panel-background .wor-reader-background-palette');
      if (pal) pal.style.display = customColors ? '' : 'none';
    }
    if (pickers.bg) pickers.bg.set(S.bgColor || '#000000');
    if (pickers.text) pickers.text.set(S.textColor || '#ffffff');
    if (pickers.progress) pickers.progress.set(S.progressBarColor || '#00ffff');
    updateFavUI();
    updateAutoScroll();
  }

  // ============================ dock ============================
  function setDock(open) {
    dockOpen = !!open;
    if (!dockEl) return;
    dockEl.setAttribute('data-wor-reader-dock-state', dockOpen ? 'open' : 'closed');
    document.body.classList.toggle('wor-reader-dock-collapsed', !dockOpen);
    if (dockOpen) {
      dockEl.style.transform = '';
      dockEl.style.opacity = '';
      dockEl.style.pointerEvents = '';
      dockEl.style.visibility = '';
      var h = dockEl.offsetHeight || 242;
      document.documentElement.style.setProperty('--wor-reader-dock-height', h + 'px');
      document.documentElement.style.setProperty('--wor-reader-dock-toggle-bottom', (h + 16) + 'px');
    } else {
      dockEl.style.transform = 'translate3d(0,120%,0)';
      dockEl.style.opacity = '0';
      dockEl.style.pointerEvents = 'none';
      dockEl.style.visibility = 'hidden';
      document.documentElement.style.setProperty('--wor-reader-dock-height', '0px');
      document.documentElement.style.setProperty('--wor-reader-dock-toggle-bottom', '12px');
    }
    var tog = $('.wor-reader-dock__toggle--floating');
    if (tog) tog.setAttribute('aria-expanded', dockOpen ? 'true' : 'false');
  }

  // ============================ autoscroll ============================
  function updateAutoScroll() {
    if (S.autoScroll && !autoScrollRaf) {
      var step = function () {
        autoScrollRaf = null;
        if (!S.autoScroll) return;
        if (!document.hidden && Date.now() - lastTouchAt > 2200) window.scrollBy(0, 0.55);
        autoScrollRaf = requestAnimationFrame(step);
      };
      autoScrollRaf = requestAnimationFrame(step);
    } else if (!S.autoScroll && autoScrollRaf) {
      cancelAnimationFrame(autoScrollRaf);
      autoScrollRaf = null;
    }
  }

  // ============================ scroll / progress ============================
  var lastSent = 0;
  function chapterNumberAt(y) {
    var secs = $all('.wor-chapter-sec[data-ch]');
    var cur = secs.length ? parseInt(secs[0].getAttribute('data-ch'), 10) : 0;
    for (var i = 0; i < secs.length; i++) {
      if (secs[i].offsetTop - 90 <= y) cur = parseInt(secs[i].getAttribute('data-ch'), 10);
      else break;
    }
    return cur;
  }
  function onScroll() {
    var y = window.scrollY || window.pageYOffset || 0;
    var fill = $('[data-wor-reader-chapter-progress-fill]');
    var doc = document.documentElement;
    var max = doc.scrollHeight - window.innerHeight;
    var ratio = max > 0 ? clamp(y / max, 0, 1) : 0;
    if (fill) fill.style.width = (ratio * 100).toFixed(2) + '%';
    var now = Date.now();
    if (now - lastSent > 220) {
      lastSent = now;
      send({ t: 'scroll', offset: Math.round(y), chapter: chapterNumberAt(y), ratio: ratio });
    }
    maybeNeedNext();
  }
  function maybeNeedNext() {
    if (!S.continuousMode || window.__worEnd || window.__worNeedLock) return;
    var doc = document.documentElement;
    if (window.scrollY + window.innerHeight >= doc.scrollHeight - 1400) {
      window.__worNeedLock = true;
      send({ t: 'needNext' });
    }
  }

  // ============================ chapters sheet ============================
  function renderChapters() {
    var listEl = $('#worChaptersList');
    if (!listEl) return;
    var q = (chaptersSearch || '').trim().toLowerCase();
    var list = CHAPTERS.filter(function (c) {
      if (!q) return true;
      return String(c.number).indexOf(q) !== -1 || String(c.title || '').toLowerCase().indexOf(q) !== -1;
    });
    list.sort(function (a, b) { return chaptersSortDesc ? b.number - a.number : a.number - b.number; });
    var total = list.length;
    list = list.slice(0, chaptersPageCount * CHAPTERS_PAGE);
    var html = list.map(function (c) {
      var isCurrent = CH && parseInt(CH.number, 10) === parseInt(c.number, 10);
      return '<button class="wor-reader-chapters-item' + (isCurrent ? ' is-current' : '') + '" type="button" data-wor-goto="' + esc(c.number) + '">'
        + '<span class="wor-reader-chapters-item__num">' + esc(c.number) + '</span>'
        + '<span class="wor-reader-chapters-item__body">'
        + '<span class="wor-reader-chapters-item__text">' + esc(c.title || ('فصل ' + c.number)) + '</span>'
        + (isCurrent ? '<small>تقرأ الآن</small>' : '')
        + '</span>'
        + '</button>';
    }).join('');
    if (!list.length) html = '<div class="wor-reader-chapters-sheet__state">لا توجد نتائج مطابقة</div>';
    listEl.innerHTML = html;
    var foot = $('.wor-reader-chapters-sheet__footer');
    if (foot) foot.style.display = total > list.length ? '' : 'none';
    var cur = $('.wor-reader-chapters-item.is-current', listEl);
    if (cur && !chaptersSearch) setTimeout(function () { try { cur.scrollIntoView({ block: 'center' }); } catch (e) {} }, 60);
  }
  function openChaptersSheet() {
    var sh = $('#wor-reader-chapters-sheet');
    if (!sh) return;
    chaptersPageCount = 1;
    sh.hidden = false;
    sh.setAttribute('aria-hidden', 'false');
    renderChapters();
  }
  function closeChaptersSheet() {
    var sh = $('#wor-reader-chapters-sheet');
    if (!sh) return;
    sh.hidden = true;
    sh.setAttribute('aria-hidden', 'true');
  }

  // ============================ words sheet ============================
  function renderWords() {
    var tabsEl = $('#worWordsTabs');
    var listEl = $('#worWordsList');
    if (!tabsEl || !listEl) return;
    var tabs = WORDS.folders.map(function (f) {
      return '<button type="button" class="wor-reader-words-tab' + (WORDS.activeId === f.id ? ' is-active' : '') + '" data-wor-words-folder="' + esc(f.id) + '">' + esc(f.name) + '</button>';
    });
    tabs.push('<button type="button" class="wor-reader-words-tab" data-wor-words-newfolder title="مجلد جديد">＋</button>');
    if (WORDS.folders.length > 1) tabs.push('<button type="button" class="wor-reader-words-tab" data-wor-words-delfolder title="حذف المجلد الحالي">🗑</button>');
    tabsEl.innerHTML = tabs.join('');
    var folder = null;
    for (var i = 0; i < WORDS.folders.length; i++) if (WORDS.folders[i].id === WORDS.activeId) folder = WORDS.folders[i];
    var items = folder ? (folder.replacements || []) : [];
    var sorted = items.slice();
    sorted.sort(function (a, b) {
      var ao = String(a.original || ''), bo = String(b.original || '');
      return WORDS.sortDesc ? bo.localeCompare(ao, 'ar') : ao.localeCompare(bo, 'ar');
    });
    var html = sorted.map(function (r) {
      var idx = items.indexOf(r);
      var editing = WORDS.editing != null && WORDS.editing.idx === idx;
      return '<div class="wor-reader-words-item' + (editing ? ' is-editing' : '') + '" data-wor-words-idx="' + idx + '">'
        + '<div class="wor-reader-words-item__body">'
        + '<div class="wor-reader-words-item__pair">'
        + '<strong>' + esc(r.original) + '</strong>'
        + '<span class="wor-reader-words-item__arrow">←</span>'
        + '<strong class="wor-reader-words-item__to">' + esc(r.replacement) + '</strong>'
        + '</div></div>'
        + '<div class="wor-reader-words-item__actions">'
        + '<button type="button" data-wor-words-edit="' + idx + '">' + (editing ? 'إلغاء' : 'تعديل') + '</button>'
        + '<button type="button" data-wor-words-del="' + idx + '">حذف</button>'
        + '</div></div>';
    }).join('');
    if (!sorted.length) html = '<div class="wor-reader-words-empty">لا توجد كلمات مستبدلة بعد في هذا المجلد</div>';
    listEl.innerHTML = html;
    var orig = $('#worWordsOriginal'), repl = $('#worWordsReplacement'), saveBtn = $('#worWordsSave');
    if (WORDS.editing != null && items[WORDS.editing.idx]) {
      if (orig) orig.value = items[WORDS.editing.idx].original || '';
      if (repl) repl.value = items[WORDS.editing.idx].replacement || '';
      if (saveBtn) saveBtn.textContent = 'تحديث';
    } else if (saveBtn) {
      saveBtn.textContent = 'إضافة';
    }
    var hint = $('#worWordsFolderName');
    if (hint) hint.textContent = folder ? ('— ' + folder.name) : '';
  }
  function openWordsSheet() { var sh = $('#wor-reader-words-sheet'); if (!sh) return; sh.hidden = false; sh.setAttribute('aria-hidden', 'false'); renderWords(); send({ t: 'wordsOpen' }); }
  function closeWordsSheet() { var sh = $('#wor-reader-words-sheet'); if (!sh) return; sh.hidden = true; sh.setAttribute('aria-hidden', 'true'); WORDS.editing = null; }

  // ============================ search overlay ============================
  function renderSearch() {
    var res = $('#worSearchResults');
    var status = $('[data-wor-search-status]');
    if (!res || !status) return;
    var q = (searchQ || '').trim().toLowerCase();
    if (!q) { res.innerHTML = ''; status.textContent = 'ابحث عن فصل بالرقم أو العنوان…'; return; }
    var list = CHAPTERS.filter(function (c) {
      return String(c.number).indexOf(q) !== -1 || String(c.title || '').toLowerCase().indexOf(q) !== -1;
    }).slice(0, 12);
    status.textContent = list.length ? ('نتائج (' + list.length + ')') : 'لا توجد نتائج';
    res.innerHTML = list.map(function (c) {
      var isCurrent = CH && parseInt(CH.number, 10) === parseInt(c.number, 10);
      return '<button class="wor-reader-chapters-item' + (isCurrent ? ' is-current' : '') + '" type="button" data-wor-goto="' + esc(c.number) + '">'
        + '<span class="wor-reader-chapters-item__num">' + esc(c.number) + '</span>'
        + '<span class="wor-reader-chapters-item__body"><span class="wor-reader-chapters-item__text">' + esc(c.title || ('فصل ' + c.number)) + '</span></span>'
        + '</button>';
    }).join('');
  }
  function openSearch() { var box = $('#wor-search'); if (!box) return; box.hidden = false; box.setAttribute('aria-hidden', 'false'); setTimeout(function () { try { var i = $('#wor-search-input'); i && i.focus(); } catch (e) {} }, 120); }
  function closeSearch() { var box = $('#wor-search'); if (!box) return; box.hidden = true; box.setAttribute('aria-hidden', 'true'); }

  // ============================ drawer ============================
  function openDrawer() {
    var d = $('#wor-drawer'), b = $('[data-wor-drawer-backdrop]');
    if (d) { d.removeAttribute('inert'); d.setAttribute('aria-hidden', 'false'); d.classList.add('is-open'); }
    if (b) { b.hidden = false; requestAnimationFrame(function () { b.classList.add('is-visible'); }); }
  }
  function closeDrawer() {
    var d = $('#wor-drawer'), b = $('[data-wor-drawer-backdrop]');
    if (d) { d.setAttribute('aria-hidden', 'true'); d.classList.remove('is-open'); d.setAttribute('inert', ''); }
    if (b) { b.classList.remove('is-visible'); setTimeout(function () { b.hidden = true; }, 220); }
  }

  // ============================ report modal ============================
  var reportSelected = [];
  function renderReportTypes() {
    var wrap = $('[data-wor-report-types]');
    if (!wrap) return;
    wrap.innerHTML = REPORT_TYPES.map(function (t) {
      return '<button type="button" class="wor-chapter-report-type' + (reportSelected.indexOf(t) !== -1 ? ' is-selected' : '') + '" data-wor-report-type="' + esc(t) + '">' + esc(t) + '</button>';
    }).join('');
  }
  function openReport() {
    var m = $('[data-wor-chapter-report-modal]');
    if (!m) return;
    reportSelected = [];
    renderReportTypes();
    var sub = $('[data-wor-report-submit]');
    if (sub) sub.disabled = true;
    var det = $('[data-wor-report-details]');
    if (det) det.value = '';
    var cnt = $('[data-wor-report-details-count]');
    if (cnt) cnt.textContent = '0';
    var p = $('[data-wor-report-modal-chapter]');
    if (p && CH) p.textContent = 'الفصل ' + CH.number + (CH.title ? ' — ' + CH.title : '');
    m.hidden = false;
    m.setAttribute('aria-hidden', 'false');
  }
  function closeReport() {
    var m = $('[data-wor-chapter-report-modal]');
    if (!m) return;
    m.hidden = true;
    m.setAttribute('aria-hidden', 'true');
  }

  // ============================ color pickers ============================
  function makePicker(id, onApply, initialHex) {
    var root = document.getElementById(id);
    if (!root) return null;
    var canvas = $('canvas', root);
    var handle = $('.wor-picker-handle', root) || $('.wor-reader-background-picker__handle', root);
    var hue = $('input[type=range]', root);
    var hexIn = $('input[type=text]', root);
    var st = { h: 0, s: 0, v: 0 };
    function hsvFromHex(hex) {
      var c = hexToRgb(hex); var r = c.r / 255, g = c.g / 255, b = c.b / 255;
      var max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min, h = 0, s = 0, v = max;
      if (d) {
        s = d / max;
        if (max === r) h = ((g - b) / d + (g < b ? 6 : 0));
        else if (max === g) h = (b - r) / d + 2;
        else h = (r - g) / d + 4;
        h *= 60;
      }
      return { h: h, s: s, v: v };
    }
    function hex() {
      var h = st.h, s = st.s, v = st.v;
      var c = v * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m2 = v - c, rgb2;
      if (h < 60) rgb2 = [c, x, 0]; else if (h < 120) rgb2 = [x, c, 0]; else if (h < 180) rgb2 = [0, c, x];
      else if (h < 240) rgb2 = [0, x, c]; else if (h < 300) rgb2 = [x, 0, c]; else rgb2 = [c, 0, x];
      function hh(v2) { var s2 = Math.round(v2 * 255).toString(16); return s2.length < 2 ? '0' + s2 : s2; }
      return '#' + hh(rgb2[0] + m2) + hh(rgb2[1] + m2) + hh(rgb2[2] + m2);
    }
    function draw() {
      if (!canvas) return;
      var w = canvas.width = canvas.offsetWidth || 220;
      var ht = canvas.height = canvas.offsetHeight || 140;
      var ctx = canvas.getContext('2d');
      ctx.fillStyle = 'hsl(' + st.h + ',100%,50%)'; ctx.fillRect(0, 0, w, ht);
      var g1 = ctx.createLinearGradient(0, 0, w, 0);
      g1.addColorStop(0, '#ffffff'); g1.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g1; ctx.fillRect(0, 0, w, ht);
      var g2 = ctx.createLinearGradient(0, 0, 0, ht);
      g2.addColorStop(0, 'rgba(0,0,0,0)'); g2.addColorStop(1, '#000000');
      ctx.fillStyle = g2; ctx.fillRect(0, 0, w, ht);
      if (handle) {
        handle.style.left = (st.s * 100) + '%';
        handle.style.top = ((1 - st.v) * 100) + '%';
      }
    }
    function emit() {
      var hx = hex();
      var meta = $('[data-wor-picker-hex]', root);
      if (meta) meta.textContent = hx.toUpperCase();
      var sw = $('[data-wor-picker-swatch]', root);
      if (sw) sw.style.background = hx;
      if (hexIn && document.activeElement !== hexIn) hexIn.value = hx.toUpperCase();
      onApply(hx);
    }
    function fromEvent(e) {
      if (!canvas) return;
      var r = canvas.getBoundingClientRect();
      var cx = e.touches ? e.touches[0].clientX : e.clientX;
      var cy = e.touches ? e.touches[0].clientY : e.clientY;
      var x = clamp(cx - r.left, 0, r.width);
      var y = clamp(cy - r.top, 0, r.height);
      st.s = r.width ? x / r.width : 0;
      st.v = r.height ? 1 - y / r.height : 0;
      draw(); emit();
      if (e.preventDefault) e.preventDefault();
    }
    if (canvas) {
      canvas.addEventListener('touchstart', fromEvent, { passive: false });
      canvas.addEventListener('touchmove', fromEvent, { passive: false });
      canvas.addEventListener('mousedown', fromEvent);
      canvas.addEventListener('mousemove', function (e) { if (e.buttons) fromEvent(e); });
    }
    if (hue) hue.addEventListener('input', function () { st.h = parseFloat(hue.value) || 0; draw(); emit(); });
    if (hexIn) hexIn.addEventListener('change', function () {
      var v = String(hexIn.value || '').trim();
      if (/^#[0-9a-fA-F]{6}$/.test(v)) { st = hsvFromHex(v); if (hue) hue.value = st.h; draw(); emit(); }
    });
    st = hsvFromHex(initialHex || '#000000');
    if (hue) hue.value = st.h;
    setTimeout(draw, 80);
    setTimeout(draw, 400);
    return {
      set: function (hx) {
        if (!/^#[0-9a-fA-F]{6}$/.test(String(hx || ''))) return;
        st = hsvFromHex(hx);
        if (hue && document.activeElement !== hue) hue.value = st.h;
        draw();
        if (hexIn && document.activeElement !== hexIn) hexIn.value = String(hx).toUpperCase();
        var meta = $('[data-wor-picker-hex]', root);
        if (meta) meta.textContent = String(hx).toUpperCase();
        var sw = $('[data-wor-picker-swatch]', root);
        if (sw) sw.style.background = hx;
      }
    };
  }

  // ============================ favorite ============================
  function updateFavUI() {
    var btn = $('[data-wor-favorite-toggle]');
    if (!btn) return;
    btn.setAttribute('aria-pressed', favOn ? 'true' : 'false');
    btn.classList.toggle('is-active', favOn);
    var fill = $('.wor-reader-heart-icon__fill', btn);
    if (fill) fill.setAttribute('opacity', favOn ? '1' : '0');
    var lab = $('[data-wor-favorite-label]', btn);
    if (lab) lab.textContent = favOn ? 'في المفضلة' : 'المفضلة';
  }

  // ============================ wiring ============================
  var sendDebouncedBg = debounce(function (hx) { send({ t: 'settings', patch: { bgColor: hx, customColors: true } }); }, 320);
  var sendDebouncedText = debounce(function (hx) { send({ t: 'settings', patch: { textColor: hx, customColors: true } }); }, 320);
  var sendDebouncedProgress = debounce(function (hx) { send({ t: 'settings', patch: { progressBarColor: hx } }); }, 320);

  function wire() {
    dockEl = $('[data-wor-reader-dock]');
    // topbar
    var drawerBtn = $('[data-wor-drawer-toggle]');
    drawerBtn && drawerBtn.addEventListener('click', openDrawer);
    var searchBtn = $('[data-wor-search-toggle]');
    searchBtn && searchBtn.addEventListener('click', openSearch);
    var themeBtn = $('[data-wor-theme-toggle]');
    themeBtn && themeBtn.addEventListener('click', function () { send({ t: 'themeCycle' }); });
    $all('[data-wor-comments-btn]').forEach(function (b) {
      b.addEventListener('click', function () { send({ t: 'comments' }); });
    });
    // drawer
    var backdrop = $('[data-wor-drawer-backdrop]');
    backdrop && backdrop.addEventListener('click', closeDrawer);
    var drawerClose = $('[data-wor-drawer-close]');
    drawerClose && drawerClose.addEventListener('click', closeDrawer);
    $all('[data-wor-nav]').forEach(function (a) {
      a.addEventListener('click', function (e) {
        e.preventDefault();
        closeDrawer();
        send({ t: 'nav', to: a.getAttribute('data-wor-nav') });
      });
    });
    // search
    var searchClose = $('[data-wor-search-close]');
    searchClose && searchClose.addEventListener('click', closeSearch);
    var searchInput = $('#wor-search-input');
    searchInput && searchInput.addEventListener('input', function () { searchQ = searchInput.value; renderSearch(); });
    document.addEventListener('click', function (e) {
      var g = e.target.closest && e.target.closest('[data-wor-goto]');
      if (g) {
        closeSearch();
        send({ t: 'goto', number: parseInt(g.getAttribute('data-wor-goto'), 10) });
      }
    });
    // dock tabs
    $all('.wor-reader-dock__tab').forEach(function (tab) {
      tab.addEventListener('click', function () {
        var panel = tab.getAttribute('data-wor-tab');
        $all('.wor-reader-dock__tab').forEach(function (x) { x.classList.toggle('is-active', x === tab); });
        $all('.wor-reader-dock__panel').forEach(function (p) {
          var on = p.getAttribute('data-wor-reader-panel') === panel;
          p.style.display = on ? '' : 'none';
          if (on) { p.classList.remove('is-entering'); void p.offsetWidth; p.classList.add('is-entering'); }
        });
        dockEl && dockEl.setAttribute('data-wor-reader-active-panel', panel);
        setTimeout(function () { if (dockOpen) setDock(true); }, 30);
      });
    });
    // dock actions
    var chOpen = $('[data-wor-reader-chapters-open]');
    chOpen && chOpen.addEventListener('click', openChaptersSheet);
    var wordsOpen = $('[data-wor-reader-words-open]');
    wordsOpen && wordsOpen.addEventListener('click', openWordsSheet);
    var favBtn = $('[data-wor-favorite-toggle]');
    favBtn && favBtn.addEventListener('click', function () { send({ t: 'fav' }); });
    var novelBtn = $('[data-wor-reader-dock-novel]');
    novelBtn && novelBtn.addEventListener('click', function (e) { e.preventDefault(); send({ t: 'novelPage' }); });
    var navNext = $('[data-wor-reader-nav-next]');
    navNext && navNext.addEventListener('click', function (e) { e.preventDefault(); send({ t: 'nav', dir: 'next' }); });
    var navPrev = $('[data-wor-reader-nav-prev]');
    navPrev && navPrev.addEventListener('click', function (e) { e.preventDefault(); send({ t: 'nav', dir: 'prev' }); });
    var reportOpen = $('[data-wor-reader-report-open]');
    reportOpen && reportOpen.addEventListener('click', openReport);
    // dock toggle
    var tog = $('.wor-reader-dock__toggle--floating');
    tog && tog.addEventListener('click', function () { setDock(!dockOpen); });
    // tap on content toggles dock
    var main = $('.wor-reader-main');
    main && main.addEventListener('click', function (e) {
      if (window.getSelection && String(window.getSelection()).length > 1) return;
      if (e.target.closest && e.target.closest('a, button, input, textarea, .wor-author-card, .wor-comments-trigger, [data-wor-goto]')) return;
      if (S.tapToToggle === false) return;
      // Ignore taps that were actually (small) scroll gestures: scrolling moved
      // the page between touchstart and the synthetic click. Toggling the dock
      // mid-gesture changes the page height and instantly kills the scroll.
      if (!userTouched || Date.now() - lastTouchAt > 700) return;
      if (Math.abs((window.scrollY || 0) - touchStartScrollY) > 8) return;
      setDock(!dockOpen);
    });
    // chapters sheet
    var chClose = $('[data-wor-chapters-close]');
    chClose && chClose.addEventListener('click', closeChaptersSheet);
    var chSearch = $('#worChaptersSearch');
    chSearch && chSearch.addEventListener('input', function () { chaptersSearch = chSearch.value; chaptersPageCount = 1; renderChapters(); });
    var chSort = $('[data-wor-chapters-sort]');
    chSort && chSort.addEventListener('click', function () { chaptersSortDesc = !chaptersSortDesc; renderChapters(); });
    var chMore = $('#worChaptersMore');
    chMore && chMore.addEventListener('click', function () { chaptersPageCount += 1; renderChapters(); });
    // words sheet
    var wordsClose = $('[data-wor-words-close]');
    wordsClose && wordsClose.addEventListener('click', closeWordsSheet);
    document.addEventListener('click', function (e) {
      var el;
      if ((el = e.target.closest('[data-wor-words-folder]'))) {
        WORDS.activeId = el.getAttribute('data-wor-words-folder');
        WORDS.editing = null;
        renderWords();
        send({ t: 'words', action: 'selectFolder', id: WORDS.activeId });
      } else if ((el = e.target.closest('[data-wor-words-newfolder]'))) {
        send({ t: 'words', action: 'createFolderPrompt' });
      } else if ((el = e.target.closest('[data-wor-words-delfolder]'))) {
        send({ t: 'words', action: 'deleteFolder', id: WORDS.activeId });
      } else if ((el = e.target.closest('[data-wor-words-edit]'))) {
        var idx = parseInt(el.getAttribute('data-wor-words-edit'), 10);
        WORDS.editing = (WORDS.editing && WORDS.editing.idx === idx) ? null : { idx: idx };
        renderWords();
      } else if ((el = e.target.closest('[data-wor-words-del]'))) {
        send({ t: 'words', action: 'deleteRep', idx: parseInt(el.getAttribute('data-wor-words-del'), 10) });
      }
    });
    var wordsSave = $('#worWordsSave');
    wordsSave && wordsSave.addEventListener('click', function () {
      var original = ($('#worWordsOriginal') || {}).value || '';
      var replacement = ($('#worWordsReplacement') || {}).value || '';
      original = original.trim();
      if (!original) { toast('اكتب الكلمة الأصلية أولاً'); return; }
      send({
        t: 'words',
        action: WORDS.editing != null ? 'updateRep' : 'addRep',
        idx: WORDS.editing != null ? WORDS.editing.idx : null,
        original: original,
        replacement: replacement
      });
    });
    var wordsCancel = $('#worWordsCancel');
    wordsCancel && wordsCancel.addEventListener('click', function () {
      WORDS.editing = null;
      var o = $('#worWordsOriginal'), r = $('#worWordsReplacement');
      if (o) o.value = '';
      if (r) r.value = '';
      renderWords();
    });
    // report modal
    $all('[data-wor-report-close]').forEach(function (b) { b.addEventListener('click', closeReport); });
    document.addEventListener('click', function (e) {
      var el = e.target.closest && e.target.closest('[data-wor-report-type]');
      if (el) {
        var t = el.getAttribute('data-wor-report-type');
        var i = reportSelected.indexOf(t);
        if (i === -1) reportSelected.push(t); else reportSelected.splice(i, 1);
        renderReportTypes();
        var sub = $('[data-wor-report-submit]');
        if (sub) sub.disabled = reportSelected.length === 0;
      }
    });
    var det = $('[data-wor-report-details]');
    det && det.addEventListener('input', function () { var c = $('[data-wor-report-details-count]'); if (c) c.textContent = String(det.value.length); });
    var repSub = $('[data-wor-report-submit]');
    repSub && repSub.addEventListener('click', function () {
      var details = (($('[data-wor-report-details]') || {}).value || '').trim();
      if (!reportSelected.length) return;
      send({ t: 'report', types: reportSelected.slice(), details: details });
      reportSelected = [];
      renderReportTypes();
      if (det) det.value = '';
      var cnt = $('[data-wor-report-details-count]');
      if (cnt) cnt.textContent = '0';
      repSub.disabled = true;
      closeReport();
    });
    // text panel ranges (± buttons + drag) — also the coloring panel size ranges
    [['worRangeFontSize', 'fontSize', 0, 'px'], ['worRangeLineHeight', 'lineHeight', 2, ''], ['worRangeWordSpacing', 'wordSpacing', 0, 'px'], ['worRangeBrightness', 'brightness', 2, ''],
     ['worRangeDialogueSize', 'dialogueSize', 0, '%'], ['worRangeMarkdownSize', 'markdownSize', 0, '%'], ['worRangeBracketSize', 'bracketSize', 0, '%'], ['worRangeCustomSize', 'customSize', 0, '%']].forEach(function (cfg) {
      var el = document.getElementById(cfg[0]);
      if (!el) return;
      var push = debounce(function (v) { var p = {}; p[cfg[1]] = v; send({ t: 'settings', patch: p }); }, 260);
      function applyVal(v) {
        v = cfg[2] ? Math.round(v * 100) / 100 : Math.round(v);
        S[cfg[1]] = v;
        el.value = v;
        var out = el.parentElement.querySelector('output');
        if (out) out.textContent = v + (cfg[3] || '');
        applyTypography();
        push(v);
      }
      el.addEventListener('input', function () { applyVal(cfg[2] ? parseFloat(el.value) : parseInt(el.value, 10)); });
      $all('[data-wor-range-step]', el.parentElement.parentElement).forEach(function (btn) {
        btn.addEventListener('click', function () {
          var parts = btn.getAttribute('data-wor-range-step').split(':');
          if (parts[0] !== cfg[0]) return;
          var delta = parseFloat(parts[1]) || 1;
          var min = parseFloat(el.min), max = parseFloat(el.max), step = parseFloat(el.step) || 1;
          var v = clamp((parseFloat(el.value) || 0) + delta, min, max);
          v = Math.round(v / step) * step;
          applyVal(v);
        });
      });
    });
    // text panel choices
    $all('#wor-reader-panel-text [data-wor-weight] button').forEach(function (b) {
      b.addEventListener('click', function () {
        S.fontWeight = b.getAttribute('data-value');
        setActiveChoice('#wor-reader-panel-text [data-wor-weight]', S.fontWeight);
        applyTypography();
        send({ t: 'settings', patch: { fontWeight: S.fontWeight } });
      });
    });
    $all('#wor-reader-panel-text [data-wor-direction] button').forEach(function (b) {
      b.addEventListener('click', function () {
        S.direction = b.getAttribute('data-value');
        setActiveChoice('#wor-reader-panel-text [data-wor-direction]', S.direction);
        applyTypography();
        send({ t: 'settings', patch: { direction: S.direction } });
      });
    });
    // font panel
    var fontSearch = $('#worFontSearch');
    fontSearch && fontSearch.addEventListener('input', function () {
      var q = fontSearch.value.trim().toLowerCase();
      $all('[data-wor-font-choice]').forEach(function (b) {
        var name = (b.getAttribute('data-name') || '').toLowerCase();
        b.style.display = (!q || name.indexOf(q) !== -1) ? '' : 'none';
      });
    });
    $all('[data-wor-font-choice]').forEach(function (b) {
      b.addEventListener('click', function () {
        S.fontValue = b.getAttribute('data-value');
        setActiveChoice('[data-wor-font-choice]', S.fontValue);
        applyTypography();
        send({ t: 'settings', patch: { fontValue: S.fontValue } });
      });
    });
    // background presets + custom
    $all('[data-wor-bg-preset]').forEach(function (b) {
      b.addEventListener('click', function () {
        var v = b.getAttribute('data-value');
        S.bgPreset = v; customColors = false;
        for (var i = 0; i < BG_PRESETS.length; i++) {
          if (BG_PRESETS[i].value === v) { S.bgColor = BG_PRESETS[i].bg; S.textColor = BG_PRESETS[i].text; }
        }
        applySettingsUI();
        send({ t: 'settings', patch: { bgColor: S.bgColor, textColor: S.textColor, bgPreset: S.bgPreset, customColors: false } });
      });
    });
    var customToggle = $('[data-wor-background-custom-toggle]');
    customToggle && customToggle.addEventListener('click', function () {
      customColors = !customColors;
      applySettingsUI();
      send({ t: 'settings', patch: { bgColor: S.bgColor, textColor: S.textColor, customColors: customColors } });
    });
    pickers.bg = makePicker('wor-picker-bg', function (hx) { S.bgColor = hx; customColors = true; applyTheme(); sendDebouncedBg(hx); }, S.bgColor || '#000000');
    pickers.text = makePicker('wor-picker-text', function (hx) { S.textColor = hx; customColors = true; applyTheme(); sendDebouncedText(hx); }, S.textColor || '#ffffff');
    pickers.progress = makePicker('wor-reader-chapter-progress-color-picker', function (hx) { S.progressBarColor = hx; applyProgressBar(); sendDebouncedProgress(hx); }, S.progressBarColor || '#00ffff');
    var progColorOpen = $('[data-wor-chapter-progress-color-open]');
    progColorOpen && progColorOpen.addEventListener('click', function () {
      var p = $('#wor-reader-chapter-progress-color-picker');
      if (p) p.hidden = !p.hidden;
      setTimeout(function () { pickers.progress && pickers.progress.set(S.progressBarColor || '#00ffff'); }, 60);
    });
    // switches
    $all('[data-wor-switch]').forEach(function (sw) {
      sw.addEventListener('click', function () {
        var key = sw.getAttribute('data-wor-switch');
        var map = {
          continuous: 'continuousMode', autoscroll: 'autoScroll', keepawake: 'keepAwake', hidetitle: 'hideTitle', taptoggle: 'tapToToggle',
          dialogue: 'enableDialogue', markdown: 'enableMarkdown', bracket: 'enableBracket', custom: 'enableCustom',
          hidequotes: 'hideQuotes', hidemarkdown: 'hideMarkdownMarks', hidebrackets: 'hideBracketMarks', hidecustom: 'hideCustomMarks'
        };
        var prop = map[key];
        if (!prop) return;
        S[prop] = !S[prop];
        setSwitch('[data-wor-switch="' + key + '"]', S[prop]);
        if (prop === 'autoScroll') updateAutoScroll();
        if (prop === 'hideTitle') document.body.classList.toggle('wor-hide-chapter-title', !!S.hideTitle);
        if (['enableDialogue', 'enableMarkdown', 'enableBracket', 'enableCustom'].indexOf(prop) !== -1) updateFmtCards();
        var p = {}; p[prop] = S[prop];
        send({ t: 'settings', patch: p });
      });
    });
    // coloring panel: delimiter style chips (quote / markdown / bracket)
    var FMT_STYLE_KEYS = { quote: 'selectedQuoteStyle', markdown: 'selectedMarkdownStyle', bracket: 'selectedBracketStyle' };
    $all('[data-wor-fmt-style]').forEach(function (wrap) {
      var group = wrap.getAttribute('data-wor-fmt-style');
      var key = FMT_STYLE_KEYS[group];
      if (!key) return;
      $all('.wor-style-chip', wrap).forEach(function (b) {
        b.addEventListener('click', function () {
          S[key] = b.getAttribute('data-value');
          setActiveChoice('[data-wor-fmt-style="' + group + '"]', S[key]);
          var p = {}; p[key] = S[key];
          send({ t: 'settings', patch: p });
        });
      });
    });
    // coloring panel: color swatches
    document.addEventListener('click', function (e) {
      var d = e.target.closest && e.target.closest('[data-wor-color-dot]');
      if (!d) return;
      var key = d.getAttribute('data-key');
      var val = d.getAttribute('data-value');
      if (!key || !val) return;
      S[key] = val;
      updateColorDots(key, val);
      var p = {}; p[key] = val;
      send({ t: 'settings', patch: p });
    });
    // coloring panel: custom delimiter marks
    var coInput = $('#worCustomOpenMark'), ccInput = $('#worCustomCloseMark');
    var pushCustomMarks = debounce(function () {
      send({ t: 'settings', patch: { customOpenMark: (coInput && coInput.value) || '', customCloseMark: (ccInput && ccInput.value) || '' } });
    }, 600);
    coInput && coInput.addEventListener('input', pushCustomMarks);
    ccInput && ccInput.addEventListener('input', pushCustomMarks);
    var progToggle = $('[data-wor-chapter-progress-toggle]');
    progToggle && progToggle.addEventListener('click', function () {
      S.showProgressBar = S.showProgressBar === false;
      setSwitch('[data-wor-chapter-progress-toggle]', S.showProgressBar !== false);
      applyProgressBar();
      send({ t: 'settings', patch: { showProgressBar: S.showProgressBar !== false } });
    });
    // admin tools
    $all('[data-wor-tool]').forEach(function (b) {
      b.addEventListener('click', function () { send({ t: 'tool', tool: b.getAttribute('data-wor-tool') }); });
    });
    // scroll / touch
    window.addEventListener('scroll', onScroll, { passive: true });
    document.addEventListener('touchstart', function () {
      lastTouchAt = Date.now();
      userTouched = true;
      touchStartScrollY = window.scrollY || 0;
    }, { passive: true });
    // author card click
    var authorCard = $('[data-wor-author-card]');
    authorCard && authorCard.addEventListener('click', function () { send({ t: 'profile' }); });
  }

  // ============================ receive (RN -> web) ============================
  function receive(msg) {
    try {
      var kind = msg.kind;
      if (kind === 'settings') {
        for (var k in msg.settings) if (Object.prototype.hasOwnProperty.call(msg.settings, k)) S[k] = msg.settings[k];
        if (msg.settings.customColors !== undefined) customColors = !!msg.settings.customColors;
        applySettingsUI();
      }
      else if (kind === 'chapter') {
        CH = msg;
        favOn = !!msg.isFavorite;
        // when the chapter is re-rendered in place (formatting change), keep the
        // reader at the exact position they were reading instead of resetting
        var keepY = msg.keepScroll ? (window.scrollY || window.pageYOffset || 0) : 0;
        var link = $('#worNovelLink');
        if (link) link.textContent = msg.novelTitle || '';
        var h1 = $('#worChapterTitle');
        if (h1) h1.textContent = msg.title || ('فصل ' + msg.number);
        var surface = $('#worTextSurface');
        if (surface) surface.innerHTML = msg.html || '';
        var strong = $('.wor-reader-dock__progress-copy strong');
        var pct = $('.wor-reader-dock__progress-copy span');
        if (strong) strong.textContent = msg.number + '/' + (msg.total || '—');
        if (pct) pct.textContent = msg.percent || '';
        var prog = $('.wor-reader-dock__progress');
        if (prog) prog.style.setProperty('--wor-reader-progress-value', (msg.percentValue || 0) + '%');
        var prev = $('[data-wor-reader-nav-prev]');
        var next = $('[data-wor-reader-nav-next]');
        prev && (msg.hasPrev ? prev.removeAttribute('disabled') : prev.setAttribute('disabled', ''));
        next && (msg.hasNext ? next.removeAttribute('disabled') : next.setAttribute('disabled', ''));
        var badge = $('[data-wor-comments-badge]');
        if (badge) {
          if (msg.commentCount > 0) { badge.hidden = false; badge.textContent = msg.commentCount > 99 ? '99+' : String(msg.commentCount); }
          else badge.hidden = true;
        }
        var trig = $('#worCommentsTriggerText');
        if (trig) trig.textContent = 'عرض التعليقات (' + (msg.commentCount || 0) + ')';
        var trigWrap = $('#worCommentsTriggerWrap');
        if (trigWrap) trigWrap.style.display = msg.showCommentsButton ? '' : 'none';
        var authorWrap = $('#worAuthorCardWrap');
        if (authorWrap) authorWrap.style.display = msg.authorCard ? '' : 'none';
        if (msg.authorCard) {
          var an = $('#worAuthorName');
          if (an) an.textContent = msg.authorCard.name || '';
          var av = $('#worAuthorAvatar');
          if (av) av.src = msg.authorCard.avatar || '';
          var bn = $('#worAuthorBanner');
          if (bn) bn.style.backgroundImage = msg.authorCard.banner ? ('url(' + msg.authorCard.banner + ')') : 'none';
        }
        var repLab = $('#worReportChapterLabel');
        if (repLab) repLab.textContent = 'الفصل ' + msg.number;
        var foot = $('#worContinuousFooter');
        if (foot) foot.textContent = '';
        window.__worEnd = false; window.__worNeedLock = false;
        if (msg.keepScroll) {
          pendingScroll = 0;
          window.scrollTo(0, keepY);
        } else {
          pendingScroll = msg.scrollOffset || 0;
          restoreScroll();
        }
        updateFavUI();
        renderChapters();
        renderSearch();
      }
      else if (kind === 'appendChapter') {
        var surface2 = $('#worTextSurface');
        if (surface2) {
          var tmp = document.createElement('div');
          tmp.innerHTML = msg.html;
          while (tmp.firstChild) surface2.appendChild(tmp.firstChild);
        }
        window.__worNeedLock = false;
      }
      else if (kind === 'endReached') {
        window.__worEnd = true;
        var foot2 = $('#worContinuousFooter');
        if (foot2) foot2.textContent = '— وصلت إلى آخر فصل متاح —';
      }
      else if (kind === 'loadingNext') {
        var foot3 = $('#worContinuousFooter');
        if (foot3) foot3.textContent = msg.value ? 'جاري جلب الفصل التالي…' : '';
      }
      else if (kind === 'chapters') {
        CHAPTERS = msg.list || [];
        renderChapters();
        renderSearch();
      }
      else if (kind === 'words') {
        WORDS.folders = msg.folders || [];
        WORDS.activeId = msg.activeId || (WORDS.folders[0] && WORDS.folders[0].id) || null;
        WORDS.editing = null;
        renderWords();
      }
      else if (kind === 'wordsSaved') {
        WORDS.folders = msg.folders || [];
        WORDS.activeId = msg.activeId || WORDS.activeId;
        WORDS.editing = null;
        var o = $('#worWordsOriginal'), r = $('#worWordsReplacement');
        if (o) o.value = '';
        if (r) r.value = '';
        renderWords();
        toast(msg.toast || 'تم الحفظ');
      }
      else if (kind === 'commentCount') {
        var badge2 = $('[data-wor-comments-badge]');
        if (badge2) {
          if (msg.count > 0) { badge2.hidden = false; badge2.textContent = msg.count > 99 ? '99+' : String(msg.count); }
          else badge2.hidden = true;
        }
        var trig2 = $('#worCommentsTriggerText');
        if (trig2) trig2.textContent = 'عرض التعليقات (' + (msg.count || 0) + ')';
      }
      else if (kind === 'fav') {
        favOn = !!msg.value;
        updateFavUI();
      }
      else if (kind === 'scrollTo') {
        pendingScroll = msg.offset || 0;
        restoreScroll();
      }
      else if (kind === 'backPress') {
        var sheet1 = $('#wor-reader-chapters-sheet');
        var sheet2 = $('#wor-reader-words-sheet');
        var search = $('#wor-search');
        var report = $('[data-wor-chapter-report-modal]');
        var drawer = $('#wor-drawer');
        if (sheet1 && !sheet1.hidden) closeChaptersSheet();
        else if (sheet2 && !sheet2.hidden) closeWordsSheet();
        else if (search && !search.hidden) closeSearch();
        else if (report && !report.hidden) closeReport();
        else if (drawer && drawer.classList.contains('is-open')) closeDrawer();
        else send({ t: 'exit' });
      }
      else if (kind === 'toast') toast(msg.text || '');
    } catch (e) {
      send({ t: 'error', message: String(e && e.message || e) });
    }
  }

  function restoreScroll() {
    if (!pendingScroll || pendingScroll <= 0) return;
    var y = pendingScroll;
    // never fight the reader's own finger: if they already touched the page,
    // skip the remaining restore attempts instead of yanking the scroll away
    function go() { if (!userTouched) window.scrollTo(0, y); }
    setTimeout(go, 60);
    setTimeout(go, 320);
    setTimeout(go, 900);
    pendingScroll = 0;
  }

  window.__wor = { receive: receive, send: send, setDock: setDock, toast: toast };

  // ============================ boot ============================
  function measureTopbar() {
    var tb = $('.wor-topbar');
    if (tb) document.documentElement.style.setProperty('--wor-topbar-h', (tb.offsetHeight || 58) + 'px');
    if (dockOpen) setDock(true);
  }
  function boot() {
    wire();
    preloadFonts();
    applySettingsUI();
    setDock(S.dockOpen !== false);
    renderReportTypes();
    if (USER.role === 'admin') {
      var adm = $('[data-wor-admin-tools]');
      adm && adm.removeAttribute('hidden');
    }
    send({ t: 'ready' });
    var loader = $('#worBootLoading');
    setTimeout(function () { loader && loader.classList.add('is-done'); }, 200);
    setTimeout(measureTopbar, 250);
    setTimeout(measureTopbar, 1000);
    window.addEventListener('resize', measureTopbar);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
`;
}

// ---------------------------------------------------------------------------
// Shell document
// ---------------------------------------------------------------------------
const escHtml = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// JSON embedded directly inside <script> — keep "</" from closing the tag.
const safeJson = (obj) => JSON.stringify(obj).replace(/<\//g, '<\\/');

export function buildWorShell({ safeTop = 0, safeBottom = 0, novelTitle = '', novelCover = '', userName = '', userRole = '', initialSettings = {} }) {
  const settingsJson = safeJson({ ...initialSettings, safeTop, safeBottom });
  const userJson = safeJson({ name: userName || '', role: userRole || '' });
  const fontsJson = safeJson(WOR_FONTS);
  const presetsJson = safeJson(WOR_BG_PRESETS);
  const reportTypesJson = safeJson(REPORT_TYPES);
  const title = escHtml(novelTitle);
  const cover = escHtml(novelCover);

  const script = bridgeScript()
    .split("'__WOR_SETTINGS__'").join(settingsJson)
    .split("'__WOR_USER__'").join(userJson)
    .split("'__WOR_FONTS__'").join(fontsJson)
    .split("'__WOR_BG_PRESETS__'").join(presetsJson)
    .split("'__WOR_REPORT_TYPES__'").join(reportTypesJson);

  const coverImg = novelCover
    ? `<img src="${cover}" alt="" width="64" height="64" loading="lazy" decoding="async">`
    : '';

  const colorDots = (key) => WOR_FORMAT_COLORS.map(c => (
    `<button type="button" class="wor-color-dot" style="background:${c}" data-wor-color-dot data-key="${key}" data-value="${c}" aria-label="${c}"></button>`
  )).join('');

  return `<!DOCTYPE html>
<html dir="rtl" lang="ar" data-wor-theme="custom">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
<style>
  @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;700;900&family=Tajawal:wght@400;700;900&family=Amiri:wght@400;700&family=Noto+Naskh+Arabic:wght@400;700&family=Readex+Pro:wght@300;400;600;700&family=Scheherazade+New:wght@400;700&display=swap');
</style>
<style>${WOR_CSS}</style>
<style>${WOR_APP_CSS}</style>
</head>
<body class="wor-body single-wor_chapter wor_chapter-template-default">

<!-- boot loader -->
<div class="wor-boot-loading" id="worBootLoading"><div class="wor-boot-spinner"></div></div>

<!-- drawer -->
<div class="wor-drawer-backdrop" data-wor-drawer-backdrop hidden></div>
<aside class="wor-drawer" id="wor-drawer" aria-hidden="true" inert>
  <div class="wor-drawer__head">
    <a class="wor-brand" href="#" data-wor-nav="novel"><span>${title}</span></a>
    <button class="wor-icon-btn" type="button" data-wor-drawer-close aria-label="إغلاق القائمة">
      <span aria-hidden="true"><svg class="wor-ui-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6.4 5 5 6.4 10.6 12 5 17.6 6.4 19 12 13.4 17.6 19 19 17.6 13.4 12 19 6.4 17.6 5 12 10.6z"></path></svg></span>
    </button>
  </div>
  <div class="wor-drawer__account-state">
    <div class="wor-drawer-user">
      <span class="wor-drawer-user__avatar">${(userName || 'ق').trim().charAt(0)}</span>
      <span class="wor-drawer-user__meta">
        <strong>${userName || 'قارئ زائر'}</strong>
        <small>${userRole === 'admin' ? 'مدير التطبيق' : 'قارئ'}</small>
      </span>
    </div>
  </div>
  <nav class="wor-drawer__nav wor-drawer__nav--modern" aria-label="القائمة الجانبية">
    <a href="#" data-wor-nav="novel"><span>صفحة الرواية</span></a>
    <a href="#" data-wor-nav="home"><span>الرئيسية</span></a>
    <a href="#" data-wor-nav="downloads"><span>التنزيلات</span></a>
    <a href="#" data-wor-nav="settings"><span>الإعدادات</span></a>
    <a href="#" data-wor-nav="contact"><span>تواصل معنا</span></a>
    <a href="#" data-wor-nav="about"><span>حول التطبيق</span></a>
  </nav>
</aside>

<!-- search -->
<div class="wor-search" id="wor-search" hidden aria-hidden="true" role="dialog" aria-modal="true" aria-label="البحث">
  <div class="wor-search__panel">
    <form class="wor-search__form" role="search" onsubmit="return false;">
      <label class="screen-reader-text" for="wor-search-input">بحث</label>
      <input id="wor-search-input" type="search" placeholder="ابحث عن فصل..." autocomplete="off">
      <button type="submit">بحث</button>
      <button type="button" data-wor-search-close aria-label="إغلاق البحث">×</button>
    </form>
    <div class="wor-search__suggestions" role="listbox" aria-label="نتائج البحث">
      <div class="wor-search__status" data-wor-search-status></div>
      <div class="wor-search__results" id="worSearchResults" data-wor-search-results></div>
    </div>
  </div>
</div>

<!-- reading page -->
<main class="wor-reader-main wor-page">
  <article class="wor-reading-page" data-wor-continuous-chapter="1">
    <header class="wor-reading-page__header">
      <a class="wor-reading-page__novel" href="#" id="worNovelLink" data-wor-nav="novel"></a>
      <h1 id="worChapterTitle"></h1>
    </header>
    <div class="wor-reader-text-surface" id="worTextSurface" data-wor-reader-text></div>
    <div class="wor-continuous-footer" id="worContinuousFooter"></div>
    <div class="wor-end-mark">◆ ◆ ◆</div>
    <div class="wor-author-section-wrapper" id="worAuthorCardWrap" style="display:none">
      <div class="wor-author-section-title">الناشر</div>
      <div class="wor-author-card" data-wor-author-card>
        <div class="wor-author-banner" id="worAuthorBanner"></div>
        <div class="wor-author-overlay"></div>
        <div class="wor-author-content">
          <div class="wor-author-avatar-wrapper"><img id="worAuthorAvatar" class="wor-author-avatar-img" alt="" /></div>
          <div class="wor-author-name" id="worAuthorName"></div>
        </div>
      </div>
    </div>
    <div class="wor-comments-trigger-wrap" id="worCommentsTriggerWrap" style="display:none">
      <button class="wor-comments-trigger" type="button" data-wor-comments-btn>
        <span>💬</span>
        <span id="worCommentsTriggerText">عرض التعليقات</span>
      </button>
    </div>
  </article>
</main>

<!-- chapter progress bar -->
<div class="wor-reader-chapter-progress" data-wor-reader-chapter-progress aria-hidden="false">
  <span class="wor-reader-chapter-progress__track" aria-hidden="true">
    <span class="wor-reader-chapter-progress__fill" data-wor-reader-chapter-progress-fill style="width:0%"></span>
  </span>
</div>

<!-- dock -->
<section class="wor-reader-dock" data-wor-reader-dock data-wor-reader-dock-state="open" aria-label="أدوات قراءة الفصل" data-wor-reader-active-panel="book">
  <div class="wor-reader-dock__top wor-reader-dock__top--book">
    <a class="wor-reader-dock__nav wor-reader-dock__nav--next" href="#" data-wor-reader-nav-next>
      <span class="wor-reader-dock__nav-icon" aria-hidden="true"><svg class="wor-reader-dock__svg" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M5 12h14M14 7l5 5-5 5" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"></path></svg></span>
      <strong>التالي</strong>
    </a>
    <div class="wor-reader-dock__progress" aria-label="تقدمك في الرواية" style="--wor-reader-progress-value: 0%;">
      <div class="wor-reader-dock__progress-copy">
        <strong>—</strong>
        <span></span>
      </div>
      <span class="wor-reader-dock__progress-track" aria-hidden="true"><span class="wor-reader-dock__progress-fill"></span></span>
    </div>
    <a class="wor-reader-dock__nav wor-reader-dock__nav--previous" href="#" data-wor-reader-nav-prev>
      <strong>السابق</strong>
      <span class="wor-reader-dock__nav-icon" aria-hidden="true"><svg class="wor-reader-dock__svg" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M19 12H5M10 7l-5 5 5 5" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"></path></svg></span>
    </a>
  </div>

  <!-- panel: book -->
  <div class="wor-reader-dock__panel wor-reader-dock__panel--book" id="wor-reader-panel-book" data-wor-reader-panel="book" role="tabpanel">
    <div class="wor-reader-dock__actions">
      <a class="wor-reader-dock__action wor-reader-dock__action--novel" href="#" data-wor-reader-dock-novel aria-label="صفحة الرواية">
        <span class="wor-reader-dock__cover" aria-hidden="true">${coverImg}</span>
        <strong>صفحة الرواية</strong>
      </a>
      <button class="wor-reader-dock__action" type="button" data-wor-reader-chapters-open aria-controls="wor-reader-chapters-sheet" aria-expanded="false">
        <span class="wor-reader-dock__mini-icon" aria-hidden="true"><svg class="wor-reader-dock__svg" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M9 6h10M9 12h10M9 18h10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"></path><circle cx="5" cy="6" r="1.35" fill="currentColor"></circle><circle cx="5" cy="12" r="1.35" fill="currentColor"></circle><circle cx="5" cy="18" r="1.35" fill="currentColor"></circle></svg></span>
        <strong>قائمة الفصول</strong>
      </button>
      <button class="wor-reader-dock__action wor-reader-dock__action--favorite" type="button" data-wor-favorite-toggle aria-pressed="false" aria-label="إضافة إلى المفضلة">
        <span class="wor-reader-dock__mini-icon" data-wor-favorite-icon aria-hidden="true"><svg class="wor-reader-dock__svg wor-reader-heart-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path class="wor-reader-heart-icon__fill" d="M12 20.3 4.6 13A5 5 0 0 1 11.7 6l.3.3.3-.3a5 5 0 0 1 7.1 7L12 20.3Z" fill="currentColor" opacity="0"></path><path d="M12 20.3 4.6 13A5 5 0 0 1 11.7 6l.3.3.3-.3a5 5 0 0 1 7.1 7L12 20.3Z" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"></path></svg></span>
        <strong data-wor-favorite-label>المفضلة</strong>
      </button>
      <button class="wor-reader-dock__action" type="button" data-wor-reader-words-open aria-controls="wor-reader-words-sheet" aria-expanded="false">
        <span class="wor-reader-dock__mini-icon" aria-hidden="true"><svg class="wor-reader-dock__svg" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M5 7h12.5M14.5 4l3 3-3 3M19 17H6.5M9.5 20l-3-3 3-3" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"></path></svg></span>
        <strong>تغيير الكلمات</strong>
      </button>
    </div>
  </div>

  <!-- panel: text -->
  <div class="wor-reader-dock__panel wor-reader-dock__panel--text" id="wor-reader-panel-text" data-wor-reader-panel="text" role="tabpanel" style="display:none">
    <div class="wor-reader-text-settings">
      <div class="wor-reader-text-setting">
        <h3>حجم الخط</h3>
        <div class="wor-reader-range-control">
          <button type="button" data-wor-range-step="worRangeFontSize:-1">−</button>
          <input id="worRangeFontSize" type="range" min="14" max="34" step="1" value="18">
          <output>18px</output>
          <button type="button" data-wor-range-step="worRangeFontSize:1">+</button>
        </div>
      </div>
      <div class="wor-reader-text-setting">
        <h3>تباعد الأسطر</h3>
        <div class="wor-reader-range-control">
          <button type="button" data-wor-range-step="worRangeLineHeight:-0.1">−</button>
          <input id="worRangeLineHeight" type="range" min="1.5" max="3" step="0.1" value="2.3">
          <output>2.3</output>
          <button type="button" data-wor-range-step="worRangeLineHeight:0.1">+</button>
        </div>
      </div>
      <div class="wor-reader-text-setting">
        <h3>تباعد الكلمات</h3>
        <div class="wor-reader-range-control">
          <button type="button" data-wor-range-step="worRangeWordSpacing:-1">−</button>
          <input id="worRangeWordSpacing" type="range" min="-2" max="10" step="1" value="0">
          <output>0px</output>
          <button type="button" data-wor-range-step="worRangeWordSpacing:1">+</button>
        </div>
      </div>
      <div class="wor-reader-text-setting">
        <h3>سطوع الخط</h3>
        <div class="wor-reader-range-control">
          <button type="button" data-wor-range-step="worRangeBrightness:-0.05">−</button>
          <input id="worRangeBrightness" type="range" min="0.4" max="1.5" step="0.05" value="1.05">
          <output>1.05</output>
          <button type="button" data-wor-range-step="worRangeBrightness:0.05">+</button>
        </div>
      </div>
      <div class="wor-reader-text-setting wor-reader-text-setting--choices">
        <h3>سمك الخط</h3>
        <div class="wor-reader-text-choices" data-wor-weight>
          <button type="button" data-value="300">خفيف</button>
          <button type="button" data-value="400" class="is-active">متوسط</button>
          <button type="button" data-value="700">عريض</button>
        </div>
      </div>
      <div class="wor-reader-text-setting wor-reader-text-setting--choices">
        <h3>اتجاه النص</h3>
        <div class="wor-reader-text-choices" data-wor-direction>
          <button type="button" data-value="rtl" class="is-active">RTL</button>
          <button type="button" data-value="center">وسط</button>
          <button type="button" data-value="ltr">LTR</button>
        </div>
      </div>
    </div>
  </div>

  <!-- panel: font -->
  <div class="wor-reader-dock__panel wor-reader-dock__panel--font" id="wor-reader-panel-font" data-wor-reader-panel="font" role="tabpanel" style="display:none">
    <div class="wor-reader-font-tools">
      <label class="wor-reader-font-search">
        <span class="screen-reader-text">البحث عن خط</span>
        <input id="worFontSearch" type="search" placeholder="ابحث عن خط بالاسم..." autocomplete="off">
      </label>
      <div class="wor-reader-font-settings" id="worFontChoices">
        ${WOR_FONTS.map((f, i) => `
        <button class="wor-reader-font-choice${i === 0 ? ' is-active' : ''}" type="button" data-wor-font-choice data-value="${f.value}" data-name="${f.name}" aria-pressed="${i === 0}" style="font-family:${escHtml(f.family === 'inherit' ? 'var(--wor-ui-font)' : f.family)}">
          <strong>${f.name}</strong>
        </button>`).join('')}
      </div>
    </div>
  </div>

  <!-- panel: background -->
  <div class="wor-reader-dock__panel wor-reader-dock__panel--background" id="wor-reader-panel-background" data-wor-reader-panel="background" role="tabpanel" style="display:none">
    <div class="wor-reader-background-settings">
      <div class="wor-reader-background-presets">
        ${WOR_BG_PRESETS.map(p => `
        <button class="wor-reader-background-preset" type="button" data-wor-bg-preset data-value="${p.value}">
          <span class="wor-reader-background-preset__sample" style="background:${p.bg};color:${p.text}">Aa</span>
          <strong>${p.name}</strong>
        </button>`).join('')}
      </div>
      <div class="wor-reader-background-custom">
        <div class="wor-reader-background-custom__head">
          <div class="wor-reader-background-custom__copy">
            <h3>تخصيص الألوان</h3>
            <p>اختر لون الخلفية ولون النص كما تريد، وسيتم تطبيقهما مباشرة على الفصل.</p>
          </div>
          <button class="wor-reader-background-custom__toggle is-inactive" type="button" data-wor-background-custom-toggle>
            <span class="wor-reader-background-custom__toggle-dot"></span>
            <span class="wor-reader-background-custom__toggle-label" data-wor-background-custom-toggle-label>غير مفعّل</span>
          </button>
        </div>
        <div class="wor-reader-background-palette" style="display:none">
          <section class="wor-reader-background-picker" id="wor-picker-bg">
            <div class="wor-reader-background-picker__head">
              <div class="wor-reader-background-picker__meta">
                <i class="wor-reader-background-picker__swatch" data-wor-picker-swatch></i>
                <div>
                  <h4>لون الخلفية</h4>
                  <span data-wor-picker-hex>#000000</span>
                </div>
              </div>
            </div>
            <div class="wor-reader-background-picker__body">
              <div class="wor-reader-background-picker__canvas" aria-label="تخصيص لون الخلفية"><canvas></canvas><span class="wor-reader-background-picker__handle"></span></div>
              <div class="wor-reader-background-picker__side">
                <label class="wor-reader-background-picker__hue">
                  <span>درجة اللون</span>
                  <input type="range" min="0" max="360" step="1" value="0" aria-label="درجة لون الخلفية">
                </label>
                <label class="wor-reader-background-picker__hex">
                  <span>HEX</span>
                  <input type="text" placeholder="#000000" value="#000000">
                </label>
              </div>
            </div>
          </section>
          <section class="wor-reader-background-picker" id="wor-picker-text">
            <div class="wor-reader-background-picker__head">
              <div class="wor-reader-background-picker__meta">
                <i class="wor-reader-background-picker__swatch" data-wor-picker-swatch></i>
                <div>
                  <h4>لون النص</h4>
                  <span data-wor-picker-hex>#FFFFFF</span>
                </div>
              </div>
            </div>
            <div class="wor-reader-background-picker__body">
              <div class="wor-reader-background-picker__canvas" aria-label="تخصيص لون النص"><canvas></canvas><span class="wor-reader-background-picker__handle"></span></div>
              <div class="wor-reader-background-picker__side">
                <label class="wor-reader-background-picker__hue">
                  <span>درجة اللون</span>
                  <input type="range" min="0" max="360" step="1" value="0" aria-label="درجة لون النص">
                </label>
                <label class="wor-reader-background-picker__hex">
                  <span>HEX</span>
                  <input type="text" placeholder="#FFFFFF" value="#FFFFFF">
                </label>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  </div>

  <!-- panel: settings -->
  <div class="wor-reader-dock__panel wor-reader-dock__panel--settings" id="wor-reader-panel-settings" data-wor-reader-panel="settings" role="tabpanel" style="display:none">
    <div class="wor-reader-extra-settings" aria-label="إعدادات القراءة الإضافية">
      <div class="wor-reader-extra-card wor-reader-extra-card--chapter-progress">
        <div class="wor-reader-extra-card__head">
          <div class="wor-reader-extra-card__copy"><h3>شريط تقدم الفصل</h3></div>
          <button type="button" class="wor-reader-switch is-active" data-wor-chapter-progress-toggle aria-pressed="true">مفعّل</button>
        </div>
        <div class="wor-reader-chapter-progress-setting">
          <div class="wor-reader-chapter-progress-setting__row">
            <span>لون الشريط</span>
            <button type="button" class="wor-reader-chapter-progress-setting__color" data-wor-chapter-progress-color-open aria-expanded="false" aria-controls="wor-reader-chapter-progress-color-picker">
              <i></i><code>#00FFFF</code>
            </button>
          </div>
          <div class="wor-reader-chapter-progress-color-picker" id="wor-reader-chapter-progress-color-picker" hidden>
            <div class="wor-reader-chapter-progress-color-picker__canvas" aria-label="تخصيص لون شريط تقدم الفصل"><canvas></canvas><span class="wor-picker-handle wor-reader-background-picker__handle"></span></div>
            <div class="wor-reader-chapter-progress-color-picker__controls">
              <label class="wor-reader-chapter-progress-color-picker__hue">
                <span>درجة اللون</span>
                <input type="range" min="0" max="360" step="1" value="180" aria-label="درجة لون شريط التقدم">
              </label>
              <label class="wor-reader-chapter-progress-color-picker__hex">
                <span>HEX</span>
                <input type="text" placeholder="#00FFFF" value="#00FFFF">
              </label>
            </div>
          </div>
        </div>
      </div>
      <div class="wor-reader-extra-card wor-reader-extra-card--compact">
        <div class="wor-reader-extra-card__head">
          <h3>القراءة المتصلة</h3>
          <button type="button" class="wor-reader-switch" data-wor-switch="continuous">مغلق</button>
        </div>
        <p>تضيف الفصل التالي داخل الصفحة تلقائياً أثناء التمرير.</p>
      </div>
      <div class="wor-reader-extra-card wor-reader-extra-card--compact">
        <div class="wor-reader-extra-card__head">
          <h3>النزول التلقائي</h3>
          <button type="button" class="wor-reader-switch" data-wor-switch="autoscroll">مغلق</button>
        </div>
        <p>يمرر الفصل للأسفل ببطء تلقائياً أثناء القراءة.</p>
      </div>
      <div class="wor-reader-extra-card wor-reader-extra-card--compact">
        <div class="wor-reader-extra-card__head">
          <h3>البقاء مستيقظاً</h3>
          <button type="button" class="wor-reader-switch" data-wor-switch="keepawake">مغلق</button>
        </div>
        <p>يمنع إطفاء الشاشة أثناء القراءة.</p>
      </div>
      <div class="wor-reader-extra-card wor-reader-extra-card--compact">
        <div class="wor-reader-extra-card__head">
          <h3>إخفاء عنوان الفصل</h3>
          <button type="button" class="wor-reader-switch" data-wor-switch="hidetitle">مغلق</button>
        </div>
      </div>
      <div class="wor-reader-extra-card wor-reader-extra-card--compact">
        <div class="wor-reader-extra-card__head">
          <h3>فتح الأدوات بلمس الشاشة</h3>
          <button type="button" class="wor-reader-switch is-active" data-wor-switch="taptoggle">مفعّل</button>
        </div>
      </div>
      <div class="wor-reader-extra-card wor-reader-extra-card--compact" data-wor-admin-tools hidden>
        <div class="wor-reader-extra-card__head">
          <h3>أدوات المدير</h3>
        </div>
        <p>أدوات إدارية خاصة بفريق التطبيق.</p>
        <div class="wor-reader-dock__actions" style="margin-top:10px">
          <button class="wor-reader-dock__action" type="button" data-wor-tool="cleaner">
            <strong>الحذف الشامل</strong>
          </button>
          <button class="wor-reader-dock__action" type="button" data-wor-tool="copyright">
            <strong>حقوق التطبيق</strong>
          </button>
        </div>
      </div>
    </div>
  </div>

  <!-- panel: coloring (التلوين) -->
  <div class="wor-reader-dock__panel wor-reader-dock__panel--color" id="wor-reader-panel-color" data-wor-reader-panel="color" role="tabpanel" style="display:none">
    <div class="wor-color-wrap">
      <p class="wor-color-hint">لوّن الكلمات المحصورة بين علامات تنصيص تختارها بنفسك، ويُطبق التنسيق فوراً على الفصل أثناء القراءة.</p>

      <div class="wor-fmt-card" data-wor-fmt-card="dialogue">
        <div class="wor-fmt-card__head">
          <h3>الحوار (علامات التنصيص)</h3>
          <button type="button" class="wor-reader-switch" data-wor-switch="dialogue">مغلق</button>
        </div>
        <span class="wor-fmt-card__label">نمط التنصيص</span>
        <div class="wor-style-row" data-wor-fmt-style="quote">
          <button type="button" class="wor-style-chip" data-value="all">بدون</button>
          <button type="button" class="wor-style-chip" data-value="guillemets">« »</button>
          <button type="button" class="wor-style-chip" data-value="curly">“ ”</button>
          <button type="button" class="wor-style-chip" data-value="straight">" "</button>
          <button type="button" class="wor-style-chip" data-value="single">‘ ’</button>
        </div>
        <span class="wor-fmt-card__label">اللون</span>
        <div class="wor-color-grid" data-wor-color-for="dialogueColor">${colorDots('dialogueColor')}</div>
        <span class="wor-fmt-card__label">حجم الحوار</span>
        <div class="wor-reader-range-control">
          <button type="button" data-wor-range-step="worRangeDialogueSize:-5">−</button>
          <input id="worRangeDialogueSize" type="range" min="80" max="150" step="5" value="100">
          <output>100%</output>
          <button type="button" data-wor-range-step="worRangeDialogueSize:5">+</button>
        </div>
        <div class="wor-fmt-card__head">
          <h3 class="wor-fmt-card__sub">إخفاء علامات التنصيص</h3>
          <button type="button" class="wor-reader-switch" data-wor-switch="hidequotes">مغلق</button>
        </div>
      </div>

      <div class="wor-fmt-card" data-wor-fmt-card="markdown">
        <div class="wor-fmt-card__head">
          <h3>العريض (علامات **)</h3>
          <button type="button" class="wor-reader-switch" data-wor-switch="markdown">مغلق</button>
        </div>
        <span class="wor-fmt-card__label">نمط العلامات</span>
        <div class="wor-style-row" data-wor-fmt-style="markdown">
          <button type="button" class="wor-style-chip" data-value="all">بدون</button>
          <button type="button" class="wor-style-chip" data-value="guillemets">« »</button>
          <button type="button" class="wor-style-chip" data-value="curly">“ ”</button>
          <button type="button" class="wor-style-chip" data-value="straight">" "</button>
          <button type="button" class="wor-style-chip" data-value="single">‘ ’</button>
        </div>
        <span class="wor-fmt-card__label">اللون</span>
        <div class="wor-color-grid" data-wor-color-for="markdownColor">${colorDots('markdownColor')}</div>
        <span class="wor-fmt-card__label">حجم العريض</span>
        <div class="wor-reader-range-control">
          <button type="button" data-wor-range-step="worRangeMarkdownSize:-5">−</button>
          <input id="worRangeMarkdownSize" type="range" min="80" max="150" step="5" value="100">
          <output>100%</output>
          <button type="button" data-wor-range-step="worRangeMarkdownSize:5">+</button>
        </div>
        <div class="wor-fmt-card__head">
          <h3 class="wor-fmt-card__sub">إخفاء علامات **</h3>
          <button type="button" class="wor-reader-switch" data-wor-switch="hidemarkdown">مغلق</button>
        </div>
      </div>

      <div class="wor-fmt-card" data-wor-fmt-card="bracket">
        <div class="wor-fmt-card__head">
          <h3>الأقواس [ ]</h3>
          <button type="button" class="wor-reader-switch" data-wor-switch="bracket">مغلق</button>
        </div>
        <span class="wor-fmt-card__label">نمط العلامات الداخلية</span>
        <div class="wor-style-row" data-wor-fmt-style="bracket">
          <button type="button" class="wor-style-chip" data-value="all">بدون</button>
          <button type="button" class="wor-style-chip" data-value="guillemets">« »</button>
          <button type="button" class="wor-style-chip" data-value="curly">“ ”</button>
          <button type="button" class="wor-style-chip" data-value="straight">" "</button>
          <button type="button" class="wor-style-chip" data-value="single">‘ ’</button>
        </div>
        <span class="wor-fmt-card__label">اللون</span>
        <div class="wor-color-grid" data-wor-color-for="bracketColor">${colorDots('bracketColor')}</div>
        <span class="wor-fmt-card__label">حجم الأقواس</span>
        <div class="wor-reader-range-control">
          <button type="button" data-wor-range-step="worRangeBracketSize:-5">−</button>
          <input id="worRangeBracketSize" type="range" min="80" max="150" step="5" value="110">
          <output>110%</output>
          <button type="button" data-wor-range-step="worRangeBracketSize:5">+</button>
        </div>
        <div class="wor-fmt-card__head">
          <h3 class="wor-fmt-card__sub">إخفاء علامات [ ]</h3>
          <button type="button" class="wor-reader-switch" data-wor-switch="hidebrackets">مغلق</button>
        </div>
      </div>

      <div class="wor-fmt-card" data-wor-fmt-card="custom">
        <div class="wor-fmt-card__head">
          <h3>علامات مخصصة</h3>
          <button type="button" class="wor-reader-switch" data-wor-switch="custom">مغلق</button>
        </div>
        <span class="wor-fmt-card__label">حدد علامتي الفتح والإغلاق كما تريد</span>
        <div class="wor-custom-marks">
          <input id="worCustomOpenMark" type="text" placeholder="علامة الفتح" autocomplete="off">
          <span class="wor-custom-marks__arrow">←</span>
          <input id="worCustomCloseMark" type="text" placeholder="علامة الإغلاق" autocomplete="off">
        </div>
        <span class="wor-fmt-card__label">اللون</span>
        <div class="wor-color-grid" data-wor-color-for="customColor">${colorDots('customColor')}</div>
        <span class="wor-fmt-card__label">الحجم</span>
        <div class="wor-reader-range-control">
          <button type="button" data-wor-range-step="worRangeCustomSize:-5">−</button>
          <input id="worRangeCustomSize" type="range" min="80" max="150" step="5" value="105">
          <output>105%</output>
          <button type="button" data-wor-range-step="worRangeCustomSize:5">+</button>
        </div>
        <div class="wor-fmt-card__head">
          <h3 class="wor-fmt-card__sub">إخفاء العلامات المخصصة</h3>
          <button type="button" class="wor-reader-switch" data-wor-switch="hidecustom">مغلق</button>
        </div>
      </div>
    </div>
  </div>

  <!-- panel: report -->
  <div class="wor-reader-dock__panel wor-reader-dock__panel--report" id="wor-reader-panel-report" data-wor-reader-panel="report" role="tabpanel" style="display:none">
    <div class="wor-reader-report-card">
      <div class="wor-reader-report-card__copy">
        <h3>الإبلاغ عن الفصل</h3>
        <div class="wor-reader-report-card__chapter" id="worReportChapterLabel">—</div>
      </div>
      <button class="wor-reader-report-card__button" type="button" data-wor-reader-report-open>
        <span aria-hidden="true">⚠️</span>
        <strong>إبلاغ</strong>
      </button>
    </div>
  </div>

  <!-- dock tabs -->
  <div class="wor-reader-dock__tabs" aria-label="أقسام أدوات القراءة">
    <button class="wor-reader-dock__tab is-active" type="button" data-wor-tab="book" id="wor-reader-tab-book">
      <span class="wor-reader-dock__tab-icon" aria-hidden="true"><svg class="wor-reader-dock__svg" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15.5a2.5 2.5 0 0 1-2.5 2.5H6.5A2.5 2.5 0 0 1 4 18.5v-13Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"></path><path d="M8 7.5h8M8 11h6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"></path></svg></span>
      <span class="wor-reader-dock__tab-label">الفصل</span>
    </button>
    <button class="wor-reader-dock__tab" type="button" data-wor-tab="text" id="wor-reader-tab-text">
      <span class="wor-reader-dock__tab-icon" aria-hidden="true"><svg class="wor-reader-dock__svg" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M5 6h14M12 6v13" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"></path></svg></span>
      <span class="wor-reader-dock__tab-label">النص</span>
    </button>
    <button class="wor-reader-dock__tab" type="button" data-wor-tab="font" id="wor-reader-tab-font">
      <span class="wor-reader-dock__tab-icon" aria-hidden="true"><svg class="wor-reader-dock__svg" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6 13.5 10.5 5h3L18 13.5M8 10.5h8M9.5 19h5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"></path></svg></span>
      <span class="wor-reader-dock__tab-label">الخط</span>
    </button>
    <button class="wor-reader-dock__tab" type="button" data-wor-tab="background" id="wor-reader-tab-background">
      <span class="wor-reader-dock__tab-icon" aria-hidden="true"><svg class="wor-reader-dock__svg" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><rect x="4" y="4" width="16" height="16" rx="3" fill="none" stroke="currentColor" stroke-width="1.8"></rect><path d="M4 14.5 9 9l11 8.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"></path><circle cx="15.4" cy="8.6" r="1.5" fill="currentColor"></circle></svg></span>
      <span class="wor-reader-dock__tab-label">الخلفية</span>
    </button>
    <button class="wor-reader-dock__tab" type="button" data-wor-tab="settings" id="wor-reader-tab-settings">
      <span class="wor-reader-dock__tab-icon" aria-hidden="true"><svg class="wor-reader-dock__svg" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M5 7h9m3.5 0H19M5 12h3m3.5 0H19M5 17h9m3.5 0H19" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"></path><circle cx="15.5" cy="7" r="1.7" fill="none" stroke="currentColor" stroke-width="1.7"></circle><circle cx="9.5" cy="12" r="1.7" fill="none" stroke="currentColor" stroke-width="1.7"></circle><circle cx="15.5" cy="17" r="1.7" fill="none" stroke="currentColor" stroke-width="1.7"></circle></svg></span>
      <span class="wor-reader-dock__tab-label">الإعدادات</span>
    </button>
    <button class="wor-reader-dock__tab" type="button" data-wor-tab="color" id="wor-reader-tab-color">
      <span class="wor-reader-dock__tab-icon" aria-hidden="true"><svg class="wor-reader-dock__svg" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 3.2a8.8 8.8 0 1 0 0 17.6h1.6a2.1 2.1 0 0 0 0-4.2H12a1.7 1.7 0 0 1 0-3.4h5.8A3.2 3.2 0 0 0 21 10C21 6.2 16.9 3.2 12 3.2Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"></path><circle cx="7.4" cy="10.6" r="1.25" fill="currentColor"></circle><circle cx="11.4" cy="7.2" r="1.25" fill="currentColor"></circle><circle cx="15.8" cy="9.4" r="1.25" fill="currentColor"></circle></svg></span>
      <span class="wor-reader-dock__tab-label">التلوين</span>
    </button>
    <button class="wor-reader-dock__tab" type="button" data-wor-tab="report" id="wor-reader-tab-report">
      <span class="wor-reader-dock__tab-icon" aria-hidden="true"><svg class="wor-reader-dock__svg" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 4 21 19H3L12 4Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"></path><path d="M12 10v4.2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"></path><circle cx="12" cy="16.6" r="1.1" fill="currentColor"></circle></svg></span>
      <span class="wor-reader-dock__tab-label">إبلاغ</span>
    </button>
  </div>
</section>

<!-- floating dock toggle -->
<button class="wor-reader-dock__toggle wor-reader-dock__toggle--floating" type="button" aria-expanded="true" aria-label="فتح/إغلاق أدوات القراءة">
  <span class="wor-reader-dock__toggle-icon" aria-hidden="true"><svg class="wor-reader-dock__svg" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m6 14 6-6 6 6" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"></path></svg></span>
</button>

<!-- chapters sheet -->
<div class="wor-reader-chapters-sheet" id="wor-reader-chapters-sheet" role="dialog" aria-modal="true" aria-label="قائمة الفصول" hidden aria-hidden="true">
  <div class="wor-reader-chapters-sheet__head">
    <h2>قائمة الفصول</h2>
    <div style="display:flex;gap:8px">
      <button class="wor-reader-chapters-sheet__close" type="button" data-wor-chapters-sort aria-label="ترتيب الفصول" title="ترتيب تنازلي / تصاعدي">
        <svg class="wor-ui-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M7 4v13m0 3-3.5-3.5M7 20l3.5-3.5M17 20V7m0-3 3.5 3.5M17 4l-3.5 3.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"></path></svg>
      </button>
      <button class="wor-reader-chapters-sheet__close" type="button" data-wor-chapters-close aria-label="إغلاق">×</button>
    </div>
  </div>
  <div class="wor-reader-chapters-sheet__search">
    <input id="worChaptersSearch" type="search" placeholder="ابحث برقم الفصل أو عنوانه..." autocomplete="off">
  </div>
  <div class="wor-reader-chapters-sheet__list" id="worChaptersList"></div>
  <div class="wor-reader-chapters-sheet__footer">
    <button class="wor-reader-chapters-sheet__more" type="button" id="worChaptersMore">المزيد</button>
  </div>
</div>

<!-- words sheet -->
<div class="wor-reader-words-sheet" id="wor-reader-words-sheet" role="dialog" aria-modal="true" aria-label="تغيير الكلمات" hidden aria-hidden="true">
  <div class="wor-reader-words-sheet__head">
    <h2>تغيير الكلمات <small id="worWordsFolderName" style="color:var(--wor-muted);font-size:.75em"></small></h2>
    <button class="wor-reader-words-sheet__close" type="button" data-wor-words-close aria-label="إغلاق">×</button>
  </div>
  <div class="wor-reader-words-sheet__body">
    <div class="wor-reader-words-tabs" id="worWordsTabs"></div>
    <p class="wor-reader-words-sheet__hint">تُستبدل الكلمات تلقائياً أثناء عرض الفصول. اختر مجلداً من الأعلى أو أضف كلمة جديدة.</p>
    <div class="wor-reader-words-form">
      <label><span>الكلمة الأصلية</span><input id="worWordsOriginal" type="text" placeholder="اكتب الكلمة أو العبارة الأصلية..." autocomplete="off"></label>
      <label><span>الكلمة البديلة</span><input id="worWordsReplacement" type="text" placeholder="اكتب البديل (اتركه فارغاً للحذف)..." autocomplete="off"></label>
      <div class="wor-reader-words-form__actions">
        <button class="wor-reader-words-btn" type="button" id="worWordsSave">إضافة</button>
        <button class="wor-reader-words-btn wor-reader-words-btn--danger" type="button" id="worWordsCancel">إلغاء</button>
      </div>
    </div>
    <div class="wor-reader-words-list" id="worWordsList"></div>
  </div>
</div>

<!-- report modal -->
<div class="wor-chapter-report-modal" data-wor-chapter-report-modal hidden aria-hidden="true">
  <button type="button" class="wor-chapter-report-modal__backdrop" data-wor-report-close aria-label="إغلاق نافذة البلاغ"></button>
  <section class="wor-chapter-report-modal__dialog" role="dialog" aria-modal="true">
    <header class="wor-chapter-report-modal__head">
      <div>
        <span>إبلاغ سريع</span>
        <h2>ما المشكلة في هذا الفصل؟</h2>
        <p data-wor-report-modal-chapter>—</p>
      </div>
      <button type="button" class="wor-chapter-report-modal__close" data-wor-report-close aria-label="إغلاق">×</button>
    </header>
    <div class="wor-chapter-report-modal__types" data-wor-report-types aria-live="polite"></div>
    <label class="wor-chapter-report-modal__details" data-wor-report-details-wrap>
      <span>اشرح المشكلة باختصار</span>
      <textarea rows="4" maxlength="1200" data-wor-report-details placeholder="اكتب ما المشكلة بالضبط..."></textarea>
      <small><b data-wor-report-details-count>0</b>/1200</small>
    </label>
    <p class="wor-chapter-report-modal__message" data-wor-report-message aria-live="polite"></p>
    <footer>
      <button type="button" class="wor-chapter-report-modal__cancel" data-wor-report-close>إلغاء</button>
      <button type="button" class="wor-chapter-report-modal__submit" data-wor-report-submit disabled>إرسال البلاغ</button>
    </footer>
  </section>
</div>

<!-- toast -->
<div class="wor-mini-toast" id="worMiniToast"><span></span></div>

<script>${script}<\/script>
</body>
</html>`;
}

export default buildWorShell;
