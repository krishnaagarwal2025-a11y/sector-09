/* Shared, validated local preferences. The game works when storage is denied. */
(function (root) {
  'use strict';
  const defaults = Object.freeze({ difficulty:'medium', fullscreen:true, motion:true, master:0.7, effects:0.8, siren:0.5, muted:false });
  let memory = { ...defaults };
  function normalize(value) {
    const v = value && typeof value === 'object' ? value : {};
    const result = { ...defaults };
    if (['easy','medium','hard','god'].includes(v.difficulty)) result.difficulty = v.difficulty;
    for (const k of ['fullscreen','motion','muted']) if (typeof v[k] === 'boolean') result[k] = v[k];
    for (const k of ['master','effects','siren']) if (typeof v[k] === 'number' && Number.isFinite(v[k])) result[k] = Math.max(0, Math.min(1, v[k]));
    return result;
  }
  function read() { try { const raw = root.localStorage.getItem('sector09.preferences'); if (raw) memory = normalize(JSON.parse(raw)); } catch (_) {} return { ...memory }; }
  function save(patch) { memory = normalize({ ...read(), ...patch }); try { root.localStorage.setItem('sector09.preferences', JSON.stringify(memory)); } catch (_) {} return { ...memory }; }
  const api = { defaults, normalize, read, save };
  root.SectorPreferences = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
