/* Bounce it Back — v3
 * Two mirrored paddles keep a ball alive. Every bounce scores, centre hits build a combo,
 * and a miss ends the run. Plain canvas + Web Audio, no build step, no assets.
 */
(() => {
  'use strict';

  // ---------------------------------------------------------------- palette & helpers
  const C = {
    ink: '#1c1b1d', paper: '#f2eee8', rust: '#c4502a', rose: '#d9b8b0',
    sand: '#e6d5b8', sage: '#a9b8a0', slate: '#3d4f6b',
    mist: '#b9c6d6', ochre: '#c9a46b', ember: '#e0892f',
  };
  const FONT_SANS = '"Bricolage Grotesque", system-ui, sans-serif';
  const FONT_SERIF = '"Instrument Serif", Georgia, serif';
  const FONT_MONO = '"Cutive Mono", ui-monospace, monospace';

  const $ = (s) => document.querySelector(s);
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const rand = (a, b) => a + Math.random() * (b - a);
  const damp = (k, dt) => 1 - Math.exp(-k * dt); // frame-rate independent smoothing factor
  // Clamped at 0: at t = 0 floating-point error gives a tiny negative, and arc() throws on a negative radius.
  const easeOutBack = (t) => { const c = 1.7; return Math.max(0, 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2)); };
  const hexRgb = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  const mixRgb = (a, b, t) => a.map((v, i) => lerp(v, b[i], t));

  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage unavailable */ } },
  };

  const motionQuery = window.matchMedia ? matchMedia('(prefers-reduced-motion: reduce)') : null;
  let reduced = !!(motionQuery && motionQuery.matches);
  if (motionQuery && motionQuery.addEventListener) motionQuery.addEventListener('change', (e) => { reduced = e.matches; });
  const finePointer = window.matchMedia ? matchMedia('(pointer: fine)').matches : true;

  // ---------------------------------------------------------------- tuning
  const LEVEL_HITS = 8;          // bounces per level
  const SPEED_START = 0.68;      // level 1 is gentle...
  const SPEED_PER_LEVEL = 0.16;  // ...and every level adds a noticeable kick
  const SPEED_MAX = 2.5;

  // Orbs. `min` is the level they start appearing at; `dur` is seconds of effect.
  const ORBS = {
    star:   { fill: C.sand,  w: 34, min: 1, name: '+5 points', desc: 'Points × your combo' },
    wide:   { fill: C.sage,  w: 14, min: 1, dur: 9, name: 'Wide', desc: 'Bigger paddles' },
    shield: { fill: C.mist,  w: 10, min: 1, name: 'Shield', desc: 'Saves one miss (stacks to 2)' },
    multi:  { fill: C.rose,  w: 12, min: 2, name: 'Multi-ball', desc: 'Two extra balls' },
    slow:   { fill: C.slate, w: 11, min: 2, dur: 6, name: 'Slow-mo', desc: 'Time slows, you don’t' },
    magnet: { fill: C.ochre, w: 10, min: 3, dur: 8, name: 'Magnet', desc: 'Paddles pull the ball in' },
    double: { fill: C.rust,  w: 9,  min: 3, dur: 8, name: 'Double', desc: 'All points ×2, fireball' },
    shrink: { fill: C.ink,   w: 9,  min: 4, dur: 7, name: 'Shrink', desc: 'Bad! Tiny paddles. Steer clear', bad: true },
  };
  const TIMED = Object.keys(ORBS).filter((k) => ORBS[k].dur);

  const UNLOCKS = {
    2: 'new orbs: multi-ball & slow-mo',
    3: 'bumpers appear · magnet & double',
    4: 'careful: shrink orbs now spawn',
    6: 'a second bumper joins in',
  };

  const BADGES = [
    { id: 'bullseye', icon: '◎', name: 'Bullseye', desc: 'Land a perfect centre hit' },
    { id: 'streak', icon: '×5', name: 'Hot streak', desc: 'Reach a ×5 combo' },
    { id: 'lvl5', icon: 'L5', name: 'Speed demon', desc: 'Reach level 5' },
    { id: 'lvl10', icon: 'L10', name: 'Lightspeed', desc: 'Reach level 10' },
    { id: 's100', icon: '100', name: 'Century', desc: 'Score 100 in one run' },
    { id: 's500', icon: '500', name: 'High roller', desc: 'Score 500 in one run' },
    { id: 'circus', icon: '5●', name: 'Circus act', desc: 'Have 5 balls in play at once' },
    { id: 'saved', icon: '⌒', name: 'Close call', desc: 'Let a shield save a ball' },
    { id: 'collector', icon: '✦', name: 'Collector', desc: 'Collect 8 orbs in one run' },
    { id: 'pinball', icon: '⊙', name: 'Pinball wizard', desc: 'Hit bumpers 10 times in one run' },
    { id: 'tiny', icon: '▭', name: 'Tiny but mighty', desc: 'Make 5 bounces while shrunk' },
    { id: 'purist', icon: '○', name: 'Purist', desc: 'Reach level 4 without collecting an orb' },
  ];

  const LEVEL_TINTS = [C.paper, C.sand, C.rose, C.sage, C.mist].map((c, i) => mixRgb(hexRgb(C.paper), hexRgb(c), i ? 0.32 : 0));

  // ---------------------------------------------------------------- DOM
  const canvas = $('#game');
  const ctx = canvas.getContext('2d');
  const el = {
    hud: $('#hud'), score: $('#hud-score'), level: $('#hud-level'), speed: $('#hud-speed'), best: $('#hud-best'),
    combo: $('#hud-combo'), mult: $('#hud-mult'),
    chips: Object.fromEntries([...document.querySelectorAll('.chip')].map((c) => [c.dataset.power, c])),
    banner: $('#banner'), bannerNum: $('#banner-num'), bannerSub: $('#banner-sub'),
    menu: $('#screen-menu'), pause: $('#screen-pause'), over: $('#screen-over'), records: $('#screen-records'),
    menuBest: $('#menu-best'), menuBadges: $('#menu-badges'),
    overScore: $('#over-score'), overBest: $('#over-best'), overLevel: $('#over-level'),
    overHits: $('#over-hits'), overCombo: $('#over-combo'), overNew: $('#over-newbest'),
    nameForm: $('#name-form'), nameInput: $('#name-input'), overRank: $('#over-rank'), rankLine: $('#rank-line'),
    boardList: $('#board-list'), boardEmpty: $('#board-empty'), badgeGrid: $('#badge-grid'), badgeCount: $('#badge-count'),
    orbGrid: $('#orb-grid'),
    toasts: $('#toasts'),
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
    bumper() { this.tone(320, 0.12, { type: 'square', vol: 0.07, slide: 760 }); this.tone(640, 0.08, { type: 'sine', vol: 0.08, delay: 0.02 }); },
    pickup() { [0, 4, 7, 12].forEach((n, i) => this.tone(523 * Math.pow(2, n / 12), 0.16, { type: 'triangle', vol: 0.18, delay: i * 0.045 })); },
    bad() { this.tone(420, 0.35, { type: 'sawtooth', vol: 0.08, slide: 140 }); this.tone(300, 0.35, { type: 'triangle', vol: 0.12, slide: 100, delay: 0.05 }); },
    shield() { this.tone(880, 0.2, { type: 'sine', vol: 0.15 }); this.tone(1320, 0.3, { type: 'sine', vol: 0.1, delay: 0.06 }); },
    shieldBreak() { this.noise(0.25, 0.3, 2400); this.tone(1200, 0.25, { type: 'triangle', vol: 0.15, slide: 400 }); },
    level() { [0, 7, 12, 16].forEach((n, i) => this.tone(330 * Math.pow(2, n / 12), 0.28, { type: 'square', vol: 0.06, delay: i * 0.07 })); },
    badge() { this.tone(988, 0.12, { type: 'triangle', vol: 0.14 }); this.tone(1319, 0.3, { type: 'triangle', vol: 0.14, delay: 0.1 }); },
    ballLost() { this.tone(360, 0.3, { type: 'triangle', vol: 0.16, slide: 120 }); },
    lose() { this.tone(300, 0.9, { type: 'sawtooth', vol: 0.12, slide: 45 }); this.noise(0.5, 0.35, 300); },
    best() { [0, 4, 7, 12, 16, 19, 24].forEach((n, i) => this.tone(392 * Math.pow(2, n / 12), 0.3, { type: 'triangle', vol: 0.14, delay: 0.25 + i * 0.06 })); },
    click() { this.tone(660, 0.05, { type: 'sine', vol: 0.12 }); },
  };

  // ---------------------------------------------------------------- persistence: leaderboard & badges
  const cleanName = (s) => String(s || '').replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim().slice(0, 12).trim();

  const Board = {
    list: (Array.isArray(store.get('bib.board', [])) ? store.get('bib.board', []) : [])
      .filter((e) => e && typeof e.score === 'number' && isFinite(e.score))
      .map((e) => ({ name: cleanName(e.name) || 'Player', score: Math.floor(e.score), level: Math.floor(e.level) || 1, date: +e.date || 0 }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 10),
    qualifies(score) { return score > 0 && (this.list.length < 10 || score > this.list[this.list.length - 1].score); },
    rankOf(score) { const i = this.list.findIndex((e) => score > e.score); return (i === -1 ? this.list.length : i) + 1; },
    add(entry) {
      this.list.push(entry);
      this.list.sort((a, b) => b.score - a.score || a.date - b.date);
      this.list = this.list.slice(0, 10);
      store.set('bib.board', this.list);
      return this.list.indexOf(entry) + 1;
    },
  };

  const earned = new Set((store.get('bib.badges', []) || []).filter((id) => BADGES.some((b) => b.id === id)));
  const toastQueue = [];
  function unlock(id) {
    if (earned.has(id) || G.state === 'menu') return;
    earned.add(id);
    store.set('bib.badges', [...earned]);
    const badge = BADGES.find((b) => b.id === id);
    if (badge) { toastQueue.push(badge); if (toastQueue.length === 1) showToast(); }
  }
  function showToast() {
    const badge = toastQueue[0];
    if (!badge) return;
    const t = document.createElement('div');
    t.className = 'toast';
    const medal = document.createElement('span');
    medal.className = 'medal';
    medal.textContent = badge.icon;
    const txt = document.createElement('div');
    const k = document.createElement('small');
    k.textContent = 'Badge unlocked';
    const b = document.createElement('b');
    b.textContent = badge.name;
    txt.append(k, b);
    t.append(medal, txt);
    el.toasts.append(t);
    Sfx.badge();
    setTimeout(() => t.classList.add('out'), 2300);
    setTimeout(() => { t.remove(); toastQueue.shift(); showToast(); }, 2700);
  }

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
    document.documentElement.style.setProperty('--hud-bottom', (M.inset + M.padH + 18) + 'px');

    if (!pad.w) pad.w = M.basePadW;
    pad.x = clamp(pad.x || W / 2, pad.w / 2, W - pad.w / 2);
    if (targetX !== null) targetX = clamp(targetX, 0, W);
    for (const b of balls) { b.r = M.ballR; b.x = clamp(b.x, b.r, W - b.r); b.y = clamp(b.y, M.topY, M.botY); }
    for (const t of targets) { t.r = M.ballR * 2.6; t.x = clamp(t.x, t.r, W - t.r); t.y = clamp(t.y, H * 0.25, H * 0.75); }
    for (const u of bumpers) { u.r = M.ballR * 3.2; u.y = u.yFrac * H; u.x = clamp(u.x, u.r + 10, W - u.r - 10); }
  }

  // ---------------------------------------------------------------- state
  const G = {
    state: 'menu',            // menu | playing | paused | dying | over
    score: 0, hits: 0, level: 1, streak: 0, mult: 1, bestMult: 1,
    best: Math.max(store.get('bib.best', 0), Board.list.length ? Board.list[0].score : 0),
    time: 0,
    timeScale: 1, hitStop: 0,
    trauma: 0, flash: 0, flashColor: C.rust,
    fx: { wide: 0, slow: 0, magnet: 0, double: 0, shrink: 0 },
    shield: 0,
    spawnT: 4,
    deathT: 0, focusX: 0, focusY: 0, zoom: 1,
    scorePop: 0, shownScore: 0, bannerT: 0,
    newBest: false,
    run: { orbs: 0, bumps: 0, shrinkHits: 0 },
    bg: LEVEL_TINTS[0].slice(),
    pending: false, lastEntry: null, recordsFrom: 'menu',
  };
  const pad = { x: 0, vx: 0, w: 0, tw: 0, tilt: 0, top: { flash: 0, bump: 0 }, bot: { flash: 0, bump: 0 } };
  let balls = [];
  let targets = [];
  let bumpers = [];
  let particles = [];
  let rings = [];
  let popups = [];
  let targetX = null;
  const keys = { left: false, right: false };

  // ---------------------------------------------------------------- entities
  function curSpeed() {
    const k = SPEED_START + (G.level - 1) * SPEED_PER_LEVEL + (G.hits % LEVEL_HITS) * 0.01;
    return M.baseSpeed * Math.min(SPEED_MAX, k);
  }
  const speedLabel = () => (curSpeed() / (M.baseSpeed * SPEED_START)).toFixed(1) + '×';

  function makeBall(x, y, angle, dir, speed) {
    const s = speed || curSpeed();
    return {
      x, y, r: M.ballR,
      vx: s * Math.sin(angle), vy: dir * s * Math.cos(angle),
      trail: [], sq: 0, sqv: 0,
      serve: 0, grow: 0,
    };
  }

  // Keep a ball from ending up in a near-horizontal loop.
  function fixAngle(b) {
    const s = Math.hypot(b.vx, b.vy);
    if (Math.abs(b.vy) < s * 0.4) {
      b.vy = (Math.sign(b.vy) || 1) * s * 0.4;
      b.vx = (Math.sign(b.vx) || 1) * Math.sqrt(s * s - b.vy * b.vy);
    }
  }

  function spawnTarget() {
    const pool = Object.entries(ORBS).filter(([k, o]) => o.min <= G.level && !(k === 'shield' && G.shield >= 2));
    let pick = Math.random() * pool.reduce((s, [, o]) => s + o.w, 0);
    let type = pool[0][0];
    for (const [k, o] of pool) { pick -= o.w; if (pick <= 0) { type = k; break; } }
    const r = M.ballR * 2.6;
    let x, y, tries = 0;
    do {
      x = rand(Math.max(r + 12, W * 0.12), Math.min(W - r - 12, W * 0.88));
      y = rand(H * 0.3, H * 0.7);
      tries++;
    } while (tries < 10 && (targets.some((t) => Math.hypot(t.x - x, t.y - y) < r * 4) || bumpers.some((u) => Math.abs(u.y - y) < u.r + r * 1.5)));
    targets.push({ x, y, r, type, def: ORBS[type], age: 0, life: ORBS[type].bad ? 7 : 9, phase: Math.random() * 6.28 });
  }

  function syncBumpers() {
    const want = G.level >= 6 ? 2 : G.level >= 3 ? 1 : 0;
    while (bumpers.length < want) {
      const i = bumpers.length;
      const r = M.ballR * 3.2;
      const yFrac = i ? 0.64 : 0.4;
      bumpers.push({
        x: rand(W * 0.25, W * 0.75), y: yFrac * H, yFrac, r,
        vx: (Math.random() < 0.5 ? -1 : 1) * rand(45, 75), age: 0, hit: 0,
      });
      ring(bumpers[i].x, bumpers[i].y, r * 4, C.ink, 3, 0.6);
    }
    for (const u of bumpers) u.vx = Math.sign(u.vx) * Math.min(160, 55 + (G.level - 3) * 12);
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
    for (const s of [el.menu, el.pause, el.over, el.records]) s.classList.remove('show');
    if (name) el[name].classList.add('show');
    document.body.classList.toggle('ui-open', !!name);
    el.btnPause.hidden = G.state !== 'playing';
  }

  function serveBall(dir = 1) {
    const b = makeBall(W / 2, H / 2, rand(-0.45, 0.45), dir);
    b.serve = 0.65; // hovers while it grows in, then launches
    return b;
  }

  function resetRun() {
    Object.assign(G, {
      score: 0, hits: 0, level: 1, streak: 0, mult: 1, bestMult: 1,
      timeScale: 1, hitStop: 0, shield: 0, spawnT: 4, deathT: 0, zoom: 1,
      shownScore: 0, newBest: false, flash: 0, bannerT: 0,
      run: { orbs: 0, bumps: 0, shrinkHits: 0 },
    });
    for (const k of TIMED) G.fx[k] = 0;
    targets = [];
    bumpers = [];
    popups = [];
  }

  function startGame() {
    commitPending();
    Sfx.init();
    Sfx.click();
    resetRun();
    G.state = 'playing';
    balls = [serveBall(1)];
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
    commitPending();
    G.state = 'menu';
    el.hud.hidden = true;
    resetRun();
    balls = [serveBall(1)];
    el.menuBest.textContent = G.best;
    el.menuBadges.textContent = `${earned.size}/${BADGES.length}`;
    setScreen('menu');
    $('#btn-play').focus({ preventScroll: true });
  }

  function levelUp() {
    G.level++;
    G.bannerT = 1.5;
    el.bannerNum.textContent = G.level;
    el.bannerSub.textContent = UNLOCKS[G.level] || 'speed ' + speedLabel();
    el.banner.classList.remove('show'); void el.banner.offsetWidth; el.banner.classList.add('show');
    // Speed every ball up right away so each level feels faster.
    const s = curSpeed();
    for (const b of balls) { const k = s / (Math.hypot(b.vx, b.vy) || 1); b.vx *= k; b.vy *= k; }
    syncBumpers();
    Sfx.level();
    flash(0.18, C.sage);
    ring(W / 2, H / 2, Math.max(W, H) * 0.7, C.sage, 6, 0.9);
    bump(el.level);
    bump(el.speed);
    if (G.level >= 5) unlock('lvl5');
    if (G.level >= 10) unlock('lvl10');
    if (G.level >= 4 && G.run.orbs === 0) unlock('purist');
  }

  // Returns the points actually awarded (Double doubles everything).
  function addScore(n) {
    const pts = n * (G.fx.double > 0 ? 2 : 1);
    G.score += pts;
    G.scorePop = 1;
    bump(el.score);
    if (G.score > G.best && !G.newBest && G.best > 0) {
      G.newBest = true;
      popup(W / 2, H * 0.4, 'new best!', { size: 34, color: C.rust, font: FONT_SERIF, weight: 400, italic: true, life: 1.4 });
    }
    if (G.score >= 100) unlock('s100');
    if (G.score >= 500) unlock('s500');
    return pts;
  }

  function updateHud(force) {
    el.score.textContent = G.score;
    el.level.textContent = G.level;
    el.speed.textContent = speedLabel();
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
      const pts = addScore(G.mult);
      const dbl = G.fx.double > 0;
      popup(b.x, cy + (isBot ? -28 : 28), '+' + pts, { size: 22 + G.mult * 5 + (dbl ? 6 : 0), color: perfect || dbl ? C.rust : C.ink });
      if (perfect) popup(b.x, cy + (isBot ? -64 : 64), G.mult >= 2 ? 'perfect ×' + G.mult : 'perfect', { size: 24, color: C.rust, font: FONT_SERIF, weight: 400, italic: true, life: 0.8 });
      if (perfect) unlock('bullseye');
      if (G.mult >= 5) unlock('streak');
      if (G.fx.shrink > 0 && ++G.run.shrinkHits >= 5) unlock('tiny');
      if (G.hits % LEVEL_HITS === 0) levelUp();
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

  function hitBumper(u, b, nx, ny) {
    u.hit = 1;
    emit(u.x + nx * u.r, u.y + ny * u.r, 14, { angle: Math.atan2(ny, nx), spread: 1.6, speed: [100, 340], colors: [C.ink, C.rust, C.sage] });
    ring(u.x, u.y, u.r * 2.4, C.ink, 3, 0.35);
    if (G.state !== 'playing') return;
    const pts = addScore(1);
    popup(u.x, u.y - u.r - 18, '+' + pts, { size: 22, color: C.slate });
    updateHud();
    Sfx.bumper();
    shake(0.12);
    if (++G.run.bumps >= 10) unlock('pinball');
  }

  function collect(t, b) {
    const playing = G.state === 'playing';
    const def = t.def;
    t.dead = true;
    emit(t.x, t.y, 34, { colors: [def.fill, C.ink, C.paper], speed: [100, 460], gravity: 120 });
    ring(t.x, t.y, t.r * 5, def.bad ? C.ink : def.fill === C.sand ? C.rust : def.fill, 5, 0.55);
    ring(t.x, t.y, t.r * 3, def.bad ? C.rust : C.ink, 2, 0.4);
    if (!playing) return;
    G.run.orbs++;
    if (G.run.orbs >= 8) unlock('collector');
    const label = (text, color = C.ink) => popup(t.x, t.y - t.r - 10, text, { size: 28, color, font: FONT_SERIF, weight: 400, italic: true });
    if (def.bad) { Sfx.bad(); shake(0.35); flash(0.2, C.ink); } else { Sfx.pickup(); shake(0.2); }
    switch (t.type) {
      case 'star': {
        const pts = addScore(5 * G.mult);
        updateHud();
        popup(t.x, t.y - t.r - 10, '+' + pts, { size: 36, color: C.rust });
        break;
      }
      case 'wide': G.fx.wide = ORBS.wide.dur; G.fx.shrink = 0; label('wide paddles'); break;
      case 'shrink': G.fx.shrink = ORBS.shrink.dur; G.fx.wide = 0; G.run.shrinkHits = 0; label('shrunk!', C.rust); break;
      case 'slow': G.fx.slow = ORBS.slow.dur; flash(0.15, C.slate); label('slow-mo', C.slate); break;
      case 'magnet': G.fx.magnet = ORBS.magnet.dur; label('magnet'); break;
      case 'double': G.fx.double = ORBS.double.dur; flash(0.12, C.ember); label('double points', C.rust); break;
      case 'shield':
        G.shield = Math.min(2, G.shield + 1);
        Sfx.shield();
        label(G.shield > 1 ? 'shield ×2' : 'shield up', C.slate);
        break;
      case 'multi': {
        const room = 5 - balls.length;
        const sp = Math.hypot(b.vx, b.vy);
        const base = Math.atan2(b.vx, Math.abs(b.vy)); // angle from vertical
        for (let i = 0; i < Math.min(2, room); i++) {
          const nb = makeBall(b.x, b.y, clamp(base + (i ? 0.55 : -0.55), -1.15, 1.15), Math.sign(b.vy) || 1, sp);
          nb.grow = 1;
          balls.push(nb);
        }
        if (balls.length >= 5) unlock('circus');
        label('multi-ball');
        break;
      }
    }
  }

  // Shield: a one-time save along the edge the ball was about to leave through.
  function useShield(b, edge) {
    G.shield--;
    b.vy = edge > 0 ? -Math.abs(b.vy) : Math.abs(b.vy);
    b.y = edge > 0 ? H - 4 - b.r : 4 + b.r;
    fixAngle(b);
    const y = edge > 0 ? H - 3 : 3;
    for (let i = 0; i < 8; i++) emit(b.x + rand(-80, 80), y, 4, { colors: [C.mist, C.slate, C.paper], angle: edge > 0 ? -Math.PI / 2 : Math.PI / 2, spread: 1.8, speed: [80, 300], spark: 1 });
    ring(b.x, y, 120, C.slate, 4, 0.5);
    popup(b.x, y + (edge > 0 ? -70 : 70), 'saved!', { size: 30, color: C.slate, font: FONT_SERIF, weight: 400, italic: true });
    Sfx.shieldBreak();
    shake(0.3);
    flash(0.12, C.mist);
    unlock('saved');
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

    // Leaderboard: offer a name if this run makes the top 10.
    G.pending = Board.qualifies(G.score);
    el.nameForm.hidden = !G.pending;
    el.rankLine.hidden = G.pending;
    if (G.pending) {
      el.overRank.textContent = '#' + Board.rankOf(G.score);
      el.nameInput.value = store.get('bib.name', '');
    } else {
      const min = Board.list.length ? Board.list[Board.list.length - 1].score : 0;
      el.rankLine.textContent = G.score === 0 ? 'Bounce it at least once to get on the board.' : `Top 10 needs ${min + 1}+. So close!`;
    }

    setScreen('over');
    if (G.pending && finePointer) el.nameInput.focus({ preventScroll: true });
    else $('#btn-again').focus({ preventScroll: true });

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

  // Save the pending leaderboard entry (on submit, or automatically when leaving the screen).
  function commitPending() {
    if (!G.pending) return;
    G.pending = false;
    const name = cleanName(el.nameInput.value) || 'Player';
    store.set('bib.name', name);
    G.lastEntry = { name, score: G.score, level: G.level, date: Date.now() };
    const rank = Board.add(G.lastEntry);
    el.nameForm.hidden = true;
    el.rankLine.hidden = false;
    el.rankLine.textContent = `Saved as ${name}: #${rank} on the leaderboard`;
  }

  // ---------------------------------------------------------------- records screen (leaderboard / badges / orbs)
  function renderRecords() {
    el.boardList.replaceChildren();
    el.boardEmpty.hidden = Board.list.length > 0;
    Board.list.forEach((e, i) => {
      const li = document.createElement('li');
      if (e === G.lastEntry) li.className = 'me';
      const rank = document.createElement('span'); rank.className = 'rank'; rank.textContent = String(i + 1).padStart(2, '0');
      const name = document.createElement('span'); name.className = 'who'; name.textContent = e.name;
      const lvl = document.createElement('span'); lvl.className = 'lvl'; lvl.textContent = 'L' + e.level;
      const sc = document.createElement('span'); sc.className = 'pts'; sc.textContent = e.score;
      li.append(rank, name, lvl, sc);
      el.boardList.append(li);
    });

    el.badgeGrid.replaceChildren();
    for (const b of BADGES) {
      const d = document.createElement('div');
      d.className = 'badge' + (earned.has(b.id) ? ' got' : '');
      const m = document.createElement('span'); m.className = 'medal'; m.textContent = earned.has(b.id) ? b.icon : '?';
      const n = document.createElement('b'); n.textContent = b.name;
      const s = document.createElement('small'); s.textContent = b.desc;
      d.append(m, n, s);
      el.badgeGrid.append(d);
    }
    el.badgeCount.textContent = `${earned.size}/${BADGES.length}`;
  }

  function buildOrbGuide() {
    for (const [type, o] of Object.entries(ORBS)) {
      const row = document.createElement('div');
      row.className = 'orb-row' + (o.bad ? ' bad' : '');
      const cv = document.createElement('canvas');
      const size = 34;
      cv.width = cv.height = size * 2;
      cv.style.width = cv.style.height = size + 'px';
      const c2 = cv.getContext('2d');
      c2.scale(2, 2);
      c2.translate(size / 2, size / 2);
      drawOrbBody(c2, type, o, 13);
      const txt = document.createElement('div');
      const n = document.createElement('b'); n.textContent = o.name;
      const d = document.createElement('small'); d.textContent = o.desc;
      txt.append(n, d);
      const lv = document.createElement('span'); lv.className = 'lvl'; lv.textContent = 'L' + o.min + '+';
      row.append(cv, txt, lv);
      el.orbGrid.append(row);
    }
  }

  function openRecords(tab) {
    commitPending();
    G.recordsFrom = el.over.classList.contains('show') ? 'over' : 'menu';
    renderRecords();
    selectTab(tab || 'board');
    setScreen('records');
    $('#btn-records-back').focus({ preventScroll: true });
  }
  function closeRecords() {
    setScreen(G.recordsFrom);
    (G.recordsFrom === 'over' ? $('#btn-again') : $('#btn-play')).focus({ preventScroll: true });
  }
  function selectTab(name) {
    for (const t of document.querySelectorAll('[role="tab"]')) {
      const on = t.dataset.tab === name;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
      $('#' + t.getAttribute('aria-controls')).hidden = !on;
    }
  }

  // ---------------------------------------------------------------- update
  function update(dt) {
    G.time += dt;

    // Time scale: slow-mo power-up, death slow-down, brief hit-stop on perfect hits.
    let tsTarget = G.fx.slow > 0 ? 0.55 : 1;
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

    // Power-up timers (slow-mo counts in real time, the rest in game time)
    if (G.state === 'playing') {
      for (const k of TIMED) G.fx[k] = Math.max(0, G.fx[k] - (k === 'slow' ? dt : sdt));
      G.spawnT -= sdt;
      if (G.spawnT <= 0) { if (targets.length < (G.level >= 4 ? 3 : 2)) spawnTarget(); G.spawnT = rand(3.2, 6); }
    }
    pad.tw = M.basePadW * (G.fx.wide > 0 ? 1.6 : 1) * (G.fx.shrink > 0 ? 0.55 : 1);

    // Background tint shifts a little with each level.
    const tint = LEVEL_TINTS[(G.level - 1) % LEVEL_TINTS.length];
    G.bg = mixRgb(G.bg, tint, damp(2, dt));

    // Paddles move in real time, so slow-mo genuinely helps the player.
    if (G.state !== 'paused') updatePaddle(dt);

    // Bumpers drift side to side.
    for (const u of bumpers) {
      u.age += sdt;
      u.hit = Math.max(0, u.hit - sdt * 4);
      u.x += u.vx * sdt;
      if (u.x < u.r + 10) { u.x = u.r + 10; u.vx = Math.abs(u.vx); }
      if (u.x > W - u.r - 10) { u.x = W - u.r - 10; u.vx = -Math.abs(u.vx); }
    }

    // Balls
    for (let i = balls.length - 1; i >= 0; i--) {
      const b = balls[i];
      if (b.dead) continue;
      b.grow = Math.max(0, b.grow - dt * 3);
      b.sqv += (-520 * b.sq - 16 * b.sqv) * sdt;   // squash spring
      b.sq += b.sqv * sdt;
      if (b.serve > 0) { b.serve -= sdt; b.trail.length = 0; continue; }
      if (G.fx.magnet > 0 && G.state === 'playing') applyMagnet(b, sdt);
      stepBall(b, sdt);
      if (sdt > 0) {
        b.trail.unshift(b.x, b.y);
        const maxLen = (reduced ? 8 : 16) * 2;
        if (b.trail.length > maxLen) b.trail.length = maxLen;
        if (G.fx.double > 0 && Math.random() < 0.7) {
          emit(b.x, b.y, 1, { speed: [10, 60], gravity: -140, life: [0.25, 0.55], colors: [C.rust, C.ember, C.sand], spark: 0, size: [2, 4.5] });
        }
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

    updateChips();
  }

  function updateChips() {
    const live = G.state === 'playing' || G.state === 'paused';
    for (const k of TIMED) {
      const chip = el.chips[k];
      const p = live ? G.fx[k] / ORBS[k].dur : 0;
      const show = p > 0;
      if (chip.hidden === show) chip.hidden = !show;
      if (show) chip.style.setProperty('--p', p.toFixed(3));
    }
    const sc = el.chips.shield;
    const show = live && G.shield > 0;
    if (sc.hidden === show) sc.hidden = !show;
    const txt = G.shield > 1 ? 'Shield ×2' : 'Shield';
    if (show && sc.firstElementChild.textContent !== txt) sc.firstElementChild.textContent = txt;
  }

  // Magnet: steer the ball toward the paddle it is heading for, keeping its speed.
  function applyMagnet(b, sdt) {
    const d = b.vy > 0 ? M.botY - b.y : b.y - (M.topY + M.padH);
    if (d <= 0 || d > H * 0.5) return;
    const s = Math.hypot(b.vx, b.vy);
    const tHit = d / Math.abs(b.vy);
    const want = clamp((pad.x - b.x) / tHit, -s * 0.85, s * 0.85);
    b.vx = lerp(b.vx, want, damp(2.2, sdt));
    b.vy = Math.sign(b.vy) * Math.sqrt(Math.max(s * s - b.vx * b.vx, (s * 0.4) ** 2));
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

  // Sub-stepped so a fast ball can never tunnel through a paddle or bumper.
  function stepBall(b, sdt) {
    const sp = Math.hypot(b.vx, b.vy);
    const steps = Math.max(1, Math.ceil((sp * sdt) / (b.r * 0.7)));
    const h = sdt / steps;
    const half = pad.w / 2;
    const playing = G.state === 'playing';
    for (let s = 0; s < steps; s++) {
      const py = b.y;
      b.x += b.vx * h;
      b.y += b.vy * h;

      if (b.x - b.r < 0) { b.x = b.r; b.vx = Math.abs(b.vx); hitWall(b, -1); }
      else if (b.x + b.r > W) { b.x = W - b.r; b.vx = -Math.abs(b.vx); hitWall(b, 1); }

      for (const u of bumpers) {
        if (u.age < 0.4) continue;
        const dx = b.x - u.x, dy = b.y - u.y;
        const dist = Math.hypot(dx, dy);
        const R = u.r + b.r;
        if (dist < R && dist > 0) {
          const nx = dx / dist, ny = dy / dist;
          const dot = b.vx * nx + b.vy * ny;
          if (dot < 0) { b.vx -= 2 * dot * nx; b.vy -= 2 * dot * ny; fixAngle(b); hitBumper(u, b, nx, ny); }
          b.x = u.x + nx * R; b.y = u.y + ny * R;
        }
      }

      const inX = b.x >= pad.x - half - b.r * 0.8 && b.x <= pad.x + half + b.r * 0.8;
      if (b.vy > 0 && inX && b.y + b.r >= M.botY && py + b.r <= M.botY + M.padH * 0.6) { hitPaddle(b, 'bot'); continue; }
      if (b.vy < 0 && inX && b.y - b.r <= M.topY + M.padH && py - b.r >= M.topY + M.padH * 0.4) { hitPaddle(b, 'top'); continue; }

      if (playing && G.shield > 0) {
        if (b.vy > 0 && b.y + b.r >= H - 3) { useShield(b, 1); continue; }
        if (b.vy < 0 && b.y - b.r <= 3) { useShield(b, -1); continue; }
      }
      if (b.y - b.r > H + 4 || b.y + b.r < -4) { loseBall(b); return; }
    }
  }

  // ---------------------------------------------------------------- render
  function render() {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.fillStyle = `rgb(${G.bg.map((v) => Math.round(v)).join(',')})`;
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
    drawShield();
    for (const r of rings) drawRing(r);
    for (const u of bumpers) drawBumper(u);
    for (const t of targets) drawTarget(t);
    for (const b of balls) drawTrail(b);
    drawParticles();
    for (const b of balls) drawBall(b);
    drawMagnet();
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
    if (G.fx.slow > 0 && G.state === 'playing') drawVignette(Math.min(1, G.fx.slow) * 0.25, C.slate);
    if (G.fx.shrink > 0 && G.state === 'playing') drawVignette(Math.min(1, G.fx.shrink) * 0.12, C.ink);
    if (G.state === 'dying') drawVignette(Math.min(1, G.deathT * 2) * 0.35, C.rust);
  }

  function drawBackground() {
    const gap = W < 500 ? 24 : 32;
    const drift = (G.time * (6 + G.level * 2)) % gap;   // the grid drifts faster as levels climb
    ctx.fillStyle = 'rgba(28,27,29,0.07)';
    for (let y = -gap + drift; y < H + gap; y += gap) {
      for (let x = gap / 2; x < W; x += gap) ctx.fillRect(x - 1, y - 1, 2, 2);
    }
    ctx.strokeStyle = 'rgba(28,27,29,0.10)';
    ctx.lineWidth = 1;
    ctx.setLineDash([6, 10]);
    ctx.beginPath(); ctx.moveTo(0, H / 2); ctx.lineTo(W, H / 2); ctx.stroke();
    ctx.setLineDash([]);

    if (G.state !== 'menu') {
      // giant score numeral behind the play
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
    const a = G.shield > 0 ? 0.06 : 0.16;
    if (bot > 0) {
      const g = ctx.createLinearGradient(0, H, 0, H - h);
      g.addColorStop(0, `rgba(196,80,42,${a * bot})`); g.addColorStop(1, 'rgba(196,80,42,0)');
      ctx.fillStyle = g; ctx.fillRect(0, H - h, W, h);
    }
    if (top > 0) {
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, `rgba(196,80,42,${a * top})`); g.addColorStop(1, 'rgba(196,80,42,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, h);
    }
  }

  function drawShield() {
    if (G.shield <= 0 || G.state === 'menu' || G.state === 'over') return;
    ctx.save();
    ctx.globalAlpha = 0.55 + 0.25 * Math.sin(G.time * 5);
    ctx.strokeStyle = C.slate;
    ctx.lineWidth = 2 + G.shield * 1.5;
    ctx.setLineDash([12, 7]);
    ctx.lineDashOffset = -G.time * 40;
    for (const y of [3, H - 3]) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
    ctx.restore();
  }

  function drawMagnet() {
    if (G.fx.magnet <= 0 || G.state !== 'playing') return;
    ctx.save();
    ctx.strokeStyle = C.ochre;
    ctx.lineWidth = 2;
    for (let i = 0; i < 3; i++) {
      const k = (G.time * 0.9 + i / 3) % 1;
      const r = pad.w * (0.25 + k * 0.5);
      ctx.globalAlpha = (1 - k) * 0.6 * Math.min(1, G.fx.magnet);
      ctx.beginPath(); ctx.ellipse(pad.x, M.botY, r, r * 0.55, 0, Math.PI, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(pad.x, M.topY + M.padH, r, r * 0.55, 0, 0, Math.PI); ctx.stroke();
    }
    ctx.restore();
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
    ctx.fillStyle = 'rgba(28,27,29,0.18)';
    roundRect(-w / 2 + 3, -h / 2 + 3, w, h, h / 2);
    ctx.fill();
    ctx.fillStyle = state.flash > 0 ? mix(C.ink, C.rust, state.flash) : C.ink;
    roundRect(-w / 2, -h / 2, w, h, h / 2);
    ctx.fill();
    // sweet-spot marker
    ctx.fillStyle = state.flash > 0.3 ? C.paper : C.rust;
    ctx.globalAlpha = 0.9;
    roundRect(-w * 0.11, -h * 0.18, w * 0.22, h * 0.36, h * 0.18);
    ctx.fill();
    ctx.globalAlpha = 1;
    if (G.fx.wide > 0 || G.fx.shrink > 0) {
      ctx.strokeStyle = G.fx.wide > 0 ? C.sage : C.rust;
      ctx.lineWidth = 2;
      if (G.fx.shrink > 0) ctx.setLineDash([4, 4]);
      roundRect(-w / 2 - 3, -h / 2 - 3, w + 6, h + 6, h);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.restore();
  }

  function drawTrail(b) {
    const t = b.trail;
    const n = t.length / 2;
    if (n < 2) return;
    ctx.fillStyle = G.fx.double > 0 ? C.ember : C.rust;
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
    const fire = G.fx.double > 0;

    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.scale(1 + b.sq * 0.5, 1 - b.sq * 0.42);
    if (sp > 0) { ctx.rotate(Math.atan2(b.vy, b.vx)); ctx.scale(stretch, 1 / stretch); }
    ctx.fillStyle = fire ? 'rgba(224,137,47,0.3)' : 'rgba(196,80,42,0.18)';
    ctx.beginPath(); ctx.arc(0, 0, r * (fire ? 2.6 + Math.sin(G.time * 30) * 0.3 : 2.1), 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = fire ? C.ember : C.rust;
    ctx.strokeStyle = C.ink;
    ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.restore();
    ctx.fillStyle = 'rgba(242,238,232,0.75)';
    ctx.beginPath(); ctx.arc(b.x - r * 0.35, b.y - r * 0.35, r * 0.28, 0, Math.PI * 2); ctx.fill();

    if (b.serve > 0) {
      ctx.strokeStyle = C.ink;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r * 3, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (b.serve / 0.65));
      ctx.stroke();
    }
  }

  function drawBumper(u) {
    const s = easeOutBack(clamp(u.age / 0.5, 0, 1));
    const r = u.r * s * (1 + u.hit * 0.18);
    ctx.save();
    ctx.translate(u.x, u.y);
    ctx.fillStyle = 'rgba(28,27,29,0.15)';
    ctx.beginPath(); ctx.arc(3, 4, r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = u.hit > 0 ? mix(C.paper, C.rust, u.hit * 0.8) : C.paper;
    ctx.strokeStyle = C.ink;
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = C.rust;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, 0, r * 0.62, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = C.ink;
    ctx.beginPath(); ctx.arc(0, 0, r * 0.22, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  function drawTarget(t) {
    const appear = easeOutBack(clamp(t.age / 0.45, 0, 1));
    const remaining = t.life - t.age;
    if (remaining < 1.8 && Math.floor(remaining * 8) % 2 === 0) return; // blink before vanishing
    const pulse = 1 + Math.sin(G.time * (t.def.bad ? 9 : 4) + t.phase) * (t.def.bad ? 0.08 : 0.05);
    const r = t.r * appear * pulse;
    const bob = Math.sin(G.time * 2 + t.phase) * 4;
    ctx.save();
    ctx.translate(t.x, t.y + bob);
    ctx.rotate(G.time * (t.def.bad ? -1.6 : 0.8) + t.phase);
    ctx.strokeStyle = t.def.bad ? C.rust : C.ink;
    ctx.globalAlpha = t.def.bad ? 0.7 : 0.35;
    ctx.lineWidth = t.def.bad ? 2 : 1.5;
    ctx.setLineDash(t.def.bad ? [2, 5] : [4, 6]);
    ctx.beginPath(); ctx.arc(0, 0, r * 1.45, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
    ctx.rotate(-(G.time * (t.def.bad ? -1.6 : 0.8) + t.phase));
    drawOrbBody(ctx, t.type, t.def, r);
    ctx.restore();
  }

  // Shared by the game and the orb guide (draws centred on the current origin).
  function drawOrbBody(c, type, def, r) {
    c.fillStyle = def.fill;
    c.strokeStyle = def.bad ? C.rust : C.ink;
    c.lineWidth = 2;
    c.beginPath(); c.arc(0, 0, r, 0, Math.PI * 2); c.fill(); c.stroke();
    drawIcon(c, type, r);
  }

  function drawIcon(c, type, r) {
    const fg = type === 'slow' || type === 'double' || type === 'shrink' ? C.paper : C.ink;
    c.fillStyle = fg;
    c.strokeStyle = fg;
    c.lineWidth = Math.max(1.5, r * 0.11);
    c.lineCap = 'round';
    c.lineJoin = 'round';
    if (type === 'star') {
      c.fillStyle = C.rust;
      c.beginPath();
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        const rr = i % 2 ? r * 0.26 : r * 0.58;
        c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
      }
      c.closePath(); c.fill();
      c.strokeStyle = C.ink; c.lineWidth = 1.2; c.stroke();
    } else if (type === 'wide' || type === 'shrink') {
      const w = r * 0.55, a = r * 0.22;
      const tip = type === 'wide' ? w : r * 0.12;       // arrows point out (wide) or in (shrink)
      const back = type === 'wide' ? w - a : r * 0.12 + a;
      c.beginPath();
      c.moveTo(-w, 0); c.lineTo(-r * 0.12, 0); c.moveTo(r * 0.12, 0); c.lineTo(w, 0);
      c.moveTo(-back, -a); c.lineTo(-tip, 0); c.lineTo(-back, a);
      c.moveTo(back, -a); c.lineTo(tip, 0); c.lineTo(back, a);
      c.stroke();
    } else if (type === 'multi') {
      for (const [x, y] of [[0, -0.3], [-0.3, 0.22], [0.3, 0.22]]) {
        c.beginPath(); c.arc(x * r, y * r, r * 0.16, 0, Math.PI * 2); c.fill();
      }
    } else if (type === 'slow') {
      c.beginPath(); c.arc(0, 0, r * 0.5, 0, Math.PI * 2); c.stroke();
      c.beginPath(); c.moveTo(0, 0); c.lineTo(0, -r * 0.32); c.moveTo(0, 0); c.lineTo(r * 0.22, r * 0.1); c.stroke();
    } else if (type === 'shield') {
      c.fillStyle = C.slate;
      c.beginPath();
      c.moveTo(0, -r * 0.55);
      c.quadraticCurveTo(r * 0.3, -r * 0.4, r * 0.48, -r * 0.42);
      c.quadraticCurveTo(r * 0.5, r * 0.25, 0, r * 0.6);
      c.quadraticCurveTo(-r * 0.5, r * 0.25, -r * 0.48, -r * 0.42);
      c.quadraticCurveTo(-r * 0.3, -r * 0.4, 0, -r * 0.55);
      c.fill();
    } else if (type === 'magnet') {
      c.lineWidth = r * 0.24;
      c.lineCap = 'butt';
      c.beginPath(); c.arc(0, -r * 0.02, r * 0.34, Math.PI, 0, true); c.stroke();
      c.beginPath();
      c.moveTo(-r * 0.34, -r * 0.02); c.lineTo(-r * 0.34, -r * 0.4);
      c.moveTo(r * 0.34, -r * 0.02); c.lineTo(r * 0.34, -r * 0.4);
      c.stroke();
      c.strokeStyle = C.paper;
      c.beginPath();
      c.moveTo(-r * 0.34, -r * 0.3); c.lineTo(-r * 0.34, -r * 0.42);
      c.moveTo(r * 0.34, -r * 0.3); c.lineTo(r * 0.34, -r * 0.42);
      c.stroke();
    } else if (type === 'double') {
      c.font = `800 ${r * 0.85}px ${FONT_SANS}`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText('2×', 0, r * 0.05);
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
    const pa = hexRgb(a), pb = hexRgb(b);
    return `rgb(${pa.map((v, i) => Math.round(lerp(v, pb[i], t))).join(',')})`;
  }

  // ---------------------------------------------------------------- loop
  let lastT = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, Math.max(0, (now - lastT) / 1000));
    lastT = now;
    requestAnimationFrame(frame); // schedule first, so one bad frame can never stop the game
    update(dt);
    render();
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
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return; // typing a name
    const k = e.key;
    const recordsOpen = el.records.classList.contains('show');
    if (k === 'ArrowLeft' || k === 'a' || k === 'A') { keys.left = true; if (!recordsOpen) e.preventDefault(); }
    else if (k === 'ArrowRight' || k === 'd' || k === 'D') { keys.right = true; if (!recordsOpen) e.preventDefault(); }
    else if (k === 'm' || k === 'M') { toggleMute(); }
    else if (k === 'Escape' && recordsOpen) { closeRecords(); }
    else if (k === 'p' || k === 'P' || k === 'Escape') {
      if (G.state === 'playing') pauseGame(); else if (G.state === 'paused') resumeGame();
    } else if (k === ' ' || k === 'Enter') {
      if (document.activeElement && document.activeElement.tagName === 'BUTTON') return; // let buttons handle it
      if (recordsOpen) return;
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
  $('#btn-records').addEventListener('click', () => openRecords('board'));
  $('#btn-over-records').addEventListener('click', () => openRecords('board'));
  $('#btn-records-back').addEventListener('click', closeRecords);
  el.nameForm.addEventListener('submit', (e) => {
    e.preventDefault();
    commitPending();
    Sfx.click();
    $('#btn-again').focus({ preventScroll: true });
  });
  for (const t of document.querySelectorAll('[role="tab"]')) {
    t.addEventListener('click', () => selectTab(t.dataset.tab));
    t.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      const tabs = [...document.querySelectorAll('[role="tab"]')];
      const next = tabs[(tabs.indexOf(t) + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
      selectTab(next.dataset.tab);
      next.focus();
    });
  }
  el.btnPause.addEventListener('click', pauseGame);
  el.btnMute.addEventListener('click', (e) => { toggleMute(); e.currentTarget.blur(); });
  for (const b of document.querySelectorAll('.btn')) b.addEventListener('click', () => b.blur());

  window.addEventListener('resize', resize);

  // ---------------------------------------------------------------- boot
  resize();
  buildOrbGuide();
  el.btnMute.setAttribute('aria-pressed', String(Sfx.muted));
  el.menuBest.textContent = G.best;
  el.menuBadges.textContent = `${earned.size}/${BADGES.length}`;
  el.best.textContent = G.best;
  balls = [serveBall(1)];
  setScreen('menu');
  requestAnimationFrame((t) => { lastT = t; frame(t); });

  // Small hook for automated checks in the browser console.
  window.__bounce = {
    G, pad, M, Board, earned,
    get balls() { return balls; },
    get targets() { return targets; },
    get bumpers() { return bumpers; },
    // Advance the simulation by `seconds` at 60 fps (works even when the tab is in the background).
    step(seconds, onFrame) {
      for (let i = 0; i < Math.round(seconds * 60); i++) { if (onFrame) onFrame(); update(1 / 60); }
      render();
    },
  };
})();
