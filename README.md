# 🏓 Pickleball Pro

An enterprise-grade browser pickleball game built with vanilla JavaScript and HTML5 Canvas — **no frameworks, no build step, no dependencies.**

![Vanilla JS](https://img.shields.io/badge/JavaScript-vanilla-yellow) ![No dependencies](https://img.shields.io/badge/dependencies-0-brightgreen) ![License MIT](https://img.shields.io/badge/license-MIT-blue)

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

---

## 🚀 Setup

The only requirement is a way to serve static files. Pick whichever option fits your machine.

### Option 1 — Node.js (recommended, included server)

The repo ships with a tiny zero-dependency Node server.

**Prerequisites:** [Node.js](https://nodejs.org) v14 or later (`node --version` to check).

```bash
# 1. Clone the repo
git clone https://github.com/SecurityIsIllusion/pickleball-pro.git
cd pickleball-pro

# 2. Start the server
node server.js

# 3. Open in your browser
#    http://localhost:4000
```

To change the port, edit `PORT` at the top of `server.js`.

### Option 2 — Python (no Node needed)

Any machine with Python can serve the `public/` folder:

```bash
git clone https://github.com/SecurityIsIllusion/pickleball-pro.git
cd pickleball-pro/public

# Python 3
python3 -m http.server 4000

# then open http://localhost:4000
```

### Option 3 — Open the file directly

You can also just open `public/index.html` in your browser (double-click it). Everything runs client-side, so no server is strictly required — though a server is recommended so browser features (audio, localStorage) behave consistently.

---

## 🌐 Deploying to a server

### Static hosting (GitHub Pages, Netlify, Vercel, S3…)

Because the game is 100% client-side, you can host the **`public/`** folder on any static host — no Node process needed.

**GitHub Pages (free):**
1. Push this repo to GitHub.
2. In the repo → **Settings → Pages**.
3. Set source to the `main` branch, folder `/public` (or move `public/`'s contents to the repo root).
4. Your game will be live at `https://<username>.github.io/pickleball-pro/`.

**Netlify / Vercel:** point the project at this repo, set the **publish directory** to `public`, and leave the build command empty.

### Linux server (VPS / EC2) with Node

```bash
git clone https://github.com/SecurityIsIllusion/pickleball-pro.git
cd pickleball-pro

# Run persistently with a process manager
npm install -g pm2
pm2 start server.js --name pickleball
pm2 save
```

Put nginx or Caddy in front for HTTPS if exposing publicly.

### Docker

```bash
# From the repo root
docker run -d --name pickleball -p 4000:4000 \
  -v "$PWD":/app -w /app node:20-alpine node server.js
```

Then browse to `http://<server-ip>:4000`.

---

## Project structure

```
pickleball-pro/
├── server.js          # zero-dependency Node.js static file server
├── README.md
├── .gitignore
└── public/
    ├── index.html     # game shell + overlays (menu, pause, gameover, leaderboard, settings)
    ├── game.js        # game engine (physics, AI, rendering, sound, state)
    ├── style.css      # dark glass-morphism UI theme
    └── favicon.svg    # pickleball icon
```

## Notes

- **No secrets, no API keys, no tracking** — the game is fully self-contained and runs offline.
- Scores are stored in your browser's `localStorage`, so leaderboards are per-device.

## License

MIT — free to use, modify, and share.
