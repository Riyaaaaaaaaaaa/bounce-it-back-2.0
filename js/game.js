/* Bounce it Back 2.0
 * Two mirrored paddles keep a ball alive. Every bounce scores, perfect centre hits build a combo,
 * and a miss ends the run. Modes: Classic, Survival, 60-second Rush and local Two-player.
 * Plain canvas + Web Audio, no build step, no assets.
 */
(() => {
  'use strict';

  // ================================================================ palette & helpers
  const C = {
    ink: '#1c1b1d', paper: '#f2eee8', rust: '#c4502a', rose: '#d9b8b0',
    sand: '#e6d5b8', sage: '#a9b8a0', slate: '#3d4f6b',
    mist: '#b9c6d6', ochre: '#c9a46b', ember: '#e0892f', gold: '#d9a441',
  };
  const FONT_SANS = '"Bricolage Grotesque", system-ui, sans-serif';
  const FONT_SERIF = '"Instrument Serif", Georgia, serif';
  const FONT_MONO = '"Cutive Mono", ui-monospace, monospace';

  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[(Math.random() * arr.length) | 0];
  const damp = (k, dt) => 1 - Math.exp(-k * dt); // frame-rate independent smoothing factor
  // Clamped at 0: at t = 0 floating-point error gives a tiny negative, and arc() throws on a negative radius.
  const easeOutBack = (t) => { const c = 1.7; return Math.max(0, 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2)); };
  const hexRgb = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  const mixRgb = (a, b, t) => a.map((v, i) => lerp(v, b[i], t));
  const fmtTime = (s) => { s = Math.max(0, s); const m = Math.floor(s / 60); const r = s - m * 60; return `${m}:${r < 10 ? '0' : ''}${r.toFixed(1)}`; };
  const fmtClock = (s) => { s = Math.max(0, Math.ceil(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
  const setText = (node, txt) => { if (node.textContent !== txt) node.textContent = txt; };

  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage unavailable */ } },
  };

  const motionQuery = window.matchMedia ? matchMedia('(prefers-reduced-motion: reduce)') : null;
  let reduced = !!(motionQuery && motionQuery.matches);
  if (motionQuery && motionQuery.addEventListener) motionQuery.addEventListener('change', (e) => { reduced = e.matches; });
  const finePointer = window.matchMedia ? matchMedia('(pointer: fine)').matches : true;

  // ================================================================ tuning & content
  const LEVEL_HITS = 8;          // bounces per level (Classic)
  const SPEED_START = 0.68;      // level 1 is gentle...
  const SPEED_PER_LEVEL = 0.16;  // ...and every level adds a noticeable kick
  const RUSH_TIME = 60;
  const DUEL_TARGET = 5;
  const RAGE_TIME = 10;
  const RAGE_BONUS = 250;
  const EVENT_WARN = 2;
  const EVENT_LEN = 7;
  const MILESTONES = [100, 500, 1000, 2000, 5000, 10000];

  const MODES = {
    classic:  { name: 'Classic', desc: 'Just bounce. Combos, power-ups, and a ball that keeps getting faster.', unit: 'points' },
    chaos:    { name: 'Chaos', desc: 'Everything at once: bosses, random events and bumpers.', unit: 'points' },
    survival: { name: 'Survival', desc: 'No levels, no orbs, no breaks. It just keeps getting faster.', unit: 'survived' },
    rush:     { name: '60-second rush', desc: 'Score as much as you can in 60 seconds. A miss costs 3 s.', unit: 'points in 60 s' },
    bossrush: { name: 'Boss rush', desc: 'Boss after boss, each one tougher. How many can you beat?', unit: 'bosses beaten' },
    duel:     { name: 'Two players', desc: 'Top vs bottom on one screen. First to 5 points wins.', unit: '' },
  };
  const validMode = (m) => (MODES[m] ? m : 'classic');

  // Orbs. `min` is the level they start appearing at; `dur` is seconds of effect.
  const ORBS = {
    star:   { fill: C.sand,  w: 34, min: 1, name: '+5 points', desc: 'Points × your combo' },
    wide:   { fill: C.sage,  w: 14, min: 1, dur: 9, name: 'Wide', desc: 'Bigger paddles' },
    shield: { fill: C.mist,  w: 10, min: 1, name: 'Shield', desc: 'Saves one miss (stacks to 2)' },
    multi:  { fill: C.rose,  w: 12, min: 2, name: 'Multi-ball', desc: 'Two extra balls' },
    slow:   { fill: C.slate, w: 11, min: 2, dur: 6, name: 'Slow-mo', desc: 'Time slows, you don’t' },
    magnet: { fill: C.ochre, w: 10, min: 3, dur: 8, name: 'Magnet', desc: 'Pulls the ball to your sweet spot' },
    double: { fill: C.rust,  w: 9,  min: 3, dur: 8, name: 'Double', desc: 'All points ×2, fireball' },
    shrink: { fill: C.ink,   w: 9,  min: 4, dur: 7, name: 'Shrink', desc: 'Bad! Tiny paddles. Steer clear', bad: true },
  };
  const TIMED = Object.keys(ORBS).filter((k) => ORBS[k].dur);

  const EVENTS = {
    gravity:   { name: 'Gravity shift', desc: 'The ball curves sideways' },
    chaos:     { name: 'Chaos mode', desc: 'The ball goes haywire' },
    double:    { name: 'Double points', desc: 'Every bounce scores double' },
    invisible: { name: 'Invisible ball', desc: 'Now you see it…' },
    reverse:   { name: 'Reverse controls', desc: 'Left is right, right is left' },
  };

  // Combo tiers: consecutive perfect hits.
  const TIERS = [
    { at: 5, mult: 2, word: 'AMAZING!' },
    { at: 10, mult: 3, word: 'UNSTOPPABLE!' },
    { at: 20, mult: 5, word: 'RAGE MODE!' },
  ];
  const tierIdx = (streak) => TIERS.reduce((n, t) => (streak >= t.at ? n + 1 : n), 0);
  const tierMult = (streak) => { const i = tierIdx(streak); return i ? TIERS[i - 1].mult : 1; };
  const TIER_COLORS = [C.rust, C.ember, C.gold, C.rust];

  const UNLOCKS = {
    4: 'careful: shrink orbs now spawn',
  };

  // Classic: a mini-boss at level 2, then a boss every 3 levels with mini-bosses in between (2, 3, 5, 6, 8, 9…).
  const bossKindForLevel = (l) => (l % 3 === 0 ? 'boss' : l % 3 === 2 ? 'mini' : null);
  const BOSS_NAMES = ['Big Blob', 'Grumbles', 'The Smudge', 'Count Bounceula', 'Mega Pebble'];
  const MINI_NAMES = ['Blobling', 'Smudgelet', 'Pebble Jr.', 'Grumblet'];

  const BADGES = [
    { id: 'bullseye', icon: '◎', name: 'Bullseye', desc: 'Land a perfect centre hit' },
    { id: 'streak', icon: '×2', name: 'Hot streak', desc: '5 perfect hits in a row' },
    { id: 'perfect10', icon: '×3', name: 'Laser focus', desc: '10 perfect hits in a row' },
    { id: 'rage', icon: '!!', name: 'Seeing red', desc: 'Trigger Rage mode (20 perfect in a row)' },
    { id: 'rageSurvive', icon: '♨', name: 'Rage tamed', desc: 'Survive the full 10 s of Rage mode' },
    { id: 'bounce100', icon: '100', name: 'Rally master', desc: '100 bounces in one run' },
    { id: 'survive60', icon: '60s', name: 'Still standing', desc: 'Survive 60 seconds in Classic, Chaos or Survival' },
    { id: 'survival120', icon: '2m', name: 'Iron will', desc: 'Last 2 minutes in Survival' },
    { id: 'pure500', icon: '○5', name: 'No help needed', desc: 'Score 500 in Classic or Chaos without collecting an orb' },
    { id: 'lvl5', icon: 'L5', name: 'Speed demon', desc: 'Reach level 5' },
    { id: 'lvl10', icon: 'L10', name: 'Lightspeed', desc: 'Reach level 10' },
    { id: 's100', icon: '1C', name: 'Century', desc: 'Score 100 in one run' },
    { id: 's500', icon: '5C', name: 'High roller', desc: 'Score 500 in one run' },
    { id: 'milestone1000', icon: '1K', name: 'Four digits', desc: 'Score 1,000 in one run' },
    { id: 'boss', icon: '☠', name: 'Boss slayer', desc: 'Defeat a boss' },
    { id: 'rush100', icon: '⏱', name: 'Rush hour', desc: '100 points in a 60-second rush' },
    { id: 'chaos5', icon: '≈', name: 'Chaos theory', desc: 'Survive 5 events in one run (Chaos or Rush)' },
    { id: 'secondwind', icon: '↺', name: 'Second wind', desc: 'Get a last chance' },
    { id: 'clutch', icon: '⚡', name: 'Clutch', desc: 'Save the ball during danger slow-mo' },
    { id: 'circus', icon: '5●', name: 'Circus act', desc: 'Have 5 balls in play at once' },
    { id: 'saved', icon: '⌒', name: 'Close call', desc: 'Let a shield save a ball' },
    { id: 'collector', icon: '✦', name: 'Collector', desc: 'Collect 8 orbs in one run' },
    { id: 'pinball', icon: '⊙', name: 'Pinball wizard', desc: 'Hit bumpers 10 times in one run' },
    { id: 'tiny', icon: '▭', name: 'Tiny but mighty', desc: 'Make 5 bounces while shrunk' },
    { id: 'purist', icon: '○', name: 'Purist', desc: 'Reach level 4 without collecting an orb' },
    { id: 'duel', icon: 'vs', name: 'Friendly rivals', desc: 'Finish a two-player match' },
    { id: 'gauntlet', icon: '⚔', name: 'Gauntlet', desc: 'Beat 3 bosses in Boss rush' },
    { id: 'monster', icon: '♛', name: 'Monster hunter', desc: 'Beat 6 bosses in Boss rush' },
  ];
  const TITLES = [
    { at: 0, name: 'Rookie' }, { at: 3, name: 'Rallier' }, { at: 7, name: 'Ace' },
    { at: 12, name: 'Maestro' }, { at: 18, name: 'Legend' }, { at: BADGES.length, name: 'Bounce Royalty' },
  ];
  const titleFor = (n) => TITLES.filter((t) => n >= t.at).pop().name;

  const PACKS = {
    classic:  { name: 'Classic',  wave: 'triangle', base: 220, scale: [0, 2, 4, 7, 9], vol: 1, partial: 2 },
    chiptune: { name: 'Chiptune', wave: 'square',   base: 330, scale: [0, 4, 7, 11, 14], vol: 0.42, partial: 0 },
    soft:     { name: 'Soft',     wave: 'sine',     base: 196, scale: [0, 3, 5, 7, 10], vol: 1.25, partial: 4 },
  };

  // ================================================================ cosmetics (the Locker)
  // Purely visual: none of these change how the game plays. Each unlocks through a badge or lifetime stats.
  const COSMETICS = {
    ball: { label: 'Ball', noun: 'ball', items: [
      { id: 'classic', name: 'Classic' },
      { id: 'ring', name: 'Ringed', badge: 'bullseye' },
      { id: 'beach', name: 'Beach ball', games: 5 },
      { id: 'glow', name: 'Ember glow', badge: 'rage' },
      { id: 'pixel', name: 'Pixel', bounces: 500 },
      { id: 'star', name: 'Star', badge: 'boss' },
      { id: 'eye', name: 'Eyeball', bosses: 5 },
    ] },
    paddle: { label: 'Paddle', noun: 'paddles', items: [
      { id: 'ink', name: 'Ink' },
      { id: 'candy', name: 'Candy stripe', badge: 'streak' },
      { id: 'neon', name: 'Neon', badge: 'lvl5' },
      { id: 'wood', name: 'Wood grain', bounces: 1000 },
      { id: 'sunset', name: 'Sunset', badge: 's500' },
      { id: 'gold', name: 'Gold', badgesCount: 18 },
    ] },
    trail: { label: 'Trail', noun: 'trail', items: [
      { id: 'dots', name: 'Dots' },
      { id: 'sparkle', name: 'Sparkles', badge: 'perfect10' },
      { id: 'ribbon', name: 'Ribbon', badge: 'survive60' },
      { id: 'smoke', name: 'Smoke', badge: 'rush100' },
      { id: 'hearts', name: 'Hearts', badge: 'duel' },
    ] },
    theme: { label: 'Theme', noun: 'theme', items: [
      { id: 'paper', name: 'Paper' },
      { id: 'mint', name: 'Mint', badge: 'collector' },
      { id: 'sunset', name: 'Sunset', badge: 'rageSurvive' },
      { id: 'blueprint', name: 'Blueprint', badge: 'pinball' },
      { id: 'midnight', name: 'Midnight', badge: 'clutch' },
    ] },
    effect: { label: 'Bounce', noun: 'bounce effect', items: [
      { id: 'sparks', name: 'Sparks' },
      { id: 'confetti', name: 'Confetti pop', badge: 's100' },
      { id: 'ripple', name: 'Ripple', games: 10 },
      { id: 'ink', name: 'Ink splash', badge: 'saved' },
      { id: 'stars', name: 'Starburst', badge: 'bounce100' },
    ] },
  };
  const THEMES = {
    paper:     { bg: C.paper,   dot: 'rgba(28,27,29,0.07)',   line: 'rgba(28,27,29,0.10)' },
    mint:      { bg: '#dcebdf', dot: 'rgba(28,27,29,0.08)',   line: 'rgba(28,27,29,0.12)' },
    sunset:    { bg: '#f6dfcc', bg2: '#e6b3a6', dot: 'rgba(28,27,29,0.07)', line: 'rgba(28,27,29,0.10)' },
    blueprint: { bg: '#2c4870', dot: 'rgba(242,238,232,0.13)', line: 'rgba(242,238,232,0.28)', dark: true, grid: true },
    midnight:  { bg: '#16171e', dot: 'rgba(242,238,232,0.55)', line: 'rgba(242,238,232,0.14)', dark: true, stars: true },
  };
  const lifetime = (() => {
    const raw = store.get('bib.stats', {}) || {};
    const o = {};
    for (const k of ['games', 'bounces', 'perfects', 'bosses']) o[k] = Math.max(0, Math.floor(+raw[k] || 0));
    return o;
  })();
  const equip = (() => {
    const raw = store.get('bib.equip', {}) || {};
    const o = {};
    for (const [cat, g] of Object.entries(COSMETICS)) o[cat] = g.items.some((i) => i.id === raw[cat]) ? raw[cat] : g.items[0].id;
    return o;
  })();
  const theme = () => THEMES[equip.theme];
  const fg = () => (theme().dark ? C.paper : C.ink); // the "ink" colour for the current theme
  const TINT_COLORS = [null, C.sand, C.rose, C.sage, C.mist];
  const themeBg = () => hexRgb(theme().bg);
  const levelTint = (i) => { const c = TINT_COLORS[((i % 5) + 5) % 5]; return c ? mixRgb(themeBg(), hexRgb(c), theme().dark ? 0.1 : 0.32) : themeBg(); };
  const rageTint = () => mixRgb(themeBg(), hexRgb(C.rust), 0.36);
  const duelTint = () => mixRgb(themeBg(), hexRgb(C.mist), theme().dark ? 0.1 : 0.2);

  // ================================================================ DOM
  const canvas = $('#game');
  const ctx = canvas.getContext('2d');
  const el = {
    hud: $('#hud'),
    s: [1, 2, 3].map((i) => ({ wrap: $('#s' + i), label: $('#s' + i + '-label'), value: $('#s' + i + '-value') })),
    best: $('#hud-best'), bestLabel: $('#hud-best-label'),
    ghost: $('#hud-ghost'), ghostValue: $('#hud-ghost-value'),
    combo: $('#hud-combo'), mult: $('#hud-mult'), streak: $('#hud-streak'),
    chips: Object.fromEntries($$('.chip').map((c) => [c.dataset.power, c])),
    banner: $('#banner'), bannerKicker: $('#banner-kicker'), bannerNum: $('#banner-num'), bannerSub: $('#banner-sub'),
    announce: $('#announce'),
    eventBanner: $('#event-banner'), eventName: $('#event-name'), eventDesc: $('#event-desc'), eventKicker: $('#event-kicker'),
    bossBar: $('#boss-bar'), bossName: $('#boss-name'),
    menu: $('#screen-menu'), pause: $('#screen-pause'), over: $('#screen-over'), records: $('#screen-records'), settings: $('#screen-settings'),
    menuTitle: $('#menu-title'), menuBadges: $('#menu-badges'),
    pauseStats: $('#pause-stats'), pauseMode: $('#pause-mode'),
    overEyebrow: $('#over-eyebrow'), overTitle: $('#over-title'), overScore: $('#over-score'), overUnit: $('#over-unit'),
    overNew: $('#over-newbest'), overStats: $('#over-stats'),
    nameForm: $('#name-form'), nameInput: $('#name-input'), rankLine: $('#rank-line'), boardStatus: $('#board-status'),
    btnShare: $('#btn-share'),
    boardList: $('#board-list'), boardEmpty: $('#board-empty'), badgeGrid: $('#badge-grid'), badgeCount: $('#badge-count'),
    titleLine: $('#title-line'), orbGrid: $('#orb-grid'),
    toasts: $('#toasts'),
    btnPause: $('#btn-pause'), btnMute: $('#btn-mute'), btnSettings: $('#btn-settings'),
    musicToggle: $('#music-toggle'),
    locker: $('#screen-locker'), lockerGrid: $('#locker-grid'), lockerCount: $('#locker-count'),
    bossKind: $('#boss-kind'),
  };
  const restartAnim = (node, cls) => { node.classList.remove(cls); void node.offsetWidth; node.classList.add(cls); };
  const bump = (node) => restartAnim(node, 'bump');

  // ================================================================ audio
  const Sfx = {
    ac: null, master: null, sfxGain: null, musicGain: null, noiseBuf: null,
    muted: store.get('bib.muted', false),
    pack: PACKS[store.get('bib.pack', 'classic')] ? store.get('bib.pack', 'classic') : 'classic',
    init() {
      if (this.ac) { if (this.ac.state === 'suspended') this.ac.resume(); return; }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ac = new AC();
      this.master = this.ac.createGain();
      this.master.gain.value = this.muted ? 0 : 0.55;
      this.master.connect(this.ac.destination);
      this.sfxGain = this.ac.createGain();
      this.sfxGain.connect(this.master);
      this.musicGain = this.ac.createGain();
      this.musicGain.gain.value = Music.on ? 0.5 : 0;
      this.musicGain.connect(this.master);
      const len = this.ac.sampleRate;
      this.noiseBuf = this.ac.createBuffer(1, len, this.ac.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    },
    setMuted(m) {
      this.muted = m;
      store.set('bib.muted', m);
      if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.55, this.ac.currentTime, 0.02);
    },
    get P() { return PACKS[this.pack]; },
    tone(freq, dur, { type = 'sine', vol = 0.3, slide = 0, delay = 0, attack = 0.004, at = 0, out = null } = {}) {
      if (!this.ac || this.muted) return;
      const t = at || this.ac.currentTime + delay;
      const o = this.ac.createOscillator();
      const g = this.ac.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq, t);
      if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, slide), t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t + attack);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(out || this.sfxGain);
      o.start(t);
      o.stop(t + dur + 0.03);
    },
    noise(dur, vol, freq, { type = 'bandpass', at = 0, out = null, q = 0.8 } = {}) {
      if (!this.ac || this.muted) return;
      const t = at || this.ac.currentTime;
      const src = this.ac.createBufferSource();
      const f = this.ac.createBiquadFilter();
      const g = this.ac.createGain();
      src.buffer = this.noiseBuf;
      f.type = type; f.frequency.value = freq; f.Q.value = q;
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(f).connect(g).connect(out || this.sfxGain);
      src.start(t, Math.random() * 0.5);
      src.stop(t + dur + 0.02);
    },
    note(step, octave = 0) {
      const P = this.P;
      const n = P.scale[step % P.scale.length] + 12 * (Math.floor(step / P.scale.length) + octave);
      return P.base * Math.pow(2, Math.min(n, 30) / 12);
    },
    // Combo bounces climb the pack's scale, so a good streak plays a little melody.
    bounce(step, perfect, tier) {
      const P = this.P;
      const f = this.note(step);
      this.tone(f, P.wave === 'sine' ? 0.32 : 0.18, { type: P.wave, vol: 0.32 * P.vol });
      if (P.partial) this.tone(f * P.partial, 0.07, { type: 'sine', vol: 0.1 });
      if (perfect) this.tone(f * 1.5, 0.22, { type: 'sine', vol: 0.08 + tier * 0.03, delay: 0.035 });
      if (tier >= 2) this.tone(f * 3, 0.15, { type: 'sine', vol: 0.05, delay: 0.07 });
    },
    wall() { this.tone(160, 0.05, { type: this.pack === 'soft' ? 'sine' : 'square', vol: 0.04, slide: 100 }); },
    bumper() { this.tone(320, 0.12, { type: 'square', vol: 0.07 * this.P.vol, slide: 760 }); this.tone(640, 0.08, { type: 'sine', vol: 0.08, delay: 0.02 }); },
    pickup() { [0, 2, 4, 5].forEach((s, i) => this.tone(this.note(s, 1), 0.16, { type: this.P.wave, vol: 0.16 * this.P.vol, delay: i * 0.045 })); },
    bad() { this.tone(420, 0.35, { type: 'sawtooth', vol: 0.08, slide: 140 }); this.tone(300, 0.35, { type: 'triangle', vol: 0.12, slide: 100, delay: 0.05 }); },
    shield() { this.tone(880, 0.2, { type: 'sine', vol: 0.15 }); this.tone(1320, 0.3, { type: 'sine', vol: 0.1, delay: 0.06 }); },
    shieldBreak() { this.noise(0.25, 0.3, 2400); this.tone(1200, 0.25, { type: 'triangle', vol: 0.15, slide: 400 }); },
    level() { [0, 3, 5, 7].forEach((s, i) => this.tone(this.note(s, 1), 0.28, { type: this.P.wave, vol: 0.1 * this.P.vol, delay: i * 0.07 })); },
    tierUp(tier) { for (let i = 0; i < 3 + tier; i++) this.tone(this.note(i * 2, 1), 0.2, { type: this.P.wave, vol: 0.13 * this.P.vol, delay: i * 0.05 }); },
    rage() { this.tone(110, 0.8, { type: 'sawtooth', vol: 0.18, slide: 220 }); this.noise(0.6, 0.35, 900); [0, 2, 4, 7].forEach((s, i) => this.tone(this.note(s, 1), 0.25, { type: 'square', vol: 0.06, delay: 0.2 + i * 0.06 })); },
    victory() { [0, 2, 4, 5, 7, 9].forEach((s, i) => this.tone(this.note(s, 1), 0.3, { type: this.P.wave, vol: 0.14 * this.P.vol, delay: i * 0.06 })); },
    milestone() { [0, 4, 7, 12, 16].forEach((n, i) => this.tone(523 * Math.pow(2, n / 12), 0.25, { type: 'triangle', vol: 0.12, delay: i * 0.05 })); this.noise(0.3, 0.12, 5000, { type: 'highpass' }); },
    alarm() { [0, 1, 0, 1].forEach((k, i) => this.tone(k ? 660 : 880, 0.12, { type: 'square', vol: 0.05, delay: i * 0.14 })); },
    bossRoar() { this.tone(90, 1.1, { type: 'sawtooth', vol: 0.2, slide: 45 }); this.noise(0.9, 0.25, 250); },
    bossHit() { this.tone(140, 0.2, { type: 'sine', vol: 0.3, slide: 60 }); this.noise(0.12, 0.25, 600); },
    bossDie() { this.noise(1.2, 0.4, 400); this.tone(200, 1.2, { type: 'sawtooth', vol: 0.15, slide: 30 }); this.victory(); },
    spit() { this.tone(500, 0.15, { type: 'square', vol: 0.05, slide: 200 }); },
    stun() { this.tone(220, 0.35, { type: 'square', vol: 0.08, slide: 90 }); this.noise(0.2, 0.2, 1500); },
    warp() { this.tone(300, 0.3, { type: 'sine', vol: 0.12, slide: 1200 }); },
    heartbeat() { this.tone(70, 0.12, { type: 'sine', vol: 0.35 }); this.tone(62, 0.14, { type: 'sine', vol: 0.3, delay: 0.16 }); },
    whoosh() { this.noise(0.25, 0.15, 1200, { q: 2 }); },
    tick(urgent) { this.tone(urgent ? 1400 : 1000, 0.04, { type: 'square', vol: 0.05 }); },
    horn() { this.tone(330, 0.6, { type: 'square', vol: 0.08 }); this.tone(440, 0.6, { type: 'square', vol: 0.06, delay: 0.02 }); },
    badge() { this.tone(988, 0.12, { type: 'triangle', vol: 0.14 }); this.tone(1319, 0.3, { type: 'triangle', vol: 0.14, delay: 0.1 }); },
    ballLost() { this.tone(360, 0.3, { type: 'triangle', vol: 0.16, slide: 120 }); },
    lose() { this.tone(300, 0.9, { type: 'sawtooth', vol: 0.12, slide: 45 }); this.noise(0.5, 0.35, 300); },
    best() { [0, 4, 7, 12, 16, 19, 24].forEach((n, i) => this.tone(392 * Math.pow(2, n / 12), 0.3, { type: 'triangle', vol: 0.14, delay: 0.25 + i * 0.06 })); },
    click() { this.tone(660, 0.05, { type: 'sine', vol: 0.12 }); },
  };

  // Procedural background music. Intensity: 0 off, 1 calm, 2 boss, 3 rage.
  const Music = {
    on: store.get('bib.music', true),
    intensity: 0, step: 0, nextT: 0, timer: null,
    CHORDS: [[57, 60, 64], [53, 57, 60], [60, 64, 67], [55, 59, 62]], // Am F C G (MIDI)
    set(n) {
      if (n === this.intensity) return;
      this.intensity = n;
      if (n > 0 && !this.timer && Sfx.ac) {
        this.nextT = Sfx.ac.currentTime + 0.06;
        this.timer = setInterval(() => this.tick(), 25);
      } else if (n === 0 && this.timer) {
        clearInterval(this.timer);
        this.timer = null;
      }
    },
    toggle(on) {
      this.on = on;
      store.set('bib.music', on);
      if (Sfx.musicGain) Sfx.musicGain.gain.setTargetAtTime(on ? 0.5 : 0, Sfx.ac.currentTime, 0.05);
    },
    tick() {
      const ac = Sfx.ac;
      if (!ac || ac.state !== 'running' || !this.intensity) return;
      const bpm = [0, 96, 116, 142][this.intensity];
      const dur = 60 / bpm / 4;
      if (this.nextT < ac.currentTime - 0.2) this.nextT = ac.currentTime + 0.02; // recovered from a stall
      while (this.nextT < ac.currentTime + 0.12) {
        if (this.on && !Sfx.muted) this.play(this.step, this.nextT, dur);
        this.nextT += dur;
        this.step = (this.step + 1) % 64;
      }
    },
    play(s, t, d) {
      const I = this.intensity;
      const out = Sfx.musicGain;
      const wave = Sfx.P.wave;
      const chord = this.CHORDS[Math.floor(s / 16) % 4];
      const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
      const beat = s % 16;
      // bass
      if (beat === 0 || beat === 8 || (I >= 2 && (beat === 6 || beat === 14)) || (I === 3 && beat % 2 === 0)) {
        Sfx.tone(mtof(chord[0] - 24), d * (I === 3 ? 1.6 : 3.5), { type: I === 3 ? 'sawtooth' : 'triangle', vol: I === 3 ? 0.16 : 0.22, at: t, out });
      }
      // arpeggio
      if (beat % 2 === 0 || I === 3) {
        const n = chord[(s >> (I === 3 ? 0 : 1)) % 3] + (I >= 2 ? 12 : 0);
        Sfx.tone(mtof(n), d * 1.8, { type: wave, vol: (I === 3 ? 0.06 : 0.07) * Sfx.P.vol, at: t, out });
      }
      // drums
      if (I >= 2 && beat % 4 === 0) Sfx.tone(150, 0.18, { type: 'sine', vol: 0.4, slide: 40, at: t, out });
      if (I === 3 && beat % 2 === 1) Sfx.noise(0.04, 0.08, 7000, { type: 'highpass', at: t, out });
      if (I === 3 && (beat === 4 || beat === 12)) Sfx.noise(0.14, 0.22, 1800, { at: t, out });
    },
  };

  // ================================================================ persistence: boards, bests, badges, ghosts
  const cleanName = (s) => String(s || '').replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim().slice(0, 12).trim();
  const boardKey = (m) => (m === 'classic' ? 'bib.board' : 'bib.board.' + m);
  const bestKey = (m) => (m === 'classic' ? 'bib.best' : 'bib.best.' + m);
  function loadBoard(mode) {
    const raw = store.get(boardKey(mode), []);
    return (Array.isArray(raw) ? raw : [])
      .filter((e) => e && typeof e.score === 'number' && isFinite(e.score))
      .map((e) => ({ name: cleanName(e.name) || 'Player', score: +e.score, level: Math.floor(e.level) || 1, title: typeof e.title === 'string' ? e.title.slice(0, 24) : '', date: +e.date || 0 }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);
  }
  const Boards = { classic: loadBoard('classic'), chaos: loadBoard('chaos'), survival: loadBoard('survival'), rush: loadBoard('rush'), bossrush: loadBoard('bossrush') };
  const bests = {};
  for (const m of Object.keys(Boards)) bests[m] = Math.max(+store.get(bestKey(m), 0) || 0, Boards[m][0] ? Boards[m][0].score : 0);
  const qualifies = (m, score) => !!Boards[m] && score > 0 && (Boards[m].length < 10 || score > Boards[m][Boards[m].length - 1].score);
  const rankOf = (m, score) => { const i = Boards[m].findIndex((e) => score > e.score); return (i === -1 ? Boards[m].length : i) + 1; };
  function addEntry(m, entry) {
    const l = Boards[m];
    l.push(entry);
    l.sort((a, b) => b.score - a.score || a.date - b.date);
    Boards[m] = l.slice(0, 10);
    store.set(boardKey(m), Boards[m]);
    return Boards[m].indexOf(entry) + 1;
  }
  const fmtScore = (m, v) => (m === 'survival' ? fmtTime(v) : String(v));

  const earned = new Set((store.get('bib.badges', []) || []).filter((id) => BADGES.some((b) => b.id === id)));
  const currentTitle = () => titleFor(earned.size);
  const toastQueue = [];
  function unlock(id) {
    if (earned.has(id) || G.state === 'menu') return;
    const before = currentTitle();
    earned.add(id);
    store.set('bib.badges', [...earned]);
    const badge = BADGES.find((b) => b.id === id);
    if (badge) queueToast({ icon: badge.icon, kicker: 'Badge unlocked', name: badge.name });
    const after = currentTitle();
    if (after !== before) queueToast({ icon: '★', kicker: 'New title', name: after });
    checkUnlocks();
  }

  const knownUnlocks = new Set((store.get('bib.unlocked', []) || []).filter((k) => typeof k === 'string'));
  function itemUnlocked(item) {
    if (item.badge) return earned.has(item.badge);
    if (item.games) return lifetime.games >= item.games;
    if (item.bounces) return lifetime.bounces >= item.bounces;
    if (item.bosses) return lifetime.bosses >= item.bosses;
    if (item.badgesCount) return earned.size >= item.badgesCount;
    return true;
  }
  function reqText(item) {
    if (item.badge) { const b = BADGES.find((x) => x.id === item.badge); return `Earn \u201c${b ? b.name : item.badge}\u201d: ${b ? b.desc.charAt(0).toLowerCase() + b.desc.slice(1) : ''}`; }
    if (item.games) return `Play ${item.games} games`;
    if (item.bounces) return `${item.bounces.toLocaleString()} bounces in total (${lifetime.bounces.toLocaleString()} so far)`;
    if (item.bosses) return `Beat ${item.bosses} bosses in total (${lifetime.bosses} so far)`;
    if (item.badgesCount) return `Earn ${item.badgesCount} badges (${earned.size} so far)`;
    return '';
  }
  // Announce newly unlocked cosmetics (silent on first boot, so old progress doesn't spam toasts).
  function checkUnlocks(silent) {
    let fresh = false;
    for (const [cat, g] of Object.entries(COSMETICS)) {
      for (const item of g.items) {
        const key = cat + ':' + item.id;
        if (knownUnlocks.has(key) || !itemUnlocked(item)) continue;
        knownUnlocks.add(key);
        if (item === g.items[0] || silent) continue;
        fresh = true;
        queueToast({ icon: '✧', kicker: 'Locker unlock', name: `${item.name} ${g.noun}` });
      }
    }
    store.set('bib.unlocked', [...knownUnlocks]);
    if (fresh) store.set('bib.lockerNew', true);
    updateLockerDot();
  }
  function updateLockerDot() {
    const on = !!store.get('bib.lockerNew', false);
    for (const d of $$('.locker-dot')) d.hidden = !on;
  }
  function queueToast(t) { toastQueue.push(t); if (toastQueue.length === 1) showToast(); }
  function showToast() {
    const data = toastQueue[0];
    if (!data) return;
    const t = document.createElement('div');
    t.className = 'toast';
    const medal = document.createElement('span');
    medal.className = 'medal';
    medal.textContent = data.icon;
    const txt = document.createElement('div');
    const k = document.createElement('small');
    k.textContent = data.kicker;
    const b = document.createElement('b');
    b.textContent = data.name;
    txt.append(k, b);
    t.append(medal, txt);
    el.toasts.append(t);
    Sfx.badge();
    setTimeout(() => t.classList.add('out'), 2300);
    setTimeout(() => { t.remove(); toastQueue.shift(); showToast(); }, 2700);
  }

  // ================================================================ layout
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

    for (const p of padList()) {
      if (!p.w) p.w = M.basePadW;
      p.x = clamp(p.x || W / 2, p.w / 2, W - p.w / 2);
      if (p.targetX !== null) p.targetX = clamp(p.targetX, 0, W);
    }
    for (const b of balls) { b.r = M.ballR; b.x = clamp(b.x, b.r, W - b.r); b.y = clamp(b.y, M.topY, M.botY); }
    for (const t of targets) { t.r = M.ballR * 2.6; t.x = clamp(t.x, t.r, W - t.r); t.y = clamp(t.y, H * 0.25, H * 0.75); }
    for (const u of bumpers) { u.r = M.ballR * 3.2; u.y = u.yFrac * H; u.x = clamp(u.x, u.r + 10, W - u.r - 10); }
    if (G.boss) { G.boss.r = bossRadius() * (G.boss.mini ? 0.7 : 1); }
  }

  // ================================================================ state
  const G = {
    state: 'menu',            // menu | playing | paused | dying | over
    mode: validMode(store.get('bib.mode', 'classic')),
    score: 0, hits: 0, level: 1, levelHits: 0, streak: 0, mult: 1, bestStreak: 0,
    elapsed: 0, timeLeft: RUSH_TIME, topSpeed: 1,
    time: 0, timeScale: 1, hitStop: 0,
    trauma: 0, flash: 0, flashColor: C.rust,
    fx: { wide: 0, slow: 0, magnet: 0, double: 0, shrink: 0 },
    shield: 0, spawnT: 4,
    event: null, eventT: 14, lastEvent: '',
    boss: null, bossDelay: 0, bossCount: 0, miniN: 0, bossN: 0, projectiles: [], blocks: [],
    rageT: 0,
    deathT: 0, focusX: 0, focusY: 0, zoom: 1, ending: 'miss', winner: '',
    scorePop: 0, shownScore: 0, bannerT: 0, newBest: false,
    run: null,
    lastChanceAvail: false, milestoneIdx: 0,
    dangerSlow: false,
    p1: 0, p2: 0, rally: 0, longestRally: 0,
    timeline: [], tlNext: 1, ghost: null,
    nearMarks: [],
    bg: themeBg(),
    pending: false, pendingValue: 0, lastEntry: null, lastEntryMode: '', recordsFrom: 'menu', boardMode: 'classic',
    lastTick: 99,
  };
  const newRun = () => ({ orbs: 0, bumps: 0, shrinkHits: 0, perfects: 0, events: 0, rages: 0, bosses: 0, lastChance: false });
  G.run = newRun();

  const makePad = () => ({ x: 0, vx: 0, w: 0, tw: 0, tilt: 0, flash: 0, bump: 0, targetX: null, stun: 0 });
  const pads = { top: makePad(), bot: makePad() };
  function padList() { return [pads.top, pads.bot]; }
  let balls = [];
  let targets = [];
  let bumpers = [];
  let particles = [];
  let rings = [];
  let popups = [];
  const keys = { a: false, d: false, left: false, right: false };

  const single = () => G.mode !== 'duel';
  const leveled = () => G.mode === 'classic' || G.mode === 'chaos'; // modes with levels, banners and the speed-per-level curve
  const has = {
    orbs: () => leveled() || G.mode === 'rush' || G.mode === 'bossrush',
    events: () => (G.mode === 'chaos' && G.level >= 2) || (G.mode === 'rush' && G.elapsed > 12),
    lastChance: () => leveled() || G.mode === 'survival',
  };
  const evOn = (type) => !!(G.event && G.event.type === type && G.event.t >= EVENT_WARN);

  // ================================================================ speed
  function speedK() {
    let k;
    switch (G.mode) {
      case 'survival': k = Math.min(3.2, 0.72 + G.elapsed * 0.012); break;
      case 'rush': k = Math.min(2.2, 0.8 + G.elapsed * 0.012); break;
      case 'bossrush': k = Math.min(2.2, 0.85 + G.run.bosses * 0.1); break;
      case 'duel': k = Math.min(2.2, 0.8 + G.rally * 0.05); break;
      default: k = Math.min(2.5, SPEED_START + (G.level - 1) * SPEED_PER_LEVEL + G.levelHits * 0.01);
    }
    if (G.state === 'menu') k = SPEED_START;
    if (G.rageT > 0) k *= 1.35;
    if (evOn('chaos')) k *= 1.45;
    return k;
  }
  const curSpeed = () => M.baseSpeed * speedK();
  const speedRatio = () => speedK() / SPEED_START;
  const speedLabel = () => speedRatio().toFixed(1) + '×';

  // ================================================================ entities
  function makeBall(x, y, angle, dir, speed) {
    const s = speed || curSpeed();
    return {
      x, y, r: M.ballR,
      vx: s * Math.sin(angle), vy: dir * s * Math.cos(angle),
      trail: [], sq: 0, sqv: 0, serve: 0, serveMax: 0, grow: 0,
      passed: false, danger: false,
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

  function serveBall(dir = 1, wait = 0.65) {
    const b = makeBall(W / 2, H / 2, rand(-0.45, 0.45), dir);
    b.serve = wait; b.serveMax = wait; // hovers while it grows in, then launches
    return b;
  }

  function spawnTarget() {
    const lvl = G.mode === 'rush' ? 4 : G.mode === 'bossrush' ? 3 : G.level;
    const pool = Object.entries(ORBS).filter(([k, o]) => o.min <= lvl && !(k === 'shield' && G.shield >= 2));
    let r0 = Math.random() * pool.reduce((s, [, o]) => s + o.w, 0);
    let type = pool[0][0];
    for (const [k, o] of pool) { r0 -= o.w; if (r0 <= 0) { type = k; break; } }
    const r = M.ballR * 2.6;
    let x, y, tries = 0;
    const blocked = (x, y) => targets.some((t) => Math.hypot(t.x - x, t.y - y) < r * 4)
      || (!G.boss && bumpers.some((u) => Math.abs(u.y - y) < u.r + r * 1.5))
      || (G.boss && Math.hypot(G.boss.x - x, G.boss.y - y) < G.boss.r + r * 3);
    do {
      x = rand(Math.max(r + 12, W * 0.12), Math.min(W - r - 12, W * 0.88));
      y = rand(H * 0.28, H * 0.72);
      tries++;
    } while (tries < 14 && blocked(x, y));
    targets.push({ x, y, r, type, def: ORBS[type], age: 0, life: ORBS[type].bad ? 7 : 9, phase: Math.random() * 6.28 });
  }

  function syncBumpers() {
    const want = G.level >= 6 ? 2 : G.level >= 3 ? 1 : 0;
    while (bumpers.length < want) {
      const i = bumpers.length;
      const r = M.ballR * 3.2;
      const yFrac = i ? 0.64 : 0.36;
      bumpers.push({ x: rand(W * 0.25, W * 0.75), y: yFrac * H, yFrac, r, vx: (Math.random() < 0.5 ? -1 : 1) * 60, age: 0, hit: 0 });
      ring(bumpers[i].x, bumpers[i].y, r * 4, C.ink, 3, 0.6);
    }
    for (const u of bumpers) u.vx = Math.sign(u.vx) * Math.min(160, 55 + (G.level - 3) * 12);
  }

  // ================================================================ effects
  const MAX_PARTICLES = 800;
  function emit(x, y, n, opts = {}) {
    const count = Math.round(n * (reduced ? 0.5 : 1));
    const {
      colors = [C.rust, C.ink, C.sand], speed = [80, 380], angle = 0, spread = Math.PI * 2,
      life = [0.35, 0.8], size = [1.5, 3.5], gravity = 380, drag = 2.2, spark = 0.6, shape = null,
    } = opts;
    for (let i = 0; i < count; i++) {
      const a = angle + (Math.random() - 0.5) * spread;
      const s = rand(speed[0], speed[1]);
      const l = rand(life[0], life[1]);
      particles.push({
        x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        life: l, max: l, size: rand(size[0], size[1]),
        color: colors[(Math.random() * colors.length) | 0],
        gravity, drag, spark: !shape && Math.random() < spark, shape,
      });
    }
    if (particles.length > MAX_PARTICLES) particles.splice(0, particles.length - MAX_PARTICLES);
  }
  function confetti(n = 6) {
    for (let i = 0; i < n; i++) {
      emit(W * ((i + 0.5) / n), -10, 20, {
        angle: Math.PI / 2, spread: 1.2, speed: [80, 360], gravity: 260, drag: 0.6,
        life: [1.6, 2.8], size: [3, 6], spark: 0, colors: [C.rust, C.sage, C.rose, C.sand, C.slate, C.gold],
      });
    }
  }
  function ring(x, y, max, color = C.rust, width = 3, life = 0.45, start = 0) { rings.push({ x, y, max, color, width, life, t: start }); }
  function popup(x, y, text, { size = 26, color = C.ink, life = 0.9, font = FONT_SANS, weight = 800, italic = false } = {}) {
    popups.push({ x: clamp(x, 40, W - 40), y: clamp(y, M.inset + 100, H - M.inset - 50), text, size, color, life, t: 0, font, weight, italic });
  }
  function shake(amount) { G.trauma = Math.min(1, G.trauma + amount); }
  function flash(alpha, color) { G.flash = Math.max(G.flash, alpha); G.flashColor = color; }
  function announce(text, kind = 'tier') {
    el.announce.textContent = text;
    el.announce.className = 'announce ' + kind;
    restartAnim(el.announce, 'show');
  }

  // ================================================================ game flow
  function setScreen(name) {
    for (const s of [el.menu, el.pause, el.over, el.records, el.settings, el.locker]) s.classList.remove('show');
    if (name) el[name].classList.add('show');
    document.body.classList.toggle('ui-open', !!name);
    el.btnPause.hidden = G.state !== 'playing';
  }

  function resetRun() {
    Object.assign(G, {
      score: 0, hits: 0, level: 1, levelHits: 0, streak: 0, mult: 1, bestStreak: 0,
      elapsed: 0, timeLeft: RUSH_TIME, topSpeed: 1,
      timeScale: 1, hitStop: 0, shield: 0, spawnT: G.mode === 'rush' ? 2 : 4, deathT: 0, zoom: 1,
      event: null, eventT: rand(14, 20), lastEvent: '',
      boss: null, bossDelay: G.mode === 'bossrush' ? 1.6 : 0, bossCount: 0, miniN: 0, bossN: 0, projectiles: [], blocks: [],
      rageT: 0, ending: 'miss', winner: '',
      shownScore: 0, newBest: false, flash: 0, bannerT: 0,
      lastChanceAvail: Math.random() < 0.5, milestoneIdx: 0, dangerSlow: false,
      p1: 0, p2: 0, rally: 0, longestRally: 0,
      timeline: [], tlNext: 1, nearMarks: [], lastTick: 99,
      ghost: (leveled() || G.mode === 'rush') ? store.get('bib.ghost.' + G.mode, null) : null,
      run: newRun(),
    });
    if (!Array.isArray(G.ghost)) G.ghost = null;
    for (const k of TIMED) G.fx[k] = 0;
    for (const p of padList()) { p.stun = 0; p.targetX = null; }
    targets = [];
    bumpers = [];
    popups = [];
    el.bossBar.hidden = true;
    el.eventBanner.hidden = true;
  }

  function startGame(mode) {
    commitPending();
    if (mode) { G.mode = validMode(mode); store.set('bib.mode', G.mode); }
    Sfx.init();
    Sfx.click();
    resetRun();
    G.state = 'playing';
    balls = [serveBall(1, G.mode === 'duel' ? 1.1 : 0.65)];
    el.hud.hidden = false;
    el.hud.dataset.mode = G.mode;
    updateHud();
    setScreen(null);
  }

  function pauseGame() {
    if (G.state !== 'playing') return;
    G.state = 'paused';
    fillPauseStats();
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
    refreshMenu();
    setScreen('menu');
    $('#btn-play').focus({ preventScroll: true });
  }

  function refreshMenu() {
    if (G.mode !== 'duel' && Online.state[G.mode] !== 'loading') Online.load(G.mode);
    el.menuTitle.textContent = currentTitle();
    el.menuBadges.textContent = `${earned.size}/${BADGES.length}`;
    for (const b of $$('.mode')) {
      const m = b.dataset.mode;
      b.setAttribute('aria-checked', String(m === G.mode));
      b.tabIndex = m === G.mode ? 0 : -1;
      const best = b.querySelector('.mode-best');
      if (best) best.textContent = m === 'duel' ? 'Local, 2 players' : bests[m] ? 'Best ' + fmtScore(m, bests[m]) : 'No score yet';
    }
    setText($('#btn-play-label'), 'Play ' + MODES[G.mode].name);
  }

  function levelUp() {
    G.level++;
    G.bannerT = 1.5;
    const boss = G.mode === 'chaos' ? bossKindForLevel(G.level) : null;
    el.bannerKicker.textContent = 'Level';
    el.bannerNum.textContent = G.level;
    el.bannerSub.textContent = boss === 'boss' ? 'boss incoming!' : boss === 'mini' ? 'mini-boss incoming!' : UNLOCKS[G.level] || 'speed ' + speedLabel();
    restartAnim(el.banner, 'show');
    if (G.mode === 'chaos') syncBumpers();
    Sfx.level();
    flash(0.18, C.sage);
    ring(W / 2, H / 2, Math.max(W, H) * 0.7, C.sage, 6, 0.9);
    bump(el.s[1].value);
    bump(el.s[2].value);
    if (boss) G.bossDelay = 1.8;
    if (G.level >= 5) unlock('lvl5');
    if (G.level >= 10) unlock('lvl10');
    if (G.level >= 4 && G.run.orbs === 0) unlock('purist');
  }

  // Returns the points actually awarded. Double (orb or event) ×2, Rage ×3.
  function addScore(n, raw = false) {
    if (G.mode === 'duel') return 0;
    const pts = raw ? n : n * (G.fx.double > 0 ? 2 : 1) * (G.rageT > 0 ? 3 : 1);
    G.score += pts;
    G.scorePop = 1;
    if (G.mode !== 'survival') bump(el.s[0].value);
    const best = bests[G.mode] || 0;
    if (G.mode !== 'survival' && G.mode !== 'bossrush' && G.score > best && !G.newBest && best > 0) {
      G.newBest = true;
      popup(W / 2, H * 0.4, 'new personal best!', { size: 32, color: C.rust, font: FONT_SERIF, weight: 400, italic: true, life: 1.4 });
      Sfx.milestone();
    }
    while (G.milestoneIdx < MILESTONES.length && G.score >= MILESTONES[G.milestoneIdx]) celebrate(MILESTONES[G.milestoneIdx++]);
    if (G.score >= 100) unlock('s100');
    if (G.score >= 500) unlock('s500');
    if (G.score >= 1000) unlock('milestone1000');
    if (leveled() && G.score >= 500 && G.run.orbs === 0) unlock('pure500');
    if (G.mode === 'rush' && G.score >= 100) unlock('rush100');
    return pts;
  }

  function celebrate(n) {
    announce(n.toLocaleString() + '!', 'milestone');
    confetti(n >= 1000 ? 8 : 5);
    for (let i = 0; i < 3; i++) ring(W / 2, H / 2, Math.max(W, H) * (0.3 + i * 0.2), [C.gold, C.rust, C.sage][i], 6 - i, 0.7 + i * 0.2);
    flash(0.2, C.sand);
    shake(0.3);
    Sfx.milestone();
  }

  // ================================================================ HUD
  function updateHud() {
    const m = G.mode;
    const S = el.s;
    const set = (i, label, value) => { setText(S[i].label, label); setText(S[i].value, value); };
    if (m === 'classic' || m === 'chaos') { set(0, 'Score', String(G.score)); set(1, 'Level', String(G.level)); set(2, 'Speed', speedLabel()); }
    else if (m === 'survival') { set(0, 'Time', fmtTime(G.elapsed)); set(1, 'Bounces', String(G.hits)); set(2, 'Speed', speedLabel()); }
    else if (m === 'rush') { set(0, 'Score', String(G.score)); set(1, 'Time', fmtClock(G.timeLeft)); set(2, 'Speed', speedLabel()); }
    else if (m === 'bossrush') { set(0, 'Score', String(G.score)); set(1, 'Bosses', String(G.run.bosses)); set(2, 'Speed', speedLabel()); }
    S[1].wrap.classList.toggle('urgent', m === 'rush' && G.timeLeft <= 10);

    if (m !== 'duel') {
      setText(el.best, fmtScore(m, Math.max(bests[m] || 0, m === 'survival' ? 0 : m === 'bossrush' ? G.run.bosses : G.score)));
      // Personal-best ghost: how far ahead or behind your best run you are at this moment.
      let ghostTxt = '';
      let ahead = true;
      if (m === 'survival' && bests.survival > 0) {
        const diff = G.elapsed - bests.survival;
        ahead = diff >= 0;
        ghostTxt = (ahead ? '+' : '−') + fmtTime(Math.abs(diff));
      } else if (G.ghost && G.ghost.length) {
        const g = G.ghost[Math.min(Math.floor(G.elapsed), G.ghost.length - 1)];
        const diff = G.score - g;
        ahead = diff >= 0;
        ghostTxt = (ahead ? '+' : '−') + Math.abs(diff);
      }
      if (el.ghost.hidden === !!ghostTxt) el.ghost.hidden = !ghostTxt;
      if (ghostTxt) { setText(el.ghostValue, ghostTxt); el.ghost.classList.toggle('ahead', ahead); }
    }

    const showCombo = single() && G.streak >= 2;
    if (el.combo.hidden === showCombo) el.combo.hidden = !showCombo;
    if (showCombo) {
      setText(el.mult, '×' + G.mult);
      setText(el.streak, G.streak + ' perfect');
      const ti = tierIdx(G.streak);
      let p;
      if (ti < TIERS.length) { const lo = ti ? TIERS[ti - 1].at : 0; p = (G.streak - lo) / (TIERS[ti].at - lo); }
      else p = ((G.streak - 20) % 10) / 10; // progress toward the next Rage at 30, 40…
      el.combo.style.setProperty('--p', p.toFixed(3));
      const tierName = G.rageT > 0 ? 'rage' : String(ti);
      if (el.combo.dataset.tier !== tierName) el.combo.dataset.tier = tierName;
    }
  }

  // ================================================================ collisions & scoring
  // Paddle contact: the hit position decides the bounce angle, so players can aim.
  function hitPaddle(b, which) {
    const isBot = which === 'bot';
    const p = pads[which];
    const offset = clamp((b.x - p.x) / (p.w / 2), -1, 1);
    const angle = clamp(offset * 1.05 + p.vx * 0.00006, -1.15, 1.15);
    const playing = G.state === 'playing';
    if (playing && G.mode === 'duel') { G.rally++; G.longestRally = Math.max(G.longestRally, G.rally); }
    const speed = curSpeed();
    b.vx = speed * Math.sin(angle);
    b.vy = (isBot ? -1 : 1) * speed * Math.cos(angle);
    b.y = isBot ? M.botY - b.r : M.topY + M.padH + b.r;
    b.sq = 0.85; b.sqv = 0;
    b.passed = false;

    const perfect = Math.abs(offset) < 0.22;
    p.flash = 1;
    p.bump = 1;

    const dirY = isBot ? -Math.PI / 2 : Math.PI / 2;
    const cy = isBot ? M.botY : M.topY + M.padH;
    let tier = 0;

    if (playing && G.mode === 'duel') {
      G.hits++;
      Sfx.bounce(G.rally % 10, perfect, 0);
    } else if (playing) {
      G.hits++;
      const prevStreak = G.streak;
      const prevMult = G.mult;
      if (perfect) { G.streak++; G.run.perfects++; } else G.streak = 0;
      G.bestStreak = Math.max(G.bestStreak, G.streak);
      G.mult = tierMult(G.streak);
      tier = tierIdx(G.streak);
      if (!perfect && prevStreak >= 3) popup(b.x, cy + (isBot ? -60 : 60), 'combo lost', { size: 18, color: C.slate, font: FONT_MONO, weight: 400, life: 0.8 });

      // Combo announcer and tier rewards
      if (G.mult > prevMult) {
        const t = TIERS[tier - 1];
        if (t.at !== 20) announce(t.word, 'tier t' + tier);
        Sfx.tierUp(tier);
        flash(0.12 + tier * 0.04, TIER_COLORS[tier]);
        shake(0.25 + tier * 0.1);
        ring(b.x, cy, 160 + tier * 40, TIER_COLORS[tier], 6, 0.7);
      } else if (perfect && G.streak === 15) announce('LEGENDARY!', 'tier t3');
      else if (perfect && G.streak === 3) announce('GREAT!', 'tier t0');
      if (perfect && G.streak >= 20 && (G.streak - 20) % 10 === 0) startRage();

      const pts = addScore(G.mult);
      popup(b.x, cy + (isBot ? -28 : 28), '+' + pts, { size: 22 + Math.min(G.mult, 5) * 4 + (G.rageT > 0 ? 8 : 0), color: perfect || G.rageT > 0 ? C.rust : C.ink });
      if (perfect) popup(b.x, cy + (isBot ? -64 : 64), G.streak >= 2 ? 'perfect ×' + G.streak : 'PERFECT!', { size: 24, color: TIER_COLORS[tier], font: FONT_SERIF, weight: 400, italic: true, life: 0.8 });
      if (b.danger) {
        popup(b.x, cy + (isBot ? -100 : 100), 'CLUTCH SAVE!', { size: 30, color: C.slate, life: 1.1 });
        unlock('clutch');
      }

      if (perfect) unlock('bullseye');
      if (G.streak >= 5) unlock('streak');
      if (G.streak >= 10) unlock('perfect10');
      if (G.hits >= 100) unlock('bounce100');
      if (G.fx.shrink > 0 && ++G.run.shrinkHits >= 5) unlock('tiny');
      if (leveled() && !G.boss && G.bossDelay <= 0 && ++G.levelHits >= LEVEL_HITS) { G.levelHits = 0; levelUp(); }
      updateHud();
      Sfx.bounce(G.streak + Math.min(G.level - 1, 5), perfect, tier);
    }
    b.danger = false;

    bounceEffect(b.x, cy, dirY, perfect, tier, playing ? 1 : 0.5);
    if (playing) {
      shake(perfect ? 0.28 + tier * 0.07 : 0.16);
      if (perfect) { G.hitStop = 0.045; flash(0.08 + tier * 0.03, TIER_COLORS[tier]); }
    }
  }

  // The paddle-hit burst, styled by the equipped bounce effect.
  function bounceEffect(x, y, angle, perfect, tier, power) {
    const n = ((perfect ? 26 : 14) + tier * 8) * power + G.mult * 2;
    const hot = perfect ? TIER_COLORS[tier] : C.ink;
    switch (equip.effect) {
      case 'confetti':
        emit(x, y, n, { angle, spread: Math.PI * 1.1, speed: [120, 440 + tier * 60], gravity: 420, drag: 1.6, size: [3, 6], shape: 'square', colors: [C.rust, C.sage, C.rose, C.gold, C.slate] });
        break;
      case 'ripple':
        emit(x, y, n * 0.35, { angle, spread: Math.PI * 0.6, speed: [60, 200], colors: [C.slate, C.mist] });
        for (let i = 0; i < 3; i++) ring(x, y, (perfect ? 70 : 45) + i * 28 + tier * 14, i ? C.mist : hot, 3.5 - i, 0.55 + i * 0.1, -i * 0.08);
        return;
      case 'ink':
        emit(x, y, n * 0.6, { angle, spread: Math.PI * 0.8, speed: [80, 320], gravity: 700, drag: 1.2, size: [3, 8], shape: 'blob', colors: [C.ink, C.ink, hot] });
        break;
      case 'stars':
        emit(x, y, n * 0.7, { angle, spread: Math.PI, speed: [100, 420 + tier * 60], gravity: 200, size: [4, 8], shape: 'star', colors: [C.gold, C.sand, C.rust] });
        break;
      default:
        emit(x, y, n, { angle, spread: Math.PI * 0.9, speed: [120, (perfect ? 520 : 380) + tier * 60], colors: perfect ? [TIER_COLORS[tier], C.rust, C.sand, C.ink] : [C.ink, C.rust, C.sand] });
    }
    ring(x, y, perfect ? 90 + tier * 20 : 55, hot, perfect ? 4 : 2.5);
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
      case 'double': G.fx.double = Math.max(G.fx.double, ORBS.double.dur); flash(0.12, C.ember); label('double points', C.rust); break;
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
    b.passed = false;
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

  // ================================================================ rage mode
  function startRage() {
    G.rageT = RAGE_TIME;
    G.run.rages++;
    announce(G.run.rages > 1 ? 'RAGE AGAIN!' : 'RAGE MODE!', 'rage');
    unlock('rage');
    Sfx.rage();
    flash(0.4, C.rust);
    shake(0.7);
    for (let i = 0; i < 3; i++) ring(W / 2, H / 2, Math.max(W, H) * (0.4 + i * 0.2), C.rust, 8 - i * 2, 0.6 + i * 0.2);
  }
  function endRage() {
    G.rageT = 0;
    const bonus = RAGE_BONUS * G.run.rages;
    addScore(bonus, true);
    updateHud();
    announce('RAGE SURVIVED +' + bonus, 'rage');
    confetti(7);
    flash(0.25, C.gold);
    Sfx.victory();
    unlock('rageSurvive');
  }

  // ================================================================ special events
  function startEvent(forced) {
    const types = Object.keys(EVENTS).filter((t) => t !== G.lastEvent);
    const type = EVENTS[forced] ? forced : pick(types);
    G.lastEvent = type;
    G.event = { type, t: 0, ax: (Math.random() < 0.5 ? -1 : 1) * M.baseSpeed * 0.9, jitter: 0 };
    el.eventKicker.textContent = 'Event incoming';
    el.eventName.textContent = EVENTS[type].name;
    el.eventDesc.textContent = EVENTS[type].desc;
    el.eventBanner.hidden = false;
    el.eventBanner.classList.add('warn');
    restartAnim(el.eventBanner, 'pop');
    Sfx.alarm();
  }
  function activateEvent() {
    const ev = G.event;
    el.eventKicker.textContent = 'Event';
    el.eventBanner.classList.remove('warn');
    announce(EVENTS[ev.type].name.toUpperCase() + '!', 'event');
    if (ev.type === 'double') G.fx.double = Math.max(G.fx.double, EVENT_LEN);
    if (ev.type === 'invisible') Sfx.whoosh();
    if (ev.type === 'chaos') { shake(0.4); Sfx.warp(); }
    flash(0.12, C.slate);
  }
  function endEvent(survived) {
    if (!G.event) return;
    if (survived) {
      G.run.events++;
      if (G.run.events >= 5) unlock('chaos5');
      popup(W / 2, H * 0.5, 'event survived', { size: 20, color: C.slate, font: FONT_MONO, weight: 400 });
    }
    G.event = null;
    el.eventBanner.hidden = true;
    G.eventT = rand(16, 26);
  }
  function updateEvent(dt, sdt) {
    if (G.state !== 'playing') return;
    if (!G.event) {
      if (!has.events() || G.boss || G.bossDelay > 0 || G.rageT > 0) return;
      G.eventT -= sdt;
      if (G.eventT <= 0) startEvent();
      return;
    }
    const ev = G.event;
    const was = ev.t;
    ev.t += dt;
    if (was < EVENT_WARN && ev.t >= EVENT_WARN) activateEvent();
    const p = ev.t < EVENT_WARN ? ev.t / EVENT_WARN : 1 - (ev.t - EVENT_WARN) / EVENT_LEN;
    el.eventBanner.style.setProperty('--p', clamp(p, 0, 1).toFixed(3));
    if (ev.type === 'chaos' && ev.t >= EVENT_WARN) {
      ev.jitter -= sdt;
      if (ev.jitter <= 0) {
        ev.jitter = rand(0.5, 0.9);
        for (const b of balls) {
          if (b.serve > 0) continue;
          const a = rand(-0.5, 0.5), c = Math.cos(a), s = Math.sin(a);
          [b.vx, b.vy] = [b.vx * c - b.vy * s, b.vx * s + b.vy * c];
          fixAngle(b);
          ring(b.x, b.y, 30, C.rust, 2, 0.3);
        }
      }
      G.trauma = Math.max(G.trauma, 0.12);
    }
    if (ev.t >= EVENT_WARN + EVENT_LEN) endEvent(true);
  }
  const ballVisible = () => !evOn('invisible') || ((G.event.t - EVENT_WARN) % 1.5) < 0.55;

  // ================================================================ bosses
  const bossRadius = () => clamp(Math.min(W, H) * 0.075, 34, 62);
  function spawnBoss(kind) {
    if (!kind) kind = G.mode === 'bossrush' ? (G.bossCount === 0 ? 'mini' : 'boss') : bossKindForLevel(G.level) || 'boss';
    const mini = kind === 'mini';
    G.bossCount++;
    const tier = mini ? ++G.miniN : ++G.bossN;
    // Each one is tougher than the last, and later bosses learn new attacks.
    const hp = mini ? 2 + tier : 5 + tier * 2;
    const attacks = mini
      ? (tier >= 2 ? ['spit', 'warp'] : ['spit'])
      : ['spit', 'warp'].concat(tier >= 2 ? ['wall'] : [], tier >= 3 ? ['spray'] : []);
    const names = mini ? MINI_NAMES : BOSS_NAMES;
    const name = names[(tier - 1) % names.length] + (tier > names.length ? ' II' : '');
    G.bossDelay = 0;
    G.boss = {
      x: W / 2, y: H / 2, r: bossRadius() * (mini ? 0.7 : 1), hp, maxHp: hp, t: 0, age: 0,
      attackT: mini ? 3.4 : 3, hurt: 0, mouth: 0, tier, mini, attacks, name,
    };
    if (G.event) endEvent(false);
    el.bossKind.textContent = mini ? 'Mini-boss' : 'Boss';
    el.bossName.textContent = name;
    el.bossBar.classList.toggle('mini', mini);
    el.bossBar.style.setProperty('--p', '1');
    el.bossBar.hidden = false;
    announce(mini ? 'MINI-BOSS!' : 'BOSS FIGHT!', 'boss');
    Sfx.bossRoar();
    shake(mini ? 0.35 : 0.6);
    flash(0.25, C.ink);
    for (const t of targets) if (Math.hypot(t.x - W / 2, t.y - H / 2) < G.boss.r * 3) t.dead = true;
  }
  function updateBoss(dt, sdt) {
    if (G.bossDelay > 0 && G.state === 'playing') { G.bossDelay -= dt; if (G.bossDelay <= 0) spawnBoss(); }
    const B = G.boss;
    if (!B) return;
    B.t += sdt; B.age += sdt;
    B.hurt = Math.max(0, B.hurt - sdt * 4);
    B.mouth = Math.max(0, B.mouth - sdt * 2);
    const span = Math.max(0, W / 2 - B.r - 30);
    B.x = W / 2 + Math.sin(B.t * (0.6 + B.tier * 0.1)) * span * 0.85;
    B.y = H / 2 + Math.sin(B.t * 1.3) * H * 0.04;
    if (G.state === 'playing' && B.age > 1.2) {
      B.attackT -= sdt;
      if (B.attackT <= 0) { bossAttack(B); B.attackT = Math.max(1.4, (B.mini ? 3.6 : 3.3) - B.tier * 0.3) * rand(0.85, 1.15); }
    }
  }
  function bossAttack(B, forced) {
    B.mouth = 1;
    const choices = B.attacks.flatMap((a) => (a === 'spit' ? ['spit', 'spit'] : a === 'wall' && G.blocks.length >= 2 ? [] : [a]));
    const kind = forced || pick(choices);
    if (kind === 'spit' || kind === 'spray') {
      // Fire globs at each paddle (a fan of three for "spray"). A direct hit stuns that paddle.
      const fan = kind === 'spray' ? [-0.35, 0, 0.35] : [0];
      for (const which of ['top', 'bot']) {
        const p = pads[which];
        const v = H * (kind === 'spray' ? 0.36 : 0.42);
        const ty = which === 'bot' ? M.botY : M.topY + M.padH;
        const T = Math.abs(ty - B.y) / v;
        for (const off of fan) {
          G.projectiles.push({ x: B.x, y: B.y + (which === 'bot' ? B.r : -B.r), vx: ((p.x - B.x) / T) * rand(0.7, 1.05) + off * v, vy: which === 'bot' ? v : -v, r: Math.max(6, M.ballR * 0.9) });
        }
      }
      if (kind === 'spray') popup(B.x, B.y - B.r - 30, 'spray!', { size: 26, color: C.rust, font: FONT_SERIF, weight: 400, italic: true });
      Sfx.spit();
    } else if (kind === 'warp') {
      // Bend every ball's path.
      for (const b of balls) {
        if (b.serve > 0) continue;
        b.vx = -b.vx * rand(0.6, 1.2);
        fixAngle(b);
        ring(b.x, b.y, 60, C.slate, 3, 0.4);
      }
      popup(B.x, B.y - B.r - 30, 'warp!', { size: 26, color: C.slate, font: FONT_SERIF, weight: 400, italic: true });
      Sfx.warp();
      shake(0.2);
    } else {
      // Drop two breakable blocks into the court.
      for (const fy of [0.27, 0.73]) {
        const w = clamp(W * 0.16, 60, 110);
        G.blocks.push({ x: rand(w, W - w), y: H * fy, w, h: 14, age: 0, life: 8, dead: false });
      }
      popup(B.x, B.y - B.r - 30, 'blocks!', { size: 26, color: C.ink, font: FONT_SERIF, weight: 400, italic: true });
      Sfx.bumper();
    }
  }
  function hitBoss(b, nx, ny) {
    const B = G.boss;
    const dmg = G.rageT > 0 || G.fx.double > 0 ? 2 : 1;
    B.hp -= dmg;
    B.hurt = 1;
    emit(B.x + nx * B.r, B.y + ny * B.r, 22, { angle: Math.atan2(ny, nx), spread: 1.8, speed: [120, 420], colors: [C.rust, C.ink, C.gold] });
    ring(B.x, B.y, B.r * 2, C.rust, 4, 0.4);
    popup(B.x + nx * B.r, B.y + ny * B.r - 10, '-' + dmg, { size: 26, color: C.rust });
    el.bossBar.style.setProperty('--p', Math.max(0, B.hp / B.maxHp).toFixed(3));
    restartAnim(el.bossBar, 'hit');
    Sfx.bossHit();
    shake(0.25);
    G.hitStop = 0.05;
    if (B.hp <= 0) killBoss();
  }
  function killBoss() {
    const B = G.boss;
    const bonus = (B.mini ? 25 : 50) * (G.mode === 'bossrush' ? G.run.bosses + 1 : G.level);
    for (let i = 0; i < 4; i++) emit(B.x, B.y, B.mini ? 24 : 40, { colors: [C.ink, C.rust, C.gold, C.sand], speed: [150, 700], life: [0.6, 1.5] });
    for (let i = 0; i < 4; i++) ring(B.x, B.y, B.r * (3 + i * 2), [C.rust, C.gold, C.ink, C.sage][i], 8 - i, 0.6 + i * 0.15);
    G.boss = null;
    G.projectiles = [];
    el.bossBar.hidden = true;
    G.hitStop = 0.3;
    flash(0.4, C.gold);
    shake(B.mini ? 0.5 : 0.8);
    addScore(bonus, true);
    G.run.bosses++;
    updateHud();
    announce((B.mini ? 'MINI-BOSS DOWN +' : 'BOSS DEFEATED +') + bonus, 'boss');
    confetti(B.mini ? 4 : 6);
    Sfx.bossDie();
    unlock('boss');
    if (G.mode === 'bossrush') {
      if (G.run.bosses >= 3) unlock('gauntlet');
      if (G.run.bosses >= 6) unlock('monster');
      G.bossDelay = 2.6; // the next one is on its way
    }
  }
  function stunPad(which) {
    const p = pads[which];
    p.stun = 1.6;
    const y = which === 'bot' ? M.botY : M.topY;
    emit(p.x, y, 24, { colors: [C.ink, C.rust, C.slate], speed: [80, 300] });
    popup(p.x, which === 'bot' ? M.botY - 50 : M.topY + 60, 'stunned!', { size: 24, color: C.rust, font: FONT_SERIF, weight: 400, italic: true });
    shake(0.35);
    flash(0.15, C.ink);
    Sfx.stun();
  }

  // ================================================================ losing a ball
  function nearMiss(b, edge) {
    if (G.state !== 'playing') return;
    const p = edge > 0 ? pads.bot : pads.top;
    const left = p.x - p.w / 2, right = p.x + p.w / 2;
    const gap = Math.round(Math.max(0, (b.x < left ? left - b.x : b.x - right) - b.r));
    if (gap > 36) return;
    const y = edge > 0 ? M.botY + M.padH / 2 : M.topY + M.padH / 2;
    G.nearMarks.push({ x1: b.x < left ? b.x + b.r : right, x2: b.x < left ? left : b.x - b.r, y, t: 0 });
    popup(b.x, edge > 0 ? M.botY - 40 : M.topY + 50, gap <= 2 ? 'by a hair!' : `so close! ${gap}px`, { size: 22, color: C.rust, font: FONT_SERIF, weight: 400, italic: true, life: 1.2 });
    Sfx.whoosh();
  }

  function loseBall(b) {
    const edge = b.y > H / 2 ? 1 : -1;
    const x = clamp(b.x, 10, W - 10);
    const edgeY = edge > 0 ? H - M.inset : M.inset;
    if (G.state === 'menu') { balls = [serveBall(1)]; return; }
    if (G.state !== 'playing') return;

    if (G.mode === 'duel') {
      // The player whose edge the ball left through loses the point.
      const bottomScored = edge < 0;
      if (bottomScored) G.p1++; else G.p2++;
      G.rally = 0;
      emit(x, edge > 0 ? H : 0, 30, { angle: edge > 0 ? -Math.PI / 2 : Math.PI / 2, spread: 1.8, colors: [C.rust, C.ink, C.sand] });
      shake(0.4);
      Sfx.ballLost();
      G.scorePop = 1;
      if (G.p1 >= DUEL_TARGET || G.p2 >= DUEL_TARGET) {
        G.winner = G.p1 > G.p2 ? 'bottom' : 'top';
        b.dead = true;
        endRun('match', x, edgeY);
      } else {
        announce((bottomScored ? 'BOTTOM' : 'TOP') + ' SCORES!', 'event');
        balls = [serveBall(edge, 1.1)];
      }
      return;
    }

    if (balls.length > 1) {
      balls.splice(balls.indexOf(b), 1);
      emit(x, edge > 0 ? H : 0, 16, { angle: edge > 0 ? -Math.PI / 2 : Math.PI / 2, spread: 1.6, colors: [C.slate, C.ink] });
      Sfx.ballLost();
      popup(x, edge > 0 ? H - 70 : 70, 'ball lost', { size: 18, color: C.slate, font: FONT_MONO, weight: 400 });
      shake(0.15);
      return;
    }

    if (G.mode === 'rush') {
      G.timeLeft -= 3;
      G.streak = 0; G.mult = 1;
      popup(x, edge > 0 ? H - 80 : 80, '−3 s', { size: 34, color: C.rust });
      emit(x, edge > 0 ? H : 0, 24, { angle: edge > 0 ? -Math.PI / 2 : Math.PI / 2, spread: 1.6, colors: [C.rust, C.ink] });
      flash(0.2, C.rust);
      shake(0.4);
      Sfx.ballLost();
      updateHud();
      if (G.timeLeft <= 0) { G.timeLeft = 0; b.dead = true; endRun('time', W / 2, H / 2); }
      else balls = [serveBall(edge, 0.5)];
      return;
    }

    // Last chance: once per run, a lucky (and rare) second serve.
    const ready = G.mode === 'survival' ? G.elapsed >= 20 : G.score >= 20;
    if (has.lastChance() && G.lastChanceAvail && ready) {
      G.lastChanceAvail = false;
      G.run.lastChance = true;
      G.streak = 0; G.mult = 1;
      announce('LAST CHANCE!', 'last');
      emit(x, edge > 0 ? H : 0, 40, { angle: edge > 0 ? -Math.PI / 2 : Math.PI / 2, spread: 2, colors: [C.gold, C.sand, C.ink] });
      flash(0.3, C.gold);
      shake(0.5);
      Sfx.heartbeat();
      Sfx.shield();
      unlock('secondwind');
      balls = [serveBall(1, 1.4)];
      updateHud();
      return;
    }

    b.dead = true;
    endRun('miss', x, edgeY);
  }

  // Ends a run with a short slow-motion sequence, then shows the results.
  function endRun(kind, x, y) {
    G.state = 'dying';
    G.ending = kind;
    G.deathT = 0;
    G.focusX = x;
    G.focusY = y;
    G.dangerSlow = false;
    if (G.event) { G.event = null; el.eventBanner.hidden = true; }
    G.rageT = 0;
    el.btnPause.hidden = true;
    if (kind === 'miss') {
      emit(x, y, 70, { angle: y > H / 2 ? -Math.PI / 2 : Math.PI / 2, spread: 2.2, speed: [150, 700], colors: [C.rust, C.ink, C.rose, C.sand], life: [0.6, 1.4] });
      ring(x, y, Math.max(W, H) * 0.5, C.rust, 8, 1.2);
      shake(0.9);
      flash(0.45, C.rust);
      Sfx.lose();
    } else if (kind === 'time') {
      announce('TIME!', 'time');
      confetti(6);
      flash(0.3, C.sand);
      Sfx.horn();
      for (const b of balls) emit(b.x, b.y, 20, { colors: [C.rust, C.ink] });
      balls = [];
    } else {
      announce((G.winner === 'bottom' ? 'BOTTOM' : 'TOP') + ' WINS!', 'time');
      confetti(8);
      flash(0.3, C.gold);
      shake(0.6);
      Sfx.victory();
    }
  }

  function gameOver() {
    G.state = 'over';
    const m = G.mode;
    // Lifetime stats drive some Locker unlocks.
    lifetime.games++;
    lifetime.bounces += G.hits;
    lifetime.perfects += G.run.perfects;
    lifetime.bosses += G.run.bosses;
    store.set('bib.stats', lifetime);
    checkUnlocks();
    el.hud.hidden = true;
    el.bossBar.hidden = true;
    const stats = [];
    let isBest = false;
    let value = G.score;
    const setTitle = (text) => { el.overTitle.replaceChildren(); const em = document.createElement('em'); em.textContent = text; el.overTitle.append(em); };

    if (m === 'duel') {
      el.overEyebrow.textContent = 'Two players · match over';
      setTitle((G.winner === 'bottom' ? 'Bottom' : 'Top') + ' wins!');
      el.overScore.textContent = `${G.p1}–${G.p2}`;
      el.overUnit.textContent = 'bottom – top';
      stats.push(['Longest rally', G.longestRally], ['Bounces', G.hits], ['Time', fmtClock(G.elapsed)], ['Top speed', G.topSpeed.toFixed(1) + '×']);
      unlock('duel');
    } else {
      value = m === 'survival' ? Math.round(G.elapsed * 10) / 10 : m === 'bossrush' ? G.run.bosses : G.score;
      isBest = value > (bests[m] || 0);
      if (isBest) {
        bests[m] = value;
        store.set(bestKey(m), value);
        if (m === 'classic' || m === 'chaos' || m === 'rush') store.set('bib.ghost.' + m, G.timeline.concat([G.score]).slice(0, 3600));
      }
      el.overEyebrow.textContent = MODES[m].name + ' · game over';
      setTitle(m === 'rush' ? 'Time’s up!' : 'Missed it.');
      el.overScore.textContent = fmtScore(m, value);
      el.overUnit.textContent = MODES[m].unit;
      if (m === 'classic' || m === 'chaos') stats.push(['Best', fmtScore(m, bests[m])], ['Level', G.level], ['Bounces', G.hits], ['Top streak', G.bestStreak]);
      if (m === 'survival') stats.push(['Best', fmtScore(m, bests[m])], ['Bounces', G.hits], ['Top streak', G.bestStreak], ['Top speed', G.topSpeed.toFixed(1) + '×']);
      if (m === 'rush') stats.push(['Best', fmtScore(m, bests[m])], ['Bounces', G.hits], ['Top streak', G.bestStreak], ['Orbs', G.run.orbs]);
      if (m === 'bossrush') stats.push(['Best', fmtScore(m, bests[m])], ['Points', G.score], ['Bounces', G.hits], ['Top streak', G.bestStreak]);
    }
    fillStats(el.overStats, stats);
    el.overNew.hidden = !isBest || value === 0;

    // Leaderboard: any scoring run can be saved to the online board; this browser keeps its own top 10 too.
    G.pending = m !== 'duel' && value > 0;
    G.pendingLocal = qualifies(m, value);
    G.pendingValue = value;
    G.pendingRun = { level: G.level, seconds: Math.round(G.elapsed * 10) / 10, hits: G.hits };
    el.nameForm.hidden = !G.pending;
    el.nameForm.querySelector('button').disabled = false;
    el.rankLine.hidden = G.pending;
    if (G.pending) {
      el.nameInput.value = store.get('bib.name', '');
    } else if (m === 'duel') {
      el.rankLine.textContent = 'Rematch? Same controls, fresh score.';
    } else {
      el.rankLine.textContent = 'Bounce it at least once to get on the leaderboard.';
    }
    resetShareLabel();
    setScreen('over');
    if (G.pending && finePointer) el.nameInput.focus({ preventScroll: true });
    else $('#btn-again').focus({ preventScroll: true });
    if (isBest && value > 0) { Sfx.best(); confetti(6); }
  }

  function fillStats(dl, pairs) {
    dl.replaceChildren();
    for (const [k, v] of pairs) {
      const d = document.createElement('div');
      const dt = document.createElement('dt'); dt.textContent = k;
      const dd = document.createElement('dd'); dd.textContent = String(v);
      d.append(dt, dd);
      dl.append(d);
    }
  }

  function fillPauseStats() {
    el.pauseMode.textContent = MODES[G.mode].name;
    const pct = G.hits ? Math.round((G.run.perfects / G.hits) * 100) + '%' : '–';
    const s = [['Time', fmtTime(G.elapsed)]];
    if (G.mode === 'duel') s.push(['Score', `${G.p1}–${G.p2}`], ['Rally', G.rally], ['Longest rally', G.longestRally], ['Speed', speedLabel()]);
    else {
      s.push(['Score', G.score]);
      if (leveled()) s.push(['Level', G.level]);
      if (G.mode === 'rush') s.push(['Time left', fmtClock(G.timeLeft)]);
      s.push(['Bounces', G.hits], ['Perfect hits', pct], ['Streak', G.streak], ['Top streak', G.bestStreak], ['Speed', speedLabel()]);
      if (G.mode !== 'survival') s.push(['Orbs', G.run.orbs], ['Events', G.run.events]);
      if (G.run.rages) s.push(['Rages', G.run.rages]);
      if (G.run.bosses) s.push(['Bosses', G.run.bosses]);
    }
    fillStats(el.pauseStats, s);
  }

  // Save the run to this browser's own top 10 (on submit, or automatically when leaving the screen).
  // Only an explicit "Save" also sends it to the online leaderboard, so no name is published without asking.
  function commitPending() {
    if (!G.pending) return null;
    G.pending = false;
    const name = cleanName(el.nameInput.value) || 'Player';
    store.set('bib.name', name);
    G.lastEntryMode = G.mode;
    if (G.pendingLocal) {
      G.lastEntry = { name, score: G.pendingValue, level: G.level, title: currentTitle(), date: Date.now() };
      addEntry(G.mode, G.lastEntry);
    }
    el.nameForm.hidden = true;
    el.rankLine.hidden = false;
    el.rankLine.textContent = 'Saved on this device.';
    return name;
  }

  // ================================================================ online leaderboard
  // A random id for this browser, so each player keeps one entry (their best) per mode.
  const playerId = (() => {
    let id = store.get('bib.pid', '');
    if (typeof id !== 'string' || !/^[a-f0-9]{32}$/.test(id)) {
      const bytes = new Uint8Array(16);
      crypto.getRandomValues(bytes);
      id = [...bytes].map((x) => x.toString(16).padStart(2, '0')).join('');
      store.set('bib.pid', id);
    }
    return id;
  })();
  const Online = {
    cache: {},          // mode → { rows, total, you }
    state: {},          // mode → 'loading' | 'ok' | 'off' | 'error'
    async request(method, body, query = '') {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), 7000);
      try {
        const res = await fetch('/api/scores' + query, {
          method,
          signal: ctl.signal,
          headers: { 'Content-Type': 'application/json', 'x-player-id': playerId },
          body: body ? JSON.stringify(body) : undefined,
        });
        let data = null;
        try { data = await res.json(); } catch { /* not JSON, e.g. no API on this host */ }
        return { ok: res.ok && !!data, status: res.status, data };
      } catch {
        return { ok: false, status: 0, data: null };
      } finally {
        clearTimeout(timer);
      }
    },
    async load(mode) {
      this.state[mode] = 'loading';
      const r = await this.request('GET', null, '?mode=' + encodeURIComponent(mode));
      if (r.ok && Array.isArray(r.data.rows)) {
        this.cache[mode] = r.data;
        this.state[mode] = 'ok';
      } else {
        this.state[mode] = r.status === 503 ? 'off' : 'error';
      }
      if (el.records.classList.contains('show') && G.boardMode === mode) renderBoard();
      return this.cache[mode] || null;
    },
  };
  const ordinal = (n) => n.toLocaleString();

  async function submitOnline(name) {
    const m = G.mode;
    el.rankLine.hidden = false;
    el.rankLine.textContent = 'Saving to the online leaderboard…';
    const r = await Online.request('POST', {
      mode: m, pid: playerId, name, score: G.pendingValue, title: currentTitle(), ...G.pendingRun,
    });
    if (r.ok) {
      const d = r.data;
      el.rankLine.textContent = d.saved
        ? `Saved as ${name}: #${ordinal(d.rank)} of ${ordinal(d.total)} on the ${MODES[m].name} leaderboard`
        : `Your best is still ${fmtScore(m, d.best)} (#${ordinal(d.rank)} of ${ordinal(d.total)}). Saved on this device too.`;
      Online.load(m); // redraws the board itself if it's open
    } else if (r.status === 400 || r.status === 429) {
      el.rankLine.textContent = (r.data && r.data.error ? r.data.error : 'That score couldn’t be saved.') + ' Saved on this device.';
      if (r.data && /name/i.test(r.data.error || '')) { // let them pick another name (already saved locally, so don't save that twice)
        G.pending = true; G.pendingLocal = false;
        el.nameForm.hidden = false; el.nameForm.querySelector('button').disabled = false;
      }
    } else {
      el.rankLine.textContent = 'Couldn’t reach the online leaderboard, so it’s saved on this device.';
    }
  }

  // ================================================================ share card
  const shareLabel = (t) => { el.btnShare.querySelector('span').textContent = t; };
  function resetShareLabel() { shareLabel('Share score card'); }
  async function shareCard() {
    if (document.fonts && document.fonts.ready) await document.fonts.ready;
    const cv = document.createElement('canvas');
    cv.width = 1200; cv.height = 630;
    const c = cv.getContext('2d');
    const m = G.mode;
    c.fillStyle = C.paper; c.fillRect(0, 0, 1200, 630);
    c.fillStyle = 'rgba(28,27,29,0.07)';
    for (let y = 20; y < 630; y += 30) for (let x = 20; x < 1200; x += 30) c.fillRect(x - 1, y - 1, 2, 2);
    // frame with an offset shadow
    c.fillStyle = C.ink; c.fillRect(48, 48, 1112, 542);
    c.fillStyle = C.paper; c.fillRect(36, 36, 1112, 542);
    c.strokeStyle = C.ink; c.lineWidth = 4; c.strokeRect(36, 36, 1112, 542);
    // text
    c.fillStyle = C.ink;
    c.font = `22px ${FONT_MONO}`;
    c.fillText(`BOUNCE IT BACK 2.0 · ${MODES[m].name.toUpperCase()}`, 84, 108);
    const big = m === 'duel' ? `${G.p1}–${G.p2}` : fmtScore(m, m === 'survival' ? Math.round(G.elapsed * 10) / 10 : m === 'bossrush' ? G.run.bosses : G.score);
    c.font = `800 190px ${FONT_SANS}`;
    c.fillText(big, 76, 300, 700);
    c.font = `italic 54px ${FONT_SERIF}`;
    c.fillStyle = C.rust;
    c.fillText(m === 'duel' ? (G.winner === 'bottom' ? 'Bottom wins!' : 'Top wins!') : MODES[m].unit, 84, 370);
    c.fillStyle = C.ink;
    c.font = `600 28px ${FONT_SANS}`;
    const line = m === 'duel' ? `Longest rally ${G.longestRally} · ${G.hits} bounces`
      : `${m === 'classic' || m === 'chaos' ? 'Level ' + G.level + ' · ' : m === 'bossrush' ? G.score + ' points · ' : ''}${G.hits} bounces · top streak ${G.bestStreak}`;
    c.fillText(line, 84, 440, 700);
    c.font = `24px ${FONT_MONO}`;
    const name = cleanName(store.get('bib.name', ''));
    c.fillText(`${name ? name + ' · ' : ''}${currentTitle()} · ${earned.size}/${BADGES.length} badges`, 84, 490, 720);
    c.fillStyle = C.rust;
    // wherever the game is hosted, without the protocol or a trailing index.html
    c.fillText((location.host + location.pathname).replace(/index\.html$/, '').replace(/\/$/, ''), 84, 540, 720);
    // art: paddles, ball and trail
    c.fillStyle = C.ink;
    c.fillRect(840, 120, 220, 16); c.fillRect(840, 480, 220, 16);
    c.fillStyle = C.rust;
    c.fillRect(925, 124, 50, 8); c.fillRect(925, 484, 50, 8);
    for (let i = 8; i >= 0; i--) {
      c.globalAlpha = i ? (1 - i / 9) * 0.35 : 1;
      c.beginPath(); c.arc(985 - i * 14, 330 + i * 22, 18 * (i ? 1 - i / 14 : 1), 0, Math.PI * 2); c.fill();
    }
    c.globalAlpha = 1;
    c.strokeStyle = C.ink; c.lineWidth = 3;
    c.beginPath(); c.arc(985, 330, 18, 0, Math.PI * 2); c.stroke();

    const blob = await new Promise((r) => cv.toBlob(r, 'image/png'));
    if (!blob) { shareLabel('Could not create card'); return; }
    const file = new File([blob], 'bounce-it-back-score.png', { type: 'image/png' });
    const text = m === 'duel' ? `We just played Bounce it Back 2.0: ${big}!` : `I got ${big} ${MODES[m].unit} in Bounce it Back 2.0 (${MODES[m].name}). Can you beat it?`;
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: 'Bounce it Back 2.0', text }); shareLabel('Shared!'); return; }
      catch (e) { if (e && e.name === 'AbortError') return; }
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = file.name;
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    shareLabel('Card downloaded');
  }

  // ================================================================ records & settings screens
  let lastBoardDraw = '';
  function renderRecords() {
    renderBoard();
    renderBadges();
  }
  // The leaderboard tab. Online scores (everyone's) when we have them; this browser's own top 10 only if
  // the online board can't be reached. While a refresh is in flight we keep showing the last online list,
  // and we only rebuild the list when something actually changed, so it never flickers between sources.
  function renderBoard() {
    const m = G.boardMode;
    for (const b of $$('.board-mode')) b.setAttribute('aria-pressed', String(b.dataset.mode === m));
    const st = Online.state[m];
    const online = Online.cache[m] || null;
    let rows = [];
    let status;
    if (online) {
      rows = online.rows;
      const you = online.you;
      status = `Everyone’s best · ${ordinal(online.total)} player${online.total === 1 ? '' : 's'}`
        + (you ? ` · you’re #${ordinal(you.rank)}` : '')
        + (st === 'error' ? ' · couldn’t refresh' : '');
    } else if (st === 'off' || st === 'error') {
      rows = Boards[m];
      status = st === 'off'
        ? 'The online leaderboard isn’t set up yet, so these are this browser’s scores.'
        : 'Couldn’t reach the online leaderboard, so these are this browser’s scores.';
    } else {
      status = 'Loading the online leaderboard…';
    }
    setText(el.boardStatus, status);
    const loading = !online && st !== 'off' && st !== 'error';
    const key = m + '|' + (online ? 'online' : loading ? 'loading' : 'local') + '|' + JSON.stringify(rows);
    if (key === lastBoardDraw) return;
    lastBoardDraw = key;
    el.boardList.classList.toggle('loading', loading);
    el.boardList.replaceChildren();
    el.boardEmpty.hidden = loading || rows.length > 0;
    rows.forEach((e, i) => {
      const li = document.createElement('li');
      if (online ? e.you : e === G.lastEntry) li.className = 'me';
      const rank = document.createElement('span'); rank.className = 'rank'; rank.textContent = String(i + 1).padStart(2, '0');
      const who = document.createElement('span'); who.className = 'who';
      const nm = document.createElement('b'); nm.textContent = e.name;
      who.append(nm);
      if (e.title) { const t = document.createElement('small'); t.textContent = e.title; who.append(t); }
      const lvl = document.createElement('span'); lvl.className = 'lvl'; lvl.textContent = m === 'classic' || m === 'chaos' ? 'L' + e.level : '';
      const sc = document.createElement('span'); sc.className = 'pts'; sc.textContent = fmtScore(m, e.score);
      li.append(rank, who, lvl, sc);
      el.boardList.append(li);
    });
  }

  function renderBadges() {
    el.badgeGrid.replaceChildren();
    for (const b of BADGES) {
      const d = document.createElement('div');
      d.className = 'badge' + (earned.has(b.id) ? ' got' : '');
      const md = document.createElement('span'); md.className = 'medal'; md.textContent = earned.has(b.id) ? b.icon : '?';
      const n = document.createElement('b'); n.textContent = b.name;
      const s = document.createElement('small'); s.textContent = b.desc;
      d.append(md, n, s);
      el.badgeGrid.append(d);
    }
    el.badgeCount.textContent = `${earned.size}/${BADGES.length}`;
    const next = TITLES.find((t) => t.at > earned.size);
    const need = next ? next.at - earned.size : 0;
    el.titleLine.textContent = `Your title: ${currentTitle()}` + (next ? ` · ${need} more badge${need === 1 ? '' : 's'} to ${next.name}` : ' · every badge earned!');
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
    G.boardMode = G.recordsFrom === 'over' && G.lastEntryMode ? G.lastEntryMode : (G.mode === 'duel' ? 'classic' : G.mode);
    renderBadges();
    refreshBoard(G.boardMode);
    selectTab(tab || 'board');
    setScreen('records');
    $('#btn-records-back').focus({ preventScroll: true });
  }
  // Show what we have right away, then refresh from the server and redraw if this board is still open.
  function refreshBoard(m) {
    renderBoard();
    if (Online.state[m] === 'loading') return; // a refresh is already on its way and redraws when it lands
    Online.load(m);
  }
  function closeRecords() {
    setScreen(G.recordsFrom);
    if (G.recordsFrom === 'menu') refreshMenu();
    (G.recordsFrom === 'over' ? $('#btn-again') : $('#btn-play')).focus({ preventScroll: true });
  }
  function selectTab(name) {
    for (const t of $$('[role="tab"]')) {
      const on = t.dataset.tab === name;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
      $('#' + t.getAttribute('aria-controls')).hidden = !on;
    }
  }

  // ---------------------------------------------------------------- the Locker
  let lockerCat = 'ball';
  let lockerFrom = 'menu';
  function applyTheme() {
    document.body.classList.toggle('dark', !!theme().dark);
    document.body.dataset.theme = equip.theme;
  }
  function openLocker() {
    commitPending();
    lockerFrom = el.over.classList.contains('show') ? 'over' : 'menu';
    store.set('bib.lockerNew', false);
    updateLockerDot();
    renderLocker();
    setScreen('locker');
    $('#btn-locker-back').focus({ preventScroll: true });
  }
  function closeLocker() {
    setScreen(lockerFrom);
    if (lockerFrom === 'menu') refreshMenu();
    (lockerFrom === 'over' ? $('#btn-again') : $('#btn-play')).focus({ preventScroll: true });
  }
  function renderLocker() {
    for (const b of $$('.locker-cat')) b.setAttribute('aria-pressed', String(b.dataset.cat === lockerCat));
    const group = COSMETICS[lockerCat];
    el.lockerGrid.replaceChildren();
    for (const item of group.items) {
      const open = itemUnlocked(item);
      const on = equip[lockerCat] === item.id;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'locker-item' + (open ? '' : ' locked') + (on ? ' on' : '');
      btn.setAttribute('aria-pressed', String(on));
      if (!open) btn.setAttribute('aria-disabled', 'true');
      const cv = document.createElement('canvas');
      cv.width = 192; cv.height = 120;
      paintPreview(cv.getContext('2d'), lockerCat, item.id);
      const n = document.createElement('b'); n.textContent = item.name;
      const s = document.createElement('small'); s.textContent = on ? 'Equipped' : open ? 'Tap to equip' : 'Locked · ' + reqText(item);
      btn.append(cv, n, s);
      btn.addEventListener('click', () => {
        if (!open) { Sfx.init(); Sfx.wall(); return; }
        equip[lockerCat] = item.id;
        store.set('bib.equip', equip);
        applyTheme();
        Sfx.init(); Sfx.click();
        renderLocker();
      });
      el.lockerGrid.append(btn);
    }
    let total = 0, got = 0;
    for (const g of Object.values(COSMETICS)) for (const i of g.items) { total++; if (itemUnlocked(i)) got++; }
    el.lockerCount.textContent = `${got}/${total} unlocked`;
  }
  // Little static previews for the Locker grid (96×60 at 2× resolution).
  function paintPreview(c, cat, id) {
    c.scale(2, 2);
    const w = 96, h = 60;
    const T = THEMES[cat === 'theme' ? id : equip.theme];
    c.fillStyle = T.bg; c.fillRect(0, 0, w, h);
    if (T.bg2) { const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, T.bg2); c.globalAlpha = 0.75; c.fillStyle = g; c.fillRect(0, 0, w, h); c.globalAlpha = 1; }
    if (T.grid) {
      c.strokeStyle = T.dot; c.lineWidth = 0.75; c.beginPath();
      for (let y = 6; y < h; y += 12) { c.moveTo(0, y); c.lineTo(w, y); }
      for (let x = 6; x < w; x += 12) { c.moveTo(x, 0); c.lineTo(x, h); }
      c.stroke();
    } else {
      c.fillStyle = T.dot;
      for (let y = 6; y < h; y += 12) for (let x = 6; x < w; x += 12) c.fillRect(x - 0.75, y - 0.75, 1.5, 1.5);
    }
    const ink = T.dark ? C.paper : C.ink;
    const ball = (x, y, r, skin) => { c.save(); c.translate(x, y); paintBallSkin(c, skin, r, 0.5); c.restore(); };
    if (cat === 'paddle') paintPaddleSkin(c, 14, 25, 68, 10, id, 1.3, ink);
    else if (cat === 'ball') ball(48, 30, 13, id);
    else if (cat === 'trail') {
      const pts = [];
      for (let i = 0; i < 14; i++) pts.push(76 - i * 4.6, 16 + i * 2.4 + Math.sin(i * 0.7) * 3);
      paintTrail(c, pts, 6, id, C.rust, 0, 1);
      ball(76, 16, 6, equip.ball);
    } else if (cat === 'theme') {
      paintPaddleSkin(c, 26, 47, 44, 6, equip.paddle, 1, ink);
      ball(58, 26, 6, equip.ball);
    } else if (cat === 'effect') {
      paintEffectPreview(c, id, 48, 44, ink);
      paintPaddleSkin(c, 28, 46, 40, 6, equip.paddle, 1, ink);
    }
  }
  function paintEffectPreview(c, id, x, y, ink) {
    if (id === 'ripple') {
      for (let i = 0; i < 3; i++) {
        c.globalAlpha = 1 - i * 0.28; c.strokeStyle = i ? C.mist : C.slate; c.lineWidth = 2 - i * 0.4;
        c.beginPath(); c.ellipse(x, y, 12 + i * 10, (12 + i * 10) * 0.6, 0, Math.PI, Math.PI * 2); c.stroke();
      }
      c.globalAlpha = 1;
      return;
    }
    for (let i = 0; i < 9; i++) {
      const a = -Math.PI / 2 + (i - 4) * 0.33;
      const d = 12 + (i % 3) * 7;
      const px = x + Math.cos(a) * d * 1.5, py = y + Math.sin(a) * d;
      if (id === 'confetti') {
        c.save(); c.translate(px, py); c.rotate(i); c.fillStyle = [C.rust, C.sage, C.rose, C.gold, C.slate][i % 5]; c.fillRect(-2.5, -1.5, 5, 3); c.restore();
      } else if (id === 'ink') {
        c.fillStyle = i % 3 ? ink : C.rust; c.beginPath(); c.arc(px, py, 1.5 + (i % 3), 0, Math.PI * 2); c.fill();
      } else if (id === 'stars') {
        c.fillStyle = [C.gold, C.sand, C.rust][i % 3]; starPath(c, px, py, 3.5, i, 5, 0.45); c.fill();
      } else {
        c.strokeStyle = [C.rust, ink, C.sand][i % 3]; c.lineWidth = 1.6; c.lineCap = 'round';
        c.beginPath(); c.moveTo(px, py); c.lineTo(px - Math.cos(a) * 5, py - Math.sin(a) * 5); c.stroke();
      }
    }
  }

  let settingsFrom = 'menu';
  function openSettings() {
    settingsFrom = G.state === 'paused' ? 'pause' : G.state === 'over' ? 'over' : 'menu';
    for (const b of $$('.pack')) b.setAttribute('aria-checked', String(b.dataset.pack === Sfx.pack));
    el.musicToggle.setAttribute('aria-checked', String(Music.on));
    setScreen('settings');
    $('#btn-settings-back').focus({ preventScroll: true });
  }
  function closeSettings() { setScreen(settingsFrom); }

  // ================================================================ update
  function update(dt) {
    G.time += dt;
    const playing = G.state === 'playing';

    // Danger slow-mo: the last ball is about to slip past a paddle.
    G.dangerSlow = false;
    if (playing && single() && balls.length === 1 && G.shield === 0) {
      const b = balls[0];
      if (b.serve <= 0 && !b.passed) {
        const toBot = b.vy > 0;
        const p = toBot ? pads.bot : pads.top;
        const d = toBot ? M.botY - (b.y + b.r) : b.y - b.r - (M.topY + M.padH);
        if (d > 0 && d < Math.max(70, Math.abs(b.vy) * 0.16)) {
          let px = b.x + b.vx * (d / Math.abs(b.vy));
          if (px < 0) px = -px; else if (px > W) px = 2 * W - px;
          if (px < p.x - p.w / 2 - b.r || px > p.x + p.w / 2 + b.r) {
            G.dangerSlow = true;
            if (!b.danger) { b.danger = true; Sfx.heartbeat(); }
          }
        }
      }
    }

    // Time scale: slow-mo orb, danger, death slow-down, brief hit-stop.
    let tsTarget = G.fx.slow > 0 ? 0.55 : 1;
    if (G.dangerSlow) tsTarget = 0.3;
    if (G.state === 'dying') tsTarget = 0.12;
    if (G.state === 'over') tsTarget = 0.5;
    G.timeScale = lerp(G.timeScale, tsTarget, damp(G.state === 'dying' || G.dangerSlow ? 12 : 5, dt));
    let sdt = dt * G.timeScale;
    if (G.hitStop > 0) { G.hitStop -= dt; sdt = 0; }
    if (G.state === 'paused') sdt = 0;

    if (G.state === 'dying') {
      G.deathT += dt;
      G.zoom = lerp(G.zoom, reduced || G.ending !== 'miss' ? 1 : 1.12, damp(4, dt));
      if (G.deathT > (G.ending === 'miss' ? 1.25 : 1.6)) gameOver();
    } else {
      G.zoom = lerp(G.zoom, 1, damp(6, dt));
    }

    if (playing) {
      G.elapsed += dt;
      G.topSpeed = Math.max(G.topSpeed, speedRatio());
      while (G.elapsed >= G.tlNext) { G.timeline.push(G.score); G.tlNext++; }
      if (G.elapsed >= 60 && (leveled() || G.mode === 'survival')) unlock('survive60');
      if (G.mode === 'survival' && G.elapsed >= 120) unlock('survival120');
      if (G.mode === 'rush') {
        G.timeLeft -= dt;
        const s = Math.ceil(G.timeLeft);
        if (s <= 10 && s < G.lastTick && s > 0) { G.lastTick = s; Sfx.tick(s <= 3); bump(el.s[1].value); }
        if (G.timeLeft <= 0) { G.timeLeft = 0; endRun('time', W / 2, H / 2); }
      }
      for (const k of TIMED) G.fx[k] = Math.max(0, G.fx[k] - (k === 'slow' ? dt : sdt));
      if (has.orbs()) {
        G.spawnT -= sdt;
        if (G.spawnT <= 0) {
          const cap = G.mode === 'rush' || G.level >= 4 ? 3 : 2;
          if (targets.length < cap) spawnTarget();
          G.spawnT = G.mode === 'rush' ? rand(2, 3.5) : rand(3.2, 6);
        }
      }
      if (G.rageT > 0) { G.rageT -= dt; if (G.rageT <= 0) endRage(); }
      if (G.state === 'playing') updateHud();
    }

    updateEvent(dt, sdt);
    updateBoss(dt, sdt);

    // Background tint: per level, red in rage, cool in duel.
    let tint = levelTint(0);
    if (G.state !== 'menu') {
      if (leveled()) tint = levelTint(G.level - 1);
      if (G.mode === 'survival') tint = levelTint(Math.floor(G.elapsed / 30));
      if (G.mode === 'bossrush') tint = levelTint(G.run.bosses);
      if (G.mode === 'duel') tint = duelTint();
    }
    if (G.rageT > 0) tint = rageTint();
    G.bg = mixRgb(G.bg, tint, damp(G.rageT > 0 ? 6 : 2, dt));

    if (G.state !== 'paused') updatePads(dt);

    // Bumpers drift side to side (they step aside during a boss fight).
    if (!G.boss) {
      for (const u of bumpers) {
        u.age += sdt;
        u.hit = Math.max(0, u.hit - sdt * 4);
        u.x += u.vx * sdt;
        if (u.x < u.r + 10) { u.x = u.r + 10; u.vx = Math.abs(u.vx); }
        if (u.x > W - u.r - 10) { u.x = W - u.r - 10; u.vx = -Math.abs(u.vx); }
      }
    }

    // Boss projectiles and blocks
    for (const pr of G.projectiles) {
      pr.x += pr.vx * sdt; pr.y += pr.vy * sdt;
      for (const which of ['top', 'bot']) {
        const p = pads[which];
        const crossing = which === 'bot'
          ? pr.vy > 0 && pr.y + pr.r >= M.botY && pr.y - pr.r <= M.botY + M.padH
          : pr.vy < 0 && pr.y - pr.r <= M.topY + M.padH && pr.y + pr.r >= M.topY;
        if (!pr.dead && crossing && Math.abs(pr.x - p.x) <= p.w / 2 + pr.r) { pr.dead = true; if (G.state === 'playing') stunPad(which); }
      }
      if (pr.y < -30 || pr.y > H + 30) pr.dead = true;
    }
    G.projectiles = G.projectiles.filter((p) => !p.dead);
    for (const k of G.blocks) { k.age += sdt; if (k.age > k.life) k.dead = true; }
    G.blocks = G.blocks.filter((k) => !k.dead);

    // Balls
    const targetSpeed = curSpeed();
    for (let i = balls.length - 1; i >= 0; i--) {
      const b = balls[i];
      if (!b || b.dead) continue;
      b.grow = Math.max(0, b.grow - dt * 3);
      b.sqv += (-520 * b.sq - 16 * b.sqv) * sdt;   // squash spring
      b.sq += b.sqv * sdt;
      if (b.serve > 0) { b.serve -= sdt; b.trail.length = 0; continue; }
      // ease the ball's speed toward the current target (levels, survival ramp, rage, chaos)
      const s = Math.hypot(b.vx, b.vy);
      if (s > 0 && sdt > 0) { const k = lerp(s, targetSpeed, damp(3, sdt)) / s; b.vx *= k; b.vy *= k; }
      if (G.fx.magnet > 0 && G.state === 'playing') applyMagnet(b, sdt);
      stepBall(b, sdt);
      if (sdt > 0) {
        b.rot = (b.rot || 0) + (Math.hypot(b.vx, b.vy) * sdt) / (b.r * 2.5); // spin for patterned balls
        b.trail.unshift(b.x, b.y);
        const maxLen = (reduced ? 8 : 16 + tierIdx(G.streak) * 5 + (G.rageT > 0 ? 8 : 0)) * 2;
        if (b.trail.length > maxLen) b.trail.length = maxLen;
        const fiery = G.fx.double > 0 || G.rageT > 0;
        if (fiery && Math.random() < (G.rageT > 0 ? 1 : 0.7) && ballVisible()) {
          emit(b.x, b.y, G.rageT > 0 ? 2 : 1, { speed: [10, 70], gravity: -160, life: [0.25, 0.6], colors: [C.rust, C.ember, C.gold], spark: 0, size: [2, 5] });
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
    for (const k of G.nearMarks) k.t += dt;
    G.nearMarks = G.nearMarks.filter((k) => k.t < 1.2);

    for (const p of padList()) {
      p.flash = Math.max(0, p.flash - dt * 4);
      p.bump = lerp(p.bump, 0, damp(14, dt));
    }

    G.trauma = Math.max(0, G.trauma - dt * 1.5);
    G.flash = Math.max(0, G.flash - dt * 2.2);
    G.scorePop = Math.max(0, G.scorePop - dt * 4);
    G.bannerT = Math.max(0, G.bannerT - dt);
    G.shownScore = lerp(G.shownScore, G.score, damp(12, dt));

    updateChips();
    Music.set(G.state === 'playing' ? (G.rageT > 0 ? 3 : G.boss ? 2 : 1) : 0);
  }

  function updateChips() {
    const live = G.state === 'playing' || G.state === 'paused';
    const setChip = (name, p, label) => {
      const chip = el.chips[name];
      const show = live && p > 0;
      if (chip.hidden === show) chip.hidden = !show;
      if (show) { chip.style.setProperty('--p', Math.min(1, p).toFixed(3)); if (label) setText(chip.firstElementChild, label); }
    };
    for (const k of TIMED) setChip(k, G.fx[k] / ORBS[k].dur);
    setChip('rage', G.rageT / RAGE_TIME, 'Rage ' + Math.ceil(G.rageT) + 's');
    setChip('shield', G.shield > 0 ? 1 : 0, G.shield > 1 ? 'Shield ×2' : 'Shield');
  }

  // Magnet: steer the ball toward the centre of the paddle it is heading for, keeping its speed.
  function applyMagnet(b, sdt) {
    const toBot = b.vy > 0;
    const p = toBot ? pads.bot : pads.top;
    const d = toBot ? M.botY - b.y : b.y - (M.topY + M.padH);
    if (d <= 0 || d > H * 0.5) return;
    const s = Math.hypot(b.vx, b.vy);
    const tHit = d / Math.abs(b.vy);
    const want = clamp((p.x - b.x) / tHit, -s * 0.85, s * 0.85);
    b.vx = lerp(b.vx, want, damp(2.4, sdt));
    b.vy = Math.sign(b.vy) * Math.sqrt(Math.max(s * s - b.vx * b.vx, (s * 0.4) ** 2));
  }

  const reversed = () => evOn('reverse');
  function updatePads(dt) {
    const keySpeed = Math.max(700, W * 1.3);
    if (G.state === 'menu') {
      // Attract mode: an imperfect autopilot chases the ball.
      const b = balls[0];
      if (b) for (const p of padList()) p.targetX = b.x + Math.sin(G.time * 1.3) * p.w * 0.32;
    } else if (G.mode === 'duel') {
      const botDir = (keys.d ? 1 : 0) - (keys.a ? 1 : 0);
      const topDir = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
      if (botDir) pads.bot.targetX = clamp((pads.bot.targetX ?? pads.bot.x) + botDir * keySpeed * dt, 0, W);
      if (topDir) pads.top.targetX = clamp((pads.top.targetX ?? pads.top.x) + topDir * keySpeed * dt, 0, W);
    } else {
      let dir = (keys.right || keys.d ? 1 : 0) - (keys.left || keys.a ? 1 : 0);
      if (reversed()) dir = -dir;
      if (dir) for (const p of padList()) p.targetX = clamp((p.targetX ?? p.x) + dir * keySpeed * dt, 0, W);
    }
    const base = M.basePadW;
    for (const p of padList()) {
      p.stun = Math.max(0, p.stun - dt);
      let k = 1;
      if (G.fx.wide > 0) k *= 1.6;
      if (G.fx.shrink > 0) k *= 0.55;
      if (p.stun > 0) k *= 0.6;
      p.tw = base * k;
      const prevX = p.x;
      p.w = lerp(p.w, p.tw, damp(10, dt));
      if (p.targetX !== null) p.x = lerp(p.x, p.targetX, damp(G.state === 'menu' ? 8 : p.stun > 0 ? 7 : 30, dt));
      p.x = clamp(p.x, p.w / 2, W - p.w / 2);
      p.vx = dt > 0 ? (p.x - prevX) / dt : 0;
      p.tilt = lerp(p.tilt, clamp(p.vx / 4000, -0.09, 0.09), damp(12, dt));
    }
  }

  // Sub-stepped so a fast ball can never tunnel through a paddle, bumper or boss.
  function stepBall(b, sdt) {
    const sp = Math.hypot(b.vx, b.vy);
    const steps = Math.max(1, Math.ceil((sp * sdt) / (b.r * 0.7)));
    const h = sdt / steps;
    const playing = G.state === 'playing';
    const bot = pads.bot, top = pads.top;
    const gravity = evOn('gravity') ? G.event.ax : 0;
    const bounceOff = (cx, cy, R, onHit) => {
      const dx = b.x - cx, dy = b.y - cy;
      const dist = Math.hypot(dx, dy);
      if (dist < R && dist > 0) {
        const nx = dx / dist, ny = dy / dist;
        const dot = b.vx * nx + b.vy * ny;
        if (dot < 0) { b.vx -= 2 * dot * nx; b.vy -= 2 * dot * ny; fixAngle(b); onHit(nx, ny); }
        b.x = cx + nx * R; b.y = cy + ny * R;
      }
    };
    for (let s = 0; s < steps; s++) {
      const py = b.y;
      if (gravity) b.vx += gravity * h;
      b.x += b.vx * h;
      b.y += b.vy * h;

      if (b.x - b.r < 0) { b.x = b.r; b.vx = Math.abs(b.vx); hitWall(b, -1); }
      else if (b.x + b.r > W) { b.x = W - b.r; b.vx = -Math.abs(b.vx); hitWall(b, 1); }

      if (G.boss) {
        const B = G.boss;
        if (B.age > 0.8) bounceOff(B.x, B.y, B.r + b.r, (nx, ny) => { if (playing) hitBoss(b, nx, ny); });
      } else {
        for (const u of bumpers) if (u.age >= 0.4) bounceOff(u.x, u.y, u.r + b.r, (nx, ny) => hitBumper(u, b, nx, ny));
      }
      for (const k of G.blocks) {
        if (k.dead || k.age < 0.3) continue;
        const cx = clamp(b.x, k.x - k.w / 2, k.x + k.w / 2), cy = clamp(b.y, k.y - k.h / 2, k.y + k.h / 2);
        const dx = b.x - cx, dy = b.y - cy;
        if (dx * dx + dy * dy < b.r * b.r) {
          if (Math.abs(dx) > Math.abs(dy)) b.vx = (Math.sign(dx) || 1) * Math.abs(b.vx);
          else b.vy = (Math.sign(dy) || 1) * Math.abs(b.vy);
          k.dead = true;
          emit(k.x, k.y, 24, { colors: [C.ink, C.rust, C.sand], speed: [80, 320] });
          if (playing) { const pts = addScore(2); popup(k.x, k.y - 20, '+' + pts, { size: 22, color: C.ink }); Sfx.bumper(); shake(0.15); }
        }
      }

      const inBot = b.x >= bot.x - bot.w / 2 - b.r * 0.8 && b.x <= bot.x + bot.w / 2 + b.r * 0.8;
      const inTop = b.x >= top.x - top.w / 2 - b.r * 0.8 && b.x <= top.x + top.w / 2 + b.r * 0.8;
      if (b.vy > 0 && inBot && b.y + b.r >= M.botY && py + b.r <= M.botY + M.padH * 0.6) { hitPaddle(b, 'bot'); continue; }
      if (b.vy < 0 && inTop && b.y - b.r <= M.topY + M.padH && py - b.r >= M.topY + M.padH * 0.4) { hitPaddle(b, 'top'); continue; }

      // Passed a paddle line without a hit: check for a near miss once.
      if (!b.passed && ((b.vy > 0 && b.y - b.r > M.botY + M.padH) || (b.vy < 0 && b.y + b.r < M.topY))) {
        b.passed = true;
        nearMiss(b, b.vy > 0 ? 1 : -1);
      }

      if (playing && G.shield > 0 && single()) {
        if (b.vy > 0 && b.y + b.r >= H - 3) { useShield(b, 1); continue; }
        if (b.vy < 0 && b.y - b.r <= 3) { useShield(b, -1); continue; }
      }
      if (b.y - b.r > H + 4 || b.y + b.r < -4) { loseBall(b); return; }
    }
  }

  // ================================================================ render
  function render() {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.fillStyle = `rgb(${G.bg.map((v) => Math.round(v)).join(',')})`;
    ctx.fillRect(0, 0, W, H);

    // camera: shake + death zoom
    const mag = reduced ? 0 : G.trauma * G.trauma * 22;
    const ox = (Math.random() * 2 - 1) * mag;
    const oy = (Math.random() * 2 - 1) * mag;
    const focus = G.state === 'dying' || G.state === 'over';
    const fx = focus ? G.focusX : W / 2;
    const fy = focus ? G.focusY : H / 2;
    ctx.save();
    ctx.translate(fx + ox, fy + oy);
    ctx.scale(G.zoom, G.zoom);
    ctx.rotate(reduced ? 0 : (Math.random() * 2 - 1) * G.trauma * G.trauma * 0.012);
    ctx.translate(-fx, -fy);

    drawBackground();
    drawGravity();
    drawDanger();
    drawShield();
    for (const r of rings) drawRing(r);
    if (!G.boss) for (const u of bumpers) drawBumper(u);
    for (const k of G.blocks) drawBlock(k);
    if (G.boss) drawBoss(G.boss);
    for (const t of targets) drawTarget(t);
    const visible = ballVisible();
    if (visible) for (const b of balls) drawTrail(b);
    drawParticles();
    for (const pr of G.projectiles) drawProjectile(pr);
    if (visible) for (const b of balls) drawBall(b);
    else for (const b of balls) drawGhostHint(b);
    drawMagnet();
    drawPaddle(M.topY, pads.top, -1);
    drawPaddle(M.botY, pads.bot, 1);
    for (const k of G.nearMarks) drawNearMark(k);
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
    if (G.rageT > 0) drawVignette(0.3 + Math.sin(G.time * 10) * (reduced ? 0 : 0.1), C.rust);
    if (G.dangerSlow) drawVignette(0.3, C.ink);
    if (G.state === 'dying' && G.ending === 'miss') drawVignette(Math.min(1, G.deathT * 2) * 0.35, C.rust);
  }

  function drawBackground() {
    const T = theme();
    const gap = W < 500 ? 24 : 32;
    const drift = (G.time * (6 + G.level * 2 + (G.rageT > 0 ? 40 : 0))) % gap;   // the grid drifts faster as levels climb
    if (T.bg2) {
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, T.bg2);
      ctx.globalAlpha = 0.75; ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1;
    }
    if (T.grid) {
      ctx.strokeStyle = T.dot; ctx.lineWidth = 1;
      ctx.beginPath();
      for (let y = -gap + drift; y < H + gap; y += gap) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
      for (let x = gap / 2; x < W; x += gap) { ctx.moveTo(x, 0); ctx.lineTo(x, H); }
      ctx.stroke();
    } else {
      ctx.fillStyle = T.dot;
      let i = 0;
      for (let y = -gap + drift; y < H + gap; y += gap) {
        for (let x = gap / 2; x < W; x += gap) {
          if (T.stars) ctx.globalAlpha = reduced ? 0.5 : 0.15 + 0.6 * Math.abs(Math.sin(G.time * 0.9 + i * 12.9898));
          i++;
          ctx.fillRect(x - 1, y - 1, 2, 2);
        }
      }
      ctx.globalAlpha = 1;
    }
    ctx.strokeStyle = T.line;
    ctx.lineWidth = 1;
    ctx.setLineDash([6, 10]);
    ctx.beginPath(); ctx.moveTo(0, H / 2); ctx.lineTo(W, H / 2); ctx.stroke();
    ctx.setLineDash([]);

    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (G.state === 'menu') {
      ctx.font = `italic ${Math.min(W * 0.3, 260)}px ${FONT_SERIF}`;
      ctx.globalAlpha = 0.06;
      ctx.fillStyle = C.rust;
      ctx.fillText('bounce', W / 2 + Math.sin(G.time * 0.4) * 30, H / 2);
    } else if (G.mode === 'duel') {
      // each player's score in their own half
      const size = Math.min(W * 0.4, H * 0.28);
      ctx.font = `800 ${size}px ${FONT_SANS}`;
      ctx.globalAlpha = 0.08 + G.scorePop * 0.1;
      ctx.fillStyle = fg();
      ctx.fillText(String(G.p2), W / 2, H * 0.27);
      ctx.fillText(String(G.p1), W / 2, H * 0.73);
      ctx.font = `14px ${FONT_MONO}`;
      ctx.globalAlpha = 0.45;
      ctx.fillText(`TOP ↑ · first to ${DUEL_TARGET} · ↓ BOTTOM`, W / 2, H / 2 - 14);
    } else if (G.mode === 'rush' && G.timeLeft <= 10 && G.state === 'playing') {
      const size = Math.min(W * 0.6, H * 0.5);
      const frac = G.timeLeft - Math.floor(G.timeLeft);
      ctx.font = `800 ${size}px ${FONT_SANS}`;
      ctx.globalAlpha = 0.12 + (reduced ? 0 : frac * 0.12);
      ctx.fillStyle = C.rust;
      ctx.translate(W / 2, H / 2);
      const s = reduced ? 1 : 1 + frac * 0.15;
      ctx.scale(s, s);
      ctx.fillText(String(Math.ceil(G.timeLeft)), 0, size * 0.04);
    } else {
      // giant score (or survival seconds) behind the play
      const size = Math.min(W * 0.55, H * 0.42);
      const s = 1 + G.scorePop * 0.12;
      ctx.translate(W / 2, H / 2);
      ctx.scale(s, s);
      const txt = G.mode === 'survival' ? String(Math.floor(G.elapsed)) : String(Math.round(G.shownScore));
      ctx.font = `800 ${size * (txt.length > 3 ? 0.75 : 1)}px ${FONT_SANS}`;
      ctx.globalAlpha = (0.07 + G.scorePop * 0.12) * (G.bannerT > 0 || G.boss ? 0.25 : 1);
      ctx.fillStyle = G.scorePop > 0.05 || G.rageT > 0 ? C.rust : fg();
      ctx.fillText(txt, 0, size * 0.04);
    }
    ctx.restore();
  }

  function drawGravity() {
    if (!evOn('gravity')) return;
    const dir = Math.sign(G.event.ax);
    ctx.save();
    ctx.strokeStyle = C.slate;
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.18;
    const gap = 90;
    const off = (((G.time * 160 * dir) % gap) + gap) % gap;
    for (let y = H * 0.2; y < H * 0.85; y += 70) {
      for (let x = -gap + off; x < W + gap; x += gap) {
        ctx.beginPath();
        ctx.moveTo(x - 8 * dir, y - 8); ctx.lineTo(x, y); ctx.lineTo(x - 8 * dir, y + 8);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  // Warm glow on the edge a ball is heading towards, stronger as it gets close.
  function drawDanger() {
    if (G.state !== 'playing' || G.mode === 'duel') return;
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
    ctx.strokeStyle = theme().dark ? C.mist : C.slate;
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
      ctx.globalAlpha = (1 - k) * 0.6 * Math.min(1, G.fx.magnet);
      const rb = pads.bot.w * (0.25 + k * 0.5), rt = pads.top.w * (0.25 + k * 0.5);
      ctx.beginPath(); ctx.ellipse(pads.bot.x, M.botY, rb, rb * 0.55, 0, Math.PI, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(pads.top.x, M.topY + M.padH, rt, rt * 0.55, 0, 0, Math.PI); ctx.stroke();
    }
    ctx.restore();
  }

  function drawVignette(alpha, color) {
    const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.75);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, color);
    ctx.globalAlpha = Math.max(0, alpha);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 1;
  }

  function drawPaddle(y, p, dir) {
    const w = p.w * (1 + p.bump * 0.08);
    const h = M.padH * (1 - p.bump * 0.25);
    const by = y + dir * p.bump * 7 + (M.padH - h) / 2;
    ctx.save();
    ctx.translate(p.x, by + h / 2);
    ctx.rotate(p.tilt * dir * -1);
    ctx.fillStyle = 'rgba(28,27,29,0.18)';
    roundRect(-w / 2 + 3, -h / 2 + 3, w, h, h / 2);
    ctx.fill();
    paintPaddleSkin(ctx, -w / 2, -h / 2, w, h, equip.paddle, G.time, fg());
    // state overlays on top of the skin: two-player top side, reversed controls, stun, hit flash
    const overlay = (color, a) => { ctx.globalAlpha = a; ctx.fillStyle = color; roundRect(-w / 2, -h / 2, w, h, h / 2); ctx.fill(); ctx.globalAlpha = 1; };
    if (G.mode === 'duel' && G.state !== 'menu' && dir < 0) overlay(C.slate, 0.55);
    else if (reversed()) overlay(C.slate, 0.6);
    if (p.stun > 0 && Math.floor(G.time * 12) % 2) overlay('#77737a', 0.85);
    if (p.flash > 0) overlay(C.rust, p.flash * 0.85);
    // sweet-spot marker (its colour follows your combo tier)
    ctx.fillStyle = p.flash > 0.3 ? C.paper : TIER_COLORS[G.rageT > 0 ? 3 : tierIdx(G.streak)];
    ctx.globalAlpha = 0.9;
    roundRect(-w * 0.11, -h * 0.18, w * 0.22, h * 0.36, h * 0.18);
    ctx.fill();
    ctx.globalAlpha = 1;
    if (reversed()) {
      ctx.strokeStyle = C.paper; ctx.lineWidth = 1.5;
      for (const sx of [-1, 1]) {
        const x0 = sx * w * 0.32;
        ctx.beginPath(); ctx.moveTo(x0 + sx * 4, -3); ctx.lineTo(x0 - sx * 2, 0); ctx.lineTo(x0 + sx * 4, 3); ctx.stroke();
      }
    }
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
    const tier = G.rageT > 0 ? 3 : tierIdx(G.streak);
    const color = G.rageT > 0 ? C.rust : G.fx.double > 0 ? C.ember : TIER_COLORS[tier];
    paintTrail(ctx, b.trail, b.r, equip.trail, color, tier, G.time);
  }

  function drawBall(b) {
    if (b.dead) return;
    const sp = Math.hypot(b.vx, b.vy);
    const stretch = 1 + clamp(sp / M.baseSpeed - 1, 0, 1.2) * 0.12;
    let grow = 1;
    if (b.serve > 0) grow = easeOutBack(clamp(1 - b.serve / (b.serveMax || 0.65), 0, 1));
    else if (b.grow > 0) grow = 1 + b.grow * 0.6;
    const r = b.r * Math.max(0.01, grow);
    const fire = G.fx.double > 0 || G.rageT > 0;
    const tier = tierIdx(G.streak);
    const skin = fire && equip.ball === 'classic' ? 'glow' : equip.ball;
    const angle = sp > 0 ? Math.atan2(b.vy, b.vx) : 0;

    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.scale(1 + b.sq * 0.5, 1 - b.sq * 0.42);
    ctx.rotate(angle);
    ctx.scale(stretch, 1 / stretch);
    ctx.fillStyle = fire ? 'rgba(224,137,47,0.3)' : `rgba(196,80,42,${0.18 + tier * 0.06})`;
    ctx.beginPath(); ctx.arc(0, 0, r * (fire ? 2.6 + Math.sin(G.time * 30) * 0.3 : 2.1 + tier * 0.3), 0, Math.PI * 2); ctx.fill();
    paintBallSkin(ctx, skin, r, (b.rot || 0) - angle);
    ctx.restore();
    if (skin === 'classic' || skin === 'glow' || skin === 'ring') {
      ctx.fillStyle = 'rgba(242,238,232,0.75)';
      ctx.beginPath(); ctx.arc(b.x - r * 0.35, b.y - r * 0.35, r * 0.28, 0, Math.PI * 2); ctx.fill();
    }

    if (b.serve > 0) {
      ctx.strokeStyle = fg();
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r * 3, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (b.serve / (b.serveMax || 0.65)));
      ctx.stroke();
    }
  }

  // ---------------------------------------------------------------- skin painters (shared by the game and the Locker previews)
  function rr(c, x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }
  function starPath(c, x, y, r, rot, points = 5, inner = 0.45) {
    c.beginPath();
    for (let i = 0; i < points * 2; i++) {
      const a = rot - Math.PI / 2 + (i * Math.PI) / points;
      const rr2 = i % 2 ? r * inner : r;
      c.lineTo(x + Math.cos(a) * rr2, y + Math.sin(a) * rr2);
    }
    c.closePath();
  }
  function heartPath(c, x, y, s) {
    c.beginPath();
    c.moveTo(x, y + s * 0.35);
    c.bezierCurveTo(x - s, y - s * 0.3, x - s * 0.45, y - s * 0.95, x, y - s * 0.4);
    c.bezierCurveTo(x + s * 0.45, y - s * 0.95, x + s, y - s * 0.3, x, y + s * 0.35);
    c.closePath();
  }
  function paintPaddleSkin(c, x, y, w, h, skin, time, base) {
    const r = h / 2;
    switch (skin) {
      case 'candy':
        rr(c, x, y, w, h, r); c.fillStyle = C.paper; c.fill();
        c.save(); rr(c, x, y, w, h, r); c.clip();
        c.fillStyle = C.rust;
        for (let sx = x - h; sx < x + w + h; sx += 10) { c.beginPath(); c.moveTo(sx, y + h); c.lineTo(sx + 5, y + h); c.lineTo(sx + 5 + h, y); c.lineTo(sx + h, y); c.fill(); }
        c.restore();
        rr(c, x, y, w, h, r); c.strokeStyle = C.ink; c.lineWidth = 1.5; c.stroke();
        break;
      case 'neon': {
        const col = reduced ? '#ff3ea5' : `hsl(${(time * 50) % 360}, 100%, 62%)`;
        c.save();
        c.shadowColor = col; c.shadowBlur = 14;
        rr(c, x, y, w, h, r); c.fillStyle = '#15161d'; c.fill();
        c.lineWidth = 2.5; c.strokeStyle = col; c.stroke();
        c.restore();
        break;
      }
      case 'wood':
        rr(c, x, y, w, h, r); c.fillStyle = '#b07a4a'; c.fill();
        c.save(); rr(c, x, y, w, h, r); c.clip();
        c.strokeStyle = '#8a5a33'; c.lineWidth = 1;
        for (let k = 0; k < 3; k++) {
          c.beginPath();
          for (let px = x; px <= x + w; px += 6) { const py = y + h * (0.25 + k * 0.25) + Math.sin(px * 0.08 + k * 2) * 1.2; if (px === x) c.moveTo(px, py); else c.lineTo(px, py); }
          c.stroke();
        }
        c.restore();
        rr(c, x, y, w, h, r); c.strokeStyle = C.ink; c.lineWidth = 1; c.stroke();
        break;
      case 'sunset': {
        const g = c.createLinearGradient(x, 0, x + w, 0);
        g.addColorStop(0, C.rust); g.addColorStop(0.5, C.gold); g.addColorStop(1, C.rose);
        rr(c, x, y, w, h, r); c.fillStyle = g; c.fill();
        break;
      }
      case 'gold': {
        const g = c.createLinearGradient(0, y, 0, y + h);
        g.addColorStop(0, '#f5d77a'); g.addColorStop(0.5, C.gold); g.addColorStop(1, '#a8781f');
        rr(c, x, y, w, h, r); c.fillStyle = g; c.fill();
        c.save(); rr(c, x, y, w, h, r); c.clip();
        c.fillStyle = 'rgba(255,255,255,0.55)';
        c.fillRect(x + ((time * 90) % (w + 60)) - 30, y, 8, h);
        c.restore();
        break;
      }
      default:
        rr(c, x, y, w, h, r); c.fillStyle = base; c.fill();
    }
  }
  function paintBallSkin(c, skin, r, rot) {
    c.lineWidth = 1.6;
    c.strokeStyle = C.ink;
    const circle = (fill) => { c.beginPath(); c.arc(0, 0, r, 0, Math.PI * 2); c.fillStyle = fill; c.fill(); };
    switch (skin) {
      case 'ring':
        circle(C.paper); c.stroke();
        c.strokeStyle = C.rust; c.lineWidth = r * 0.32;
        c.beginPath(); c.arc(0, 0, r * 0.55, 0, Math.PI * 2); c.stroke();
        break;
      case 'beach': {
        const cols = [C.rust, C.paper, C.sage, C.paper, C.gold, C.paper];
        for (let i = 0; i < 6; i++) {
          c.beginPath(); c.moveTo(0, 0); c.arc(0, 0, r, rot + (i * Math.PI) / 3, rot + ((i + 1) * Math.PI) / 3); c.closePath();
          c.fillStyle = cols[i]; c.fill();
        }
        c.fillStyle = C.paper; c.beginPath(); c.arc(0, 0, r * 0.22, 0, Math.PI * 2); c.fill();
        c.beginPath(); c.arc(0, 0, r, 0, Math.PI * 2); c.stroke();
        break;
      }
      case 'glow':
        c.save(); c.shadowColor = C.ember; c.shadowBlur = r * 1.8;
        circle(C.ember);
        c.restore();
        c.strokeStyle = C.rust; c.beginPath(); c.arc(0, 0, r, 0, Math.PI * 2); c.stroke();
        break;
      case 'pixel': {
        const n = 5, s = (r * 2) / n;
        for (let gx = 0; gx < n; gx++) {
          for (let gy = 0; gy < n; gy++) {
            const cx = -r + s * (gx + 0.5), cy = -r + s * (gy + 0.5);
            if (cx * cx + cy * cy > r * r * 1.08) continue;
            c.fillStyle = gx === 1 && gy === 1 ? C.paper : (gx + gy) % 3 === 0 ? '#a8401f' : C.rust;
            c.fillRect(-r + gx * s, -r + gy * s, s + 0.4, s + 0.4);
          }
        }
        break;
      }
      case 'star':
        starPath(c, 0, 0, r * 1.3, rot, 5, 0.5);
        c.fillStyle = C.gold; c.fill(); c.stroke();
        break;
      case 'eye':
        circle(C.paper); c.stroke();
        c.fillStyle = C.slate; c.beginPath(); c.arc(r * 0.32, 0, r * 0.46, 0, Math.PI * 2); c.fill();
        c.fillStyle = C.ink; c.beginPath(); c.arc(r * 0.4, 0, r * 0.22, 0, Math.PI * 2); c.fill();
        c.fillStyle = C.paper; c.beginPath(); c.arc(r * 0.3, -r * 0.13, r * 0.09, 0, Math.PI * 2); c.fill();
        break;
      default:
        circle(C.rust); c.stroke();
    }
  }
  function paintTrail(c, t, r, style, color, tier, time) {
    const n = t.length / 2;
    if (n < 2) return;
    if (tier >= 1) { // the glowing halo grows with the combo
      c.fillStyle = color;
      for (let i = 1; i < n; i++) {
        const k = 1 - i / n;
        c.globalAlpha = k * 0.12 * tier;
        c.beginPath(); c.arc(t[i * 2], t[i * 2 + 1], r * (1.2 + tier * 0.5) * k + 1, 0, Math.PI * 2); c.fill();
      }
    }
    if (style === 'ribbon') {
      c.strokeStyle = color; c.lineCap = 'round'; c.lineJoin = 'round';
      for (let i = 1; i < n; i++) {
        const k = 1 - i / n;
        c.globalAlpha = k * 0.55;
        c.lineWidth = r * 1.7 * k + 0.5;
        c.beginPath(); c.moveTo(t[i * 2 - 2], t[i * 2 - 1]); c.lineTo(t[i * 2], t[i * 2 + 1]); c.stroke();
      }
    } else {
      for (let i = 1; i < n; i++) {
        const k = 1 - i / n;
        const x = t[i * 2], y = t[i * 2 + 1];
        if (style === 'sparkle') {
          if (i % 2) continue;
          c.globalAlpha = k;
          c.fillStyle = i % 4 ? C.gold : color;
          starPath(c, x, y, r * (0.5 + 0.8 * k) * (0.75 + 0.25 * Math.sin(time * 20 + i)), time * 2 + i, 4, 0.3);
          c.fill();
        } else if (style === 'smoke') {
          c.globalAlpha = k * 0.16;
          c.fillStyle = '#8a8590';
          c.beginPath(); c.arc(x, y, r * (0.7 + (1 - k) * 1.8), 0, Math.PI * 2); c.fill();
        } else if (style === 'hearts') {
          if (i % 2) continue;
          c.globalAlpha = k * 0.85;
          c.fillStyle = i % 4 ? C.rose : C.rust;
          heartPath(c, x, y, r * 1.1 * k + 2);
          c.fill();
        } else {
          c.globalAlpha = k * 0.38;
          c.fillStyle = color;
          c.beginPath(); c.arc(x, y, r * (0.25 + 0.75 * k), 0, Math.PI * 2); c.fill();
        }
      }
    }
    c.globalAlpha = 1;
  }

  // While the ball is invisible, a faint shimmer now and then keeps it fair.
  function drawGhostHint(b) {
    if (Math.floor(G.time * 6) % 5) return;
    ctx.strokeStyle = 'rgba(28,27,29,0.18)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(b.x, b.y, b.r * 1.6, 0, Math.PI * 2); ctx.stroke();
  }

  function drawBumper(u) {
    const s = easeOutBack(clamp(u.age / 0.5, 0, 1));
    const r = u.r * s * (1 + u.hit * 0.18);
    if (r <= 0) return;
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

  function drawBlock(k) {
    const a = easeOutBack(clamp(k.age / 0.3, 0, 1));
    const left = k.life - k.age;
    if (a <= 0 || (left < 1.2 && Math.floor(left * 8) % 2 === 0)) return;
    ctx.save();
    ctx.translate(k.x, k.y);
    ctx.scale(a, a);
    ctx.fillStyle = 'rgba(28,27,29,0.15)';
    roundRect(-k.w / 2 + 3, -k.h / 2 + 4, k.w, k.h, 4); ctx.fill();
    ctx.fillStyle = C.ink;
    roundRect(-k.w / 2, -k.h / 2, k.w, k.h, 4); ctx.fill();
    ctx.strokeStyle = C.rust; ctx.lineWidth = 2;
    for (let x = -k.w / 2 + 8; x < k.w / 2 - 6; x += 12) { ctx.beginPath(); ctx.moveTo(x, k.h / 2 - 2); ctx.lineTo(x + 6, -k.h / 2 + 2); ctx.stroke(); }
    ctx.restore();
  }

  function drawBoss(B) {
    const appear = easeOutBack(clamp(B.age / 0.8, 0, 1));
    const wob = reduced ? 0 : Math.sin(B.t * 6) * 0.04;
    const r = B.r * appear * (1 + B.hurt * 0.12);
    if (r <= 0) return;
    ctx.save();
    ctx.translate(B.x, B.y);
    ctx.scale(1 + wob, 1 - wob);
    ctx.fillStyle = 'rgba(28,27,29,0.18)';
    ctx.beginPath(); ctx.arc(5, 7, r, 0, Math.PI * 2); ctx.fill();
    const body = B.mini ? C.slate : C.ink;
    ctx.fillStyle = B.hurt > 0 ? mix(body, C.rust, B.hurt) : body;
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
    if (!B.mini && B.tier >= 2) { // a crown for the tougher ones
      ctx.fillStyle = C.gold; ctx.strokeStyle = C.ink; ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-r * 0.45, -r * 0.82); ctx.lineTo(-r * 0.45, -r * 1.2); ctx.lineTo(-r * 0.22, -r * 1.0); ctx.lineTo(0, -r * 1.3);
      ctx.lineTo(r * 0.22, -r * 1.0); ctx.lineTo(r * 0.45, -r * 1.2); ctx.lineTo(r * 0.45, -r * 0.82); ctx.closePath();
      ctx.fill(); ctx.stroke();
    }
    ctx.strokeStyle = C.rust; ctx.lineWidth = 3;
    ctx.setLineDash([6, 6]); ctx.lineDashOffset = -B.t * 30;
    ctx.beginPath(); ctx.arc(0, 0, r + 8, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
    // eyes follow the ball
    const b = balls[0];
    const look = b ? Math.atan2(b.y - B.y, b.x - B.x) : Math.PI / 2;
    for (const sx of [-1, 1]) {
      const ex = sx * r * 0.36, ey = -r * 0.16;
      ctx.fillStyle = C.paper;
      ctx.beginPath(); ctx.arc(ex, ey, r * 0.22, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = C.ink;
      ctx.beginPath(); ctx.arc(ex + Math.cos(look) * r * 0.08, ey + Math.sin(look) * r * 0.08, r * 0.1, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = C.paper; ctx.lineWidth = 3; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(ex - sx * r * 0.22, ey - r * 0.36); ctx.lineTo(ex + sx * r * 0.18, ey - r * 0.24); ctx.stroke();
    }
    // mouth opens when attacking
    const mo = 0.08 + B.mouth * 0.22;
    ctx.fillStyle = C.rust;
    ctx.beginPath(); ctx.ellipse(0, r * 0.38, r * 0.34, r * mo, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = C.paper;
    for (const tx of [-0.18, 0, 0.18]) {
      ctx.beginPath();
      ctx.moveTo(r * (tx - 0.06), r * (0.38 - mo)); ctx.lineTo(r * (tx + 0.06), r * (0.38 - mo)); ctx.lineTo(r * tx, r * (0.38 - mo + 0.1));
      ctx.fill();
    }
    ctx.restore();
  }

  function drawProjectile(pr) {
    ctx.fillStyle = C.rust;
    for (let i = 3; i >= 0; i--) {
      ctx.globalAlpha = i ? 0.25 / i : 1;
      ctx.beginPath(); ctx.arc(pr.x - pr.vx * 0.02 * i, pr.y - pr.vy * 0.02 * i, pr.r * (1 - i * 0.15), 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.strokeStyle = C.ink; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(pr.x, pr.y, pr.r, 0, Math.PI * 2); ctx.stroke();
  }

  function drawNearMark(k) {
    ctx.save();
    ctx.globalAlpha = 1 - k.t / 1.2;
    ctx.strokeStyle = C.rust;
    ctx.lineWidth = 2;
    const x1 = Math.min(k.x1, k.x2), x2 = Math.max(k.x1, k.x2);
    ctx.beginPath();
    ctx.moveTo(x1, k.y - 8); ctx.lineTo(x1, k.y + 8);
    ctx.moveTo(x2, k.y - 8); ctx.lineTo(x2, k.y + 8);
    ctx.moveTo(x1, k.y); ctx.lineTo(x2, k.y);
    ctx.stroke();
    ctx.restore();
  }

  function drawTarget(t) {
    const appear = easeOutBack(clamp(t.age / 0.45, 0, 1));
    const remaining = t.life - t.age;
    if (remaining < 1.8 && Math.floor(remaining * 8) % 2 === 0) return; // blink before vanishing
    const pulse = 1 + Math.sin(G.time * (t.def.bad ? 9 : 4) + t.phase) * (t.def.bad ? 0.08 : 0.05);
    const r = t.r * appear * pulse;
    if (r <= 0) return;
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
    const dark = theme().dark;
    for (const p of particles) {
      const k = p.life / p.max;
      const col = dark && p.color === C.ink ? C.paper : p.color;
      ctx.globalAlpha = Math.min(1, k * 1.5);
      const s = p.size * (0.4 + 0.6 * k);
      if (p.shape === 'star') {
        ctx.fillStyle = col; starPath(ctx, p.x, p.y, s * 1.3, p.life * 4, 5, 0.45); ctx.fill();
      } else if (p.shape === 'square') {
        ctx.fillStyle = col;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.life * 6); ctx.fillRect(-s / 2, -s * 0.3, s, s * 0.6); ctx.restore();
      } else if (p.shape === 'blob') {
        ctx.fillStyle = col; ctx.beginPath(); ctx.arc(p.x, p.y, s * 0.8, 0, Math.PI * 2); ctx.fill();
      } else if (p.spark) {
        ctx.strokeStyle = col;
        ctx.lineWidth = p.size * k + 0.4;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - p.vx * 0.03, p.y - p.vy * 0.03);
        ctx.stroke();
      } else {
        ctx.fillStyle = col;
        ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s);
      }
    }
    ctx.globalAlpha = 1;
  }

  function drawRing(r) {
    if (r.t < 0) return; // delayed ring (ripple effect)
    const k = r.t / r.life;
    const e = 1 - Math.pow(1 - k, 3);
    ctx.globalAlpha = (1 - k) * 0.8;
    ctx.strokeStyle = r.color === C.ink ? fg() : r.color;
    ctx.lineWidth = r.width * (1 - k) + 0.5;
    ctx.beginPath();
    ctx.arc(r.x, r.y, Math.max(0.1, r.max * e), 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  function drawPopup(p) {
    const k = p.t / p.life;
    const s = easeOutBack(clamp(p.t / 0.18, 0, 1));
    if (s <= 0) return;
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
    const dark = theme().dark;
    ctx.strokeStyle = dark ? C.ink : C.paper;
    ctx.strokeText(p.text, 0, 0);
    ctx.fillStyle = dark && p.color === C.ink ? C.paper : dark && p.color === C.slate ? C.mist : p.color;
    ctx.fillText(p.text, 0, 0);
    ctx.restore();
  }

  function roundRect(x, y, w, h, r) { rr(ctx, x, y, w, h, r); }

  function mix(a, b, t) {
    const pa = hexRgb(a), pb = hexRgb(b);
    return `rgb(${pa.map((v, i) => Math.round(lerp(v, pb[i], t))).join(',')})`;
  }

  // ================================================================ loop
  let lastT = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, Math.max(0, (now - lastT) / 1000));
    lastT = now;
    requestAnimationFrame(frame); // schedule first, so one bad frame can never stop the game
    update(dt);
    render();
  }

  // ================================================================ input
  function pointerTo(e) {
    if (G.state === 'menu') return;
    if (G.mode === 'duel') {
      // Touch: each player drags in their own half. Mouse: always the bottom player.
      const which = e.pointerType === 'touch' || e.pointerType === 'pen' ? (e.clientY < H / 2 ? 'top' : 'bot') : 'bot';
      pads[which].targetX = e.clientX;
    } else {
      const x = reversed() ? W - e.clientX : e.clientX;
      for (const p of padList()) p.targetX = x;
    }
  }
  window.addEventListener('pointermove', pointerTo, { passive: true });
  canvas.addEventListener('pointerdown', (e) => { if (G.state === 'playing') pointerTo(e); });

  const KEYMAP = { a: 'a', A: 'a', d: 'd', D: 'd', ArrowLeft: 'left', ArrowRight: 'right' };
  window.addEventListener('keydown', (e) => {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return; // typing a name
    const k = e.key;
    const uiOpen = el.records.classList.contains('show') || el.settings.classList.contains('show') || el.locker.classList.contains('show');
    if (KEYMAP[k]) { keys[KEYMAP[k]] = true; if (!uiOpen && G.state === 'playing') e.preventDefault(); return; }
    if (k === 'm' || k === 'M') { toggleMute(); return; }
    if (k === 'Escape' && el.records.classList.contains('show')) { closeRecords(); return; }
    if (k === 'Escape' && el.settings.classList.contains('show')) { closeSettings(); return; }
    if (k === 'Escape' && el.locker.classList.contains('show')) { closeLocker(); return; }
    if (k === 'p' || k === 'P' || k === 'Escape') {
      if (G.state === 'playing') pauseGame(); else if (G.state === 'paused') resumeGame();
      return;
    }
    if (k === ' ' || k === 'Enter') {
      if (document.activeElement && document.activeElement.tagName === 'BUTTON') return; // let buttons handle it
      if (uiOpen) return;
      e.preventDefault();
      if (G.state === 'menu' || G.state === 'over') startGame();
      else if (G.state === 'paused') resumeGame();
    }
  });
  window.addEventListener('keyup', (e) => { if (KEYMAP[e.key]) keys[KEYMAP[e.key]] = false; });

  // Pause when the tab or window loses focus.
  window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; pauseGame(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) pauseGame(); else lastT = performance.now(); });

  function toggleMute() {
    Sfx.setMuted(!Sfx.muted);
    el.btnMute.setAttribute('aria-pressed', String(Sfx.muted));
    el.btnMute.setAttribute('aria-label', Sfx.muted ? 'Unmute sound (M)' : 'Mute sound (M)');
    if (!Sfx.muted) { Sfx.init(); Sfx.click(); }
  }

  // Mode picker (a radio group with arrow-key support)
  for (const b of $$('.mode')) {
    b.addEventListener('click', () => { G.mode = b.dataset.mode; store.set('bib.mode', G.mode); Sfx.init(); Sfx.click(); refreshMenu(); });
    b.addEventListener('keydown', (e) => {
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
      e.preventDefault();
      e.stopPropagation();
      const all = $$('.mode');
      const next = all[(all.indexOf(b) + (e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : all.length - 1)) % all.length];
      next.click();
      next.focus();
    });
  }

  $('#btn-play').addEventListener('click', () => startGame());
  $('#btn-again').addEventListener('click', () => startGame());
  $('#btn-resume').addEventListener('click', resumeGame);
  $('#btn-quit').addEventListener('click', toMenu);
  $('#btn-menu').addEventListener('click', toMenu);
  $('#btn-records').addEventListener('click', () => openRecords('board'));
  $('#btn-over-records').addEventListener('click', () => openRecords('board'));
  $('#btn-records-back').addEventListener('click', closeRecords);
  $('#btn-locker').addEventListener('click', openLocker);
  $('#btn-over-locker').addEventListener('click', openLocker);
  $('#btn-locker-back').addEventListener('click', closeLocker);
  for (const b of $$('.locker-cat')) b.addEventListener('click', () => { lockerCat = b.dataset.cat; renderLocker(); });
  el.btnShare.addEventListener('click', () => { shareCard().catch(() => shareLabel('Could not create card')); });
  el.btnSettings.addEventListener('click', (e) => { e.currentTarget.blur(); if (G.state === 'playing') pauseGame(); Sfx.init(); openSettings(); });
  $('#btn-settings-back').addEventListener('click', closeSettings);
  for (const b of $$('.pack')) {
    b.addEventListener('click', () => {
      Sfx.pack = b.dataset.pack;
      store.set('bib.pack', Sfx.pack);
      for (const o of $$('.pack')) o.setAttribute('aria-checked', String(o === b));
      Sfx.init();
      [0, 2, 4].forEach((s, i) => setTimeout(() => Sfx.bounce(s, i === 2, 0), i * 140)); // preview
    });
  }
  el.musicToggle.addEventListener('click', () => {
    Sfx.init();
    Music.toggle(!Music.on);
    el.musicToggle.setAttribute('aria-checked', String(Music.on));
  });
  for (const b of $$('.board-mode')) b.addEventListener('click', () => { G.boardMode = b.dataset.mode; refreshBoard(G.boardMode); });
  el.nameForm.addEventListener('submit', (e) => {
    e.preventDefault();
    el.nameForm.querySelector('button').disabled = true;
    const name = commitPending();
    Sfx.click();
    if (name) submitOnline(name);
    $('#btn-again').focus({ preventScroll: true });
  });
  for (const t of $$('[role="tab"]')) {
    t.addEventListener('click', () => selectTab(t.dataset.tab));
    t.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      const tabs = $$('[role="tab"]');
      const next = tabs[(tabs.indexOf(t) + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
      selectTab(next.dataset.tab);
      next.focus();
    });
  }
  el.btnPause.addEventListener('click', pauseGame);
  el.btnMute.addEventListener('click', (e) => { toggleMute(); e.currentTarget.blur(); });
  for (const b of $$('.btn')) b.addEventListener('click', () => b.blur());

  window.addEventListener('resize', resize);

  // ================================================================ boot
  for (const [cat, g] of Object.entries(COSMETICS)) {
    const item = g.items.find((i) => i.id === equip[cat]);
    if (!item || !itemUnlocked(item)) equip[cat] = g.items[0].id;
  }
  checkUnlocks(true);
  applyTheme();
  G.bg = themeBg();
  resize();
  buildOrbGuide();
  el.btnMute.setAttribute('aria-pressed', String(Sfx.muted));
  balls = [serveBall(1)];
  refreshMenu();
  setScreen('menu');
  requestAnimationFrame((t) => { lastT = t; frame(t); });

  // Small hook for automated checks in the browser console.
  window.__bounce = {
    G, pads, M, Boards, bests, earned, Music, Sfx, equip, lifetime, COSMETICS, itemUnlocked,
    get balls() { return balls; },
    get targets() { return targets; },
    get bumpers() { return bumpers; },
    startGame, startRage, startEvent, spawnBoss, levelUp, bossAttack, openLocker, renderLocker,
    // Advance the simulation by `seconds` at 60 fps (works even when the tab is in the background).
    step(seconds, onFrame) {
      for (let i = 0; i < Math.round(seconds * 60); i++) { if (onFrame) onFrame(); update(1 / 60); }
      render();
    },
  };
})();
