/* Local-only, bounded diagnostics. No errors or user data are sent to a server. */
(function (root) {
  'use strict';
  const entries = [], MAX_ENTRIES = 100;
  const document = root.document;
  const home = document?.currentScript?.src ? new URL('../../../index.html', document.currentScript.src).href : '/';
  let notice = null, fatal = null;
  function stopGame() {
    try {root.SectorAudio?.stop(true);}catch(_){}
    const game = root.sector09Game;
    if (!game) return;
    game.failed = true; game.mode = 'ERROR'; game.keys?.clear();
    game.touchControls?.clear();
    try { game.sound?.setAlert(false);game.sound?.setMusic(false); } catch (_) { /* Reporter must not recurse. */ }
    document?.body?.classList.remove('alert');
  }
  function display(entry) {
    if (!document?.body) { document?.addEventListener('DOMContentLoaded', () => display(entry), { once:true }); return; }
    if (entry.severity !== 'fatal' && fatal) return;
    if (entry.severity === 'fatal') {
      stopGame(); if (fatal) return;
      fatal = document.createElement('section'); fatal.className = 'error-fatal'; fatal.setAttribute('role','alertdialog');
      fatal.setAttribute('aria-modal','true'); fatal.setAttribute('aria-labelledby','error-title');
      const box = document.createElement('div'); box.className = 'error-panel';
      const heading = document.createElement('h2'); heading.id = 'error-title'; heading.textContent = 'Unable to continue';
      const message = document.createElement('p'); message.textContent = entry.message;
      const reload = document.createElement('button'); reload.type = 'button'; reload.textContent = 'Reload page'; reload.addEventListener('click', () => root.location.reload());
      const link = document.createElement('a'); link.href = home; link.textContent = 'Return home';
      box.append(heading,message,reload,link); fatal.append(box); document.body.append(fatal); reload.focus();
    } else {
      if (!notice) { notice = document.createElement('aside'); notice.className = 'error-notice'; notice.setAttribute('role','status'); document.body.append(notice); }
      notice.replaceChildren();
      const text = document.createElement('span'); text.textContent = entry.message;
      const close = document.createElement('button'); close.type = 'button'; close.textContent = 'Dismiss'; close.addEventListener('click', () => notice.remove());
      notice.append(text,close); if (!notice.isConnected) document.body.append(notice);
    }
  }
  function report(code, error, options = {}) {
    const severity = options.severity || 'warning';
    const message = options.message || 'An operation failed. Please try again.';
    const existing = entries.find(e => e.code === code && e.message === message && e.severity === severity);
    if (existing) { existing.count++; existing.lastSeen = Date.now(); if (severity === 'fatal') stopGame(); return existing; }
    const entry = { code, severity, message, detail:String(error?.message || error || ''), stack:String(error?.stack || ''), count:1, lastSeen:Date.now() };
    entries.push(entry); if (entries.length > MAX_ENTRIES) entries.shift();
    if (options.console !== false) (severity === 'fatal' ? console.error : console.warn)(`[SECTOR-09 / ${code}]`, error || message);
    if (severity === 'fatal') stopGame();
    if (options.notify !== false) display(entry);
    return entry;
  }
  function guard(code, fn, options) {
    try {
      const value = fn();
      return value?.then ? Promise.resolve(value).catch(error => { report(code,error,options); }) : value;
    } catch (error) { report(code,error,options); return undefined; }
  }
  root.addEventListener?.('error', event => {
    const target = event.target;
    if (target && target !== root && ['SCRIPT','LINK','IMG'].includes(target.tagName)) {
      const required = target.tagName === 'SCRIPT' && target.hasAttribute('data-required');
      report('ASSET_LOAD',new Error(target.src || target.href), { severity:required ? 'fatal' : 'warning', message:required ? 'A required game file could not load. Reload the page to try again.' : 'A page resource could not load. Reload if the page looks incomplete.' });
    } else report('UNCAUGHT_ERROR',event.error || event.message,{ severity:'fatal', message:'The page encountered an unexpected error. Reload to start again.' });
  },true);
  root.addEventListener?.('unhandledrejection', event => {
    report('UNHANDLED_PROMISE',event.reason,{ message:'An operation could not complete. Please try again.' });
    event.preventDefault();
  });
  root.SectorErrors = { report, guard, snapshot:() => entries.map(e => ({ ...e })), clear:() => { entries.length = 0; } };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.SectorErrors;
})(typeof window !== 'undefined' ? window : globalThis);
