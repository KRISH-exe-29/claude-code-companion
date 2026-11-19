// Renderer: the team character roams the screen on a transparent layer, animated per mood.
// A Flow clip (assets/<team>/<mood>.webm, else <team>/idle.webm; transparent VP9), if present, replaces the image.
const TEAMS = {
  sentry: { color: '#f5b301', char: true, flips: false },
  surfer: { color: '#9fd3ff', char: true, flips: true }, // faces right; mirror when moving left
  ultron: { color: '#ef4444', char: true, flips: false },
  default: { color: '#f5f5f5', char: false, flips: false },
};
const MOODS = ['idle', 'thinking', 'working', 'needs-you', 'done'];
const RATE = { idle: 0.25, thinking: 0.5, working: 1.4, 'needs-you': 2, done: 0.15 }; // particles per frame
const SPEED = { idle: 0.45, thinking: 0.8, working: 1.8, 'needs-you': 0, done: 0.3 }; // px per frame across the screen

const $ = (id) => document.getElementById(id);
const sprite = $('sprite');
const stage = $('stage');
const clip = $('clip');
const img = $('char');
const still = new URLSearchParams(location.search).has('still'); // snapshots: centred, no roaming
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

let muted = false;
let lastAlert = false;
let lastSrc = '';
let audio;
let state = { team: 'default', mood: 'idle', dim: true };

// ---------- clip (optional, overrides the character) ----------
clip.addEventListener('error', () => {
  sprite.classList.remove('has-clip');
  const idle = `../assets/${state.team}/idle.webm`;
  if (!clip.src.endsWith(idle.slice(2))) clip.src = idle; // no clip for this mood: fall back to the team's idle clip
});
clip.addEventListener('playing', () => {
  sprite.classList.add('has-clip');
  clip.classList.add('on');
});

// ---------- roaming ----------
const pos = { x: 0, y: 0 };
const vel = { x: 0, y: 0 };
let target = null;
let facingLeft = false;
let mode = 'roam'; // roam | pinned (dropped by the user) | parked (bottom-right corner, small)
let dragging = null; // { dx, dy } offset from the pointer while dragging

function bounds() {
  return { w: Math.max(0, innerWidth - sprite.offsetWidth), h: Math.max(0, innerHeight - sprite.offsetHeight) };
}

function place() {
  const b = bounds();
  if (still) {
    pos.x = b.w / 2;
    pos.y = b.h / 2;
  } else {
    pos.x = b.w - 40; // start bottom-right
    pos.y = b.h - 20;
  }
  target = null;
}

function roam() {
  const b = bounds();
  if (!target || Math.hypot(target.x - pos.x, target.y - pos.y) < 6) {
    target = { x: Math.random() * b.w, y: Math.random() * b.h };
  }
  const speed = (SPEED[state.mood] || 0) * (state.dim ? 0.35 : 1);
  const dx = target.x - pos.x;
  const dy = target.y - pos.y;
  const d = Math.hypot(dx, dy) || 1;
  vel.x += ((dx / d) * speed - vel.x) * 0.03; // ease toward the target for smooth turns
  vel.y += ((dy / d) * speed - vel.y) * 0.03;
  pos.x = Math.min(b.w, Math.max(0, pos.x + vel.x));
  pos.y = Math.min(b.h, Math.max(0, pos.y + vel.y));
  if (Math.abs(vel.x) > 0.15) facingLeft = vel.x < 0;
}

// Parked: fly to the bottom-right corner (the .shrink wrapper scales from that corner).
function park() {
  const b = bounds();
  const dx = b.w - pos.x;
  const dy = b.h - pos.y;
  if (Math.hypot(dx, dy) < 1) return;
  pos.x += dx * 0.06;
  pos.y += dy * 0.06;
  if (Math.abs(dx) > 1) facingLeft = dx < 0;
}

function move() {
  if (dragging) return;
  if (mode === 'roam') roam();
  else if (mode === 'parked') park();
}

function setMode(m) {
  mode = m;
  sprite.classList.toggle('parked', m === 'parked');
  target = null;
  vel.x = 0;
  vel.y = 0;
}

// ---------- mouse: clicks pass through except on the character (and its menu) ----------
const figureEl = $('figure');
const orbEl = document.querySelector('.orb');
const hitEl = () => (sprite.classList.contains('has-clip') ? clip : sprite.classList.contains('no-char') ? orbEl : figureEl);
const mouse = { x: -1, y: -1 };
let interactive = false;

const inside = (r, pad = 0) => mouse.x >= r.left - pad && mouse.x <= r.right + pad && mouse.y >= r.top - pad && mouse.y <= r.bottom + pad;

function setInteractive(on) {
  if (on === interactive) return;
  interactive = on;
  window.companion.setInteractive(on);
}

function checkHover() {
  if (dragging) return;
  const overChar = inside(hitEl().getBoundingClientRect());
  const overMenu = menuOpen && menuButtons.some((btn) => inside(btn.getBoundingClientRect(), 4));
  setInteractive(overChar || overMenu);
  if (menuOpen) {
    if (overChar || overMenu) menuIdleSince = performance.now();
    else if (performance.now() - menuIdleSince > 2500) closeMenu();
  }
}

document.addEventListener('mousemove', (e) => {
  mouse.x = e.clientX;
  mouse.y = e.clientY;
});
document.addEventListener('mouseleave', () => {
  mouse.x = -1;
  mouse.y = -1;
});

// ---------- ring menu: Minimize / Close, laid out on a circle around the character ----------
const menu = $('menu');
const ring = menu.querySelector('.ring');
const btnMin = $('btn-min');
const btnClose = $('btn-close');
const btnFx = $('btn-fx');
const menuButtons = [btnMin, btnFx, btnClose];
const FX_BUTTON = { surfer: ['≈', 'Surf the chat'], sentry: ['✦', 'Golden lift'], ultron: ['◎', 'Laser scan'] };
let menuOpen = false;
let menuIdleSince = 0;
let clickTimer = null;

function openMenu() {
  menuOpen = true;
  menuIdleSince = performance.now();
  btnMin.textContent = mode === 'parked' ? '\u25A1' : '\u2013'; // restore when parked, minimize otherwise
  btnMin.title = mode === 'parked' ? 'Restore' : 'Minimize';
  const f = FX_BUTTON[state.team];
  btnFx.hidden = !f;
  if (f) [btnFx.textContent, btnFx.title] = f;
  menu.classList.add('open');
  layoutMenu();
}

function closeMenu() {
  menuOpen = false;
  menu.classList.remove('open');
}

// Centre the ring on the visible character; put the buttons on the upper arc, on the side
// facing the middle of the screen so they never fall off an edge.
function layoutMenu() {
  const r = hitEl().getBoundingClientRect();
  const cx = r.left + r.width / 2;
  const cy = r.top + r.height / 2;
  const R = Math.max(r.width, r.height) / 2 + 14;
  ring.style.cssText = `left:${cx}px;top:${cy}px;width:${R * 2}px;height:${R * 2}px`;
  // Spread the buttons so they never overlap, however small the ring is (30 px buttons + 6 px gap).
  const gap = (2 * Math.asin(Math.min(1, 18 / R)) * 180) / Math.PI;
  const mid = cx > innerWidth / 2 ? -125 : -55;
  const shown = menuButtons.filter((b) => !b.hidden);
  shown.forEach((btn, i) => {
    const t = ((mid + (i - (shown.length - 1) / 2) * gap) * Math.PI) / 180;
    btn.style.left = `${cx + Math.cos(t) * R}px`;
    btn.style.top = `${Math.max(16, cy + Math.sin(t) * R)}px`;
  });
}

btnMin.addEventListener('click', () => {
  setMode(mode === 'parked' ? 'roam' : 'parked');
  closeMenu();
});
btnClose.addEventListener('click', () => window.companion.quit());
btnFx.addEventListener('click', () => {
  closeMenu();
  window.companion.sweep();
});

// ---------- drag (press + move) vs click (press + release in place) ----------
sprite.addEventListener('pointerdown', (e) => {
  if (!interactive || e.button !== 0) return;
  dragging = { dx: e.clientX - pos.x, dy: e.clientY - pos.y, x0: e.clientX, y0: e.clientY, moved: false };
  sprite.setPointerCapture(e.pointerId);
});
sprite.addEventListener('pointermove', (e) => {
  if (!dragging) return;
  if (!dragging.moved && Math.hypot(e.clientX - dragging.x0, e.clientY - dragging.y0) < 5) return;
  if (!dragging.moved) {
    dragging.moved = true;
    sprite.classList.add('dragging');
    closeMenu();
  }
  const b = bounds();
  pos.x = Math.min(b.w, Math.max(0, e.clientX - dragging.dx));
  pos.y = Math.min(b.h, Math.max(0, e.clientY - dragging.dy));
});
function endDrag() {
  if (!dragging) return;
  const wasDrag = dragging.moved;
  dragging = null;
  sprite.classList.remove('dragging');
  if (wasDrag) {
    setMode('pinned'); // stays where it was dropped
    return;
  }
  // A click: wait briefly so a double-click can win.
  clearTimeout(clickTimer);
  clickTimer = setTimeout(() => (menuOpen ? closeMenu() : openMenu()), 230);
}
sprite.addEventListener('pointerup', endDrag);
sprite.addEventListener('pointercancel', endDrag);
sprite.addEventListener('dblclick', () => {
  clearTimeout(clickTimer);
  closeMenu();
  setMode('roam');
});

function draw() {
  sprite.style.transform = `translate(${pos.x}px, ${pos.y}px)`;
  stage.style.transform = TEAMS[state.team].flips && facingLeft ? 'scaleX(-1)' : '';
}

// ---------- particles ----------
const cv = $('fx');
const ctx = cv.getContext('2d');
let W = 0;
let H = 0;
let parts = [];
let carry = 0;

function resize() {
  const dpr = window.devicePixelRatio || 1;
  W = cv.clientWidth;
  H = cv.clientHeight;
  cv.width = W * dpr;
  cv.height = H * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function spawn(team, burst) {
  const r = Math.random;
  if (team === 'sentry') {
    // golden sparks rising out of the light behind him
    const a = r() * Math.PI * 2;
    const s = burst ? 2 + r() * 2 : 0.3 + r() * 0.6;
    return { x: W / 2 + Math.cos(a) * W * 0.13, y: H * 0.45 + Math.sin(a) * H * 0.15, vx: Math.cos(a) * s * 0.6, vy: -0.4 - r() * 0.8 + (burst ? Math.sin(a) * s : 0), life: 1, decay: 0.008 + r() * 0.01, size: 1 + r() * 2.2, color: '255,205,80' };
  }
  if (team === 'surfer') {
    // cosmic star streaks flowing past the board
    return { x: W + 10, y: r() * H, vx: -(2 + r() * 4) * (burst ? 2 : 1), vy: 0, life: 1, decay: 0.006, size: 0.6 + r() * 1.4, color: r() < 0.3 ? '160,210,255' : '235,240,255', streak: 8 + r() * 18 };
  }
  if (team === 'ultron') {
    // red embers drifting up from the core
    return { x: W * (0.38 + r() * 0.24), y: H * (0.3 + r() * 0.6), vx: (r() - 0.5) * 0.4, vy: -0.3 - r() * 0.6 * (burst ? 3 : 1), life: 1, decay: 0.01 + r() * 0.01, size: 0.8 + r() * 1.6, color: '255,70,50' };
  }
  return null;
}

function emit(n, burst) {
  for (let i = 0; i < n && parts.length < 160; i++) {
    const p = spawn(state.team, burst);
    if (p) parts.push(p);
  }
}

function particles() {
  if (!W) resize();
  carry += (RATE[state.mood] || 0.2) * (state.dim ? 0.2 : 1);
  const n = Math.floor(carry);
  carry -= n;
  emit(n, false);
  ctx.clearRect(0, 0, W, H);
  parts = parts.filter((p) => {
    p.x += p.vx;
    p.y += p.vy;
    p.life -= p.decay;
    if (p.life <= 0 || p.x < -30 || p.y < -10) return false;
    ctx.globalAlpha = Math.max(0, p.life) * 0.9;
    if (p.streak) {
      ctx.strokeStyle = `rgba(${p.color},1)`;
      ctx.lineWidth = p.size;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x - p.vx * (p.streak / 4), p.y);
      ctx.stroke();
    } else {
      ctx.fillStyle = `rgba(${p.color},1)`;
      ctx.shadowColor = `rgba(${p.color},1)`;
      ctx.shadowBlur = 6;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }
    return true;
  });
  ctx.globalAlpha = 1;
}

function frame() {
  if (!still) move();
  draw();
  if (!still) checkHover();
  if (menuOpen) layoutMenu();
  particles();
  requestAnimationFrame(frame);
}

place();
if (reduced) draw();
else requestAnimationFrame(frame);
window.addEventListener('resize', () => {
  resize();
  place();
  draw();
});

// ---------- sound ----------
function chime() {
  try {
    audio = audio || new AudioContext();
    const t = audio.currentTime;
    [880, 1320].forEach((f, i) => {
      const o = audio.createOscillator();
      const g = audio.createGain();
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t + i * 0.15);
      g.gain.exponentialRampToValueAtTime(0.25, t + i * 0.15 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.15 + 0.15);
      o.connect(g).connect(audio.destination);
      o.start(t + i * 0.15);
      o.stop(t + i * 0.15 + 0.16);
    });
  } catch {}
}

// ---------- apply a Display ----------
function render(d) {
  const team = TEAMS[d.team] ? d.team : 'default';
  const mood = MOODS.includes(d.mood) ? d.mood : 'idle';
  const t = TEAMS[team];
  const teamChanged = team !== state.team;
  const enteredDone = mood === 'done' && state.mood !== 'done';
  state = { team, mood, dim: !!d.dim };

  document.documentElement.style.setProperty('--team-color', t.color);
  const keep = sprite.classList.contains('has-clip') ? ' has-clip' : '';
  sprite.className = `sprite team-${team} ${mood}${t.char ? '' : ' no-char'}${d.dim ? ' dim' : ''}${d.alert ? ' alert' : ''}${keep}`;
  if (t.char && (teamChanged || !img.getAttribute('src'))) img.src = `../assets/${team}/character.png`;
  if (teamChanged) parts = [];
  if (enteredDone) emit(40, true);
  if (reduced) draw();

  const src = `../assets/${team}/${mood}.webm`;
  if (src !== lastSrc) {
    lastSrc = src;
    sprite.classList.remove('has-clip');
    clip.classList.remove('on');
    clip.src = src;
  }

  if (d.alert && !lastAlert && !muted) chime();
  lastAlert = !!d.alert;
}

window.companion.onDisplay(render);
window.companion.onMute((m) => (muted = m));
window.companion.onPark(() => {
  closeMenu();
  if (mode === 'roam') setMode('parked'); // a spot the user chose (pinned) is left alone
});
