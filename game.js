// ---------- Captain Go: 3D chase-cam lane runner (Three.js) ----------
const canvas = document.getElementById('game');
const scoreEl = document.getElementById('score-val');
const playerHealthFillEl = document.getElementById('player-health-fill');
const levelValEl = document.getElementById('level-val');
const ringValEl = document.getElementById('ring-val');
const startScreen = document.getElementById('start-screen');
const endScreen = document.getElementById('end-screen');
const endTitle = document.getElementById('end-title');
const endMsg = document.getElementById('end-msg');
const exitFillEl = document.getElementById('exit-fill');
const cookieValEl = document.getElementById('cookie-val');
const chamberMapEl = document.getElementById('chamber-map');
const stickerPop = document.getElementById('sticker-pop');
const stickerPopArt = document.getElementById('sticker-pop-art');
const stickerPopName = document.getElementById('sticker-pop-name');
const stickerBookEl = document.getElementById('sticker-book');
const bookCountEl = document.getElementById('book-count');
const shatterEl = document.getElementById('shatter');
const flashEl = document.getElementById('flash');
const trophyShelfEl = document.getElementById('trophy-shelf');
const swipeHint = document.getElementById('swipe-hint');
const levelBanner = document.getElementById('level-banner');
const pauseBtn = document.getElementById('pause-btn');
const pauseScreen = document.getElementById('pause-screen');
const kickBtn = document.getElementById('kick-btn');

let state = 'start'; // start | playing | win | lose

// ---------- constants ----------
const LANES_X = [2.4, 0, -2.4]; // index 0/1/2 = screen-left/center/right (camera faces +Z, mirroring world X)
const FORWARD_SPEED = 17;
const SPEED_PER_LEVEL = 0.85;
const MAX_FORWARD_SPEED = 24.5;
const JUMP_V = 11.4;
const GRAVITY = 26;
const CRATE_HEIGHT = 1.06;  // matches the treasure chest's actual mesh height (1.10)
const SLIDE_DURATION = 0.55;
const HIT_RANGE = 1.1;
// forgiveness: collectibles reach further than hazards, so near-misses still reward
const PICKUP_RANGE = 1.7;
const HAZARD_RANGE = 0.95;
const FIRE_CLEAR_Y = 0.9;   // flames reach ~0.70, so clearing them is generous
const KICK_DURATION = 0.42;
const KICK_COOLDOWN = 0.34;
const KICK_RANGE = 2.5;     // upgraded reach - lands well before contact
// Obstacle stone is fixed rather than per-theme so it always contrasts the light floor
const OBSTACLE_ROCK = 0x5c5249;
const OBSTACLE_ROCK_DEEP = 0x3b342e;
const OBSTACLE_EDGE = 0xe8d8b0;
const MAGNET_RANGE = 3.2;   // bananas drift toward the runner inside this distance
const FINISH_Z = 262;
const ROAD_LEN = FINISH_Z + 40;
const PLAYER_MAX_HEALTH = 20;
const HEART_HEAL_AMOUNT = 6;
// slide crouch tuning, calibrated so the runner's head clears the duck-under ledges
const SLIDE_SQUASH = 0.74;
const SLIDE_FOOT_LIFT = 0.23;
const CAMERA_HEIGHT = 3.0;
const CAMERA_DISTANCE = 7.6;

// ---------- sound (synthesized, no external assets) ----------
const AudioCtx = window.AudioContext || window.webkitAudioContext;
const actx = new AudioCtx();
function ensureAudio() { if (actx.state === 'suspended') actx.resume(); }

function tone(freq, dur, type, vol, delay, glideTo) {
  const t0 = actx.currentTime + (delay || 0);
  const osc = actx.createOscillator();
  const gain = actx.createGain();
  osc.type = type || 'square';
  osc.frequency.setValueAtTime(freq, t0);
  if (glideTo) osc.frequency.exponentialRampToValueAtTime(glideTo, t0 + dur);
  gain.gain.setValueAtTime(vol || 0.15, t0);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(gain).connect(actx.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.03);
}
function noiseBurst(dur, vol) {
  const size = Math.max(1, Math.floor(actx.sampleRate * dur));
  const buffer = actx.createBuffer(1, size, actx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < size; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / size);
  const src = actx.createBufferSource();
  src.buffer = buffer;
  const gain = actx.createGain();
  gain.gain.setValueAtTime(vol || 0.2, actx.currentTime);
  src.connect(gain).connect(actx.destination);
  src.start();
}
const sfx = {
  ring: () => tone(1046, 0.08, 'sine', 0.12, 0, 1568),
  cookie: () => { [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.16, 'sine', 0.13, i * 0.06)); },
  sticker: () => { [659, 880, 1046, 1318, 1568].forEach((f, i) => tone(f, 0.2, 'triangle', 0.13, i * 0.055)); },
  shatter: () => {
    // sharp crack, then a scatter of high tinkling fragments
    noiseBurst(0.05, 0.2);
    tone(2600, 0.07, 'triangle', 0.11, 0, 1700);
    [0, 0.05, 0.09, 0.14, 0.2, 0.27, 0.34].forEach((d, i) => {
      tone(1500 + Math.random() * 1700, 0.16, 'sine', 0.075 - i * 0.006, d);
    });
    noiseBurst(0.22, 0.07);
  },
  kick: () => { noiseBurst(0.1, 0.1); tone(420, 0.13, 'triangle', 0.1, 0, 780); },
  smash: () => { noiseBurst(0.26, 0.26); tone(140, 0.28, 'sawtooth', 0.16, 0, 55); },
  jump: () => tone(400, 0.12, 'triangle', 0.1, 0, 700),
  slide: () => tone(220, 0.1, 'triangle', 0.08, 0, 110),
  damage: () => { tone(300, 0.16, 'triangle', 0.13, 0, 150); tone(180, 0.2, 'sine', 0.1, 0.04, 110); },
  heal: () => { tone(523, 0.14, 'sine', 0.14, 0, 784); tone(659, 0.16, 'sine', 0.12, 0.08, 988); },
  levelUp: () => { [0, 0.12, 0.24, 0.36].forEach((d, i) => tone(392 * (i + 1) / 1.5, 0.2, 'square', 0.12, d)); },
  gameOver: () => { [500, 400, 300, 200].forEach((f, i) => tone(f, 0.25, 'sawtooth', 0.15, i * 0.15)); },
};

// ---------- level theme data ----------
// 15 chambers. Palettes are authored; obstacle/pickup layouts are generated
// from a per-level seed by makeLayout() below, which guarantees hazard spacing
// and keeps every pickup clear of hazards.
const THEMES = [
  { name: 'Temple Gate', skyTop: 0x2a1a0c, skyBottom: 0xe0953c, fog: 0x9c7444,
    groundTint: 0x9d968c, plankTint: 0xdcd2c2, rock: 0x7d7264,
    hemiSky: 0xffcf8a, hemiGround: 0x5a3a18, sunColor: 0xffd08a,
    stoneTint: 0xc4a878, idolTint: 0xd8b45a, torchColor: 0xff9a2a },
  { name: 'Idol Hall', skyTop: 0x140c06, skyBottom: 0x6a3f18, fog: 0x4a3826,
    groundTint: 0x7d766c, plankTint: 0xded3bf, rock: 0x5f584c,
    hemiSky: 0xd8a066, hemiGround: 0x2a1a0a, sunColor: 0xffb45a,
    stoneTint: 0xa08760, idolTint: 0xe0c070, torchColor: 0xff8c1a },
  { name: 'Crystal Cavern', skyTop: 0x04121f, skyBottom: 0x1f5f7a, fog: 0x1b4658,
    groundTint: 0x7d8a92, plankTint: 0xd6e2ea, rock: 0x46545e,
    hemiSky: 0x8fd8f0, hemiGround: 0x0e2430, sunColor: 0xbfe8ff,
    stoneTint: 0x8fa3ae, idolTint: 0x7fe4ff, torchColor: 0x49c8ff,
    propAccent: 'crystal' },
  { name: 'Lava Vault', skyTop: 0x1a0603, skyBottom: 0xc03a10, fog: 0x77341c,
    groundTint: 0x756055, plankTint: 0xdcc6b8, rock: 0x4d3a34,
    hemiSky: 0xff7a3a, hemiGround: 0x3a1206, sunColor: 0xff8a4a,
    stoneTint: 0x7a5442, idolTint: 0xffa050, torchColor: 0xff5a1a },
  { name: 'Flooded Cistern', skyTop: 0x061613, skyBottom: 0x2a6b62, fog: 0x1d4b46,
    groundTint: 0x6f8480, plankTint: 0xd4e2dc, rock: 0x3f5450,
    hemiSky: 0x86ded0, hemiGround: 0x102a26, sunColor: 0xc8f4ec,
    stoneTint: 0x8ba39c, idolTint: 0x6fe0c0, torchColor: 0x3ad0b0,
    water: true },
  { name: 'Golden Treasury', skyTop: 0x30200a, skyBottom: 0xf0c050, fog: 0xb08c3a,
    groundTint: 0xada08a, plankTint: 0xf0e2c0, rock: 0x8a7846,
    hemiSky: 0xffe8a8, hemiGround: 0x6a5218, sunColor: 0xfff0c0,
    stoneTint: 0xd8c08a, idolTint: 0xffd23a, torchColor: 0xffc23a },
  { name: 'Collapsing Sanctum', skyTop: 0x0a0710, skyBottom: 0x4a2a5a, fog: 0x2f2436,
    groundTint: 0x7b7580, plankTint: 0xdcd4da, rock: 0x494150,
    hemiSky: 0xc0a0d8, hemiGround: 0x1a1018, sunColor: 0xffd8a0,
    stoneTint: 0x8e7a76, idolTint: 0xffd479, torchColor: 0xffc23a },
  { name: 'Sky Terrace', skyTop: 0x2b7fd0, skyBottom: 0xd8f0ff, fog: 0xbfe4f5,
    groundTint: 0xc0bcae, plankTint: 0xefe6d2, rock: 0x9a9282,
    hemiSky: 0xdff2ff, hemiGround: 0x8a8270, sunColor: 0xfffaf0,
    stoneTint: 0xd8cdb4, idolTint: 0xffd86a, torchColor: 0xffb03a,
    openSky: true },
  { name: 'Amber Halls', skyTop: 0x2a1604, skyBottom: 0xdc9a26, fog: 0x9a6a24,
    groundTint: 0xa89878, plankTint: 0xf2e0bc, rock: 0x6f5a34,
    hemiSky: 0xffdc96, hemiGround: 0x4a3210, sunColor: 0xffdc9a,
    stoneTint: 0xcfb078, idolTint: 0xffcf50, torchColor: 0xffa32a },
  { name: 'Obsidian Steps', skyTop: 0x05040a, skyBottom: 0x2e1c46, fog: 0x241634,
    groundTint: 0x8c8698, plankTint: 0xe0dae8, rock: 0x2e2838,
    hemiSky: 0xb49ce0, hemiGround: 0x140f1e, sunColor: 0xe0d4ff,
    stoneTint: 0x9c94a8, idolTint: 0xc9a6ff, torchColor: 0xa878ff },
  { name: 'Sunken Grotto', skyTop: 0x04141c, skyBottom: 0x1e7088, fog: 0x1a5566,
    groundTint: 0x7f9298, plankTint: 0xd8ecf2, rock: 0x3c5660,
    hemiSky: 0x92e2f2, hemiGround: 0x0c2830, sunColor: 0xcaf2ff,
    stoneTint: 0x94aeb6, idolTint: 0x74e8e0, torchColor: 0x40d8e8,
    water: true },
  { name: 'Emerald Vault', skyTop: 0x061a0c, skyBottom: 0x2f8a44, fog: 0x24603a,
    groundTint: 0x84947e, plankTint: 0xdcecd4, rock: 0x39543c,
    hemiSky: 0x9ae8a8, hemiGround: 0x102a16, sunColor: 0xd6f7cf,
    stoneTint: 0x9ab092, idolTint: 0x8cf0a0, torchColor: 0x54e07a,
    propAccent: 'crystal' },
  { name: 'Ivory Gallery', skyTop: 0x2a2620, skyBottom: 0xe8dcc4, fog: 0xb8ac96,
    groundTint: 0xbcb6a6, plankTint: 0xf6f0e2, rock: 0x8e8676,
    hemiSky: 0xfff4e0, hemiGround: 0x6a6252, sunColor: 0xfffaf2,
    stoneTint: 0xe0d6c0, idolTint: 0xffe9a8, torchColor: 0xffc266 },
  { name: 'Storm Terrace', skyTop: 0x1c2a3a, skyBottom: 0x9ab4c8, fog: 0x7d94a6,
    groundTint: 0xa8aeb4, plankTint: 0xe4eaee, rock: 0x5c6670,
    hemiSky: 0xcfe0ea, hemiGround: 0x46505a, sunColor: 0xe8f2f8,
    stoneTint: 0xbcc4ca, idolTint: 0xdce8f0, torchColor: 0x7fd0ff,
    openSky: true },
  { name: 'Golden Summit', skyTop: 0x1f6fc8, skyBottom: 0xffe9b8, fog: 0xe0c890,
    groundTint: 0xcabf9e, plankTint: 0xfaf0d4, rock: 0xa08c5c,
    hemiSky: 0xfff2cc, hemiGround: 0x8a7648, sunColor: 0xfffdf4,
    stoneTint: 0xe6d4a2, idolTint: 0xffd23a, torchColor: 0xffbe3a,
    openSky: true },
];

// small deterministic PRNG so a chamber's layout is identical every playthrough
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const HAZARD_MIN_GAP = 15;   // never place two hazards closer than this
const PICKUP_CLEARANCE = 6;  // pickups stay this far from any hazard

function makeLayout(levelIndex) {
  const rnd = mulberry32(1337 + levelIndex * 7919);
  const difficulty = Math.min(1, levelIndex / (THEMES.length - 1));
  const first = 30, last = FINISH_Z - 26;

  // ---- hazards, one lane each, spaced so two never stack up
  const kinds = ['crate', 'gap', 'bar', 'fire'];
  const hazards = [];
  let z = first;
  let k = levelIndex % kinds.length;
  while (z < last) {
    // later chambers pack them a little tighter
    const kind = kinds[k % kinds.length];
    hazards.push({ kind, z: Math.round(z), lane: Math.floor(rnd() * 3) });
    k += 1 + (rnd() < 0.35 ? 1 : 0);
    z += HAZARD_MIN_GAP + 5 + rnd() * 8 - difficulty * 3;
  }

  const hazardAt = (zz) => hazards.filter(h => Math.abs(h.z - zz) < PICKUP_CLEARANCE);
  const freeLane = (zz, r) => {
    const taken = new Set(hazardAt(zz).map(h => h.lane));
    const open = [0, 1, 2].filter(l => !taken.has(l));
    return open[Math.floor(r() * open.length)] ?? 1;
  };

  // ---- clear stretches between consecutive hazards become pickup slots
  const slots = [];
  for (let i = 0; i < hazards.length - 1; i++) {
    const a = hazards[i].z, b = hazards[i + 1].z;
    if (b - a >= 14) slots.push(Math.round((a + b) / 2));
  }
  // a couple of slots before the first hazard and after the last
  slots.unshift(Math.round(first / 2));
  slots.push(Math.round(last + 12));

  const used = new Set();
  const takeSlot = () => {
    for (let i = 0; i < slots.length; i++) {
      const idx = Math.floor(rnd() * slots.length);
      if (!used.has(idx)) { used.add(idx); return slots[idx]; }
    }
    for (let i = 0; i < slots.length; i++) if (!used.has(i)) { used.add(i); return slots[i]; }
    return slots[0];
  };

  // ---- pickups: stickers and cookies first so they get the roomiest slots
  const stickers = [];
  for (let i = 0; i < 2; i++) {
    const sz = takeSlot();
    stickers.push([sz, freeLane(sz, rnd)]);
  }
  const cookies = [];
  for (let i = 0; i < (levelIndex % 3 === 2 ? 3 : 2); i++) {
    const cz = takeSlot();
    cookies.push([cz, freeLane(cz, rnd)]);
  }
  const hearts = [];
  for (let i = 0; i < 3; i++) {
    const hz = takeSlot();
    hearts.push([hz, freeLane(hz, rnd)]);
  }
  // ---- bananas fill the remaining slots, three in a row each
  const rings = [];
  slots.forEach((sz, idx) => {
    if (used.has(idx)) return;
    const lane = freeLane(sz, rnd);
    [-3, 0, 3].forEach(off => rings.push([sz + off, lane]));
  });

  return {
    crates: hazards.filter(h => h.kind === 'crate').map(h => ({ z: h.z, lane: h.lane })),
    bars:   hazards.filter(h => h.kind === 'bar').map(h => ({ z: h.z, lane: h.lane })),
    gaps:   hazards.filter(h => h.kind === 'gap').map(h => ({ z: h.z, lane: h.lane })),
    enemies:hazards.filter(h => h.kind === 'fire').map(h => ({ z: h.z, lane: h.lane })),
    rings, hearts, cookies, stickers,
  };
}

const LEVEL_DATA = THEMES.map((theme, i) => ({ theme, ...makeLayout(i) }));

// ---------- runtime progress state ----------
let level = 1;
let score = 0;
let ringCount = 0;
let cookieCount = 0;
let forwardSpeed = FORWARD_SPEED;
let camShake = 0;        // decays after a bump
let landSquash = 0;      // decays after touching down
let wasOnGround = true;  // to detect the landing frame
let sparkles = [];       // short-lived pickup burst particles
let playerSquashY = 1;   // slide squash, kept off the mesh so land squash can stack
let kickBtnReady = true; // tracks the button's dim state so we only touch the DOM on change

// ---------- game state ----------
const player = {
  laneIndex: 1, x: LANES_X[1], y: 0, z: 0, vy: 0, onGround: true,
  sliding: false, slideTimer: 0,
  health: PLAYER_MAX_HEALTH, maxHealth: PLAYER_MAX_HEALTH, invuln: 0, runCycle: 0,
  kicking: false, kickTimer: 0, kickCd: 0,
};
let crates = [];
let bars = [];
let gaps = [];
let enemies = [];
let rings = [];
let heartPickups = [];
let cookies = [];
let stickerPickups = [];

// ---------- input: swipe gestures ----------
function shiftLane(dir) {
  player.laneIndex = Math.max(0, Math.min(2, player.laneIndex + dir));
}
function tryJump() {
  if (player.onGround && !player.sliding) { player.vy = JUMP_V; player.onGround = false; sfx.jump(); }
}
function trySlide() {
  if (player.onGround && !player.sliding) { player.sliding = true; player.slideTimer = SLIDE_DURATION; sfx.slide(); }
}
function tryKick() {
  if (!player.onGround || player.sliding || player.kicking || player.kickCd > 0) return;
  player.kicking = true;
  player.kickTimer = KICK_DURATION;
  player.kickCd = KICK_DURATION + KICK_COOLDOWN;
  sfx.kick();
}
function dismissHint() {
  if (!swipeHint.classList.contains('hidden')) swipeHint.classList.add('hidden');
}

let touchStart = null;
canvas.addEventListener('pointerdown', e => { ensureAudio(); touchStart = { x: e.clientX, y: e.clientY }; });
window.addEventListener('pointerup', e => {
  if (!touchStart) return;
  const dx = e.clientX - touchStart.x;
  const dy = e.clientY - touchStart.y;
  touchStart = null;
  if (state !== 'playing') return;
  const absX = Math.abs(dx), absY = Math.abs(dy);
  if (Math.max(absX, absY) < 30) { dismissHint(); tryKick(); return; }
  dismissHint();
  if (absX > absY) shiftLane(dx > 0 ? 1 : -1);
  else if (dy < 0) tryJump();
  else trySlide();
});

window.addEventListener('keydown', e => {
  if (['p', 'P', 'Escape'].includes(e.key) && !e.repeat) { togglePause(); return; }
  if (state !== 'playing') return;
  if (['ArrowLeft', 'a', 'A'].includes(e.key) && !e.repeat) { shiftLane(-1); dismissHint(); }
  if (['ArrowRight', 'd', 'D'].includes(e.key) && !e.repeat) { shiftLane(1); dismissHint(); }
  if (['ArrowUp', 'w', 'W'].includes(e.key) && !e.repeat) { tryJump(); dismissHint(); }
  if (['ArrowDown', 's', 'S'].includes(e.key) && !e.repeat) { trySlide(); dismissHint(); }
  if ([' ', 'Spacebar', 'k', 'K'].includes(e.key) && !e.repeat) { e.preventDefault(); tryKick(); dismissHint(); }
});

// ---------- three.js setup ----------
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
if ('outputColorSpace' in renderer) renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xbfe8ff, 55, 155);

const camera = new THREE.PerspectiveCamera(68, 1, 0.1, 500);

function makeSkyTexture(topHex, bottomHex) {
  const c = document.createElement('canvas');
  c.width = 2; c.height = 256;
  const ctx = c.getContext('2d');
  const top = new THREE.Color(topHex), mid = new THREE.Color(topHex).lerp(new THREE.Color(bottomHex), 0.6), bot = new THREE.Color(bottomHex);
  const grad = ctx.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, `#${top.getHexString()}`);
  grad.addColorStop(0.55, `#${mid.getHexString()}`);
  grad.addColorStop(1, `#${bot.getHexString()}`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 2, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ---------- floating dust motes (temple air) ----------
function makeDustTexture() {
  const c = document.createElement('canvas');
  c.width = 32; c.height = 32;
  const ctx = c.getContext('2d');
  const grad = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
  grad.addColorStop(0, 'rgba(255,240,200,1)');
  grad.addColorStop(0.4, 'rgba(255,230,170,0.7)');
  grad.addColorStop(1, 'rgba(255,220,150,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 32, 32);
  return new THREE.CanvasTexture(c);
}
const DUST_COUNT = 420;
const dustPositions = new Float32Array(DUST_COUNT * 3);
for (let i = 0; i < DUST_COUNT; i++) {
  dustPositions[i * 3] = (Math.random() - 0.5) * 36;
  dustPositions[i * 3 + 1] = 0.4 + Math.random() * 11;
  dustPositions[i * 3 + 2] = Math.random() * (ROAD_LEN + 40) - 20;
}
const dustGeo = new THREE.BufferGeometry();
dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPositions, 3));
const dustField = new THREE.Points(dustGeo, new THREE.PointsMaterial({
  size: 0.16, map: makeDustTexture(), transparent: true, opacity: 0.85,
  depthWrite: false, sizeAttenuation: true, blending: THREE.AdditiveBlending,
}));
scene.add(dustField);

// ---------- lighting ----------
const hemiLight = new THREE.HemisphereLight(0xbfe3ff, 0x4c7a35, 0.7);
scene.add(hemiLight);
const sun = new THREE.DirectionalLight(0xfff2d8, 1.4);
sun.castShadow = true;
sun.shadow.mapSize.set(1536, 1536);
sun.shadow.camera.left = -20;
sun.shadow.camera.right = 20;
sun.shadow.camera.top = 20;
sun.shadow.camera.bottom = -20;
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 80;
sun.shadow.bias = -0.0015;
const sunTarget = new THREE.Object3D();
scene.add(sunTarget);
sun.target = sunTarget;
scene.add(sun);

function applyTheme(theme) {
  scene.background = makeSkyTexture(theme.skyTop, theme.skyBottom);
  scene.fog.color.set(theme.fog);
  hemiLight.color.set(theme.hemiSky);
  hemiLight.groundColor.set(theme.hemiGround);
  sun.color.set(theme.sunColor);
}

function resize() {
  const w = canvas.clientWidth || window.innerWidth;
  const h = canvas.clientHeight || window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);

// ---------- procedural textures ----------
// carved stone tiles for the temple walkway
function makeTempleTileTexture() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 256;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#a2988a';
  ctx.fillRect(0, 0, 256, 256);
  const tileH = 64;
  for (let y = 0; y < 256; y += tileH) {
    for (let x = 0; x < 256; x += 128) {
      const off = (y / tileH) % 2 ? 64 : 0;
      const tx = (x + off) % 256;
      const v = 160 + Math.random() * 26 - 13;
      ctx.fillStyle = `rgb(${v},${v * 0.95},${v * 0.87})`;
      ctx.fillRect(tx + 3, y + 3, 128 - 6, tileH - 6);
      // chiselled bevel highlight + shadow
      ctx.strokeStyle = 'rgba(255,248,236,0.32)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(tx + 4, y + tileH - 5); ctx.lineTo(tx + 4, y + 4); ctx.lineTo(tx + 122, y + 4); ctx.stroke();
      ctx.strokeStyle = 'rgba(52,44,34,0.5)';
      ctx.beginPath(); ctx.moveTo(tx + 123, y + 5); ctx.lineTo(tx + 123, y + tileH - 4); ctx.lineTo(tx + 5, y + tileH - 4); ctx.stroke();
    }
  }
  // weathering speckle
  for (let i = 0; i < 1400; i++) {
    ctx.fillStyle = Math.random() > 0.5 ? 'rgba(92,82,68,0.18)' : 'rgba(226,218,206,0.16)';
    ctx.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping; tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// rougher flagstone for the ground flanking the walkway
function makeFlagstoneTexture() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 256;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#544f49';
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 26; i++) {
    const x = Math.random() * 256, y = Math.random() * 256;
    const w = 26 + Math.random() * 46, h = 20 + Math.random() * 36;
    const v = 108 + Math.random() * 40 - 20;
    ctx.fillStyle = `rgb(${v},${v * 0.97},${v * 0.91})`;
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = 'rgba(45,32,18,0.5)';
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, w, h);
  }
  for (let i = 0; i < 2400; i++) {
    ctx.fillStyle = Math.random() > 0.5 ? 'rgba(28,26,22,0.24)' : 'rgba(178,172,164,0.13)';
    ctx.fillRect(Math.random() * 256, Math.random() * 256, 2, 3);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping; tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const templeTileTex = makeTempleTileTexture();
templeTileTex.repeat.set(1, 8);
const flagstoneTex = makeFlagstoneTexture();
flagstoneTex.repeat.set(4, ROAD_LEN / 6);

// ---------- disposal helpers ----------
function disposeObject(obj) {
  obj.traverse(o => {
    if (o.isMesh) {
      o.geometry.dispose();
      if (Array.isArray(o.material)) o.material.forEach(m => m.dispose());
      else o.material.dispose();
    }
  });
}
function clearList(list) {
  list.forEach(m => { scene.remove(m); disposeObject(m); });
  return [];
}

// ---------- world (road/grass/scenery/backdrop) rebuilt per level ----------
let roadMeshes = [];
let grassMeshes = [];
let treeMeshes = [];
let bgPropMeshes = [];
let torchLights = []; // {light, flame, phase} - animated each frame for flicker

// roadside temple prop: carved pillar, brazier torch, or idol head
// `variant` cycles so the corridor reads as built architecture, not scatter
function makeTempleProp(x, z, theme, variant, torchLights) {
  const g = new THREE.Group();
  const stoneMat = new THREE.MeshStandardMaterial({ color: theme.stoneTint, roughness: 0.92 });
  const darkStoneMat = new THREE.MeshStandardMaterial({ color: theme.rock, roughness: 0.95 });
  const goldMat = new THREE.MeshStandardMaterial({ color: theme.idolTint, roughness: 0.35, metalness: 0.75 });
  const faceIn = x < 0 ? 1 : -1; // props face the walkway

  if (variant === 0) {
    // fluted pillar with stepped base and capital
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.35, 1.5), darkStoneMat);
    base.position.y = 0.17; g.add(base);
    const base2 = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.25, 1.25), stoneMat);
    base2.position.y = 0.46; g.add(base2);
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.44, 0.5, 4.4, 12), stoneMat);
    shaft.position.y = 2.78; g.add(shaft);
    for (let i = 0; i < 8; i++) {
      const ang = (i / 8) * Math.PI * 2;
      const flute = new THREE.Mesh(new THREE.BoxGeometry(0.07, 4.2, 0.07), darkStoneMat);
      flute.position.set(Math.cos(ang) * 0.47, 2.78, Math.sin(ang) * 0.47);
      g.add(flute);
    }
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.07, 8, 16), goldMat);
    band.position.y = 3.6; band.rotation.x = Math.PI / 2; g.add(band);
    const capital = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.42, 1.3), stoneMat);
    capital.position.y = 5.2; g.add(capital);
  } else if (variant === 1) {
    // brazier on a plinth, with a live flame + point light
    const plinth = new THREE.Mesh(new THREE.BoxGeometry(0.95, 1.5, 0.95), stoneMat);
    plinth.position.y = 0.75; g.add(plinth);
    const rim = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.16, 1.1), darkStoneMat);
    rim.position.y = 1.56; g.add(rim);
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.44, 0.26, 0.4, 12), goldMat);
    bowl.position.y = 1.82; g.add(bowl);
    const glowMat = new THREE.MeshStandardMaterial({
      color: theme.torchColor, emissive: theme.torchColor, emissiveIntensity: 2.6,
      transparent: true, opacity: 0.92,
    });
    let flame;
    if (theme.propAccent === 'crystal') {
      // a cluster of lit shards instead of an open flame
      flame = new THREE.Group();
      for (let i = 0; i < 5; i++) {
        const ang = (i / 5) * Math.PI * 2;
        const shard = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.5 + (i % 2) * 0.3, 5), glowMat);
        shard.position.set(Math.cos(ang) * 0.17, 0.1 + (i % 2) * 0.1, Math.sin(ang) * 0.17);
        shard.rotation.set(Math.sin(ang) * 0.28, 0, -Math.cos(ang) * 0.28);
        flame.add(shard);
      }
      const spire = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.8, 6), glowMat);
      spire.position.y = 0.28;
      flame.add(spire);
      flame.position.y = 2.24;
      g.add(flame);
    } else {
      flame = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.85, 8), glowMat);
      flame.position.y = 2.4;
      g.add(flame);
      const emberMat = new THREE.MeshStandardMaterial({ color: 0xfff0b0, emissive: 0xffd070, emissiveIntensity: 2.2 });
      const ember = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.42, 6), emberMat);
      ember.position.y = 2.3;
      g.add(ember);
    }
    // one real light per brazier, budgeted by the caller
    if (torchLights.length < 6) {
      const light = new THREE.PointLight(theme.torchColor, 2.4, 22, 2);
      light.position.set(0, 2.5, 0);
      g.add(light);
      torchLights.push({ light, flame, phase: Math.random() * 6.28 });
    } else {
      torchLights.push({ light: null, flame, phase: Math.random() * 6.28 });
    }
  } else {
    // idol head on a block, turned to watch the runner
    const block = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.1, 1.3), darkStoneMat);
    block.position.y = 0.55; g.add(block);
    const step = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.2, 1.5), stoneMat);
    step.position.y = 1.16; g.add(step);
    const head = new THREE.Mesh(new THREE.BoxGeometry(1.15, 1.3, 1.0), stoneMat);
    head.position.y = 1.95; g.add(head);
    const brow = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.22, 0.16), darkStoneMat);
    brow.position.set(0, 2.28, faceIn * 0.52); g.add(brow);
    [-0.28, 0.28].forEach(ex => {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 8), goldMat);
      eye.position.set(ex, 2.02, faceIn * 0.48);
      g.add(eye);
    });
    const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.14, 0.12), darkStoneMat);
    mouth.position.set(0, 1.6, faceIn * 0.5); g.add(mouth);
    // headdress fins
    [-1, 1].forEach(s => {
      const fin = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.9, 0.8), goldMat);
      fin.position.set(s * 0.68, 2.35, 0);
      fin.rotation.z = s * 0.22;
      g.add(fin);
    });
  }
  g.position.set(x, 0, z);
  return g;
}

// distant backdrop: stepped ziggurat silhouettes closing in the corridor
function makeZigguratBackdrop(x, z, scale, theme) {
  const g = new THREE.Group();
  const farMat = new THREE.MeshStandardMaterial({ color: theme.rock, roughness: 1 });
  let w = 9 * scale;
  let y = 0;
  for (let tier = 0; tier < 5; tier++) {
    const h = 2.2 * scale;
    const step = new THREE.Mesh(new THREE.BoxGeometry(w, h, w * 0.8), farMat);
    step.position.y = y + h / 2;
    g.add(step);
    y += h;
    w *= 0.76;
  }
  const shrine = new THREE.Mesh(new THREE.BoxGeometry(w * 1.1, 1.4 * scale, w * 0.9), new THREE.MeshStandardMaterial({ color: theme.idolTint, roughness: 0.5, metalness: 0.5 }));
  shrine.position.y = y + 0.7 * scale;
  g.add(shrine);
  g.position.set(x, 0, z);
  return g;
}

function buildRoadForLevel(levelGaps, theme) {
  roadMeshes = clearList(roadMeshes);
  grassMeshes = clearList(grassMeshes);
  treeMeshes = clearList(treeMeshes);
  bgPropMeshes = clearList(bgPropMeshes);
  torchLights = [];

  const rockMat = new THREE.MeshStandardMaterial({ color: theme.rock, roughness: 1 });
  const rockBase = new THREE.Mesh(new THREE.BoxGeometry(8.2, 0.3, ROAD_LEN), rockMat);
  rockBase.position.set(0, -0.35, ROAD_LEN / 2 - 10);
  rockBase.receiveShadow = true;
  scene.add(rockBase); roadMeshes.push(rockBase);

  // slight self-lit floor: guarantees the walkway stays lighter than the
  // obstacles no matter how dim the chamber's lighting is
  const plankMat = new THREE.MeshStandardMaterial({
    map: templeTileTex, roughness: 0.85, color: theme.plankTint,
    emissive: new THREE.Color(theme.plankTint).multiplyScalar(0.22),
  });
  const LANE_W = 2.15;
  const roadStart = -10, roadEnd = ROAD_LEN - 10;
  LANES_X.forEach((lx, laneIdx) => {
    const laneGaps = levelGaps.filter(g => g.lane === laneIdx)
      .map(g => ({ start: g.z - 2.2, end: g.z + 2.2 }))
      .sort((a, b) => a.start - b.start);
    let cursor = roadStart;
    laneGaps.forEach(gr => {
      if (gr.start > cursor) addPlankSegment(lx, cursor, gr.start);
      cursor = Math.max(cursor, gr.end);
    });
    if (cursor < roadEnd) addPlankSegment(lx, cursor, roadEnd);
  });
  function addPlankSegment(lx, zStart, zEnd) {
    const len = zEnd - zStart;
    if (len <= 0.1) return;
    const seg = new THREE.Mesh(new THREE.BoxGeometry(LANE_W, 0.4, len), plankMat);
    seg.position.set(lx, -0.2, zStart + len / 2);
    seg.receiveShadow = true;
    scene.add(seg); roadMeshes.push(seg);
  }

  const floorMat = new THREE.MeshStandardMaterial({ map: flagstoneTex, color: theme.groundTint, roughness: 1 });
  [-9, 9].forEach(x => {
    const floor = new THREE.Mesh(new THREE.BoxGeometry(10, 0.3, ROAD_LEN), floorMat);
    floor.position.set(x, -0.25, ROAD_LEN / 2 - 10);
    floor.receiveShadow = true;
    scene.add(floor); grassMeshes.push(floor);
  });

  // temple walls running the length of the corridor
  const wallMat = new THREE.MeshStandardMaterial({ color: theme.rock, roughness: 0.95 });
  const wallH = theme.openSky ? 1.4 : 14;
  [-13.6, 13.6].forEach(x => {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(1.6, wallH, ROAD_LEN), wallMat);
    wall.position.set(x, wallH / 2, ROAD_LEN / 2 - 10);
    wall.receiveShadow = true;
    scene.add(wall); roadMeshes.push(wall);
  });

  // shallow water flanking the causeway
  if (theme.water) {
    const waterMat = new THREE.MeshStandardMaterial({
      color: 0x2f8f88, roughness: 0.12, metalness: 0.35,
      transparent: true, opacity: 0.72,
    });
    [-9, 9].forEach(x => {
      const water = new THREE.Mesh(new THREE.BoxGeometry(10, 0.06, ROAD_LEN), waterMat);
      water.position.set(x, 0.02, ROAD_LEN / 2 - 10);
      scene.add(water); roadMeshes.push(water);
    });
  }

  // alternating pillars / braziers / idols down both sides
  let variant = 0;
  for (let z = -5; z < ROAD_LEN; z += 9) {
    const p1 = makeTempleProp(-7.4, z, theme, variant % 3, torchLights);
    const p2 = makeTempleProp(7.4, z + 4.5, theme, (variant + 1) % 3, torchLights);
    castAll(p1); castAll(p2);
    scene.add(p1, p2);
    treeMeshes.push(p1, p2);
    variant++;
  }

  // distant ziggurats beyond the walls
  for (let z = -10; z < ROAD_LEN; z += 46) {
    const b1 = makeZigguratBackdrop(-30 - Math.random() * 8, z + Math.random() * 10, 0.9 + Math.random() * 0.5, theme);
    const b2 = makeZigguratBackdrop(30 + Math.random() * 8, z + 20 + Math.random() * 10, 0.9 + Math.random() * 0.5, theme);
    scene.add(b1, b2);
    bgPropMeshes.push(b1, b2);
  }

  // the exit: a gold-trimmed doorway with daylight spilling through
  const gate = new THREE.Group();
  const gateStoneMat = new THREE.MeshStandardMaterial({ color: theme.stoneTint, roughness: 0.9 });
  const gateGoldMat = new THREE.MeshStandardMaterial({ color: theme.idolTint, roughness: 0.3, metalness: 0.8 });
  [-3.3, 3.3].forEach(x => {
    const post = new THREE.Mesh(new THREE.BoxGeometry(1.5, 8, 1.5), gateStoneMat);
    post.position.set(x, 4, 0);
    gate.add(post);
    const trim = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.4, 1.7), gateGoldMat);
    trim.position.set(x, 7.9, 0);
    gate.add(trim);
  });
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(8.4, 1.5, 1.7), gateStoneMat);
  lintel.position.set(0, 8.6, 0);
  gate.add(lintel);
  const lintelTrim = new THREE.Mesh(new THREE.BoxGeometry(8.6, 0.35, 1.85), gateGoldMat);
  lintelTrim.position.set(0, 7.75, 0);
  gate.add(lintelTrim);
  // daylight panel behind the doorway
  const daylight = new THREE.Mesh(new THREE.PlaneGeometry(6.2, 7.6), new THREE.MeshBasicMaterial({
    color: 0xfff2c8, transparent: true, opacity: 0.92, side: THREE.DoubleSide,
  }));
  daylight.position.set(0, 3.9, 0.9);
  gate.add(daylight);
  const gateGlow = new THREE.PointLight(0xffe0a0, 3.2, 40, 2);
  gateGlow.position.set(0, 4, 2.5);
  gate.add(gateGlow);
  gate.position.set(0, 0, FINISH_Z + 4);
  castAll(gate);
  scene.add(gate);
  bgPropMeshes.push(gate);
}

// ---------- runner builder (player) ----------
function castAll(obj) {
  obj.traverse(o => { if (o.isMesh) { o.castShadow = true; } });
  return obj;
}

// Nested joint rig so the run cycle can bend at knees and elbows.
// Hierarchy: g > {hips > legs > knees, torso > {head, arms > elbows}}
function buildRunner(scale) {
  const g = new THREE.Group();
  const skinMat = new THREE.MeshStandardMaterial({ color: 0xd9a074, roughness: 0.72 });
  const skinShadeMat = new THREE.MeshStandardMaterial({ color: 0xc08a60, roughness: 0.75 });
  const hairMat = new THREE.MeshStandardMaterial({ color: 0x2e1c10, roughness: 0.85 });
  const shirtMat = new THREE.MeshStandardMaterial({ color: 0x1aa596, roughness: 0.7 });
  const shirtTrimMat = new THREE.MeshStandardMaterial({ color: 0xef7d1a, roughness: 0.65 });
  const shortsMat = new THREE.MeshStandardMaterial({ color: 0xe0701a, roughness: 0.72 });
  const shoeMat = new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.6 });
  const soleMat = new THREE.MeshStandardMaterial({ color: 0x2b2b2b, roughness: 0.8 });
  const shoeAccentMat = new THREE.MeshStandardMaterial({ color: 0x1aa596, roughness: 0.6 });

  // ===== hips: pelvis + both legs, rotates for pelvic drive =====
  const hips = new THREE.Group();
  hips.position.y = 1.13 * scale;
  g.add(hips);

  const pelvis = new THREE.Mesh(new THREE.SphereGeometry(0.23 * scale, 14, 10), shortsMat);
  pelvis.scale.set(1.12, 0.82, 0.85);
  hips.add(pelvis);

  const legL = new THREE.Group(); legL.position.set(-0.115 * scale, -0.03 * scale, 0);
  const legR = new THREE.Group(); legR.position.set(0.115 * scale, -0.03 * scale, 0);
  const knees = [];
  [legL, legR].forEach(hip => {
    const quad = new THREE.Mesh(new THREE.CapsuleGeometry(0.098 * scale, 0.24 * scale, 6, 10), shortsMat);
    quad.position.y = -0.16 * scale;
    hip.add(quad);
    const thighSkin = new THREE.Mesh(new THREE.CapsuleGeometry(0.082 * scale, 0.13 * scale, 6, 10), skinMat);
    thighSkin.position.y = -0.36 * scale;
    hip.add(thighSkin);

    // knee joint - everything below flexes here
    const knee = new THREE.Group();
    knee.position.y = -0.47 * scale;
    hip.add(knee);
    knees.push(knee);

    const kneeCap = new THREE.Mesh(new THREE.SphereGeometry(0.076 * scale, 10, 8), skinMat);
    knee.add(kneeCap);
    const calf = new THREE.Mesh(new THREE.CapsuleGeometry(0.072 * scale, 0.28 * scale, 6, 10), skinMat);
    calf.scale.set(1, 1, 1.15);
    calf.position.set(0, -0.18 * scale, -0.012 * scale);
    knee.add(calf);
    const ankle = new THREE.Mesh(new THREE.SphereGeometry(0.052 * scale, 8, 8), skinMat);
    ankle.position.y = -0.36 * scale;
    knee.add(ankle);
    const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.125 * scale, 0.085 * scale, 0.2 * scale), shoeMat);
    shoe.position.set(0, -0.415 * scale, 0.035 * scale);
    knee.add(shoe);
    const toe = new THREE.Mesh(new THREE.SphereGeometry(0.066 * scale, 10, 8), shoeMat);
    toe.scale.set(0.95, 0.62, 1.0);
    toe.position.set(0, -0.415 * scale, 0.13 * scale);
    knee.add(toe);
    const sole = new THREE.Mesh(new THREE.BoxGeometry(0.135 * scale, 0.032 * scale, 0.29 * scale), soleMat);
    sole.position.set(0, -0.455 * scale, 0.05 * scale);
    knee.add(sole);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.14 * scale, 0.03 * scale, 0.07 * scale), shoeAccentMat);
    stripe.position.set(0, -0.395 * scale, 0.075 * scale);
    knee.add(stripe);

    hips.add(hip);
  });

  // ===== torso: pivots at the hips so leaning bends the spine, not the feet =====
  const torso = new THREE.Group();
  torso.position.y = 1.18 * scale;
  g.add(torso);

  const waist = new THREE.Mesh(new THREE.CylinderGeometry(0.235 * scale, 0.225 * scale, 0.3 * scale, 14), shirtMat);
  waist.position.y = 0.19 * scale;
  torso.add(waist);
  const ribcage = new THREE.Mesh(new THREE.SphereGeometry(0.3 * scale, 16, 12), shirtMat);
  ribcage.scale.set(1.08, 1.15, 0.78);
  ribcage.position.set(0, 0.51 * scale, 0.01 * scale);
  torso.add(ribcage);
  [-1, 1].forEach(s => {
    const delt = new THREE.Mesh(new THREE.SphereGeometry(0.135 * scale, 12, 10), shirtMat);
    delt.scale.set(1, 0.9, 0.9);
    delt.position.set(s * 0.29 * scale, 0.67 * scale, 0);
    torso.add(delt);
  });
  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.15 * scale, 0.042 * scale, 8, 16), shirtTrimMat);
  collar.position.y = 0.8 * scale;
  collar.rotation.x = Math.PI / 2;
  torso.add(collar);
  const hem = new THREE.Mesh(new THREE.TorusGeometry(0.235 * scale, 0.035 * scale, 8, 16), shirtTrimMat);
  hem.position.y = 0.05 * scale;
  hem.rotation.x = Math.PI / 2;
  torso.add(hem);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.088 * scale, 0.105 * scale, 0.17 * scale, 12), skinMat);
  neck.position.y = 0.88 * scale;
  torso.add(neck);
  const traps = new THREE.Mesh(new THREE.SphereGeometry(0.19 * scale, 12, 8), shirtMat);
  traps.scale.set(1.3, 0.42, 0.8);
  traps.position.set(0, 0.75 * scale, -0.02 * scale);
  torso.add(traps);

  // ===== head: own pivot at the neck so it can steady itself while running =====
  const head = new THREE.Group();
  head.position.y = 0.97 * scale;
  torso.add(head);

  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.235 * scale, 20, 18), skinMat);
  skull.scale.set(0.94, 1.06, 1.0);
  skull.position.y = 0.17 * scale;
  head.add(skull);
  const jaw = new THREE.Mesh(new THREE.SphereGeometry(0.185 * scale, 14, 12), skinMat);
  jaw.scale.set(0.92, 0.78, 0.95);
  jaw.position.set(0, 0.04 * scale, 0.025 * scale);
  head.add(jaw);
  const chin = new THREE.Mesh(new THREE.SphereGeometry(0.075 * scale, 10, 8), skinMat);
  chin.scale.set(1.1, 0.85, 0.9);
  chin.position.set(0, -0.05 * scale, 0.15 * scale);
  head.add(chin);
  [-1, 1].forEach(s => {
    const cheek = new THREE.Mesh(new THREE.SphereGeometry(0.072 * scale, 10, 8), skinMat);
    cheek.scale.set(0.9, 0.8, 0.7);
    cheek.position.set(s * 0.135 * scale, 0.12 * scale, 0.15 * scale);
    head.add(cheek);
  });
  [-1, 1].forEach(s => {
    const ear = new THREE.Mesh(new THREE.SphereGeometry(0.052 * scale, 10, 8), skinShadeMat);
    ear.scale.set(0.45, 1.05, 0.85);
    ear.position.set(s * 0.222 * scale, 0.15 * scale, -0.005 * scale);
    head.add(ear);
  });
  const brow = new THREE.Mesh(new THREE.BoxGeometry(0.235 * scale, 0.035 * scale, 0.055 * scale), hairMat);
  brow.position.set(0, 0.245 * scale, 0.195 * scale);
  head.add(brow);
  const noseBridge = new THREE.Mesh(new THREE.BoxGeometry(0.045 * scale, 0.12 * scale, 0.05 * scale), skinMat);
  noseBridge.position.set(0, 0.17 * scale, 0.215 * scale);
  head.add(noseBridge);
  const noseTip = new THREE.Mesh(new THREE.SphereGeometry(0.042 * scale, 10, 8), skinMat);
  noseTip.position.set(0, 0.115 * scale, 0.235 * scale);
  head.add(noseTip);
  [-1, 1].forEach(s => {
    const eyeWhite = new THREE.Mesh(new THREE.SphereGeometry(0.052 * scale, 12, 10), new THREE.MeshStandardMaterial({ color: 0xf8f8f8, roughness: 0.35 }));
    eyeWhite.scale.set(1, 0.82, 0.6);
    eyeWhite.position.set(s * 0.093 * scale, 0.195 * scale, 0.192 * scale);
    head.add(eyeWhite);
    const iris = new THREE.Mesh(new THREE.SphereGeometry(0.026 * scale, 10, 8), new THREE.MeshStandardMaterial({ color: 0x4a2c14, roughness: 0.3 }));
    iris.position.set(s * 0.093 * scale, 0.192 * scale, 0.222 * scale);
    head.add(iris);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.012 * scale, 8, 6), new THREE.MeshStandardMaterial({ color: 0x140c06 }));
    pupil.position.set(s * 0.093 * scale, 0.192 * scale, 0.238 * scale);
    head.add(pupil);
  });
  const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.062 * scale, 0.019 * scale, 8, 14, Math.PI * 0.9), new THREE.MeshStandardMaterial({ color: 0x8a3a34, roughness: 0.5 }));
  mouth.position.set(0, 0.03 * scale, 0.185 * scale);
  mouth.rotation.z = Math.PI;
  head.add(mouth);
  const hairCap = new THREE.Mesh(new THREE.SphereGeometry(0.245 * scale, 18, 14, 0, Math.PI * 2, 0, Math.PI / 2.05), hairMat);
  hairCap.scale.set(0.97, 1.0, 1.02);
  hairCap.position.set(0, 0.18 * scale, -0.008 * scale);
  head.add(hairCap);
  const fringe = new THREE.Mesh(new THREE.SphereGeometry(0.2 * scale, 14, 10, 0, Math.PI, 0, Math.PI / 2.4), hairMat);
  fringe.scale.set(1.12, 0.6, 1.0);
  fringe.position.set(0, 0.285 * scale, 0.055 * scale);
  fringe.rotation.y = -Math.PI / 2;
  head.add(fringe);
  for (let i = 0; i < 5; i++) {
    const t = (i / 4) - 0.5;
    const lock = new THREE.Mesh(new THREE.SphereGeometry(0.062 * scale, 8, 6), hairMat);
    lock.scale.set(0.85, 0.55, 0.85);
    lock.position.set(t * 0.3 * scale, (0.34 - Math.abs(t) * 0.12) * scale, 0.02 * scale);
    head.add(lock);
  }

  // ===== arms: shoulder pivot -> bicep -> elbow joint -> forearm/hand =====
  const armL = new THREE.Group(); armL.position.set(-0.295 * scale, 0.67 * scale, 0);
  const armR = new THREE.Group(); armR.position.set(0.295 * scale, 0.67 * scale, 0);
  const elbows = [];
  [[armL, -1], [armR, 1]].forEach(([shoulder, side]) => {
    const bicep = new THREE.Mesh(new THREE.CapsuleGeometry(0.072 * scale, 0.2 * scale, 6, 10), skinMat);
    bicep.position.y = -0.16 * scale;
    shoulder.add(bicep);
    const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.088 * scale, 0.082 * scale, 0.14 * scale, 12), shirtMat);
    sleeve.position.y = -0.07 * scale;
    shoulder.add(sleeve);

    const elbow = new THREE.Group();
    elbow.position.y = -0.29 * scale;
    shoulder.add(elbow);
    elbows.push(elbow);

    const elbowCap = new THREE.Mesh(new THREE.SphereGeometry(0.062 * scale, 10, 8), skinMat);
    elbow.add(elbowCap);
    const forearm = new THREE.Mesh(new THREE.CapsuleGeometry(0.058 * scale, 0.19 * scale, 6, 10), skinMat);
    forearm.position.y = -0.13 * scale;
    elbow.add(forearm);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.068 * scale, 10, 8), skinMat);
    hand.scale.set(0.8, 1.05, 0.5);
    hand.position.y = -0.27 * scale;
    elbow.add(hand);
    const thumb = new THREE.Mesh(new THREE.CapsuleGeometry(0.02 * scale, 0.03 * scale, 3, 6), skinMat);
    thumb.position.set(side * 0.045 * scale, -0.255 * scale, 0.015 * scale);
    thumb.rotation.z = side * 0.6;
    elbow.add(thumb);

    torso.add(shoulder);
  });

  g.userData = {
    hips, torso, head,
    legL, legR, kneeL: knees[0], kneeR: knees[1],
    armL, armR, elbowL: elbows[0], elbowR: elbows[1],
    // exposed so the shirt colour can be recoloured live from the menu
    shirtMat, shirtTrimMat, shoeAccentMat,
  };
  castAll(g);
  return g;
}

// ---------- shirt colour, chosen on the menu ----------
// Trim and shoe flashes are picked per shirt rather than shared, so the accent
// stays readable against each one instead of clashing with half of them.
const SHIRT_OPTIONS = [
  { id: 'grey',  label: 'Grey',  shirt: 0x8b9299, trim: 0xe8b44a, accent: 0xd8dde1 },
  { id: 'red',   label: 'Red',   shirt: 0xc6382c, trim: 0xf2c552, accent: 0xffd9a0 },
  { id: 'blue',  label: 'Blue',  shirt: 0x2f6fc0, trim: 0xffb03a, accent: 0x9fd0ff },
  { id: 'black', label: 'Black', shirt: 0x26262c, trim: 0xe8b44a, accent: 0x9aa0a8 },
];
const SHIRT_STORE_KEY = 'captainGo.shirt.v1';

function loadShirtChoice() {
  try {
    const saved = localStorage.getItem(SHIRT_STORE_KEY);
    if (saved && SHIRT_OPTIONS.some(o => o.id === saved)) return saved;
  } catch (e) { /* private mode */ }
  return 'blue';
}
let shirtChoice = loadShirtChoice();

function applyShirtColor(id, persist) {
  const opt = SHIRT_OPTIONS.find(o => o.id === id) || SHIRT_OPTIONS[2];
  shirtChoice = opt.id;
  const ud = playerMesh.userData;
  ud.shirtMat.color.setHex(opt.shirt);
  ud.shirtTrimMat.color.setHex(opt.trim);
  ud.shoeAccentMat.color.setHex(opt.accent);
  if (persist) {
    try { localStorage.setItem(SHIRT_STORE_KEY, opt.id); } catch (e) { /* private mode */ }
  }
  document.querySelectorAll('#shirt-picker .swatch').forEach(el => {
    const on = el.dataset.shirt === opt.id;
    el.classList.toggle('on', on);
    el.setAttribute('aria-checked', on ? 'true' : 'false');
  });
}

function buildShirtPicker() {
  const host = document.getElementById('shirt-picker');
  if (!host) return;
  host.innerHTML = '';
  SHIRT_OPTIONS.forEach(opt => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'swatch';
    b.dataset.shirt = opt.id;
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-label', opt.label + ' shirt');
    b.title = opt.label;
    b.style.setProperty('--sw', '#' + opt.shirt.toString(16).padStart(6, '0'));
    b.style.setProperty('--sw-trim', '#' + opt.trim.toString(16).padStart(6, '0'));
    b.innerHTML = '<span class="sw-dot"></span><span class="sw-label">' + opt.label + '</span>';
    b.addEventListener('click', () => { ensureAudio(); applyShirtColor(opt.id, true); sfx.ring(); });
    host.appendChild(b);
  });
}

const playerMesh = buildRunner(0.78);
scene.add(playerMesh);
buildShirtPicker();
applyShirtColor(shirtChoice, false);

// ---------- fireball enemies ----------
// Temple fire vent. Deliberately LOW and WIDE so it reads as jumpable at a
// glance, with a scorch ring on the floor telegraphing it from a distance.
// Flames top out around y=0.70; FIRE_CLEAR_Y is the height that clears them.
function makeFireTrapMesh(theme) {
  const g = new THREE.Group();

  // scorch ring - visible long before the flames resolve
  const scorch = new THREE.Mesh(
    new THREE.CircleGeometry(0.98, 22),
    new THREE.MeshStandardMaterial({ color: 0x160f0a, roughness: 1, transparent: true, opacity: 0.8 }),
  );
  scorch.rotation.x = -Math.PI / 2;
  scorch.position.y = 0.025;
  g.add(scorch);

  // iron grate the fire pours through
  const grateMat = new THREE.MeshStandardMaterial({ color: 0x33291f, roughness: 0.85, metalness: 0.35 });
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.56, 0.62, 0.11, 14), grateMat);
  rim.position.y = 0.055;
  g.add(rim);
  for (let i = -1; i <= 1; i++) {
    const slat = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.05, 0.09), grateMat);
    slat.position.set(0, 0.11, i * 0.24);
    g.add(slat);
  }

  // flame cluster, kept low and splayed outward
  const flames = new THREE.Group();
  // Fire is deliberately NOT theme-tinted - it should always read as fire.
  // Three bands: deep red at the base, orange body, yellow-hot tips.
  const emberMat = new THREE.MeshStandardMaterial({
    color: 0xb81800, emissive: 0xd42400, emissiveIntensity: 2.2,
    transparent: true, opacity: 0.95,
  });
  const coolMat = new THREE.MeshStandardMaterial({
    color: 0xff4a05, emissive: 0xff3800, emissiveIntensity: 2.5,
    transparent: true, opacity: 0.9,
  });
  const hotMat = new THREE.MeshStandardMaterial({
    color: 0xff9a1e, emissive: 0xff7000, emissiveIntensity: 2.9,
    transparent: true, opacity: 0.92,
  });
  const tipMat = new THREE.MeshStandardMaterial({
    color: 0xffd85a, emissive: 0xffb020, emissiveIntensity: 3.2,
    transparent: true, opacity: 0.85,
  });

  // glowing coals at the very bottom
  const base = new THREE.Mesh(new THREE.SphereGeometry(0.46, 14, 10), emberMat);
  base.scale.set(1, 0.42, 1);
  base.position.y = 0.16;
  flames.add(base);
  // main orange body
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.36, 14, 10), coolMat);
  body.scale.set(1, 0.72, 1);
  body.position.y = 0.3;
  flames.add(body);
  // licking tongues around the rim, alternating orange and yellow-hot
  for (let i = 0; i < 9; i++) {
    const ang = (i / 9) * Math.PI * 2;
    const tall = i % 3 === 0;
    const tongue = new THREE.Mesh(
      new THREE.ConeGeometry(0.075 + (i % 2) * 0.025, tall ? 0.58 : 0.4, 6),
      i % 2 ? hotMat : coolMat,
    );
    tongue.position.set(Math.cos(ang) * 0.24, (tall ? 0.42 : 0.32), Math.sin(ang) * 0.24);
    tongue.rotation.set(Math.sin(ang) * 0.42, 0, -Math.cos(ang) * 0.42);
    flames.add(tongue);
  }
  // central plume with the hottest tip - stays under FIRE_CLEAR_Y
  const core = new THREE.Mesh(new THREE.ConeGeometry(0.19, 0.56, 8), hotMat);
  core.position.y = 0.44;
  flames.add(core);
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.34, 6), tipMat);
  tip.position.y = 0.64;
  flames.add(tip);
  g.add(flames);

  g.userData.flames = flames;
  g.userData.glow = [base, body, core, tip];
  return g;
}

// ---------- flooded gap: cold water with a circling shark fin ----------
// Low metalness on purpose: there's no environment map in this scene, so a
// metallic water surface reflects nothing and reads black at grazing angles.
// The emissive is what keeps it looking like lit water from any camera height.
const waterSurfMat = new THREE.MeshStandardMaterial({
  color: 0x35a2d6, roughness: 0.22, metalness: 0.04,
  emissive: 0x1a6f96, emissiveIntensity: 1.15,
  transparent: true, opacity: 0.94,
});
const waterDeepMat = new THREE.MeshStandardMaterial({ color: 0x0a3348, roughness: 0.7 });
const foamMat = new THREE.MeshStandardMaterial({
  color: 0xdff4ff, roughness: 0.5, emissive: 0x9fd8f0, emissiveIntensity: 0.5,
});
const sharkMat = new THREE.MeshStandardMaterial({ color: 0x4a5a66, roughness: 0.65 });
const sharkPaleMat = new THREE.MeshStandardMaterial({ color: 0x8fa2ad, roughness: 0.7 });

function makeWaterGapMesh() {
  const g = new THREE.Group();
  const LANE_W = 2.15, LEN = 4.4;

  // dark shaft below, so the hole still reads as depth
  const shaft = new THREE.Mesh(new THREE.BoxGeometry(LANE_W, 1.6, LEN), waterDeepMat);
  shaft.position.y = -1.0;
  g.add(shaft);

  // surface, sitting just below the walkway lip
  const surf = new THREE.Mesh(new THREE.BoxGeometry(LANE_W, 0.08, LEN), waterSurfMat);
  surf.position.y = -0.24;
  g.add(surf);

  // foam along the two open edges
  [-1, 1].forEach(s => {
    const foam = new THREE.Mesh(new THREE.BoxGeometry(LANE_W, 0.07, 0.22), foamMat);
    foam.position.set(0, -0.19, s * (LEN / 2 - 0.11));
    g.add(foam);
  });

  // shark: dorsal fin + tail tip + a wake, cruising across the gap
  const shark = new THREE.Group();
  // ONE dorsal fin only - a swept scythe shape, dark against the bright water
  const finShape = new THREE.Shape();
  finShape.moveTo(-0.34, 0);
  finShape.quadraticCurveTo(-0.1, 0.5, 0.3, 0.98);   // leading edge sweeps up and back
  finShape.quadraticCurveTo(0.16, 0.42, 0.3, 0);     // trailing notch
  finShape.lineTo(-0.34, 0);
  const fin = new THREE.Mesh(
    new THREE.ExtrudeGeometry(finShape, { depth: 0.1, bevelEnabled: true, bevelSize: 0.02, bevelThickness: 0.02, bevelSegments: 1 }),
    sharkMat,
  );
  fin.position.set(0, 0, -0.05);
  shark.add(fin);
  // pale trailing edge to separate the fin from the dark water behind it
  const finEdge = new THREE.Mesh(
    new THREE.ExtrudeGeometry(finShape, { depth: 0.03, bevelEnabled: false }),
    sharkPaleMat,
  );
  finEdge.scale.set(0.78, 0.82, 1);
  finEdge.position.set(-0.02, 0.02, 0.07);
  shark.add(finEdge);

  // waterline foam where the fin cuts through, plus a trailing wake
  const collar = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 8), foamMat);
  collar.scale.set(1.35, 0.16, 0.7);
  collar.position.set(0, 0.03, 0.02);
  shark.add(collar);
  const wake = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.05, 1.7), foamMat);
  wake.position.set(0, 0.02, -0.85);
  shark.add(wake);

  shark.position.y = -0.24;
  g.add(shark);

  g.userData = { shark, surf, phase: Math.random() * Math.PI * 2 };
  return g;
}

// ---------- banana collectible ----------
// ripeness gradient painted along the banana's length: green heel -> yellow belly -> brown tip
function makeBananaTexture() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 32;
  const ctx = c.getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, 256, 0);
  grad.addColorStop(0.00, '#6f5a1c');
  grad.addColorStop(0.07, '#a8912a');
  grad.addColorStop(0.18, '#d9c53a');
  grad.addColorStop(0.34, '#f2d94a');
  grad.addColorStop(0.55, '#f7e05a');
  grad.addColorStop(0.76, '#eccd3e');
  grad.addColorStop(0.90, '#b9932c');
  grad.addColorStop(1.00, '#4a3418');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 32);
  // faint sugar speckles so the peel is not a flat gradient
  for (let i = 0; i < 90; i++) {
    const x = 30 + Math.random() * 200;
    ctx.fillStyle = `rgba(120,86,30,${0.10 + Math.random() * 0.18})`;
    ctx.fillRect(x, Math.random() * 32, 1 + Math.random() * 2, 1 + Math.random() * 2);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
const bananaTex = makeBananaTexture();

// swept surface: a curved centerline with a tapered, softly ridged cross-section
function makeBananaGeometry() {
  const SEG = 30, RADIAL = 10;
  const bend = Math.PI * 0.58, arcR = 0.62;
  const positions = [], uvs = [], indices = [];
  for (let i = 0; i <= SEG; i++) {
    const t = i / SEG;
    const a = -bend / 2 + bend * t;
    const cx = Math.sin(a) * arcR, cy = Math.cos(a) * arcR;
    // in-plane normal and out-of-plane binormal for this point on the arc
    const nx = Math.sin(a), ny = Math.cos(a);
    // fat through the middle, drawn to a point at both ends
    const taper = Math.pow(Math.sin(Math.PI * Math.min(1, Math.max(0, t))), 0.42);
    const baseR = 0.145 * taper + 0.010;
    for (let j = 0; j <= RADIAL; j++) {
      const phi = (j / RADIAL) * Math.PI * 2;
      // five soft longitudinal ridges, like a real peel
      const rr = baseR * (1 + 0.075 * Math.cos(5 * phi));
      positions.push(
        cx + nx * Math.cos(phi) * rr,
        cy + ny * Math.cos(phi) * rr,
        Math.sin(phi) * rr,
      );
      uvs.push(t, j / RADIAL);
    }
  }
  for (let i = 0; i < SEG; i++) {
    for (let j = 0; j < RADIAL; j++) {
      const a = i * (RADIAL + 1) + j;
      const b = a + RADIAL + 1;
      indices.push(a, b, b + 1, a, b + 1, a + 1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  geo.center();
  return geo;
}
const bananaGeo = makeBananaGeometry();
const bananaMat = new THREE.MeshStandardMaterial({ map: bananaTex, roughness: 0.52, metalness: 0.04 });
const bananaStemMat = new THREE.MeshStandardMaterial({ color: 0x4e3a18, roughness: 0.8 });

// short-lived sparkle burst when something is picked up
const sparkleGeo = new THREE.SphereGeometry(0.07, 6, 6);
const sparkleMat = new THREE.MeshStandardMaterial({
  color: 0xfff0a0, emissive: 0xffd23a, emissiveIntensity: 2.4,
  transparent: true, opacity: 1,
});
function spawnSparkles(x, y, z, count = 9, tint, emissiveIntensity) {
  for (let i = 0; i < count; i++) {
    const mat = sparkleMat.clone();
    if (tint !== undefined) { mat.color.set(tint); mat.emissive.set(tint); }
    if (emissiveIntensity !== undefined) mat.emissiveIntensity = emissiveIntensity;
    const m = new THREE.Mesh(sparkleGeo, mat);
    m.position.set(x, y, z);
    scene.add(m);
    sparkles.push({
      mesh: m, life: 0, ttl: 0.42 + Math.random() * 0.2,
      vx: (Math.random() - 0.5) * 3.2,
      vy: 1.6 + Math.random() * 2.4,
      vz: (Math.random() - 0.5) * 3.2,
    });
  }
}
function updateSparkles(dt) {
  sparkles.forEach(s => {
    s.life += dt;
    s.vy -= 9 * dt;
    s.mesh.position.x += s.vx * dt;
    s.mesh.position.y += s.vy * dt;
    s.mesh.position.z += s.vz * dt;
    const k = Math.max(0, 1 - s.life / s.ttl);
    s.mesh.scale.setScalar(0.4 + k * 0.9);
    s.mesh.material.opacity = k;
  });
  sparkles = sparkles.filter(s => {
    if (s.life < s.ttl) return true;
    scene.remove(s.mesh);
    s.mesh.material.dispose();
    return false;
  });
}

function makeBananaMesh() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(bananaGeo, bananaMat);
  g.add(body);
  // squared-off stalk at the heel
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.05, 0.13, 6), bananaStemMat);
  stem.position.set(-0.3, 0.235, 0);
  stem.rotation.z = 0.75;
  g.add(stem);
  // dried blossom point at the far tip
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.032, 0.09, 6), bananaStemMat);
  tip.position.set(0.3, 0.235, 0);
  tip.rotation.z = -2.4;
  g.add(tip);
  g.rotation.z = 0.35;
  g.scale.setScalar(1.24);
  return g;
}

// ---------- bonus pickup: chocolate chip cookie ----------
const cookieDoughMat = new THREE.MeshStandardMaterial({ color: 0xb0692a, roughness: 0.8, emissive: 0x3a1f06, emissiveIntensity: 0.5 });
const cookieBakedMat = new THREE.MeshStandardMaterial({ color: 0x8a4f1e, roughness: 0.9 });
const chocolateMat = new THREE.MeshStandardMaterial({ color: 0x2a1408, roughness: 0.5 });

function makeCookieMesh() {
  const g = new THREE.Group();
  // slightly domed, slightly irregular disc so it doesn't read as a coin
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.34, 0.11, 18), cookieDoughMat);
  g.add(disc);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.35, 16, 10), cookieDoughMat);
  dome.scale.set(1, 0.3, 1);
  dome.position.y = 0.035;
  g.add(dome);
  const baseShade = new THREE.Mesh(new THREE.CylinderGeometry(0.355, 0.335, 0.03, 18), cookieBakedMat);
  baseShade.position.y = -0.055;
  g.add(baseShade);
  // knobbly baked edge
  for (let i = 0; i < 9; i++) {
    const ang = (i / 9) * Math.PI * 2;
    const lump = new THREE.Mesh(new THREE.SphereGeometry(0.07 + Math.random() * 0.03, 8, 6), cookieDoughMat);
    lump.scale.y = 0.55;
    lump.position.set(Math.cos(ang) * 0.33, 0.01, Math.sin(ang) * 0.33);
    g.add(lump);
  }
  // chips on the face, plus a couple peeking out of the rim
  [[0.0, 0.12], [-0.16, -0.08], [0.17, -0.05], [0.08, 0.22], [-0.2, 0.14], [0.22, 0.16]].forEach(([cx, cz], i) => {
    const chip = new THREE.Mesh(new THREE.SphereGeometry(0.062, 8, 6), chocolateMat);
    chip.scale.set(1, 0.8, 1);
    chip.position.set(cx, 0.07, cz);
    chip.rotation.y = i;
    g.add(chip);
  });
  [[0.3, -0.14], [-0.28, 0.2]].forEach(([cx, cz]) => {
    const chip = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), chocolateMat);
    chip.position.set(cx, 0.02, cz);
    g.add(chip);
  });
  // soft halo so the prize is spottable from down the corridor
  const halo = new THREE.Mesh(
    new THREE.SphereGeometry(0.56, 14, 12),
    new THREE.MeshBasicMaterial({ color: 0xffd070, transparent: true, opacity: 0.16 }),
  );
  halo.scale.y = 0.62;
  g.add(halo);
  g.rotation.x = -0.35;   // tip it toward the camera so the chips read
  g.scale.setScalar(2);   // 2x
  return g;
}

// ---------- collectible stickers (the sticker book) ----------
// Two per chamber, derived from the level index so the book fills in order.
const STICKERS = [
  { id: 'rocket',   emoji: '\u{1F680}', name: 'Rocket',      bg: '#f2568f' },
  { id: 'saturn',   emoji: '\u{1FA90}', name: 'Ringed Planet', bg: '#5b6ff0' },
  { id: 'racecar',  emoji: '\u{1F697}', name: 'Race Car',    bg: '#f2622e' },
  { id: 'trex',     emoji: '\u{1F996}', name: 'T-Rex',       bg: '#3aa84a' },
  { id: 'cake',     emoji: '\u{1F382}', name: 'Birthday Cake', bg: '#f04a92' },
  { id: 'rainbow',  emoji: '\u{1F308}', name: 'Rainbow',     bg: '#22a7d8' },
  { id: 'icecream', emoji: '\u{1F366}', name: 'Ice Cream',   bg: '#f09a2e' },
  { id: 'soccer',   emoji: '\u{26BD}',  name: 'Soccer Ball', bg: '#5a6470' },
  { id: 'dino',     emoji: '\u{1F995}', name: 'Longneck',    bg: '#5fa83a' },
  { id: 'balloon',  emoji: '\u{1F388}', name: 'Balloon',     bg: '#e8434f' },
  { id: 'train',    emoji: '\u{1F682}', name: 'Steam Train', bg: '#8a6a3a' },
  { id: 'octopus',  emoji: '\u{1F419}', name: 'Octopus',     bg: '#e0508e' },
  { id: 'butterfly',emoji: '\u{1F98B}', name: 'Butterfly',   bg: '#8a5ad8' },
  { id: 'donut',    emoji: '\u{1F369}', name: 'Donut',       bg: '#f0803a' },
  { id: 'star',     emoji: '\u{2B50}',  name: 'Gold Star',   bg: '#e8b21e' },
  { id: 'dolphin',  emoji: '\u{1F42C}', name: 'Dolphin',     bg: '#2f92d8' },
  { id: 'pizza',    emoji: '\u{1F355}', name: 'Pizza Slice', bg: '#e07a22' },
  { id: 'turtle',   emoji: '\u{1F422}', name: 'Turtle',      bg: '#3f9a6a' },
  { id: 'guitar',   emoji: '\u{1F3B8}', name: 'Guitar',      bg: '#d2762a' },
  { id: 'lion',     emoji: '\u{1F981}', name: 'Lion',        bg: '#e8a020' },
  { id: 'digger',   emoji: '\u{1F69C}', name: 'Digger',      bg: '#e0aa1e' },
  { id: 'ufo',      emoji: '\u{1F6F8}', name: 'Flying Saucer', bg: '#2fae86' },
  { id: 'crab',     emoji: '\u{1F980}', name: 'Crab',        bg: '#e8503a' },
  { id: 'kite',     emoji: '\u{1FA81}', name: 'Kite',        bg: '#3f86d8' },
  { id: 'monkey',   emoji: '\u{1F435}', name: 'Monkey',      bg: '#a5763f' },
  { id: 'fireeng',  emoji: '\u{1F692}', name: 'Fire Engine', bg: '#e03a3a' },
  { id: 'penguin',  emoji: '\u{1F427}', name: 'Penguin',     bg: '#3c7ba8' },
  { id: 'cupcake',  emoji: '\u{1F9C1}', name: 'Cupcake',     bg: '#ee5f9e' },
  { id: 'whale',    emoji: '\u{1F433}', name: 'Whale',       bg: '#3877c4' },
  { id: 'trophy',   emoji: '\u{1F3C6}', name: 'Golden Trophy', bg: '#e0a81e' },
];

// which two stickers live in a given chamber
function stickersForLevel(levelNum) {
  const a = ((levelNum - 1) * 2) % STICKERS.length;
  const b = (a + 1) % STICKERS.length;
  return [STICKERS[a], STICKERS[b]];
}

// persisted across sessions so the book genuinely fills up over time
const STICKER_STORE_KEY = 'captainGo.stickers.v1';
function loadStickerBook() {
  try {
    const raw = localStorage.getItem(STICKER_STORE_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch (e) { return new Set(); }
}
function saveStickerBook(set) {
  try { localStorage.setItem(STICKER_STORE_KEY, JSON.stringify([...set])); } catch (e) { /* private mode */ }
}
let stickerBook = loadStickerBook();

const stickerTexCache = {};
function makeStickerTexture(def) {
  if (stickerTexCache[def.id]) return stickerTexCache[def.id];
  const S = 256;
  const c = document.createElement('canvas');
  c.width = S; c.height = S;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  const roundRect = (x, y, w, h, r, fill) => {
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.fill();
  };
  // saturated frame + white centre: the icon needs maximum contrast to read
  // from down the corridor
  roundRect(0, 0, S, S, 46, def.bg);
  roundRect(22, 22, S - 44, S - 44, 30, '#ffffff');

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '170px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", -apple-system, sans-serif';
  ctx.fillText(def.emoji, S / 2, S / 2 + 8);

  // Not every platform has a colour emoji font. If the middle of the card is
  // still the background colour, fall back to a bold initial so the sticker is
  // never a blank card.
  let drew = false;
  try {
    const probe = ctx.getImageData(S * 0.32, S * 0.32, S * 0.36, S * 0.36).data;
    const bg = ctx.getImageData(S / 2, 30, 1, 1).data;   // sample the white centre
    for (let i = 0; i < probe.length; i += 16) {
      if (Math.abs(probe[i] - bg[0]) > 18 || Math.abs(probe[i + 1] - bg[1]) > 18 || Math.abs(probe[i + 2] - bg[2]) > 18) {
        drew = true; break;
      }
    }
  } catch (e) { drew = true; }   // tainted canvas: assume it worked
  if (!drew) {
    ctx.fillStyle = def.bg;
    ctx.font = '900 150px -apple-system, "Segoe UI", sans-serif';
    ctx.fillText(def.name[0].toUpperCase(), S / 2, S / 2 + 6);
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  stickerTexCache[def.id] = tex;
  return tex;
}

const stickerBackMat = new THREE.MeshStandardMaterial({
  color: 0xffffff, roughness: 0.45, emissive: 0x555555, emissiveIntensity: 0.35,
});
function makeStickerMesh(def) {
  const g = new THREE.Group();
  // white die-cut backing, slightly larger than the art
  const back = new THREE.Mesh(new THREE.BoxGeometry(1.32, 1.32, 0.09), stickerBackMat);
  g.add(back);
  const faceMat = new THREE.MeshStandardMaterial({
    map: makeStickerTexture(def), roughness: 0.4,
    emissive: 0xffffff, emissiveIntensity: 0.3,
  });
  [0.055, -0.055].forEach((z, i) => {
    const face = new THREE.Mesh(new THREE.PlaneGeometry(1.18, 1.18), faceMat);
    face.position.z = z;
    if (i === 1) face.rotation.y = Math.PI;
    g.add(face);
  });
  // soft halo so it stands out as a prize
  const halo = new THREE.Mesh(
    new THREE.SphereGeometry(1.05, 14, 12),
    new THREE.MeshBasicMaterial({ color: 0xfff0b0, transparent: true, opacity: 0.16 }),
  );
  halo.scale.set(1, 1, 0.4);
  g.add(halo);
  g.userData.def = def;
  return g;
}

// popup shown when one is picked up
function showStickerPop(def) {
  stickerPopArt.textContent = def.emoji;
  stickerPopArt.style.background = def.bg;
  stickerPopName.textContent = def.name;
  stickerPop.classList.remove('hidden');
  clearTimeout(showStickerPop._t);
  showStickerPop._t = setTimeout(() => stickerPop.classList.add('hidden'), 1500);
}

function renderStickerBook() {
  stickerBookEl.innerHTML = '';
  STICKERS.forEach(def => {
    const cell = document.createElement('div');
    const have = stickerBook.has(def.id);
    cell.className = 'sb' + (have ? ' have' : '');
    cell.textContent = have ? def.emoji : '?';
    cell.title = have ? def.name : 'Not found yet';
    stickerBookEl.appendChild(cell);
  });
  bookCountEl.textContent = `${stickerBook.size} / ${STICKERS.length}`;
}

function makeHeartMesh() {
  const g = new THREE.Group();
  const heartMat = new THREE.MeshStandardMaterial({ color: 0xff3355, emissive: 0xaa0022, emissiveIntensity: 0.9, roughness: 0.3, metalness: 0.1 });
  const lobeGeo = new THREE.SphereGeometry(0.26, 12, 12);
  const lobeL = new THREE.Mesh(lobeGeo, heartMat);
  lobeL.position.set(-0.16, 0.16, 0);
  const lobeR = new THREE.Mesh(lobeGeo, heartMat);
  lobeR.position.set(0.16, 0.16, 0);
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.5, 16), heartMat);
  tip.position.set(0, -0.18, 0);
  tip.rotation.x = Math.PI;
  g.add(lobeL, lobeR, tip);
  g.rotation.x = -0.2;
  return g;
}

function renderPlayerHealth() {
  const pct = Math.max(0, player.health / player.maxHealth) * 100;
  playerHealthFillEl.style.width = `${pct}%`;
}
function updateHud() {
  levelValEl.textContent = `LV ${level}`;
  ringValEl.textContent = `🍌 ${ringCount}`;
  cookieValEl.textContent = `🍪 ${cookieCount}`;
}

function rectClose(z1, z2, range) { return Math.abs(z1 - z2) < range; }

// ---------- obstacles ----------
// Both obstacle types are deliberately NOT rock-coloured: dark glazed ceramic
// and gold metal both separate cleanly from the pale stone walkway, and they
// look breakable, which matters now that the kick can smash either one.
const URN_BODY = 0x2f8ba6;      // teal glaze, bright enough to survive dim chambers
const URN_BODY_DARK = 0x14424f;
const URN_GOLD = 0xe8b44a;
const URN_CRACK = 0xffb85c;

// JUMP or KICK: a banded treasure chest, lid ajar with gold light spilling out.
// Bigger and squarer than a pot, so it reads as a solid thing to clear, and
// obviously full of something worth kicking open.
function makeUrnStack() {
  const g = new THREE.Group();
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x6b3a1e, roughness: 0.72 });
  const woodDarkMat = new THREE.MeshStandardMaterial({ color: 0x4a2612, roughness: 0.8 });
  const ironMat = new THREE.MeshStandardMaterial({ color: 0x2a2420, roughness: 0.5, metalness: 0.65 });
  const goldMat = new THREE.MeshStandardMaterial({
    color: URN_GOLD, roughness: 0.26, metalness: 0.85,
    emissive: URN_GOLD, emissiveIntensity: 0.3,
  });
  const glowMat = new THREE.MeshStandardMaterial({
    color: 0xffe08a, emissive: 0xffc040, emissiveIntensity: 2.4,
    transparent: true, opacity: 0.92,
  });

  const W = 1.16, D = 0.82, BODY_H = 0.5;

  // --- body, with vertical plank grooves
  const body = new THREE.Mesh(new THREE.BoxGeometry(W, BODY_H, D), woodMat);
  body.position.y = BODY_H / 2;
  g.add(body);
  for (let i = -2; i <= 2; i++) {
    const groove = new THREE.Mesh(new THREE.BoxGeometry(0.025, BODY_H * 0.92, D + 0.01), woodDarkMat);
    groove.position.set(i * 0.21, BODY_H / 2, 0);
    g.add(groove);
  }
  // iron bands wrapping the body
  [-0.36, 0.36].forEach(x => {
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.09, BODY_H + 0.02, D + 0.03), ironMat);
    band.position.set(x, BODY_H / 2, 0);
    g.add(band);
  });
  // corner studs
  [-1, 1].forEach(sx => [-1, 1].forEach(sz => {
    const stud = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), ironMat);
    stud.position.set(sx * (W / 2 - 0.05), BODY_H - 0.07, sz * (D / 2 - 0.05));
    g.add(stud);
  }));

  // --- lid: half-cylinder, tipped back so the chest sits open
  const lid = new THREE.Group();
  const lidShell = new THREE.Mesh(
    new THREE.CylinderGeometry(D / 2, D / 2, W, 14, 1, false, 0, Math.PI),
    woodMat,
  );
  lidShell.rotation.z = Math.PI / 2;
  lid.add(lidShell);
  [-0.36, 0.36].forEach(x => {
    const lidBand = new THREE.Mesh(
      new THREE.CylinderGeometry(D / 2 + 0.012, D / 2 + 0.012, 0.09, 14, 1, false, 0, Math.PI),
      ironMat,
    );
    lidBand.rotation.z = Math.PI / 2;
    lidBand.position.x = x;
    lid.add(lidBand);
  });
  lid.position.set(0, BODY_H, 0.06);
  lid.rotation.x = 0.72;           // hinges backwards so the open side faces the runner
  g.add(lid);

  // --- treasure glow spilling from the gap
  const glow = new THREE.Mesh(new THREE.BoxGeometry(W - 0.16, 0.07, D - 0.24), glowMat);
  glow.position.set(0, BODY_H - 0.01, -0.06);
  g.add(glow);
  // a few coins cresting the rim
  for (let i = 0; i < 7; i++) {
    const coin = new THREE.Mesh(new THREE.CylinderGeometry(0.082, 0.082, 0.03, 12), goldMat);
    coin.position.set(-0.38 + i * 0.128, BODY_H + 0.03 + (i % 3) * 0.03, -0.16 + (i % 2) * 0.09);
    coin.rotation.set(Math.random() * 0.6, Math.random() * 2, Math.random() * 0.6);
    g.add(coin);
  }
  // a gem sitting proud of the pile
  const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.1, 0), new THREE.MeshStandardMaterial({
    color: 0x46d8e8, emissive: 0x2aa8c0, emissiveIntensity: 1.4, roughness: 0.2, metalness: 0.4,
  }));
  gem.position.set(0.16, BODY_H + 0.1, -0.14);
  g.add(gem);

  // --- gold lock plate on the front
  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.28, 0.05), goldMat);
  plate.position.set(0, BODY_H - 0.15, -(D / 2 + 0.01));
  g.add(plate);
  const keyhole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.04, 10), ironMat);
  keyhole.rotation.x = Math.PI / 2;
  keyhole.position.set(0, BODY_H - 0.13, -(D / 2 + 0.04));
  g.add(keyhole);

  g.userData.phase = Math.random() * Math.PI * 2;
  g.userData.glow = glow;
  return g;
}

// SLIDE or KICK: a half-dropped temple portcullis. The lit floor strip and the
// row of hanging spikes make "go under this" unmistakable.
function makePortcullis(theme) {
  const g = new THREE.Group();
  const stoneMat = new THREE.MeshStandardMaterial({ color: theme.stoneTint, roughness: 0.9 });
  const darkMat = new THREE.MeshStandardMaterial({ color: OBSTACLE_ROCK_DEEP, roughness: 0.95 });
  const goldMat = new THREE.MeshStandardMaterial({
    color: URN_GOLD, roughness: 0.28, metalness: 0.85,
    emissive: URN_GOLD, emissiveIntensity: 0.3,
  });
  const glowMat = new THREE.MeshStandardMaterial({
    color: 0xffe9a8, emissive: 0xffd070, emissiveIntensity: 1.6,
    transparent: true, opacity: 0.9,
  });

  // side posts with capitals
  [-0.86, 0.86].forEach(x => {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.32, 2.7, 0.42), stoneMat);
    post.position.set(x, 1.35, 0);
    g.add(post);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.2, 0.54), goldMat);
    cap.position.set(x, 2.62, 0);
    g.add(cap);
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.18, 0.54), darkMat);
    foot.position.set(x, 0.09, 0);
    g.add(foot);
  });

  // lintel across the top
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.34, 0.5), stoneMat);
  lintel.position.set(0, 2.5, 0);
  g.add(lintel);
  const lintelTrim = new THREE.Mesh(new THREE.BoxGeometry(2.16, 0.09, 0.56), goldMat);
  lintelTrim.position.set(0, 2.3, 0);
  g.add(lintelTrim);

  // the grille itself - bars stopping well above a sliding runner
  const grille = new THREE.Group();
  const ironMat = new THREE.MeshStandardMaterial({ color: 0x231f1c, roughness: 0.55, metalness: 0.6 });
  const BAR_BOTTOM = 1.34;
  for (let i = -2; i <= 2; i++) {
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 2.3 - BAR_BOTTOM + 0.6, 8), ironMat);
    bar.position.set(i * 0.4, BAR_BOTTOM + (2.3 - BAR_BOTTOM + 0.6) / 2 - 0.3, 0);
    grille.add(bar);
    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.095, 0.24, 7), goldMat);
    spike.position.set(i * 0.4, BAR_BOTTOM - 0.1, 0);
    spike.rotation.x = Math.PI;
    grille.add(spike);
  }
  // horizontal braces
  [1.7, 2.15].forEach(y => {
    const brace = new THREE.Mesh(new THREE.BoxGeometry(1.78, 0.09, 0.09), ironMat);
    brace.position.set(0, y, 0);
    grille.add(brace);
  });
  g.add(grille);

  // bright strip on the floor marking the safe gap
  const strip = new THREE.Mesh(new THREE.BoxGeometry(1.85, 0.045, 0.5), glowMat);
  strip.position.set(0, 0.035, 0);
  g.add(strip);
  // chevrons pointing down into the gap
  [-0.55, 0, 0.55].forEach(x => {
    const chev = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.26, 4), glowMat);
    chev.position.set(x, 0.92, 0.34);
    chev.rotation.x = Math.PI;
    g.add(chev);
  });

  g.userData = { grille, phase: Math.random() * Math.PI * 2 };
  return g;
}

// ---------- level construction ----------
function buildLevel(levelNum) {
  const data = LEVEL_DATA[(levelNum - 1) % LEVEL_DATA.length];
  const theme = data.theme;

  forwardSpeed = Math.min(MAX_FORWARD_SPEED, FORWARD_SPEED + (levelNum - 1) * SPEED_PER_LEVEL);

  buildRoadForLevel(data.gaps, theme);
  applyTheme(theme);

  crates.forEach(c => { scene.remove(c.mesh); disposeObject(c.mesh); });
  bars.forEach(b => { scene.remove(b.mesh); disposeObject(b.mesh); });
  enemies.forEach(e => { scene.remove(e.mesh); disposeObject(e.mesh); });
  rings.forEach(r => { scene.remove(r.mesh); disposeObject(r.mesh); });
  heartPickups.forEach(h => { scene.remove(h.mesh); disposeObject(h.mesh); });
  cookies.forEach(c => { scene.remove(c.mesh); disposeObject(c.mesh); });
  gaps.forEach(g => { if (g.mesh) { scene.remove(g.mesh); disposeObject(g.mesh); } });
  stickerPickups.forEach(s => { scene.remove(s.mesh); disposeObject(s.mesh); });

  crates = data.crates.map(c => ({ ...c, hit: false }));
  crates.forEach(c => {
    c.mesh = makeUrnStack();
    c.mesh.position.set(LANES_X[c.lane], 0, c.z);
    castAll(c.mesh);
    scene.add(c.mesh);
  });

  bars = data.bars.map(b => ({ ...b, hit: false }));
  bars.forEach(b => {
    b.mesh = makePortcullis(theme);
    b.mesh.position.set(LANES_X[b.lane], 0, b.z);
    castAll(b.mesh);
    scene.add(b.mesh);
  });

  gaps = data.gaps.map(g => ({ ...g }));
  gaps.forEach(gp => {
    gp.mesh = makeWaterGapMesh();
    gp.mesh.position.set(LANES_X[gp.lane], 0, gp.z);
    scene.add(gp.mesh);
  });

  enemies = data.enemies.map(e => ({ ...e, alive: true }));
  enemies.forEach(e => {
    e.mesh = makeFireTrapMesh(theme);
    e.mesh.position.set(LANES_X[e.lane], 0, e.z);
    castAll(e.mesh);
    scene.add(e.mesh);
  });

  rings = data.rings.map(([z, lane]) => ({ z, lane, collected: false }));
  rings.forEach(r => {
    r.mesh = makeBananaMesh();
    r.mesh.position.set(LANES_X[r.lane], 1.05, r.z);
    scene.add(r.mesh);
  });

  heartPickups = (data.hearts || []).map(([z, lane]) => ({ z, lane, collected: false }));
  heartPickups.forEach(h => {
    h.mesh = makeHeartMesh();
    h.mesh.position.set(LANES_X[h.lane], 0.9, h.z);
    scene.add(h.mesh);
  });

  const levelStickers = stickersForLevel(levelNum);
  stickerPickups = (data.stickers || []).map(([z, lane], i) => ({
    z, lane, collected: false, def: levelStickers[i % levelStickers.length],
  }));
  stickerPickups.forEach(s => {
    s.mesh = makeStickerMesh(s.def);
    s.mesh.position.set(LANES_X[s.lane], 1.35, s.z);
    castAll(s.mesh);
    scene.add(s.mesh);
  });

  cookies = (data.cookies || []).map(([z, lane]) => ({ z, lane, collected: false }));
  cookies.forEach(c => {
    c.mesh = makeCookieMesh();
    c.mesh.position.set(LANES_X[c.lane], 1.15, c.z);
    castAll(c.mesh);
    scene.add(c.mesh);
  });

  exitFillEl.style.width = '0%';
}

// Chamber transition: a pane of clear blue glass cracks and falls apart.
// Deliberately transparent - the game stays visible through it. Shards are
// built as radial clip-path polygons from an impact point: an inner ring of
// triangles and an outer ring of quads, the way real impact glass breaks.
function playShatter() {
  const SECTORS = 16;
  const cx = 46 + Math.random() * 8;   // impact point, roughly centre screen
  const cy = 40 + Math.random() * 8;
  const pt = (a, r) => `${(cx + Math.cos(a) * r).toFixed(2)}% ${(cy + Math.sin(a) * r * 1.25).toFixed(2)}%`;

  // jittered spoke angles + a jagged inner crack ring
  const angs = [];
  for (let i = 0; i < SECTORS; i++) {
    angs.push((i / SECTORS) * Math.PI * 2 + (Math.random() - 0.5) * 0.16);
  }
  const inner = angs.map(() => 17 + Math.random() * 13);

  shatterEl.innerHTML = '';
  const addShard = (points, delay, dist, spin) => {
    const s = document.createElement('div');
    s.className = 'glass-shard';
    s.style.clipPath = `polygon(${points.join(', ')})`;
    s.style.setProperty('--gd', `${delay}ms`);
    s.style.setProperty('--gtx', `${dist.x.toFixed(1)}px`);
    s.style.setProperty('--gty', `${dist.y.toFixed(1)}px`);
    s.style.setProperty('--grot', `${spin.toFixed(1)}deg`);
    shatterEl.appendChild(s);
  };

  for (let i = 0; i < SECTORS; i++) {
    const a = angs[i], b = angs[(i + 1) % SECTORS];
    const ri = inner[i], rj = inner[(i + 1) % SECTORS];
    const mid = a + (b - a) / 2;
    // inner triangle - falls first, close to the impact
    addShard(
      [`${cx}% ${cy}%`, pt(a, ri), pt(b, rj)],
      40 + Math.random() * 70,
      { x: Math.cos(mid) * (70 + Math.random() * 70), y: Math.sin(mid) * 50 + 240 + Math.random() * 120 },
      (Math.random() - 0.5) * 150,
    );
    // outer piece - drifts further and tumbles more
    addShard(
      [pt(a, ri), pt(a, 95), pt(b, 95), pt(b, rj)],
      110 + Math.random() * 130,
      { x: Math.cos(mid) * (110 + Math.random() * 120), y: Math.sin(mid) * 60 + 300 + Math.random() * 180 },
      (Math.random() - 0.5) * 220,
    );
  }

  shatterEl.classList.remove('hidden');
  flashEl.classList.remove('hidden');
  flashEl.style.animation = 'none';
  void flashEl.offsetWidth;
  flashEl.style.animation = '';
  sfx.shatter();
  clearTimeout(playShatter._t);
  playShatter._t = setTimeout(() => {
    shatterEl.classList.add('hidden');
    flashEl.classList.add('hidden');
    shatterEl.innerHTML = '';
  }, 1150);
}

function showLevelBanner(levelNum) {
  const theme = LEVEL_DATA[(levelNum - 1) % LEVEL_DATA.length].theme;
  levelBanner.textContent = `CHAMBER ${levelNum} of ${LEVEL_DATA.length} — ${theme.name}`;
  levelBanner.classList.remove('hidden');
  renderChamberMap(levelNum);
  chamberMapEl.classList.remove('hidden');
  clearTimeout(showLevelBanner._t);
  showLevelBanner._t = setTimeout(() => {
    levelBanner.classList.add('hidden');
    chamberMapEl.classList.add('hidden');
  }, 2600);
}

// one pip per chamber: cleared ones show a banana, the current one pulses
function renderChamberMap(levelNum) {
  chamberMapEl.innerHTML = '';
  LEVEL_DATA.forEach((_, i) => {
    const pip = document.createElement('div');
    const n = i + 1;
    pip.className = 'pip' + (n < levelNum ? ' done' : n === levelNum ? ' current' : '');
    pip.textContent = n < levelNum ? '🍌' : String(n);
    pip.title = LEVEL_DATA[i].theme.name;
    chamberMapEl.appendChild(pip);
  });
}

// end-screen shelf: how many chambers were cleared this run
function renderTrophyShelf(clearedCount) {
  trophyShelfEl.innerHTML = '';
  LEVEL_DATA.forEach((lv, i) => {
    const slot = document.createElement('div');
    slot.className = 'slot' + (i < clearedCount ? ' won' : '');
    slot.textContent = '🍌';
    slot.title = lv.theme.name;
    trophyShelfEl.appendChild(slot);
  });
}

function startNewGame() {
  level = 1; score = 0; ringCount = 0; cookieCount = 0;
  camShake = 0; landSquash = 0; playerSquashY = 1; wasOnGround = true;
  player.kicking = false; player.kickTimer = 0; player.kickCd = 0;
  sparkles.forEach(s => { scene.remove(s.mesh); s.mesh.material.dispose(); });
  sparkles = [];
  stickerPop.classList.add('hidden');
  Object.assign(player, {
    laneIndex: 1, x: LANES_X[1], y: 0, z: 0, vy: 0, onGround: true,
    sliding: false, slideTimer: 0, health: PLAYER_MAX_HEALTH, maxHealth: PLAYER_MAX_HEALTH, invuln: 0, runCycle: 0,
  });
  buildLevel(level);
  scoreEl.textContent = score;
  renderPlayerHealth();
  updateHud();
  showLevelBanner(level);
  swipeHint.classList.remove('hidden');
}

function goToNextLevel() {
  // clearing the last chamber means you made it out with the Golden Banana
  if (level >= LEVEL_DATA.length) { endGame(true); return; }
  level += 1;
  player.health = Math.min(player.maxHealth, player.health + HEART_HEAL_AMOUNT);
  Object.assign(player, {
    laneIndex: 1, x: LANES_X[1], y: 0, z: 0, vy: 0, onGround: true,
    sliding: false, slideTimer: 0, invuln: 1.0, runCycle: 0,
  });
  buildLevel(level);
  renderPlayerHealth();
  updateHud();
  playShatter();
  showLevelBanner(level);
  sfx.levelUp();
}

function damagePlayer(n) {
  if (player.invuln > 0) return;
  player.health -= n;
  player.invuln = 1.5;
  camShake = 0.34;
  spawnSparkles(playerMesh.position.x, playerMesh.position.y + 0.9, playerMesh.position.z, 7, 0xffb0b0);
  renderPlayerHealth();
  sfx.damage();
}

function endGame(won) {
  state = won ? 'win' : 'lose';
  endTitle.textContent = won ? '🏆 You Escaped!' : 'Caught by the Temple';
  endMsg.textContent = won
    ? `You made it out with the Golden Banana! 🍌 ${ringCount} bananas — Score: ${score}`
    : `You got as far as ${LEVEL_DATA[(level - 1) % LEVEL_DATA.length].theme.name} — Score: ${score} — try again!`;
  renderTrophyShelf(won ? LEVEL_DATA.length : level - 1);
  renderStickerBook();
  // a run can end within the transition window; don't let shards sit on the results
  clearTimeout(playShatter._t);
  shatterEl.classList.add('hidden');
  flashEl.classList.add('hidden');
  shatterEl.innerHTML = '';
  stickerPop.classList.add('hidden');
  endScreen.classList.remove('hidden');
  kickBtn.classList.add('hidden');
  chamberMapEl.classList.add('hidden');
  levelBanner.classList.add('hidden');
  clearTimeout(showLevelBanner._t);
  pauseBtn.classList.add('hidden');
  if (won) sfx.levelUp(); else sfx.gameOver();
}

function togglePause() {
  if (state === 'playing') {
    state = 'paused';
    pauseScreen.classList.remove('hidden');
    pauseBtn.textContent = '▶';
  } else if (state === 'paused') {
    state = 'playing';
    pauseScreen.classList.add('hidden');
    pauseBtn.textContent = '⏸';
  }
}

// ---------- update ----------
function update(dt) {
  // lane smoothing
  const targetX = LANES_X[player.laneIndex];
  player.x += (targetX - player.x) * Math.min(1, dt * 10);

  // forward run
  player.z += forwardSpeed * dt;
  player.runCycle += dt * 10;
  exitFillEl.style.width = `${Math.min(100, Math.max(0, player.z / FINISH_Z) * 100)}%`;

  // jump physics
  player.vy -= GRAVITY * dt;
  player.y += player.vy * dt;
  if (player.y <= 0) { player.y = 0; player.vy = 0; player.onGround = true; }

  // slide timer
  if (player.sliding) {
    player.slideTimer -= dt;
    if (player.slideTimer <= 0) player.sliding = false;
  }

  if (player.invuln > 0) player.invuln -= dt;
  if (player.kickCd > 0) player.kickCd -= dt;
  if (player.kicking) {
    player.kickTimer -= dt;
    if (player.kickTimer <= 0) { player.kicking = false; player.kickTimer = 0; }
  }

  // crate collisions (must jump; pass-through damage, no wall-blocking)
  crates.forEach(c => {
    if (c.hit) return;
    const ut = performance.now() * 0.0026 + c.mesh.userData.phase;
    c.mesh.userData.glow.material.emissiveIntensity = 2.1 + Math.sin(ut) * 0.7;
    c.mesh.rotation.z = Math.sin(ut * 0.5) * 0.012;
    const sameLane = player.laneIndex === c.lane;
    // spin kick shatters the boulder before it can land a hit
    if (player.kicking && sameLane && rectClose(player.z, c.z, KICK_RANGE)) {
      c.hit = true;
      c.mesh.visible = false;
      score += 25; scoreEl.textContent = score;
      camShake = 0.28;
      spawnSparkles(c.mesh.position.x, 0.6, c.mesh.position.z, 20, 0xe8b44a, 1.4);
      spawnSparkles(c.mesh.position.x, 0.35, c.mesh.position.z, 10, 0x6b3a1e, 0.2);
      sfx.smash();
      return;
    }
    if (rectClose(player.z, c.z, HAZARD_RANGE) && sameLane && player.y < CRATE_HEIGHT) {
      c.hit = true; c.mesh.visible = false; damagePlayer(1);
    }
  });

  // rock tunnels: slide under them, or kick straight through
  bars.forEach(b => {
    if (b.hit) return;
    const gt = performance.now() * 0.0016 + b.mesh.userData.phase;
    b.mesh.userData.grille.position.y = Math.sin(gt) * 0.035;
    b.mesh.userData.grille.rotation.z = Math.sin(gt * 0.7) * 0.012;
    const sameLane = player.laneIndex === b.lane;
    if (player.kicking && sameLane && rectClose(player.z, b.z, KICK_RANGE)) {
      b.hit = true;
      b.mesh.visible = false;
      score += 35; scoreEl.textContent = score;
      camShake = 0.32;
      spawnSparkles(b.mesh.position.x, 1.6, b.mesh.position.z, 20, 0xe8b44a, 0.9);
      spawnSparkles(b.mesh.position.x, 0.9, b.mesh.position.z, 10, 0xffe9a8, 1.1);
      sfx.smash();
      return;
    }
    if (rectClose(player.z, b.z, HAZARD_RANGE) && sameLane && !player.sliding) {
      b.hit = true; b.mesh.visible = false; damagePlayer(1);
    }
  });

  // gap collisions (must swerve to a different lane; jump/slide do not help)
  gaps.forEach(gp => {
    if (gp.mesh) {
      const ud = gp.mesh.userData;
      const t = performance.now() * 0.001 + ud.phase;
      // fin patrols across the gap and banks as it turns
      ud.shark.position.x = Math.sin(t * 1.1) * 0.62;
      ud.shark.position.z = Math.cos(t * 0.7) * 1.1;
      // travelling right -> sweep trails left, and vice versa
      ud.shark.scale.x = Math.cos(t * 1.1) >= 0 ? 1 : -1;
      ud.shark.rotation.z = Math.cos(t * 1.1) * 0.1;
      ud.surf.position.y = -0.24 + Math.sin(t * 2.2) * 0.02;
    }
    if (gp.hit) return;
    if (rectClose(player.z, gp.z, HAZARD_RANGE) && player.laneIndex === gp.lane) {
      gp.hit = true; damagePlayer(1);
    }
  });

  // rings: collect + animate spin
  rings.forEach(r => {
    if (r.collected) { return; }
    r.mesh.rotation.y += dt * 3;
    const dz = r.z - player.z;
    const sameLane = player.laneIndex === r.lane;
    // magnet: once you're close and in the right lane, the banana comes to you
    if (sameLane && Math.abs(dz) < MAGNET_RANGE) {
      const pull = Math.min(1, dt * 7);
      r.mesh.position.x += (player.x - r.mesh.position.x) * pull;
      r.mesh.position.y += ((player.y + 0.85) - r.mesh.position.y) * pull;
      r.mesh.rotation.y += dt * 9;
    }
    if (sameLane && Math.abs(dz) < PICKUP_RANGE) {
      r.collected = true; r.mesh.visible = false;
      ringCount += 1;
      score += 5; scoreEl.textContent = score;
      spawnSparkles(r.mesh.position.x, r.mesh.position.y, r.mesh.position.z, 9, 0xffd23a);
      sfx.ring();
      updateHud();
    }
  });

  // cookies: the big bonus prize
  cookies.forEach(c => {
    if (c.collected) return;
    c.mesh.rotation.y += dt * 2.0;
    c.mesh.position.y = 1.15 + Math.sin(performance.now() * 0.0035 + c.z) * 0.1;
    const sameLane = player.laneIndex === c.lane;
    if (sameLane && Math.abs(c.z - player.z) < MAGNET_RANGE) {
      const pull = Math.min(1, dt * 6);
      c.mesh.position.x += (player.x - c.mesh.position.x) * pull;
      c.mesh.rotation.y += dt * 7;
    }
    if (sameLane && rectClose(player.z, c.z, PICKUP_RANGE)) {
      c.collected = true; c.mesh.visible = false;
      cookieCount += 1;
      score += 50; scoreEl.textContent = score;
      spawnSparkles(c.mesh.position.x, c.mesh.position.y, c.mesh.position.z, 16, 0xffd9a0);
      sfx.cookie();
      updateHud();
    }
  });

  // stickers: spin, magnetise, and drop into the sticker book
  stickerPickups.forEach(s => {
    if (s.collected) return;
    // rock gently rather than spin - a full spin hides the art half the time
    const st = performance.now() * 0.0022 + s.z;
    s.mesh.rotation.y = Math.sin(st) * 0.34;
    s.mesh.rotation.z = Math.cos(st * 0.8) * 0.12;
    s.mesh.position.y = 1.35 + Math.sin(st * 1.4) * 0.12;
    const sameLane = player.laneIndex === s.lane;
    if (sameLane && Math.abs(s.z - player.z) < MAGNET_RANGE) {
      const pull = Math.min(1, dt * 6);
      s.mesh.position.x += (player.x - s.mesh.position.x) * pull;
      s.mesh.rotation.y = Math.sin(st * 4) * 0.3;
    }
    if (sameLane && rectClose(player.z, s.z, PICKUP_RANGE)) {
      s.collected = true; s.mesh.visible = false;
      if (!stickerBook.has(s.def.id)) { stickerBook.add(s.def.id); saveStickerBook(stickerBook); }
      score += 100; scoreEl.textContent = score;
      spawnSparkles(s.mesh.position.x, s.mesh.position.y, s.mesh.position.z, 22, 0xfff0b0);
      sfx.sticker();
      showStickerPop(s.def);
      updateHud();
    }
  });

  // heart pickups: collect + animate bob/spin
  heartPickups.forEach(h => {
    if (h.collected) return;
    h.mesh.rotation.y += dt * 2.4;
    h.mesh.position.y = 0.9 + Math.sin(performance.now() * 0.004 + h.z) * 0.08;
    if (rectClose(player.z, h.z, PICKUP_RANGE) && player.laneIndex === h.lane) {
      h.collected = true; h.mesh.visible = false;
      player.health = Math.min(player.maxHealth, player.health + HEART_HEAL_AMOUNT);
      renderPlayerHealth();
      spawnSparkles(h.mesh.position.x, h.mesh.position.y, h.mesh.position.z, 11, 0x7dff8a);
      sfx.heal();
    }
  });

  // fire vents: jump them. Only hits when the runner is below FIRE_CLEAR_Y.
  enemies.forEach(e => {
    const ud = e.mesh.userData;
    const f = 0.86 + Math.sin(performance.now() * 0.013 + e.z) * 0.14;
    ud.flames.scale.set(1 + (f - 1) * 0.6, f, 1 + (f - 1) * 0.6);
    ud.flames.rotation.y += dt * 2.4;
    ud.glow.forEach(m => { m.material.emissiveIntensity = 1.9 + (f - 0.86) * 3.2; });
    if (player.invuln <= 0
        && rectClose(player.z, e.z, HAZARD_RANGE)
        && player.laneIndex === e.lane
        && player.y < FIRE_CLEAR_Y) {
      damagePlayer(1);
    }
  });

  // lose / advance level
  if (player.health <= 0 && state === 'playing') { endGame(false); return; }
  if (player.z >= FINISH_Z && state === 'playing') { goToNextLevel(); return; }

  // ---------- character animation ----------
  const rig = playerMesh.userData;
  const moving = player.onGround && !player.sliding;
  const s = player.runCycle;

  // body rises twice per stride (once per foot push-off), not once
  // squash on the slide so the crouch actually passes under the rock ledges;
  // the drop is derived from the squash so the feet stay planted mid-transition
  const targetSquash = player.sliding ? SLIDE_SQUASH : 1;
  playerSquashY += (targetSquash - playerSquashY) * Math.min(1, dt * 16);
  const squashT = (1 - playerSquashY) / (1 - SLIDE_SQUASH);
  const slideDrop = squashT * SLIDE_FOOT_LIFT;
  const bob = moving ? Math.abs(Math.sin(s)) * 0.075 : 0;
  playerMesh.position.set(player.x, player.y + bob - slideDrop, player.z);

  // landing impact squash, and a slight stretch while rising through a jump
  if (player.onGround && !wasOnGround) { landSquash = 1; spawnSparkles(player.x, 0.12, player.z, 5, 0xe8dcc0); }
  wasOnGround = player.onGround;
  landSquash = Math.max(0, landSquash - dt * 4.5);
  const stretch = !player.onGround ? Math.max(-0.05, Math.min(0.08, player.vy * 0.011)) : 0;
  playerMesh.scale.set(
    1 + landSquash * 0.2 - stretch * 0.5,
    playerSquashY * (1 - landSquash * 0.24) * (1 + stretch),
    1 + landSquash * 0.2 - stretch * 0.5,
  );
  // banking into the lane change reads as weight shift
  const bankTarget = (player.x - LANES_X[player.laneIndex]) * 0.08;
  playerMesh.rotation.z += (bankTarget - playerMesh.rotation.z) * Math.min(1, dt * 8);
  playerMesh.rotation.x += (0 - playerMesh.rotation.x) * Math.min(1, dt * 10);

  if (player.kicking) {
    // 360 spin kick: whole body turns once, kicking leg whips out sideways
    const kp = 1 - Math.max(0, player.kickTimer) / KICK_DURATION;
    const whip = Math.sin(kp * Math.PI);
    playerMesh.rotation.y = kp * Math.PI * 2;
    rig.hips.rotation.y = 0;
    rig.torso.rotation.set(0.12, 0, -whip * 0.3);
    rig.head.rotation.set(-0.06, 0, 0);
    rig.legR.rotation.set(-0.12 * whip, 0, -whip * 1.35);
    rig.kneeR.rotation.x = -(0.55 - whip * 0.5);
    rig.legL.rotation.set(0.18, 0, whip * 0.22);
    rig.kneeL.rotation.x = -(0.3 + whip * 0.55);
    rig.armL.rotation.set(-0.25, 0, whip * 1.2);
    rig.armR.rotation.set(-0.25, 0, -whip * 0.95);
    rig.elbowL.rotation.x = -0.5;
    rig.elbowR.rotation.x = -0.62;
  } else if (moving) {
    playerMesh.rotation.y += (0 - playerMesh.rotation.y) * Math.min(1, dt * 14);
    // thigh swing with a small second harmonic so it is not a pure sine
    const thighL = Math.sin(s) * 0.82 + Math.sin(2 * s) * 0.07;
    const thighR = Math.sin(s + Math.PI) * 0.82 + Math.sin(2 * s + Math.PI) * 0.07;
    rig.legL.rotation.set(thighL, 0, 0);
    rig.legR.rotation.set(thighR, 0, 0);
    // knee stays near-straight at footstrike and tucks hard through recovery
    rig.kneeL.rotation.x = -(0.16 + 1.35 * Math.max(0, -Math.sin(s + 0.45)));
    rig.kneeR.rotation.x = -(0.16 + 1.35 * Math.max(0, -Math.sin(s + Math.PI + 0.45)));
    // arms drive opposite the same-side leg, elbows held bent like a real runner
    rig.armL.rotation.set(-Math.sin(s) * 0.62, 0, 0);
    rig.armR.rotation.set(-Math.sin(s + Math.PI) * 0.62, 0, 0);
    rig.elbowL.rotation.x = -(0.95 + 0.42 * Math.max(0, Math.sin(s)));
    rig.elbowR.rotation.x = -(0.95 + 0.42 * Math.max(0, Math.sin(s + Math.PI)));
    // hips and shoulders twist against each other; head steadies itself
    rig.hips.rotation.y = Math.sin(s) * 0.15;
    rig.torso.rotation.y = -Math.sin(s) * 0.19;
    rig.torso.rotation.x = 0.14;
    rig.torso.rotation.z = Math.sin(s) * 0.05;
    rig.head.rotation.y = Math.sin(s) * 0.055;
    rig.head.rotation.x = -0.11;
  } else if (!player.onGround) {
    playerMesh.rotation.y += (0 - playerMesh.rotation.y) * Math.min(1, dt * 14);
    // airborne: front knee tucked up, back leg trailing, arms lifted
    rig.legL.rotation.set(0.95, 0, 0); rig.kneeL.rotation.x = -1.5;
    rig.legR.rotation.set(-0.35, 0, 0); rig.kneeR.rotation.x = -0.55;
    rig.armL.rotation.set(-1.5, 0, 0); rig.elbowL.rotation.x = -0.75;
    rig.armR.rotation.set(-1.15, 0, 0); rig.elbowR.rotation.x = -1.0;
    rig.hips.rotation.y = 0;
    rig.torso.rotation.set(0.05, 0, 0);
    rig.head.rotation.set(-0.08, 0, 0);
  } else {
    playerMesh.rotation.y += (0 - playerMesh.rotation.y) * Math.min(1, dt * 14);
    // sliding: deep crouch with the head tucked low, knees folded under
    rig.legL.rotation.set(0.85, 0, 0); rig.kneeL.rotation.x = -1.75;
    rig.legR.rotation.set(0.55, 0, 0); rig.kneeR.rotation.x = -1.85;
    rig.armL.rotation.set(0.85, 0, 0); rig.elbowL.rotation.x = -0.35;
    rig.armR.rotation.set(0.7, 0, 0); rig.elbowR.rotation.x = -0.45;
    rig.hips.rotation.y = 0;
    rig.torso.rotation.set(0.85, 0, 0);
    rig.head.rotation.set(-0.55, 0, 0);
  }
  // torch flicker: jitter brightness and flame scale so the corridor feels lit by fire
  const tNow = performance.now() * 0.006;
  torchLights.forEach(t => {
    const f = 0.78 + Math.sin(tNow + t.phase) * 0.14 + Math.sin(tNow * 2.7 + t.phase * 1.7) * 0.08;
    if (t.light) t.light.intensity = 2.4 * f;
    t.flame.scale.set(0.9 + f * 0.18, f, 0.9 + f * 0.18);
  });

  // camera chase
  const camTargetX = player.x * 0.6;
  camera.position.x += (camTargetX - camera.position.x) * Math.min(1, dt * 5);
  camera.position.y = player.y + CAMERA_HEIGHT;
  camera.position.z = player.z - CAMERA_DISTANCE;
  camera.lookAt(player.x, player.y + 0.85, player.z + 12);
  camera.rotateZ((camTargetX - camera.position.x) * -0.015);
  if (camShake > 0) {
    camShake = Math.max(0, camShake - dt * 1.6);
    camera.position.x += (Math.random() - 0.5) * camShake;
    camera.position.y += (Math.random() - 0.5) * camShake;
  }

  updateSparkles(dt);

  const kickReady = player.kickCd <= 0;
  if (kickReady !== kickBtnReady) {
    kickBtn.classList.toggle('cooling', !kickReady);
    kickBtnReady = kickReady;
  }

  // sun follows player for tight shadow frustum
  sun.position.set(player.x - 18, player.y + 26, player.z - 14);
  sunTarget.position.set(player.x, player.y, player.z + 6);
  sunTarget.updateMatrixWorld();
}

// ---------- main loop ----------
let last = performance.now();
function tick(now) {
  const dt = Math.min((now - last) / 1000, 0.033);
  last = now;
  if (state === 'playing') update(dt);
  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}

document.getElementById('start-btn').addEventListener('click', () => {
  ensureAudio();
  startScreen.classList.add('hidden');
  startNewGame();
  state = 'playing';
  pauseBtn.textContent = '⏸';
  pauseBtn.classList.remove('hidden');
  kickBtn.classList.remove('hidden');
});
document.getElementById('retry-btn').addEventListener('click', () => {
  ensureAudio();
  endScreen.classList.add('hidden');
  startNewGame();
  state = 'playing';
  pauseBtn.textContent = '⏸';
  pauseBtn.classList.remove('hidden');
  kickBtn.classList.remove('hidden');
});
kickBtn.addEventListener('click', e => { e.preventDefault(); ensureAudio(); tryKick(); dismissHint(); });
pauseBtn.addEventListener('click', togglePause);
document.getElementById('resume-btn').addEventListener('click', togglePause);

resize();
buildLevel(1);
renderPlayerHealth();
updateHud();
camera.position.set(0, CAMERA_HEIGHT, -CAMERA_DISTANCE);
camera.lookAt(0, 0.85, 12);
requestAnimationFrame(tick);
