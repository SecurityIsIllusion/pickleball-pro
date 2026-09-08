# 🏓 Pickleball Pro

An enterprise-grade browser pickleball game built with vanilla JavaScript and HTML5 Canvas — no frameworks, no build step, no dependencies.

## Features

- **Real pickleball rules** — serve-only scoring, side-outs, first to 11 (win by 2), kitchen/NVZ enforcement, two-bounce rule
- **1 Player vs AI** — 5 difficulty levels (Beginner → Champion) with unlock progression
- **2 Player local** — play against a friend on the same keyboard
- **Human characters** — male/female avatars, plus an AI robot opponent
- **Power shots** — hold to charge, release to fire
- **Full 2D movement** — roam your half of the court
- **Leaderboard** — top-10 scores saved locally with rank notifications
- **Sound effects** — Web Audio API (no audio files)
- **Particle effects** — hit bursts, confetti, ball trails
- **Responsive** — scales to any screen, touch controls on mobile

## Controls

| Action | Player 1 | Player 2 (2P mode) |
|--------|----------|--------------------|
| Move   | `W` `A` `S` `D` | `↑` `←` `↓` `→` |
| Serve / Power shot | `SPACE` | `Enter` |
| Pause  | `P` / `Esc` | — |

## Running locally

No dependencies — just Node.js for the static file server.

```bash
node server.js
```

Then open **http://localhost:4000** in your browser.

## Project structure

```
pickleball-enterprise/
├── server.js          # zero-dependency Node.js static file server
└── public/
    ├── index.html     # game shell + overlays (menu, pause, gameover, leaderboard, settings)
    ├── game.js        # game engine (physics, AI, rendering, sound, state)
    ├── style.css      # dark glass-morphism UI theme
    └── favicon.svg    # pickleball icon
```

## License

MIT
