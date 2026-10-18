/* SECTOR-09 / StateShift. No imports, assets, or runtime dependencies.
 * Physics uses seconds and pixels. Rendering is separate from simulation.
 * The export at the end also permits running the same tests with Node.js.
 */
'use strict';
(function (root) {
  const CONFIG = Object.freeze({ WIDTH: 800, HEIGHT: 600, STEP: 1 / 120,
    PLAYER_SPEED: 170, ENEMY_SPEED: 62, DETECTION_RANGE: 160,
    LOSE_SIGHT_RANGE: 210, ATTACK_RANGE: 35, MAX_ENEMIES: 5,
    MAX_SPEED_MULTIPLIER: 3, MAX_PATROL_SPEED: 153, MAX_CHASE_SPEED: 204,
    MAX_BOSS_CHASE_SPEED: 306, MAX_ATTACK_SPEED: 340 });
  const COLORS = Object.freeze({ PATROL: '#688060', RETURN: '#B89A52',
    CHASE: '#B05252', ATTACK: '#D9D4CC' });
  // God mode is the toughest preset, including the shortest damage recovery.
  const DIFFICULTIES = Object.freeze(Object.fromEntries(Object.entries({
    easy: { label:'EASY', units:1, speed:0.75, detection:125, loss:175, cooldown:1.4, grace:1.8, escalation:0.05, description:'1 guard. Slower movement, shorter sight, longer recovery. Speed +5% per threat level.' },
    medium: { label:'MEDIUM', units:2, speed:1, detection:160, loss:210, cooldown:1.05, grace:1.35, escalation:0.08, description:'2 guards. Standard movement and detection. Speed +8% per threat level.' },
    hard: { label:'HARD', units:3, speed:1.25, detection:190, loss:245, cooldown:0.75, grace:0.9, escalation:0.12, description:'3 guards. Faster pursuit, wider sight, shorter recovery. Speed +12% per threat level.' },
    god: { label:'GOD', units:5, speed:1.45, detection:220, loss:280, cooldown:0.55, grace:0.55, escalation:0.15, description:'Toughest difficulty. 5 elite guards, maximum sight and speed, fastest attacks, only 0.55s recovery. Speed +15% per threat level. 3 hits and you lose.' }
  }).map(([key, value]) => [key, Object.freeze(value)])));
  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
  const compactScore = new Intl.NumberFormat('en', { notation:'compact', maximumFractionDigits:1 });
  const formatScore = value => value < 100000 ? String(value).padStart(4, '0') : compactScore.format(value);
  const Theme=root.SectorTheme || (typeof require==='function'?require('../core/theme.js'):null);
  const palette=()=>Theme.palette();

  /** Euclidean length sqrt(x*x + y*y); normalization preserves heading at unit speed. */
  class Vector2D {
    constructor(x = 0, y = 0) { this.x = x; this.y = y; }
    add(v) { return new Vector2D(this.x + v.x, this.y + v.y); }
    sub(v) { return new Vector2D(this.x - v.x, this.y - v.y); }
    scale(n) { return new Vector2D(this.x * n, this.y * n); }
    length() { return Math.hypot(this.x, this.y); }
    normalized() { const n = this.length(); return n > 1e-8 ? this.scale(1 / n) : new Vector2D(); }
    distance(v) { return this.sub(v).length(); }
    dot(v) { return this.x * v.x + this.y * v.y; }
    lerp(v, t) { return this.scale(1 - t).add(v.scale(t)); }
  }

  class Obstacle {
    constructor(x, y, w, h) {
      if (![x,y,w,h].every(Number.isFinite) || w<=0 || h<=0) throw new RangeError('Obstacle geometry must be finite with positive dimensions');
      Object.assign(this, { x, y, w, h });
    }
    /** Closest point on the AABB gives an exact circle/rectangle overlap test. */
    overlaps(p, radius) {
      return Math.hypot(p.x - clamp(p.x, this.x, this.x + this.w),
        p.y - clamp(p.y, this.y, this.y + this.h)) < radius - 1e-7;
    }
    /** Slab clipping intersects segment parameter t in [0,1] with both axis intervals.
     * Padding expands the rectangle for navigation clearance and whisker rays.
     */
    intersects(a, b, padding = 0) {
      let low = 0, high = 1;
      for (const [start, delta, min, max] of [
        [a.x, b.x - a.x, this.x - padding, this.x + this.w + padding],
        [a.y, b.y - a.y, this.y - padding, this.y + this.h + padding]]) {
        if (Math.abs(delta) < 1e-9) { if (start < min || start > max) return false; }
        else {
          const t1 = (min - start) / delta, t2 = (max - start) / delta;
          low = Math.max(low, Math.min(t1, t2)); high = Math.min(high, Math.max(t1, t2));
          if (low > high) return false;
        }
      }
      return true;
    }
    /** Minimum translation pushes an overlapping circle out along the contact normal.
     * A center inside a wall uses its nearest face, avoiding a zero-length normal.
     */
    resolve(body) {
      const p = body.pos, r = body.radius;
      const near = new Vector2D(clamp(p.x, this.x, this.x + this.w), clamp(p.y, this.y, this.y + this.h));
      const delta = p.sub(near), length = delta.length();
      if (length >= r) return;
      if (length > 1e-8) body.pos = p.add(delta.scale((r - length) / length));
      else {
        const faces = [{ d: p.x - this.x, x: this.x - r, y: p.y },
          { d: this.x + this.w - p.x, x: this.x + this.w + r, y: p.y },
          { d: p.y - this.y, x: p.x, y: this.y - r },
          { d: this.y + this.h - p.y, x: p.x, y: this.y + this.h + r }];
        faces.sort((a, b) => a.d - b.d); body.pos = new Vector2D(faces[0].x, faces[0].y);
      }
    }
    draw(ctx, i) {
      const p=palette();ctx.fillStyle = p.wall; ctx.strokeStyle = p.border; ctx.lineWidth = 2;
      ctx.fillRect(this.x, this.y, this.w, this.h); ctx.strokeRect(this.x, this.y, this.w, this.h);
      ctx.fillStyle = p.wallLabel; ctx.font = '10px "Segoe UI", Arial, sans-serif';
      ctx.fillText(`BLK / 0${i + 1}`, this.x + 10, this.y + 18);
      ctx.strokeStyle = p.fastener; ctx.lineWidth = 1;
      for (const x of [this.x + 6, this.x + this.w - 6]) for (const y of [this.y + 6, this.y + this.h - 6]) {
        ctx.beginPath(); ctx.moveTo(x - 2, y); ctx.lineTo(x + 2, y); ctx.stroke();
      }
    }
  }

  const hasSight = (a, b, walls, padding = 0) => !walls.some(w => w.intersects(a, b, padding));
  const circlesTouch = (a, ar, b, br) => a.distance(b) <= ar + br;

  /** Clip detection graphics to actual visibility. Rays include each wall corner
   * on either side of its exact angle, so silhouettes have sharp edges rather than
   * a coarse circular approximation bleeding through the cover.
   */
  function sightPolygon(origin, range, walls) {
    const angles = Array.from({ length: 96 }, (_, i) => i * Math.PI * 2 / 96);
    for (const w of walls) for (const x of [w.x, w.x + w.w]) for (const y of [w.y, w.y + w.h]) {
      const a = Math.atan2(y - origin.y, x - origin.x);
      angles.push(a - 0.0001, a, a + 0.0001);
    }
    const ordered = angles.map(a => (a + Math.PI * 2) % (Math.PI * 2)).sort((a, b) => a - b);
    return ordered.map(angle => {
      const direction = new Vector2D(Math.cos(angle), Math.sin(angle)); let distance = range;
      for (const w of walls) {
        let near = 0, far = range;
        for (const [p, d, min, max] of [[origin.x, direction.x, w.x, w.x + w.w], [origin.y, direction.y, w.y, w.y + w.h]]) {
          if (Math.abs(d) < 1e-9) { if (p < min || p > max) { far = -1; break; } }
          else { const a = (min - p) / d, b = (max - p) / d; near = Math.max(near, Math.min(a, b)); far = Math.min(far, Math.max(a, b)); }
        }
        if (near <= far && far >= 0) distance = Math.min(distance, near);
      }
      return origin.add(direction.scale(distance));
    });
  }

  /** Substeps smaller than half a hull radius prevent tunneling. Per-axis contact
   * resolution retains tangential motion: holding diagonally into a wall slides.
   */
  function moveBody(body, displacement, walls) {
    if (![body.pos.x,body.pos.y,body.radius,displacement.x,displacement.y].every(Number.isFinite) || body.radius<=0) throw new RangeError('Invalid physics position, radius or displacement');
    const steps = Math.max(1, Math.ceil(displacement.length() / (body.radius * 0.5)));
    if (!Number.isFinite(steps) || steps>4096) throw new RangeError('Movement exceeds the collision safety limit');
    const d = displacement.scale(1 / steps);
    for (let i = 0; i < steps; i++) {
      body.pos.x += d.x; walls.forEach(w => w.resolve(body));
      body.pos.y += d.y; walls.forEach(w => w.resolve(body));
      body.pos.x = clamp(body.pos.x, body.radius, CONFIG.WIDTH - body.radius);
      body.pos.y = clamp(body.pos.y, body.radius, CONFIG.HEIGHT - body.radius);
    }
  }

  /** Visibility-graph navigation: expanded rectangle corners form a tiny graph.
   * Dijkstra finds a clear path around concave arrangements; whiskers below provide
   * local steering. Only 18 vertices exist for the four-wall arena.
   */
  function findPath(start, goal, walls, radius) {
    const padding = radius + 4;
    if (hasSight(start, goal, walls, radius - 0.001)) return [goal];
    const nodes = [start, goal];
    for (const w of walls) for (const x of [w.x - padding - 1, w.x + w.w + padding + 1])
      for (const y of [w.y - padding - 1, w.y + w.h + padding + 1]) {
        const p = new Vector2D(x, y);
        if (x >= radius && x <= CONFIG.WIDTH - radius && y >= radius && y <= CONFIG.HEIGHT - radius &&
          !walls.some(o => o.overlaps(p, padding))) nodes.push(p);
      }
    const dist = nodes.map(() => Infinity), previous = [], visited = new Set(); dist[0] = 0;
    for (let iteration = 0; iteration < nodes.length; iteration++) {
      let u = -1;
      for (let i = 0; i < nodes.length; i++) if (!visited.has(i) && (u < 0 || dist[i] < dist[u])) u = i;
      if (u < 0 || !Number.isFinite(dist[u])) break;
      if (u === 1) {
        const path = []; for (let v = 1; v !== 0; v = previous[v]) path.unshift(nodes[v]);
        return path;
      }
      visited.add(u);
      for (let v = 0; v < nodes.length; v++) if (!visited.has(v) && hasSight(nodes[u], nodes[v], walls, radius - 0.001)) {
        const cost = dist[u] + nodes[u].distance(nodes[v]);
        if (cost < dist[v]) { dist[v] = cost; previous[v] = u; }
      }
    }
    return []; // Invalid targets safely stop navigation; there is no wall-crossing fallback.
  }

  class Player {
    constructor(difficulty = DIFFICULTIES.medium) { this.difficulty = difficulty; this.pos = new Vector2D(400, 530); this.vel = new Vector2D(); this.radius = 12; this.heading = -Math.PI / 2; this.hp = 3; this.invulnerable = 0; }
    update(dt, keys, walls, touch = null) {
      let direction = new Vector2D(Number(keys.has('d') || keys.has('arrowright')) - Number(keys.has('a') || keys.has('arrowleft')),
        Number(keys.has('s') || keys.has('arrowdown')) - Number(keys.has('w') || keys.has('arrowup'))).normalized();
      if(!direction.length()&&touch&&Number.isFinite(touch.x)&&Number.isFinite(touch.y)){
        direction=new Vector2D(touch.x,touch.y);if(direction.length()>1)direction=direction.normalized();
      }
      this.vel = direction.scale(CONFIG.PLAYER_SPEED);
      if (direction.length()) {
        const target = Math.atan2(direction.y, direction.x), delta = target - this.heading;
        this.heading += Math.atan2(Math.sin(delta),Math.cos(delta)) * (1-Math.exp(-18*dt));
      }
      moveBody(this, this.vel.scale(dt), walls); this.invulnerable = Math.max(0, this.invulnerable - dt);
    }
    damage() { if (this.invulnerable > 0 || this.hp <= 0) return false; this.hp--; this.invulnerable = this.difficulty.grace; return true; }
    draw(ctx, time) { drawHull(ctx, this, palette().player, this.invulnerable > 0 && Math.floor(time * 10) % 2 ? 0.35 : 1); }
  }

  class Enemy {
    constructor(id, waypoints, difficulty = DIFFICULTIES.medium) {
      if (!Array.isArray(waypoints) || waypoints.length<3 || !waypoints.every(p=>p && Number.isFinite(p.x) && Number.isFinite(p.y))) throw new TypeError('Enemy requires at least three valid waypoints');
      this.difficulty = difficulty;
      this.id = id; this.waypoints = waypoints; this.waypoint = 0;
      this.pos = new Vector2D(waypoints[0].x, waypoints[0].y);
      this.radius = 12; this.vel = new Vector2D(); this.heading = 0;
      this.state = 'PATROL'; this.cooldown = 0; this.attackTime = 0;
      this.path = []; this.repath = 0; this.whiskers = []; this.target = null;
    }
    transition(state) {
      if (state === this.state) return;
      this.state = state; this.path = []; this.repath = 0;
      if (state === 'ATTACK') { this.attackTime = 0.24; this.cooldown = this.difficulty.cooldown; }
      if (state === 'RETURN') this.waypoint = this.waypoints.reduce((best, p, i, arr) =>
        this.pos.distance(p) < this.pos.distance(arr[best]) ? i : best, 0);
    }
    get sightRange() { return this.state === 'CHASE' || this.state === 'ATTACK' ? this.difficulty.loss : this.difficulty.detection; }
    canSee(player, walls) {
      return this.pos.distance(player.pos) <= this.sightRange && hasSight(this.pos, player.pos, walls);
    }
    /** Cover immediately breaks pursuit. The wider loss radius still implements
     * distance hysteresis in open space, but never grants vision through walls.
     */
    decide(player, walls) {
      const distance = this.pos.distance(player.pos), visible = hasSight(this.pos, player.pos, walls);
      if (this.state === 'ATTACK') {
        if (!visible || distance > this.difficulty.loss) this.transition('RETURN');
        else if (this.attackTime <= 0) this.transition('CHASE');
      } else if (this.state === 'CHASE') {
        if (!visible || distance > this.difficulty.loss) this.transition('RETURN');
        else if (distance < CONFIG.ATTACK_RANGE && visible && this.cooldown <= 0) this.transition('ATTACK');
      } else if (distance <= this.difficulty.detection && visible) this.transition('CHASE');
      else if (this.state === 'RETURN' && this.pos.distance(this.waypoints[this.waypoint]) < 8) this.transition('PATROL');
    }
    /** Sample five whiskers relative to desired heading. Prefer forward progress,
     * penalize impending contacts, then lerp velocity with dt-independent damping.
     */
    steer(direction, walls, lookAhead = 32) {
      if (!direction.length()) { this.whiskers = []; return direction; }
      const heading = Math.atan2(direction.y, direction.x); let best = direction, bestScore = -Infinity;
      this.whiskers = [];
      for (const angle of [0, -0.45, 0.45, -0.9, 0.9]) {
        const ray = new Vector2D(Math.cos(heading + angle), Math.sin(heading + angle));
        const end = this.pos.add(ray.scale(lookAhead));
        const blocked = !hasSight(this.pos, end, walls, this.radius + 1) || end.x < this.radius || end.x > 800 - this.radius || end.y < this.radius || end.y > 600 - this.radius;
        this.whiskers.push({ end, blocked });
        const score = direction.dot(ray) - (blocked ? 3 : 0);
        if (score > bestScore) { bestScore = score; best = blocked ? new Vector2D() : ray; }
      }
      return best;
    }
    update(dt, game) {
      this.cooldown = Math.max(0, this.cooldown - dt); this.attackTime -= dt;
      this.decide(game.player, game.walls);
      const hunting = this.state === 'CHASE' || this.state === 'ATTACK';
      // Aim for contact distance on the approach side, rather than the player's
      // center: a player touching cover must not produce an unreachable AI goal.
      this.target = hunting ? game.player.pos.sub(game.player.pos.sub(this.pos).normalized().scale(this.radius + game.player.radius - 1)) : this.waypoints[this.waypoint];
      if (this.state === 'PATROL' && this.pos.distance(this.target) < 8) {
        this.waypoint = (this.waypoint + 1) % this.waypoints.length; this.target = this.waypoints[this.waypoint]; this.repath = 0;
      }
      this.repath -= dt;
      if (this.repath <= 0) { this.path = findPath(this.pos, this.target, game.walls, this.radius); this.repath = 0.22; }
      while (this.path.length > 1 && this.pos.distance(this.path[0]) < 9) this.path.shift();
      let direction = this.path.length ? this.path[0].sub(this.pos).normalized() : new Vector2D();
      // Close combat stops orbiting but preserves a short, visible lunge.
      if (hunting && this.pos.distance(game.player.pos) < 24 && this.state !== 'ATTACK') direction = new Vector2D();
      const speed = this.movementSpeed(game);
      const lookAhead = this.path.length ? Math.min(32, this.pos.distance(this.path[0])) : 32;
      this.vel = this.vel.lerp(this.steer(direction, game.walls, lookAhead).scale(speed), 1 - Math.exp(-12 * dt));
      moveBody(this, this.vel.scale(dt), game.walls);
      if (this.vel.length() > 1) this.heading = Math.atan2(this.vel.y, this.vel.x);
      if (this.state === 'ATTACK' && circlesTouch(this.pos, this.radius + 3, game.player.pos, game.player.radius) && hasSight(this.pos, game.player.pos, game.walls)) {
        if (game.player.damage()) game.onCaught(this);
      }
    }
    movementSpeed(game) {
      const hunting = this.state === 'CHASE' || this.state === 'ATTACK';
      const desired = CONFIG.ENEMY_SPEED * this.difficulty.speed * game.speedMultiplier * (this.state === 'ATTACK' ? 2.5 : hunting ? 1.35 : 1);
      return Math.min(desired, this.state === 'ATTACK' ? CONFIG.MAX_ATTACK_SPEED : hunting ? CONFIG.MAX_CHASE_SPEED : CONFIG.MAX_PATROL_SPEED);
    }
    draw(ctx, walls) {
      const color = palette().states[this.state];
      ctx.save(); ctx.strokeStyle = palette().route; ctx.lineWidth = 1; ctx.setLineDash([4, 6]);
      ctx.beginPath(); this.waypoints.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.closePath(); ctx.stroke();
      ctx.setLineDash([]);
      for (const p of this.waypoints) { ctx.beginPath(); ctx.moveTo(p.x - 4, p.y); ctx.lineTo(p.x + 4, p.y); ctx.moveTo(p.x, p.y - 4); ctx.lineTo(p.x, p.y + 4); ctx.stroke(); }
      const visibility = sightPolygon(this.pos, this.sightRange, walls);
      ctx.globalAlpha = 0.06; ctx.fillStyle = color; ctx.beginPath();
      visibility.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.closePath(); ctx.fill();
      ctx.globalAlpha = 0.42; ctx.strokeStyle = color; ctx.setLineDash([4, 6]); ctx.stroke(); ctx.restore();
      drawHull(ctx, this, color);
      ctx.font = '10px "Segoe UI", Arial, sans-serif'; ctx.fillStyle = color; ctx.textAlign = 'center';
      ctx.fillText(`${this.isBoss ? 'WARDEN / ' : 'STATE: '}${this.state}`, clamp(this.pos.x, 60, 740), Math.max(12, this.pos.y - (this.isBoss ? 46 : 23))); ctx.textAlign = 'left';
    }
  }

  class Boss extends Enemy {
    constructor(id, waypoints, difficulty) {
      super(id, waypoints, difficulty); this.isBoss = true; this.radius = 17;
    }
    movementSpeed(game) {
      const hunting = this.state === 'CHASE' || this.state === 'ATTACK';
      // Even Easy's first boss outruns the player's full-speed movement.
      return hunting ? Math.min(this.state === 'ATTACK' ? CONFIG.MAX_ATTACK_SPEED * 1.2 : CONFIG.MAX_BOSS_CHASE_SPEED, Math.max(CONFIG.PLAYER_SPEED * 1.2, super.movementSpeed(game) * 1.8)) : Math.min(CONFIG.MAX_PATROL_SPEED, super.movementSpeed(game) * 1.2);
    }
  }

  function drawHull(ctx, body, color, alpha = 1) {
    ctx.save(); ctx.globalAlpha = alpha; ctx.translate(body.pos.x, body.pos.y); ctx.rotate(body.heading);
    if (body.isBoss) {
      ctx.scale(1.4, 1.4); ctx.strokeStyle = color; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(-14,-12); ctx.lineTo(-19,0); ctx.lineTo(-14,12); ctx.moveTo(-20,-12); ctx.lineTo(-25,0); ctx.lineTo(-20,12); ctx.stroke();
    }
    ctx.fillStyle = color; ctx.strokeStyle = palette().border; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(14, 0); ctx.lineTo(-10, -10); ctx.lineTo(-6, 0); ctx.lineTo(-10, 10); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = '#eef1ea'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(1, 0); ctx.lineTo(21, 0); ctx.stroke(); ctx.restore();
  }

  class FloatingText {
    constructor(pos) { this.pos = new Vector2D(pos.x, pos.y); this.life = 0.8; }
    update(dt) { this.life -= dt; this.pos.y -= dt * 22; }
    draw(ctx) { ctx.save(); ctx.globalAlpha = Math.max(0, this.life / 0.8); ctx.fillStyle = palette().node; ctx.font = '12px "Segoe UI", Arial, sans-serif'; ctx.fillText('+10', this.pos.x - 10, this.pos.y); ctx.restore(); }
  }

  const SoundSystem = root.SectorSoundSystem || (typeof require === 'function' ? require('../audio/sound-system.js') : null);

  const makeWalls = () => [new Obstacle(160, 140, 140, 80), new Obstacle(500, 140, 140, 80),
    new Obstacle(160, 350, 140, 90), new Obstacle(500, 350, 140, 90)];
  const routes = [ [[85,85],[380,85],[380,270],[85,270]], [[715,515],[420,515],[420,300],[715,300]],
    [[715,85],[715,270],[420,270],[420,85]], [[85,515],[85,300],[380,300],[380,515]],
    [[350,110],[450,110],[450,480],[350,480]] ];
  function makeEnemy(i, difficulty = DIFFICULTIES.medium) { return new Enemy(i + 1, routes[i].map(([x, y]) => new Vector2D(x, y)), difficulty); }
  function makeBoss(i, difficulty = DIFFICULTIES.medium) {
    const route = [[85,85],[715,85],[715,515],[85,515],[85,300],[715,300],[715,515],[400,515],[400,85]];
    if (i % 2) route.reverse();
    return new Boss(`boss-${i + 1}`, route.map(([x,y]) => new Vector2D(x,y)), difficulty);
  }

  class Game {
    constructor(document) {
      this.document = document; this.canvas = document.getElementById('game'); this.ctx = this.canvas.getContext('2d');
      if (!this.ctx) throw new Error('Canvas 2D context unavailable');
      this.ctx.shadowBlur = 0; this.keys = new Set(); this.sound = root.SectorAudio?.sound || new SoundSystem(); this.diagnostics = false;
      this.mode = 'READY'; this.highScore = 0; this.persistedHighScore = 0; this.testResults = []; this.time = 0; this.accumulator = 0; this.lastFrame = null; this.frameMs = 16.67;
      this.preferences = root.SectorPreferences?.read() || { difficulty:'medium',fullscreen:true,motion:true };
      this.motion = this.preferences.motion && !root.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      document.body.classList.toggle('reduced-motion', !this.motion);
      this.selectedDifficulty = this.preferences.difficulty; this.records = Object.create(null);
      this.reset(); this.bind();this.touchControls=root.SectorTouchControls?new root.SectorTouchControls(this):null; this.showOverlay(); this.updateHUD();
      this.frame = this.frame.bind(this); root.requestAnimationFrame(this.frame);
    }
    reset() {
      this.touchControls?.clear();
      if (!DIFFICULTIES[this.selectedDifficulty]) {
        root.SectorErrors?.report('DIFFICULTY_INVALID',new Error('Invalid difficulty'),{message:'The selected difficulty was invalid. Medium has been selected.'});
        this.selectedDifficulty='medium';
      }
      this.difficultyKey = this.selectedDifficulty; this.difficulty = DIFFICULTIES[this.difficultyKey]; this.loadHighScore();
      this.player = new Player(this.difficulty); this.walls = makeWalls();
      this.enemies = Array.from({length:this.difficulty.units}, (_, i) => makeEnemy(i, this.difficulty));
      this.score = 0; this.threat = 1; this.speedMultiplier = 1; this.texts = []; this.time = 0; this.bossNotice = 0; this.wardenIntroSeen = false;
      this.events = []; this.accumulator = 0; this.alert = false; this.caughtFlash = 0; this.particles = []; this.trail = []; this.trailClock = 0; this.collectPulse = null;
      this.sound.setAlert(false); this.nodes = []; this.pickupTarget = Math.random() < 0.5 ? 2 : 3; this.fillNodes(); this.log(`${this.difficulty.label} / ${this.enemies.length} SECURITY UNITS`);
    }
    bind() {
      const controls = [' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'w', 'a', 's', 'd', 'p', 'escape', 't', 'm', 'r', 'f'];
      root.addEventListener('keydown', event => {
        if (event.ctrlKey || event.metaKey || event.altKey) return;
        if (event.key === 'Tab' && !this.document.getElementById('overlay').hidden) {
          const overlay = this.document.getElementById('overlay');
          const items = [...overlay.querySelectorAll('a[href],button:not(:disabled),select')].filter(e => e.getClientRects().length);
          const first = items[0], last = items[items.length - 1], active = this.document.activeElement;
          if (first && (!overlay.contains(active) || event.shiftKey && active === first || !event.shiftKey && active === last)) {
            event.preventDefault(); (event.shiftKey ? last : first).focus();
          }
          return;
        }
        // Keep native Enter/Space activation available for the accessible button.
        if (event.target && event.target.tagName === 'BUTTON' && (event.key === ' ' || event.key === 'Enter')) return;
        // Native selection keys must never start a run or move the player.
        if (event.target && event.target.tagName === 'SELECT') return;
        const key = event.key.toLowerCase(); if (!controls.includes(key)) return;
        event.preventDefault(); this.keys.add(key); if (event.repeat) return;
        if (key === ' ' && this.mode === 'WARDEN_INTRO') this.continueWarden();
        else if (key === ' ' && this.mode === 'READY') this.start();
        else if (key === 'r' && this.mode === 'OVER') this.start();
        else if (key === 'p' || key === 'escape') this.togglePause();
        else if (key === 'm') this.toggleMute();
        else if (key === 'f') this.toggleFullscreen();
        else if (key === 't') {
          this.diagnostics = !this.diagnostics;
          if (this.diagnostics) {
            this.testResults = runTests(); this.log(`DIAGNOSTICS / ${this.testResults.filter(t => t.pass).length} OF ${this.testResults.length} PASS`);
            const failures=this.testResults.filter(t=>!t.pass);
            if(failures.length) root.SectorErrors?.report('SELF_TEST_FAILED',new Error(failures.map(t=>t.test).join(', ')),{message:'A diagnostic check failed. Reload the game before continuing.'});
          }
        }
        this.updateHUD();
      });
      root.addEventListener('keyup', event => this.keys.delete(event.key.toLowerCase()));
      root.addEventListener('blur', () => { this.keys.clear(); if (this.mode === 'RUNNING') this.togglePause(); });
      this.document.addEventListener('visibilitychange', () => { if (this.document.hidden) { this.keys.clear(); if (this.mode === 'RUNNING') this.togglePause(); } });
      this.document.getElementById('action').addEventListener('click', () => this.mode === 'WARDEN_INTRO' ? this.continueWarden() : this.mode === 'PAUSED' ? this.togglePause() : this.start());
      this.document.getElementById('fullscreen').addEventListener('click', () => this.toggleFullscreen());
      if(typeof this.document.documentElement.requestFullscreen!=='function'){this.document.getElementById('fullscreen').disabled=true;this.document.getElementById('fullscreen').title='Fullscreen is unavailable in this browser';}
      this.document.getElementById('pause').addEventListener('click', () => this.togglePause());
      root.addEventListener('pagehide',()=>{this.sound.setAlert(false);this.sound.setMusic(false);});
      if(root.matchMedia?.('(max-width: 600px)').matches) this.document.getElementById('controls-panel').open=false;
      this.document.getElementById('difficulty').addEventListener('change', event => {
        if (!['READY','OVER'].includes(this.mode) || !DIFFICULTIES[event.target.value]) return;
        this.selectedDifficulty = event.target.value;
        root.SectorPreferences?.save({difficulty:this.selectedDifficulty});
        if (this.mode === 'READY') this.reset();
        this.showOverlay(); this.updateHUD();
      });
      this.document.getElementById('change-mode').addEventListener('click', () => {
        this.saveHighScore(); this.mode = 'READY'; this.keys.clear(); this.reset(); this.updateAlert(); this.showOverlay(); this.updateHUD();
      });
      this.document.addEventListener('fullscreenchange', () => {
        this.keys.clear(); this.touchControls?.clear(); this.document.getElementById('fullscreen').textContent = this.document.fullscreenElement ? 'EXIT FULLSCREEN [F]' : 'FULLSCREEN [F]';
      });
    }
    start() { if(this.failed) return; const initial = this.mode === 'READY'; this.reset(); this.mode = 'RUNNING'; this.keys.clear(); (root.SectorAudio?root.SectorAudio.start():this.sound.unlock()).then(ready=>{if(ready && this.mode==='RUNNING'){this.sound.cue('start');this.updateAlert();}}); if (initial && this.preferences.fullscreen&&this.document.documentElement.requestFullscreen) this.enterFullscreen(); this.showOverlay(); this.canvas.focus(); this.log('SIMULATION INITIALIZED / RETRIEVE DATA'); this.updateAlert(); this.updateHUD(); }
    toggleMute(){this.sound.applySettings({...this.sound.settings,muted:!this.sound.muted});root.SectorPreferences?.save({muted:this.sound.muted});this.sound.unlock().then(()=>this.updateAlert());this.updateAlert();this.updateHUD();}
    async enterFullscreen() {
      if (this.document.fullscreenElement) return;
      try {
        if (!this.document.documentElement.requestFullscreen) throw new Error('Fullscreen unavailable');
        await this.document.documentElement.requestFullscreen();
      } catch (error) { this.log('FULLSCREEN UNAVAILABLE / WINDOW VIEW ACTIVE');root.SectorErrors?.report('FULLSCREEN',error,{message:'Fullscreen is unavailable here. You can keep playing in this window.'}); }
    }
    async toggleFullscreen() {
      try { if (this.document.fullscreenElement) await this.document.exitFullscreen(); else await this.enterFullscreen(); }
      catch (error) { this.log('FULLSCREEN UNAVAILABLE / WINDOW VIEW ACTIVE');root.SectorErrors?.report('FULLSCREEN',error,{message:'Fullscreen could not be changed. You can keep playing in this window.'}); }
      this.canvas.focus();
    }
    introduceWarden() {
      if (this.wardenIntroSeen || this.mode !== 'RUNNING') return;
      this.wardenIntroSeen = true; this.mode = 'WARDEN_INTRO';
      this.keys.clear(); this.touchControls?.clear(); this.accumulator = 0;
      this.updateAlert(); this.showOverlay(); this.updateHUD();
      this.document.getElementById('action').focus();
    }
    continueWarden() {
      if (this.mode !== 'WARDEN_INTRO' || this.failed) return;
      this.mode = 'RUNNING'; this.keys.clear(); this.touchControls?.clear(); this.accumulator = 0; this.lastFrame = null;
      this.showOverlay(); this.updateAlert(); this.updateHUD(); this.canvas.focus();
    }
    togglePause() { if (!['RUNNING', 'PAUSED'].includes(this.mode)) return; this.mode = this.mode === 'RUNNING' ? 'PAUSED' : 'RUNNING'; this.touchControls?.clear();this.sound.cue('pause'); this.keys.clear(); this.accumulator = 0; this.showOverlay(); if (this.mode === 'RUNNING') {this.canvas.focus();this.sound.unlock().then(()=>this.updateAlert());} this.updateAlert(); this.updateHUD(); }
    onCaught(enemy) {
      this.caughtFlash = 0.3; this.sound.caught();
      this.burst(this.player.pos, '#B05252', 12);
      this.log(`CONTACT / UNIT ${enemy.id} / INTEGRITY ${this.player.hp} OF 3`);
    }
    /** One visibility condition drives the screen and siren, so hiding and pause
     * immediately clear both. No guard stores or pursues a concealed position.
     */
    updateAlert() {
      this.alert = this.mode === 'RUNNING' && this.enemies.some(e => e.canSee(this.player, this.walls));
      this.sound.setAlert(this.alert);
      this.sound.setMusic(!this.failed&&!this.document.hidden);
      this.document.body.classList.toggle('alert', this.alert);
      const text = this.alert ? 'ALERT / YOU ARE VISIBLE' : 'SECTOR CLEAR';
      const status = this.document.getElementById('alert-status'); if (status.textContent !== text) status.textContent = text;
    }
    showOverlay() {
      this.touchControls?.refresh();
      const get = id => this.document.getElementById(id), over = this.mode === 'OVER', paused = this.mode === 'PAUSED';
      const wasHidden = get('overlay').hidden, changed = get('overlay').dataset.mode !== this.mode;
      get('overlay').dataset.mode=this.mode;
      get('overlay').hidden = this.mode === 'RUNNING';
      for (const element of this.document.querySelectorAll('.field > :not(#overlay), .music-toggle')) element.inert = this.mode !== 'RUNNING';
      get('overlay-tag').textContent = over ? `GAME OVER / ${this.difficulty.label}` : paused ? `PAUSED / ${this.difficulty.label}` : 'SIMULATION / STANDBY';
      get('overlay-title').textContent = over ? 'YOU LOST' : paused ? 'FIELD PAUSED' : 'ENTER THE SECTOR';
      get('overlay-copy').textContent = over ? `The guards caught you. Final score: ${this.score}. ${this.difficulty.label} best: ${this.highScore}. Choose a mode and play again.` : paused ? 'Simulation clock stopped. Resume, or end this run to choose another difficulty.' : 'Retrieve data. Hide behind cover. Choose your difficulty below.';
      get('mode-picker').hidden = !['READY','OVER'].includes(this.mode);
      get('change-mode').hidden = !paused;
      get('difficulty').value = this.selectedDifficulty;
      get('mode-description').textContent = DIFFICULTIES[this.selectedDifficulty].description;
      get('action').textContent = this.touchControls?.enabled ? over?'PLAY AGAIN':paused?'RESUME GAME':'START GAME' : over ? 'PRESS [R] TO RESET SIMULATION' : paused ? 'PRESS [P] TO RESUME' : 'PRESS [SPACE] TO INITIALIZE';
      if (this.mode === 'WARDEN_INTRO') {
        get('overlay-tag').textContent = 'WARNING / NEW THREAT';
        get('overlay-title').textContent = 'MEET THE WARDEN';
        get('overlay-copy').textContent = 'The Warden has replaced all normal guards. It patrols the whole arena and outruns you in a chase. Use concrete cover to break its line of sight. At 150 points, two Wardens arrive; normal patrols return at 200. The game and pickup timers are paused until you continue.';
        get('action').textContent = this.touchControls?.enabled ? 'CONTINUE GAME' : 'CONTINUE GAME [SPACE]';
      }
      if (this.mode !== 'RUNNING' && (wasHidden || changed)) get('action').focus();
    }
    log(message) { this.events.unshift(`${this.time.toFixed(1).padStart(5, '0')} / ${message}`); this.events = this.events.slice(0, 4); }
    /** Rejection sampling has a deterministic grid fallback: spawning always terminates. */
    spawnNode() {
      const visible = this.nodeVisibility();
      const valid = p => visible(p) && !this.walls.some(w => w.overlaps(p, 18)) && p.distance(this.player.pos) > 45 && this.enemies.every(e => p.distance(e.pos) > 38) && (this.nodes || []).every(n => p.distance(n) > 60);
      for (let i = 0; i < 300; i++) { const p = new Vector2D(28 + Math.random() * 744, 28 + Math.random() * 544); if (valid(p)) return p; }
      for (let y = 30; y < 580; y += 25) for (let x = 30; x < 780; x += 25) { const p = new Vector2D(x, y); if (valid(p)) return p; }
      return new Vector2D(30, 30); // Fixed map always has ample valid grid candidates.
    }
    /** Object-fit leaves gutters. Project world points into the actual viewport
     * so UI overlays cannot hide pickups, including a phone's thumb controls. */
    nodeVisibility() {
      if (!this.canvas?.getBoundingClientRect || !this.document?.querySelectorAll) return () => true;
      const field = this.canvas.getBoundingClientRect(), scale = Math.min(field.width / 800, field.height / 600);
      if (!(scale > 0)) return () => true;
      const left = field.left + (field.width - 800 * scale) / 2, top = field.top + (field.height - 600 * scale) / 2;
      const rectangles = [...this.document.querySelectorAll('.status,.game-actions,.music-toggle,#joystick,.touch-actions')].filter(e => e.getClientRects().length).map(e => e.getBoundingClientRect());
      return p => !rectangles.some(r => left+p.x*scale+18*scale > r.left && left+p.x*scale-18*scale < r.right && top+p.y*scale+18*scale > r.top && top+p.y*scale-18*scale < r.bottom);
    }
    ensureNodeVisibility() {
      const visible = this.nodeVisibility(); this.nodes = this.nodes.filter(visible); this.fillNodes();
    }
    /** Keep per-mode records separate. The revised God challenge uses a new bucket
     * so scores from its former invincible version do not count. Migrate the
     * original single record to Medium, including restricted storage.
     */
    loadHighScore() {
      let score = this.records[this.difficultyKey] || 0;
      try {
        const raw = root.localStorage.getItem(`sector09.highScore.${this.difficultyKey === 'god' ? 'god.toughest' : this.difficultyKey}`);
        const value = Number(raw === null && this.difficultyKey === 'medium' ? root.localStorage.getItem('sector09.highScore') : raw);
        if (!Number.isSafeInteger(value) || value<0) throw new Error('Invalid saved high score');
        score = Math.max(score, Math.floor(value));
      } catch (error) { root.SectorErrors?.report('SCORE_READ',error,{message:'Saved scores are unavailable. Your best score will be kept for this page session.'}); }
      this.highScore = score; this.persistedHighScore = score;
    }
    saveHighScore() {
      this.records[this.difficultyKey] = this.highScore;
      if (this.highScore <= this.persistedHighScore) return;
      try { root.localStorage.setItem(`sector09.highScore.${this.difficultyKey === 'god' ? 'god.toughest' : this.difficultyKey}`, String(this.highScore)); this.persistedHighScore = this.highScore; } catch (error) { root.SectorErrors?.report('SCORE_WRITE',error,{message:'Your score could not be saved to this browser. It remains available for this page session.'}); }
    }
    /** Spawn away from the player and other units, starting at that route waypoint. */
    deploy(enemy) {
      const clear = enemy.waypoints.filter(p => this.enemies.every(e => p.distance(e.pos) > enemy.radius + e.radius + 12));
      const waypoint = (clear.length ? clear : enemy.waypoints).reduce((a,b) => a.distance(this.player.pos) > b.distance(this.player.pos) ? a : b);
      enemy.pos = new Vector2D(waypoint.x,waypoint.y); enemy.waypoint = enemy.waypoints.indexOf(waypoint);
      this.enemies.push(enemy);
    }
    fillNodes() {
      this.nodes ||= []; this.pickupTarget ||= 3;
      while (this.nodes.length < this.pickupTarget) {
        const node = this.spawnNode(); node.life = node.duration = 10 + Math.random() * 4; this.nodes.push(node);
      }
    }
    updateNodes(dt) {
      for (const node of this.nodes) node.life -= dt;
      this.nodes = this.nodes.filter(node => node.life > 0); this.fillNodes();
    }
    collect(node = this.nodes[0]) {
      const index = this.nodes.indexOf(node); if (index < 0) return;
      this.nodes.splice(index, 1);
      this.score += 10; this.highScore = Math.max(this.highScore, this.score); this.saveHighScore();
      this.texts.push(new FloatingText(node)); this.sound.click();
      this.burst(node, palette().node, 10);
      if (this.motion) this.collectPulse = { pos:new Vector2D(node.x,node.y), life:0.5 };
      const nextThreat = 1 + Math.floor(this.score / 50);
      if (nextThreat > this.threat) {
        this.threat = nextThreat; this.speedMultiplier = Math.min(CONFIG.MAX_SPEED_MULTIPLIER, Math.pow(1 + this.difficulty.escalation, this.threat - 1));
        const wave = this.score % 200;
        if (wave === 100 || wave === 150) {
          // Two consecutive boss waves replace patrols between 100 and 200 points.
          this.enemies = [];
          for (let i = 0; i < (wave === 100 ? 1 : 2); i++) this.deploy(makeBoss(i, this.difficulty));
          this.bossNotice = 3; this.sound.cue('boss');
          this.log(this.enemies.length + ' WARDEN(S) DEPLOYED / PATROLS RETURN AT ' + (Math.floor(this.score / 200) * 200 + 200));
        } else if (this.enemies.some(e => e.isBoss)) {
          this.enemies = []; this.bossNotice = 0;
          const count = Math.min(CONFIG.MAX_ENEMIES, this.difficulty.units + Math.floor(this.score / 50));
          for (let i = 0; i < count; i++) this.deploy(makeEnemy(i, this.difficulty));
          this.sound.cue('spawn'); this.log('WARDEN WITHDRAWN / NORMAL PATROLS RESTORED');
        } else if (this.enemies.length < CONFIG.MAX_ENEMIES) {
          this.deploy(makeEnemy(this.enemies.length, this.difficulty)); this.sound.cue('spawn');
        }
        this.log('THREAT ' + this.threat + ' / ' + this.enemies.length + ' UNITS');
      }
      this.fillNodes();
      if (this.score === 100) this.introduceWarden();
    }
    update(dt) {
      if (!Number.isFinite(dt) || dt<0) throw new RangeError('Simulation timestep must be finite and nonnegative');
      if (!Number.isSafeInteger(this.score) || this.score<0 || !Number.isInteger(this.player.hp) || this.player.hp<0 || this.player.hp>3 || !Array.isArray(this.nodes) || !this.nodes.length || this.nodes.some(n => !Number.isFinite(n.x) || !Number.isFinite(n.y) || !Number.isFinite(n.life) || !Number.isFinite(n.duration) || n.duration <= 0)) throw new Error('Invalid score, health or collectible state');
      this.time += dt; this.bossNotice = Math.max(0, (this.bossNotice || 0) - dt); this.caughtFlash = Math.max(0, this.caughtFlash - dt); this.player.update(dt, this.keys, this.walls,this.touchControls?.vector);
      for (const enemy of this.enemies) enemy.update(dt, this);
      if (this.player.hp <= 0) { this.mode = 'OVER'; this.sound.cue('over'); this.keys.clear(); this.updateAlert(); this.saveHighScore(); this.log(`YOU LOST / FINAL SCORE ${this.score}`); this.showOverlay(); return; }
      this.updateNodes(dt);
      for (const node of [...this.nodes]) {
        if (circlesTouch(this.player.pos, this.player.radius, node, 7)) this.collect(node);
        if (this.mode === 'WARDEN_INTRO') break;
      }
      this.updateAlert();
      this.texts.forEach(t => t.update(dt)); this.texts = this.texts.filter(t => t.life > 0);
      this.updateEffects(dt);
    }
    burst(pos, color, count) {
      if (!this.motion) return;
      for (let i=0;i<count;i++) { const a=i/count*Math.PI*2; this.particles.push({pos:new Vector2D(pos.x,pos.y),vel:new Vector2D(Math.cos(a),Math.sin(a)).scale(30+Math.random()*40),life:0.45,color}); }
    }
    updateEffects(dt) {
      if (!this.motion) return;
      this.trailClock += dt;
      if (this.player.vel.length()>1 && this.trailClock>0.045) { this.trailClock=0; this.trail.push({pos:new Vector2D(this.player.pos.x,this.player.pos.y),life:0.22}); }
      for (const p of this.particles) { p.life-=dt; p.pos=p.pos.add(p.vel.scale(dt)); }
      for (const p of this.trail) p.life-=dt;
      this.particles=this.particles.filter(p=>p.life>0); this.trail=this.trail.filter(p=>p.life>0);
      if(this.collectPulse && (this.collectPulse.life-=dt)<=0) this.collectPulse=null;
    }
    drawEffects(ctx) {
      if (!this.motion) return;
      ctx.save();
      for(const p of this.trail) { ctx.globalAlpha=p.life/0.22*0.16; ctx.fillStyle=palette().player;ctx.fillRect(p.pos.x-3,p.pos.y-3,6,6); }
      for(const p of this.particles) {ctx.globalAlpha=p.life/0.45;ctx.fillStyle=p.color;ctx.fillRect(p.pos.x-1.5,p.pos.y-1.5,3,3);}
      if(this.collectPulse) { const p=this.collectPulse;ctx.globalAlpha=p.life/0.5;ctx.strokeStyle=palette().node;ctx.lineWidth=1;ctx.beginPath();ctx.arc(p.pos.x,p.pos.y,10+(0.5-p.life)*55,0,Math.PI*2);ctx.stroke(); }
      ctx.restore();
    }
    updateHUD() {
      const get = id => this.document.getElementById(id);
      get('score').textContent = formatScore(this.score); get('high-score').textContent = formatScore(this.highScore);
      get('score').setAttribute('aria-label', `Score ${this.score} points`); get('high-score').setAttribute('aria-label', `Best score ${this.highScore} points`);
      get('integrity').textContent = `${this.player.hp} / 3`; get('threat').textContent = `${this.difficulty.label} / ${String(this.threat).padStart(2, '0')}`;
      get('run-status').textContent = this.mode === 'WARDEN_INTRO' ? 'PAUSED / WARDEN BRIEFING' : this.mode === 'RUNNING' ? this.alert ? 'ALERT / BREAK LINE OF SIGHT' : 'SIMULATION ACTIVE / UNDETECTED' : this.mode === 'READY' ? 'AWAITING INITIALIZATION' : `SIMULATION ${this.mode === 'OVER' ? 'TERMINATED' : 'PAUSED'}`;
      get('pause').disabled=!['RUNNING','PAUSED'].includes(this.mode);
      get('pause').textContent=this.mode==='PAUSED'?'Resume [P]':'Pause [P]';
      const errorCount=root.SectorErrors?.snapshot().length || 0;
      get('diagnostic-status').textContent = `DIAGNOSTICS ${this.diagnostics ? `${this.testResults.filter(t => t.pass).length}/${this.testResults.length} PASS` : 'OFF'} / AUDIO ${this.sound.muted ? 'OFF' : 'ON'} / ISSUES ${errorCount}`;
      this.touchControls?.refresh();
    }
    draw() {
      const ctx = this.ctx; ctx.clearRect(0, 0, 800, 600); ctx.fillStyle = palette().background; ctx.fillRect(0, 0, 800, 600);
      ctx.strokeStyle = palette().grid; ctx.lineWidth = 1; ctx.beginPath();
      for (let x = 40; x < 800; x += 40) { ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, 600); }
      for (let y = 40; y < 600; y += 40) { ctx.moveTo(0, y + 0.5); ctx.lineTo(800, y + 0.5); } ctx.stroke();
      this.enemies.forEach(e => e.draw(ctx, this.walls)); this.walls.forEach((w, i) => w.draw(ctx, i));
      this.drawEffects(ctx);
      for (const node of this.nodes) {
        ctx.save(); ctx.globalAlpha = node.life < 3 ? 0.45 + node.life / 3 * 0.55 : 1;
        ctx.fillStyle = palette().node; ctx.beginPath(); ctx.moveTo(node.x,node.y-7); ctx.lineTo(node.x+7,node.y); ctx.lineTo(node.x,node.y+7); ctx.lineTo(node.x-7,node.y); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = palette().node; ctx.lineWidth = 1.5; ctx.beginPath();
        ctx.arc(node.x,node.y,13,-Math.PI/2,-Math.PI/2 + Math.PI*2*clamp(node.life/node.duration,0,1)); ctx.stroke(); ctx.restore();
      }
      this.player.draw(ctx, this.time); this.texts.forEach(t => t.draw(ctx));
      if (this.time < 5 && (this.mode === 'RUNNING' || this.mode === 'PAUSED')) {
        const x = clamp(this.player.pos.x, 62, 738), y = Math.max(72, this.player.pos.y - 55);
        ctx.save(); ctx.globalAlpha = this.motion ? Math.min(1, 5 - this.time) : 1;
        ctx.fillStyle = palette().panel; ctx.strokeStyle = palette().player; ctx.lineWidth = 1.5;
        ctx.fillRect(x - 59, y - 20, 118, 28); ctx.strokeRect(x - 59, y - 20, 118, 28);
        ctx.fillStyle = palette().text; ctx.font = 'bold 12px "Segoe UI", Arial, sans-serif'; ctx.textAlign = 'center';
        ctx.fillText('YOU ARE HERE', x, y - 2);
        ctx.beginPath(); ctx.moveTo(x, y + 8); ctx.lineTo(this.player.pos.x, this.player.pos.y - 17); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(this.player.pos.x - 4, this.player.pos.y - 22); ctx.lineTo(this.player.pos.x, this.player.pos.y - 17); ctx.lineTo(this.player.pos.x + 4, this.player.pos.y - 22); ctx.stroke();
        ctx.restore();
      }
      if (this.alert || this.caughtFlash > 0) {
        ctx.save(); ctx.fillStyle = '#B05252'; ctx.globalAlpha = this.caughtFlash > 0 ? 0.13 * this.caughtFlash / 0.3 : 0.025;
        ctx.fillRect(0, 0, 800, 600); ctx.globalAlpha = 1; ctx.strokeStyle = '#B05252'; ctx.lineWidth = this.caughtFlash > 0 ? 8 : 3; ctx.strokeRect(2, 2, 796, 596); ctx.restore();
      }
      if (this.bossNotice > 0) {
        ctx.save(); ctx.fillStyle = palette().panel; ctx.fillRect(210,90,380,54);
        ctx.strokeStyle = palette().states.CHASE; ctx.strokeRect(210,90,380,54);
        ctx.textAlign = 'center'; ctx.fillStyle = palette().text; ctx.font = 'bold 16px "Segoe UI", Arial, sans-serif';
        ctx.fillText(this.enemies.length === 2 ? 'TWO WARDENS DEPLOYED' : 'WARDEN DEPLOYED',400,112); ctx.font = '12px "Segoe UI", Arial, sans-serif';
        ctx.fillText('Boss wave / patrols return at ' + (Math.floor(this.score / 200) * 200 + 200),400,132); ctx.restore();
      }
      if (this.diagnostics) this.drawDiagnostics(ctx);
    }
    drawDiagnostics(ctx) {
      ctx.save(); ctx.font = '10px "Segoe UI", Arial, sans-serif'; ctx.lineWidth = 1;
      for (const unit of [this.player, ...this.enemies]) {
        ctx.strokeStyle = '#5C7A99'; ctx.beginPath(); ctx.moveTo(unit.pos.x, unit.pos.y); ctx.lineTo(unit.pos.x + unit.vel.x * 0.35, unit.pos.y + unit.vel.y * 0.35); ctx.stroke();
      }
      for (const e of this.enemies) {
        ctx.strokeStyle = hasSight(e.pos, this.player.pos, this.walls) ? '#688060' : '#B05252';
        ctx.setLineDash([2, 5]); ctx.beginPath(); ctx.moveTo(e.pos.x, e.pos.y); ctx.lineTo(this.player.pos.x, this.player.pos.y); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = palette().text; ctx.fillText(`dist: ${Math.round(e.pos.distance(this.player.pos))}px`, clamp(e.pos.x - 30, 4, 710), clamp(e.pos.y + 30, 30, 580));
        for (const ray of e.whiskers) { ctx.strokeStyle = ray.blocked ? '#B05252' : '#B89A52'; ctx.beginPath(); ctx.moveTo(e.pos.x, e.pos.y); ctx.lineTo(ray.end.x, ray.end.y); ctx.stroke(); }
      }
      ctx.fillStyle = palette().panel; ctx.fillRect(8, 8, 420, 40); ctx.strokeStyle = palette().panelBorder; ctx.strokeRect(8, 8, 420, 40); ctx.fillStyle = palette().text;
      ctx.fillText(`DIAGNOSTICS / FRAME ${this.frameMs.toFixed(2)}ms / PHYSICS 120Hz`, 18, 24);
      ctx.fillText(`TESTS ${this.testResults.filter(t => t.pass).length}/${this.testResults.length} / BLUE: VELOCITY / DASH: LOS / GOLD: WHISKERS`, 18, 39); ctx.restore();
    }
    /** Fixed-step accumulator decouples mechanics from display refresh. A 100ms
     * catch-up limit and focus pause prevent giant teleports after tab suspension.
     */
    frame(timestamp) {
      if(this.failed) return;
      try {
      if (!Number.isFinite(timestamp)) throw new RangeError('Invalid frame timestamp');
      const elapsed = this.lastFrame === null ? 0 : Math.max(0, (timestamp - this.lastFrame) / 1000);
      this.lastFrame = timestamp; this.frameMs += (elapsed * 1000 - this.frameMs) * 0.08;
      if (this.mode === 'RUNNING') {
        this.accumulator += Math.min(elapsed, 0.1);
        while (this.accumulator >= CONFIG.STEP && this.mode === 'RUNNING') { this.update(CONFIG.STEP); this.accumulator -= CONFIG.STEP; }
      } else this.accumulator = 0;
      const signature = [this.mode,this.difficultyKey,this.diagnostics,root.document?.documentElement.dataset.theme,this.canvas?.clientWidth,this.canvas?.clientHeight].join('/');
      const dirty = signature !== this.lastDrawSignature;
      if (dirty && this.mode === 'RUNNING') this.ensureNodeVisibility();
      if (dirty || this.mode === 'RUNNING' && (!this.touchControls?.enabled || !this.lastDraw || timestamp-this.lastDraw>=1000/60-0.5)) {
        this.draw(); this.lastDraw=timestamp; this.lastDrawSignature=signature;
      }
      if (!this.lastHUD || timestamp - this.lastHUD >= 100) { this.updateHUD(); this.lastHUD = timestamp; }
      root.requestAnimationFrame(this.frame);
      } catch(error) { this.fail(error); }
    }
    fail(error) {
      this.failed=true; this.mode='ERROR'; this.keys.clear();this.touchControls?.clear();this.sound.setAlert(false);this.sound.setMusic(false);
      if(root.SectorErrors) root.SectorErrors.report('GAME_LOOP',error,{severity:'fatal',message:'The simulation stopped after an unexpected error. Reload to start a fresh run.'});
      else console.error('[SECTOR-09 / GAME_LOOP]',error);
    }
  }

  /** Tests create fresh model objects; they never mutate the live game or storage.
   * Assertions cover behavior and boundaries rather than mirroring implementation.
   */
  function runTests(report = true) {
    const suite = root.SectorModelTests || (typeof require === 'function' ? require('./self-tests.js') : null);
    if (!suite) throw new Error('Diagnostic test module is missing');
    return suite(api, report);
  }

  const api = { CONFIG, DIFFICULTIES, Vector2D, Player, Enemy, Boss, Obstacle, FloatingText, SoundSystem, Game,
    findPath, hasSight, sightPolygon, circlesTouch, moveBody, makeWalls, makeEnemy, makeBoss, formatScore, runTests };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.Sector09 = api;
  // Startup is owned by core/bootstrap.js after dependency and DOM validation.
})(typeof window !== 'undefined' ? window : globalThis);


