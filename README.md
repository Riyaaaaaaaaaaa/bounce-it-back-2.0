# Bounce it Back 2.0

A small arcade game for the browser. Two mirrored paddles, one at the top and one at the bottom, move together. Keep the ball between them: every bounce scores, perfect centre hits build combos up to Rage mode, and one miss ends the run.

**Play:** https://riyaaaaaaaaaaa.github.io/bounce-it-back-2.0/

The sequel to [Bounce it Back](https://github.com/Riyaaaaaaaaaaa/bounce-it-back-game), the paddle game I built in May–June 2025. The original stays as it was, and 2.0 is its own project.

Plain HTML, CSS and JavaScript on a `<canvas>`. There's no build step, no libraries and no asset files, and all the sound is generated in the browser.

## Modes

| Mode | How it works |
|---|---|
| **Classic** | Levels, orbs, bumpers, random events, and a boss every 5 levels. One miss ends the run |
| **Survival** | No levels, no orbs, no breaks. The ball speeds up every second. How long can you last? |
| **60-second rush** | Score as much as you can in a minute. Orbs spawn faster, and a miss costs 3 seconds instead of ending the run |
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
- In Classic you go up a level every **8 bounces**. Level 1 is gentle, and each level makes the ball noticeably faster. The **Speed** readout shows how fast it is compared with the start.

**Orbs** (Classic and Rush) float in the middle of the court. Steer the ball through one to collect it. New kinds unlock as you level up:

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

**Special events** (Classic from level 2, and Rush) arrive at random with a 2-second warning and last 7 seconds:

| Event | What happens |
|---|---|
| Gravity shift | The ball curves sideways |
| Chaos mode | The ball speeds up and changes direction without warning |
| Double points | Every bounce scores double |
| Invisible ball | The ball keeps disappearing for a moment |
| Reverse controls | Left is right and right is left |

**Bosses** (Classic, at levels 5, 10, 15 and so on): a boss with a health bar appears in the middle of the court, and every ball hit damages it. It fights back by spitting globs that **stun** a paddle they hit (the paddle shrinks and slows down), **warping** the ball's direction, and dropping **breakable blocks**. Beat it for a bonus of 50 × your level. Levels pause until the boss is defeated.

**Little details**

- **Near miss:** when the ball just slips past a paddle, a marker shows the gap ("so close! 6px").
- **Danger slow-mo:** when your last ball is about to slip past a paddle, time slows down hard and you hear a heartbeat, so you get one more chance to reach it. Saving it counts as a *clutch save*.
- **Last chance:** once in a while (once per run at most, in Classic and Survival), a miss gives you a surprise second serve.
- **Personal-best ghost:** the HUD shows **vs PB**, how far ahead or behind your best run you were at the same moment.
- **Score milestones:** 100, 500, 1,000 and more each get a confetti burst and a big announcement.
- **Share score:** the game-over screen makes a score-card image. It opens the share sheet on phones and downloads the image elsewhere.

**Leaderboards, badges and titles**

- Classic, Survival and Rush each have a **top-10 leaderboard** (Survival ranks by time). If your run makes it, the game-over screen asks for a name.
- There are **26 badges** to earn, such as *First 100 bounces* (Rally master), *10 perfect hits in a row* (Laser focus), *Survive 60 seconds* (Still standing), *Score 500 without power-ups* (No help needed), *Reach level 10* (Lightspeed), plus ones for Rage mode, bosses, events and more.
- Badges earn **titles**: Rookie → Rallier (3) → Ace (7) → Maestro (12) → Legend (18) → Bounce Royalty (all 26). Your title is shown on the menu, on your leaderboard entries and on the share card.
- Everything is saved in your browser (`localStorage`), so it's per device.

## What's in 2.0

2.0 is the original game rebuilt in three rounds (v2, v3 and v4 below; v4 is the current version).

### v4

- **Four modes:** Classic, Survival, 60-second Rush and local Two-player.
- **Combo tiers** at 5, 10 and 20 perfect hits, with an announcer, glowing trails, stronger shake and rising sound.
- **Rage mode** at 20 perfect hits in a row (again at 30, 40 and so on), with ×3 points, a red screen, a fiery ball, faster music and a survival bonus.
- **Random events:** gravity shift, chaos mode, double points, invisible ball and reverse controls.
- **Bosses** every 5 levels in Classic, with stun globs, ball warps and breakable blocks.
- **Background music,** generated in the browser, which gets more intense in boss fights and Rage mode. Plus three **sound packs**.
- **Little details:** near-miss markers, danger slow-mo, a rare last chance, a personal-best ghost, score milestones, a share-able score card, and run stats on the pause screen.
- **Achievements:** 26 badges (up from 12), titles, and a leaderboard for each mode.

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

## Run it locally

Open `index.html` in a browser, or serve the folder:

```bash
python3 -m http.server 8000
```

Then visit http://localhost:8000.

## Files

```
├── index.html      # markup: canvas, HUD, banners, and the menu / pause / game-over / hall-of-fame / settings screens
├── css/style.css   # layout, overlays and UI animations
└── js/game.js      # game loop, modes, physics, combos, events, bosses, effects, audio and music, leaderboards and badges
```

Everything lives at the repo root, so any static host (GitHub Pages, Vercel, Netlify) can serve it as is.

---

Made by Riya Ann Varghese.
