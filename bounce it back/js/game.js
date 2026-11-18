/* Bounce it Back — v2
 * Two mirrored paddles keep a ball alive. Every bounce scores, centre hits build a combo,
 * and a miss ends the run. Plain canvas + Web Audio, no build step, no assets.
 */
(() => {
  'use strict';

  // ---------------------------------------------------------------- palette & helpers
  const C = {
    ink: '#1c1b1d', paper: '#f2eee8', rust: '#c4502a', rose: '#d9b8b0',
    sand: '#e6d5b8', sage: '#a9b8a0', slate: '#3d4f6b',
  };
  const FONT_SANS = '"Bricolage Grotesque", system-ui, sans-serif';
  const FONT_SERIF = '"Instrument Serif", Georgia, serif';
  const FONT_MONO = '"Cutive Mono", ui-monospace, monospace';

  const $ = (s) => document.querySelector(s);
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const rand = (a, b) => a + Math.random() * (b - a);
  const damp = (k, dt) => 1 - Math.exp(-k * dt); // frame-rate independent smoothing factor
  const easeOutBack = (t) => { const c = 1.7; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };

  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage unavailable */ } },
  };

  const motionQuery = window.matchMedia ? matchMedia('(prefers-reduced-motion: reduce)') : null;
  let reduced = !!(motionQuery && motionQuery.matches);
  if (motionQuery && motionQuery.addEventListener) motionQuery.addEventListener('change', (e) => { reduced = e.matches; });

  // ---------------------------------------------------------------- DOM
  const canvas = $('#game');
  const ctx = canvas.getContext('2d');
  const el = {
    hud: $('#hud'), score: $('#hud-score'), level: $('#hud-level'), best: $('#hud-best'),
    combo: $('#hud-combo'), mult: $('#hud-mult'),
    chips: { wide: $('.chip[data-power="wide"]'), slow: $('.chip[data-power="slow"]') },
    banner: $('#banner'), bannerNum: $('#banner-num'),
    menu: $('#screen-menu'), pause: $('#screen-pause'), over: $('#screen-over'),
    menuBest: $('#menu-best'),
    overScore: $('#over-score'), overBest: $('#over-best'), overLevel: $('#over-level'),
    overHits: $('#over-hits'), overCombo: $('#over-combo'), overNew: $('#over-newbest'),
    btnPause: $('#btn-pause'), btnMute: $('#btn-mute'),
  };
  const bump = (node) => { node.classList.remove('bump'); void node.offsetWidth; node.classList.add('bump'); };

  // ---------------------------------------------------------------- sound (Web Audio, synthesised)
  const Sfx = {
    ac: null, master: null, muted: store.get('bib.muted', false),
    init() {
      if (this.ac) { if (this.ac.state === 'suspended') this.ac.resume(); return; }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ac = new AC();
      this.master = this.ac.createGain();
      this.master.gain.value = this.muted ? 0 : 0.55;
      this.master.connect(this.ac.destination);
    },
    setMuted(m) {
      this.muted = m;
      store.set('bib.muted', m);
      if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.55, this.ac.currentTime, 0.02);
    },
    tone(freq, dur, { type = 'sine', vol = 0.3, slide = 0, delay = 0, attack = 0.004 } = {}) {
      if (!this.ac || this.muted) return;
      const t = this.ac.currentTime + delay;
      const o = this.ac.createOscillator();
      const g = this.ac.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq, t);
      if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, slide), t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + attack);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(this.master);
      o.start(t);
      o.stop(t + dur + 0.03);
    },
    noise(dur, vol, freq) {
      if (!this.ac || this.muted) return;
      const t = this.ac.currentTime;
      const len = Math.floor(this.ac.sampleRate * dur);
      const buf = this.ac.createBuffer(1, len, this.ac.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = this.ac.createBufferSource();
      const f = this.ac.createBiquadFilter();
      const g = this.ac.createGain();
      src.buffer = buf; f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = 0.8;
      g.gain.value = vol;
      src.connect(f).connect(g).connect(this.master);
      src.start(t);
    },
    // Combo bounces climb a pentatonic scale, so a good streak plays a little melody.
    bounce(step, perfect) {
      const scale = [0, 2, 4, 7, 9];
      const n = scale[step % 5] + 12 * Math.floor(step / 5);
      const f = 220 * Math.pow(2, Math.min(n, 26) / 12);
      this.tone(f, 0.18, { type: 'triangle', vol: 0.32 });
      this.tone(f * 2, 0.07, { type: 'sine', vol: 0.1 });
      if (perfect) this.tone(f * 3, 0.22, { type: 'sine', vol: 0.08, delay: 0.035 });
    },
    wall() { this.tone(160, 0.05, { type: 'square', vol: 0.04, slide: 100 }); },
    pickup() { [0, 4, 7, 12].forEach((n, i) => this.tone(523 * Math.pow(2, n / 12), 0.16, { type: 'triangle', vol: 0.18, delay: i * 0.045 })); },
    level() { [0, 7, 12, 16].forEach((n, i) => this.tone(330 * Math.pow(2, n / 12), 0.28, { type: 'square', vol: 0.06, delay: i * 0.07 })); },
    ballLost() { this.tone(360, 0.3, { type: 'triangle', vol: 0.16, slide: 120 }); },
    lose() { this.tone(300, 0.9, { type: 'sawtooth', vol: 0.12, slide: 45 }); this.noise(0.5, 0.35, 300); },
    best() { [0, 4, 7, 12, 16, 19, 24].forEach((n, i) => this.tone(392 * Math.pow(2, n / 12), 0.3, { type: 'triangle', vol: 0.14, delay: 0.25 + i * 0.06 })); },
    click() { this.tone(660, 0.05, { type: 'sine', vol: 0.12 }); },
  };

  // ---------------------------------------------------------------- layout
  let W = 0, H = 0, DPR = 1;
  const M = {}; // metrics derived from the viewport

  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';

    M.inset = clamp(H * 0.035, 14, 34);
    M.padH = W < 500 ? 10 : 12;
    M.basePadW = clamp(W * 0.22, 88, 190);
    M.ballR = clamp(Math.min(W, H) * 0.011, 6.5, 10);
    M.baseSpeed = clamp(H * 0.62, 330, 600);
    M.topY = M.inset;                    // top edge of top paddle
    M.botY = H - M.inset - M.padH;       // top edge of bottom paddle
    document.documentElement.style.setProperty('--hud-top', (M.inset + M.padH + 14) + 'px');

    pad.tw = M.basePadW * (G.wideT > 0 ? 1.6 : 1);
    if (!pad.w) pad.w = pad.tw;
    pad.x = clamp(pad.x || W / 2, pad.w / 2, W - pad.w / 2);
    if (targetX !== null) targetX = clamp(targetX, 0, W);
    for (const b of balls) { b.r = M.ballR; b.x = clamp(b.x, b.r, W - b.r); b.y = clamp(b.y, M.topY, M.botY); }
    for (const t of targets) { t.x = clamp(t.x, t.r, W - t.r); t.y = clamp(t.y, H * 0.25, H * 0.75); }
  }

  // ---------------------------------------------------------------- state
  const G = {
    state: 'menu',            // menu | playing | paused | dying | over
    score: 0, hits: 0, level: 1, streak: 0, mult: 1, bestMult: 1,
    best: store.get('bib.best', 0),
    time: 0,
    timeScale: 1, hitStop: 0,
    trauma: 0, flash: 0, flashColor: C.rust,
    wideT: 0, slowT: 0, spawnT: 4,
    deathT: 0, focusX: 0, focusY: 0, zoom: 1,
    scorePop: 0, shownScore: 0, bannerT: 0,
    newBest: false,
  };
  const pad = { x: 0, vx: 0, w: 0, tw: 0, tilt: 0, top: { flash: 0, bump: 0 }, bot: { flash: 0, bump: 0 } };
  let balls = [];
  let targets = [];
  let particles = [];
  let rings = [];
  let popups = [];
  let targetX = null;
  const keys = { left: false, right: false };

  // ---------------------------------------------------------------- entities
  function makeBall(x, y, angle, dir, speed) {
    const s = speed || curSpeed();
    return {
      x, y, r: M.ballR,
      vx: s * Math.sin(angle), vy: dir * s * Math.cos(angle),
      trail: [], sq: 0, sqv: 0, spin: 0,
      serve: 0, grow: 0,
    };
  }

  function curSpeed() {
    return M.baseSpeed * Math.min(2.4, 1 + (G.level - 1) * 0.11 + (G.hits % 10) * 0.006);
  }

  const TARGET_TYPES = [
    { type: 'star', w: 50, fill: C.sand, label: '+5' },
    { type: 'wide', w: 18, fill: C.sage, label: 'WIDE' },
    { type: 'multi', w: 16, fill: C.rose, label: 'MULTI-BALL' },
    { type: 'slow', w: 16, fill: C.slate, label: 'SLOW-MO' },
  ];
  function spawnTarget() {
    let pick = Math.random() * TARGET_TYPES.reduce((s, t) => s + t.w, 0);
    let def = TARGET_TYPES[0];
    for (const t of TARGET_TYPES) { pick -= t.w; if (pick <= 0) { def = t; break; } }
    const r = M.ballR * 2.6;
    let x, y, tries = 0;
    do {
      x = rand(Math.max(r + 12, W * 0.12), Math.min(W - r - 12, W * 0.88));
      y = rand(H * 0.3, H * 0.7);
      tries++;
    } while (tries < 8 && targets.some((t) => Math.hypot(t.x - x, t.y - y) < r * 4));
    targets.push({ x, y, r, def, age: 0, life: 9, phase: Math.random() * 6.28 });
  }

  // ---------------------------------------------------------------- effects
  const MAX_PARTICLES = 700;
  function emit(x, y, n, opts = {}) {
    const count = Math.round(n * (reduced ? 0.5 : 1));
    const {
      colors = [C.rust, C.ink, C.sand], speed = [80, 380], angle = 0, spread = Math.PI * 2,
      life = [0.35, 0.8], size = [1.5, 3.5], gravity = 380, drag = 2.2, spark = 0.6,
    } = opts;
    for (let i = 0; i < count; i++) {
      const a = angle + (Math.random() - 0.5) * spread;
      const s = rand(speed[0], speed[1]);
      const l = rand(life[0], life[1]);
      particles.push({
        x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        life: l, max: l, size: rand(size[0], size[1]),
        color: colors[(Math.random() * colors.length) | 0],
        gravity, drag, spark: Math.random() < spark,
      });
    }
    if (particles.length > MAX_PARTICLES) particles.splice(0, particles.length - MAX_PARTICLES);
  }
  function ring(x, y, max, color = C.rust, width = 3, life = 0.45) {
    rings.push({ x, y, max, color, width, life, t: 0 });
  }
  function popup(x, y, text, { size = 26, color = C.ink, life = 0.9, font = FONT_SANS, weight = 800, italic = false } = {}) {
    popups.push({ x: clamp(x, 40, W - 40), y: clamp(y, M.inset + 100, H - M.inset - 50), text, size, color, life, t: 0, font, weight, italic });
  }
  function shake(amount) { G.trauma = Math.min(1, G.trauma + amount); }
  function flash(alpha, color) { G.flash = Math.max(G.flash, alpha); G.flashColor = color; }

  // ---------------------------------------------------------------- game flow
  function setScreen(name) {
    for (const s of [el.menu, el.pause, el.over]) s.classList.remove('show');
    if (name) el[name].classList.add('show');
    document.body.classList.toggle('ui-open', !!name);
    el.btnPause.hidden = G.state !== 'playing';
  }

  function serveBall(dir = 1) {
    const b = makeBall(W / 2, H / 2, rand(-0.45, 0.45), dir);
    b.serve = 0.65; // hovers while it grows in, then launches
    return b;
  }

  function startGame() {
    Sfx.init();
    Sfx.click();
    Object.assign(G, {
      state: 'playing', score: 0, hits: 0, level: 1, streak: 0, mult: 1, bestMult: 1,
      timeScale: 1, hitStop: 0, wideT: 0, slowT: 0, spawnT: 4, deathT: 0, zoom: 1,
      shownScore: 0, newBest: false, flash: 0,
    });
    pad.tw = M.basePadW;
    balls = [serveBall(1)];
    targets = [];
    popups = [];
    el.hud.hidden = false;
    updateHud(true);
    setScreen(null);
  }

  function pauseGame() {
    if (G.state !== 'playing') return;
    G.state = 'paused';
    setScreen('pause');
    $('#btn-resume').focus({ preventScroll: true });
  }
  function resumeGame() {
    if (G.state !== 'paused') return;
    Sfx.init();
    G.state = 'playing';
    setScreen(null);
    lastT = performance.now();
  }
  function toMenu() {
    G.state = 'menu';
    el.hud.hidden = true;
    G.wideT = G.slowT = 0;
    pad.tw = M.basePadW;
    balls = [serveBall(1)];
    targets = [];
    G.zoom = 1;
    el.menuBest.textContent = G.best;
    setScreen('menu');
    $('#btn-play').focus({ preventScroll: true });
  }

  function levelUp() {
    G.level++;
    G.bannerT = 1.5;
    el.bannerNum.textContent = G.level;
    el.banner.classList.remove('show'); void el.banner.offsetWidth; el.banner.classList.add('show');
    Sfx.level();
    flash(0.18, C.sage);
    ring(W / 2, H / 2, Math.max(W, H) * 0.7, C.sage, 6, 0.9);
    bump(el.level);
  }

  function addScore(n) {
    G.score += n;
    G.scorePop = 1;
    bump(el.score);
    if (G.score > G.best && !G.newBest && G.best > 0) {
      G.newBest = true;
      popup(W / 2, H * 0.4, 'new best!', { size: 34, color: C.rust, font: FONT_SERIF, weight: 400, italic: true, life: 1.4 });
    }
  }

  function updateHud(force) {
    el.score.textContent = G.score;
    el.level.textContent = G.level;
    el.best.textContent = Math.max(G.best, G.score);
    el.combo.hidden = G.mult < 2;
    if (force) el.mult.textContent = G.mult;
  }

  // Paddle contact: the hit position decides the bounce angle, so players can aim.
  function hitPaddle(b, which) {
    const isBot = which === 'bot';
    const p = isBot ? pad.bot : pad.top;
    const offset = clamp((b.x - pad.x) / (pad.w / 2), -1, 1);
    const angle = clamp(offset * 1.05 + pad.vx * 0.00006, -1.15, 1.15);
    const speed = curSpeed();
    b.vx = speed * Math.sin(angle);
    b.vy = (isBot ? -1 : 1) * speed * Math.cos(angle);
    b.y = isBot ? M.botY - b.r : M.topY + M.padH + b.r;
    b.sq = 0.85; b.sqv = 0;
    b.spin = offset * 14;

    const perfect = Math.abs(offset) < 0.22;
    const playing = G.state === 'playing';
    p.flash = 1;
    p.bump = 1;

    const dirY = isBot ? -Math.PI / 2 : Math.PI / 2;
    const cy = isBot ? M.botY : M.topY + M.padH;

    if (playing) {
      G.hits++;
      const prevStreak = G.streak;
      G.streak = perfect ? G.streak + 1 : 0;
      G.mult = Math.min(5, 1 + G.streak);
      G.bestMult = Math.max(G.bestMult, G.mult);
      if (G.mult >= 2) { el.mult.textContent = G.mult; bump(el.combo); }
      if (!perfect && prevStreak >= 2) popup(b.x, cy + (isBot ? -60 : 60), 'combo lost', { size: 18, color: C.slate, font: FONT_MONO, weight: 400, life: 0.8 });
      addScore(G.mult);
      popup(b.x, cy + (isBot ? -28 : 28), '+' + G.mult, { size: 22 + G.mult * 5, color: perfect ? C.rust : C.ink });
      if (perfect) popup(b.x, cy + (isBot ? -64 : 64), G.mult >= 2 ? 'perfect ×' + G.mult : 'perfect', { size: 24, color: C.rust, font: FONT_SERIF, weight: 400, italic: true, life: 0.8 });
      if (G.hits % 10 === 0) levelUp();
      updateHud();
      Sfx.bounce(G.streak + Math.min(G.level - 1, 5), perfect);
    }

    const power = playing ? 1 : 0.5;
    emit(b.x, cy, (perfect ? 26 : 14) * power + G.mult * 3, {
      angle: dirY, spread: Math.PI * 0.9, speed: [120, perfect ? 520 : 380],
      colors: perfect ? [C.rust, C.rust, C.sand, C.ink] : [C.ink, C.rust, C.sand],
    });
    ring(b.x, cy, perfect ? 90 : 55, perfect ? C.rust : C.ink, perfect ? 4 : 2.5);
    if (playing) {
      shake(perfect ? 0.32 : 0.18);
      if (perfect) { G.hitStop = 0.045; flash(0.08, C.rust); }
    }
  }

  function hitWall(b, side) {
    emit(side < 0 ? 0 : W, b.y, 6, { angle: side < 0 ? 0 : Math.PI, spread: 1.4, speed: [60, 220], life: [0.2, 0.4], colors: [C.ink, C.slate] });
    if (G.state === 'playing') { Sfx.wall(); shake(0.05); }
  }

  function collect(t, b) {
    const playing = G.state === 'playing';
    t.dead = true;
    emit(t.x, t.y, 34, { colors: [t.def.fill, C.ink, C.paper], speed: [100, 460], gravity: 120 });
    ring(t.x, t.y, t.r * 5, t.def.fill === C.sand ? C.rust : t.def.fill, 5, 0.55);
    ring(t.x, t.y, t.r * 3, C.ink, 2, 0.4);
    if (!playing) return;
    Sfx.pickup();
    shake(0.2);
    switch (t.def.type) {
      case 'star': {
        const pts = 5 * G.mult;
        addScore(pts);
        updateHud();
        popup(t.x, t.y - t.r - 10, '+' + pts, { size: 36, color: C.rust });
        break;
      }
      case 'wide':
        G.wideT = 9;
        pad.tw = M.basePadW * 1.6;
        popup(t.x, t.y - t.r - 10, 'wide paddles', { size: 28, color: C.ink, font: FONT_SERIF, weight: 400, italic: true });
        break;
      case 'multi': {
        const room = 5 - balls.length;
        const sp = Math.hypot(b.vx, b.vy);
        const base = Math.atan2(b.vx, Math.sign(b.vy) * b.vy); // angle from vertical
        for (let i = 0; i < Math.min(2, room); i++) {
          const nb = makeBall(b.x, b.y, clamp(base + (i ? 0.55 : -0.55), -1.15, 1.15), Math.sign(b.vy) || 1, sp);
          nb.grow = 1;
          balls.push(nb);
        }
        popup(t.x, t.y - t.r - 10, 'multi-ball', { size: 28, color: C.ink, font: FONT_SERIF, weight: 400, italic: true });
        break;
      }
      case 'slow':
        G.slowT = 6;
        flash(0.15, C.slate);
        popup(t.x, t.y - t.r - 10, 'slow-mo', { size: 28, color: C.slate, font: FONT_SERIF, weight: 400, italic: true });
        break;
    }
  }

  function loseBall(b) {
    const edgeY = b.y > H / 2 ? H : 0;
    const x = clamp(b.x, 10, W - 10);
    if (G.state === 'menu') { balls = [serveBall(1)]; return; }
    if (G.state !== 'playing') return;

    if (balls.length > 1) {
      balls.splice(balls.indexOf(b), 1);
      emit(x, edgeY, 16, { angle: edgeY ? -Math.PI / 2 : Math.PI / 2, spread: 1.6, colors: [C.slate, C.ink] });
      Sfx.ballLost();
      popup(x, edgeY ? H - 70 : 70, 'ball lost', { size: 18, color: C.slate, font: FONT_MONO, weight: 400 });
      shake(0.15);
      return;
    }

    // Final ball: slow-motion death sequence, then the game-over screen.
    G.state = 'dying';
    G.deathT = 0;
    G.focusX = x;
    G.focusY = edgeY ? H - M.inset : M.inset;
    b.dead = true;
    emit(x, G.focusY, 70, { angle: edgeY ? -Math.PI / 2 : Math.PI / 2, spread: 2.2, speed: [150, 700], colors: [C.rust, C.ink, C.rose, C.sand], life: [0.6, 1.4] });
    ring(x, G.focusY, Math.max(W, H) * 0.5, C.rust, 8, 1.2);
    shake(0.9);
    flash(0.45, C.rust);
    Sfx.lose();
    el.btnPause.hidden = true;
  }

  function gameOver() {
    G.state = 'over';
    const isBest = G.score > G.best;
    if (isBest) { G.best = G.score; store.set('bib.best', G.best); }
    el.overScore.textContent = G.score;
    el.overBest.textContent = G.best;
    el.overLevel.textContent = G.level;
    el.overHits.textContent = G.hits;
    el.overCombo.textContent = '×' + G.bestMult;
    el.overNew.hidden = !isBest || G.score === 0;
    el.hud.hidden = true;
    setScreen('over');
    $('#btn-again').focus({ preventScroll: true });
    if (isBest && G.score > 0) {
      Sfx.best();
      for (let i = 0; i < 6; i++) {
        emit(W * (0.1 + i * 0.16), -10, 22, {
          angle: Math.PI / 2, spread: 1.2, speed: [80, 360], gravity: 260, drag: 0.6,
          life: [1.6, 2.8], size: [3, 6], spark: 0, colors: [C.rust, C.sage, C.rose, C.sand, C.slate],
        });
      }
    }
  }

  // ---------------------------------------------------------------- update
  function update(dt) {
    G.time += dt;

    // Time scale: slow-mo power-up, death slow-down, brief hit-stop on perfect hits.
    let tsTarget = G.slowT > 0 ? 0.55 : 1;
    if (G.state === 'dying') tsTarget = 0.12;
    if (G.state === 'over') tsTarget = 0.5;
    G.timeScale = lerp(G.timeScale, tsTarget, damp(G.state === 'dying' ? 10 : 5, dt));
    let sdt = dt * G.timeScale;
    if (G.hitStop > 0) { G.hitStop -= dt; sdt = 0; }
    if (G.state === 'paused') sdt = 0;

    if (G.state === 'dying') {
      G.deathT += dt;
      G.zoom = lerp(G.zoom, reduced ? 1 : 1.12, damp(4, dt));
      if (G.deathT > 1.25) gameOver();
    } else {
      G.zoom = lerp(G.zoom, 1, damp(6, dt));
    }

    // Power-up timers (in game time, so slow-mo stretches them too)
    if (G.state === 'playing') {
      if (G.wideT > 0) { G.wideT -= sdt; if (G.wideT <= 0) { G.wideT = 0; pad.tw = M.basePadW; } }
      if (G.slowT > 0) { G.slowT = Math.max(0, G.slowT - dt); }
      G.spawnT -= sdt;
      if (G.spawnT <= 0) { if (targets.length < 2) spawnTarget(); G.spawnT = rand(3.5, 6.5); }
    }

    // Paddles move in real time, so slow-mo genuinely helps the player.
    if (G.state !== 'paused') updatePaddle(dt);

    // Balls
    for (let i = balls.length - 1; i >= 0; i--) {
      const b = balls[i];
      if (b.dead) continue;
      b.grow = Math.max(0, b.grow - dt * 3);
      // squash spring
      b.sqv += (-520 * b.sq - 16 * b.sqv) * sdt;
      b.sq += b.sqv * sdt;
      if (b.serve > 0) { b.serve -= sdt; b.trail.length = 0; continue; }
      stepBall(b, sdt);
      if (sdt > 0) {
        b.trail.unshift(b.x, b.y);
        const maxLen = (reduced ? 8 : 16) * 2;
        if (b.trail.length > maxLen) b.trail.length = maxLen;
      }
    }
    if (G.state === 'dying' || G.state === 'over') balls = balls.filter((b) => !b.dead);

    // Targets
    for (const t of targets) {
      t.age += sdt;
      if (t.age > t.life) t.dead = true;
      if (t.dead) continue;
      for (const b of balls) {
        if (b.serve > 0 || b.dead) continue;
        if (Math.hypot(b.x - t.x, b.y - t.y) < t.r + b.r) { collect(t, b); break; }
      }
    }
    targets = targets.filter((t) => !t.dead);

    // Particles
    let n = 0;
    for (const p of particles) {
      p.life -= sdt;
      if (p.life <= 0) continue;
      const d = Math.exp(-p.drag * sdt);
      p.vx *= d; p.vy = p.vy * d + p.gravity * sdt;
      p.x += p.vx * sdt; p.y += p.vy * sdt;
      particles[n++] = p;
    }
    particles.length = n;

    for (const r of rings) r.t += sdt;
    rings = rings.filter((r) => r.t < r.life);
    if (G.state !== 'paused') for (const p of popups) p.t += dt * (G.state === 'dying' ? 0.4 : 1);
    popups = popups.filter((p) => p.t < p.life);

    pad.top.flash = Math.max(0, pad.top.flash - dt * 4);
    pad.bot.flash = Math.max(0, pad.bot.flash - dt * 4);
    pad.top.bump = lerp(pad.top.bump, 0, damp(14, dt));
    pad.bot.bump = lerp(pad.bot.bump, 0, damp(14, dt));

    G.trauma = Math.max(0, G.trauma - dt * 1.5);
    G.flash = Math.max(0, G.flash - dt * 2.2);
    G.scorePop = Math.max(0, G.scorePop - dt * 4);
    G.bannerT = Math.max(0, G.bannerT - dt);
    G.shownScore = lerp(G.shownScore, G.score, damp(12, dt));

    // Power chips
    setChip('wide', G.state === 'playing' ? G.wideT / 9 : 0);
    setChip('slow', G.state === 'playing' ? G.slowT / 6 : 0);
  }

  function setChip(name, p) {
    const chip = el.chips[name];
    const show = p > 0;
    if (chip.hidden === show) chip.hidden = !show;
    if (show) chip.style.setProperty('--p', p.toFixed(3));
  }

  function updatePaddle(dt) {
    const prevX = pad.x;
    if (G.state === 'menu') {
      // Attract mode: an imperfect autopilot chases the ball.
      const b = balls[0];
      if (b) targetX = b.x + Math.sin(G.time * 1.3) * pad.w * 0.32;
    } else if (keys.left || keys.right) {
      const dir = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
      targetX = clamp((targetX === null ? pad.x : targetX) + dir * Math.max(700, W * 1.3) * dt, 0, W);
    }
    pad.w = lerp(pad.w, pad.tw, damp(10, dt));
    if (targetX !== null) pad.x = lerp(pad.x, targetX, damp(G.state === 'menu' ? 8 : 30, dt));
    pad.x = clamp(pad.x, pad.w / 2, W - pad.w / 2);
    pad.vx = dt > 0 ? (pad.x - prevX) / dt : 0;
    pad.tilt = lerp(pad.tilt, clamp(pad.vx / 4000, -0.09, 0.09), damp(12, dt));
  }

  // Sub-stepped so a fast ball can never tunnel through a paddle.
  function stepBall(b, sdt) {
    const sp = Math.hypot(b.vx, b.vy);
    const steps = Math.max(1, Math.ceil((sp * sdt) / (b.r * 0.7)));
    const h = sdt / steps;
    const half = pad.w / 2;
    for (let s = 0; s < steps; s++) {
      const py = b.y;
      b.x += b.vx * h;
      b.y += b.vy * h;

      if (b.x - b.r < 0) { b.x = b.r; b.vx = Math.abs(b.vx); hitWall(b, -1); }
      else if (b.x + b.r > W) { b.x = W - b.r; b.vx = -Math.abs(b.vx); hitWall(b, 1); }

      const inX = b.x >= pad.x - half - b.r * 0.8 && b.x <= pad.x + half + b.r * 0.8;
      if (b.vy > 0 && inX && b.y + b.r >= M.botY && py + b.r <= M.botY + M.padH * 0.6) { hitPaddle(b, 'bot'); continue; }
      if (b.vy < 0 && inX && b.y - b.r <= M.topY + M.padH && py - b.r >= M.topY + M.padH * 0.4) { hitPaddle(b, 'top'); continue; }

      if (b.y - b.r > H + 4 || b.y + b.r < -4) { loseBall(b); return; }
    }
  }

  // ---------------------------------------------------------------- render
  function render() {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.fillStyle = C.paper;
    ctx.fillRect(0, 0, W, H);

    // camera: shake + death zoom
    const mag = reduced ? 0 : G.trauma * G.trauma * 22;
    const ox = (Math.random() * 2 - 1) * mag;
    const oy = (Math.random() * 2 - 1) * mag;
    const fx = G.state === 'dying' || G.state === 'over' ? G.focusX : W / 2;
    const fy = G.state === 'dying' || G.state === 'over' ? G.focusY : H / 2;
    ctx.save();
    ctx.translate(fx + ox, fy + oy);
    ctx.scale(G.zoom, G.zoom);
    ctx.rotate(reduced ? 0 : (Math.random() * 2 - 1) * G.trauma * G.trauma * 0.012);
    ctx.translate(-fx, -fy);

    drawBackground();
    drawDanger();
    for (const r of rings) drawRing(r);
    for (const t of targets) drawTarget(t);
    for (const b of balls) drawTrail(b);
    drawParticles();
    for (const b of balls) drawBall(b);
    drawPaddle(M.topY, pad.top, -1);
    drawPaddle(M.botY, pad.bot, 1);
    for (const p of popups) drawPopup(p);

    ctx.restore();

    if (G.flash > 0.001) {
      ctx.globalAlpha = G.flash * (reduced ? 0.3 : 1);
      ctx.fillStyle = G.flashColor;
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
    }
    if (G.slowT > 0 && G.state === 'playing') drawVignette(Math.min(1, G.slowT) * 0.25, C.slate);
    if (G.state === 'dying') drawVignette(Math.min(1, G.deathT * 2) * 0.35, C.rust);
  }

  function drawBackground() {
    // dot grid
    const gap = W < 500 ? 24 : 32;
    const drift = (G.time * 6) % gap;
    ctx.fillStyle = 'rgba(28,27,29,0.07)';
    for (let y = -gap + drift; y < H + gap; y += gap) {
      for (let x = gap / 2; x < W; x += gap) ctx.fillRect(x - 1, y - 1, 2, 2);
    }
    // centre line
    ctx.strokeStyle = 'rgba(28,27,29,0.10)';
    ctx.lineWidth = 1;
    ctx.setLineDash([6, 10]);
    ctx.beginPath(); ctx.moveTo(0, H / 2); ctx.lineTo(W, H / 2); ctx.stroke();
    ctx.setLineDash([]);

    // giant score numeral behind the play
    if (G.state !== 'menu') {
      const size = Math.min(W * 0.55, H * 0.42);
      const s = 1 + G.scorePop * 0.12;
      ctx.save();
      ctx.translate(W / 2, H / 2);
      ctx.scale(s, s);
      ctx.font = `800 ${size}px ${FONT_SANS}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.globalAlpha = (0.07 + G.scorePop * 0.12) * (G.bannerT > 0 ? 0.25 : 1);
      ctx.fillStyle = G.scorePop > 0.05 ? C.rust : C.ink;
      ctx.fillText(String(Math.round(G.shownScore)), 0, size * 0.04);
      ctx.restore();
    } else {
      // menu: big italic wordmark drifting behind the card
      ctx.save();
      ctx.font = `italic ${Math.min(W * 0.3, 260)}px ${FONT_SERIF}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.globalAlpha = 0.06;
      ctx.fillStyle = C.rust;
      ctx.fillText('bounce', W / 2 + Math.sin(G.time * 0.4) * 30, H / 2);
      ctx.restore();
    }
  }

  // Warm glow on the edge a ball is heading towards, stronger as it gets close.
  function drawDanger() {
    if (G.state !== 'playing') return;
    let top = 0, bot = 0;
    for (const b of balls) {
      if (b.serve > 0) continue;
      if (b.vy > 0) bot = Math.max(bot, clamp((b.y - H * 0.55) / (H * 0.45), 0, 1));
      else top = Math.max(top, clamp((H * 0.45 - b.y) / (H * 0.45), 0, 1));
    }
    const h = Math.min(120, H * 0.15);
    if (bot > 0) {
      const g = ctx.createLinearGradient(0, H, 0, H - h);
      g.addColorStop(0, `rgba(196,80,42,${0.16 * bot})`); g.addColorStop(1, 'rgba(196,80,42,0)');
      ctx.fillStyle = g; ctx.fillRect(0, H - h, W, h);
    }
    if (top > 0) {
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, `rgba(196,80,42,${0.16 * top})`); g.addColorStop(1, 'rgba(196,80,42,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, h);
    }
  }

  function drawVignette(alpha, color) {
    const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.75);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, color);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 1;
  }

  function drawPaddle(y, state, dir) {
    const w = pad.w * (1 + state.bump * 0.08);
    const h = M.padH * (1 - state.bump * 0.25);
    const by = y + dir * state.bump * 7 + (M.padH - h) / 2;
    ctx.save();
    ctx.translate(pad.x, by + h / 2);
    ctx.rotate(pad.tilt * dir * -1);
    // drop shadow
    ctx.fillStyle = 'rgba(28,27,29,0.18)';
    roundRect(-w / 2 + 3, -h / 2 + 3, w, h, h / 2);
    ctx.fill();
    // body
    ctx.fillStyle = state.flash > 0 ? mix(C.ink, C.rust, state.flash) : C.ink;
    roundRect(-w / 2, -h / 2, w, h, h / 2);
    ctx.fill();
    // sweet-spot marker
    ctx.fillStyle = state.flash > 0.3 ? C.paper : C.rust;
    ctx.globalAlpha = 0.9;
    roundRect(-w * 0.11, -h * 0.18, w * 0.22, h * 0.36, h * 0.18);
    ctx.fill();
    ctx.globalAlpha = 1;
    if (G.wideT > 0) {
      ctx.strokeStyle = C.sage;
      ctx.lineWidth = 2;
      roundRect(-w / 2 - 3, -h / 2 - 3, w + 6, h + 6, h);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawTrail(b) {
    const t = b.trail;
    const n = t.length / 2;
    if (n < 2) return;
    ctx.fillStyle = C.rust;
    for (let i = 1; i < n; i++) {
      const k = 1 - i / n;
      ctx.globalAlpha = k * 0.35;
      ctx.beginPath();
      ctx.arc(t[i * 2], t[i * 2 + 1], b.r * (0.25 + 0.75 * k), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawBall(b) {
    if (b.dead) return;
    const sp = Math.hypot(b.vx, b.vy);
    const stretch = 1 + clamp(sp / M.baseSpeed - 1, 0, 1.2) * 0.12;
    let grow = 1;
    if (b.serve > 0) grow = easeOutBack(clamp(1 - b.serve / 0.65, 0, 1));
    else if (b.grow > 0) grow = 1 + b.grow * 0.6;
    const r = b.r * Math.max(0.01, grow);

    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.scale(1 + b.sq * 0.5, 1 - b.sq * 0.42);
    if (sp > 0) { ctx.rotate(Math.atan2(b.vy, b.vx)); ctx.scale(stretch, 1 / stretch); }
    // soft glow
    ctx.fillStyle = 'rgba(196,80,42,0.18)';
    ctx.beginPath(); ctx.arc(0, 0, r * 2.1, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = C.rust;
    ctx.strokeStyle = C.ink;
    ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.restore();
    // highlight (unrotated so the light stays put)
    ctx.fillStyle = 'rgba(242,238,232,0.75)';
    ctx.beginPath(); ctx.arc(b.x - r * 0.35, b.y - r * 0.35, r * 0.28, 0, Math.PI * 2); ctx.fill();

    if (b.serve > 0) {
      // countdown ring while serving
      ctx.strokeStyle = C.ink;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r * 3, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (b.serve / 0.65));
      ctx.stroke();
    }
  }

  function drawTarget(t) {
    const appear = easeOutBack(clamp(t.age / 0.45, 0, 1));
    const remaining = t.life - t.age;
    if (remaining < 1.8 && Math.floor(remaining * 8) % 2 === 0) return; // blink before vanishing
    const pulse = 1 + Math.sin(G.time * 4 + t.phase) * 0.05;
    const r = t.r * appear * pulse;
    const bob = Math.sin(G.time * 2 + t.phase) * 4;
    ctx.save();
    ctx.translate(t.x, t.y + bob);
    // rotating dashed halo
    ctx.rotate(G.time * 0.8 + t.phase);
    ctx.strokeStyle = C.ink;
    ctx.globalAlpha = 0.35;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 6]);
    ctx.beginPath(); ctx.arc(0, 0, r * 1.45, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
    ctx.rotate(-(G.time * 0.8 + t.phase));
    // body
    ctx.fillStyle = t.def.fill;
    ctx.strokeStyle = C.ink;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    drawIcon(t.def.type, r);
    ctx.restore();
  }

  function drawIcon(type, r) {
    const fg = type === 'slow' ? C.paper : C.ink;
    ctx.fillStyle = fg;
    ctx.strokeStyle = fg;
    ctx.lineWidth = Math.max(1.5, r * 0.11);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (type === 'star') {
      ctx.fillStyle = C.rust;
      ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        const rr = i % 2 ? r * 0.26 : r * 0.58;
        ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
      }
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = C.ink; ctx.lineWidth = 1.2; ctx.stroke();
    } else if (type === 'wide') {
      const w = r * 0.55;
      ctx.beginPath();
      ctx.moveTo(-w, 0); ctx.lineTo(w, 0);
      ctx.moveTo(-w + r * 0.22, -r * 0.22); ctx.lineTo(-w, 0); ctx.lineTo(-w + r * 0.22, r * 0.22);
      ctx.moveTo(w - r * 0.22, -r * 0.22); ctx.lineTo(w, 0); ctx.lineTo(w - r * 0.22, r * 0.22);
      ctx.stroke();
    } else if (type === 'multi') {
      for (const [x, y] of [[0, -0.3], [-0.3, 0.22], [0.3, 0.22]]) {
        ctx.beginPath(); ctx.arc(x * r, y * r, r * 0.16, 0, Math.PI * 2); ctx.fill();
      }
    } else if (type === 'slow') {
      ctx.beginPath(); ctx.arc(0, 0, r * 0.5, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -r * 0.32); ctx.moveTo(0, 0); ctx.lineTo(r * 0.22, r * 0.1); ctx.stroke();
    }
  }

  function drawParticles() {
    ctx.lineCap = 'round';
    for (const p of particles) {
      const k = p.life / p.max;
      ctx.globalAlpha = Math.min(1, k * 1.5);
      if (p.spark) {
        ctx.strokeStyle = p.color;
        ctx.lineWidth = p.size * k + 0.4;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - p.vx * 0.03, p.y - p.vy * 0.03);
        ctx.stroke();
      } else {
        ctx.fillStyle = p.color;
        const s = p.size * (0.4 + 0.6 * k);
        ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s);
      }
    }
    ctx.globalAlpha = 1;
  }

  function drawRing(r) {
    const k = r.t / r.life;
    const e = 1 - Math.pow(1 - k, 3);
    ctx.globalAlpha = (1 - k) * 0.8;
    ctx.strokeStyle = r.color;
    ctx.lineWidth = r.width * (1 - k) + 0.5;
    ctx.beginPath();
    ctx.arc(r.x, r.y, Math.max(0.1, r.max * e), 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  function drawPopup(p) {
    const k = p.t / p.life;
    const inT = clamp(p.t / 0.18, 0, 1);
    const s = easeOutBack(inT);
    const y = p.y + (p.y < H / 2 ? 1 : -1) * (1 - Math.pow(1 - k, 2)) * 40; // drift toward centre, away from the HUD
    ctx.save();
    ctx.font = `${p.italic ? 'italic ' : ''}${p.weight} ${p.size}px ${p.font}`;
    const half = ctx.measureText(p.text).width / 2 + 10; // keep the whole word on screen
    ctx.translate(half * 2 > W ? W / 2 : clamp(p.x, half, W - half), y);
    ctx.scale(s, s);
    ctx.globalAlpha = k > 0.7 ? (1 - k) / 0.3 : 1;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 5;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = C.paper;
    ctx.strokeText(p.text, 0, 0);
    ctx.fillStyle = p.color;
    ctx.fillText(p.text, 0, 0);
    ctx.restore();
  }

  function roundRect(x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function mix(a, b, t) {
    const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
    const ch = (s) => Math.round(lerp((pa >> s) & 255, (pb >> s) & 255, t));
    return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
  }

  // ---------------------------------------------------------------- loop
  let lastT = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, Math.max(0, (now - lastT) / 1000));
    lastT = now;
    update(dt);
    render();
    requestAnimationFrame(frame);
  }

  // ---------------------------------------------------------------- input
  window.addEventListener('pointermove', (e) => {
    if (G.state === 'menu') return;
    targetX = e.clientX;
  }, { passive: true });
  canvas.addEventListener('pointerdown', (e) => {
    if (G.state === 'playing') targetX = e.clientX;
  });

  window.addEventListener('keydown', (e) => {
    const k = e.key;
    if (k === 'ArrowLeft' || k === 'a' || k === 'A') { keys.left = true; e.preventDefault(); }
    else if (k === 'ArrowRight' || k === 'd' || k === 'D') { keys.right = true; e.preventDefault(); }
    else if (k === 'm' || k === 'M') { toggleMute(); }
    else if (k === 'p' || k === 'P' || k === 'Escape') {
      if (G.state === 'playing') pauseGame(); else if (G.state === 'paused') resumeGame();
    } else if (k === ' ' || k === 'Enter') {
      // Let focused buttons handle Enter/Space themselves.
      if (document.activeElement && document.activeElement.tagName === 'BUTTON') return;
      e.preventDefault();
      if (G.state === 'menu' || G.state === 'over') startGame();
      else if (G.state === 'paused') resumeGame();
    }
  });
  window.addEventListener('keyup', (e) => {
    const k = e.key;
    if (k === 'ArrowLeft' || k === 'a' || k === 'A') keys.left = false;
    if (k === 'ArrowRight' || k === 'd' || k === 'D') keys.right = false;
  });

  // Pause when the tab or window loses focus.
  window.addEventListener('blur', () => { keys.left = keys.right = false; pauseGame(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) pauseGame(); else lastT = performance.now(); });

  function toggleMute() {
    Sfx.setMuted(!Sfx.muted);
    el.btnMute.setAttribute('aria-pressed', String(Sfx.muted));
    el.btnMute.setAttribute('aria-label', Sfx.muted ? 'Unmute sound (M)' : 'Mute sound (M)');
    if (!Sfx.muted) { Sfx.init(); Sfx.click(); }
  }

  $('#btn-play').addEventListener('click', startGame);
  $('#btn-again').addEventListener('click', startGame);
  $('#btn-resume').addEventListener('click', resumeGame);
  $('#btn-quit').addEventListener('click', toMenu);
  $('#btn-menu').addEventListener('click', toMenu);
  el.btnPause.addEventListener('click', pauseGame);
  el.btnMute.addEventListener('click', (e) => { toggleMute(); e.currentTarget.blur(); });
  // Buttons should not keep focus during play (Space would re-click them).
  for (const b of document.querySelectorAll('.btn')) b.addEventListener('click', () => b.blur());

  window.addEventListener('resize', resize);

  // ---------------------------------------------------------------- boot
  resize();
  el.btnMute.setAttribute('aria-pressed', String(Sfx.muted));
  el.menuBest.textContent = G.best;
  el.best.textContent = G.best;
  balls = [serveBall(1)];
  setScreen('menu');
  requestAnimationFrame((t) => { lastT = t; frame(t); });

  // Small hook for automated checks in the browser console.
  window.__bounce = {
    G, pad, M,
    get balls() { return balls; },
    get targets() { return targets; },
    // Advance the simulation by `seconds` at 60 fps (works even when the tab is in the background).
    step(seconds, onFrame) {
      for (let i = 0; i < Math.round(seconds * 60); i++) { if (onFrame) onFrame(); update(1 / 60); }
      render();
    },
  };
})();
