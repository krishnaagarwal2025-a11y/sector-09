/* Isolated model verification, shared by browser diagnostics and Node. */
(function(root) {
'use strict';
  function runTests(api, report = true) {
    const { CONFIG, DIFFICULTIES, Vector2D, Player, Enemy, Obstacle, FloatingText, SoundSystem, Game, findPath, hasSight, sightPolygon, circlesTouch, moveBody, makeWalls, makeEnemy } = api;
    const results = [], assert = (condition, message) => { if (!condition) throw new Error(message); };
    const test = (name, fn) => { try { fn(); results.push({ test: name, pass: true, detail: 'OK' }); } catch (error) { results.push({ test: name, pass: false, detail: error.message }); } };
    test('Player clamps to all four arena boundaries', () => {
      for (const [x, y, keys] of [[13, 13, ['a','w']], [787, 587, ['d','s']]]) {
        const p = new Player(); p.pos = new Vector2D(x, y); p.update(2, new Set(keys), []);
        assert(p.pos.x >= 12 && p.pos.x <= 788 && p.pos.y >= 12 && p.pos.y <= 588, 'Hull left arena');
        assert(p.pos.x === (x < 400 ? 12 : 788) && p.pos.y === (y < 300 ? 12 : 588), 'Boundary not reached');
      }
    });
    test('Normalized diagonal matches cardinal speed', () => {
      const a = new Player(), b = new Player(); a.update(0.1, new Set(['d']), []); b.update(0.1, new Set(['d','w']), []);
      assert(Math.abs(a.vel.length() - b.vel.length()) < 1e-8, 'Diagonal speed boost');
      assert(new Vector2D().normalized().length() === 0, 'Zero normalization invalid');
    });
    test('Collectible contact includes tangent, excludes separation', () => {
      assert(circlesTouch(new Vector2D(0,0), 12, new Vector2D(19,0), 7), 'Tangent missed');
      assert(!circlesTouch(new Vector2D(0,0), 12, new Vector2D(19.01,0), 7), 'False collection');
    });
    test('FSM PATROL -> CHASE -> ATTACK -> RETURN -> PATROL', () => {
      const e = new Enemy(1, [new Vector2D(80,80), new Vector2D(140,80), new Vector2D(140,140)]), p = new Player();
      p.pos = new Vector2D(180,80); e.decide(p, []); assert(e.state === 'CHASE', 'Detection failed');
      p.pos = new Vector2D(100,80); e.decide(p, []); assert(e.state === 'ATTACK', 'Attack failed');
      p.pos = new Vector2D(700,500); e.decide(p, []); assert(e.state === 'RETURN', 'Loss failed');
      e.decide(p, []); assert(e.state === 'PATROL', 'Return failed');
    });
    test('Detection requires LOS and uses 160/210 hysteresis', () => {
      const e = makeEnemy(0), p = new Player(); e.pos = new Vector2D(100,180); p.pos = new Vector2D(250,180);
      e.decide(p, makeWalls()); assert(e.state === 'PATROL', 'Detected through wall');
      p.pos = new Vector2D(260,180); e.decide(p, []); assert(e.state === 'CHASE', '160px detection missed');
      p.pos = new Vector2D(300,180); e.decide(p, []); assert(e.state === 'CHASE', 'Hysteresis flicker');
      p.pos.x = 311; e.decide(p, []); assert(e.state === 'RETURN', 'Loss threshold ignored');
    });
    test('Attack cooldown returns to CHASE; damage has invulnerability', () => {
      const e = makeEnemy(0), p = new Player(); p.pos = e.pos.add(new Vector2D(20,0)); e.transition('ATTACK');
      e.attackTime = 0; e.decide(p, []); assert(e.state === 'CHASE', 'Attack did not expire');
      e.decide(p, []); assert(e.state === 'CHASE', 'Cooldown bypassed');
      assert(p.damage() && !p.damage() && p.hp === 2, 'Invulnerability failed');
    });
    test('Walls resolve corners, embedded centers, sliding and tunneling', () => {
      const w = new Obstacle(100,100,80,80);
      for (const pos of [new Vector2D(96,96), new Vector2D(140,140)]) { const body = { pos, radius:12 }; w.resolve(body); assert(!w.overlaps(body.pos,12), 'Overlap persists'); }
      const p = new Player(); p.pos = new Vector2D(80,120); moveBody(p, new Vector2D(70,35), [w]);
      assert(p.pos.x <= 88.001 && p.pos.y > 150, 'Wall slide failed');
      p.pos = new Vector2D(50,130); moveBody(p, new Vector2D(300,0), [w]); assert(p.pos.x <= 88.001, 'Tunneled through wall');
    });
    test('Segment/rectangle math handles parallel and tangent rays', () => {
      const w = new Obstacle(100,100,80,80);
      assert(w.intersects(new Vector2D(50,100),new Vector2D(200,100)), 'Tangent missed');
      assert(!w.intersects(new Vector2D(50,99),new Vector2D(200,99)), 'Parallel false positive');
      assert(w.intersects(new Vector2D(140,140),new Vector2D(140,140)), 'Embedded point missed');
    });
    test('Navigation routes around cover with hull clearance', () => {
      const walls = makeWalls(), start = new Vector2D(100,180), end = new Vector2D(350,180), path = findPath(start,end,walls,12);
      assert(path.length >= 3, 'No detour'); let prev = start;
      for (const next of path) { assert(hasSight(prev,next,walls,12), 'Path cuts wall'); prev = next; }
      assert(prev.distance(end) < 0.01, 'Path misses destination');
    });
    test('Enemy returns around cover without penetrating walls', () => {
      const e = new Enemy(1, [new Vector2D(330,180),new Vector2D(380,180),new Vector2D(380,270)]), p = new Player(), walls = makeWalls();
      e.pos = new Vector2D(130,180); p.pos = new Vector2D(750,550); e.transition('RETURN');
      const game = { player:p, walls, speedMultiplier:1, onCaught() {} }; let reached = false;
      for (let i = 0; i < 1200; i++) { e.update(CONFIG.STEP,game); assert(!walls.some(w => w.overlaps(e.pos,12)), 'Enemy penetrated cover'); }
      reached = e.state === 'PATROL'; assert(reached, 'Enemy stuck returning around cover');
    });
    test('Cover breaks active chase and attack, and permits reacquisition', () => {
      const e = makeEnemy(0), p = new Player(), walls = makeWalls(); e.pos = new Vector2D(130,180); p.pos = new Vector2D(315,180);
      for (const state of ['CHASE','ATTACK']) {
        e.transition(state); assert(!e.canSee(p,walls), 'Sees through cover'); e.decide(p,walls);
        assert(e.state === 'RETURN', 'Hidden player still pursued');
      }
      p.pos = new Vector2D(130,240); e.decide(p,walls);
      assert(e.state === 'CHASE' && e.canSee(p,walls), 'Visible player not reacquired');
    });
    test('Visible detection polygon stops at near face of cover', () => {
      const origin = new Vector2D(130,180), polygon = sightPolygon(origin,160,makeWalls());
      const right = polygon.find(p => Math.abs(p.y - 180) < 1e-8 && p.x > 130);
      assert(right && Math.abs(right.x - 160) < 1e-6, 'Visibility graphic crosses wall');
      assert(polygon.every(p => p.distance(origin) <= 160.0001), 'Visibility exceeds range');
    });
    test('Catch feedback fires once per accepted hit; walls prevent damage', () => {
      const e = makeEnemy(0), p = new Player(); e.pos = new Vector2D(80,80); p.pos = new Vector2D(100,80); e.transition('ATTACK');
      let hits = 0; const game = { player:p, walls:[], speedMultiplier:1, onCaught() { hits++; } };
      for (let i=0; i<10; i++) e.update(CONFIG.STEP, game);
      assert(hits === 1 && p.hp === 2, 'Contact feedback repeated during invulnerability');
      p.invulnerable=0; game.walls=[new Obstacle(88,60,4,40)]; e.pos=new Vector2D(75,80); e.transition('ATTACK');
      e.update(CONFIG.STEP,game); assert(hits === 1 && p.hp === 2, 'Hit through cover');
    });
    test('Spawns clear walls; difficulty caps units and compounds speed', () => {
      const game = Object.create(Game.prototype);
      Object.assign(game, { difficulty:DIFFICULTIES.medium, player:new Player(), walls:makeWalls(), enemies:[makeEnemy(0),makeEnemy(1)], score:0, highScore:0, threat:1, speedMultiplier:1, texts:[], time:0, events:[], sound:{click() {},cue() {}}, saveHighScore() {} });
      for (let i = 0; i < 100; i++) { const p = game.spawnNode(); assert(!game.walls.some(w => w.overlaps(p,18)), 'Spawn in cover'); assert(p.x >= 18 && p.x <= 782 && p.y >= 18 && p.y <= 582, 'Spawn outside arena'); }
      game.node = game.spawnNode(); for (let i = 0; i < 25; i++) game.collect();
      assert(game.score === 250 && game.threat === 6 && game.enemies.filter(e=>!e.isBoss).length === 5 && game.enemies.filter(e=>e.isBoss).length === 2, 'Escalation/patrol cap/boss milestones failed');
      assert(Math.abs(game.speedMultiplier - Math.pow(1.08,5)) < 1e-8, 'Speed scaling failed');
    });
    test('Mode resets apply guard counts, settings and independent records', () => {
      const game = Object.create(Game.prototype);
      Object.assign(game, { records:Object.create(null), sound:{setAlert() {},setMusic() {},click() {},cue() {}} });
      game.loadHighScore = function () { this.highScore = this.records[this.difficultyKey] || 0; this.persistedHighScore = this.highScore; };
      game.saveHighScore = function () { this.records[this.difficultyKey] = this.highScore; };
      for (const [key, settings] of Object.entries(DIFFICULTIES)) {
        game.selectedDifficulty=key; game.reset();
        assert(game.enemies.length===settings.units && game.player.difficulty===settings, 'Mode reset settings mismatch');
        assert(game.highScore===0, 'Another mode contaminated record');
        for(let i=0;i<5;i++) game.collect();
        assert(game.score===50 && Math.abs(game.speedMultiplier-(1+settings.escalation))<1e-8, 'Wrong mode escalation');
        assert(game.enemies.every(e=>e.difficulty===settings), 'Spawned guard uses wrong difficulty');
        game.reset(); assert(game.highScore===50 && game.score===0 && game.player.hp===3, 'Reset lost record or health');
      }
    });
    test('Easy, Medium, Hard and God have progressively stronger guards', () => {
      let lastSpeed=0, lastRange=0, lastCooldown=Infinity, lastGrace=Infinity;
      const player=new Player(); player.pos=new Vector2D(750,550);
      for(const difficulty of Object.values(DIFFICULTIES)) {
        const e=new Enemy(1,[new Vector2D(100,100),new Vector2D(700,100),new Vector2D(700,500)],difficulty);
        for(let i=0;i<60;i++) e.update(CONFIG.STEP,{player,walls:[],speedMultiplier:1,onCaught(){}});
        assert(e.vel.length()>lastSpeed && difficulty.detection>lastRange && difficulty.cooldown<lastCooldown, 'Mode pressure not increasing');
        lastSpeed=e.vel.length(); lastRange=difficulty.detection; lastCooldown=difficulty.cooldown;
        e.transition('ATTACK'); assert(e.cooldown===difficulty.cooldown, 'Attack uses wrong cooldown');
        const p=new Player(difficulty); p.damage();
        assert(p.hp===2, 'Wrong mode damage behavior');
        assert(p.invulnerable===difficulty.grace && difficulty.grace<lastGrace, 'Recovery does not get harder');
        lastGrace=difficulty.grace;
      }
    });
    test('Every mode including God loses after three accepted hits', () => {
      for(const difficulty of Object.values(DIFFICULTIES)) {
        const p=new Player(difficulty);
        for(let i=0;i<3;i++) {p.invulnerable=0;assert(p.damage(), 'Hit ignored');assert(!p.damage(), 'Recovery bypassed');}
        assert(p.hp===0 && !p.damage(), 'Incorrect health floor or lethal damage');
      }
    });
    if (report && typeof console !== 'undefined') console.table(results);
    return results;
  }

root.SectorModelTests = runTests;
if(typeof module !== 'undefined' && module.exports) module.exports = runTests;
})(typeof window !== 'undefined' ? window : globalThis);

