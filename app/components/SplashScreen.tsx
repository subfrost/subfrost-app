'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useAlkanesSDK } from '@/context/AlkanesSDKContext';

/**
 * Full-screen splash with animated canvas snowflake + progress bar.
 * Renders as a React component so it doesn't cause hydration mismatches.
 *
 * Tracks REAL loading milestones to drive progress:
 *   1. SDK WASM initialized (isInitialized from AlkanesSDKContext)
 *   2. Fonts loaded (document.fonts.ready)
 *   3. Critical images preloaded (backgrounds + core token icons)
 *   4. Page fully loaded (document.readyState === 'complete')
 *
 * Each milestone advances the progress bar by ~25%. The splash always
 * animates to 100% before dismissing — no instant-dismiss fast path.
 *
 * Enforces a minimum display time (MIN_DISPLAY_MS) so the animation
 * is visible even on fast connections / cached loads.
 *
 * JOURNAL (2026-02-11): Rewrote to fix instant-dismiss bug. Previous
 * version checked `elapsed < 1000` and called `dismiss(true)` which
 * skipped the progress animation entirely. Both `document.readyState`
 * and `isInitialized` resolved within milliseconds of mount because
 * the WASM is statically imported and readyState is already 'complete'
 * by the time React hydrates. Now tracks 4 real milestones and always
 * shows the progress animation reaching 100%.
 */

/** Images to preload during splash so they're cached before the app renders */
const CRITICAL_IMAGES = [
  '/background/snowflakes-bg.svg',
  '/background/snowflakes-bg-light.svg',
  '/background/watermark-bg.svg',
  '/tokens/btc.svg',
  '/tokens/frbtc.svg',
  '/tokens/eth.svg',
  '/tokens/usdt.svg',
  '/tokens/zec.svg',
];

/** Minimum time (ms) the splash is shown so the animation is visible */
const MIN_DISPLAY_MS = 2000;

export default function SplashScreen() {
  const { isInitialized } = useAlkanesSDK();
  const [visible, setVisible] = useState(true);
  const [fading, setFading] = useState(false);

  // Real loading milestones
  const [fontsLoaded, setFontsLoaded] = useState(false);
  const [imagesLoaded, setImagesLoaded] = useState(false);
  const [pageLoaded, setPageLoaded] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const readyRef = useRef(false);
  const startRef = useRef(performance.now());
  const frameRef = useRef<number>(0);
  /** Milestone-driven progress ceiling (0–100), read by the animation loop */
  const milestonePRef = useRef(0);

  // ---------------------------------------------------------------------------
  // Milestone tracking
  // ---------------------------------------------------------------------------

  // Milestone 1: SDK WASM initialization (tracked via isInitialized prop)

  // Milestone 2: All declared fonts loaded
  useEffect(() => {
    document.fonts.ready.then(() => setFontsLoaded(true));
  }, []);

  // Milestone 3: Critical images preloaded into browser cache
  useEffect(() => {
    let mounted = true;
    const promises = CRITICAL_IMAGES.map(
      (src) =>
        new Promise<void>((resolve) => {
          const img = new Image();
          img.onload = () => resolve();
          img.onerror = () => resolve(); // Don't block on missing images
          img.src = src;
        }),
    );
    Promise.all(promises).then(() => {
      if (mounted) setImagesLoaded(true);
    });
    return () => {
      mounted = false;
    };
  }, []);

  // Milestone 4: All page resources (JS, CSS, sub-resources) finished loading
  useEffect(() => {
    if (document.readyState === 'complete') {
      setPageLoaded(true);
      return;
    }
    const onLoad = () => setPageLoaded(true);
    window.addEventListener('load', onLoad);
    return () => window.removeEventListener('load', onLoad);
  }, []);

  // Update the milestone progress ref whenever milestones change.
  // The animation loop reads this ref every frame.
  useEffect(() => {
    let count = 0;
    if (isInitialized) count++;
    if (fontsLoaded) count++;
    if (imagesLoaded) count++;
    if (pageLoaded) count++;
    milestonePRef.current = (count / 4) * 100;
  }, [isInitialized, fontsLoaded, imagesLoaded, pageLoaded]);

  // ---------------------------------------------------------------------------
  // Dismiss logic
  // ---------------------------------------------------------------------------

  const dismiss = useCallback((fade: boolean) => {
    if (fade) {
      setFading(true);
      setTimeout(() => setVisible(false), 550);
    } else {
      setVisible(false);
    }
  }, []);

  // All milestones complete + minimum display time elapsed → allow 100%
  useEffect(() => {
    if (!isInitialized || !fontsLoaded || !imagesLoaded || !pageLoaded) return;

    const elapsed = performance.now() - startRef.current;
    const remaining = MIN_DISPLAY_MS - elapsed;

    if (remaining <= 0) {
      readyRef.current = true;
    } else {
      const timer = setTimeout(() => {
        readyRef.current = true;
      }, remaining);
      return () => clearTimeout(timer);
    }
  }, [isInitialized, fontsLoaded, imagesLoaded, pageLoaded]);

  // ---------------------------------------------------------------------------
  // Canvas animation
  // ---------------------------------------------------------------------------

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
      const milestoneTarget = milestonePRef.current;

      if (!readyRef.current) {
        // Drive progress toward milestone ceiling.
        // Approach smoothly so the bar doesn't jump in 25% steps.
        if (targetP < milestoneTarget) {
          targetP += Math.max(0.5, (milestoneTarget - targetP) * 0.06);
        } else {
          // Small creep past the last milestone for natural feel
          targetP += 0.015;
        }
        // Never exceed 95% until readyRef is true
        targetP = Math.min(targetP, 95);
      } else {
        targetP = 100;
      }

      progress += (targetP - progress) * 0.08;

      const elapsed = (performance.now() - t0) / 1000;
      draw(elapsed);
      if (bar) bar.style.width = Math.min(progress, 100) + '%';
      if (pct) pct.textContent = Math.round(Math.min(progress, 100)) + '%';

      if (readyRef.current && progress > 99.5) {
        dismiss(true);
        return;
      }
      frameRef.current = requestAnimationFrame(tick);
    }
    tick();

    const safetyTimer = setTimeout(() => { readyRef.current = true; }, 5000);
    return () => { cancelAnimationFrame(frameRef.current); clearTimeout(safetyTimer); };
  }, [visible, fading, dismiss]);

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
          color: 'rgba(91,156,255,1)',
          letterSpacing: 3,
        }}
      />
    </div>
  );
}
