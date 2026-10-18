/* Procedural audio with independently controlled gain buses. */
(function(root) {
'use strict';
  class SoundSystem {
    constructor() { this.context = null; this.siren = null; this.applySettings(root.SectorPreferences?.read() || { master:0.7, effects:0.8, siren:0.5, muted:false }); }
    applySettings(settings) {
      settings = root.SectorPreferences?.normalize(settings) || {master:0.7,effects:0.8,siren:0.5,muted:false,...settings};
      this.settings = settings; this.muted = settings.muted;
      try {
      if (this.masterGain) {
        const now = this.context.currentTime;
        this.masterGain.gain.setTargetAtTime(this.muted ? 0 : settings.master, now, 0.02);
        this.effectsGain.gain.setTargetAtTime(settings.effects, now, 0.02);
        this.sirenGain.gain.setTargetAtTime(settings.siren, now, 0.02);
      }
      } catch(error) { this.fail('AUDIO_SETTINGS',error); }
    }
    fail(code,error) {
      this.muted=true;
      try { if(this.masterGain) this.masterGain.gain.value=0; } catch (_) {}
      root.SectorErrors?.report(code,error,{message:'Audio is unavailable. You can keep playing without sound.'});
      return false;
    }
    /** Audio is created/resumed only from a user gesture. Unsupported audio is silent. */
    async unlock() {
      try {
        const Audio = root.AudioContext || root.webkitAudioContext;
        if (!Audio) return this.fail('AUDIO_UNSUPPORTED',new Error('Web Audio is unavailable'));
        if (!this.context && Audio) {
          this.context = new Audio(); this.masterGain = this.context.createGain();
          this.effectsGain = this.context.createGain(); this.sirenGain = this.context.createGain();
          this.effectsGain.connect(this.masterGain); this.sirenGain.connect(this.masterGain); this.masterGain.connect(this.context.destination);
          this.applySettings(this.settings);
        }
        if (this.context && this.context.state === 'suspended') await this.context.resume();
        if (this.context?.state !== 'running') return this.fail('AUDIO_SUSPENDED',new Error(`Audio context state: ${this.context?.state}`));
        return true;
      } catch (error) { return this.fail('AUDIO_START',error); }
    }
    click() {
      this.tone(300, 170, 0.08, 0.065, 'triangle');
      this.tone(440, 330, 0.12, 0.04, 'sine', 0.07);
    }
    /** Short envelopes avoid clicks; slight pitch movement gives mechanical cues
     * distinct identities without samples, loud oscillators, or external assets.
     */
    tone(start, end, duration, volume, type = 'sine', delay = 0) {
      if (this.muted || !this.context || this.context.state !== 'running') return;
      try {
        const now = this.context.currentTime + delay, oscillator = this.context.createOscillator(), gain = this.context.createGain();
        oscillator.type = type; oscillator.frequency.setValueAtTime(start, now); oscillator.frequency.exponentialRampToValueAtTime(end, now + duration);
        gain.gain.setValueAtTime(0, now); gain.gain.linearRampToValueAtTime(volume, now + 0.008); gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
        oscillator.connect(gain); gain.connect(this.effectsGain); oscillator.start(now); oscillator.stop(now + duration);
        oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
      } catch (error) { this.fail('AUDIO_EFFECT',error); }
    }
    cue(type) {
      if (type === 'start') { this.tone(160,240,0.15,0.06,'triangle'); this.tone(240,360,0.18,0.05,'sine',0.13); }
      else if (type === 'over') { this.tone(240,110,0.25,0.065,'triangle'); this.tone(110,55,0.35,0.05,'sine',0.2); }
      else this.tone(type === 'menu' ? 160 : 200,120,0.045,0.025,'triangle');
    }
    /** A quiet sine carrier sweeps between 175 and 265 Hz. One shared siren serves
     * every visible guard; gaining more observers never stacks the volume.
     * Stop with a short fade on cover, pause, mute, game over, or lost focus.
     */
    setAlert(active) {
      try {
      const enabled = active && !this.muted && this.context && this.context.state === 'running';
      if (!enabled && this.siren) {
        const { carrier, lfo, depth, gain } = this.siren; this.siren = null;
        const now = this.context.currentTime;
        gain.gain.cancelScheduledValues(now); gain.gain.setTargetAtTime(0, now, 0.025);
        carrier.stop(now + 0.15); lfo.stop(now + 0.15);
        carrier.onended = () => { carrier.disconnect(); lfo.disconnect(); depth.disconnect(); gain.disconnect(); };
      }
      if (!enabled || this.siren) return;
        const carrier = this.context.createOscillator(), lfo = this.context.createOscillator();
        const depth = this.context.createGain(), gain = this.context.createGain(), now = this.context.currentTime;
        carrier.type = 'sine'; carrier.frequency.value = 220;
        lfo.type = 'sine'; lfo.frequency.value = 0.65; depth.gain.value = 45;
        lfo.connect(depth); depth.connect(carrier.frequency); carrier.connect(gain); gain.connect(this.sirenGain);
        gain.gain.setValueAtTime(0, now); gain.gain.linearRampToValueAtTime(0.008, now + 0.18);
        carrier.start(); lfo.start(); this.siren = { carrier, lfo, depth, gain };
      } catch (error) { this.siren=null;this.fail('AUDIO_SIREN',error); }
    }
    /** Short low impact plus a descending mechanical chirp marks actual damage,
     * once per accepted hit (invulnerability rejects repeated contact).
     */
    caught() {
      if (this.muted || !this.context || this.context.state !== 'running') return;
      try {
        const now = this.context.currentTime;
        for (const [start, end, duration, volume, type] of [[120, 38, 0.26, 0.12, 'triangle'], [420, 100, 0.11, 0.035, 'sawtooth']]) {
          const tone = this.context.createOscillator(), gain = this.context.createGain();
          tone.type = type; tone.frequency.setValueAtTime(start, now); tone.frequency.exponentialRampToValueAtTime(end, now + duration);
          gain.gain.setValueAtTime(0, now); gain.gain.linearRampToValueAtTime(volume, now + 0.006); gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
          tone.connect(gain); gain.connect(this.effectsGain); tone.start(now); tone.stop(now + duration);
          tone.onended = () => { tone.disconnect(); gain.disconnect(); };
        }
      } catch (error) { this.fail('AUDIO_CONTACT',error); }
    }
  }

root.SectorSoundSystem = SoundSystem;
if(typeof module !== 'undefined' && module.exports) module.exports = SoundSystem;
})(typeof window !== 'undefined' ? window : globalThis);
