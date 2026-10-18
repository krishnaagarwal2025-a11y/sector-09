'use strict';
(function (root) {
 function init() {
  const guarded = (code, fn) => (...args) => root.SectorErrors.guard(code,() => fn(...args),{message:'This action could not complete. Please try again.'});
  const prefs = SectorPreferences.read(), page = document.body.dataset.page;
  const sound = new root.SectorSoundSystem();
  document.body.classList.toggle('reduced-motion', !prefs.motion);
  const status = document.getElementById('saved');
  const save = patch => {
    const p = SectorPreferences.save(patch); sound.applySettings(p);
    document.body.classList.toggle('reduced-motion', !p.motion);
    if (status) status.textContent = SectorPreferences.isPersistent() ? 'Preferences saved on this device.' : 'Changes apply for this page session; browser storage is unavailable.';
  };
  for (const key of ['difficulty','fullscreen','motion','muted','master','effects','siren']) {
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
    if (type === 'siren') { sound.setAlert(true); setTimeout(() => sound.setAlert(false), 1800); }
    else if (type === 'hit') sound.caught();
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
  addEventListener('pagehide', () => sound.setAlert(false));
  addEventListener('blur', () => sound.setAlert(false));
  document.addEventListener('visibilitychange', () => { if (document.hidden) sound.setAlert(false); });
 }
 root.SectorMenu = { init };
})(window);
