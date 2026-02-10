/**
 * Subfrost splash screen — canvas snowflake + progress bar.
 * Loaded with <script defer> so it runs after DOM is parsed.
 * Dismissed by React SplashDismisser calling window.__sfSplashReady().
 */
(function () {
  var splash = document.getElementById('sf-splash');
  if (!splash) return;
  var canvas = document.getElementById('sf-splash-canvas');
  if (!canvas) return;
  var ctx = canvas.getContext('2d');
  if (!ctx) return;

  var dpr = window.devicePixelRatio || 1;
  var W = 160, H = 160;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  ctx.scale(dpr, dpr);

  var progress = 0, targetP = 0, ready = false, gone = false;
  var t0 = performance.now();

  /* floating particles */
  var pts = [];
  for (var i = 0; i < 15; i++) {
    pts.push({
      x: Math.random() * W,
      y: Math.random() * H,
      vx: (Math.random() - 0.5) * 0.2,
      vy: (Math.random() - 0.5) * 0.2,
      s: Math.random() * 1.2 + 0.4,
      a: Math.random() * 0.3 + 0.08
    });
  }

  function draw(t) {
    ctx.clearRect(0, 0, W, H);
    var cx = W / 2, cy = H / 2;
    var pulse = 1 + Math.sin(t * 1.5) * 0.03;
    var sz = 55 * pulse;
    var rot = t * 0.08;

    /* particles */
    for (var i = 0; i < pts.length; i++) {
      var p = pts[i];
      p.x += p.vx; p.y += p.vy;
      if (p.x < 0) p.x = W; if (p.x > W) p.x = 0;
      if (p.y < 0) p.y = H; if (p.y > H) p.y = 0;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.s, 0, 6.283);
      ctx.fillStyle = 'rgba(91,156,255,' + p.a + ')'; ctx.fill();
    }

    ctx.save(); ctx.translate(cx, cy); ctx.rotate(rot);

    /* two-pass glow */
    for (var pass = 0; pass < 2; pass++) {
      if (pass === 0) {
        ctx.globalAlpha = 0.25; ctx.lineWidth = 3.5; ctx.shadowBlur = 25;
      } else {
        ctx.globalAlpha = 1; ctx.lineWidth = 1.5; ctx.shadowBlur = 8;
      }
      ctx.shadowColor = '#5b9cff'; ctx.strokeStyle = '#5b9cff'; ctx.lineCap = 'round';

      for (var i = 0; i < 6; i++) {
        ctx.save(); ctx.rotate(i * 1.0472);

        /* main arm */
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(sz, 0); ctx.stroke();

        /* branches */
        var bp = [0.35, 0.6, 0.82], bl = [0.38, 0.28, 0.16], ba = 0.6981;
        for (var j = 0; j < 3; j++) {
          var px = bp[j] * sz, ln = bl[j] * sz;
          ctx.beginPath(); ctx.moveTo(px, 0);
          ctx.lineTo(px + ln * Math.cos(ba), -ln * Math.sin(ba)); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(px, 0);
          ctx.lineTo(px + ln * Math.cos(-ba), -ln * Math.sin(-ba)); ctx.stroke();
        }

        /* tip diamond */
        if (pass === 1) {
          var d = 4;
          ctx.fillStyle = 'rgba(199,224,254,0.35)';
          ctx.beginPath();
          ctx.moveTo(sz - d, 0); ctx.lineTo(sz, -d);
          ctx.lineTo(sz + d, 0); ctx.lineTo(sz, d);
          ctx.closePath(); ctx.fill(); ctx.stroke();
        }
        ctx.restore();
      }
    }

    /* inner hex */
    ctx.globalAlpha = 0.35; ctx.lineWidth = 1; ctx.shadowBlur = 4;
    var hs = sz * 0.18;
    ctx.beginPath();
    for (var i = 0; i < 6; i++) {
      var hx = hs * Math.cos(i * 1.0472), hy = hs * Math.sin(i * 1.0472);
      if (i === 0) ctx.moveTo(hx, hy); else ctx.lineTo(hx, hy);
    }
    ctx.closePath(); ctx.stroke();

    /* center dot */
    ctx.globalAlpha = 1; ctx.shadowBlur = 12; ctx.shadowColor = '#c7e0fe';
    ctx.beginPath(); ctx.arc(0, 0, 2.5, 0, 6.283);
    ctx.fillStyle = '#c7e0fe'; ctx.fill();

    ctx.restore();
  }

  var bar = document.getElementById('sf-splash-bar');
  var pct = document.getElementById('sf-splash-pct');

  function tick() {
    if (gone) return;
    var elapsed = (performance.now() - t0) / 1000;

    /* simulated progress ramp */
    if (!ready) {
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

    if (ready && progress > 99.5) {
      splash.style.transition = 'opacity 0.5s ease';
      splash.style.opacity = '0';
      setTimeout(function () { splash.remove(); gone = true; }, 550);
      return;
    }
    requestAnimationFrame(tick);
  }
  tick();

  /* called by React SplashDismisser once SDK (WASM) is initialized */
  window.__sfSplashReady = function () {
    if (performance.now() - t0 < 1000) {
      /* fast load (cached) — skip animation */
      splash.style.transition = 'opacity 0.2s ease';
      splash.style.opacity = '0';
      setTimeout(function () { splash.remove(); gone = true; }, 250);
    } else {
      ready = true;
    }
  };

  /* safety: remove after 30s no matter what */
  setTimeout(function () { if (!gone) ready = true; }, 30000);
})();
