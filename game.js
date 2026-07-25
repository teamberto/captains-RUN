// ---------- Lost Temple Dash: 3D chase-cam lane runner (Three.js) ----------
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
const HIT_RANGE = 1.1;
const FINISH_Z = 262;
const ROAD_LEN = FINISH_Z + 40;
const PLAYER_MAX_HEALTH = 20;
const HEART_HEAL_AMOUNT = 5;
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
  jump: () => tone(400, 0.12, 'triangle', 0.1, 0, 700),
  slide: () => tone(220, 0.1, 'triangle', 0.08, 0, 110),
  damage: () => { noiseBurst(0.18, 0.22); tone(150, 0.25, 'sawtooth', 0.14, 0, 60); },
  heal: () => { tone(523, 0.14, 'sine', 0.14, 0, 784); tone(659, 0.16, 'sine', 0.12, 0.08, 988); },
  levelUp: () => { [0, 0.12, 0.24, 0.36].forEach((d, i) => tone(392 * (i + 1) / 1.5, 0.2, 'square', 0.12, d)); },
  gameOver: () => { [500, 400, 300, 200].forEach((f, i) => tone(f, 0.25, 'sawtooth', 0.15, i * 0.15)); },
};

// ---------- level theme data ----------
const LEVEL_DATA = [
  { // Level 1: Temple Gate - sunset light pouring in through the entrance
    theme: {
      name: 'Temple Gate', skyTop: 0x2a1a0c, skyBottom: 0xe0953c, fog: 0x9c7444,
      groundTint: 0x9d968c, plankTint: 0xdcd2c2, rock: 0x7d7264,
      hemiSky: 0xffcf8a, hemiGround: 0x5a3a18, sunColor: 0xffd08a,
      stoneTint: 0xc4a878, idolTint: 0xd8b45a, torchColor: 0xff9a2a,
    },
    crates: [{ z: 30, lane: 1 }, { z: 80, lane: 2 }, { z: 155, lane: 1 }],
    bars: [{ z: 65, lane: 1 }, { z: 170, lane: 0 }],
    gaps: [{ z: 115, lane: 2 }, { z: 200, lane: 0 }],
    enemies: [{ z: 55, lane: 0 }, { z: 105, lane: 1 }, { z: 130, lane: 0 }, { z: 180, lane: 2 }, { z: 205, lane: 0 }],
    rings: [[15, 1], [18, 1], [21, 1], [42, 0], [45, 0], [48, 0], [95, 2], [98, 2], [101, 2], [140, 1], [143, 1], [146, 1], [190, 2], [193, 2], [196, 2]],
    hearts: [[10, 2], [225, 1]],
  },
  { // Level 2: Idol Hall - deep interior, torchlit, watched by stone faces
    theme: {
      name: 'Idol Hall', skyTop: 0x140c06, skyBottom: 0x6a3f18, fog: 0x4a3826,
      groundTint: 0x7d766c, plankTint: 0xb3a897, rock: 0x5f584c,
      hemiSky: 0xd8a066, hemiGround: 0x2a1a0a, sunColor: 0xffb45a,
      stoneTint: 0xa08760, idolTint: 0xe0c070, torchColor: 0xff8c1a,
    },
    crates: [{ z: 35, lane: 0 }, { z: 90, lane: 1 }, { z: 160, lane: 2 }],
    bars: [{ z: 60, lane: 2 }, { z: 150, lane: 1 }],
    gaps: [{ z: 75, lane: 1 }, { z: 120, lane: 0 }, { z: 210, lane: 2 }],
    enemies: [{ z: 50, lane: 1 }, { z: 100, lane: 0 }, { z: 135, lane: 2 }, { z: 175, lane: 1 }, { z: 195, lane: 0 }, { z: 215, lane: 2 }],
    rings: [[20, 2], [23, 2], [26, 2], [45, 1], [48, 1], [51, 1], [110, 0], [113, 0], [116, 0], [145, 2], [148, 2], [151, 2], [185, 1], [188, 1], [191, 1]],
    hearts: [[10, 0], [230, 2]],
  },
  { // Level 3: Lava Vault - the temple starts to burn
    theme: {
      name: 'Lava Vault', skyTop: 0x1a0603, skyBottom: 0xc03a10, fog: 0x77341c,
      groundTint: 0x756055, plankTint: 0xb09384, rock: 0x4d3a34,
      hemiSky: 0xff7a3a, hemiGround: 0x3a1206, sunColor: 0xff8a4a,
      stoneTint: 0x7a5442, idolTint: 0xffa050, torchColor: 0xff5a1a,
    },
    crates: [{ z: 40, lane: 2 }, { z: 95, lane: 0 }, { z: 165, lane: 1 }],
    bars: [{ z: 70, lane: 0 }, { z: 155, lane: 2 }],
    gaps: [{ z: 55, lane: 1 }, { z: 130, lane: 2 }, { z: 195, lane: 0 }],
    enemies: [{ z: 60, lane: 2 }, { z: 110, lane: 1 }, { z: 140, lane: 0 }, { z: 185, lane: 2 }, { z: 205, lane: 1 }, { z: 220, lane: 0 }],
    rings: [[25, 0], [28, 0], [31, 0], [80, 1], [83, 1], [86, 1], [120, 2], [123, 2], [126, 2], [150, 0], [153, 0], [156, 0], [200, 1], [203, 1], [206, 1]],
    hearts: [[12, 1], [232, 2]],
  },
  { // Level 4: Collapsing Sanctum - the final run for daylight
    theme: {
      name: 'Collapsing Sanctum', skyTop: 0x0a0710, skyBottom: 0x4a2a5a, fog: 0x2f2436,
      groundTint: 0x7b7580, plankTint: 0xb6adb4, rock: 0x494150,
      hemiSky: 0xc0a0d8, hemiGround: 0x1a1018, sunColor: 0xffd8a0,
      stoneTint: 0x8e7a76, idolTint: 0xffd479, torchColor: 0xffc23a,
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
let forwardSpeed = FORWARD_SPEED;

// ---------- game state ----------
const player = {
  laneIndex: 1, x: LANES_X[1], y: 0, z: 0, vy: 0, onGround: true,
  sliding: false, slideTimer: 0,
  health: PLAYER_MAX_HEALTH, maxHealth: PLAYER_MAX_HEALTH, invuln: 0, runCycle: 0,
};
let crates = [];
let bars = [];
let gaps = [];
let enemies = [];
let rings = [];
let heartPickups = [];

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
    const flameMat = new THREE.MeshStandardMaterial({
      color: theme.torchColor, emissive: theme.torchColor, emissiveIntensity: 2.6,
      transparent: true, opacity: 0.92,
    });
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.85, 8), flameMat);
    flame.position.y = 2.4;
    g.add(flame);
    const emberMat = new THREE.MeshStandardMaterial({ color: 0xfff0b0, emissive: 0xffd070, emissiveIntensity: 2.2 });
    const ember = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.42, 6), emberMat);
    ember.position.y = 2.3;
    g.add(ember);
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

  const plankMat = new THREE.MeshStandardMaterial({ map: templeTileTex, roughness: 0.85, color: theme.plankTint });
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
  [-13.6, 13.6].forEach(x => {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(1.6, 14, ROAD_LEN), wallMat);
    wall.position.set(x, 7, ROAD_LEN / 2 - 10);
    wall.receiveShadow = true;
    scene.add(wall); roadMeshes.push(wall);
  });

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

  // --- pelvis / hips: narrower than the chest, gives a real waistline
  const pelvis = new THREE.Mesh(new THREE.SphereGeometry(0.23 * scale, 14, 10), shortsMat);
  pelvis.scale.set(1.12, 0.82, 0.85);
  pelvis.position.y = 1.0 * scale;
  g.add(pelvis);

  // --- torso: ribcage tapering into the waist, plus a slight forward lean
  const waist = new THREE.Mesh(new THREE.CylinderGeometry(0.235 * scale, 0.225 * scale, 0.3 * scale, 14), shirtMat);
  waist.position.y = 1.24 * scale;
  g.add(waist);
  const ribcage = new THREE.Mesh(new THREE.SphereGeometry(0.3 * scale, 16, 12), shirtMat);
  ribcage.scale.set(1.08, 1.15, 0.78);
  ribcage.position.set(0, 1.56 * scale, 0.01 * scale);
  g.add(ribcage);
  // deltoid caps so the shoulders read as anatomy, not a box corner
  [-1, 1].forEach(s => {
    const delt = new THREE.Mesh(new THREE.SphereGeometry(0.135 * scale, 12, 10), shirtMat);
    delt.scale.set(1, 0.9, 0.9);
    delt.position.set(s * 0.29 * scale, 1.72 * scale, 0);
    g.add(delt);
  });
  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.15 * scale, 0.042 * scale, 8, 16), shirtTrimMat);
  collar.position.set(0, 1.85 * scale, 0);
  collar.rotation.x = Math.PI / 2;
  g.add(collar);
  const hem = new THREE.Mesh(new THREE.TorusGeometry(0.235 * scale, 0.035 * scale, 8, 16), shirtTrimMat);
  hem.position.set(0, 1.1 * scale, 0);
  hem.rotation.x = Math.PI / 2;
  g.add(hem);

  // --- neck with trapezius slope
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.088 * scale, 0.105 * scale, 0.17 * scale, 12), skinMat);
  neck.position.y = 1.93 * scale;
  g.add(neck);
  const traps = new THREE.Mesh(new THREE.SphereGeometry(0.19 * scale, 12, 8), shirtMat);
  traps.scale.set(1.3, 0.42, 0.8);
  traps.position.set(0, 1.8 * scale, -0.02 * scale);
  g.add(traps);

  // --- head: egg-shaped cranium, tapered jaw, cheekbones, chin
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.235 * scale, 20, 18), skinMat);
  skull.scale.set(0.94, 1.06, 1.0);
  skull.position.y = 2.19 * scale;
  g.add(skull);
  const jaw = new THREE.Mesh(new THREE.SphereGeometry(0.185 * scale, 14, 12), skinMat);
  jaw.scale.set(0.92, 0.78, 0.95);
  jaw.position.set(0, 2.06 * scale, 0.025 * scale);
  g.add(jaw);
  const chin = new THREE.Mesh(new THREE.SphereGeometry(0.075 * scale, 10, 8), skinMat);
  chin.scale.set(1.1, 0.85, 0.9);
  chin.position.set(0, 1.97 * scale, 0.15 * scale);
  g.add(chin);
  [-1, 1].forEach(s => {
    const cheek = new THREE.Mesh(new THREE.SphereGeometry(0.072 * scale, 10, 8), skinMat);
    cheek.scale.set(0.9, 0.8, 0.7);
    cheek.position.set(s * 0.135 * scale, 2.14 * scale, 0.15 * scale);
    g.add(cheek);
  });
  [-1, 1].forEach(s => {
    const ear = new THREE.Mesh(new THREE.SphereGeometry(0.052 * scale, 10, 8), skinShadeMat);
    ear.scale.set(0.45, 1.05, 0.85);
    ear.position.set(s * 0.222 * scale, 2.17 * scale, -0.005 * scale);
    g.add(ear);
  });

  // --- face: brow ridge, nose bridge + tip, eyes set into sockets, smile
  const brow = new THREE.Mesh(new THREE.BoxGeometry(0.235 * scale, 0.035 * scale, 0.055 * scale), hairMat);
  brow.position.set(0, 2.265 * scale, 0.195 * scale);
  g.add(brow);
  const noseBridge = new THREE.Mesh(new THREE.BoxGeometry(0.045 * scale, 0.12 * scale, 0.05 * scale), skinMat);
  noseBridge.position.set(0, 2.19 * scale, 0.215 * scale);
  g.add(noseBridge);
  const noseTip = new THREE.Mesh(new THREE.SphereGeometry(0.042 * scale, 10, 8), skinMat);
  noseTip.position.set(0, 2.135 * scale, 0.235 * scale);
  g.add(noseTip);
  [-1, 1].forEach(s => {
    const eyeWhite = new THREE.Mesh(new THREE.SphereGeometry(0.052 * scale, 12, 10), new THREE.MeshStandardMaterial({ color: 0xf8f8f8, roughness: 0.35 }));
    eyeWhite.scale.set(1, 0.82, 0.6);
    eyeWhite.position.set(s * 0.093 * scale, 2.215 * scale, 0.192 * scale);
    g.add(eyeWhite);
    const iris = new THREE.Mesh(new THREE.SphereGeometry(0.026 * scale, 10, 8), new THREE.MeshStandardMaterial({ color: 0x4a2c14, roughness: 0.3 }));
    iris.position.set(s * 0.093 * scale, 2.212 * scale, 0.222 * scale);
    g.add(iris);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.012 * scale, 8, 6), new THREE.MeshStandardMaterial({ color: 0x140c06 }));
    pupil.position.set(s * 0.093 * scale, 2.212 * scale, 0.238 * scale);
    g.add(pupil);
  });
  const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.062 * scale, 0.019 * scale, 8, 14, Math.PI * 0.9), new THREE.MeshStandardMaterial({ color: 0x8a3a34, roughness: 0.5 }));
  mouth.position.set(0, 2.05 * scale, 0.185 * scale);
  mouth.rotation.z = Math.PI;
  g.add(mouth);

  // --- hair: swept cap with a few soft locks (no spikes)
  const hairCap = new THREE.Mesh(new THREE.SphereGeometry(0.245 * scale, 18, 14, 0, Math.PI * 2, 0, Math.PI / 2.05), hairMat);
  hairCap.scale.set(0.97, 1.0, 1.02);
  hairCap.position.set(0, 2.2 * scale, -0.008 * scale);
  g.add(hairCap);
  const fringe = new THREE.Mesh(new THREE.SphereGeometry(0.2 * scale, 14, 10, 0, Math.PI, 0, Math.PI / 2.4), hairMat);
  fringe.scale.set(1.12, 0.6, 1.0);
  fringe.position.set(0, 2.305 * scale, 0.055 * scale);
  fringe.rotation.y = -Math.PI / 2;
  g.add(fringe);
  for (let i = 0; i < 5; i++) {
    const t = (i / 4) - 0.5;
    const lock = new THREE.Mesh(new THREE.SphereGeometry(0.062 * scale, 8, 6), hairMat);
    lock.scale.set(0.85, 0.55, 0.85);
    lock.position.set(t * 0.3 * scale, (2.36 - Math.abs(t) * 0.12) * scale, 0.02 * scale);
    g.add(lock);
  }

  // --- arms: shoulder -> bicep -> elbow -> forearm -> wrist -> hand + thumb
  const armL = new THREE.Group(); armL.position.set(-0.295 * scale, 1.72 * scale, 0);
  const armR = new THREE.Group(); armR.position.set(0.295 * scale, 1.72 * scale, 0);
  [[armL, -1], [armR, 1]].forEach(([pivot, side]) => {
    const bicep = new THREE.Mesh(new THREE.CapsuleGeometry(0.072 * scale, 0.2 * scale, 6, 10), skinMat);
    bicep.position.y = -0.16 * scale;
    pivot.add(bicep);
    const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.088 * scale, 0.082 * scale, 0.14 * scale, 12), shirtMat);
    sleeve.position.y = -0.07 * scale;
    pivot.add(sleeve);
    const elbow = new THREE.Mesh(new THREE.SphereGeometry(0.062 * scale, 10, 8), skinMat);
    elbow.position.y = -0.29 * scale;
    pivot.add(elbow);
    const forearm = new THREE.Mesh(new THREE.CapsuleGeometry(0.058 * scale, 0.19 * scale, 6, 10), skinMat);
    forearm.position.y = -0.42 * scale;
    pivot.add(forearm);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.068 * scale, 10, 8), skinMat);
    hand.scale.set(0.8, 1.05, 0.5);
    hand.position.y = -0.56 * scale;
    pivot.add(hand);
    const thumb = new THREE.Mesh(new THREE.CapsuleGeometry(0.02 * scale, 0.03 * scale, 3, 6), skinMat);
    thumb.position.set(side * 0.045 * scale, -0.545 * scale, 0.015 * scale);
    thumb.rotation.z = side * 0.6;
    pivot.add(thumb);
    g.add(pivot);
  });

  // --- legs: hip -> quad -> knee -> calf -> ankle -> shoe with toe box
  const legL = new THREE.Group(); legL.position.set(-0.115 * scale, 0.97 * scale, 0);
  const legR = new THREE.Group(); legR.position.set(0.115 * scale, 0.97 * scale, 0);
  [legL, legR].forEach(pivot => {
    const quad = new THREE.Mesh(new THREE.CapsuleGeometry(0.098 * scale, 0.21 * scale, 6, 10), shortsMat);
    quad.position.y = -0.15 * scale;
    pivot.add(quad);
    const thighSkin = new THREE.Mesh(new THREE.CapsuleGeometry(0.082 * scale, 0.1 * scale, 6, 10), skinMat);
    thighSkin.position.y = -0.33 * scale;
    pivot.add(thighSkin);
    const knee = new THREE.Mesh(new THREE.SphereGeometry(0.076 * scale, 10, 8), skinMat);
    knee.position.y = -0.42 * scale;
    pivot.add(knee);
    const calf = new THREE.Mesh(new THREE.CapsuleGeometry(0.072 * scale, 0.2 * scale, 6, 10), skinMat);
    calf.scale.set(1, 1, 1.15);
    calf.position.set(0, -0.56 * scale, -0.012 * scale);
    pivot.add(calf);
    const ankle = new THREE.Mesh(new THREE.SphereGeometry(0.052 * scale, 8, 8), skinMat);
    ankle.position.y = -0.7 * scale;
    pivot.add(ankle);
    const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.125 * scale, 0.085 * scale, 0.2 * scale), shoeMat);
    shoe.position.set(0, -0.755 * scale, 0.035 * scale);
    pivot.add(shoe);
    const toe = new THREE.Mesh(new THREE.SphereGeometry(0.066 * scale, 10, 8), shoeMat);
    toe.scale.set(0.95, 0.62, 1.0);
    toe.position.set(0, -0.755 * scale, 0.13 * scale);
    pivot.add(toe);
    const sole = new THREE.Mesh(new THREE.BoxGeometry(0.135 * scale, 0.032 * scale, 0.29 * scale), soleMat);
    sole.position.set(0, -0.795 * scale, 0.05 * scale);
    pivot.add(sole);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.14 * scale, 0.03 * scale, 0.07 * scale), shoeAccentMat);
    stripe.position.set(0, -0.735 * scale, 0.075 * scale);
    pivot.add(stripe);
    g.add(pivot);
  });

  g.userData = { armL, armR, legL, legR };
  castAll(g);
  return g;
}

const playerMesh = buildRunner(0.95);
scene.add(playerMesh);

// ---------- fireball enemies ----------
// temple fire trap: a jet of flame erupting from a floor grate - dodge it
function makeFireballMesh() {
  const g = new THREE.Group();
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.42, 14, 14), new THREE.MeshStandardMaterial({ color: 0xff8a1a, emissive: 0xff5a00, emissiveIntensity: 1.8, roughness: 0.35 }));
  core.scale.y = 1.15;
  g.add(core);
  const flameMat = new THREE.MeshStandardMaterial({ color: 0xffc247, emissive: 0xff8a1a, emissiveIntensity: 2.0, transparent: true, opacity: 0.85 });
  for (let i = 0; i < 6; i++) {
    const ang = (i / 6) * Math.PI * 2;
    const tongue = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.62, 6), flameMat);
    tongue.position.set(Math.cos(ang) * 0.24, 0.34 + (i % 2) * 0.16, Math.sin(ang) * 0.24);
    tongue.rotation.set(Math.sin(ang) * 0.32, 0, -Math.cos(ang) * 0.32);
    g.add(tongue);
  }
  const crown = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.7, 8), flameMat);
  crown.position.y = 0.62;
  g.add(crown);
  // scorched grate the flame pours out of
  const grate = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.55, 0.12, 10), new THREE.MeshStandardMaterial({ color: 0x2e2018, roughness: 0.95 }));
  grate.position.y = -0.5;
  g.add(grate);
  g.position.y = 0.55;
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
  g.scale.setScalar(0.78);
  return g;
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

  const rockMat = new THREE.MeshStandardMaterial({ color: theme.rock, roughness: 0.95 });
  const rockMossMat = new THREE.MeshStandardMaterial({ color: 0x6a8a4a, roughness: 0.9 });
  crates = data.crates.map(c => ({ ...c, hit: false }));
  crates.forEach(c => {
    const cg = new THREE.Group();
    // craggy boulder: irregular icosahedron, squashed so it reads as jump-over height
    const boulder = new THREE.Mesh(new THREE.IcosahedronGeometry(0.62, 1), rockMat);
    boulder.scale.set(1, 0.82, 0.92);
    boulder.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
    cg.add(boulder);
    // smaller rocks clustered at the base for a natural pile
    [[-0.42, -0.15, 0.28], [0.4, -0.2, -0.22], [0.05, -0.28, 0.4]].forEach(([x, y, z]) => {
      const pebble = new THREE.Mesh(new THREE.IcosahedronGeometry(0.24, 0), rockMat);
      pebble.position.set(x, y, z);
      pebble.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0);
      cg.add(pebble);
    });
    const moss = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2), rockMossMat);
    moss.position.set(0.1, 0.32, 0.2);
    moss.rotation.x = -0.4;
    cg.add(moss);
    cg.position.set(LANES_X[c.lane], 0.45, c.z);
    castAll(cg);
    scene.add(cg);
    c.mesh = cg;
  });

  const rockHighlightMat = new THREE.MeshStandardMaterial({ color: 0xd8c8a0, roughness: 0.7 });
  bars = data.bars.map(b => ({ ...b, hit: false }));
  bars.forEach(b => {
    const bg = new THREE.Group();
    [-0.7, 0.7].forEach(x => {
      const pillar = new THREE.Mesh(new THREE.IcosahedronGeometry(0.38, 0), rockMat);
      pillar.scale.set(0.75, 1.9, 0.75);
      pillar.position.set(x, 0.75, 0);
      pillar.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0);
      bg.add(pillar);
    });
    // low rock overhang/ledge - must slide under
    const ledge = new THREE.Mesh(new THREE.IcosahedronGeometry(0.55, 1), rockMat);
    ledge.scale.set(2.0, 0.5, 0.85);
    ledge.position.set(0, 1.45, 0);
    ledge.rotation.set(Math.random() * 0.3, Math.random() * Math.PI, Math.random() * 0.3);
    bg.add(ledge);
    // bright mineral vein along the underside so the duck-under cue stays visible
    const vein = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.06, 0.12), rockHighlightMat);
    vein.position.set(0, 1.22, 0.15);
    bg.add(vein);
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
    r.mesh = makeBananaMesh();
    r.mesh.position.set(LANES_X[r.lane], 0.9, r.z);
    scene.add(r.mesh);
  });

  heartPickups = (data.hearts || []).map(([z, lane]) => ({ z, lane, collected: false }));
  heartPickups.forEach(h => {
    h.mesh = makeHeartMesh();
    h.mesh.position.set(LANES_X[h.lane], 0.9, h.z);
    scene.add(h.mesh);
  });

  exitFillEl.style.width = '0%';
}

function showLevelBanner(levelNum) {
  const theme = LEVEL_DATA[(levelNum - 1) % LEVEL_DATA.length].theme;
  levelBanner.textContent = `LEVEL ${levelNum} — ${theme.name}`;
  levelBanner.classList.remove('hidden');
  clearTimeout(showLevelBanner._t);
  showLevelBanner._t = setTimeout(() => levelBanner.classList.add('hidden'), 2600);
}

function startNewGame() {
  level = 1; score = 0; ringCount = 0;
  Object.assign(player, {
    laneIndex: 1, x: LANES_X[1], y: 0, z: 0, vy: 0, onGround: true,
    sliding: false, slideTimer: 0, health: PLAYER_MAX_HEALTH, maxHealth: PLAYER_MAX_HEALTH, invuln: 0, runCycle: 0,
  });
  buildLevel(level);
  scoreEl.textContent = score;
  renderPlayerHealth();
  updateHud();
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
  endTitle.textContent = won ? '🏆 You Escaped!' : 'Caught by the Temple';
  endMsg.textContent = won
    ? `You made it out with the Golden Banana! 🍌 ${ringCount} bananas — Score: ${score}`
    : `You got as far as ${LEVEL_DATA[(level - 1) % LEVEL_DATA.length].theme.name} — Score: ${score} — try again!`;
  endScreen.classList.remove('hidden');
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
      score += 5; scoreEl.textContent = score;
      sfx.ring();
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

  // fire traps: pure dodge hazards now that the runner has no weapon
  enemies.forEach(e => {
    if (!e.alive) return;
    e.mesh.rotation.y += dt * 4;
    const flick = 1.4 + Math.sin(performance.now() * 0.01 + e.z) * 0.3;
    e.mesh.children[0].material.emissiveIntensity = flick;
    if (player.invuln <= 0 && rectClose(player.z, e.z, HIT_RANGE) && player.laneIndex === e.lane) {
      e.alive = false; e.mesh.visible = false;
      damagePlayer(1);
    }
  });

  // lose / advance level
  if (player.health <= 0 && state === 'playing') { endGame(false); return; }
  if (player.z >= FINISH_Z && state === 'playing') { goToNextLevel(); return; }

  // sync meshes
  const moving = player.onGround && !player.sliding;
  const bob = moving ? Math.abs(Math.sin(player.runCycle)) * 0.09 : 0;
  playerMesh.position.set(player.x, player.y + bob, player.z);
  const slideScale = player.sliding ? 0.55 : 1;
  playerMesh.scale.y += (slideScale - playerMesh.scale.y) * Math.min(1, dt * 14);
  const tiltTarget = player.sliding ? 0.85 : (!player.onGround ? -0.15 : 0);
  playerMesh.rotation.x += (tiltTarget - playerMesh.rotation.x) * Math.min(1, dt * 12);
  const { armL, armR, legL, legR } = playerMesh.userData;
  if (moving) {
    const swing = Math.sin(player.runCycle) * 0.85;
    legL.rotation.x = swing; legR.rotation.x = -swing;
    armL.rotation.x = -swing * 0.75; armR.rotation.x = swing * 0.75;
  } else if (!player.onGround) {
    legL.rotation.x = 1.1; legR.rotation.x = 0.75;
    armL.rotation.x = -0.6; armR.rotation.x = -0.9;
  } else {
    legL.rotation.x = 0.3; legR.rotation.x = 0.5;
    armL.rotation.x = -0.4; armR.rotation.x = -0.2;
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
  camera.lookAt(player.x, player.y + 0.92, player.z + 8);
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
camera.lookAt(0, 0.92, 8);
requestAnimationFrame(tick);
