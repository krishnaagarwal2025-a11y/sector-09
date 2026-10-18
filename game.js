/* SECTOR-09 / StateShift. No imports, assets, or runtime dependencies.
 * Physics uses seconds and pixels. Rendering is separate from simulation.
 * The export at the end also permits running the same tests with Node.js.
 */
'use strict';
(function (root) {
  const CONFIG = Object.freeze({ WIDTH: 800, HEIGHT: 600, STEP: 1 / 120,
    PLAYER_SPEED: 170, ENEMY_SPEED: 62, DETECTION_RANGE: 160,
    LOSE_SIGHT_RANGE: 210, ATTACK_RANGE: 35, MAX_ENEMIES: 5 });
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
    constructor(x, y, w, h) { Object.assign(this, { x, y, w, h }); }
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
      ctx.fillStyle = '#4A4E52'; ctx.strokeStyle = '#141517'; ctx.lineWidth = 2;
      ctx.fillRect(this.x, this.y, this.w, this.h); ctx.strokeRect(this.x, this.y, this.w, this.h);
      ctx.fillStyle = '#292c2f'; ctx.font = '10px "Segoe UI", Arial, sans-serif';
      ctx.fillText(`BLK / 0${i + 1}`, this.x + 10, this.y + 18);
      ctx.strokeStyle = '#62666a'; ctx.lineWidth = 1;
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
    const steps = Math.max(1, Math.ceil(displacement.length() / (body.radius * 0.5)));
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
    if (hasSight(start, goal, walls, padding)) return [goal];
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
      for (let v = 0; v < nodes.length; v++) if (!visited.has(v) && hasSight(nodes[u], nodes[v], walls, padding)) {
        const cost = dist[u] + nodes[u].distance(nodes[v]);
        if (cost < dist[v]) { dist[v] = cost; previous[v] = u; }
      }
    }
    return []; // Invalid targets safely stop navigation; there is no wall-crossing fallback.
  }

  class Player {
    constructor(difficulty = DIFFICULTIES.medium) { this.difficulty = difficulty; this.pos = new Vector2D(400, 530); this.vel = new Vector2D(); this.radius = 12; this.heading = -Math.PI / 2; this.hp = 3; this.invulnerable = 0; }
    update(dt, keys, walls) {
      const direction = new Vector2D(Number(keys.has('d') || keys.has('arrowright')) - Number(keys.has('a') || keys.has('arrowleft')),
        Number(keys.has('s') || keys.has('arrowdown')) - Number(keys.has('w') || keys.has('arrowup'))).normalized();
      this.vel = direction.scale(CONFIG.PLAYER_SPEED);
      if (direction.length()) {
        const target = Math.atan2(direction.y, direction.x), delta = target - this.heading;
        this.heading += Math.atan2(Math.sin(delta),Math.cos(delta)) * (1-Math.exp(-18*dt));
      }
      moveBody(this, this.vel.scale(dt), walls); this.invulnerable = Math.max(0, this.invulnerable - dt);
    }
    damage() { if (this.invulnerable > 0 || this.hp <= 0) return false; this.hp--; this.invulnerable = this.difficulty.grace; return true; }
    draw(ctx, time) { drawHull(ctx, this, '#5C7A99', this.invulnerable > 0 && Math.floor(time * 10) % 2 ? 0.35 : 1); }
  }

  class Enemy {
    constructor(id, waypoints, difficulty = DIFFICULTIES.medium) {
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
    canSee(player, walls) {
      const range = this.state === 'CHASE' || this.state === 'ATTACK' ? this.difficulty.loss : this.difficulty.detection;
      return this.pos.distance(player.pos) <= range && hasSight(this.pos, player.pos, walls);
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
    steer(direction, walls) {
      if (!direction.length()) { this.whiskers = []; return direction; }
      const heading = Math.atan2(direction.y, direction.x); let best = direction, bestScore = -Infinity;
      this.whiskers = [];
      for (const angle of [0, -0.45, 0.45, -0.9, 0.9]) {
        const ray = new Vector2D(Math.cos(heading + angle), Math.sin(heading + angle));
        const end = this.pos.add(ray.scale(32));
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
      this.target = hunting ? game.player.pos : this.waypoints[this.waypoint];
      if (this.state === 'PATROL' && this.pos.distance(this.target) < 8) {
        this.waypoint = (this.waypoint + 1) % this.waypoints.length; this.target = this.waypoints[this.waypoint]; this.repath = 0;
      }
      this.repath -= dt;
      if (this.repath <= 0) { this.path = findPath(this.pos, this.target, game.walls, this.radius); this.repath = 0.22; }
      while (this.path.length > 1 && this.pos.distance(this.path[0]) < 9) this.path.shift();
      let direction = this.path.length ? this.path[0].sub(this.pos).normalized() : new Vector2D();
      // Close combat stops orbiting but preserves a short, visible lunge.
      if (hunting && this.pos.distance(game.player.pos) < 24 && this.state !== 'ATTACK') direction = new Vector2D();
      const speed = CONFIG.ENEMY_SPEED * this.difficulty.speed * game.speedMultiplier * (this.state === 'ATTACK' ? 2.5 : hunting ? 1.35 : 1);
      this.vel = this.vel.lerp(this.steer(direction, game.walls).scale(speed), 1 - Math.exp(-12 * dt));
      moveBody(this, this.vel.scale(dt), game.walls);
      if (this.vel.length() > 1) this.heading = Math.atan2(this.vel.y, this.vel.x);
      if (this.state === 'ATTACK' && circlesTouch(this.pos, this.radius + 3, game.player.pos, game.player.radius) && hasSight(this.pos, game.player.pos, game.walls)) {
        if (game.player.damage()) game.onCaught(this);
      }
    }
    draw(ctx, walls) {
      const color = COLORS[this.state];
      ctx.save(); ctx.strokeStyle = '#32363A'; ctx.lineWidth = 1; ctx.setLineDash([4, 6]);
      ctx.beginPath(); this.waypoints.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.closePath(); ctx.stroke();
      ctx.setLineDash([]);
      for (const p of this.waypoints) { ctx.beginPath(); ctx.moveTo(p.x - 4, p.y); ctx.lineTo(p.x + 4, p.y); ctx.moveTo(p.x, p.y - 4); ctx.lineTo(p.x, p.y + 4); ctx.stroke(); }
      const visibility = sightPolygon(this.pos, this.difficulty.detection, walls);
      ctx.globalAlpha = 0.06; ctx.fillStyle = color; ctx.beginPath();
      visibility.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.closePath(); ctx.fill();
      ctx.globalAlpha = 0.42; ctx.strokeStyle = color; ctx.setLineDash([4, 6]); ctx.stroke(); ctx.restore();
      drawHull(ctx, this, color);
      ctx.font = '10px "Segoe UI", Arial, sans-serif'; ctx.fillStyle = color; ctx.textAlign = 'center';
      ctx.fillText(`STATE: ${this.state}`, clamp(this.pos.x, 48, 752), Math.max(12, this.pos.y - 23)); ctx.textAlign = 'left';
    }
  }

  function drawHull(ctx, body, color, alpha = 1) {
    ctx.save(); ctx.globalAlpha = alpha; ctx.translate(body.pos.x, body.pos.y); ctx.rotate(body.heading);
    ctx.fillStyle = color; ctx.strokeStyle = '#141517'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(14, 0); ctx.lineTo(-10, -10); ctx.lineTo(-6, 0); ctx.lineTo(-10, 10); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = '#c5c8c6'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(1, 0); ctx.lineTo(21, 0); ctx.stroke(); ctx.restore();
  }

  class FloatingText {
    constructor(pos) { this.pos = new Vector2D(pos.x, pos.y); this.life = 0.8; }
    update(dt) { this.life -= dt; this.pos.y -= dt * 22; }
    draw(ctx) { ctx.save(); ctx.globalAlpha = Math.max(0, this.life / 0.8); ctx.fillStyle = '#C29B61'; ctx.font = '12px "Segoe UI", Arial, sans-serif'; ctx.fillText('+10', this.pos.x - 10, this.pos.y); ctx.restore(); }
  }

  class SoundSystem {
    constructor() { this.context = null; this.siren = null; this.applySettings(root.SectorPreferences?.read() || { master:0.7, effects:0.8, siren:0.5, muted:false }); }
    applySettings(settings) {
      this.settings = settings; this.muted = settings.muted;
      if (this.masterGain) {
        const now = this.context.currentTime;
        this.masterGain.gain.setTargetAtTime(this.muted ? 0 : settings.master, now, 0.02);
        this.effectsGain.gain.setTargetAtTime(settings.effects, now, 0.02);
        this.sirenGain.gain.setTargetAtTime(settings.siren, now, 0.02);
      }
    }
    /** Audio is created/resumed only from a user gesture. Unsupported audio is silent. */
    unlock() {
      try {
        const Audio = root.AudioContext || root.webkitAudioContext;
        if (!this.context && Audio) {
          this.context = new Audio(); this.masterGain = this.context.createGain();
          this.effectsGain = this.context.createGain(); this.sirenGain = this.context.createGain();
          this.effectsGain.connect(this.masterGain); this.sirenGain.connect(this.masterGain); this.masterGain.connect(this.context.destination);
          this.applySettings(this.settings);
        }
        if (this.context && this.context.state === 'suspended') this.context.resume().catch(() => {});
      } catch (_) { /* Browser policy can disable audio without disabling play. */ }
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
      } catch (_) { /* Audio device removal must not stop simulation. */ }
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
      const enabled = active && !this.muted && this.context && this.context.state === 'running';
      if (!enabled && this.siren) {
        const { carrier, lfo, depth, gain } = this.siren; this.siren = null;
        const now = this.context.currentTime;
        gain.gain.cancelScheduledValues(now); gain.gain.setTargetAtTime(0, now, 0.025);
        carrier.stop(now + 0.15); lfo.stop(now + 0.15);
        carrier.onended = () => { carrier.disconnect(); lfo.disconnect(); depth.disconnect(); gain.disconnect(); };
      }
      if (!enabled || this.siren) return;
      try {
        const carrier = this.context.createOscillator(), lfo = this.context.createOscillator();
        const depth = this.context.createGain(), gain = this.context.createGain(), now = this.context.currentTime;
        carrier.type = 'sine'; carrier.frequency.value = 220;
        lfo.type = 'sine'; lfo.frequency.value = 0.65; depth.gain.value = 45;
        lfo.connect(depth); depth.connect(carrier.frequency); carrier.connect(gain); gain.connect(this.sirenGain);
        gain.gain.setValueAtTime(0, now); gain.gain.linearRampToValueAtTime(0.008, now + 0.18);
        carrier.start(); lfo.start(); this.siren = { carrier, lfo, depth, gain };
      } catch (_) { /* Optional audio never interrupts the simulation. */ }
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
      } catch (_) { /* Graceful fallback if the audio output becomes unavailable. */ }
    }
  }

  const makeWalls = () => [new Obstacle(160, 140, 140, 80), new Obstacle(500, 140, 140, 80),
    new Obstacle(160, 350, 140, 90), new Obstacle(500, 350, 140, 90)];
  const routes = [ [[85,85],[380,85],[380,270],[85,270]], [[715,515],[420,515],[420,300],[715,300]],
    [[715,85],[715,270],[420,270],[420,85]], [[85,515],[85,300],[380,300],[380,515]],
    [[350,110],[450,110],[450,480],[350,480]] ];
  function makeEnemy(i, difficulty = DIFFICULTIES.medium) { return new Enemy(i + 1, routes[i].map(([x, y]) => new Vector2D(x, y)), difficulty); }

  class Game {
    constructor(document) {
      this.document = document; this.canvas = document.getElementById('game'); this.ctx = this.canvas.getContext('2d');
      this.ctx.shadowBlur = 0; this.keys = new Set(); this.sound = new SoundSystem(); this.diagnostics = false;
      this.mode = 'READY'; this.highScore = 0; this.persistedHighScore = 0; this.testResults = []; this.time = 0; this.accumulator = 0; this.lastFrame = null; this.frameMs = 16.67;
      this.preferences = root.SectorPreferences?.read() || { difficulty:'medium',fullscreen:true,motion:true };
      this.motion = this.preferences.motion && !root.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      document.body.classList.toggle('reduced-motion', !this.motion);
      this.selectedDifficulty = this.preferences.difficulty; this.records = Object.create(null);
      this.reset(); this.bind(); this.showOverlay(); this.updateHUD();
      this.frame = this.frame.bind(this); root.requestAnimationFrame(this.frame);
    }
    reset() {
      this.difficultyKey = this.selectedDifficulty; this.difficulty = DIFFICULTIES[this.difficultyKey]; this.loadHighScore();
      this.player = new Player(this.difficulty); this.walls = makeWalls();
      this.enemies = Array.from({length:this.difficulty.units}, (_, i) => makeEnemy(i, this.difficulty));
      this.score = 0; this.threat = 1; this.speedMultiplier = 1; this.texts = []; this.time = 0;
      this.events = []; this.accumulator = 0; this.alert = false; this.caughtFlash = 0; this.particles = []; this.trail = []; this.trailClock = 0; this.collectPulse = null;
      this.sound.setAlert(false); this.node = this.spawnNode(); this.log(`${this.difficulty.label} / ${this.enemies.length} SECURITY UNITS`);
    }
    bind() {
      const controls = [' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'w', 'a', 's', 'd', 'p', 'escape', 't', 'm', 'r', 'f'];
      root.addEventListener('keydown', event => {
        // Keep native Enter/Space activation available for the accessible button.
        if (event.target && event.target.tagName === 'BUTTON' && (event.key === ' ' || event.key === 'Enter')) return;
        // Native selection keys must never start a run or move the player.
        if (event.target && event.target.tagName === 'SELECT') return;
        const key = event.key.toLowerCase(); if (!controls.includes(key)) return;
        event.preventDefault(); this.keys.add(key); if (event.repeat) return;
        if (key === ' ' && this.mode === 'READY') this.start();
        else if (key === 'r' && this.mode === 'OVER') this.start();
        else if (key === 'p' || key === 'escape') this.togglePause();
        else if (key === 'm') { this.sound.applySettings({ ...this.sound.settings, muted:!this.sound.muted }); root.SectorPreferences?.save({muted:this.sound.muted}); this.sound.unlock(); this.updateAlert(); }
        else if (key === 'f') this.toggleFullscreen();
        else if (key === 't') { this.diagnostics = !this.diagnostics; if (this.diagnostics) { this.testResults = runTests(); this.log(`DIAGNOSTICS / ${this.testResults.filter(t => t.pass).length} OF ${this.testResults.length} PASS`); } }
        this.updateHUD();
      });
      root.addEventListener('keyup', event => this.keys.delete(event.key.toLowerCase()));
      root.addEventListener('blur', () => { this.keys.clear(); if (this.mode === 'RUNNING') this.togglePause(); });
      this.document.addEventListener('visibilitychange', () => { if (this.document.hidden) { this.keys.clear(); if (this.mode === 'RUNNING') this.togglePause(); } });
      this.document.getElementById('action').addEventListener('click', () => this.mode === 'PAUSED' ? this.togglePause() : this.start());
      this.document.getElementById('fullscreen').addEventListener('click', () => this.toggleFullscreen());
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
        this.keys.clear(); this.document.getElementById('fullscreen').textContent = this.document.fullscreenElement ? 'EXIT FULLSCREEN [F]' : 'FULLSCREEN [F]';
      });
    }
    start() { const initial = this.mode === 'READY'; this.reset(); this.mode = 'RUNNING'; this.keys.clear(); this.sound.unlock(); this.sound.cue('start'); if (initial && this.preferences.fullscreen) this.enterFullscreen(); this.showOverlay(); this.canvas.focus(); this.log('SIMULATION INITIALIZED / RETRIEVE DATA'); this.updateAlert(); this.updateHUD(); }
    async enterFullscreen() {
      if (this.document.fullscreenElement) return;
      try {
        if (!this.document.documentElement.requestFullscreen) throw new Error('Fullscreen unavailable');
        await this.document.documentElement.requestFullscreen();
      } catch (_) { this.log('FULLSCREEN UNAVAILABLE / WINDOW VIEW ACTIVE'); }
    }
    async toggleFullscreen() {
      try { if (this.document.fullscreenElement) await this.document.exitFullscreen(); else await this.enterFullscreen(); }
      catch (_) { this.log('FULLSCREEN UNAVAILABLE / WINDOW VIEW ACTIVE'); }
      this.canvas.focus();
    }
    togglePause() { if (!['RUNNING', 'PAUSED'].includes(this.mode)) return; this.mode = this.mode === 'RUNNING' ? 'PAUSED' : 'RUNNING'; this.sound.cue('pause'); this.keys.clear(); this.accumulator = 0; this.showOverlay(); if (this.mode === 'RUNNING') this.canvas.focus(); this.updateAlert(); this.updateHUD(); }
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
      this.document.body.classList.toggle('alert', this.alert);
      const text = this.alert ? 'ALERT / YOU ARE VISIBLE' : 'SECTOR CLEAR';
      const status = this.document.getElementById('alert-status'); if (status.textContent !== text) status.textContent = text;
    }
    showOverlay() {
      const get = id => this.document.getElementById(id), over = this.mode === 'OVER', paused = this.mode === 'PAUSED';
      get('overlay').hidden = this.mode === 'RUNNING';
      get('overlay-tag').textContent = over ? `GAME OVER / ${this.difficulty.label}` : paused ? `PAUSED / ${this.difficulty.label}` : 'SIMULATION / STANDBY';
      get('overlay-title').textContent = over ? 'YOU LOST' : paused ? 'FIELD PAUSED' : 'ENTER THE SECTOR';
      get('overlay-copy').textContent = over ? `The guards caught you. Final score: ${this.score}. ${this.difficulty.label} best: ${this.highScore}. Choose a mode and play again.` : paused ? 'Simulation clock stopped. Resume, or end this run to choose another difficulty.' : 'Retrieve data. Hide behind cover. Choose your difficulty below.';
      get('mode-picker').hidden = !['READY','OVER'].includes(this.mode);
      get('change-mode').hidden = !paused;
      get('difficulty').value = this.selectedDifficulty;
      get('mode-description').textContent = DIFFICULTIES[this.selectedDifficulty].description;
      get('action').textContent = over ? 'PRESS [R] TO RESET SIMULATION' : paused ? 'PRESS [P] TO RESUME' : 'PRESS [SPACE] TO INITIALIZE';
    }
    log(message) { this.events.unshift(`${this.time.toFixed(1).padStart(5, '0')} / ${message}`); this.events = this.events.slice(0, 4); }
    /** Rejection sampling has a deterministic grid fallback: spawning always terminates. */
    spawnNode() {
      const valid = p => !this.walls.some(w => w.overlaps(p, 18)) && p.distance(this.player.pos) > 45 && this.enemies.every(e => p.distance(e.pos) > 38);
      for (let i = 0; i < 300; i++) { const p = new Vector2D(28 + Math.random() * 744, 28 + Math.random() * 544); if (valid(p)) return p; }
      for (let y = 30; y < 580; y += 25) for (let x = 30; x < 780; x += 25) { const p = new Vector2D(x, y); if (valid(p)) return p; }
      return new Vector2D(30, 30); // Fixed map always has ample valid grid candidates.
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
        if (Number.isFinite(value)) score = Math.max(score, Math.max(0, Math.floor(value)));
      } catch (_) { /* In-memory per-mode records still work. */ }
      this.highScore = score; this.persistedHighScore = score;
    }
    saveHighScore() {
      this.records[this.difficultyKey] = this.highScore;
      if (this.highScore <= this.persistedHighScore) return;
      try { root.localStorage.setItem(`sector09.highScore.${this.difficultyKey === 'god' ? 'god.toughest' : this.difficultyKey}`, String(this.highScore)); this.persistedHighScore = this.highScore; } catch (_) { /* Session high score still works. */ }
    }
    collect() {
      this.score += 10; this.highScore = Math.max(this.highScore, this.score); this.saveHighScore();
      this.texts.push(new FloatingText(this.node)); this.sound.click();
      this.burst(this.node, '#C29B61', 10);
      if (this.motion) this.collectPulse = { pos:new Vector2D(this.node.x,this.node.y), life:0.5 };
      const nextThreat = 1 + Math.floor(this.score / 50);
      if (nextThreat > this.threat) {
        this.threat = nextThreat; this.speedMultiplier = Math.pow(1 + this.difficulty.escalation, this.threat - 1);
        if (this.enemies.length < CONFIG.MAX_ENEMIES) {
          const enemy = makeEnemy(this.enemies.length, this.difficulty);
          // A new security unit deploys at the safest point on its own route.
          enemy.pos = enemy.waypoints.reduce((a, b) => a.distance(this.player.pos) > b.distance(this.player.pos) ? a : b);
          enemy.pos = new Vector2D(enemy.pos.x, enemy.pos.y); this.enemies.push(enemy);
        }
        this.log(`THREAT ${String(this.threat).padStart(2, '0')} / SPEED +${Math.round(this.difficulty.escalation * 100)}% / ${this.enemies.length} UNITS`);
      }
      this.node = this.spawnNode();
    }
    update(dt) {
      this.time += dt; this.caughtFlash = Math.max(0, this.caughtFlash - dt); this.player.update(dt, this.keys, this.walls);
      for (const enemy of this.enemies) enemy.update(dt, this);
      if (this.player.hp <= 0) { this.mode = 'OVER'; this.sound.cue('over'); this.keys.clear(); this.updateAlert(); this.saveHighScore(); this.log(`YOU LOST / FINAL SCORE ${this.score}`); this.showOverlay(); return; }
      this.updateAlert();
      if (circlesTouch(this.player.pos, this.player.radius, this.node, 7)) this.collect();
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
      for(const p of this.trail) { ctx.globalAlpha=p.life/0.22*0.16; ctx.fillStyle='#5C7A99';ctx.fillRect(p.pos.x-3,p.pos.y-3,6,6); }
      for(const p of this.particles) {ctx.globalAlpha=p.life/0.45;ctx.fillStyle=p.color;ctx.fillRect(p.pos.x-1.5,p.pos.y-1.5,3,3);}
      if(this.collectPulse) { const p=this.collectPulse;ctx.globalAlpha=p.life/0.5;ctx.strokeStyle='#C29B61';ctx.lineWidth=1;ctx.beginPath();ctx.arc(p.pos.x,p.pos.y,10+(0.5-p.life)*55,0,Math.PI*2);ctx.stroke(); }
      ctx.restore();
    }
    updateHUD() {
      const get = id => this.document.getElementById(id);
      get('score').textContent = String(this.score).padStart(4, '0'); get('high-score').textContent = String(this.highScore).padStart(4, '0');
      get('integrity').textContent = `${this.player.hp} / 3`; get('threat').textContent = `${this.difficulty.label} / ${String(this.threat).padStart(2, '0')}`;
      get('run-status').textContent = this.mode === 'RUNNING' ? this.alert ? 'ALERT / BREAK LINE OF SIGHT' : 'SIMULATION ACTIVE / UNDETECTED' : this.mode === 'READY' ? 'AWAITING INITIALIZATION' : `SIMULATION ${this.mode === 'OVER' ? 'TERMINATED' : 'PAUSED'}`;
      // All inserted strings are internal constants; logs use textContent below.
      get('states').innerHTML = Object.entries(COLORS).map(([s, c]) => `<div class="state-row"><span class="state-name" style="color:${c}">${s}</span><span>${String(this.enemies.filter(e => e.state === s).length).padStart(2, '0')}</span></div>`).join('');
      get('diagnostic-status').textContent = `DIAGNOSTICS ${this.diagnostics ? `${this.testResults.filter(t => t.pass).length}/${this.testResults.length} PASS` : 'OFF'} / AUDIO ${this.sound.muted ? 'OFF' : 'ON'}`;
      const signature = this.events.join('|');
      if (signature !== this.renderedLog) { get('log').replaceChildren(...this.events.map(event => { const li = this.document.createElement('li'); li.textContent = event; return li; })); this.renderedLog = signature; }
    }
    draw() {
      const ctx = this.ctx; ctx.clearRect(0, 0, 800, 600); ctx.fillStyle = '#1E2022'; ctx.fillRect(0, 0, 800, 600);
      ctx.strokeStyle = '#26292C'; ctx.lineWidth = 1; ctx.beginPath();
      for (let x = 40; x < 800; x += 40) { ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, 600); }
      for (let y = 40; y < 600; y += 40) { ctx.moveTo(0, y + 0.5); ctx.lineTo(800, y + 0.5); } ctx.stroke();
      this.enemies.forEach(e => e.draw(ctx, this.walls)); this.walls.forEach((w, i) => w.draw(ctx, i));
      this.drawEffects(ctx);
      ctx.fillStyle = '#C29B61'; ctx.beginPath(); ctx.moveTo(this.node.x, this.node.y - 7); ctx.lineTo(this.node.x + 7, this.node.y); ctx.lineTo(this.node.x, this.node.y + 7); ctx.lineTo(this.node.x - 7, this.node.y); ctx.closePath(); ctx.fill();
      const nodeSize = this.motion ? 12 + Math.sin(this.time*3)*1.5 : 12;
      ctx.strokeStyle = '#C29B61'; ctx.lineWidth = 1; ctx.strokeRect(this.node.x - nodeSize, this.node.y - nodeSize, nodeSize*2, nodeSize*2);
      this.player.draw(ctx, this.time); this.texts.forEach(t => t.draw(ctx));
      if (this.alert || this.caughtFlash > 0) {
        ctx.save(); ctx.fillStyle = '#B05252'; ctx.globalAlpha = this.caughtFlash > 0 ? 0.13 * this.caughtFlash / 0.3 : 0.025;
        ctx.fillRect(0, 0, 800, 600); ctx.globalAlpha = 1; ctx.strokeStyle = '#B05252'; ctx.lineWidth = this.caughtFlash > 0 ? 8 : 3; ctx.strokeRect(2, 2, 796, 596); ctx.restore();
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
        ctx.fillStyle = '#c5c8c6'; ctx.fillText(`dist: ${Math.round(e.pos.distance(this.player.pos))}px`, clamp(e.pos.x - 30, 4, 710), clamp(e.pos.y + 30, 30, 580));
        for (const ray of e.whiskers) { ctx.strokeStyle = ray.blocked ? '#B05252' : '#B89A52'; ctx.beginPath(); ctx.moveTo(e.pos.x, e.pos.y); ctx.lineTo(ray.end.x, ray.end.y); ctx.stroke(); }
      }
      ctx.fillStyle = '#16181A'; ctx.fillRect(8, 8, 420, 40); ctx.strokeStyle = '#3A3F45'; ctx.strokeRect(8, 8, 420, 40); ctx.fillStyle = '#c5c8c6';
      ctx.fillText(`DIAGNOSTICS / FRAME ${this.frameMs.toFixed(2)}ms / PHYSICS 120Hz`, 18, 24);
      ctx.fillText(`TESTS ${this.testResults.filter(t => t.pass).length}/${this.testResults.length} / BLUE: VELOCITY / DASH: LOS / GOLD: WHISKERS`, 18, 39); ctx.restore();
    }
    /** Fixed-step accumulator decouples mechanics from display refresh. A 100ms
     * catch-up limit and focus pause prevent giant teleports after tab suspension.
     */
    frame(timestamp) {
      const elapsed = this.lastFrame === null ? 0 : Math.max(0, (timestamp - this.lastFrame) / 1000);
      this.lastFrame = timestamp; this.frameMs += (elapsed * 1000 - this.frameMs) * 0.08;
      if (this.mode === 'RUNNING') {
        this.accumulator += Math.min(elapsed, 0.1);
        while (this.accumulator >= CONFIG.STEP && this.mode === 'RUNNING') { this.update(CONFIG.STEP); this.accumulator -= CONFIG.STEP; }
      } else this.accumulator = 0;
      this.draw();
      if (!this.lastHUD || timestamp - this.lastHUD >= 100) { this.updateHUD(); this.lastHUD = timestamp; }
      root.requestAnimationFrame(this.frame);
    }
  }

  /** Tests create fresh model objects; they never mutate the live game or storage.
   * Assertions cover behavior and boundaries rather than mirroring implementation.
   */
  function runTests(report = true) {
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
      Object.assign(game, { difficulty:DIFFICULTIES.medium, player:new Player(), walls:makeWalls(), enemies:[makeEnemy(0),makeEnemy(1)], score:0, highScore:0, threat:1, speedMultiplier:1, texts:[], time:0, events:[], sound:{click() {}}, saveHighScore() {} });
      for (let i = 0; i < 100; i++) { const p = game.spawnNode(); assert(!game.walls.some(w => w.overlaps(p,18)), 'Spawn in cover'); assert(p.x >= 18 && p.x <= 782 && p.y >= 18 && p.y <= 582, 'Spawn outside arena'); }
      game.node = game.spawnNode(); for (let i = 0; i < 25; i++) game.collect();
      assert(game.score === 250 && game.threat === 6 && game.enemies.length === 5, 'Escalation/cap failed');
      assert(Math.abs(game.speedMultiplier - Math.pow(1.08,5)) < 1e-8, 'Speed scaling failed');
    });
    test('Mode resets apply guard counts, settings and independent records', () => {
      const game = Object.create(Game.prototype);
      Object.assign(game, { records:Object.create(null), sound:{setAlert() {}, click() {}} });
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

  const api = { CONFIG, DIFFICULTIES, Vector2D, Player, Enemy, Obstacle, FloatingText, SoundSystem, Game,
    findPath, hasSight, sightPolygon, circlesTouch, moveBody, makeWalls, makeEnemy, runTests };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.Sector09 = api;
  if (typeof document !== 'undefined' && document.getElementById('game')) root.sector09Game = new Game(document);
})(typeof window !== 'undefined' ? window : globalThis);


