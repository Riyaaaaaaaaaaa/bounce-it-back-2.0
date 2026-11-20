// Online leaderboard for Bounce it Back 2.0: a Vercel serverless function backed by Upstash Redis.
//
//   GET  /api/scores?mode=classic   → top 10 for a mode (plus your own rank if you send x-player-id)
//   POST /api/scores                → submit a score: { mode, pid, name, score, level, title, seconds, hits }
//
// Each player (a random id kept in their browser) has one entry per mode: their best score.
// The Redis credentials come from environment variables set by the Upstash integration in Vercel,
// so they never reach the browser.
//
// Note: any leaderboard for a game that runs in the browser can be fed fake scores by someone determined.
// The checks below (validation, plausibility limits, rate limiting) stop casual tampering and junk;
// suspicious entries can be removed from the Upstash console.

'use strict';

const crypto = require('crypto');

const MODES = {
  classic:  { max: 1e6, integer: true },
  chaos:    { max: 1e6, integer: true },
  rush:     { max: 2e5, integer: true },
  survival: { max: 7200, integer: false }, // seconds survived
  bossrush: { max: 500, integer: true },   // bosses beaten
};
const TITLES = ['Rookie', 'Rallier', 'Ace', 'Maestro', 'Legend', 'Bounce Royalty'];
const TOP_N = 10;
const RATE_LIMIT = 8;          // submissions per IP per minute
const BLOCKED_NAME = /https?:|www\.|\.(com|net|org|io|xyz|ru|ly|gg)\b|[<>]/i;

function redisConfig() {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  return url && token ? { url: url.replace(/\/$/, ''), token } : null;
}

// Run several Redis commands in one round trip via Upstash's REST pipeline.
async function redis(commands) {
  const cfg = redisConfig();
  const res = await fetch(cfg.url + '/pipeline', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + cfg.token, 'Content-Type': 'application/json' },
    body: JSON.stringify(commands),
  });
  if (!res.ok) throw new Error('redis http ' + res.status);
  const out = await res.json();
  return out.map((r) => {
    if (r.error) throw new Error('redis: ' + r.error);
    return r.result;
  });
}

const INVISIBLE = new RegExp('[\\u0000-\\u001f\\u007f-\\u009f\\u200b-\\u200f\\u2028-\\u202e\\u2066-\\u2069]', 'g'); // control & bidi characters
const cleanName = (s) => String(s || '').replace(INVISIBLE, '')
  .replace(/\s+/g, ' ').trim().slice(0, 12).trim();
const validPid = (p) => typeof p === 'string' && /^[a-f0-9]{32}$/.test(p);
const ipKey = (req) => {
  const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();
  return 'rl:' + crypto.createHash('sha256').update(ip).digest('hex').slice(0, 16);
};

function send(res, status, body) {
  res.setHeader('Cache-Control', 'no-store');
  res.status(status).json(body);
}

async function getBoard(req, res) {
  const mode = String(req.query.mode || '');
  if (!MODES[mode]) return send(res, 400, { error: 'Unknown mode' });
  const pid = String(req.headers['x-player-id'] || '');
  const [flat, total, yourRank, yourScore] = await redis([
    ['ZREVRANGE', 'lb:' + mode, 0, TOP_N - 1, 'WITHSCORES'],
    ['ZCARD', 'lb:' + mode],
    validPid(pid) ? ['ZREVRANK', 'lb:' + mode, pid] : ['ECHO', ''],
    validPid(pid) ? ['ZSCORE', 'lb:' + mode, pid] : ['ECHO', ''],
  ]);
  const pids = [];
  const scores = [];
  for (let i = 0; i < flat.length; i += 2) { pids.push(flat[i]); scores.push(Number(flat[i + 1])); }
  const metas = pids.length ? (await redis([['HMGET', 'lbm:' + mode, ...pids]]))[0] : [];
  const rows = pids.map((id, i) => {
    let m = {};
    try { m = JSON.parse(metas[i] || '{}'); } catch { /* ignore a bad record */ }
    return { name: m.name || 'Player', title: m.title || '', level: m.level || 1, date: m.date || 0, score: scores[i], you: id === pid };
  });
  const you = validPid(pid) && yourRank !== null && yourRank !== ''
    ? { rank: Number(yourRank) + 1, score: Number(yourScore) }
    : null;
  return send(res, 200, { mode, rows, total: Number(total) || 0, you });
}

async function postScore(req, res) {
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = null; } }
  if (!body || typeof body !== 'object') return send(res, 400, { error: 'Bad request' });

  const mode = String(body.mode || '');
  const rules = MODES[mode];
  if (!rules) return send(res, 400, { error: 'Unknown mode' });
  if (!validPid(body.pid)) return send(res, 400, { error: 'Bad player id' });

  const name = cleanName(body.name);
  if (!name) return send(res, 400, { error: 'Please enter a name' });
  if (BLOCKED_NAME.test(name)) return send(res, 400, { error: 'Please choose a different name' });

  let score = Number(body.score);
  const seconds = Number(body.seconds);
  const hits = Number(body.hits);
  if (!Number.isFinite(score) || !Number.isFinite(seconds) || !Number.isFinite(hits)) return send(res, 400, { error: 'Bad score' });
  score = rules.integer ? Math.floor(score) : Math.round(score * 10) / 10;
  if (score <= 0 || score > rules.max || seconds <= 0 || seconds > 4 * 3600 || hits < 0) return send(res, 400, { error: 'Bad score' });
  // Loose plausibility limits, so obviously impossible numbers are refused.
  if (mode === 'survival' && score > seconds + 2) return send(res, 400, { error: 'Bad score' });
  if (mode === 'bossrush' && score > seconds / 5 + 1) return send(res, 400, { error: 'Bad score' });
  if (rules.integer && mode !== 'bossrush' && score > 400 * seconds + 2000) return send(res, 400, { error: 'Bad score' });
  if (mode !== 'survival' && mode !== 'bossrush' && hits < 1) return send(res, 400, { error: 'Bad score' });

  const level = Math.max(1, Math.min(999, Math.floor(Number(body.level) || 1)));
  const title = TITLES.includes(body.title) ? body.title : '';

  // Rate limit per IP (hashed, kept for a minute).
  const rl = ipKey(req);
  const [count] = await redis([['INCR', rl]]);
  if (Number(count) === 1) await redis([['EXPIRE', rl, 60]]);
  if (Number(count) > RATE_LIMIT) return send(res, 429, { error: 'Too many scores at once. Try again in a minute.' });

  const key = 'lb:' + mode;
  const [prev] = await redis([['ZSCORE', key, body.pid]]);
  const prevScore = prev === null || prev === '' ? null : Number(prev);
  const improved = prevScore === null || score > prevScore;
  if (improved) {
    await redis([
      ['ZADD', key, score, body.pid],
      ['HSET', 'lbm:' + mode, body.pid, JSON.stringify({ name, title, level, date: Date.now() })],
    ]);
  }
  const [rank, total] = await redis([['ZREVRANK', key, body.pid], ['ZCARD', key]]);
  return send(res, 200, {
    saved: improved,
    best: improved ? score : prevScore,
    rank: Number(rank) + 1,
    total: Number(total) || 0,
  });
}

module.exports = async (req, res) => {
  if (!redisConfig()) return send(res, 503, { error: 'Online leaderboard is not set up yet' });
  try {
    if (req.method === 'GET') return await getBoard(req, res);
    if (req.method === 'POST') return await postScore(req, res);
    res.setHeader('Allow', 'GET, POST');
    return send(res, 405, { error: 'Method not allowed' });
  } catch (err) {
    console.error('leaderboard error', err);
    return send(res, 502, { error: 'Leaderboard is temporarily unavailable' });
  }
};
