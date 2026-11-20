# Bounce it Back 2.0

A small arcade game for the browser. Two mirrored paddles, one at the top and one at the bottom, move together. Keep the ball between them: every bounce scores, perfect centre hits build combos up to Rage mode, and one miss ends the run.

**Play:** https://bounce-it-back-20.vercel.app

The sequel to [Bounce it Back](https://github.com/Riyaaaaaaaaaaa/bounce-it-back-game), the paddle game I built in May–June 2025. The original stays as it was, and 2.0 is its own project.

Plain HTML, CSS and JavaScript on a `<canvas>`. There's no build step, no libraries and no asset files, and all the sound is generated in the browser.

## Modes

| Mode | How it works |
|---|---|
| **Classic** | Just bounce. Combos, Rage mode, power-up orbs, and a ball that gets faster every level. One miss ends the run |
| **Chaos** | Everything at once: Classic plus a mini-boss at level 2, a boss every 3 levels, random events and bumpers |
| **Survival** | No levels, no orbs, no breaks. The ball speeds up every second. How long can you last? |
| **60-second rush** | Score as much as you can in a minute. Orbs spawn faster, and a miss costs 3 seconds instead of ending the run |
| **Boss rush** | Straight into the fights: a mini-boss, then boss after boss, each tougher than the last. Ranked by bosses beaten |
| **Two players** | Local, on one screen: the bottom player against the top player, first to 5 points. Each rally gets faster |

## How to play

| | |
|---|---|
| **Move** | Mouse, drag a finger on touch screens, or `←` `→` / `A` `D` |
| **Two players** | Bottom: `A` `D` or the mouse. Top: `←` `→`. On a touch screen, each player drags in their own half |
| **Start / restart** | Click **Play**, or press `Space` / `Enter` |
| **Pause** | `P` or `Esc`, or the pause button. The pause screen shows your run stats. The game also pauses by itself when you switch tabs or windows |
| **Sound** | `M` mutes everything. The settings button has three sound packs (Classic, Chiptune, Soft) and a background-music switch |

**Scoring and combos**

- Every paddle bounce scores. Where the ball lands on the paddle sets its bounce angle, so you can aim it.
- Hit the ball with the **centre of the paddle** (the coloured mark) for a *perfect*. Perfect hits in a row build a combo:

  | Perfect hits in a row | Reward |
  |---|---|
  | 5 | **×2** points, "AMAZING!" |
  | 10 | **×3** points, "UNSTOPPABLE!" |
  | 20 | **×5** points and **Rage mode** |
  | 30, 40, … | Rage mode again, with a bigger bonus each time |

  As the combo grows, the ball's trail gets longer and starts to glow, the screen shakes harder, the flashes get brighter, and the bounce sounds climb higher.
- **Rage mode** lasts 10 seconds. The ball moves faster, every bounce earns **×3** points, the ball leaves a fiery trail, the background turns red, and the music speeds up with drums. Survive all 10 seconds for a big bonus: +250 the first time, +500 the second, and so on.
- In Classic and Chaos you go up a level every **8 bounces**. Level 1 is gentle, and each level makes the ball noticeably faster. The **Speed** readout shows how fast it is compared with the start.

**Orbs** (Classic, Chaos, Rush and Boss rush) float in the middle of the court. Steer the ball through one to collect it. New kinds unlock as you level up:

| Orb | From | Effect |
|---|---|---|
| ★ Sand | L1 | +5 points × your multiplier |
| ↔ Sage | L1 | Wide paddles for 9 seconds |
| Shield (pale blue) | L1 | A barrier along both edges that saves one miss. You can hold up to 2 |
| ••• Rose | L2 | Multi-ball: two extra balls. Losing an extra ball is free, and the run ends only when the last ball goes out |
| ◷ Slate | L2 | Slow-mo for 6 seconds (your paddles keep full speed) |
| Magnet (ochre) | L3 | For 8 seconds, the paddles pull the ball toward their sweet spot, which makes perfect hits easier |
| 2× Rust | L3 | Double points for 8 seconds, and the ball becomes a fireball |
| →← Ink | L4 | **Bad orb!** Shrinks your paddles for 7 seconds. Steer around it |

**Special events** (Chaos from level 2, and Rush) arrive at random with a 2-second warning and last 7 seconds:

| Event | What happens |
|---|---|
| Gravity shift | The ball curves sideways |
| Chaos mode | The ball speeds up and changes direction without warning |
| Double points | Every bounce scores double |
| Invisible ball | The ball keeps disappearing for a moment |
| Reverse controls | Left is right and right is left |

**Bosses** show up early and often. In Chaos a **mini-boss** appears at level 2 (under 30 seconds in), then a **boss every 3 levels** with mini-bosses in between (levels 2, 3, 5, 6, 8, 9…). **Boss rush** goes straight to them. A boss has a health bar and takes damage every time your ball hits it. Each one is tougher than the last and learns new attacks:

| Attack | What it does | Who uses it |
|---|---|---|
| Spit | Fires a glob at each paddle. A hit **stuns** that paddle (it shrinks and slows down for a moment) | Everyone |
| Warp | Flips the ball's direction | Bosses, and mini-bosses from the second one |
| Blocks | Drops breakable blocks into the court | From the second boss |
| Spray | Fires a fan of three globs at each paddle | From the third boss |

Beat a mini-boss for 25 × your level and a boss for 50 × your level (in Boss rush the bonus grows with each one). Levels pause during a fight, the music picks up a drum beat, and the tougher bosses wear a crown.

**Little details**

- **Near miss:** when the ball just slips past a paddle, a marker shows the gap ("so close! 6px").
- **Danger slow-mo:** when your last ball is about to slip past a paddle, time slows down hard and you hear a heartbeat, so you get one more chance to reach it. Saving it counts as a *clutch save*.
- **Last chance:** once in a while (once per run at most, in Classic, Chaos and Survival), a miss gives you a surprise second serve.
- **Personal-best ghost:** the HUD shows **vs PB**, how far ahead or behind your best run you were at the same moment.
- **Score milestones:** 100, 500, 1,000 and more each get a confetti burst and a big announcement.
- **Share score:** the game-over screen makes a score-card image. It opens the share sheet on phones and downloads the image elsewhere.

**Leaderboards, badges and titles**

- Every single-player mode has its own **online top-10 leaderboard** shared by everyone who plays (Survival ranks by time, Boss rush by bosses beaten). After a run, type a name and press **Save** to put your score on it. Each player keeps one entry per mode, their best, and the Hall of fame shows where you rank.
- If the online leaderboard can't be reached, the game falls back to a top 10 kept in your own browser.
- There are **28 badges** to earn, such as *First 100 bounces* (Rally master), *10 perfect hits in a row* (Laser focus), *Survive 60 seconds* (Still standing), *Score 500 without power-ups* (No help needed), *Reach level 10* (Lightspeed), plus ones for Rage mode, bosses, events and more.
- Badges earn **titles**: Rookie → Rallier (3) → Ace (7) → Maestro (12) → Legend (18) → Bounce Royalty (all 28). Your title is shown on the menu, on your leaderboard entries and on the share card.
- Badges, titles, settings and Locker unlocks are saved in your browser (`localStorage`), so they're per device.

**The Locker (unlockable cosmetics)**

Earn badges and keep playing to unlock new looks, then equip them from the **Locker** on the menu. They are purely cosmetic and never change how the game plays.

| Category | Unlockables |
|---|---|
| Ball | Classic, Ringed, Beach ball, Ember glow, Pixel, Star, Eyeball |
| Paddle | Ink, Candy stripe, Neon, Wood grain, Sunset, Gold |
| Trail | Dots, Sparkles, Ribbon, Smoke, Hearts |
| Theme | Paper, Mint, Sunset, Blueprint, Midnight |
| Bounce effect | Sparks, Confetti pop, Ripple, Ink splash, Starburst |

Each locked item shows what unlocks it, for example *Neon paddles: reach level 5* or *Wood grain: 1,000 bounces in total*. A dot on the Locker button means something new is waiting.

## What's in 2.0

2.0 is the original game rebuilt in rounds (newest first).

### v5.1

- **Classic is simple again:** just bouncing, combos, Rage mode, orbs and the speed-up. Bosses, events and bumpers moved to the new **Chaos** mode.

### v5

- **Bosses sooner and more often:** a mini-boss at level 2, then a boss every 3 levels with mini-bosses in between. Each one is tougher, and later bosses learn new attacks (blocks, spray).
- **Boss rush mode:** back-to-back bosses from the first second, with its own leaderboard.
- **The Locker:** 28 unlockable cosmetics (balls, paddle skins, trails, background themes, bounce effects), unlocked by badges and lifetime stats.
- **2 new badges:** Gauntlet and Monster hunter (28 in total).

### v4

- **Four modes:** Classic, Survival, 60-second Rush and local Two-player.
- **Combo tiers** at 5, 10 and 20 perfect hits, with an announcer, glowing trails, stronger shake and rising sound.
- **Rage mode** at 20 perfect hits in a row (again at 30, 40 and so on), with ×3 points, a red screen, a fiery ball, faster music and a survival bonus.
- **Random events:** gravity shift, chaos mode, double points, invisible ball and reverse controls.
- **Background music,** generated in the browser, which gets more intense in boss fights and Rage mode. Plus three **sound packs**.
- **Little details:** near-miss markers, danger slow-mo, a rare last chance, a personal-best ghost, score milestones, a share-able score card, and run stats on the pause screen.
- **Achievements:** 26 badges (up from 12), titles, and a leaderboard for each mode.
- **Bosses** first appeared here, every 5 levels.

### v3

- **A real difficulty curve:** level 1 is slower than before, each level gives a clear speed boost (with a level-up banner and a speed readout), and levels come every 8 bounces.
- **Four new orbs:** shield, magnet, double points and a bad shrink orb. Orbs unlock level by level, and up to 3 can be on screen from level 4.
- **Bumpers** from level 3: moving obstacles that bounce the ball and score points.
- **Hall of fame:** a top-10 leaderboard with name entry, 12 unlockable badges with pop-up toasts, and a guide to every orb.
- **Level atmosphere:** the background tint shifts and the dot grid drifts faster as you climb.
- **Bug fix:** an item that appeared at the exact moment it spawned could crash the drawing loop and freeze the game. The pop-in easing can no longer go negative, and the loop now schedules its next frame before it draws.

### v2

The original (May–June 2025) was the basic paddle-and-ball loop. v2 rebuilt it around game feel:

- **Juice:** screen shake on hits, spark and particle bursts, shockwave rings, a fading ball trail, squash and stretch on the ball, paddle hit-flash and recoil, paddle tilt as you move, and a short hit-stop on perfect hits.
- **Slow-motion game over:** time slows, the camera zooms in on the miss and the screen flashes before the results appear.
- **Combos and score pop-ups:** floating "+N" and *perfect ×N* text, a pulsing combo pill, and a giant score numeral behind the court.
- **Levels:** a level banner announces each new level (this replaces the old `alert()` pop-up).
- **Power-up orbs:** points, wide paddles, multi-ball and slow-mo.
- **Screens:** a start screen with an autopilot demo running behind it, a pause screen, and a game-over screen with stats (best, level, bounces, top combo). It celebrates a new best with confetti.
- **Sound:** synthesised with the Web Audio API. Bounces climb a pentatonic scale as your combo grows. There's a mute toggle, and the old mp3 files are gone.
- **Controls:** mouse, touch and keyboard, a responsive high-DPI canvas, and auto-pause when the window loses focus.
- **Danger glow:** a warm glow builds on the edge the ball is heading toward.
- **Accessibility:** follows `prefers-reduced-motion`, which turns off screen shake and death zoom and tones down flashes, particles and trails. All menus work from the keyboard.
- **Look:** a muted editorial palette (ink, paper, rust, rose, sand, sage, slate) with Bricolage Grotesque, Instrument Serif and Cutive Mono.

## Online leaderboard (setup)

The shared leaderboard is a small Vercel serverless function, [`api/scores.js`](api/scores.js), that stores scores in an **Upstash Redis** database. The database credentials stay on the server and never reach the browser.

To switch it on for a Vercel deployment:

1. In the Vercel project, open **Storage** (or **Integrations → Marketplace**) and add **Upstash → Redis**. The free plan is plenty.
2. Connect the new database to this project. That adds the `KV_REST_API_URL` / `KV_REST_API_TOKEN` (or `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`) environment variables.
3. Redeploy, so the function picks up the variables.

Until then, the game shows each player their own browser's scores.

How it protects the board:
- Names are trimmed to 12 characters with invisible and control characters removed, and names containing links or `<` / `>` are refused. Names are always shown as plain text.
- Scores are checked against each mode's limits and the run's length, so impossible numbers are refused.
- Each IP address can save at most 8 scores a minute (IPs are hashed and forgotten after a minute).
- Each browser gets a random player ID, so a player has one entry per mode and can only replace it with a better score.

Like any leaderboard for a game that runs in the browser, a determined person could still send a fake but plausible score. If that happens, delete the entry from the Upstash console: scores live in the sorted set `lb:<mode>` and names in the hash `lbm:<mode>`, both keyed by player ID.

## Run it locally

Open `index.html` in a browser, or serve the folder:

```bash
python3 -m http.server 8000
```

Then visit http://localhost:8000.

## Files

```
├── api/scores.js   # online leaderboard (Vercel serverless function + Upstash Redis)
├── index.html      # markup: canvas, HUD, banners, and the menu / pause / game-over / hall-of-fame / settings screens
├── css/style.css   # layout, overlays and UI animations
└── js/game.js      # game loop, modes, physics, combos, events, bosses, effects, audio and music, leaderboards and badges
```

Everything lives at the repo root, so any static host (GitHub Pages, Vercel, Netlify) can serve it as is.

---

Made by Riya Ann Varghese.
