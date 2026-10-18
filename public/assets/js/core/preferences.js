/* Shared, validated local preferences. The game works when storage is denied. */
(function (root) {
  'use strict';
  const defaults = Object.freeze({ difficulty:'medium', fullscreen:true, motion:true, theme:'dark', master:0.85, effects:0.9, siren:0.7, music:0.35, muted:false });
  let memory = { ...defaults }, loaded = false, persistent = true;
  const warn = (code,error,message) => root.SectorErrors?.report(code,error,{message});
  function normalize(value) {
    const v = value && typeof value === 'object' ? value : {};
    const result = { ...defaults };
    if (['easy','medium','hard','god'].includes(v.difficulty)) result.difficulty = v.difficulty;
    if (['dark','light'].includes(v.theme)) result.theme = v.theme;
    for (const k of ['fullscreen','motion','muted']) if (typeof v[k] === 'boolean') result[k] = v[k];
    for (const k of ['master','effects','siren','music']) if (typeof v[k] === 'number' && Number.isFinite(v[k])) result[k] = Math.max(0, Math.min(1, v[k]));
    return result;
  }
  function read() {
    if (loaded) return { ...memory };
    loaded = true;
    let raw;
    try { raw = root.localStorage.getItem('sector09.preferences'); }
    catch (error) { persistent=false;warn('PREFERENCES_READ',error,'Saved settings are unavailable. Changes will last for this page session.');return { ...memory }; }
    if (raw) {
      try {
        const value = JSON.parse(raw);
        if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected a settings object');
        const normalized = normalize(value);
        if (Object.keys(defaults).some(k => k in value && value[k] !== normalized[k])) warn('PREFERENCES_INVALID',new Error('Invalid saved setting values'),'Some saved settings were invalid and have been reset.');
        memory = normalized;
      } catch(error) { memory={...defaults};warn('PREFERENCES_CORRUPT',error,'Saved settings could not be read. Default settings have been restored.'); }
    }
    return { ...memory };
  }
  function save(patch) {
    memory = normalize({ ...read(), ...patch });
    try { root.localStorage.setItem('sector09.preferences', JSON.stringify(memory));persistent=true; }
    catch(error) { persistent=false;warn('PREFERENCES_WRITE',error,'Settings could not be saved. Changes will last for this page session.'); }
    return { ...memory };
  }
  root.addEventListener?.('storage', event => { if(event.key === 'sector09.preferences' || event.key === null) loaded=false; });
  const api = { defaults, normalize, read, save, isPersistent:() => persistent };
  root.SectorPreferences = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
