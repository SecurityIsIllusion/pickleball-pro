// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const CW = 960, CH = 540;
const COURT = { x:60, y:40, w:840, h:460 };
const NET_X = COURT.x + COURT.w / 2;
const KITCHEN_W = COURT.w * 0.318 / 2;
const LK_X = NET_X - KITCHEN_W;
const RK_X = NET_X + KITCHEN_W;
const MID_Y = COURT.y + COURT.h / 2;
const BALL_R = 9;

const LEVELS = {
  1: { label:'Level 1', aiSpeed:2.2, aiError:90,  ballSpeed:4,   aiReact:0.45, powerFreq:0,   subLabel:'Beginner',  reactionDelay:22 },
  2: { label:'Level 2', aiSpeed:3.5, aiError:55,  ballSpeed:5.5, aiReact:0.60, powerFreq:0,   subLabel:'Amateur',   reactionDelay:12 },
  3: { label:'Level 3', aiSpeed:5,   aiError:28,  ballSpeed:7,   aiReact:0.78, powerFreq:0,   subLabel:'Club',      reactionDelay:5  },
  4: { label:'Level 4', aiSpeed:6.5, aiError:12,  ballSpeed:8.5, aiReact:0.92, powerFreq:0.2, subLabel:'Pro',       reactionDelay:2  },
  5: { label:'Level 5', aiSpeed:8.5, aiError:4,   ballSpeed:10,  aiReact:0.98, powerFreq:0.4, subLabel:'Champion',  reactionDelay:0  },
};

// ─── STATE ────────────────────────────────────────────────────────────────────
let gameState = 'menu';
let currentLevel = 1;
let playerName = 'Player 1';
let playerGender = 'male';
let gameMode = '1p';       // '1p' | '2p'
let player2Name = 'Player 2';
let player2Gender = 'male';
let player2 = null;
let soundEnabled = true;
let server = 'player';
let pScore = 0, aScore = 0;

let rallyCurrent = 0, rallyMax = 0;
let playerHits = 0, playerFaults = 0;
let topSpeed = 0;
let scoresSaved = false;
let highlightedPlayers = [];

let ball, player, ai, aiCtrl;
let particles = [];
let keys = {};
let lastTime = 0;
let kitchenFlashTimer = 0;
let serveTimer = 0;
let aiServePending = false;
let prevFrom = '';

// ─── CANVAS SETUP ─────────────────────────────────────────────────────────────
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const wrapper = document.getElementById('canvas-wrapper');

function resize() {
  const scale = Math.min(window.innerWidth / CW, window.innerHeight / CH);
  const offsetX = Math.max(0, (window.innerWidth  - CW * scale) / 2);
  const offsetY = Math.max(0, (window.innerHeight - CH * scale) / 2);
  wrapper.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${scale})`;
}
window.addEventListener('resize', resize);
resize();

// ─── SOUND ENGINE ─────────────────────────────────────────────────────────────
class SoundEngine {
  constructor() { this.ctx = null; }
  _init() {
    if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
  }
  _play(freq, type, duration, vol=0.18, decay=0.15) {
    if (!soundEnabled) return;
    try {
      this._init();
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.connect(gain); gain.connect(this.ctx.destination);
      osc.type = type; osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
      gain.gain.setValueAtTime(vol, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + decay);
      osc.start(); osc.stop(this.ctx.currentTime + duration);
    } catch(e) {}
  }
  hit()      { this._play(520, 'triangle', 0.08, 0.22, 0.08); }
  powerHit() { this._play(680, 'sawtooth', 0.12, 0.3,  0.1);  }
  wall()     { this._play(180, 'sine',     0.07, 0.12, 0.07); }
  fault() {
    this._play(220, 'sawtooth', 0.25, 0.2, 0.25);
    setTimeout(() => this._play(160, 'sawtooth', 0.3, 0.15, 0.3), 120);
  }
  point() {
    [440,554,659,880].forEach((f,i) => setTimeout(() => this._play(f,'triangle',0.15,0.22,0.12), i*80));
  }
  serve()  { this._play(350, 'sine', 0.1, 0.15, 0.1); }
  gameOver(win) {
    const notes = win ? [523,659,784,1047] : [400,350,300,220];
    notes.forEach((f,i) => setTimeout(() => this._play(f, win?'triangle':'sawtooth', 0.2, 0.2, 0.18), i*120));
  }
  charge(level) {
    if (!soundEnabled) return;
    try { this._init(); this._play(300 + level*400, 'sawtooth', 0.04, 0.06, 0.04); } catch(e) {}
  }
}
const snd = new SoundEngine();

// ─── LEVEL MANAGEMENT ─────────────────────────────────────────────────────────
function getMaxLevel() { return parseInt(localStorage.getItem('pb_maxLevel') || '1'); }
function setMaxLevel(n) { localStorage.setItem('pb_maxLevel', Math.min(5, Math.max(1, n)).toString()); }

function renderLevelPills() {
  const max = getMaxLevel();
  const container = document.getElementById('levelPills');
  if (!container) return;
  container.innerHTML = '';
  for (let i = 1; i <= 5; i++) {
    const locked = i > max;
    const btn = document.createElement('button');
    btn.className = 'pill level-pill' + (i === currentLevel ? ' active' : '') + (locked ? ' locked' : '');
    btn.dataset.level = i;
    btn.disabled = locked;
    btn.innerHTML = locked
      ? `🔒 ${i}`
      : `${i}<br><span class="level-sub">${LEVELS[i].subLabel}</span>`;
    btn.addEventListener('click', () => {
      if (!locked) { currentLevel = i; renderLevelPills(); }
    });
    container.appendChild(btn);
  }
}

// ─── AI CONTROLLER ────────────────────────────────────────────────────────────
class AIController {
  constructor(level) {
    this.level = level;
    this.cfg = LEVELS[level];
    this.targetY = CH / 2;
    this.targetX = NET_X + 80;
    this.reactionDelay = this.cfg.reactionDelay;
    this.delayCounter = 0;
    this.pendingTargetY = CH / 2;
    this.pendingTargetX = NET_X + 80;
  }
  update(dt) {
    const cfg = this.cfg;
    if (this.delayCounter <= 0) {
      const error = (Math.random() * 2 - 1) * cfg.aiError;
      let predY = ball.y;

      if (ball.vx > 0) {
        // Ball heading toward AI — predict where it lands
        const frames = Math.max(1, (ai.x - ball.x) / ball.vx);
        predY = ball.y + ball.vy * frames;
        const ct = COURT.y, cb = COURT.y + COURT.h;
        while (predY < ct || predY > cb) {
          if (predY < ct) predY = 2*ct - predY;
          if (predY > cb) predY = 2*cb - predY;
        }
        this.pendingTargetY = predY + error;
        // Stay at current x (let ball come to AI) — only retreat for deep shots
        const deepX = Math.max(NET_X + 20, Math.min(ball.x + 40, COURT.x + COURT.w - ai.w - 20));
        this.pendingTargetX = deepX;
      } else if (ball.x > NET_X) {
        // Ball on AI side going left — track it
        this.pendingTargetY = ball.y + error;
        this.pendingTargetX = Math.max(NET_X + 20, ball.x - 20);
      } else {
        // Ball on player's side — move to ready position near kitchen
        this.pendingTargetY = MID_Y + error * 0.3;
        this.pendingTargetX = NET_X + 60;
      }

      this.delayCounter = this.reactionDelay;
    }
    this.delayCounter = Math.max(0, this.delayCounter - 1);
    this.targetY = this.pendingTargetY;
    this.targetX = this.pendingTargetX;

    // Move Y
    const diffY = (this.targetY - ai.h / 2) - ai.y;
    ai.y += Math.sign(diffY) * Math.min(Math.abs(diffY) * cfg.aiReact, cfg.aiSpeed * dt);
    ai.y = Math.max(COURT.y, Math.min(ai.y, COURT.y + COURT.h - ai.h));

    // Move X (same speed, slightly less reactive)
    const diffX = this.targetX - ai.x;
    ai.x += Math.sign(diffX) * Math.min(Math.abs(diffX) * cfg.aiReact * 0.8, cfg.aiSpeed * dt);
    ai.x = Math.max(NET_X + 5, Math.min(ai.x, COURT.x + COURT.w - ai.w - 5));

    if (cfg.powerFreq > 0 && ball.vx > 0 && Math.random() < cfg.powerFreq * 0.008) {
      ai.powerLevel = 0.6 + Math.random() * 0.4;
    }
  }
}

// ─── PARTICLE SYSTEM ──────────────────────────────────────────────────────────
function spawnParticles(x, y, color, count, speedMult=1, type='circle') {
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = (1.5 + Math.random() * 3) * speedMult;
    particles.push({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 1,
      decay: 0.025 + Math.random() * 0.03,
      color: type === 'confetti' ? `hsl(${Math.random()*360},90%,60%)` : color,
      size: type === 'confetti' ? 4 + Math.random() * 5 : 2 + Math.random() * 3,
      type,
    });
  }
}
function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx * dt; p.y += p.vy * dt;
    p.vy += 0.08 * dt;
    p.life -= p.decay * dt;
    if (p.life <= 0) particles.splice(i, 1);
  }
}
function drawParticles() {
  particles.forEach(p => {
    ctx.save();
    ctx.globalAlpha = Math.max(0, p.life);
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });
}

// ─── GAME INIT ────────────────────────────────────────────────────────────────
function initGame() {
  pScore = 0; aScore = 0;
  server = 'player';
  rallyCurrent = 0; rallyMax = 0;
  playerHits = 0; playerFaults = 0;
  topSpeed = 0; scoresSaved = false;
  particles = [];
  aiCtrl = new AIController(currentLevel);
  initPoint();
  gameState = 'playing';
}

function initPoint() {
  const cfg = LEVELS[currentLevel];

  // Players start at their baselines (realistic serve position)
  player = {
    x: COURT.x + 15, y: MID_Y - 40,
    w: 14, h: 80, speed: 7,
    inKitchen: false,
    powerCharging: false, powerLevel: 0,
    hits: 0, faults: 0,
  };
  ai = {
    x: COURT.x + COURT.w - 15 - 14, y: MID_Y - 40,
    w: 14, h: 80,
    powerLevel: 0,
  };
  if (aiCtrl) {
    aiCtrl.targetY = MID_Y; aiCtrl.targetX = COURT.x + COURT.w - 80; aiCtrl.delayCounter = 0;
  }

  const fromPlayer = server === 'player';
  ball = {
    x: fromPlayer ? player.x + player.w + BALL_R + 2 : ai.x - BALL_R - 2,
    y: fromPlayer ? player.y + player.h / 2 : ai.y + ai.h / 2,
    vx: fromPlayer ? cfg.ballSpeed : -cfg.ballSpeed,
    vy: (Math.random() * 2 - 1) * 1.2,
    trail: [], spin: 0,
    inPlay: false,
    bouncedAiSide: false, bouncedPlayerSide: false,
    servePhase: 'serve',
    lastHit: server,
  };

  // In 2P mode, player2 replaces AI on the right side
  if (gameMode === '2p') {
    player2 = {
      x: COURT.x + COURT.w - 15 - 14, y: MID_Y - 40,
      w: 14, h: 80, speed: 7,
      inKitchen: false,
      powerCharging: false, powerLevel: 0,
    };
  } else {
    player2 = null;
  }

  aiServePending = false;
  if (server === 'ai' && gameMode === '1p') { serveTimer = 90; aiServePending = true; }
}

// ─── GAME LOGIC ───────────────────────────────────────────────────────────────
function update(dt) {
  if (gameState !== 'playing') return;

  const ps = player.speed * dt;
  // P1: WASD always; arrows only in 1P mode
  if (keys['w'] || keys['W'] || (gameMode === '1p' && keys['ArrowUp']))
    player.y = Math.max(COURT.y, player.y - ps);
  if (keys['s'] || keys['S'] || (gameMode === '1p' && keys['ArrowDown']))
    player.y = Math.min(COURT.y + COURT.h - player.h, player.y + ps);
  if (keys['a'] || keys['A'] || (gameMode === '1p' && keys['ArrowLeft']))
    player.x = Math.max(COURT.x, player.x - ps);
  if (keys['d'] || keys['D'] || (gameMode === '1p' && keys['ArrowRight']))
    player.x = Math.min(NET_X - player.w - 5, player.x + ps);

  player.inKitchen = (player.x + player.w) >= LK_X;
  if (player.inKitchen) kitchenFlashTimer = 30;

  // P2 movement (arrow keys, 2P mode only)
  if (gameMode === '2p' && player2) {
    const p2s = player2.speed * dt;
    if (keys['ArrowUp'])    player2.y = Math.max(COURT.y, player2.y - p2s);
    if (keys['ArrowDown'])  player2.y = Math.min(COURT.y + COURT.h - player2.h, player2.y + p2s);
    if (keys['ArrowLeft'])  player2.x = Math.max(NET_X + 5, player2.x - p2s);
    if (keys['ArrowRight']) player2.x = Math.min(COURT.x + COURT.w - player2.w - 5, player2.x + p2s);
    player2.inKitchen = player2.x <= RK_X;

    // P2 power charging (Enter key, ball coming toward P2)
    const p2BallOnSide = ball.vx > 0 || (server === 'ai' && !ball.inPlay);
    if (keys['Enter'] && p2BallOnSide) {
      player2.powerCharging = true;
      player2.powerLevel = Math.min(1, player2.powerLevel + 0.02 * dt);
      if (Math.random() < 0.1) snd.charge(player2.powerLevel);
    } else if (player2.powerCharging && !keys['Enter']) {
      player2.powerCharging = false;
    }

    // Ball sticks to P2 when P2 is serving
    if (!ball.inPlay && server === 'ai') {
      ball.x = player2.x - BALL_R - 2;
      ball.y = player2.y + player2.h / 2;
    }
  }

  // Ball sticks to server until served
  if (!ball.inPlay) {
    if (server === 'player') {
      ball.x = player.x + player.w + BALL_R + 2;
      ball.y = player.y + player.h / 2;
    } else if (gameMode === '1p') {
      ball.x = ai.x - BALL_R - 2;
      ball.y = ai.y + ai.h / 2;
    }
    // In 2P mode, P2 block above handles ball position when server === 'ai'
  }

  // Power charging (ball coming toward player, or pre-serve)
  const ballOnPlayerSide = ball.vx < 0 || (server === 'player' && !ball.inPlay);
  if (keys[' '] && ballOnPlayerSide) {
    if (!player.powerCharging) player.powerCharging = true;
    player.powerLevel = Math.min(1, player.powerLevel + 0.02 * dt);
    if (Math.random() < 0.1) snd.charge(player.powerLevel);
  } else if (player.powerCharging && !keys[' ']) {
    player.powerCharging = false;
  }

  if (aiServePending) {
    serveTimer -= dt;
    if (serveTimer <= 0) { ball.inPlay = true; aiServePending = false; snd.serve(); }
  }

  if (gameMode === '1p' && aiCtrl) aiCtrl.update(dt);
  if (!ball.inPlay) return;

  ball.trail.push({ x: ball.x, y: ball.y });
  if (ball.trail.length > 12) ball.trail.shift();

  ball.x += ball.vx * dt;
  ball.y += (ball.vy + ball.spin * 0.5) * dt;

  const px_mph = 0.8;
  const spd = Math.sqrt(ball.vx * ball.vx + ball.vy * ball.vy) * px_mph * 60;
  ball.speed = spd;
  if (spd > topSpeed) topSpeed = spd;

  if (ball.y - BALL_R < COURT.y) {
    ball.y = COURT.y + BALL_R; ball.vy = Math.abs(ball.vy) * 0.97; snd.wall();
  }
  if (ball.y + BALL_R > COURT.y + COURT.h) {
    ball.y = COURT.y + COURT.h - BALL_R; ball.vy = -Math.abs(ball.vy) * 0.97; snd.wall();
  }

  if (ball.x > NET_X && ball.lastHit === 'player') ball.bouncedAiSide = true;
  if (ball.x < NET_X && ball.lastHit === 'ai') ball.bouncedPlayerSide = true;

  if (ball.servePhase === 'serve' && ball.x > NET_X) ball.servePhase = 'first_bounce';
  else if (ball.servePhase === 'first_bounce' && ball.x < NET_X) ball.servePhase = 'second_bounce';
  else if (ball.servePhase === 'second_bounce') ball.servePhase = 'rally';

  if (ball.x - BALL_R < COURT.x) { awardPoint('ai'); return; }
  if (ball.x + BALL_R > COURT.x + COURT.w) { awardPoint('player'); return; }

  // Player paddle collision — generous hit zone to compensate visual offset
  const HIT = 8; // extra pixels of forgiveness
  if (ball.vx < 0 &&
      ball.x - BALL_R <= player.x + player.w + HIT &&
      ball.x + BALL_R >= player.x - HIT &&
      ball.y + BALL_R >= player.y - HIT &&
      ball.y - BALL_R <= player.y + player.h + HIT) {

    if (player.inKitchen && !ball.bouncedPlayerSide && ball.servePhase === 'rally') { kitchenFault(); return; }
    if (ball.servePhase === 'serve' && server === 'ai') { kitchenFault(); return; }

    const hitRel = (ball.y - (player.y + player.h / 2)) / (player.h / 2);
    const cfg = LEVELS[currentLevel];
    let newVx = Math.abs(ball.vx) * 1.04;
    const powerBoost = player.powerLevel > 0.1 ? 1 + player.powerLevel * 0.8 : 1;
    newVx = Math.min(newVx * powerBoost, 20);
    ball.vx = newVx;
    ball.vy = hitRel * cfg.ballSpeed * 1.5;
    ball.spin = hitRel * 0.4;
    ball.x = player.x + player.w + BALL_R + 1;
    ball.lastHit = 'player';
    ball.bouncedAiSide = false; ball.bouncedPlayerSide = false;
    rallyCurrent++; rallyMax = Math.max(rallyMax, rallyCurrent);
    playerHits++; player.hits++;
    if (powerBoost > 1.2) snd.powerHit(); else snd.hit();
    spawnParticles(player.x + player.w, ball.y, '#60a5fa', 10);
    player.powerLevel = 0; player.powerCharging = false;
  }

  // AI paddle collision
  if (ball.vx > 0 &&
      ball.x + BALL_R >= ai.x &&
      ball.x - BALL_R <= ai.x + ai.w &&
      ball.y + BALL_R >= ai.y &&
      ball.y - BALL_R <= ai.y + ai.h) {

    const hitRel = (ball.y - (ai.y + ai.h / 2)) / (ai.h / 2);
    const cfg = LEVELS[currentLevel];
    let newVx = Math.abs(ball.vx) * 1.04;
    const powerBoost = ai.powerLevel > 0.1 ? 1 + ai.powerLevel * 0.7 : 1;
    newVx = Math.min(newVx * powerBoost, 20);
    ball.vx = -newVx;
    ball.vy = hitRel * cfg.ballSpeed * 1.5;
    ball.spin = hitRel * -0.4;
    ball.x = ai.x - BALL_R - 1;
    ball.lastHit = 'ai';
    ball.bouncedAiSide = false; ball.bouncedPlayerSide = false;
    rallyCurrent++; rallyMax = Math.max(rallyMax, rallyCurrent);
    ai.powerLevel = 0;
    snd.hit();
    spawnParticles(ai.x, ball.y, '#f97316', 10);
  }

  // P2 human paddle collision (2P mode)
  if (gameMode === '2p' && player2 &&
      ball.vx > 0 &&
      ball.x + BALL_R >= player2.x - HIT &&
      ball.x - BALL_R <= player2.x + player2.w + HIT &&
      ball.y + BALL_R >= player2.y - HIT &&
      ball.y - BALL_R <= player2.y + player2.h + HIT) {

    if (player2.inKitchen && !ball.bouncedAiSide && ball.servePhase === 'rally') {
      snd.fault();
      spawnParticles(player2.x, player2.y + player2.h/2, '#ef4444', 20, 1.5);
      awardPoint('player');
      return;
    }
    const hitRel2 = (ball.y - (player2.y + player2.h / 2)) / (player2.h / 2);
    const cfg2 = LEVELS[currentLevel];
    let newVx2 = Math.abs(ball.vx) * 1.04;
    const pb2 = player2.powerLevel > 0.1 ? 1 + player2.powerLevel * 0.8 : 1;
    newVx2 = Math.min(newVx2 * pb2, 20);
    ball.vx = -newVx2;
    ball.vy = hitRel2 * cfg2.ballSpeed * 1.5;
    ball.spin = hitRel2 * -0.4;
    ball.x = player2.x - BALL_R - 1;
    ball.lastHit = 'ai';
    ball.bouncedAiSide = false; ball.bouncedPlayerSide = false;
    rallyCurrent++; rallyMax = Math.max(rallyMax, rallyCurrent);
    if (pb2 > 1.2) snd.powerHit(); else snd.hit();
    spawnParticles(player2.x, ball.y, '#f97316', 10);
    player2.powerLevel = 0; player2.powerCharging = false;
  }

  if (kitchenFlashTimer > 0) kitchenFlashTimer -= dt;
}

function kitchenFault() {
  playerFaults++; player.faults++;
  snd.fault();
  spawnParticles(player.x + player.w, player.y + player.h/2, '#ef4444', 20, 1.5);
  awardPoint('ai');
}

function awardPoint(winner) {
  rallyCurrent = 0;
  gameState = 'point_pause';
  setTimeout(() => {
    if (winner === 'player') {
      if (server === 'player') { pScore++; snd.point(); spawnParticles(NET_X, MID_Y, '#6366f1', 30, 1.2, 'confetti'); }
      else server = 'player';
    } else {
      if (server === 'ai') { aScore++; snd.point(); spawnParticles(NET_X, MID_Y, '#f97316', 30, 1.2, 'confetti'); }
      else server = 'ai';
    }
    if (checkWin()) return;
    initPoint(); gameState = 'playing';
  }, 800);
}

function checkWin() {
  const p = pScore, a = aScore;
  if ((p >= 11 || a >= 11) && Math.abs(p - a) >= 2) {
    const playerWon = p > a;
    if (playerWon && currentLevel < 5) {
      const prevMax = getMaxLevel();
      if (currentLevel >= prevMax) setMaxLevel(currentLevel + 1);
    }
    snd.gameOver(playerWon);
    spawnParticles(NET_X, MID_Y, playerWon ? '#6366f1' : '#f97316', 60, 1.5, 'confetti');
    setTimeout(() => showGameOver(playerWon), 400);
    return true;
  }
  return false;
}

function showGameOver(playerWon) {
  gameState = 'gameover';

  const modeLabel = gameMode === '2p' ? '2P' : '1P';
  const rightName = gameMode === '2p' ? player2Name : 'AI';
  const winnerName = playerWon ? playerName : rightName;
  const winColor = playerWon ? '#6366f1' : (gameMode === '2p' ? '#fb923c' : '#f97316');

  const newLevelUnlocked = playerWon && currentLevel < 5 && getMaxLevel() > currentLevel;
  const unlockMsg = newLevelUnlocked
    ? `<div style="color:#fbbf24;font-size:.9rem;margin-top:8px">🔓 Level ${currentLevel + 1} Unlocked!</div>`
    : '';
  document.getElementById('go-winner').innerHTML =
    `<span style="color:${winColor}">🏆 ${winnerName} Wins!</span>${unlockMsg}`;

  const accuracy = playerHits > 0 ? Math.round((playerHits / (playerHits + playerFaults)) * 100) : 0;
  document.getElementById('go-stats').innerHTML = `
    <div class="stat-card"><div class="stat-val">${pScore}-${aScore}</div><div class="stat-lbl">Final Score</div></div>
    <div class="stat-card"><div class="stat-val">${Math.round(topSpeed)}</div><div class="stat-lbl">Top Speed (mph)</div></div>
    <div class="stat-card"><div class="stat-val">${rallyMax}</div><div class="stat-lbl">Longest Rally</div></div>
    <div class="stat-card"><div class="stat-val">${accuracy}%</div><div class="stat-lbl">Accuracy</div></div>
  `;

  // Auto-save + collect rank notifications
  highlightedPlayers = [];
  const rankMsgs = [];
  const r1 = addScore(playerName, pScore, currentLevel, modeLabel);
  highlightedPlayers.push(playerName);
  if (r1.rank) rankMsgs.push(rankMsg(playerName, r1.rank, r1.total));
  if (gameMode === '2p') {
    const r2 = addScore(player2Name, aScore, currentLevel, modeLabel);
    highlightedPlayers.push(player2Name);
    if (r2.rank) rankMsgs.push(rankMsg(player2Name, r2.rank, r2.total));
  }
  scoresSaved = true;

  if (rankMsgs.length) {
    document.getElementById('go-stats').innerHTML += `
      <div class="stat-card" style="grid-column:1/-1;padding:10px 14px">
        <div style="color:#fbbf24;font-size:0.88rem;line-height:2">${rankMsgs.join('<br>')}</div>
        <div class="stat-lbl" style="margin-top:4px">Leaderboard Rank</div>
      </div>`;
  }

  renderLevelPills();
  showOverlay('gameover');
}

// ─── DRAWING ──────────────────────────────────────────────────────────────────
function draw() {
  ctx.clearRect(0, 0, CW, CH);
  ctx.fillStyle = '#0a1a10';
  ctx.fillRect(0, 0, CW, CH);

  drawCourt();
  drawParticles();
  if (ball) drawBallTrail();
  if (player) drawHumanCharacter(player, playerGender, player.inKitchen, true, playerName);
  if (gameMode === '2p' && player2) drawHumanCharacter(player2, player2Gender, player2.inKitchen, false, player2Name);
  else if (gameMode === '1p' && ai) drawAICharacter(ai);
  if (ball && (gameState === 'playing' || gameState === 'point_pause')) drawBall();
  drawHUD();
  drawKitchenWarning();
}

function drawCourt() {
  // Court surface gradient
  const grad = ctx.createLinearGradient(COURT.x, COURT.y, COURT.x, COURT.y + COURT.h);
  grad.addColorStop(0, '#1a4731');
  grad.addColorStop(0.5, '#1e5438');
  grad.addColorStop(1, '#1a4731');
  ctx.fillStyle = grad;
  ctx.fillRect(COURT.x, COURT.y, COURT.w, COURT.h);

  // Subtle court texture grid
  ctx.strokeStyle = 'rgba(255,255,255,0.025)';
  ctx.lineWidth = 1;
  for (let x = COURT.x; x <= COURT.x + COURT.w; x += 40) {
    ctx.beginPath(); ctx.moveTo(x, COURT.y); ctx.lineTo(x, COURT.y + COURT.h); ctx.stroke();
  }
  for (let y = COURT.y; y <= COURT.y + COURT.h; y += 40) {
    ctx.beginPath(); ctx.moveTo(COURT.x, y); ctx.lineTo(COURT.x + COURT.w, y); ctx.stroke();
  }

  // Kitchen highlights
  ctx.fillStyle = 'rgba(251,191,36,0.055)';
  ctx.fillRect(LK_X, COURT.y, KITCHEN_W, COURT.h);
  ctx.fillRect(NET_X, COURT.y, KITCHEN_W, COURT.h);

  // Vignette around outer court area
  const vg = ctx.createRadialGradient(CW/2, CH/2, COURT.w*0.3, CW/2, CH/2, CW*0.75);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,0.45)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, CW, CH);

  // Court lines
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.lineWidth = 2;
  ctx.strokeRect(COURT.x, COURT.y, COURT.w, COURT.h);

  // Service lines
  ctx.beginPath();
  ctx.moveTo(COURT.x, MID_Y); ctx.lineTo(LK_X, MID_Y);
  ctx.moveTo(RK_X, MID_Y); ctx.lineTo(COURT.x + COURT.w, MID_Y);
  ctx.stroke();

  // Kitchen lines (dashed)
  ctx.setLineDash([10, 6]);
  ctx.strokeStyle = 'rgba(255,255,255,0.6)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(LK_X, COURT.y); ctx.lineTo(LK_X, COURT.y + COURT.h);
  ctx.moveTo(RK_X, COURT.y); ctx.lineTo(RK_X, COURT.y + COURT.h);
  ctx.stroke();
  ctx.setLineDash([]);

  // NVZ labels
  ctx.font = '11px system-ui';
  ctx.fillStyle = 'rgba(251,191,36,0.5)';
  ctx.textAlign = 'center';
  ctx.fillText('NVZ', LK_X + KITCHEN_W / 2, COURT.y + 18);
  ctx.fillText('NVZ', NET_X + KITCHEN_W / 2, COURT.y + 18);

  // Net — gradient + mesh
  const netGrad = ctx.createLinearGradient(NET_X-3, 0, NET_X+3, 0);
  netGrad.addColorStop(0, '#9ca3af');
  netGrad.addColorStop(0.5, '#e5e7eb');
  netGrad.addColorStop(1, '#9ca3af');
  ctx.fillStyle = netGrad;
  ctx.fillRect(NET_X - 3, COURT.y, 6, COURT.h);
  ctx.strokeStyle = 'rgba(156,163,175,0.35)';
  ctx.lineWidth = 1;
  for (let y = COURT.y + 10; y < COURT.y + COURT.h; y += 14) {
    ctx.beginPath(); ctx.moveTo(NET_X - 3, y); ctx.lineTo(NET_X + 3, y); ctx.stroke();
  }
  // Net posts
  ctx.fillStyle = '#6b7280';
  ctx.beginPath(); ctx.roundRect(NET_X - 5, COURT.y - 12, 10, 16, 3); ctx.fill();
  ctx.beginPath(); ctx.roundRect(NET_X - 5, COURT.y + COURT.h - 4, 10, 16, 3); ctx.fill();
}

// ─── HUMAN CHARACTER (player) ─────────────────────────────────────────────────
function drawHumanCharacter(pad, gender, inKitchen, facingRight, name) {
  ctx.save();
  const dir = facingRight ? 1 : -1;
  const cy = pad.y + pad.h / 2;
  const handX = facingRight ? pad.x + pad.w + 2 : pad.x - 2;
  const bx = handX - dir * 22;

  const skin  = gender === 'female' ? '#f9c784' : '#f4a261';
  const hair  = gender === 'female' ? '#92400e' : '#1e3a5f';
  const shirt = inKitchen ? '#ef4444' : (gender === 'female' ? '#db2777' : '#2563eb');
  const pants = '#1e293b';
  const shoe  = '#111827';

  // SHOES
  ctx.fillStyle = shoe;
  ctx.beginPath(); ctx.ellipse(bx - dir*3, cy+32, 9, 5, 0, 0, Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(bx + dir*5, cy+30, 8, 4, 0, 0, Math.PI*2); ctx.fill();

  // LEGS
  ctx.strokeStyle = pants; ctx.lineWidth = 8; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(bx, cy+12); ctx.lineTo(bx - dir*3, cy+30); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(bx, cy+12); ctx.lineTo(bx + dir*5, cy+28); ctx.stroke();

  // SHORTS stripe
  ctx.fillStyle = shirt; ctx.globalAlpha = 0.4;
  ctx.fillRect(bx - 8, cy+10, 16, 8);
  ctx.globalAlpha = 1;

  // BODY
  const sw = gender === 'male' ? 22 : 17;
  ctx.fillStyle = shirt;
  ctx.beginPath();
  ctx.moveTo(bx - sw/2, cy - 14);
  ctx.lineTo(bx + sw/2, cy - 14);
  ctx.quadraticCurveTo(bx + sw/2 + 2, cy, bx + sw/2 - 2, cy + 12);
  ctx.lineTo(bx - sw/2 + 2, cy + 12);
  ctx.quadraticCurveTo(bx - sw/2 - 2, cy, bx - sw/2, cy - 14);
  ctx.fill();
  // shirt collar highlight
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.beginPath(); ctx.ellipse(bx, cy-12, 6, 3, 0, 0, Math.PI); ctx.fill();

  // BACK ARM
  ctx.strokeStyle = skin; ctx.lineWidth = 6; ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(bx - dir*(sw/2-2), cy-12);
  ctx.quadraticCurveTo(bx - dir*14, cy-2, bx - dir*12, cy+8);
  ctx.stroke();

  // PADDLE ARM
  ctx.strokeStyle = skin; ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.moveTo(bx + dir*(sw/2-2), cy-12);
  ctx.quadraticCurveTo(bx + dir*14, cy-8, handX, cy-6);
  ctx.stroke();

  // PADDLE handle
  ctx.strokeStyle = '#7c3aed'; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(handX, cy-6); ctx.lineTo(handX + dir*10, cy-11); ctx.stroke();
  // PADDLE face
  ctx.save();
  ctx.translate(handX + dir*17, cy-17);
  ctx.rotate(-dir * 0.38);
  const padGrad = ctx.createLinearGradient(-8,-15,8,15);
  padGrad.addColorStop(0, '#6366f1'); padGrad.addColorStop(1, '#4f46e5');
  ctx.fillStyle = padGrad;
  ctx.beginPath(); ctx.roundRect(-8,-16,16,24,4); ctx.fill();
  ctx.strokeStyle = '#312e81'; ctx.lineWidth = 1.5; ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = 1;
  for (let gi = -10; gi < 10; gi += 5) {
    ctx.beginPath(); ctx.moveTo(-8, gi); ctx.lineTo(8, gi); ctx.stroke();
  }
  ctx.restore();

  // NECK
  ctx.fillStyle = skin;
  ctx.beginPath(); ctx.roundRect(bx-4, cy-22, 8, 10, 3); ctx.fill();

  // HEAD
  const hr = 12;
  const hx = bx + dir*2, hy = cy - 30;
  ctx.beginPath(); ctx.arc(hx+2, hy+2, hr, 0, Math.PI*2);
  ctx.fillStyle = 'rgba(0,0,0,0.15)'; ctx.fill();
  ctx.beginPath(); ctx.arc(hx, hy, hr, 0, Math.PI*2);
  ctx.fillStyle = skin; ctx.fill();

  // HAIR
  ctx.fillStyle = hair;
  if (gender === 'female') {
    ctx.beginPath(); ctx.arc(hx, hy-2, hr, Math.PI*0.82, Math.PI*2.18); ctx.lineTo(hx, hy); ctx.fill();
    ctx.beginPath(); ctx.arc(hx - dir*hr*0.85, hy+1, 4, 0, Math.PI*2); ctx.fillStyle = skin; ctx.fill();
    ctx.strokeStyle = hair; ctx.lineWidth = 7; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(hx - dir*hr*0.7, hy-4);
    ctx.quadraticCurveTo(hx - dir*(hr+10), hy+6, hx - dir*(hr+5), hy+20);
    ctx.stroke();
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(hx - dir*(hr+5), hy+20);
    ctx.quadraticCurveTo(hx - dir*(hr+8), hy+28, hx - dir*(hr+2), hy+33);
    ctx.stroke();
  } else {
    ctx.beginPath(); ctx.arc(hx, hy-3, hr*0.95, Math.PI*0.88, Math.PI*2.12); ctx.fill();
    ctx.fillRect(hx - hr, hy-hr, hr*2, 9);
    ctx.beginPath(); ctx.arc(hx + dir*hr*0.88, hy+2, 4, 0, Math.PI*2); ctx.fillStyle = hair; ctx.fill();
  }

  // EAR
  ctx.fillStyle = skin;
  ctx.beginPath(); ctx.arc(hx - dir*hr, hy+1, 4, 0, Math.PI*2); ctx.fill();

  // EYES
  const ex = hx + dir*4;
  ctx.fillStyle = 'white';
  ctx.beginPath(); ctx.ellipse(ex, hy-1, 4, 3, 0, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = gender === 'female' ? '#7c3aed' : '#1e3a5f';
  ctx.beginPath(); ctx.arc(ex + dir*1, hy-1, 2.2, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = '#000';
  ctx.beginPath(); ctx.arc(ex + dir*1.5, hy-1.5, 1, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = 'white';
  ctx.beginPath(); ctx.arc(ex + dir*2, hy-2, 0.8, 0, Math.PI*2); ctx.fill();
  ctx.strokeStyle = hair; ctx.lineWidth = gender === 'female' ? 1.5 : 2; ctx.lineCap = 'round';
  ctx.beginPath();
  if (gender === 'female') { ctx.moveTo(ex-3, hy-7); ctx.quadraticCurveTo(ex, hy-9, ex+3, hy-7); }
  else { ctx.moveTo(ex-4, hy-6); ctx.lineTo(ex+3, hy-5); }
  ctx.stroke();

  // NOSE
  ctx.strokeStyle = 'rgba(0,0,0,0.2)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(ex + dir*1, hy+1); ctx.lineTo(ex + dir*3, hy+4); ctx.stroke();

  // MOUTH
  ctx.strokeStyle = gender === 'female' ? '#be185d' : '#92400e';
  ctx.lineWidth = 1.8; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.arc(ex, hy+6, 3.5, 0.1, Math.PI-0.1); ctx.stroke();
  ctx.strokeStyle = 'rgba(0,0,0,0.15)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(ex-3.5, hy+6); ctx.lineTo(ex+3.5, hy+6); ctx.stroke();

  // POWER CHARGE BAR
  if (pad.powerCharging && pad.powerLevel > 0.05) {
    const bw = 36, bh = 6;
    const barX = hx - bw/2, barY = hy - hr - 16;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.beginPath(); ctx.roundRect(barX-1, barY-1, bw+2, bh+2, 3); ctx.fill();
    const barGrad = ctx.createLinearGradient(barX, 0, barX+bw, 0);
    barGrad.addColorStop(0, '#fbbf24'); barGrad.addColorStop(0.6, '#f97316'); barGrad.addColorStop(1, '#ef4444');
    ctx.fillStyle = barGrad;
    ctx.beginPath(); ctx.roundRect(barX, barY, bw * pad.powerLevel, bh, 2); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.roundRect(barX, barY, bw, bh, 3); ctx.stroke();
    ctx.font = 'bold 8px system-ui'; ctx.textAlign = 'center';
    ctx.fillStyle = '#fff'; ctx.fillText('POWER', hx, barY - 3);
  }

  // PLAYER NAME
  ctx.font = 'bold 9px system-ui'; ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.fillText((name || 'YOU').substring(0, 10), hx, hy - hr - (pad.powerCharging ? 20 : 4));

  ctx.restore();
}

// ─── AI CHARACTER (robot) ─────────────────────────────────────────────────────
function drawAICharacter(pad) {
  ctx.save();
  const cy = pad.y + pad.h / 2;
  const handX = pad.x - 2;
  const bx = handX + 22;
  const metal = '#64748b', dark = '#334155', glow = '#f97316';

  // LEGS
  ctx.strokeStyle = dark; ctx.lineWidth = 8; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(bx, cy+12); ctx.lineTo(bx+3, cy+30); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(bx, cy+12); ctx.lineTo(bx-5, cy+28); ctx.stroke();
  ctx.fillStyle = '#94a3b8';
  ctx.beginPath(); ctx.arc(bx+3, cy+22, 4, 0, Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.arc(bx-5, cy+20, 4, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = dark;
  ctx.beginPath(); ctx.roundRect(bx-2, cy+28, 14, 7, 3); ctx.fill();
  ctx.beginPath(); ctx.roundRect(bx-14, cy+26, 13, 7, 3); ctx.fill();

  // BODY
  ctx.fillStyle = metal;
  ctx.beginPath(); ctx.roundRect(bx-13, cy-14, 26, 26, 6); ctx.fill();
  ctx.fillStyle = dark;
  ctx.beginPath(); ctx.roundRect(bx-9, cy-10, 18, 16, 4); ctx.fill();
  const coreGrad = ctx.createRadialGradient(bx, cy-2, 0, bx, cy-2, 8);
  coreGrad.addColorStop(0, '#fed7aa'); coreGrad.addColorStop(1, glow);
  ctx.fillStyle = coreGrad;
  ctx.beginPath(); ctx.arc(bx, cy-2, 6, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = '#475569';
  ctx.beginPath(); ctx.roundRect(bx-16, cy-16, 10, 8, 3); ctx.fill();
  ctx.beginPath(); ctx.roundRect(bx+6, cy-16, 10, 8, 3); ctx.fill();

  // BACK ARM
  ctx.strokeStyle = metal; ctx.lineWidth = 6; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(bx+12, cy-12); ctx.lineTo(bx+16, cy+4); ctx.stroke();
  ctx.fillStyle = '#94a3b8'; ctx.beginPath(); ctx.arc(bx+16, cy+6, 4, 0, Math.PI*2); ctx.fill();

  // PADDLE ARM
  ctx.strokeStyle = metal; ctx.lineWidth = 7;
  ctx.beginPath(); ctx.moveTo(bx-12, cy-12); ctx.lineTo(handX, cy-6); ctx.stroke();
  ctx.fillStyle = '#94a3b8'; ctx.beginPath(); ctx.arc(handX+4, cy-5, 5, 0, Math.PI*2); ctx.fill();

  // PADDLE
  ctx.strokeStyle = '#7c3aed'; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(handX, cy-6); ctx.lineTo(handX-10, cy-12); ctx.stroke();
  ctx.save();
  ctx.translate(handX-18, cy-18); ctx.rotate(0.38);
  const padG = ctx.createLinearGradient(-8,-15,8,15);
  padG.addColorStop(0, glow); padG.addColorStop(1, '#c2410c');
  ctx.fillStyle = padG;
  ctx.beginPath(); ctx.roundRect(-8,-16,16,24,4); ctx.fill();
  ctx.strokeStyle = '#7c2d12'; ctx.lineWidth = 1.5; ctx.stroke();
  ctx.restore();

  // HEAD
  const hx = bx-3, hy = cy-32;
  ctx.fillStyle = metal;
  ctx.beginPath(); ctx.roundRect(hx-15, hy-14, 30, 26, 6); ctx.fill();
  ctx.beginPath(); ctx.ellipse(hx, hy-14, 14, 8, 0, Math.PI, Math.PI*2); ctx.fill();
  const visorGrad = ctx.createLinearGradient(hx-10, hy-10, hx+10, hy+2);
  visorGrad.addColorStop(0, '#fed7aa'); visorGrad.addColorStop(1, glow);
  ctx.fillStyle = visorGrad; ctx.globalAlpha = 0.85;
  ctx.beginPath(); ctx.roundRect(hx-11, hy-9, 22, 12, 4); ctx.fill();
  ctx.globalAlpha = 1;
  ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(hx-10, hy-4); ctx.lineTo(hx+10, hy-4); ctx.stroke();
  ctx.fillStyle = dark;
  ctx.beginPath(); ctx.roundRect(hx-17, hy-6, 4, 8, 2); ctx.fill();
  ctx.beginPath(); ctx.roundRect(hx+13, hy-6, 4, 8, 2); ctx.fill();
  // Antenna
  ctx.strokeStyle = '#94a3b8'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(hx+6, hy-22); ctx.lineTo(hx+6, hy-14); ctx.stroke();
  ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(hx+6, hy-24, 3, 0, Math.PI*2); ctx.fill();
  // Antenna pulse glow
  const pulseAlpha = 0.3 + 0.2 * Math.sin(performance.now() / 300);
  ctx.globalAlpha = pulseAlpha;
  ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(hx+6, hy-24, 7, 0, Math.PI*2); ctx.fill();
  ctx.globalAlpha = 1;
  // AI label
  ctx.font = 'bold 9px system-ui'; ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(249,115,22,0.9)';
  ctx.fillText('A.I.', hx, hy - 28);

  ctx.restore();
}

// ─── BALL ─────────────────────────────────────────────────────────────────────
function drawBall() {
  ctx.save();
  ctx.beginPath(); ctx.arc(ball.x+3, ball.y+3, BALL_R, 0, Math.PI*2);
  ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fill();
  const bg = ctx.createRadialGradient(ball.x-2, ball.y-2, 1, ball.x, ball.y, BALL_R);
  bg.addColorStop(0, '#fef9c3'); bg.addColorStop(1, '#d97706');
  ctx.beginPath(); ctx.arc(ball.x, ball.y, BALL_R, 0, Math.PI*2);
  ctx.fillStyle = bg; ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  for (let i = 0; i < 6; i++) {
    const a = (i/6) * Math.PI * 2;
    ctx.beginPath(); ctx.arc(ball.x + Math.cos(a)*4, ball.y + Math.sin(a)*4, 1.4, 0, Math.PI*2); ctx.fill();
  }
  ctx.strokeStyle = '#92400e'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(ball.x, ball.y, BALL_R, 0, Math.PI*2); ctx.stroke();
  ctx.restore();
}

function drawBallTrail() {
  ball.trail.forEach((pos, i) => {
    const alpha = (i / ball.trail.length) * 0.35;
    const r = BALL_R * (i / ball.trail.length) * 0.7;
    ctx.save(); ctx.globalAlpha = alpha;
    ctx.beginPath(); ctx.arc(pos.x, pos.y, r, 0, Math.PI*2);
    ctx.fillStyle = '#fbbf24'; ctx.fill();
    ctx.restore();
  });
}

// ─── HUD ──────────────────────────────────────────────────────────────────────
function drawHUD() {
  if (gameState !== 'playing' && gameState !== 'point_pause') return;

  // Top bar — glassy rounded panel
  ctx.fillStyle = 'rgba(15,23,42,0.85)';
  ctx.beginPath(); ctx.roundRect(8, 6, CW-16, 28, 8); ctx.fill();
  ctx.strokeStyle = 'rgba(99,102,241,0.3)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.roundRect(8, 6, CW-16, 28, 8); ctx.stroke();

  const rightName = gameMode === '2p' ? player2Name : 'AI';
  const srvText = server === 'player' ? `▶ ${playerName} Serving` : `◀ ${rightName} Serving`;
  ctx.font = 'bold 13px system-ui'; ctx.textAlign = 'center';
  ctx.fillStyle = '#fbbf24'; ctx.fillText(srvText, CW/2, 24);

  ctx.textAlign = 'left'; ctx.font = 'bold 18px system-ui';
  ctx.fillStyle = '#60a5fa'; ctx.fillText(playerName, 18, 25);
  ctx.fillStyle = '#f1f5f9'; ctx.fillText(` ${pScore}`, 18 + ctx.measureText(playerName).width, 25);

  ctx.textAlign = 'right'; ctx.fillStyle = '#fb923c';
  ctx.fillText(`${aScore} ${rightName}`, CW-18, 25);

  // Bottom bar — glassy rounded panel
  ctx.fillStyle = 'rgba(15,23,42,0.8)';
  ctx.beginPath(); ctx.roundRect(8, CH-28, CW-16, 22, 7); ctx.fill();
  ctx.strokeStyle = 'rgba(99,102,241,0.2)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.roundRect(8, CH-28, CW-16, 22, 7); ctx.stroke();

  ctx.font = '11px system-ui'; ctx.textAlign = 'left'; ctx.fillStyle = '#94a3b8';
  ctx.fillText(`  ⚡ ${ball ? Math.round(ball.speed || 0) : 0} mph`, 0, CH-13);
  ctx.textAlign = 'center';
  ctx.fillText(`Rally: ${rallyCurrent}  |  Best: ${rallyMax}`, CW/2, CH-13);
  ctx.textAlign = 'right';
  ctx.fillText(`${LEVELS[currentLevel].label}: ${LEVELS[currentLevel].subLabel}  `, CW, CH-13);
}

function drawKitchenWarning() {
  if (kitchenFlashTimer <= 0) return;
  const alpha = Math.min(1, kitchenFlashTimer/15) * 0.7;
  ctx.save(); ctx.globalAlpha = alpha;
  ctx.fillStyle = '#ef4444';
  ctx.fillRect(COURT.x, COURT.y, KITCHEN_W, COURT.h);
  ctx.globalAlpha = 1;
  ctx.font = 'bold 14px system-ui'; ctx.textAlign = 'center'; ctx.fillStyle = '#fff';
  ctx.fillText('KITCHEN!', LK_X - KITCHEN_W/2 + KITCHEN_W, MID_Y);
  ctx.restore();
}

// ─── GAME LOOP ────────────────────────────────────────────────────────────────
function gameLoop(timestamp) {
  const dt = Math.min((timestamp - lastTime) / 16.67, 3);
  lastTime = timestamp;
  update(dt); updateParticles(dt); draw();
  requestAnimationFrame(gameLoop);
}

// ─── OVERLAY MANAGEMENT ───────────────────────────────────────────────────────
function showOverlay(name) {
  document.querySelectorAll('.overlay').forEach(o => o.classList.remove('active'));
  const el = document.getElementById(`overlay-${name}`);
  if (el) el.classList.add('active');
}
function hideAllOverlays() {
  document.querySelectorAll('.overlay').forEach(o => o.classList.remove('active'));
}

// ─── LEADERBOARD ──────────────────────────────────────────────────────────────
function getLeaderboard() {
  try { return JSON.parse(localStorage.getItem('pb_leaderboard') || '[]'); } catch(e) { return []; }
}
function saveLeaderboard(lb) { localStorage.setItem('pb_leaderboard', JSON.stringify(lb)); }
function addScore(name, score, level, mode) {
  const lb = getLeaderboard();
  const entry = { name, score, level: `Lvl ${level}`, mode: mode || '1P', date: new Date().toLocaleDateString() };
  lb.push(entry);
  lb.sort((a, b) => b.score - a.score);
  const rank = lb.indexOf(entry) + 1;
  const trimmed = lb.slice(0, 10);
  saveLeaderboard(trimmed);
  return { rank: rank <= 10 ? rank : null, total: trimmed.length };
}

function rankMsg(name, rank, total) {
  const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : '🏅';
  return `${medal} ${name}: Rank #${rank} of ${total}`;
}
function renderLeaderboard(highlightNames) {
  const lb = getLeaderboard();
  const body = document.getElementById('lb-body');
  if (!lb.length) {
    body.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#64748b;padding:20px">No scores yet</td></tr>';
    return;
  }
  const hn = new Set(highlightNames || []);
  body.innerHTML = lb.map((e, i) => {
    const rankClass = i===0?'rank-1':i===1?'rank-2':i===2?'rank-3':'';
    const hl = hn.has(e.name) ? ' style="background:rgba(99,102,241,0.2)"' : '';
    const marker = hn.has(e.name) ? ' 👈' : '';
    return `<tr${hl}>
      <td class="${rankClass}">${i===0?'🥇':i===1?'🥈':i===2?'🥉':i+1}</td>
      <td>${e.name}${marker}</td><td>${e.score}</td>
      <td>${e.level || '—'}</td><td>${e.mode || '—'}</td>
    </tr>`;
  }).join('');
}

// ─── BUTTON WIRING ────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // Mode pills (1P / 2P)
  document.querySelectorAll('[data-mode]').forEach(p => {
    p.addEventListener('click', () => {
      gameMode = p.dataset.mode;
      document.querySelectorAll('[data-mode]').forEach(b =>
        b.classList.toggle('active', b.dataset.mode === gameMode));
      document.getElementById('p2config').style.display = gameMode === '2p' ? 'block' : 'none';
    });
  });

  // P1 gender pills
  document.querySelectorAll('[data-gender]').forEach(p => {
    p.addEventListener('click', () => {
      playerGender = p.dataset.gender;
      document.querySelectorAll('[data-gender]').forEach(b =>
        b.classList.toggle('active', b.dataset.gender === playerGender));
    });
  });

  // P2 gender pills
  document.querySelectorAll('[data-p2gender]').forEach(p => {
    p.addEventListener('click', () => {
      player2Gender = p.dataset.p2gender;
      document.querySelectorAll('[data-p2gender]').forEach(b =>
        b.classList.toggle('active', b.dataset.p2gender === player2Gender));
    });
  });

  // Level pills (initial render)
  renderLevelPills();

  // Menu Play
  document.getElementById('btnPlay').addEventListener('click', () => {
    playerName = document.getElementById('playerName').value.trim() || 'Player 1';
    if (gameMode === '2p') {
      player2Name = document.getElementById('player2Name').value.trim() || 'Player 2';
    }
    hideAllOverlays(); initGame();
  });
  document.getElementById('btnLeaderboard').addEventListener('click', () => {
    renderLeaderboard(); prevFrom = 'menu'; showOverlay('leaderboard');
  });
  document.getElementById('btnSettings').addEventListener('click', () => {
    document.getElementById('settingsName').value = playerName;
    prevFrom = 'menu'; showOverlay('settings');
  });

  // Pause
  document.getElementById('btnResume').addEventListener('click', () => { gameState = 'playing'; hideAllOverlays(); });
  document.getElementById('btnRestartP').addEventListener('click', () => { hideAllOverlays(); initGame(); });
  document.getElementById('btnSettingsP').addEventListener('click', () => {
    document.getElementById('settingsName').value = playerName;
    prevFrom = 'pause'; showOverlay('settings');
  });
  document.getElementById('btnMenuP').addEventListener('click', () => {
    gameState = 'menu'; renderLevelPills(); showOverlay('menu');
  });

  // Gameover
  document.getElementById('btnSaveScore').addEventListener('click', () => {
    renderLeaderboard(highlightedPlayers);
    prevFrom = 'gameover';
    showOverlay('leaderboard');
  });
  document.getElementById('btnPlayAgain').addEventListener('click', () => { hideAllOverlays(); initGame(); });
  document.getElementById('btnMenuGO').addEventListener('click', () => {
    gameState = 'menu'; renderLevelPills(); showOverlay('menu');
  });

  // Leaderboard
  document.getElementById('btnClearLB').addEventListener('click', () => {
    localStorage.removeItem('pb_leaderboard'); renderLeaderboard();
  });
  document.getElementById('btnMenuLB').addEventListener('click', () => {
    if (prevFrom === 'pause') { gameState = 'paused'; showOverlay('pause'); }
    else if (prevFrom === 'gameover') showOverlay('gameover');
    else showOverlay('menu');
  });

  // Settings
  document.getElementById('soundToggle').addEventListener('change', e => { soundEnabled = e.target.checked; });
  document.getElementById('btnBackSettings').addEventListener('click', () => {
    playerName = document.getElementById('settingsName').value.trim() || 'Player 1';
    document.getElementById('playerName').value = playerName;
    if (prevFrom === 'pause') { gameState = 'paused'; showOverlay('pause'); }
    else showOverlay('menu');
  });

  // Keyboard
  document.addEventListener('keydown', e => {
    keys[e.key] = true;
    if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' ','Enter'].includes(e.key)) e.preventDefault();
    if (e.key === 'p' || e.key === 'P' || e.key === 'Escape') {
      if (gameState === 'playing') { gameState = 'paused'; showOverlay('pause'); }
      else if (gameState === 'paused') { gameState = 'playing'; hideAllOverlays(); }
    }
    if (e.key === ' ' && gameState === 'playing' && server === 'player' && ball && !ball.inPlay) {
      ball.inPlay = true; snd.serve();
    }
    if (e.key === 'Enter' && gameMode === '2p' && gameState === 'playing' && server === 'ai' && ball && !ball.inPlay) {
      ball.inPlay = true; snd.serve();
    }
  });
  document.addEventListener('keyup', e => { keys[e.key] = false; });

  // Touch
  let touchStartY = 0;
  canvas.addEventListener('touchstart', e => { touchStartY = e.touches[0].clientY; e.preventDefault(); }, { passive:false });
  canvas.addEventListener('touchmove', e => {
    const dy = e.touches[0].clientY - touchStartY;
    touchStartY = e.touches[0].clientY;
    if (gameState === 'playing' && player)
      player.y = Math.max(COURT.y, Math.min(player.y + dy / (window.innerHeight/CH), COURT.y + COURT.h - player.h));
    e.preventDefault();
  }, { passive:false });

  // Start
  setTimeout(() => { document.getElementById('loading').classList.add('hidden'); }, 900);
  requestAnimationFrame(ts => { lastTime = ts; requestAnimationFrame(gameLoop); });
});
