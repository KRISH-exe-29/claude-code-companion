// Chat effects: the on-duty character performs a signature move over a snapshot of the Claude
// terminal. The snapshot is laid exactly over the real window, letters in the character's path
// are knocked loose, then everything flies back and the snapshot fades, leaving the real chat.
//   surfer: carves across the chat; letters in his wake are kicked up and tumble down
//   sentry: rises through the middle; nearby letters float up glowing gold
//   ultron: a red laser scans down; letters it touches crumble into falling embers
// Loaded after renderer.js and shares its globals (sprite, pos, mode, setMode, clip, state...).
const chat = document.getElementById('chat');
const cctx = chat.getContext('2d');
const CELL_W = 8; // roughly one monospace character
const CELL_H = 16;
const STYLE = {
  surfer: { sweep: 1700, tint: null, spark: '#bfe6ff' },
  sentry: { sweep: 1900, tint: '#ffcf3a', spark: '#ffe08a' },
  ultron: { sweep: 1800, tint: '#ff3b30', spark: '#ff6a3d' },
};
let fx = null;

function sizeChat() {
  const dpr = window.devicePixelRatio || 1;
  chat.width = innerWidth * dpr;
  chat.height = innerHeight * dpr;
  cctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
sizeChat();
window.addEventListener('resize', sizeChat);

// Most common colour on a sparse grid = the terminal background.
function backgroundOf(data, w, h) {
  const count = new Map();
  for (let y = 4; y < h; y += 16) {
    for (let x = 4; x < w; x += 16) {
      const i = (y * w + x) * 4;
      const k = (data[i] << 16) | (data[i + 1] << 8) | data[i + 2];
      count.set(k, (count.get(k) || 0) + 1);
    }
  }
  let best = 0;
  let n = -1;
  for (const [k, c] of count) if (c > n) { best = k; n = c; }
  return [best >> 16, (best >> 8) & 255, best & 255];
}

function canvasOf(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

// Letters only (background made transparent), plus a tinted copy for the team colour.
function inkLayers(img, tint) {
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  const base = canvasOf(w, h).getContext('2d', { willReadFrequently: true });
  base.drawImage(img, 0, 0);
  const id = base.getImageData(0, 0, w, h);
  const d = id.data;
  const bg = backgroundOf(d, w, h);
  for (let i = 0; i < d.length; i += 4) {
    const diff = Math.abs(d[i] - bg[0]) + Math.abs(d[i + 1] - bg[1]) + Math.abs(d[i + 2] - bg[2]);
    d[i + 3] = diff < 40 ? 0 : Math.min(255, diff * 3);
  }
  const ink = canvasOf(w, h);
  ink.getContext('2d').putImageData(id, 0, 0);
  let tinted = null;
  if (tint) {
    tinted = canvasOf(w, h);
    const t = tinted.getContext('2d');
    t.drawImage(ink, 0, 0);
    t.globalCompositeOperation = 'source-atop';
    t.fillStyle = tint;
    t.globalAlpha = 0.75;
    t.fillRect(0, 0, w, h);
  }
  return { ink, tinted, alpha: d, bg: `rgb(${bg.join(',')})` };
}

function startFx(img, rect) {
  const style = STYLE[state.team];
  if (!style) return endFx();
  const s = img.naturalWidth / rect.width; // snapshot px per CSS px
  const layers = inkLayers(img, style.tint);
  const pieces = [];
  const iw = img.naturalWidth;
  for (let y = 0; y + CELL_H <= rect.height; y += CELL_H) {
    for (let x = 0; x + CELL_W <= rect.width; x += CELL_W) {
      let inked = false; // any visible ink pixel in this cell?
      for (let yy = 0; yy < CELL_H * s && !inked; yy += 2) {
        for (let xx = 0; xx < CELL_W * s; xx += 2) {
          if (layers.alpha[((Math.floor(y * s + yy)) * iw + Math.floor(x * s + xx)) * 4 + 3] > 80) { inked = true; break; }
        }
      }
      if (inked) pieces.push({ hx: x, hy: y, x, y, vx: 0, vy: 0, r: 0, vr: 0, off: false, tinted: false });
    }
  }
  fx = { img, rect, s, layers, pieces, style, sparks: [], t0: performance.now(), prevMode: mode, row: rect.height * (0.3 + Math.random() * 0.4) };
  setMode('fx');
  menuOpen && closeMenu();
  sprite.style.opacity = '';
  clip.src = `../assets/${state.team}/working.webm`;
  requestAnimationFrame(stepFx);
}

function endFx() {
  if (fx) {
    clip.src = lastSrc;
    setMode(fx.prevMode === 'fx' ? 'roam' : fx.prevMode);
  }
  fx = null;
  sprite.style.opacity = '';
  cctx.clearRect(0, 0, innerWidth, innerHeight);
}

// Put the character's centre at (x, y) in rect coordinates.
function placeChar(x, y) {
  const { rect } = fx;
  pos.x = rect.x + x - sprite.offsetWidth / 2;
  pos.y = rect.y + y - sprite.offsetHeight / 2;
}

function spark(x, y, vx, vy) {
  fx.sparks.push({ x, y, vx, vy, life: 1 });
}

function knock(p, vx, vy, vr, tinted) {
  p.off = true;
  p.vx = vx;
  p.vy = vy;
  p.vr = vr;
  p.tinted = tinted;
}

// One team move: places the character for progress k (0..1) and knocks loose the letters it reaches.
function perform(k) {
  const { rect, pieces, style } = fx;
  const rnd = Math.random;
  if (state.team === 'surfer') {
    const x = -80 + k * (rect.width + 160);
    const y = fx.row + Math.sin(k * Math.PI * 4) * 22;
    facingLeft = false;
    placeChar(x, y - 40);
    for (const p of pieces) {
      if (!p.off && p.hx + CELL_W / 2 < x - 20 && Math.abs(p.hy + CELL_H / 2 - y) < 70) {
        knock(p, 1 + rnd() * 4, -(2 + rnd() * 6), (rnd() - 0.5) * 0.4, false);
      }
    }
    spark(x - 30, y + 30, -2 - rnd() * 2, -rnd() * 2);
  } else if (state.team === 'sentry') {
    const x = rect.width / 2 + Math.sin(k * Math.PI * 2) * 40;
    const y = rect.height + 80 - k * (rect.height + 220);
    placeChar(x, y);
    for (const p of pieces) {
      const dx = p.hx - x;
      const dy = p.hy - y;
      if (!p.off && dx * dx + dy * dy < 170 * 170) {
        knock(p, dx * 0.015 + (rnd() - 0.5), -(0.5 + rnd() * 1.5), (rnd() - 0.5) * 0.15, true);
      }
    }
    for (let i = 0; i < 3; i++) spark(x + (rnd() - 0.5) * 120, y + (rnd() - 0.5) * 120, (rnd() - 0.5) * 2, -rnd() * 2);
  } else {
    const y = k * rect.height;
    placeChar(Math.max(-rect.x + 50, -40), y);
    fx.beam = y;
    for (const p of pieces) {
      if (!p.off && p.hy + CELL_H / 2 < y) knock(p, (rnd() - 0.5) * 1.5, rnd() * 1.5, (rnd() - 0.5) * 0.3, true);
    }
    for (let i = 0; i < 4; i++) spark(rnd() * rect.width, y, (rnd() - 0.5) * 3, rnd() * 3);
  }
  return style;
}

const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

function stepFx(now) {
  if (!fx) return;
  const { rect, pieces, layers, s, style } = fx;
  const t = now - fx.t0;
  const FALL = 900;
  const BACK = 750;
  const FADE = 350;
  const gravity = state.team === 'sentry' ? -0.05 : 0.45;

  if (t < style.sweep) perform(t / style.sweep);
  else fx.beam = null; // move done: the character stays where it finished

  const returning = t > style.sweep + FALL;
  if (returning && !fx.back) {
    fx.back = true;
    for (const p of pieces) Object.assign(p, { fx0: p.x, fy0: p.y, fr0: p.r });
  }
  const kb = returning ? ease(Math.min(1, (t - style.sweep - FALL) / BACK)) : 0;

  for (const p of pieces) {
    if (!p.off) continue;
    if (returning) {
      p.x = p.fx0 + (p.hx - p.fx0) * kb;
      p.y = p.fy0 + (p.hy - p.fy0) * kb;
      p.r = p.fr0 * (1 - kb);
    } else {
      p.vy += gravity;
      p.x += p.vx;
      p.y += p.vy;
      p.r += p.vr;
    }
  }

  // draw: snapshot, holes where letters left, beam, flying letters, sparks
  const end = style.sweep + FALL + BACK;
  cctx.clearRect(0, 0, innerWidth, innerHeight);
  cctx.globalAlpha = t > end ? Math.max(0, 1 - (t - end) / FADE) : 1;
  cctx.drawImage(fx.img, rect.x, rect.y, rect.width, rect.height);
  cctx.fillStyle = layers.bg;
  for (const p of pieces) if (p.off && kb < 1) cctx.fillRect(rect.x + p.hx, rect.y + p.hy, CELL_W, CELL_H);
  if (fx.beam != null) {
    cctx.save();
    cctx.shadowColor = '#ff2a1a';
    cctx.shadowBlur = 18;
    cctx.fillStyle = '#ff5a3c';
    cctx.fillRect(rect.x, rect.y + fx.beam - 1.5, rect.width, 3);
    cctx.restore();
  }
  for (const p of pieces) {
    if (!p.off || kb >= 1) continue;
    const src = p.tinted && layers.tinted && !returning ? layers.tinted : layers.ink;
    cctx.save();
    cctx.translate(rect.x + p.x + CELL_W / 2, rect.y + p.y + CELL_H / 2);
    cctx.rotate(p.r);
    cctx.drawImage(src, p.hx * s, p.hy * s, CELL_W * s, CELL_H * s, -CELL_W / 2, -CELL_H / 2, CELL_W, CELL_H);
    cctx.restore();
  }
  fx.sparks = fx.sparks.filter((k) => (k.life -= 0.025) > 0);
  cctx.fillStyle = style.spark;
  for (const k of fx.sparks) {
    k.x += k.vx;
    k.y += k.vy;
    cctx.globalAlpha = k.life;
    cctx.fillRect(rect.x + k.x, rect.y + k.y, 3, 3);
  }
  cctx.globalAlpha = 1;

  if (t > end + FADE) return endFx();
  requestAnimationFrame(stepFx);
}

window.companion.onFxHide(() => {
  if (typeof closeMenu === 'function') closeMenu();
  sprite.style.opacity = '0';
});
window.companion.onFx(async (data) => {
  if (fx) return; // already performing
  if (!data || reduced || still) return endFx();
  const img = new Image();
  img.src = data.png;
  try {
    await img.decode();
  } catch {
    return endFx();
  }
  startFx(img, data.rect);
});
window.companion.onPark(() => fx && endFx()); // switched away mid-move: stop and show the real window
