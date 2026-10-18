'use strict';
// Repeatable movement-only play sessions. No teleports, invincibility, or injected
// score: the controller navigates to real pickups while avoiding nearby enemies.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const api=require('../public/assets/js/game/game.js');
function harness(mode){
  const elements=new Map(),doc={hidden:false,body:{classList:{toggle(){}}},querySelectorAll:()=>[],getElementById(id){if(!elements.has(id))elements.set(id,{dataset:{},focus(){},setAttribute(){}});return elements.get(id);}};
  const game=Object.create(api.Game.prototype);
  Object.assign(game,{selectedDifficulty:mode,mode:'READY',document:doc,canvas:{focus(){}},keys:new Set(),motion:false,diagnostics:false,testResults:[],records:{},sound:{setAlert(){},setMusic(){},click(){},caught(){},cue(){}},
    loadHighScore(){this.highScore=this.records[this.difficultyKey]||0;},saveHighScore(){this.records[this.difficultyKey]=this.highScore;}});
  game.touchControls={vector:{x:0,y:0},clear(){this.vector={x:0,y:0};},refresh(){}};
  game.reset();game.mode='RUNNING';return game;
}
function steer(game){
  const pos=game.player.pos;
  const routes=game.nodes.map(node=>{const route=api.findPath(pos,node,game.walls,game.player.radius);let distance=0,from=pos;for(const p of route){distance+=from.distance(p);from=p;}return {route,cost:route.length?distance:Infinity};}).sort((a,b)=>a.cost-b.cost);
  const goal=routes[0]?.route[0];if(!goal)return {x:0,y:0};
  const desired=goal.sub(pos).normalized(),heading=Math.atan2(desired.y,desired.x);
  let best=desired,value=-Infinity;
  for(const offset of [0,-0.4,0.4,-0.8,0.8,-1.4,1.4,Math.PI]){
    const direction=new api.Vector2D(Math.cos(heading+offset),Math.sin(heading+offset));
    const probe=pos.add(direction.scale(20));
    if(probe.x<12||probe.x>788||probe.y<12||probe.y>588||game.walls.some(w=>w.overlaps(probe,12)))continue;
    let danger=0;
    for(const enemy of game.enemies){const future=enemy.pos.add(enemy.vel.scale(0.15));if(api.hasSight(probe,future,game.walls))danger+=Math.max(0,100-probe.distance(future))*0.055;}
    const score=direction.dot(desired)*2-danger;
    if(score>value){value=score;best=direction;}
  }
  return best;
}
const originalRandom=Math.random,results=[];
try{
  for(const mode of Object.keys(api.DIFFICULTIES))for(const seed of [9,42,2026]){
    let state=seed;Math.random=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};
    const game=harness(mode);let runs=1,best=0,intros=0,totalCollected=0,previousScore=0;
    const start=performance.now();
    for(let tick=0;tick<120*180;tick++){
      if(game.mode==='OVER'){best=Math.max(best,game.score);game.reset();game.mode='RUNNING';runs++;previousScore=0;}
      if(game.mode==='WARDEN_INTRO'){intros++;const before=game.score;game.continueWarden();assert.equal(game.score,before);}
      if(tick%12===0)game.touchControls.vector=steer(game);
      game.update(api.CONFIG.STEP);
      if(game.score>previousScore)totalCollected+=(game.score-previousScore)/10;previousScore=game.score;best=Math.max(best,game.score);
      assert.ok(game.player.hp>=0&&game.player.hp<=3);assert.ok(game.nodes.length>=2&&game.nodes.length<=3);
      for(const unit of [game.player,...game.enemies]){
        assert.ok([unit.pos.x,unit.pos.y,unit.vel.x,unit.vel.y].every(Number.isFinite));
        assert.equal(game.walls.some(w=>w.overlaps(unit.pos,unit.radius-0.01)),false,'Clipped cover in '+mode);
        assert.ok(unit.pos.x>=unit.radius&&unit.pos.x<=800-unit.radius&&unit.pos.y>=unit.radius&&unit.pos.y<=600-unit.radius);
      }
      assert.ok(game.texts.length<=6,'Floating text leak');
    }
    assert.ok(totalCollected>0,'Controller could not collect data in '+mode);
    results.push({mode,seed,simulatedSeconds:180,runs,best,totalCollected,wardenBriefings:intros,wallClockMs:Math.round(performance.now()-start)});
    console.log('PASS movement play session: '+JSON.stringify(results.at(-1)));
  }
}finally{Math.random=originalRandom;}
const output=path.resolve(__dirname,'../artifacts/qa');fs.mkdirSync(output,{recursive:true});fs.writeFileSync(path.join(output,'play-sessions.json'),JSON.stringify(results,null,2)+'\n');
