// LightRail — a minimal "data shuttle on a rail" copy animation.
//
// One thin rail, a small glowing shuttle whose position mirrors progress,
// and rail ticks that flow past at a speed proportional to the real copy
// speed. When the journey completes, the destination ring lights up green.
//
// Lifecycle: dormant → engaging → cruising → arriving → settled
//
//   const w = createWarp(canvas);
//   w.update({ active, progress, speedBps });   // call every SSE tick
//   const pct = w.displayProgress();            // smoothed 0..1 for the HUD
//   w.onArrive(() => { /* fade the stage out */ });
//   w.destroy();

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

// Palette — the app's ink-navy family.
const BG = '#070d1a';
const RAIL = 'rgba(120, 160, 220, 0.28)';
const TICK = '120, 160, 220';
const FILL_A = '#3b82f6';
const FILL_B = '#2fe07f';
const SHUTTLE_BODY = '#12203a';
const STRIPE = '#2fe07f';
const HEADLIGHT = '#eaf6ff';

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
  let vel = 0;          // 0..1 normalized shuttle velocity
  let engage = 0;       // 0 → 1 ramp on activation
  let arrived = 0;      // 0 → 1 arrival envelope
  let arrivedFired = false;
  let onArriveCb = null;

  // World offset drives the tick flow — the speed cue.
  let worldX = 0;

  // Sparse drifting motes in the upper half — the only decoration.
  const motes = [];
  for (let i = 0; i < 12; i++) {
    motes.push({
      x: Math.random(),
      y: 0.10 + Math.random() * 0.36,
      r: 0.8 + Math.random() * 1.3,
      a: 0.10 + Math.random() * 0.16,
      drift: 0.03 + Math.random() * 0.06
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

  function frame(now) {
    if (!running) return;
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000 || 0.016);
    last = now;

    // ---- engage ramp ----
    const engageTarget = active ? 1 : 0;
    engage = approach(engage, engageTarget, dt, active ? 1.8 : 1.4);

    // ---- desired velocity ----
    // Baseline cruise keeps the ticks ALWAYS flowing while active — the
    // scene never looks frozen even during slow copies or the verify phase.
    const speedK = Math.max(0, Math.min(1,
      Math.log10(1 + smoothSpeedBps / 1e6) / Math.log10(51)));
    let targetVel = active ? (0.45 + speedK * 0.55) * engage : 0;

    // Ease off over the last 8% — pulling into the destination. Keep a
    // crawl floor so the scene never freezes during long verifies.
    if (displayProgress > 0.92 && active) {
      targetVel *= Math.max(0.18, (1 - displayProgress) / 0.08);
    }

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
    if (sceneAlpha <= 0.01 && !active) {
      // Fully faded — nothing left to paint this frame.
      return;
    }

    worldX += vel * dt * 640;

    // ---- background ----
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, w, h);

    // ---- geometry ----
    const pad = Math.max(30, w * 0.06);
    const railY = h * 0.60;
    const x0 = pad;
    const x1 = w - pad;
    const span = Math.max(1, x1 - x0);
    const shuttleX = x0 + displayProgress * span;

    // ---- drifting motes ----
    ctx.fillStyle = `rgba(200, 220, 255, 1)`;
    for (const m of motes) {
      const px = ((m.x * w - worldX * m.drift) % w + w) % w;
      ctx.globalAlpha = m.a * sceneAlpha;
      ctx.beginPath();
      ctx.arc(px, m.y * h, m.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // ---- base rail ----
    ctx.strokeStyle = RAIL;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x0, railY);
    ctx.lineTo(x1, railY);
    ctx.stroke();

    // ---- flowing ticks (speed ∝ copy speed) ----
    const tickGap = 26;
    const off = worldX % tickGap;
    const tickA = (0.16 + vel * 0.5) * sceneAlpha;
    ctx.strokeStyle = `rgba(${TICK}, ${tickA.toFixed(3)})`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let x = x0 - off; x <= x1; x += tickGap) {
      if (x < x0 + 3 || x > x1 - 3) continue;
      ctx.moveTo(x, railY + 5);
      ctx.lineTo(x, railY + 11);
    }
    ctx.stroke();

    // ---- progress fill along the rail ----
    if (displayProgress > 0.002) {
      const grad = ctx.createLinearGradient(x0, railY, x1, railY);
      grad.addColorStop(0, FILL_A);
      grad.addColorStop(1, FILL_B);
      ctx.strokeStyle = grad;
      ctx.globalAlpha = 0.55 * sceneAlpha;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(x0, railY);
      ctx.lineTo(shuttleX, railY);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // ---- destination ring ----
    if (arrived > 0.02) {
      // Lit ring + expanding pulse on arrival.
      ctx.fillStyle = STRIPE;
      ctx.globalAlpha = arrived;
      ctx.beginPath();
      ctx.arc(x1, railY, 4.5, 0, Math.PI * 2);
      ctx.fill();
      for (const k of [0, 0.5]) {
        const ph = (arrived * 1.1 + k) % 1;
        ctx.strokeStyle = `rgba(47, 224, 127, ${((1 - ph) * 0.45 * arrived).toFixed(3)})`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(x1, railY, 7 + ph * 30, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    } else {
      ctx.strokeStyle = `rgba(${TICK}, ${(0.55 * sceneAlpha).toFixed(3)})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(x1, railY, 5, 0, Math.PI * 2);
      ctx.stroke();
    }

    // ---- shuttle ----
    // Position mirrors progress; ticks mirror speed; a tiny bob keeps it
    // alive. Motion trail stretches with velocity.
    const alpha = Math.min(1, engage * 1.3) * sceneAlpha;
    if (alpha > 0.02) {
      const bob = Math.sin(now * 0.012) * 1.1 * vel;
      const yy = railY + bob;

      // Trail
      if (vel > 0.12) {
        const tl = 30 + vel * 130;
        const tg = ctx.createLinearGradient(shuttleX - tl, yy, shuttleX, yy);
        tg.addColorStop(0, 'rgba(90, 160, 255, 0)');
        tg.addColorStop(1, `rgba(90, 160, 255, ${0.22 * vel})`);
        ctx.strokeStyle = tg;
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(shuttleX - tl, yy);
        ctx.lineTo(shuttleX - 16, yy);
        ctx.stroke();
      }

      // Capsule body
      ctx.globalAlpha = alpha;
      ctx.fillStyle = SHUTTLE_BODY;
      ctx.strokeStyle = 'rgba(90, 140, 200, 0.55)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(shuttleX - 22, yy - 7, 44, 14, 7);
      ctx.fill();
      ctx.stroke();

      // Brand stripe
      ctx.fillStyle = STRIPE;
      ctx.fillRect(shuttleX - 14, yy - 1.5, 22, 3);

      // Headlight glow
      ctx.fillStyle = HEADLIGHT;
      ctx.shadowColor = 'rgba(234, 246, 255, 0.9)';
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.arc(shuttleX + 16, yy, 2.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
    }

    // ---- arrival wash (soft, once) ----
    if (arrived > 0) {
      const g = ctx.createRadialGradient(x1, railY, 0, x1, railY, w * 0.3);
      g.addColorStop(0, `rgba(47, 224, 127, ${arrived * 0.16})`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'source-over';
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
