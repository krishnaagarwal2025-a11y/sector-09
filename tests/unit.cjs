'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const base=path.resolve(__dirname,'../public/assets/js');
const source=name=>fs.readFileSync(path.join(base,name),'utf8');
function preferences(storage){const reports=[],context={localStorage:storage,SectorErrors:{report:(...args)=>reports.push(args)}};vm.runInNewContext(source('core/preferences.js'),context);return {api:context.SectorPreferences,reports};}
test('17 isolated gameplay regression cases',()=>{const results=require('../public/assets/js/game/game.js').runTests(false);assert.equal(results.length,17);for(const r of results)assert.equal(r.pass,true,`${r.test}: ${r.detail}`);});
test('Malformed JSON and invalid saved preferences recover with diagnostics',()=>{
  const corrupt=preferences({getItem:()=>'{broken'});assert.equal(corrupt.api.read().difficulty,'medium');assert.equal(corrupt.reports[0][0],'PREFERENCES_CORRUPT');
  const invalid=preferences({getItem:()=>JSON.stringify({difficulty:'unknown',master:9,effects:-1})});const p=invalid.api.read();assert.equal(p.master,1);assert.equal(p.effects,0);assert.equal(p.difficulty,'medium');assert.equal(invalid.reports[0][0],'PREFERENCES_INVALID');
});
test('Denied reads/writes retain in-memory changes instead of reloading stale data',()=>{
  const {api,reports}=preferences({getItem:()=>{throw Error('Denied');},setItem:()=>{throw Error('Quota');}});api.save({difficulty:'god',master:0.2});assert.equal(api.read().difficulty,'god');assert.equal(api.read().master,0.2);assert.equal(api.isPersistent(),false);assert.equal(reports.length,2);
  const stale=preferences({getItem:()=>'{"difficulty":"easy"}',setItem:()=>{throw Error('Quota');}});stale.api.save({difficulty:'hard'});assert.equal(stale.api.read().difficulty,'hard');
});
test('Reporter deduplicates, bounds retained errors, and catches sync/async failures',async()=>{
  const context={console:{warn(){},error(){}}};vm.runInNewContext(source('core/errors.js'),context);const api=context.SectorErrors;
  api.report('SAME',Error('x'));api.report('SAME',Error('x'));assert.equal(api.snapshot()[0].count,2);
  for(let i=0;i<120;i++)api.report('E'+i,Error('x'));assert.equal(api.snapshot().length,100);
  api.clear();api.guard('SYNC',()=>{throw Error('sync')});await api.guard('ASYNC',()=>Promise.reject(Error('async')));assert.equal(api.snapshot().length,2);
});
test('Unsupported audio and rejected resume recover without rejected promises',async()=>{
  for(const AudioContext of [undefined,class{constructor(){this.state='suspended';}createGain(){return {gain:{setTargetAtTime(){}},connect(){}};}resume(){return Promise.reject(Error('Device unavailable'));}}]){
    const reports=[],context={AudioContext,SectorErrors:{report:(...args)=>reports.push(args)}};vm.runInNewContext(source('audio/sound-system.js'),context);const sound=new context.SectorSoundSystem();assert.equal(await sound.unlock(),false);assert.equal(sound.muted,true);assert.equal(reports.length,1);assert.doesNotThrow(()=>sound.setAlert(false));
  }
});
test('Physics rejects nonfinite state, unsafe movement and invalid level geometry',()=>{
  const g=require('../public/assets/js/game/game.js'),p=new g.Player();assert.throws(()=>g.moveBody(p,new g.Vector2D(NaN,0),[]),RangeError);assert.throws(()=>g.moveBody(p,new g.Vector2D(1e9,0),[]),RangeError);assert.throws(()=>new g.Obstacle(0,0,-1,4),RangeError);assert.throws(()=>new g.Enemy(1,[]),TypeError);
});
test('A fatal frame error silences alert audio, clears input and stops scheduling',()=>{
  let frames=0,silenced=0;const reports=[],context={requestAnimationFrame(){frames++;},console,SectorSoundSystem:class{},SectorErrors:{report:(...args)=>reports.push(args)}};
  vm.runInNewContext(source('game/game.js'),context);const game=Object.create(context.Sector09.Game.prototype);
  Object.assign(game,{mode:'PAUSED',keys:new Set(['w']),sound:{setAlert(){silenced++;}},draw(){throw Error('Render failure')}});
  game.frame(20);game.frame(21);assert.equal(game.failed,true);assert.equal(game.mode,'ERROR');assert.equal(game.keys.size,0);assert.equal(frames,0);assert.equal(silenced,1);assert.equal(reports[0][0],'GAME_LOOP');
});
