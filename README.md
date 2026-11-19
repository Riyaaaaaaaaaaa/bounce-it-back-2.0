# Bounce it Back

A small arcade game for the browser. Two mirrored paddles, one at the top and one at the bottom, move together. Keep the ball between them: every bounce scores, and one miss ends the run.

**Play:** https://bounce-it-back-game.vercel.app

Plain HTML, CSS and JavaScript on a `<canvas>`. There's no build step, no libraries and no asset files, and all the sound is generated in the browser.

## How to play

| | |
|---|---|
| **Move** | Mouse, drag a finger on touch screens, or `←` `→` / `A` `D` |
| **Start / restart** | Click **Play**, or press `Space` / `Enter` |
| **Pause** | `P` or `Esc`, or the pause button. The game also pauses by itself when you switch tabs or windows |
| **Sound** | `M` or the speaker button (the setting is saved) |

**Scoring and speed**

- Each paddle bounce scores points equal to your current multiplier.
- Hit the ball with the **centre of the paddle** (the rust mark) for a *perfect*. Each perfect in a row raises the multiplier by one, up to **×5**. An off-centre hit resets it.
- Where the ball lands on the paddle sets its bounce angle, so you can aim it.
- Every **8 bounces** you go up a level. Level 1 is gentle, and each level makes the ball noticeably faster. The **Speed** readout in the corner shows how fast it is compared with level 1, from 1.0× up to about 3.7×.
- From **level 3**, bumpers drift across the middle of the court (a second one joins at level 6). The ball bounces off them, and each hit is worth a point.

**Orbs** float in the middle of the court. Steer the ball through one to collect it. New kinds unlock as you level up:

| Orb | From | Effect |
|---|---|---|
| ★ Sand | L1 | +5 points × your multiplier |
| ↔ Sage | L1 | Wide paddles for 9 seconds |
| Shield (pale blue) | L1 | A barrier along both edges that saves one miss. You can hold up to 2 |
| ••• Rose | L2 | Multi-ball: two extra balls. Losing an extra ball is free, and the run ends only when the last ball goes out |
| ◷ Slate | L2 | Slow-mo for 6 seconds (your paddles keep full speed) |
| Magnet (ochre) | L3 | For 8 seconds, the paddles pull the ball toward their centre |
| 2× Rust | L3 | Double points for 8 seconds, and the ball becomes a fireball |
| →← Ink | L4 | **Bad orb!** Shrinks your paddles for 7 seconds. Steer around it |

**Leaderboard and badges**

- If your score makes the top 10, the game-over screen asks for a name. Your name and score go on the **Hall of fame** leaderboard (open it from the menu or the game-over screen).
- There are 12 **badges** to unlock, such as *Bullseye*, *Pinball wizard*, *Close call* and *Purist*. A toast pops up when you earn one.
- The leaderboard, badges, best score and sound setting are saved in your browser (`localStorage`), so they're per device.

## What's new in v3

- **A real difficulty curve:** level 1 is slower than before, each level gives a clear speed boost (with a level-up banner and a speed readout), and levels come every 8 bounces.
- **Four new orbs:** shield, magnet, double points and a bad shrink orb. Orbs unlock level by level, and up to 3 can be on screen from level 4.
- **Bumpers** from level 3: moving obstacles that bounce the ball and score points.
- **Hall of fame:** a top-10 leaderboard with name entry, 12 unlockable badges with pop-up toasts, and a guide to every orb.
- **Level atmosphere:** the background tint shifts and the dot grid drifts faster as you climb.
- **Bug fix:** an item that appeared at the exact moment it spawned could crash the drawing loop and freeze the game. The pop-in easing can no longer go negative, and the loop now schedules its next frame before it draws.

## What's new in v2

Version 1 (May–June 2025) was the basic paddle-and-ball loop. Version 2 rebuilds it around game feel:

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

Open `bounce it back/index.html` in a browser, or serve the folder:

```bash
cd "bounce it back" && python3 -m http.server 8000
```

Then visit http://localhost:8000.

## Files

```
bounce it back/
├── index.html      # markup: canvas, HUD, start / pause / game-over / hall-of-fame screens
├── css/style.css   # layout, overlays and UI animations
└── js/game.js      # game loop, physics, orbs, bumpers, effects, audio, leaderboard and badges
```

The Vercel project serves the `bounce it back/` folder as the site root.

---

Made by Riya Ann Varghese.
