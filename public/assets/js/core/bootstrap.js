/* Validate each page before attaching behavior. Never start a half-loaded game. */
(function(root) {
  'use strict';
  const errors = root.SectorErrors;
  function start() {
    if (!errors) throw new Error('Diagnostics module missing');
    const page = document.body.dataset.page;
    if (!['home','play','settings','sound','controls','exit'].includes(page)) throw new Error(`Unknown page: ${page}`);
    if (!root.SectorPreferences || !root.SectorSoundSystem || !root.SectorTheme) throw new Error('Preferences, theme or audio module missing');
    const required = {
      home:[], settings:['difficulty','fullscreen','motion','theme','saved'], sound:['muted','master','effects','siren','music','saved'],
      controls:[], exit:['close-tab','saved'],
      play:['game','overlay','overlay-tag','overlay-title','overlay-copy','mode-picker','difficulty','mode-description','action','change-mode','fullscreen','pause','controls-panel','alert-status','score','high-score','integrity','threat','run-status','diagnostic-status']
    }[page];
    for (const id of required) if (!document.getElementById(id)) throw new Error(`Missing page element: ${id}`);
    for (const element of document.querySelectorAll('a[href]')) {
      const url = new URL(element.getAttribute('href'), root.location.href);
      if (!['http:','https:','file:'].includes(url.protocol)) throw new Error('Invalid navigation destination');
    }
    if (page === 'play') {
      if (!root.Sector09 || !root.SectorModelTests) throw new Error('Game or diagnostic module missing');
      if (typeof root.requestAnimationFrame !== 'function') throw new Error('Animation frames unavailable');
      const canvas = document.getElementById('game');
      if (typeof canvas.getContext !== 'function' || !canvas.getContext('2d')) throw new Error('Canvas 2D unavailable');
      root.sector09Game = new root.Sector09.Game(document);
    } else {
      if (!root.SectorMenu?.init) throw new Error('Menu module missing');
      root.SectorMenu.init();
    }
    document.body.dataset.ready = 'true';
  }
  try { start(); }
  catch(error) {
    if (errors) errors.report('BOOTSTRAP',error,{severity:'fatal',message:'This page could not start. Reload it, or try a browser with JavaScript and Canvas enabled.'});
    else {
      // Fallback even when the diagnostics script itself failed to download.
      const panel=document.createElement('p');panel.setAttribute('role','alert');
      panel.textContent='A required file failed to load. Reload this page to try again.';
      document.body.replaceChildren(panel);console.error(error);
    }
  }
})(window);
