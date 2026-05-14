'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useAlkanesSDK } from '@/context/AlkanesSDKContext';

/**
 * Full-screen splash with the SUBFROST wordmark + progress bar.
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

  const readyRef = useRef(false);
  const startRef = useRef(0);
  const frameRef = useRef<number>(0);
  /** Milestone-driven progress ceiling (0–100), read by the animation loop */
  const milestonePRef = useRef(0);

  // ---------------------------------------------------------------------------
  // Milestone tracking
  // ---------------------------------------------------------------------------

  // Capture start time on mount (avoids impure call during render)
  useEffect(() => {
    startRef.current = performance.now();
  }, []);

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
  // Progress animation
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (!visible || fading) return;

    let progress = 0, targetP = 0;
    const bar = document.getElementById('sf-splash-bar');
    const pct = document.getElementById('sf-splash-pct');

    function tick() {
      const milestoneTarget = milestonePRef.current;

      if (!readyRef.current) {
        if (targetP < milestoneTarget) {
          targetP += Math.max(0.5, (milestoneTarget - targetP) * 0.06);
        } else {
          targetP += 0.015;
        }
        targetP = Math.min(targetP, 95);
      } else {
        targetP = 100;
      }

      progress += (targetP - progress) * 0.08;

      const clamped = Math.min(progress, 100);
      if (bar) bar.style.width = clamped + '%';
      if (pct) pct.textContent = Math.round(clamped) + '%';

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
      <div
        style={{
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
        }}
      >
        <div
          aria-label="SUBFROST"
          style={{
            width: 200,
            marginBottom: 18,
            color: '#FFFFFF',
            fontFamily: "Satoshi, 'Satoshi', Arial, Helvetica, sans-serif",
            fontSize: 30,
            fontWeight: 700,
            letterSpacing: '0.05em',
            lineHeight: 1,
            textAlign: 'center',
          }}
        >
          SUBFROST
        </div>
        <div
          style={{
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
            fontWeight: 700,
            fontFamily: 'inherit',
            color: 'rgba(91,156,255,1)',
            letterSpacing: 3,
            textAlign: 'center',
          }}
        />
      </div>
    </div>
  );
}
