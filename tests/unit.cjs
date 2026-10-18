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
  Object.assign(game,{mode:'PAUSED',keys:new Set(['w']),sound:{setAlert(){silenced++;},setMusic(){}},draw(){throw Error('Render failure')}});
  game.frame(20);game.frame(21);assert.equal(game.failed,true);assert.equal(game.mode,'ERROR');assert.equal(game.keys.size,0);assert.equal(frames,0);assert.equal(silenced,1);assert.equal(reports[0][0],'GAME_LOOP');
});
test('Warden phases replace all patrols for exactly 50 points in every mode',()=>{
  const api=require('../public/assets/js/game/game.js');
  for(const difficulty of Object.values(api.DIFFICULTIES)){
    const game=Object.create(api.Game.prototype),cues=[];
    Object.assign(game,{difficulty,player:new api.Player(),walls:api.makeWalls(),enemies:Array.from({length:difficulty.units},(_,i)=>api.makeEnemy(i,difficulty)),score:0,highScore:0,threat:1,speedMultiplier:1,texts:[],events:[],time:0,sound:{click(){},cue(type){cues.push(type);}},saveHighScore(){}});
    game.node=game.spawnNode();
    for(let i=1;i<=40;i++){
      const before=cues.length;game.collect();const score=i*10;
      const bossPhase=score>=100&&score%100<50;
      assert.equal(game.enemies.filter(e=>e.isBoss).length,bossPhase?1:0,'Boss at '+score);
      assert.equal(game.enemies.filter(e=>!e.isBoss).length,bossPhase?0:Math.min(5,difficulty.units+Math.floor(score/50)),'Patrols at '+score);
      if(score%100===0){assert.deepEqual(cues.slice(before),['boss']);assert.equal(game.bossNotice,3);}
      else if(score>=150&&score%100===50){assert.deepEqual(cues.slice(before),['spawn']);assert.equal(game.bossNotice,0);}
      else if(score%50!==0)assert.equal(cues.length,before);
      for(const enemy of game.enemies){assert.equal(game.walls.some(w=>w.overlaps(enemy.pos,enemy.radius)),false);assert.ok(enemy.pos.distance(game.player.pos)>45);}
    }
  }
});

test('Warden patrol completes a whole-arena circuit through perimeter and central lanes',()=>{
  const api=require('../public/assets/js/game/game.js'),boss=api.makeBoss(0,{...api.DIFFICULTIES.easy,detection:0}),player=new api.Player();
  player.pos=new api.Vector2D(400,240);const game={player,walls:api.makeWalls(),speedMultiplier:1,onCaught(){}};const visited=new Set();
  for(let i=0;i<120*120;i++){
    boss.update(1/120,game);visited.add(boss.waypoint);
    assert.equal(game.walls.some(w=>w.overlaps(boss.pos,boss.radius-0.01)),false,'Boss clips cover');
  }
  assert.equal(visited.size,boss.waypoints.length,'Boss got stuck before completing the arena circuit');
  for(const [x,y] of [[85,85],[715,85],[715,515],[85,515],[400,515],[400,85]])assert.ok(boss.waypoints.some(p=>p.x===x&&p.y===y));
});

test('Bosses outrun the player in every mode, respect cover and reset between runs',()=>{
  const api=require('../public/assets/js/game/game.js');
  for(const difficulty of Object.values(api.DIFFICULTIES)){
    const boss=api.makeBoss(0,difficulty),player=new api.Player(difficulty),game={player,walls:[],speedMultiplier:1,onCaught(){}};
    boss.pos=new api.Vector2D(100,100);player.pos=new api.Vector2D(250,100);boss.transition('CHASE');
    assert.ok(boss.movementSpeed(game)>api.CONFIG.PLAYER_SPEED);
    // Chase a moving player long enough to measure actual velocity after acceleration.
    for(let i=0;i<60;i++){player.pos=player.pos.add(new api.Vector2D(api.CONFIG.PLAYER_SPEED/120,0));boss.update(1/120,game);}
    assert.ok(boss.vel.length()>api.CONFIG.PLAYER_SPEED);
    boss.pos=new api.Vector2D(140,180);player.pos=new api.Vector2D(315,180);boss.transition('CHASE');boss.decide(player,api.makeWalls());assert.equal(boss.state,'RETURN');assert.equal(boss.canSee(player,api.makeWalls()),false);
    const run=Object.create(api.Game.prototype);Object.assign(run,{selectedDifficulty:Object.keys(api.DIFFICULTIES).find(k=>api.DIFFICULTIES[k]===difficulty),sound:{setAlert(){}},loadHighScore(){}});run.enemies=[boss];run.bossNotice=3;run.reset();assert.equal(run.enemies.some(e=>e.isBoss),false);assert.equal(run.bossNotice,0);
  }
});
test('Theme and music preferences validate, clamp and default for older saved settings',()=>{
  const {api}=preferences({getItem:()=>'{"difficulty":"hard"}'});assert.equal(api.read().theme,'dark');assert.equal(api.read().music,1);
  assert.equal(api.normalize({theme:'light',music:2}).music,1);assert.equal(api.normalize({theme:'light'}).theme,'light');assert.equal(api.normalize({theme:'broken',music:NaN}).theme,'dark');
});
test('Light and dark canvas palettes are distinct and cover every enemy state',()=>{
  const {light,dark}=require('../public/assets/js/core/theme.js');assert.notEqual(light.background,dark.background);for(const key of Object.keys(dark)){assert.ok(light[key],key);}for(const state of ['PATROL','CHASE','ATTACK','RETURN'])assert.ok(light.states[state]);
});
test('BGM upgrades existing volume to maximum once and preserves later manual changes',()=>{
  let saved=JSON.stringify({music:0.35,master:0.7,muted:true});
  const storage={getItem:()=>saved,setItem:(_,value)=>{saved=value;}};
  const first=preferences(storage);assert.equal(first.api.read().music,1);assert.equal(first.api.read().master,0.7);assert.equal(first.api.read().muted,true);
  assert.equal(JSON.parse(saved).musicVolumeRevision,2);
  first.api.save({music:0.4});assert.equal(preferences(storage).api.read().music,0.4);
});
test('Touch joystick deadzone and radial clamping keep diagonal speed bounded',()=>{
  const Touch=require('../public/assets/js/ui/touch-controls.js');
  assert.deepEqual(Touch.direction(1,1,40),{x:0,y:0});assert.deepEqual(Touch.direction(NaN,0,40),{x:0,y:0});
  const cardinal=Touch.direction(100,0,40),diagonal=Touch.direction(100,100,40);assert.equal(cardinal.x,1);assert.ok(Math.abs(Math.hypot(diagonal.x,diagonal.y)-1)<1e-9);
  const partial=Touch.direction(20,0,40);assert.ok(partial.x>0&&partial.x<1);
  const {Player,Vector2D}=require('../public/assets/js/game/game.js'),player=new Player();player.update(0.1,new Set(),[],diagonal);assert.ok(Math.abs(player.vel.length()-170)<1e-8);
  player.update(0.1,new Set(),[],{x:0,y:0});assert.equal(player.vel.length(),0);
});


