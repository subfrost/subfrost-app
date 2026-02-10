'use client';

import { useEffect, useRef } from 'react';
import { useAlkanesSDK } from '@/context/AlkanesSDKContext';

/**
 * Takes over the server-rendered #sf-splash div, runs the canvas snowflake
 * animation + progress bar, and fades it out once the SDK is initialized.
 *
 * The static splash HTML in layout.tsx shows "SUBFROST" immediately on page
 * load. This component starts the animation once React hydrates, tracks WASM
 * initialization, and dismisses the splash when everything is ready.
 */
export default function SplashDismisser() {
  const { isInitialized } = useAlkanesSDK();
  const readyRef = useRef(false);
  const goneRef = useRef(false);
  const startRef = useRef(performance.now());

  useEffect(() => {
    const splash = document.getElementById('sf-splash');
    if (!splash || goneRef.current) return;

    const canvas = document.getElementById('sf-splash-canvas') as HTMLCanvasElement | null;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const W = 160, H = 160;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.scale(dpr, dpr);

    const t0 = startRef.current;
    let progress = 0, targetP = 0;
    let frameId: number;

    // Particles
    const pts: { x: number; y: number; vx: number; vy: number; s: number; a: number }[] = [];
    for (let i = 0; i < 15; i++) {
      pts.push({
        x: Math.random() * W, y: Math.random() * H,
        vx: (Math.random() - 0.5) * 0.2, vy: (Math.random() - 0.5) * 0.2,
        s: Math.random() * 1.2 + 0.4, a: Math.random() * 0.3 + 0.08,
      });
    }

    function draw(t: number) {
      ctx!.clearRect(0, 0, W, H);
      const cx = W / 2, cy = H / 2;
      const pulse = 1 + Math.sin(t * 1.5) * 0.03;
      const sz = 55 * pulse;
      const rot = t * 0.08;

      // Particles
      for (const p of pts) {
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0) p.x = W; if (p.x > W) p.x = 0;
        if (p.y < 0) p.y = H; if (p.y > H) p.y = 0;
        ctx!.beginPath(); ctx!.arc(p.x, p.y, p.s, 0, 6.283);
        ctx!.fillStyle = `rgba(91,156,255,${p.a})`; ctx!.fill();
      }

      ctx!.save(); ctx!.translate(cx, cy); ctx!.rotate(rot);

      // Two-pass glow
      for (let pass = 0; pass < 2; pass++) {
        if (pass === 0) {
          ctx!.globalAlpha = 0.25; ctx!.lineWidth = 3.5; ctx!.shadowBlur = 25;
        } else {
          ctx!.globalAlpha = 1; ctx!.lineWidth = 1.5; ctx!.shadowBlur = 8;
        }
        ctx!.shadowColor = '#5b9cff'; ctx!.strokeStyle = '#5b9cff'; ctx!.lineCap = 'round';

        for (let i = 0; i < 6; i++) {
          ctx!.save(); ctx!.rotate(i * 1.0472);
          // Main arm
          ctx!.beginPath(); ctx!.moveTo(0, 0); ctx!.lineTo(sz, 0); ctx!.stroke();
          // Branches
          const bp = [0.35, 0.6, 0.82], bl = [0.38, 0.28, 0.16], ba = 0.6981;
          for (let j = 0; j < 3; j++) {
            const px = bp[j] * sz, ln = bl[j] * sz;
            ctx!.beginPath(); ctx!.moveTo(px, 0);
            ctx!.lineTo(px + ln * Math.cos(ba), -ln * Math.sin(ba)); ctx!.stroke();
            ctx!.beginPath(); ctx!.moveTo(px, 0);
            ctx!.lineTo(px + ln * Math.cos(-ba), -ln * Math.sin(-ba)); ctx!.stroke();
          }
          // Tip diamond
          if (pass === 1) {
            const d = 4;
            ctx!.fillStyle = 'rgba(199,224,254,0.35)';
            ctx!.beginPath();
            ctx!.moveTo(sz - d, 0); ctx!.lineTo(sz, -d);
            ctx!.lineTo(sz + d, 0); ctx!.lineTo(sz, d);
            ctx!.closePath(); ctx!.fill(); ctx!.stroke();
          }
          ctx!.restore();
        }
      }

      // Inner hex
      ctx!.globalAlpha = 0.35; ctx!.lineWidth = 1; ctx!.shadowBlur = 4;
      const hs = sz * 0.18;
      ctx!.beginPath();
      for (let i = 0; i < 6; i++) {
        const hx = hs * Math.cos(i * 1.0472), hy = hs * Math.sin(i * 1.0472);
        if (i === 0) ctx!.moveTo(hx, hy); else ctx!.lineTo(hx, hy);
      }
      ctx!.closePath(); ctx!.stroke();

      // Center dot
      ctx!.globalAlpha = 1; ctx!.shadowBlur = 12; ctx!.shadowColor = '#c7e0fe';
      ctx!.beginPath(); ctx!.arc(0, 0, 2.5, 0, 6.283);
      ctx!.fillStyle = '#c7e0fe'; ctx!.fill();

      ctx!.restore();
    }

    const bar = document.getElementById('sf-splash-bar');
    const pct = document.getElementById('sf-splash-pct');

    function tick() {
      if (goneRef.current) return;
      const elapsed = (performance.now() - t0) / 1000;

      // Simulated progress ramp
      if (!readyRef.current) {
        if (targetP < 20) targetP += 0.6;
        else if (targetP < 45) targetP += 0.25;
        else if (targetP < 70) targetP += 0.1;
        else if (targetP < 88) targetP += 0.03;
      } else {
        targetP = 100;
      }
      progress += (targetP - progress) * 0.08;

      draw(elapsed);
      if (bar) bar.style.width = Math.min(progress, 100) + '%';
      if (pct) pct.textContent = Math.round(Math.min(progress, 100)) + '%';

      if (readyRef.current && progress > 99.5) {
        splash!.style.transition = 'opacity 0.5s ease';
        splash!.style.opacity = '0';
        setTimeout(() => { splash!.remove(); goneRef.current = true; }, 550);
        return;
      }
      frameId = requestAnimationFrame(tick);
    }
    tick();

    // Safety: remove after 30s no matter what
    const safetyTimer = setTimeout(() => { if (!goneRef.current) readyRef.current = true; }, 30000);

    return () => {
      cancelAnimationFrame(frameId);
      clearTimeout(safetyTimer);
    };
  }, []); // Run once on mount

  // Watch for SDK initialization
  useEffect(() => {
    if (!isInitialized) return;
    const elapsed = performance.now() - startRef.current;

    if (elapsed < 1000) {
      // Fast load (cached) — skip animation, remove immediately
      const splash = document.getElementById('sf-splash');
      if (splash && !goneRef.current) {
        splash.style.transition = 'opacity 0.2s ease';
        splash.style.opacity = '0';
        setTimeout(() => { splash.remove(); goneRef.current = true; }, 250);
      }
    } else {
      // Slow load — let the animation finish to 100%
      readyRef.current = true;
    }
  }, [isInitialized]);

  return null;
}
