// TrainRide — a zero-dependency, side-scrolling "train departure → cruise →
// arrival" animation. The landscape scrolls right-to-left proportional to the
// copy speed; at the end, the train eases into the destination platform.
//
// Lifecycle: dormant → engaging (station pull-out) → cruising → arriving
// (platform pull-in) → settled
//
//   const w = createWarp(canvas);
//   w.update({ active, progress, speedBps });   // call every SSE tick
//   const pct = w.displayProgress();            // smoothed 0..1 for the HUD
//   w.onArrive(() => { /* fade the stage out */ });
//   w.destroy();

function rand(a, b) {
  return a + Math.random() * (b - a);
}

// Smooth ease toward a target (frame-rate independent).
function approach(cur, target, dt, rate) {
  return cur + (target - cur) * (1 - Math.exp(-rate * dt));
}

// Ken Perlin smootherstep — eases in AND out with a steady middle.
function smootherstep(x) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  return x * x * x * (x * (x * 6 - 15) + 10);
}

// The journey always takes at least this long, even when the copy itself
// finishes in a blink (NVMe → NVMe). Displayed progress is capped by a
// smootherstep ramp over this window, so the user always gets a full,
// readable animation sequence.
const MIN_RAMP_MS = 3000;

// Scenery palette
const SKY_TOP = '#070d1a';
const SKY_BOTTOM = '#0c1526';
const GROUND = '#0a1220';
const RAIL = '#2a3f66';
const TIE = '#1a2a48';
const TRAIN_BODY = '#12203a';
const TRAIN_STRIPE = '#2fe07f';
const LIGHT_WARM = '#ffd166';
const LIGHT_COOL = '#5ad2ff';
const MOUNTAIN = '#0e1a2e';
const TREE = '#122844';

export function createWarp(canvas) {
  const ctx = canvas.getContext('2d');
  let w = 0, h = 0, dpr = 1;
  let raf = 0, last = 0;
  let running = true;

  // External state (set by update)
  let active = false;
  let targetProgress = 0;
  let targetSpeedBps = 0;

  // Internally smoothed state (no jumps between SSE ticks).
  let displayProgress = 0;
  let smoothSpeedBps = 0;
  let lastUpdateTs = 0;
  let activateAt = 0;

  // Motion
  let vel = 0;          // 0..1 normalized train velocity
  let engage = 0;       // 0 → 1 ramp on activation
  let arrived = 0;      // 0 → 1 arrival envelope
  let arrivedFired = false;
  let onArriveCb = null;

  // World position in "pixels" — scrollOffset advances with progress so the
  // visual speed is always proportional to copy speed.
  const WORLD_LEN = 7200;
  let worldX = 0;

  // Pre-generated landscape features (deterministic for a given journey)
  const mountains = [];
  for (let i = 0; i < 40; i++) {
    mountains.push({
      x: (i / 40) * WORLD_LEN,
      w: rand(140, 420),
      h: rand(28, 88),
      seed: Math.random()
    });
  }
  const trees = [];
  for (let i = 0; i < 80; i++) {
    trees.push({
      x: (i / 80) * WORLD_LEN,
      h: rand(14, 34),
      lean: rand(-0.15, 0.15)
    });
  }
  const poles = [];
  for (let i = 0; i < 30; i++) {
    poles.push({ x: (i / 30) * WORLD_LEN });
  }

  // Speed-lines (streaks) — the "window view" lights that fly past
  const speedLines = [];
  for (let i = 0; i < 34; i++) {
    speedLines.push({
      y: rand(0.35, 0.95),
      len: rand(30, 140),
      speed: rand(0.7, 1.4),
      c: Math.random() < 0.3 ? LIGHT_WARM : LIGHT_COOL,
      a: rand(0.25, 0.85),
      offset: Math.random() * WORLD_LEN
    });
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = Math.max(1, rect.width);
    h = Math.max(1, rect.height);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  resize();
  const ro = new ResizeObserver(resize);
  ro.observe(canvas);

  function drawMountainLayer(sx, parallax) {
    // Far mountains — slowest parallax
    const yBase = h * 0.55;
    ctx.fillStyle = MOUNTAIN;
    ctx.beginPath();
    ctx.moveTo(0, h);
    for (const m of mountains) {
      const x = ((m.x - sx * parallax) % WORLD_LEN + WORLD_LEN) % WORLD_LEN - 200;
      const x2 = x + m.w;
      ctx.lineTo(x, yBase - m.h * 0.5);
      ctx.lineTo(x + m.w * 0.5, yBase - m.h);
      ctx.lineTo(x2, yBase - m.h * 0.5);
    }
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fill();
  }

  function drawTreeLayer(sx, parallax) {
    // Mid trees — medium parallax
    const yBase = h * 0.72;
    ctx.fillStyle = TREE;
    for (const t of trees) {
      const x = ((t.x - sx * parallax) % WORLD_LEN + WORLD_LEN) % WORLD_LEN - 100;
      ctx.beginPath();
      ctx.moveTo(x, yBase);
      ctx.lineTo(x + t.lean * t.h, yBase - t.h);
      ctx.lineTo(x + t.h * 0.35, yBase);
      ctx.closePath();
      ctx.fill();
    }
  }

  function drawPoleLayer(sx, parallax, sceneAlpha) {
    // Catenary poles — fast parallax, strong speed cue
    const yBase = h * 0.86;
    const poleH = h * 0.22;
    ctx.strokeStyle = `rgba(90,140,200,${0.18 * sceneAlpha})`;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    for (const p of poles) {
      const x = ((p.x - sx * parallax) % WORLD_LEN + WORLD_LEN) % WORLD_LEN - 100;
      if (x < -20 || x > w + 20) continue;
      ctx.beginPath();
      ctx.moveTo(x, yBase);
      ctx.lineTo(x, yBase - poleH);
      // Cross-arm
      ctx.moveTo(x - 14, yBase - poleH + 6);
      ctx.lineTo(x + 14, yBase - poleH + 6);
      ctx.stroke();
    }
  }

  function drawGround(sx, sceneAlpha) {
    // Ground band
    const yGround = h * 0.78;
    ctx.fillStyle = GROUND;
    ctx.fillRect(0, yGround, w, h - yGround);

    // Ballast / gravel line
    ctx.fillStyle = `rgba(42,63,102,${0.35 * sceneAlpha})`;
    ctx.fillRect(0, yGround, w, 3);

    // Sleepers (ties) — fastest parallax, rush by underneath
    const tieW = 8, tieH = 5, gap = 34;
    const yTie = h * 0.82;
    ctx.fillStyle = TIE;
    const offset = (sx % gap);
    for (let x = -gap; x < w + gap; x += gap) {
      ctx.fillRect(x - offset, yTie, tieW, tieH);
    }

    // Rail — two bright lines with motion sheen
    const yRail1 = h * 0.84;
    const yRail2 = h * 0.86;
    ctx.strokeStyle = `rgba(120,160,220,${0.75 * sceneAlpha})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, yRail1); ctx.lineTo(w, yRail1);
    ctx.moveTo(0, yRail2); ctx.lineTo(w, yRail2);
    ctx.stroke();

    // Rail joint flashes — subtle repeating glints
    ctx.fillStyle = `rgba(120,180,255,${0.14 * sceneAlpha})`;
    const jointGap = 160;
    const jOff = (sx % jointGap);
    for (let x = -jointGap; x < w + jointGap; x += jointGap) {
      ctx.fillRect(x - jOff, yRail1 - 1, 4, 2);
      ctx.fillRect(x - jOff, yRail2 - 1, 4, 2);
    }
  }

  function drawSpeedLines(sx, sceneAlpha) {
    // Horizontal streaks that whip past — the "window light" feel
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const s of speedLines) {
      const y = h * s.y;
      const x = w - ((sx * s.speed + s.offset) % (w + s.len + 60)) + s.len;
      const alpha = s.a * sceneAlpha * Math.min(1, vel * 2.2);
      if (alpha < 0.03) continue;
      const grad = ctx.createLinearGradient(x - s.len, y, x, y);
      grad.addColorStop(0, 'rgba(255,255,255,0)');
      grad.addColorStop(0.7, s.c + '00');
      grad.addColorStop(1, s.c);
      ctx.strokeStyle = grad;
      ctx.globalAlpha = alpha;
      ctx.lineWidth = rand(1, 2.5);
      ctx.beginPath();
      ctx.moveTo(x - s.len, y);
      ctx.lineTo(x, y);
      ctx.stroke();
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  function drawTrain(x, y, scale, vel, arrived, sceneAlpha) {
    // Train sits centered, slight bob with speed; when arrived, it eases to a stop
    const tw = 260 * scale;
    const th = 64 * scale;
    const bob = Math.sin(performance.now() * 0.012) * 1.2 * vel;
    const yy = y + bob;

    ctx.save();
    ctx.translate(x, yy);
    if (!active && engage < 0.1) {
      ctx.globalAlpha = sceneAlpha * engage;
    }

    // Motion trail — soft streak trailing the rear at speed
    if (vel > 0.3) {
      const trailLen = tw * vel * 0.7;
      const tg = ctx.createLinearGradient(-trailLen, 0, 0, 0);
      tg.addColorStop(0, 'rgba(90,160,255,0)');
      tg.addColorStop(1, `rgba(90,160,255,${0.18 * vel * sceneAlpha})`);
      ctx.fillStyle = tg;
      ctx.fillRect(-trailLen, th * 0.12, trailLen, th * 0.76);
    }

    // Body — aerodynamic nose pointing right
    const grad = ctx.createLinearGradient(0, 0, tw, 0);
    grad.addColorStop(0, TRAIN_BODY);
    grad.addColorStop(0.7, '#1a2c4a');
    grad.addColorStop(1, '#0e1a2e');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(0, th * 0.15);
    ctx.quadraticCurveTo(0, 0, tw * 0.18, 0);
    ctx.lineTo(tw * 0.82, 0);
    ctx.quadraticCurveTo(tw, 0, tw, th * 0.15);
    ctx.lineTo(tw, th * 0.85);
    ctx.quadraticCurveTo(tw, th, tw * 0.85, th);
    ctx.lineTo(tw * 0.15, th);
    ctx.quadraticCurveTo(0, th, 0, th * 0.85);
    ctx.closePath();
    ctx.fill();

    // Green stripe — eCOPY brand line
    ctx.fillStyle = TRAIN_STRIPE;
    ctx.fillRect(tw * 0.06, th * 0.32, tw * 0.88, th * 0.08);

    // Windows — warm lit rectangles
    const winCount = 7;
    const winW = (tw * 0.7) / winCount;
    for (let i = 0; i < winCount; i++) {
      const wx = tw * 0.12 + i * winW;
      const warm = i % 3 === 0;
      ctx.fillStyle = warm ? `rgba(255,209,102,${0.85 * sceneAlpha})` : `rgba(90,210,255,${0.7 * sceneAlpha})`;
      ctx.beginPath();
      ctx.roundRect(wx, th * 0.22, winW * 0.7, th * 0.28, 2);
      ctx.fill();
    }

    // Windshield / cab
    ctx.fillStyle = `rgba(180,230,255,${0.9 * sceneAlpha})`;
    ctx.beginPath();
    ctx.moveTo(tw * 0.82, th * 0.1);
    ctx.lineTo(tw * 0.95, th * 0.1);
    ctx.lineTo(tw * 0.95, th * 0.42);
    ctx.lineTo(tw * 0.88, th * 0.42);
    ctx.closePath();
    ctx.fill();

    // Headlight beam — projects forward, brighter at speed
    const beamLen = tw * (0.5 + vel * 0.9);
    const beamGrad = ctx.createLinearGradient(tw, th * 0.45, tw + beamLen, th * 0.45);
    beamGrad.addColorStop(0, `rgba(255,240,200,${0.55 * vel * sceneAlpha})`);
    beamGrad.addColorStop(1, 'rgba(255,240,200,0)');
    ctx.fillStyle = beamGrad;
    ctx.beginPath();
    ctx.moveTo(tw, th * 0.3);
    ctx.lineTo(tw + beamLen, th * 0.15);
    ctx.lineTo(tw + beamLen, th * 0.75);
    ctx.lineTo(tw, th * 0.6);
    ctx.closePath();
    ctx.fill();
    // Headlight glow dot
    ctx.fillStyle = `rgba(255,240,200,${0.9 * sceneAlpha})`;
    ctx.beginPath();
    ctx.arc(tw * 0.98, th * 0.45, 3.5 * scale, 0, Math.PI * 2);
    ctx.fill();

    // Bogies / wheels
    ctx.fillStyle = '#0a1220';
    ctx.beginPath();
    ctx.roundRect(tw * 0.12, th * 0.88, tw * 0.28, th * 0.14, 4);
    ctx.roundRect(tw * 0.6, th * 0.88, tw * 0.28, th * 0.14, 4);
    ctx.fill();
    ctx.fillStyle = `rgba(90,140,200,${0.5 * sceneAlpha})`;
    for (const bx of [tw * 0.18, tw * 0.32, tw * 0.66, tw * 0.8]) {
      ctx.beginPath();
      ctx.arc(bx, th * 0.95, 5 * scale, 0, Math.PI * 2);
      ctx.fill();
    }

    // Pantograph spark when fast
    if (vel > 0.55) {
      const sparkX = tw * 0.45;
      const sparkY = -8 * scale;
      const sparkA = (0.5 + Math.random() * 0.5) * vel * sceneAlpha;
      ctx.strokeStyle = `rgba(120,220,255,${sparkA})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(sparkX - 12, sparkY - 14);
      ctx.lineTo(sparkX, sparkY);
      ctx.lineTo(sparkX + 12, sparkY - 14);
      ctx.stroke();
      ctx.fillStyle = `rgba(200,240,255,${sparkA})`;
      ctx.beginPath();
      ctx.arc(sparkX, sparkY - 14, 2 + Math.random() * 3, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  function frame(now) {
    if (!running) return;
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000 || 0.016);
    last = now;

    // ---- engage ramp (station pull-out) ----
    const engageTarget = active ? 1 : 0;
    engage = approach(engage, engageTarget, dt, active ? 1.8 : 1.4);

    // ---- desired velocity ----
    // Baseline cruise keeps the scenery ALWAYS flowing while active — the
    // train never looks frozen even during slow copies or the verify phase.
    const speedK = Math.max(0, Math.min(1,
      Math.log10(1 + smoothSpeedBps / 1e6) / Math.log10(51)));
    let targetVel = active ? (0.45 + speedK * 0.55) * engage : 0;

    // Decelerate over the last 8% — pulling into the destination platform.
    // Keep a crawl-speed floor so the scene never freezes during long verifies.
    if (displayProgress > 0.92 && active) {
      targetVel *= Math.max(0.18, (1 - displayProgress) / 0.08);
    }

    // Ease toward target (heavy train: slow accel, firm brake).
    vel = approach(vel, targetVel, dt, targetVel > vel ? 1.6 : 2.8);

    // ---- arrival ----
    const fullyThere = active && displayProgress >= 0.9995;
    if (fullyThere) {
      arrived = approach(arrived, 1, dt, 3.2);
      if (arrived > 0.85 && !arrivedFired) {
        arrivedFired = true;
        if (onArriveCb) onArriveCb();
      }
    } else {
      arrived = approach(arrived, 0, dt, 2);
    }

    const sceneAlpha = active ? 1 : Math.max(0, 1 - (1 - engage) * 1.2);

    // World scrolls continuously from velocity — always alive. Progress only
    // drives the station platforms, so the landscape flows even when SSE
    // ticks are sparse or the job is in the read-back phase.
    worldX += vel * dt * 900;

    // ---- sky ----
    ctx.globalCompositeOperation = 'source-over';
    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, SKY_TOP);
    sky.addColorStop(1, SKY_BOTTOM);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);

    // Distant stars (very sparse, fixed)
    ctx.fillStyle = `rgba(200,220,255,${0.35 * sceneAlpha})`;
    for (let i = 0; i < 30; i++) {
      const sx = ((i * 137 + worldX * 0.02) % (w + 100)) - 50;
      const sy = ((i * 89) % Math.max(1, h * 0.4)) + 8;
      ctx.fillRect(sx, sy, 1.2, 1.2);
    }

    // ---- parallax layers ----
    drawMountainLayer(worldX, 0.12);
    drawTreeLayer(worldX, 0.38);
    drawPoleLayer(worldX, 0.9, sceneAlpha);
    drawGround(worldX, sceneAlpha);
    drawSpeedLines(worldX, sceneAlpha);

    // ---- train ----
    const trainScale = Math.min(1, h / 220);
    const trainW = 260 * trainScale;
    const trainH = 64 * trainScale;
    const trainX = w / 2 - trainW / 2;
    const trainY = h * 0.78 - trainH;
    drawTrain(trainX, trainY, trainScale, vel, arrived, sceneAlpha);

    // ---- arrival glow (soft, at the platform) ----
    if (arrived > 0) {
      const g = ctx.createRadialGradient(w / 2, h * 0.5, 0, w / 2, h * 0.5, w * 0.4);
      g.addColorStop(0, `rgba(47,224,127,${arrived * 0.22})`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }
  }

  // Kick off the render loop. If the document starts hidden (occluded
  // Electron window), rAF may be delayed, so we also poll to ensure it starts.
  raf = requestAnimationFrame((t) => { last = t; frame(t); });
  const kickStart = setInterval(() => {
    if (!raf && !document.hidden) {
      raf = requestAnimationFrame((t) => { last = t; frame(t); });
    }
    if (raf) clearInterval(kickStart);
  }, 250);

  const onVis = () => {
    if (document.hidden) {
      cancelAnimationFrame(raf);
      raf = 0;
    } else {
      if (!raf) raf = requestAnimationFrame((t) => { last = t; frame(t); });
    }
  };
  document.addEventListener('visibilitychange', onVis);

  return {
    update(state) {
      const wasActive = active;
      active = !!state.active;
      targetProgress = Math.max(0, Math.min(1, state.progress || 0));
      targetSpeedBps = state.speedBps || 0;
      const now = performance.now();
      if (active && !wasActive) {
        arrivedFired = false;
        activateAt = now;
      }
      const dt = lastUpdateTs ? Math.min(0.5, (now - lastUpdateTs) / 1000) : 0.016;
      lastUpdateTs = now;
      displayProgress = approach(displayProgress, targetProgress, dt, 6);
      // Floor the journey at MIN_RAMP_MS: while active, the displayed value
      // may never outrun the smootherstep ramp, so a 0.5s copy still plays
      // a full 3-second animation before the arrival sequence.
      if (active) {
        const ramp = smootherstep(Math.min(1, (now - activateAt) / MIN_RAMP_MS));
        if (displayProgress > ramp) displayProgress = ramp;
      }
      smoothSpeedBps = approach(smoothSpeedBps, targetSpeedBps, dt, 4);
    },
    // Smoothed 0..1 progress for the HUD (no jumps between SSE ticks).
    displayProgress() { return displayProgress; },
    onArrive(cb) { onArriveCb = cb; },
    destroy() {
      running = false;
      cancelAnimationFrame(raf);
      ro.disconnect();
      document.removeEventListener('visibilitychange', onVis);
    }
  };
}
