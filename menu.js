'use strict';
(function () {
  const prefs = SectorPreferences.read(), page = document.body.dataset.page;
  const sound = new Sector09.SoundSystem();
  document.body.classList.toggle('reduced-motion', !prefs.motion);
  const status = document.getElementById('saved');
  const save = patch => {
    const p = SectorPreferences.save(patch); sound.applySettings(p);
    document.body.classList.toggle('reduced-motion', !p.motion);
    if (status) status.textContent = 'Preferences saved on this device.';
  };
  for (const key of ['difficulty','fullscreen','motion','muted','master','effects','siren']) {
    const input = document.getElementById(key); if (!input) continue;
    input.type === 'checkbox' ? input.checked = prefs[key] : input.value = input.type === 'range' ? prefs[key] * 100 : prefs[key];
    const output = document.getElementById(`${key}-value`);
    if (output) output.textContent = `${input.value}%`;
    input.addEventListener(input.type === 'range' ? 'input' : 'change', () => {
      const value = input.type === 'checkbox' ? input.checked : input.type === 'range' ? Number(input.value) / 100 : input.value;
      if (output) output.textContent = `${input.value}%`;
      save({ [key]:value });
    });
  }
  async function preview(type) {
    sound.unlock();
    try { if (sound.context?.state === 'suspended') await sound.context.resume(); } catch (_) {}
    if (type === 'siren') { sound.setAlert(true); setTimeout(() => sound.setAlert(false), 1800); }
    else if (type === 'hit') sound.caught();
    else sound.click();
    if (status) status.textContent = sound.muted ? 'Audio is muted. Turn off mute to preview.' : 'Playing preview with your current volume settings.';
  }
  document.querySelectorAll('[data-preview]').forEach(button => button.addEventListener('click', () => preview(button.dataset.preview)));
  document.querySelectorAll('a').forEach(link => link.addEventListener('pointerenter', () => sound.cue('menu')));
  const close = document.getElementById('close-tab');
  close?.addEventListener('click', () => {
    window.close();
    if (status) status.textContent = 'If this tab remains open, close it with your browser’s tab button. You can also return home.';
  });
  addEventListener('pagehide', () => sound.setAlert(false));
  addEventListener('blur', () => sound.setAlert(false));
  document.addEventListener('visibilitychange', () => { if (document.hidden) sound.setAlert(false); });
  if (page === 'home') {
    const label = document.getElementById('current-mode'); if (label) label.textContent = `${prefs.difficulty.toUpperCase()} / READY`;
  }
})();
