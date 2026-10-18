'use strict';
(function (root) {
 function init() {
  const guarded = (code, fn) => (...args) => root.SectorErrors.guard(code,() => fn(...args),{message:'This action could not complete. Please try again.'});
  const prefs = SectorPreferences.read(), page = document.body.dataset.page;
  const sound = root.SectorAudio.sound;
  document.body.classList.toggle('reduced-motion', !prefs.motion);
  const status = document.getElementById('saved');
  let previewTimer=null;
  const save = patch => {
    const p = SectorPreferences.save(patch); sound.applySettings(p);
    root.SectorAudio.sync();
    document.body.classList.toggle('reduced-motion', !p.motion);
    root.SectorTheme.apply(p.theme);
    if (status) status.textContent = SectorPreferences.isPersistent() ? 'Preferences saved on this device.' : 'Changes apply for this page session; browser storage is unavailable.';
  };
  for (const key of ['difficulty','fullscreen','motion','theme','muted','master','effects','siren','music']) {
    const input = document.getElementById(key); if (!input) continue;
    input.type === 'checkbox' ? input.checked = prefs[key] : input.value = input.type === 'range' ? prefs[key] * 100 : prefs[key];
    const output = document.getElementById(`${key}-value`);
    if (output) output.textContent = `${input.value}%`;
    input.addEventListener(input.type === 'range' ? 'input' : 'change', guarded('SETTINGS_INPUT',() => {
      const value = input.type === 'checkbox' ? input.checked : input.type === 'range' ? Number(input.value) / 100 : input.value;
      if (output) output.textContent = `${input.value}%`;
      save({ [key]:value });
    }));
  }
  async function preview(type) {
    const ready = await sound.unlock();
    if (!ready) { if(status) status.textContent='Audio is unavailable. Check your browser’s audio permissions or output device.';return; }
    if(previewTimer!==null)clearTimeout(previewTimer);
    sound.setAlert(false);
    if (type === 'siren') { sound.setAlert(true); previewTimer=setTimeout(() => sound.setAlert(false), 1800); }
    else if (type === 'hit') sound.caught();
    else if(type==='spawn')sound.cue('spawn');
    else if(type==='music')await root.SectorAudio.start();
    else sound.click();
    if (status) status.textContent = sound.muted ? 'Audio is muted. Turn off mute to preview.' : 'Playing preview with your current volume settings.';
  }
  document.querySelectorAll('[data-preview]').forEach(button => button.addEventListener('click', guarded('AUDIO_PREVIEW',() => preview(button.dataset.preview))));
  document.querySelectorAll('a').forEach(link => link.addEventListener('pointerenter', () => sound.cue('menu')));
  const close = document.getElementById('close-tab');
  close?.addEventListener('click', guarded('CLOSE_TAB',() => {
    window.close();
    if (status) status.textContent = 'If this tab remains open, close it with your browser’s tab button. You can also return home.';
  }));
  const stop=()=>{if(previewTimer!==null)clearTimeout(previewTimer);sound.setAlert(false);};
  addEventListener('pagehide', stop);
  addEventListener('blur', stop);
  document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); });
 }
 root.SectorMenu = { init };
})(window);
