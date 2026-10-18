/* Procedural audio with independently controlled gain buses. */
(function(root) {
'use strict';
  class SoundSystem {
    constructor() { this.context = null; this.siren = null; this.musicTimer=null;this.musicNodes=new Set();this.musicStep=0; this.applySettings(root.SectorPreferences?.read() || { master:0.85, effects:0.9, siren:0.7, music:1, muted:false }); }
    applySettings(settings) {
      settings = root.SectorPreferences?.normalize(settings) || {master:0.85,effects:0.9,siren:0.7,music:1,muted:false,...settings};
      this.settings = settings; this.muted = settings.muted;
      try {
      if (this.masterGain) {
        const now = this.context.currentTime;
        this.masterGain.gain.setTargetAtTime(this.muted ? 0 : settings.master, now, 0.02);
        this.effectsGain.gain.setTargetAtTime(settings.effects, now, 0.02);
        this.sirenGain.gain.setTargetAtTime(settings.siren, now, 0.02);
        this.musicGain.gain.setTargetAtTime(settings.music, now, 0.02);
      }
      } catch(error) { this.fail('AUDIO_SETTINGS',error); }
      if(this.muted || settings.music===0 || settings.master===0)this.setMusic(false);
      if(this.muted || settings.siren===0 || settings.master===0)this.setAlert(false);
      this.onChange?.();
    }
    fail(code,error) {
      this.muted=true;
      this.setMusic(false);
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
          this.effectsGain = this.context.createGain(); this.sirenGain = this.context.createGain();this.musicGain=this.context.createGain();
          this.effectsGain.connect(this.masterGain); this.sirenGain.connect(this.masterGain);this.musicGain.connect(this.masterGain); this.masterGain.connect(this.context.destination);
          this.applySettings(this.settings);
        }
        if (this.context && this.context.state === 'suspended') await this.context.resume();
        if (this.context?.state !== 'running') return this.fail('AUDIO_SUSPENDED',new Error(`Audio context state: ${this.context?.state}`));
        return true;
      } catch (error) { return this.fail('AUDIO_START',error); }
    }
    click() {
      this.tone(300, 170, 0.08, 0.11, 'triangle');
      this.tone(440, 330, 0.12, 0.07, 'sine', 0.07);
    }
    /** Short envelopes avoid clicks; slight pitch movement gives mechanical cues
     * distinct identities without samples, loud oscillators, or external assets.
     */
    tone(start, end, duration, volume, type = 'sine', delay = 0, channel='effects') {
      if (this.muted || !this.context || this.context.state !== 'running') return;
      try {
        const now = this.context.currentTime + delay, oscillator = this.context.createOscillator(), gain = this.context.createGain();
        oscillator.type = type; oscillator.frequency.setValueAtTime(start, now); oscillator.frequency.exponentialRampToValueAtTime(end, now + duration);
        gain.gain.setValueAtTime(0, now); gain.gain.linearRampToValueAtTime(volume, now + 0.008); gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
        oscillator.connect(gain); gain.connect(channel==='music'?this.musicGain:this.effectsGain); oscillator.start(now); oscillator.stop(now + duration);
        if(channel==='music')this.musicNodes.add(oscillator);
        oscillator.onended = () => { this.musicNodes.delete(oscillator);oscillator.disconnect(); gain.disconnect(); };
      } catch (error) { this.fail('AUDIO_EFFECT',error); }
    }
    cue(type) {
      if (type === 'start') { this.tone(160,240,0.15,0.1,'triangle'); this.tone(240,360,0.18,0.085,'sine',0.13); }
      else if (type === 'over') { this.tone(240,110,0.25,0.11,'triangle'); this.tone(110,55,0.35,0.085,'sine',0.2); }
      else if(type==='spawn') {this.tone(196,196,0.12,0.1,'triangle');this.tone(294,294,0.12,0.1,'triangle',0.15);this.tone(392,294,0.25,0.09,'sine',0.3);}
      else if(type==='boss') {this.tone(180,90,0.3,0.16,'triangle');this.tone(180,90,0.3,0.16,'triangle',0.35);this.tone(110,55,0.5,0.14,'sine',0.7);}
      else this.tone(type === 'menu' ? 160 : 200,120,0.045,0.04,'triangle');
    }
    /** An audible but restrained carrier sweeps between 300 and 540 Hz. One siren serves
     * every visible guard; gaining more observers never stacks the volume.
     * Stop with a short fade on cover, pause, mute, game over, or lost focus.
     */
    setAlert(active) {
      try {
      const enabled = active && !this.muted && this.settings.master>0 && this.settings.siren>0 && this.context && this.context.state === 'running';
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
        carrier.type = 'triangle'; carrier.frequency.value = 420;
        lfo.type = 'sine'; lfo.frequency.value = 0.8; depth.gain.value = 120;
        lfo.connect(depth); depth.connect(carrier.frequency); carrier.connect(gain); gain.connect(this.sirenGain);
        gain.gain.setValueAtTime(0, now); gain.gain.linearRampToValueAtTime(0.075, now + 0.14);
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
        for (const [start, end, duration, volume, type] of [[120, 38, 0.26, 0.18, 'triangle'], [420, 100, 0.11, 0.06, 'sawtooth']]) {
          const tone = this.context.createOscillator(), gain = this.context.createGain();
          tone.type = type; tone.frequency.setValueAtTime(start, now); tone.frequency.exponentialRampToValueAtTime(end, now + duration);
          gain.gain.setValueAtTime(0, now); gain.gain.linearRampToValueAtTime(volume, now + 0.006); gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
          tone.connect(gain); gain.connect(this.effectsGain); tone.start(now); tone.stop(now + duration);
          tone.onended = () => { tone.disconnect(); gain.disconnect(); };
        }
      } catch (error) { this.fail('AUDIO_CONTACT',error); }
    }
    /** A low-key 16-step minor pattern, scheduled slightly ahead on the audio
     * clock. A single timer avoids stacking loops; stopping cancels queued notes.
     */
    scheduleMusicStep(time,step) {
      const bass=[110,0,110,0,130.81,0,130.81,0,98,0,98,0,82.41,0,98,0];
      const melody=[220,0,329.63,0,261.63,0,220,0,196,0,293.66,0,164.81,0,196,0];
      const delay=Math.max(0,time-this.context.currentTime),i=step%16;
      if(bass[i])this.tone(bass[i],bass[i],0.58,0.3,'triangle',delay,'music');
      if(melody[i])this.tone(melody[i]*2,melody[i]*2,0.45,0.17,'sine',delay+0.02,'music');
    }
    setMusic(active) {
      const enabled=active&&!this.muted&&this.settings.music>0&&this.settings.master>0&&this.context?.state==='running';
      if(!enabled){
        const wasPlaying=this.musicTimer!==null;
        if(this.musicTimer!==null){this.resumeMusicStep=this.musicStep%16;root.clearInterval(this.musicTimer);this.musicTimer=null;}
        for(const node of this.musicNodes){try{node.stop(this.context.currentTime+0.025);}catch(_) {}}
        this.musicNodes.clear();if(wasPlaying)this.onChange?.();return;
      }
      if(this.musicTimer!==null)return;
      this.musicStep=this.resumeMusicStep||0;this.resumeMusicStep=0;this.nextMusicTime=this.context.currentTime+0.04;
      const schedule=()=>{
        if(this.context.state!=='running'){this.setMusic(false);return;}
        try{
          if(this.nextMusicTime<this.context.currentTime)this.nextMusicTime=this.context.currentTime+0.02;
          while(this.nextMusicTime<this.context.currentTime+0.18){this.scheduleMusicStep(this.nextMusicTime,this.musicStep++);this.nextMusicTime+=60/88/2;}
        }catch(error){this.fail('AUDIO_MUSIC',error);}
      };
      this.musicTimer=root.setInterval(schedule,100);schedule();this.onChange?.();
    }
  }

root.SectorSoundSystem = SoundSystem;
if(typeof module !== 'undefined' && module.exports) module.exports = SoundSystem;
})(typeof window !== 'undefined' ? window : globalThis);

