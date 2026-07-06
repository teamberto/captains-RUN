// ---------- Tank 95: 3D chase-cam lane runner (Three.js) ----------
const canvas = document.getElementById('game');
const scoreEl = document.getElementById('score-val');
const playerHealthFillEl = document.getElementById('player-health-fill');
const levelValEl = document.getElementById('level-val');
const ringValEl = document.getElementById('ring-val');
const chargeValEl = document.getElementById('charge-val');
const startScreen = document.getElementById('start-screen');
const endScreen = document.getElementById('end-screen');
const endTitle = document.getElementById('end-title');
const endMsg = document.getElementById('end-msg');
const bossBarWrap = document.getElementById('boss-bar-wrap');
const bossBarFill = document.getElementById('boss-bar-fill');
const bossNameEl = document.getElementById('boss-name');
const swipeHint = document.getElementById('swipe-hint');
const levelBanner = document.getElementById('level-banner');
const pauseBtn = document.getElementById('pause-btn');
const pauseScreen = document.getElementById('pause-screen');

let state = 'start'; // start | playing | win | lose

// ---------- constants ----------
const LANES_X = [2.4, 0, -2.4]; // index 0/1/2 = screen-left/center/right (camera faces +Z, mirroring world X)
const FORWARD_SPEED = 14;
const SPEED_PER_LEVEL = 1.2;
const MAX_FORWARD_SPEED = 24;
const JUMP_V = 9.2;
const GRAVITY = 28;
const CRATE_HEIGHT = 0.9;
const SLIDE_DURATION = 0.55;
const BULLET_SPEED = 30;
const HIT_RANGE = 1.1;
const BOSS_ENGAGE_Z = 240;
const FINISH_Z = 262;
const ROAD_LEN = FINISH_Z + 40;
const RING_PER_CHARGE = 10;
const MAX_POWER_CHARGES = 3;
const PLAYER_MAX_HEALTH = 20;
const HEART_HEAL_AMOUNT = 5;
const CAMERA_HEIGHT = 3.4;
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
  shoot: () => tone(880, 0.07, 'square', 0.07, 0, 660),
  powerShot: () => { tone(220, 0.28, 'sawtooth', 0.16, 0, 900); tone(1300, 0.15, 'square', 0.08, 0.02); },
  hitEnemy: () => tone(320, 0.12, 'square', 0.12, 0, 120),
  bossHit: () => { tone(180, 0.14, 'sawtooth', 0.14, 0, 90); noiseBurst(0.07, 0.09); },
  powerHit: () => { tone(160, 0.3, 'sawtooth', 0.2, 0, 60); noiseBurst(0.2, 0.22); },
  ring: () => tone(1046, 0.08, 'sine', 0.12, 0, 1568),
  powerCharge: () => { tone(660, 0.1, 'sine', 0.1, 0, 1200); tone(990, 0.12, 'sine', 0.1, 0.08, 1600); },
  jump: () => tone(400, 0.12, 'triangle', 0.1, 0, 700),
  slide: () => tone(220, 0.1, 'triangle', 0.08, 0, 110),
  damage: () => { noiseBurst(0.18, 0.22); tone(150, 0.25, 'sawtooth', 0.14, 0, 60); },
  heal: () => { tone(523, 0.14, 'sine', 0.14, 0, 784); tone(659, 0.16, 'sine', 0.12, 0.08, 988); },
  levelUp: () => { [0, 0.12, 0.24, 0.36].forEach((d, i) => tone(392 * (i + 1) / 1.5, 0.2, 'square', 0.12, d)); },
  gameOver: () => { [500, 400, 300, 200].forEach((f, i) => tone(f, 0.25, 'sawtooth', 0.15, i * 0.15)); },
};

// ---------- level theme data ----------
const LEVEL_DATA = [
  { // Level 1: Green Hills
    theme: {
      name: 'Green Hills', skyTop: 0x2e8fe0, skyBottom: 0xdff3ff, fog: 0xbfe8ff,
      groundTint: 0xffffff, plankTint: 0xffffff, rock: 0x8a7a68,
      hemiSky: 0xbfe3ff, hemiGround: 0x4c7a35, sunColor: 0xfff2d8,
      leafColor: 0x3f8f4f, trunkColor: 0x7a5230,
      bossType: 0, bossName: 'Iron Sentry',
    },
    crates: [{ z: 30, lane: 1 }, { z: 80, lane: 2 }, { z: 155, lane: 1 }],
    bars: [{ z: 65, lane: 1 }, { z: 170, lane: 0 }],
    gaps: [{ z: 115, lane: 2 }, { z: 200, lane: 0 }],
    enemies: [{ z: 55, lane: 0 }, { z: 105, lane: 1 }, { z: 130, lane: 0 }, { z: 180, lane: 2 }, { z: 205, lane: 0 }],
    rings: [[15, 1], [18, 1], [21, 1], [42, 0], [45, 0], [48, 0], [95, 2], [98, 2], [101, 2], [140, 1], [143, 1], [146, 1], [190, 2], [193, 2], [196, 2]],
    hearts: [[10, 2], [225, 1]],
  },
  { // Level 2: Egg Canyon
    theme: {
      name: 'Egg Canyon', skyTop: 0xe0862e, skyBottom: 0xffe9c2, fog: 0xffd9a0,
      groundTint: 0xe0b070, plankTint: 0xffd9a8, rock: 0x9c5a34,
      hemiSky: 0xffd9a0, hemiGround: 0x8a5a2a, sunColor: 0xffe0b0,
      leafColor: 0xb5822f, trunkColor: 0x6b4020,
      bossType: 1, bossName: 'Egg Pilot',
    },
    crates: [{ z: 35, lane: 0 }, { z: 90, lane: 1 }, { z: 160, lane: 2 }],
    bars: [{ z: 60, lane: 2 }, { z: 150, lane: 1 }],
    gaps: [{ z: 75, lane: 1 }, { z: 120, lane: 0 }, { z: 210, lane: 2 }],
    enemies: [{ z: 50, lane: 1 }, { z: 100, lane: 0 }, { z: 135, lane: 2 }, { z: 175, lane: 1 }, { z: 195, lane: 0 }, { z: 215, lane: 2 }],
    rings: [[20, 2], [23, 2], [26, 2], [45, 1], [48, 1], [51, 1], [110, 0], [113, 0], [116, 0], [145, 2], [148, 2], [151, 2], [185, 1], [188, 1], [191, 1]],
    hearts: [[10, 0], [230, 2]],
  },
  { // Level 3: Frost Peaks
    theme: {
      name: 'Frost Peaks', skyTop: 0x23406b, skyBottom: 0xcfe8ff, fog: 0xdbeeff,
      groundTint: 0xe8f0f5, plankTint: 0xcfe0e8, rock: 0x6d7d8a,
      hemiSky: 0xdbeeff, hemiGround: 0x8a9aa8, sunColor: 0xd8ecff,
      leafColor: 0xdfeef5, trunkColor: 0x556570,
      bossType: 0, bossName: 'Frost Sentry',
    },
    crates: [{ z: 40, lane: 2 }, { z: 95, lane: 0 }, { z: 165, lane: 1 }],
    bars: [{ z: 70, lane: 0 }, { z: 155, lane: 2 }],
    gaps: [{ z: 55, lane: 1 }, { z: 130, lane: 2 }, { z: 195, lane: 0 }],
    enemies: [{ z: 60, lane: 2 }, { z: 110, lane: 1 }, { z: 140, lane: 0 }, { z: 185, lane: 2 }, { z: 205, lane: 1 }, { z: 220, lane: 0 }],
    rings: [[25, 0], [28, 0], [31, 0], [80, 1], [83, 1], [86, 1], [120, 2], [123, 2], [126, 2], [150, 0], [153, 0], [156, 0], [200, 1], [203, 1], [206, 1]],
    hearts: [[12, 1], [232, 2]],
  },
  { // Level 4: Night City
    theme: {
      name: 'Night City', skyTop: 0x0b1030, skyBottom: 0x33306a, fog: 0x201f45,
      groundTint: 0x3a3a48, plankTint: 0x55506a, rock: 0x1c1c22,
      hemiSky: 0x3a3a7a, hemiGround: 0x14141c, sunColor: 0x9fb0ff,
      leafColor: 0x2a2a55, trunkColor: 0x1a1a22,
      bossType: 1, bossName: 'Neon Pilot',
    },
    crates: [{ z: 32, lane: 1 }, { z: 85, lane: 2 }, { z: 150, lane: 0 }],
    bars: [{ z: 58, lane: 2 }, { z: 165, lane: 1 }],
    gaps: [{ z: 70, lane: 0 }, { z: 110, lane: 1 }, { z: 190, lane: 2 }],
    enemies: [{ z: 45, lane: 0 }, { z: 95, lane: 1 }, { z: 125, lane: 2 }, { z: 170, lane: 0 }, { z: 200, lane: 1 }, { z: 218, lane: 2 }],
    rings: [[16, 2], [19, 2], [22, 2], [50, 0], [53, 0], [56, 0], [100, 1], [103, 1], [106, 1], [155, 2], [158, 2], [161, 2], [195, 0], [198, 0], [201, 0]],
    hearts: [[10, 0], [230, 1]],
  },
];

// ---------- runtime progress state ----------
let level = 1;
let score = 0;
let ringCount = 0;
let powerCharges = 0;
let forwardSpeed = FORWARD_SPEED;

// ---------- game state ----------
const player = {
  laneIndex: 1, x: LANES_X[1], y: 0, z: 0, vy: 0, onGround: true,
  sliding: false, slideTimer: 0,
  health: PLAYER_MAX_HEALTH, maxHealth: PLAYER_MAX_HEALTH, invuln: 0, fireCooldown: 0, runCycle: 0,
};
let crates = [];
let bars = [];
let gaps = [];
let enemies = [];
let rings = [];
let heartPickups = [];
let bullets = [];
let enemyBullets = [];
const boss = { z: 250, x: 0, health: 20, maxHealth: 20, alive: true, engaged: false, fireCooldown: 1.2, laneTimer: 0, hitFlash: 0, type: 0 };

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
  if (Math.max(absX, absY) < 30) return;
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

function makeCloud(x, y, z) {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, emissive: 0x333333 });
  for (let i = 0; i < 4; i++) {
    const puff = new THREE.Mesh(new THREE.SphereGeometry(1.6 + Math.random(), 8, 8), mat);
    puff.position.set(i * 1.4 - 2, Math.random() * 0.4, Math.random() * 0.6);
    puff.scale.y = 0.6;
    g.add(puff);
  }
  g.position.set(x, y, z);
  scene.add(g);
}
for (let z = 0; z < ROAD_LEN; z += 26) {
  makeCloud(-16 + Math.random() * 8, 16 + Math.random() * 6, z);
  makeCloud(16 - Math.random() * 8, 14 + Math.random() * 8, z + 12);
}

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
function makeWoodTexture() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 256;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#a9743f';
  ctx.fillRect(0, 0, 256, 256);
  const plankH = 32;
  for (let y = 0; y < 256; y += plankH) {
    ctx.fillStyle = `rgb(${150 + Math.random() * 30 - 15},${100 + Math.random() * 20 - 10},${55 + Math.random() * 16 - 8})`;
    ctx.fillRect(0, y, 256, plankH - 3);
    ctx.strokeStyle = 'rgba(60,35,15,0.5)';
    ctx.lineWidth = 3;
    ctx.strokeRect(0, y, 256, plankH - 3);
    ctx.strokeStyle = 'rgba(70,42,20,0.35)';
    for (let i = 0; i < 6; i++) {
      const gx = Math.random() * 256;
      ctx.beginPath(); ctx.moveTo(gx, y); ctx.lineTo(gx + (Math.random() * 10 - 5), y + plankH - 3); ctx.stroke();
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping; tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeGrassTexture() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 256;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#4f9143';
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 3000; i++) {
    const x = Math.random() * 256, y = Math.random() * 256;
    ctx.fillStyle = Math.random() > 0.5 ? 'rgba(70,140,55,0.5)' : 'rgba(35,90,35,0.5)';
    ctx.fillRect(x, y, 2, 5);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping; tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeWarningStripeTexture() {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 32;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#e0c419';
  ctx.fillRect(0, 0, 128, 32);
  ctx.fillStyle = '#20201c';
  const stripeW = 18;
  for (let x = -32; x < 128 + 32; x += stripeW * 2) {
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(x, 0); ctx.lineTo(x + stripeW, 0); ctx.lineTo(x + stripeW - 32, 32); ctx.lineTo(x - 32, 32);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping; tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 1);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const woodTex = makeWoodTexture();
woodTex.repeat.set(1, 8);
const grassTex = makeGrassTexture();
grassTex.repeat.set(4, ROAD_LEN / 6);

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

// ---------- world (road/grass/trees) rebuilt per level ----------
let roadMeshes = [];
let grassMeshes = [];
let treeMeshes = [];

function makeTree(x, z, theme) {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 1.4, 8), new THREE.MeshStandardMaterial({ color: theme.trunkColor, roughness: 0.9 }));
  trunk.position.y = 0.7;
  trunk.castShadow = true;
  const leaves = new THREE.Mesh(new THREE.SphereGeometry(1.1, 8, 8), new THREE.MeshStandardMaterial({ color: theme.leafColor, roughness: 0.85 }));
  leaves.position.y = 1.9;
  leaves.castShadow = true;
  g.add(trunk, leaves);
  g.position.set(x, 0, z);
  return g;
}

function buildRoadForLevel(levelGaps, theme) {
  roadMeshes = clearList(roadMeshes);
  grassMeshes = clearList(grassMeshes);
  treeMeshes = clearList(treeMeshes);

  const rockMat = new THREE.MeshStandardMaterial({ color: theme.rock, roughness: 1 });
  const rockBase = new THREE.Mesh(new THREE.BoxGeometry(8.2, 0.3, ROAD_LEN), rockMat);
  rockBase.position.set(0, -0.35, ROAD_LEN / 2 - 10);
  rockBase.receiveShadow = true;
  scene.add(rockBase); roadMeshes.push(rockBase);

  const plankMat = new THREE.MeshStandardMaterial({ map: woodTex, roughness: 0.9, color: theme.plankTint });
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

  const grassMat = new THREE.MeshStandardMaterial({ map: grassTex, color: theme.groundTint, roughness: 1 });
  [-9, 9].forEach(x => {
    const grass = new THREE.Mesh(new THREE.BoxGeometry(10, 0.3, ROAD_LEN), grassMat);
    grass.position.set(x, -0.25, ROAD_LEN / 2 - 10);
    grass.receiveShadow = true;
    scene.add(grass); grassMeshes.push(grass);
  });

  for (let z = -5; z < ROAD_LEN; z += 9) {
    const t1 = makeTree(-6.2 - Math.random() * 3, z, theme);
    const t2 = makeTree(6.2 + Math.random() * 3, z, theme);
    scene.add(t1, t2);
    treeMeshes.push(t1, t2);
  }
}

// ---------- tank builder (player) ----------
function makeNumberTexture(text) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 256;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#ffd400';
  ctx.fillRect(0, 0, 256, 256);
  ctx.fillStyle = '#c81e0f';
  ctx.font = '900 150px -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 128, 138);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
const numberTex = makeNumberTexture('95');

function castAll(obj) {
  obj.traverse(o => { if (o.isMesh) { o.castShadow = true; } });
  return obj;
}

function buildTank(scale, color) {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color, roughness: 0.4, metalness: 0.25 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x1c1c1c, roughness: 0.7, metalness: 0.2 });
  const metalMat = new THREE.MeshStandardMaterial({ color: 0xcfcfcf, roughness: 0.3, metalness: 0.7 });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.15, metalness: 0.6 });

  const body = new THREE.Mesh(new THREE.BoxGeometry(1.6 * scale, 0.9 * scale, 2.4 * scale), bodyMat);
  body.position.y = 0.65 * scale;
  g.add(body);

  // beveled trim along the body edges for a less "flat box" silhouette
  const trimMat = new THREE.MeshStandardMaterial({ color: 0xb02615, roughness: 0.4, metalness: 0.3 });
  const trimTop = new THREE.Mesh(new THREE.BoxGeometry(1.68 * scale, 0.1 * scale, 2.48 * scale), trimMat);
  trimTop.position.y = 1.05 * scale;
  g.add(trimTop);

  const stripeMat = new THREE.MeshStandardMaterial({ color: 0xffd400, roughness: 0.5, metalness: 0.1 });
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(1.62 * scale, 0.22 * scale, 2.42 * scale), stripeMat);
  stripe.position.y = 0.5 * scale;
  g.add(stripe);

  const trackMat = new THREE.MeshStandardMaterial({ color: 0x1c1c1c, roughness: 0.85 });
  [-1, 1].forEach(side => {
    const track = new THREE.Mesh(new THREE.BoxGeometry(0.34 * scale, 0.55 * scale, 2.6 * scale), trackMat);
    track.position.set(side * 0.95 * scale, 0.28 * scale, 0);
    g.add(track);
    // wheel hubs along the track for mechanical detail
    for (let i = -1; i <= 1; i++) {
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.16 * scale, 0.16 * scale, 0.36 * scale, 10), metalMat);
      hub.rotation.z = Math.PI / 2;
      hub.position.set(side * 0.95 * scale, 0.24 * scale, i * 0.85 * scale);
      g.add(hub);
    }
  });

  const turret = new THREE.Mesh(new THREE.CylinderGeometry(0.5 * scale, 0.55 * scale, 0.5 * scale, 16), bodyMat);
  turret.position.set(0, 1.25 * scale, 0.1 * scale);
  g.add(turret);
  const turretRing = new THREE.Mesh(new THREE.TorusGeometry(0.52 * scale, 0.05 * scale, 8, 16), metalMat);
  turretRing.rotation.x = Math.PI / 2;
  turretRing.position.set(0, 1.02 * scale, 0.1 * scale);
  g.add(turretRing);

  const cannon = new THREE.Mesh(new THREE.CylinderGeometry(0.11 * scale, 0.11 * scale, 1.5 * scale, 10), metalMat);
  cannon.rotation.x = Math.PI / 2;
  cannon.position.set(0, 1.25 * scale, 0.1 * scale + 0.9 * scale);
  g.add(cannon);
  const cannonTip = new THREE.Mesh(new THREE.CylinderGeometry(0.15 * scale, 0.13 * scale, 0.22 * scale, 10), darkMat);
  cannonTip.rotation.x = Math.PI / 2;
  cannonTip.position.set(0, 1.25 * scale, 0.1 * scale + 1.62 * scale);
  g.add(cannonTip);

  // antenna
  const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.02 * scale, 0.025 * scale, 0.7 * scale, 6), metalMat);
  antenna.position.set(0.3 * scale, 1.75 * scale, -0.15 * scale);
  g.add(antenna);
  const antennaTip = new THREE.Mesh(new THREE.SphereGeometry(0.05 * scale, 8, 8), new THREE.MeshStandardMaterial({ color: 0xff3333, emissive: 0xff0000, emissiveIntensity: 1 }));
  antennaTip.position.set(0.3 * scale, 2.1 * scale, -0.15 * scale);
  g.add(antennaTip);

  // exhaust pipes at rear corners
  [-0.55, 0.55].forEach(x => {
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.09 * scale, 0.09 * scale, 0.4 * scale, 8), darkMat);
    pipe.position.set(x * scale, 1.0 * scale, -1.22 * scale);
    g.add(pipe);
  });

  // headlights at front-bottom
  [-0.55, 0.55].forEach(x => {
    const light = new THREE.Mesh(new THREE.SphereGeometry(0.09 * scale, 8, 8), new THREE.MeshStandardMaterial({ color: 0xfff6c8, emissive: 0xffee88, emissiveIntensity: 1.4 }));
    light.position.set(x * scale, 0.55 * scale, 1.21 * scale);
    g.add(light);
  });

  [-0.18, 0.18].forEach(ex => {
    const eyeWhite = new THREE.Mesh(new THREE.SphereGeometry(0.13 * scale, 10, 10), new THREE.MeshStandardMaterial({ color: 0xffffff }));
    eyeWhite.position.set(ex * scale, 1.45 * scale, 0.55 * scale);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.06 * scale, 8, 8), new THREE.MeshStandardMaterial({ color: 0x222222 }));
    pupil.position.set(ex * scale, 1.45 * scale, 0.63 * scale);
    g.add(eyeWhite, pupil);
  });

  const decal = new THREE.Mesh(new THREE.PlaneGeometry(1.0 * scale, 1.0 * scale), new THREE.MeshStandardMaterial({ map: numberTex, roughness: 0.6 }));
  decal.rotation.y = Math.PI;
  decal.position.set(0, 0.68 * scale, -1.21 * scale);
  g.add(decal);

  castAll(g);
  return g;
}

const playerMesh = buildTank(1, 0xff3b30);
scene.add(playerMesh);

// ---------- fireball enemies ----------
function makeFireballMesh() {
  const g = new THREE.Group();
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.5, 14, 14), new THREE.MeshStandardMaterial({ color: 0x9a3fe0, emissive: 0x8a2be2, emissiveIntensity: 1.5, roughness: 0.3 }));
  g.add(core);
  const spikeMat = new THREE.MeshStandardMaterial({ color: 0xc17bff, emissive: 0x9a3fe0, emissiveIntensity: 1.7, transparent: true, opacity: 0.85 });
  const spikes = [];
  for (let i = 0; i < 6; i++) {
    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.55, 6), spikeMat);
    const ang = (i / 6) * Math.PI * 2;
    spike.position.set(Math.cos(ang) * 0.32, 0.05 + (i % 2) * 0.15, Math.sin(ang) * 0.32);
    spike.lookAt(spike.position.clone().multiplyScalar(2));
    spike.rotateX(Math.PI / 2);
    spikes.push(spike);
    g.add(spike);
  }
  g.position.y = 0.55;
  g.userData.spikes = spikes;
  return g;
}

// ---------- boss builder ----------
function buildBoss(type, palette) {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color: palette.body, roughness: 0.4, metalness: 0.6 });
  const accentMat = new THREE.MeshStandardMaterial({ color: palette.accent, roughness: 0.3, metalness: 0.5 });
  const eyeMat = new THREE.MeshStandardMaterial({ color: 0xff2222, emissive: 0xff0000, emissiveIntensity: 2 });

  if (type === 0) {
    // Iron Sentry: boxy torso, cylindrical head, single glowing eye
    const torso = new THREE.Mesh(new THREE.BoxGeometry(2.2, 2.0, 1.6), bodyMat); torso.position.y = 1.7; g.add(torso);
    const chestVent = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.6, 0.1), accentMat); chestVent.position.set(0, 1.7, 0.85); g.add(chestVent);
    const head = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.65, 0.7, 10), accentMat); head.position.y = 3.0; g.add(head);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 10), eyeMat); eye.position.set(0, 3.0, 0.6); g.add(eye);
    [-1.35, 1.35].forEach(x => {
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 1.7, 8), bodyMat);
      arm.position.set(x, 1.75, 0); arm.rotation.z = (Math.PI / 20) * Math.sign(x);
      g.add(arm);
    });
    [-0.7, 0.7].forEach(x => {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.38, 1.5, 8), accentMat);
      leg.position.set(x, 0.75, 0); g.add(leg);
    });
  } else {
    // Egg Pilot: round pod body, dome head, mustache trim, hover base
    const pod = new THREE.Mesh(new THREE.SphereGeometry(1.3, 16, 16), bodyMat); pod.scale.set(1, 0.85, 1); pod.position.y = 2.0; g.add(pod);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.6, 12, 12, 0, Math.PI * 2, 0, Math.PI / 2), accentMat); dome.position.y = 2.85; g.add(dome);
    const mustache = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.09, 8, 16, Math.PI), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 }));
    mustache.position.set(0, 2.4, 0.98); mustache.rotation.x = Math.PI / 2; g.add(mustache);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 10), eyeMat); eye.position.set(0, 2.8, 0.55); g.add(eye);
    [-1.15, 1.15].forEach(x => {
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 1.3, 8), accentMat);
      arm.position.set(x, 1.7, 0); g.add(arm);
      const fist = new THREE.Mesh(new THREE.SphereGeometry(0.24, 8, 8), bodyMat);
      fist.position.set(x, 1.05, 0); g.add(fist);
    });
    const hoverBase = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 0.6, 0.5, 16), bodyMat); hoverBase.position.y = 0.5; g.add(hoverBase);
    const hoverGlow = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.85, 0.06, 16), new THREE.MeshStandardMaterial({ color: 0x66ccff, emissive: 0x2299ff, emissiveIntensity: 1.5 }));
    hoverGlow.position.y = 0.25; g.add(hoverGlow);
  }
  castAll(g);
  return g;
}
const BOSS_PALETTES = [
  { body: 0x9fb3c8, accent: 0xdde8f0 },
  { body: 0xcc2b2b, accent: 0xf2f2f2 },
  { body: 0x5a7fbf, accent: 0xe8f2ff },
  { body: 0x6a2bcc, accent: 0xe9dbff },
];
let bossMesh = null;

// ---------- coin collectible ----------
function makeCoinMesh() {
  const g = new THREE.Group();
  const goldMat = new THREE.MeshStandardMaterial({ color: 0xf7c600, emissive: 0x4a3400, emissiveIntensity: 0.5, metalness: 0.95, roughness: 0.1 });
  const coin = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.24, 24), goldMat);
  coin.rotation.x = Math.PI / 2;
  g.add(coin);
  // raised rim for a defined coin edge
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.38, 0.05, 8, 24), goldMat);
  rim.rotation.x = Math.PI / 2;
  g.add(rim);
  // embossed center boss for extra definition/shine highlights
  const emboss = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.26, 20), goldMat);
  emboss.rotation.x = Math.PI / 2;
  g.add(emboss);
  return g;
}

// ---------- health pickup (heart) ----------
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

// ---------- bullets ----------
const bulletGeo = new THREE.SphereGeometry(0.18, 8, 8);
const bulletMat = new THREE.MeshStandardMaterial({ color: 0xff5533, emissive: 0xaa3300, emissiveIntensity: 1.2 });
const enemyBulletMat = new THREE.MeshStandardMaterial({ color: 0x7a2fbd, emissive: 0x5a1a9a, emissiveIntensity: 1.2 });

function makePowerBoltMesh() {
  const pts = [];
  for (let i = 0; i < 6; i++) pts.push(new THREE.Vector3((i % 2 === 0 ? -0.2 : 0.2), 0, i * 0.32));
  const curve = new THREE.CatmullRomCurve3(pts);
  const geo = new THREE.TubeGeometry(curve, 16, 0.1, 6, false);
  const mat = new THREE.MeshStandardMaterial({ color: 0xfff066, emissive: 0xffee00, emissiveIntensity: 2.2 });
  return new THREE.Mesh(geo, mat);
}

function renderPlayerHealth() {
  const pct = Math.max(0, player.health / player.maxHealth) * 100;
  playerHealthFillEl.style.width = `${pct}%`;
}
function updateHud() {
  levelValEl.textContent = `LV ${level}`;
  ringValEl.textContent = `🪙 ${ringCount}`;
  chargeValEl.textContent = `⚡ ${powerCharges}`;
}

function rectClose(z1, z2, range) { return Math.abs(z1 - z2) < range; }

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

  const crateMat = new THREE.MeshStandardMaterial({ map: makeWoodTexture(), roughness: 0.85 });
  const braceMat = new THREE.MeshStandardMaterial({ color: 0x2b2b2b, roughness: 0.4, metalness: 0.6 });
  crates = data.crates.map(c => ({ ...c, hit: false }));
  crates.forEach(c => {
    const cg = new THREE.Group();
    const box = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.9, 1.1), crateMat);
    cg.add(box);
    // metal corner braces for definition
    [-1, 1].forEach(sx => [-1, 1].forEach(sz => {
      const brace = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.94, 0.08), braceMat);
      brace.position.set(sx * 0.54, 0, sz * 0.54);
      cg.add(brace);
    }));
    // horizontal metal strap around the middle
    [-1, 1].forEach(sz => {
      const strap = new THREE.Mesh(new THREE.BoxGeometry(1.14, 0.1, 0.08), braceMat);
      strap.position.set(0, 0.1, sz * 0.54);
      cg.add(strap);
    });
    cg.position.set(LANES_X[c.lane], 0.45, c.z);
    castAll(cg);
    scene.add(cg);
    c.mesh = cg;
  });

  const stripeTex = makeWarningStripeTexture();
  const barMat = new THREE.MeshStandardMaterial({ map: stripeTex, roughness: 0.5, metalness: 0.2 });
  const postMat = new THREE.MeshStandardMaterial({ color: 0x2b2b2b, roughness: 0.4, metalness: 0.6 });
  bars = data.bars.map(b => ({ ...b, hit: false }));
  bars.forEach(b => {
    const post1 = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 1.5, 8), postMat);
    const post2 = post1.clone();
    const beam = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.2, 0.2), barMat);
    const bg = new THREE.Group();
    post1.position.set(-0.7, 0.75, 0);
    post2.position.set(0.7, 0.75, 0);
    beam.position.set(0, 1.45, 0);
    bg.add(post1, post2, beam);
    bg.position.set(LANES_X[b.lane], 0, b.z);
    castAll(bg);
    scene.add(bg);
    b.mesh = bg;
  });

  gaps = data.gaps.map(g => ({ ...g }));

  enemies = data.enemies.map(e => ({ ...e, alive: true }));
  enemies.forEach(e => {
    e.mesh = makeFireballMesh();
    e.mesh.position.set(LANES_X[e.lane], 0.55, e.z);
    castAll(e.mesh);
    scene.add(e.mesh);
  });

  rings = data.rings.map(([z, lane]) => ({ z, lane, collected: false }));
  rings.forEach(r => {
    r.mesh = makeCoinMesh();
    r.mesh.position.set(LANES_X[r.lane], 0.9, r.z);
    scene.add(r.mesh);
  });

  heartPickups = (data.hearts || []).map(([z, lane]) => ({ z, lane, collected: false }));
  heartPickups.forEach(h => {
    h.mesh = makeHeartMesh();
    h.mesh.position.set(LANES_X[h.lane], 0.9, h.z);
    scene.add(h.mesh);
  });

  if (bossMesh) { scene.remove(bossMesh); disposeObject(bossMesh); }
  const palette = BOSS_PALETTES[(levelNum - 1) % BOSS_PALETTES.length];
  bossMesh = buildBoss(theme.bossType, palette);
  bossMesh.position.set(0, 0, 250);
  scene.add(bossMesh);

  Object.assign(boss, {
    z: 250, x: 0, type: theme.bossType,
    maxHealth: Math.min(20 + (levelNum - 1) * 4, 48),
    health: Math.min(20 + (levelNum - 1) * 4, 48),
    alive: true, engaged: false,
    fireCooldown: 1.2,
    fireInterval: Math.max(0.8, 1.5 - (levelNum - 1) * 0.08),
    laneTimer: 0, hitFlash: 0,
  });
  bossNameEl.textContent = theme.bossName;
  bossBarWrap.classList.add('hidden');
  bossBarFill.style.width = '100%';
}

function showLevelBanner(levelNum) {
  const theme = LEVEL_DATA[(levelNum - 1) % LEVEL_DATA.length].theme;
  levelBanner.textContent = `LEVEL ${levelNum} — ${theme.name}`;
  levelBanner.classList.remove('hidden');
  clearTimeout(showLevelBanner._t);
  showLevelBanner._t = setTimeout(() => levelBanner.classList.add('hidden'), 2600);
}

function startNewGame() {
  level = 1; score = 0; ringCount = 0; powerCharges = 0;
  Object.assign(player, {
    laneIndex: 1, x: LANES_X[1], y: 0, z: 0, vy: 0, onGround: true,
    sliding: false, slideTimer: 0, health: PLAYER_MAX_HEALTH, maxHealth: PLAYER_MAX_HEALTH, invuln: 0, fireCooldown: 0, runCycle: 0,
  });
  bullets.forEach(b => scene.remove(b.mesh));
  enemyBullets.forEach(b => scene.remove(b.mesh));
  bullets = [];
  enemyBullets = [];
  buildLevel(level);
  scoreEl.textContent = score;
  renderPlayerHealth();
  updateHud();
  swipeHint.classList.remove('hidden');
}

function goToNextLevel() {
  level += 1;
  player.health = Math.min(player.maxHealth, player.health + HEART_HEAL_AMOUNT);
  Object.assign(player, {
    laneIndex: 1, x: LANES_X[1], y: 0, z: 0, vy: 0, onGround: true,
    sliding: false, slideTimer: 0, invuln: 1.0, fireCooldown: 0, runCycle: 0,
  });
  bullets.forEach(b => scene.remove(b.mesh));
  enemyBullets.forEach(b => scene.remove(b.mesh));
  bullets = [];
  enemyBullets = [];
  buildLevel(level);
  renderPlayerHealth();
  updateHud();
  showLevelBanner(level);
  sfx.levelUp();
}

function damagePlayer(n) {
  if (player.invuln > 0) return;
  player.health -= n;
  player.invuln = 1.3;
  renderPlayerHealth();
  sfx.damage();
}

function endGame(won) {
  state = won ? 'win' : 'lose';
  endTitle.textContent = won ? 'You Win!' : 'Game Over';
  endMsg.textContent = won ? `Score: ${score}` : `Reached Level ${level} — Score: ${score} — try again!`;
  endScreen.classList.remove('hidden');
  pauseBtn.classList.add('hidden');
  sfx.gameOver();
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

  // forward speed (frozen during boss engagement)
  const bossBlocking = boss.engaged && boss.alive;
  const speed = bossBlocking ? 0 : forwardSpeed;
  player.z += speed * dt;
  player.runCycle += dt * (speed > 0 ? 10 : 0);
  if (bossBlocking) player.z = Math.min(player.z, BOSS_ENGAGE_Z);
  if (!boss.engaged && player.z >= BOSS_ENGAGE_Z && boss.alive) {
    player.z = BOSS_ENGAGE_Z;
    boss.engaged = true;
    bossBarWrap.classList.remove('hidden');
  }

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

  // auto-fire (uses a charged power shot automatically if available)
  player.fireCooldown -= dt;
  if (player.fireCooldown <= 0) {
    player.fireCooldown = 0.28;
    if (powerCharges > 0) {
      powerCharges -= 1;
      const mesh = makePowerBoltMesh();
      mesh.position.set(player.x, player.y + 0.85, player.z + 1.6);
      scene.add(mesh);
      bullets.push({ x: player.x, z: player.z + 1.6, vz: BULLET_SPEED * 1.2, mesh, dmg: Math.ceil(boss.maxHealth / 2), power: true });
      sfx.powerShot();
      updateHud();
    } else {
      const mesh = new THREE.Mesh(bulletGeo, bulletMat);
      mesh.position.set(player.x, player.y + 0.9, player.z + 1.6);
      scene.add(mesh);
      bullets.push({ x: player.x, z: player.z + 1.6, vz: BULLET_SPEED, mesh, dmg: 1, power: false });
      sfx.shoot();
    }
  }

  // bullets travel
  bullets.forEach(b => { b.z += b.vz * dt; b.mesh.position.z = b.z; if (b.power) b.mesh.rotation.z += dt * 20; });
  bullets = bullets.filter(b => {
    const keep = b.z < player.z + 80;
    if (!keep) scene.remove(b.mesh);
    return keep;
  });

  // crate collisions (must jump; pass-through damage, no wall-blocking)
  crates.forEach(c => {
    if (c.hit) return;
    if (rectClose(player.z, c.z, HIT_RANGE) && player.laneIndex === c.lane && player.y < CRATE_HEIGHT) {
      c.hit = true; c.mesh.visible = false; damagePlayer(1);
    }
  });

  // bar collisions (must slide)
  bars.forEach(b => {
    if (b.hit) return;
    if (rectClose(player.z, b.z, HIT_RANGE) && player.laneIndex === b.lane && !player.sliding) {
      b.hit = true; b.mesh.visible = false; damagePlayer(1);
    }
  });

  // gap collisions (must swerve to a different lane; jump/slide do not help)
  gaps.forEach(gp => {
    if (gp.hit) return;
    if (rectClose(player.z, gp.z, HIT_RANGE) && player.laneIndex === gp.lane) {
      gp.hit = true; damagePlayer(1);
    }
  });

  // rings: collect + animate spin
  rings.forEach(r => {
    if (r.collected) { return; }
    r.mesh.rotation.y += dt * 3;
    if (rectClose(player.z, r.z, HIT_RANGE) && player.laneIndex === r.lane) {
      r.collected = true; r.mesh.visible = false;
      ringCount += 1;
      sfx.ring();
      if (ringCount % RING_PER_CHARGE === 0) {
        powerCharges = Math.min(MAX_POWER_CHARGES, powerCharges + 1);
        sfx.powerCharge();
      }
      updateHud();
    }
  });

  // heart pickups: collect + animate bob/spin
  heartPickups.forEach(h => {
    if (h.collected) return;
    h.mesh.rotation.y += dt * 2.4;
    h.mesh.position.y = 0.9 + Math.sin(performance.now() * 0.004 + h.z) * 0.08;
    if (rectClose(player.z, h.z, HIT_RANGE) && player.laneIndex === h.lane) {
      h.collected = true; h.mesh.visible = false;
      player.health = Math.min(player.maxHealth, player.health + HEART_HEAL_AMOUNT);
      renderPlayerHealth();
      sfx.heal();
    }
  });

  // enemies: bullet hits + player contact (+ flicker animation)
  enemies.forEach(e => {
    if (!e.alive) {
      return;
    }
    e.mesh.rotation.y += dt * 4;
    const flick = 1.4 + Math.sin(performance.now() * 0.01 + e.z) * 0.3;
    e.mesh.children[0].material.emissiveIntensity = flick;
    bullets.forEach(b => {
      if (e.alive && rectClose(b.z, e.z, HIT_RANGE) && Math.abs(b.x - LANES_X[e.lane]) < 1.0) {
        e.alive = false; e.mesh.visible = false; b.z = -9999;
        score += 10; scoreEl.textContent = score;
        sfx.hitEnemy();
      }
    });
    if (e.alive && player.invuln <= 0 && rectClose(player.z, e.z, HIT_RANGE) && player.laneIndex === e.lane) {
      e.alive = false; e.mesh.visible = false;
      damagePlayer(1);
    }
  });
  bullets = bullets.filter(b => b.z > -9998 || (scene.remove(b.mesh), false));

  // boss fight
  if (boss.alive) {
    if (boss.engaged) {
      boss.laneTimer += dt;
      const targetBossX = LANES_X[Math.floor(boss.laneTimer / 1.8) % 3];
      boss.x += (targetBossX - boss.x) * Math.min(1, dt * 2);

      boss.fireCooldown -= dt;
      if (boss.fireCooldown <= 0) {
        boss.fireCooldown = boss.fireInterval;
        const mesh = new THREE.Mesh(bulletGeo, enemyBulletMat);
        const targetLane = player.laneIndex;
        mesh.position.set(boss.x, 1.1, boss.z);
        scene.add(mesh);
        enemyBullets.push({ startZ: boss.z, startX: boss.x, targetLane, targetX: LANES_X[targetLane], timer: 0, duration: 0.9, mesh });
      }
      if (boss.hitFlash > 0) boss.hitFlash -= dt;

      bullets.forEach(b => {
        if (boss.alive && rectClose(b.z, boss.z, 1.8)) {
          b.z = -9999; boss.health -= b.dmg; boss.hitFlash = 0.15;
          if (b.power) sfx.powerHit(); else sfx.bossHit();
          bossBarFill.style.width = `${Math.max(0, boss.health / boss.maxHealth) * 100}%`;
          if (boss.health <= 0) {
            boss.alive = false;
            bossMesh.visible = false;
            bossBarWrap.classList.add('hidden');
            score += 100; scoreEl.textContent = score;
          }
        }
      });
      bullets = bullets.filter(b => b.z > -9998 || (scene.remove(b.mesh), false));
    }
  }

  // enemy (boss) bullets travel toward player's fixed engage z
  enemyBullets.forEach(b => {
    b.timer += dt;
    const t = Math.min(1, b.timer / b.duration);
    b.mesh.position.z = b.startZ + (BOSS_ENGAGE_Z - b.startZ) * t;
    b.mesh.position.x = b.startX + (b.targetX - b.startX) * t;
  });
  enemyBullets.forEach(b => {
    if (b.timer >= b.duration && !b.resolved) {
      b.resolved = true;
      if (player.invuln <= 0 && b.targetLane === player.laneIndex) damagePlayer(1);
    }
  });
  enemyBullets = enemyBullets.filter(b => {
    const keep = b.timer < b.duration + 0.05;
    if (!keep) scene.remove(b.mesh);
    return keep;
  });

  // lose / advance level
  if (player.health <= 0 && state === 'playing') { endGame(false); return; }
  if (!boss.alive && player.z >= FINISH_Z && state === 'playing') { goToNextLevel(); return; }

  // sync meshes
  const bob = player.onGround && !player.sliding ? Math.sin(player.runCycle) * 0.04 : 0;
  playerMesh.position.set(player.x, player.y + bob, player.z);
  const slideScale = player.sliding ? 0.5 : 1;
  playerMesh.scale.y += (slideScale - playerMesh.scale.y) * Math.min(1, dt * 14);
  bossMesh.position.x = boss.x;

  // camera chase
  const camTargetX = player.x * 0.6;
  camera.position.x += (camTargetX - camera.position.x) * Math.min(1, dt * 5);
  camera.position.y = player.y + CAMERA_HEIGHT;
  camera.position.z = player.z - CAMERA_DISTANCE;
  camera.lookAt(player.x, player.y + 1.05, player.z + 8);
  camera.rotateZ((camTargetX - camera.position.x) * -0.015);

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
});
document.getElementById('retry-btn').addEventListener('click', () => {
  ensureAudio();
  endScreen.classList.add('hidden');
  startNewGame();
  state = 'playing';
  pauseBtn.textContent = '⏸';
  pauseBtn.classList.remove('hidden');
});
pauseBtn.addEventListener('click', togglePause);
document.getElementById('resume-btn').addEventListener('click', togglePause);

resize();
buildLevel(1);
renderPlayerHealth();
updateHud();
camera.position.set(0, CAMERA_HEIGHT, -CAMERA_DISTANCE);
camera.lookAt(0, 1.05, 8);
requestAnimationFrame(tick);
