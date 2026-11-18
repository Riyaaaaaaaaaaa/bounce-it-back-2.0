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

**Scoring**

- Each paddle bounce scores points equal to your current multiplier.
- Hit the ball with the **centre of the paddle** (the rust mark) for a *perfect*. Each perfect in a row raises the multiplier by one, up to **×5**. An off-centre hit resets it.
- Where the ball lands on the paddle sets its bounce angle, so you can aim it.
- Every 10 bounces you go up a level and the ball gets faster.

**Orbs** float in the middle of the court. Steer the ball through one to collect it:

| Orb | Effect |
|---|---|
| ★ Sand | +5 points × your multiplier |
| ↔ Sage | Wide paddles for 9 seconds |
| ••• Rose | Multi-ball: two extra balls (losing an extra ball is free, and the run ends only when the last ball goes out) |
| ◷ Slate | Slow-mo for 6 seconds (your paddles keep full speed) |

Your best score is saved in the browser.

## What's new in v2

Version 1 (May–June 2025) was the basic paddle-and-ball loop. Version 2 rebuilds it around game feel:

- **Juice:** screen shake on hits, spark and particle bursts, shockwave rings, a fading ball trail, squash and stretch on the ball, paddle hit-flash and recoil, paddle tilt as you move, and a short hit-stop on perfect hits.
- **Slow-motion game over:** time slows, the camera zooms in on the miss and the screen flashes before the results appear.
- **Combos and score pop-ups:** floating "+N" and *perfect ×N* text, a pulsing combo pill, and a giant score numeral behind the court.
- **Speed ramp and levels:** the ball speeds up steadily and a level banner announces each new level (this replaces the old `alert()` pop-up).
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
├── index.html      # markup: canvas, HUD, start / pause / game-over screens
├── css/style.css   # layout, overlays and UI animations
└── js/game.js      # game loop, physics, effects, audio and input
```

The Vercel project serves the `bounce it back/` folder as the site root.

---

Made by Riya Ann Varghese.
