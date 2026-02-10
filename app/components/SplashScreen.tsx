'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useAlkanesSDK } from '@/context/AlkanesSDKContext';

/**
 * Full-screen splash with animated canvas snowflake + progress bar.
 * Renders as a React component so it doesn't cause hydration mismatches.
 *
 * Dismisses only when ALL of the following are true:
 * 1. SDK WASM is initialized (isInitialized)
 * 2. All page assets have loaded (document.readyState === 'complete')
 *
 * This ensures the user never sees a "looks interactive but isn't" state.
 */
export default function SplashScreen() {
  const { isInitialized } = useAlkanesSDK();
  const [visible, setVisible] = useState(true);
  const [fading, setFading] = useState(false);
  const [pageLoaded, setPageLoaded] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const readyRef = useRef(false);
  const startRef = useRef(performance.now());
  const frameRef = useRef<number>(0);

  // Track when all page resources (JS, CSS, images, WASM) have finished loading
  useEffect(() => {
    if (document.readyState === 'complete') {
      setPageLoaded(true);
      return;
    }
    const onLoad = () => setPageLoaded(true);
    window.addEventListener('load', onLoad);
    return () => window.removeEventListener('load', onLoad);
  }, []);

  const dismiss = useCallback((fast: boolean) => {
    if (fast) {
      setVisible(false);
    } else {
      setFading(true);
      setTimeout(() => setVisible(false), 550);
    }
  }, []);

  // Canvas animation
  useEffect(() => {
    if (!visible || fading) return;
    const canvas = canvasRef.current;
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

    // Particles
    const pts: { x: number; y: number; vx: number; vy: number; s: number; a: number }[] = [];
    for (let i = 0; i < 15; i++) {
      pts.push({
        x: Math.random() * W, y: Math.random() * H,
        vx: (Math.random() - 0.5) * 0.2, vy: (Math.random() - 0.5) * 0.2,
        s: Math.random() * 1.2 + 0.4, a: Math.random() * 0.3 + 0.08,
      });
    }

    const bar = document.getElementById('sf-splash-bar');
    const pct = document.getElementById('sf-splash-pct');

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
          ctx!.beginPath(); ctx!.moveTo(0, 0); ctx!.lineTo(sz, 0); ctx!.stroke();
          const bp = [0.35, 0.6, 0.82], bl = [0.38, 0.28, 0.16], ba = 0.6981;
          for (let j = 0; j < 3; j++) {
            const px = bp[j] * sz, ln = bl[j] * sz;
            ctx!.beginPath(); ctx!.moveTo(px, 0);
            ctx!.lineTo(px + ln * Math.cos(ba), -ln * Math.sin(ba)); ctx!.stroke();
            ctx!.beginPath(); ctx!.moveTo(px, 0);
            ctx!.lineTo(px + ln * Math.cos(-ba), -ln * Math.sin(-ba)); ctx!.stroke();
          }
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

    function tick() {
      if (!readyRef.current) {
        if (targetP < 20) targetP += 0.6;
        else if (targetP < 45) targetP += 0.25;
        else if (targetP < 70) targetP += 0.1;
        else if (targetP < 88) targetP += 0.03;
      } else {
        targetP = 100;
      }
      progress += (targetP - progress) * 0.08;

      const elapsed = (performance.now() - t0) / 1000;
      draw(elapsed);
      if (bar) bar.style.width = Math.min(progress, 100) + '%';
      if (pct) pct.textContent = Math.round(Math.min(progress, 100)) + '%';

      if (readyRef.current && progress > 99.5) {
        dismiss(false);
        return;
      }
      frameRef.current = requestAnimationFrame(tick);
    }
    tick();

    const safetyTimer = setTimeout(() => { readyRef.current = true; }, 30000);
    return () => { cancelAnimationFrame(frameRef.current); clearTimeout(safetyTimer); };
  }, [visible, fading, dismiss]);

  // Dismiss only when SDK is initialized AND page is fully loaded
  useEffect(() => {
    if (!isInitialized || !pageLoaded) return;
    const elapsed = performance.now() - startRef.current;
    if (elapsed < 1000) {
      dismiss(true);
    } else {
      readyRef.current = true;
    }
  }, [isInitialized, pageLoaded, dismiss]);

  if (!visible) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99999,
        background: '#0a1628',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        opacity: fading ? 0 : 1,
        transition: fading ? 'opacity 0.5s ease' : undefined,
        pointerEvents: fading ? 'none' : undefined,
      }}
    >
      <canvas
        ref={canvasRef}
        width={160}
        height={160}
        style={{ width: 160, height: 160 }}
      />
      {/* SUBFROST wordmark — geometric SVG paths, no font dependency */}
      <svg
        width="220"
        height="24"
        viewBox="0 0 220 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{ marginTop: 20 }}
      >
        <defs>
          <filter id="sf-glow">
            <feGaussianBlur stdDeviation="2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <g filter="url(#sf-glow)" stroke="#5b9cff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none">
          {/* S */}
          <path d="M14 4 L4 4 L4 11 L14 11 L14 20 L4 20" />
          {/* U */}
          <path d="M22 4 L22 18 Q22 20 24 20 L32 20 Q34 20 34 18 L34 4" />
          {/* B */}
          <path d="M42 4 L42 20 L50 20 Q54 20 54 16 Q54 12.5 50 12 L42 12 M42 4 L50 4 Q54 4 54 8 Q54 12 50 12" />
          {/* F */}
          <path d="M62 4 L74 4 M62 4 L62 20 M62 12 L72 12" />
          {/* R */}
          <path d="M82 4 L82 20 M82 4 L90 4 Q94 4 94 8 Q94 12 90 12 L82 12 M90 12 L94 20" />
          {/* O */}
          <path d="M104 6 Q102 4 104 4 L112 4 Q114 4 114 6 L114 18 Q114 20 112 20 L104 20 Q102 20 102 18 Z" />
          {/* S */}
          <path d="M132 4 L122 4 L122 11 L132 11 L132 20 L122 20" />
          {/* T */}
          <path d="M140 4 L154 4 M147 4 L147 20" />
        </g>
      </svg>
      <div
        style={{
          marginTop: 28,
          width: 200,
          height: 2,
          background: 'rgba(91,156,255,0.12)',
          borderRadius: 1,
          overflow: 'hidden',
        }}
      >
        <div
          id="sf-splash-bar"
          style={{
            height: '100%',
            width: '0%',
            background: 'linear-gradient(90deg, #3a6fd8, #5b9cff, #c7e0fe)',
            borderRadius: 1,
            transition: 'width 0.3s ease',
          }}
        />
      </div>
      <div
        id="sf-splash-pct"
        style={{
          marginTop: 10,
          fontSize: 10,
          fontFamily: '"Courier New", Courier, monospace',
          color: 'rgba(91,156,255,0.4)',
          letterSpacing: 3,
        }}
      />
    </div>
  );
}
