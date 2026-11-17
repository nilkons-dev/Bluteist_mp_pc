/*
 * Blutheist's launch intro. index.html holds the markup (#intro), src/intro.css draws it, and this script
 * plays it: the eye logo draws itself, fills, opens, looks around and blinks; then the wordmark rises
 * from beneath it letter by letter and its sparkle flares. src/intro.ts waits for `window.bytuneIntro.done`
 * (the whole show, never cut short) before it hands over to the app.
 *
 * A classic script, run as soon as the page is parsed and before the app's bundle loads, so the app starting up
 * can't delay the first frame. Not run in the miniplayer's window (?window=pip), which never shows the intro.
 */
(function () {
  "use strict";
  if (new URLSearchParams(window.location.search).get("window") === "pip") return;
  var html = document.documentElement;
  html.classList.add("intro", "intro-wait");

  var resolveDone;
  var intro = { done: new Promise(function (r) { resolveDone = r; }), finished: false, reduced: false };
  window.bytuneIntro = intro;
  var reduced = !!(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches);
  intro.reduced = reduced;

  var CUTS = [109, 326, 427, 621, 737, 936, 1090, 1198, 1339, 1455];
  var E = {
    out: function (t) { return 1 - Math.pow(1 - t, 3); },
    io: function (t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; },
    back: function (t) { var c = 2.70158; return 1 + c * Math.pow(t - 1, 3) + 1.70158 * Math.pow(t - 1, 2); },
  };
  var wait = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  function tween(a, b, ms, fn, e) {
    e = e || E.io;
    return new Promise(function (resolve) {
      var s = performance.now();
      (function f(n) {
        var t = Math.min(1, Math.max(0, (n - s) / ms));
        fn(a + (b - a) * e(t));
        if (t < 1) requestAnimationFrame(f); else resolve();
      })(s);
    });
  }

  function start() {
    var $ = function (id) { return document.getElementById(id); };
    var stack = $("intro-stack"), svg = $("intro-logo"), wm = $("intro-wm"), wrap = $("intro-wrap");
    if (!stack || !svg || !wm || !wrap) { intro.finished = true; resolveDone(); return; }
    var eye = $("ig-eye"), pupilG = $("ig-pupilG"), body = $("ig-body"), outline = $("ig-outline"), ripple = $("ig-ripple");

    // The wordmark is cut into nine slices of one image so the letters can come in one after another.
    wm.innerHTML = '<div class="halo"></div>';
    for (var k = 0; k < 9; k++) {
      var a = CUTS[k], b = CUTS[k + 1], w = b - a;
      var d = document.createElement("div");
      d.className = "l";
      d.style.left = ((a - 109) / 1346) * 100 + "%";
      d.style.width = (w / 1346) * 100 + "%";
      var i = document.createElement("i");
      i.style.backgroundSize = (1346 / w) * 100 + "% 100%";
      i.style.backgroundPosition = ((a - 109) / (1346 - w)) * 100 + "% 0";
      d.appendChild(i);
      wm.appendChild(d);
    }
    ["spk", "flare"].forEach(function (c) {
      var x = document.createElement("div");
      x.className = c;
      wm.appendChild(x);
    });
    var spk = wm.querySelector(".spk"), flare = wm.querySelector(".flare"), halo = wm.querySelector(".halo");

    var px = 0, py = 0, tx = 0, ty = 0, pd = -320, running = true;
    function setLid(v) {
      eye.setAttribute("transform", "translate(0 600) scale(1 " + Math.max(v, 0.025) + ") translate(0 -600)");
    }
    (function loop() {
      if (!running) return;
      px += (tx - px) * 0.14;
      py += (ty - py) * 0.14;
      pupilG.setAttribute("transform", "translate(" + px + " " + (py + pd) + ")");
      requestAnimationFrame(loop);
    })();

    function playWM() {
      wm.classList.add("on");
      var L = [].slice.call(wm.querySelectorAll(".l"));
      var step = 80, ez = "cubic-bezier(.22,1,.36,1)";
      halo.animate([{ opacity: 0, transform: "scale(.6)" }, { opacity: 1, transform: "scale(1)" }], { duration: 2000, easing: "ease-out", fill: "both" });
      L.forEach(function (d, k) {
        var i = d.firstChild;
        d.animate([{ transform: "translateX(" + (4 - k) * 16 + "%)" }, { transform: "translateX(0)" }], { duration: 1600, delay: k * step, easing: ez, fill: "both" });
        i.animate(
          [{ transform: "translateY(115%) rotate(9deg) scale(1.08)", filter: "blur(10px)", opacity: 0 }, { transform: "translateY(0) rotate(0) scale(1)", filter: "blur(0)", opacity: 0.45 }],
          { duration: 1250, delay: k * step, easing: ez, fill: "both" }
        );
        i.animate([{ opacity: 0.45 }, { opacity: 1 }], { duration: 800, delay: 950 + k * 70, easing: "ease-in-out", fill: "forwards" });
      });
      var t = 9 * step + 450;
      spk.animate(
        [
          { transform: "scale(0) rotate(-200deg)", opacity: 0, filter: "drop-shadow(0 0 0 #fff)" },
          { transform: "scale(1.6) rotate(15deg)", opacity: 1, filter: "drop-shadow(0 0 22px #fff)", offset: 0.55 },
          { transform: "scale(1) rotate(0)", opacity: 1, filter: "drop-shadow(0 0 8px rgba(255,255,255,.7))" },
        ],
        { duration: 1200, delay: t, easing: ez, fill: "both" }
      );
      flare.animate(
        [
          { transform: "translate(-50%,-50%) scaleX(0)", opacity: 0 },
          { transform: "translate(-50%,-50%) scaleX(1)", opacity: 1, offset: 0.35 },
          { transform: "translate(-50%,-50%) scaleX(1.15)", opacity: 0 },
        ],
        { duration: 1200, delay: t + 150, easing: "ease-out", fill: "both" }
      );
      // After the flare the sparkle keeps pulsing until the hand-over (finish() eases it to rest).
      intro.pulse = spk.animate(
        [{ transform: "scale(1) rotate(0)" }, { transform: "scale(1.18) rotate(20deg)" }, { transform: "scale(1) rotate(0)" }],
        { duration: 2800, delay: t + 1400, iterations: Infinity, easing: "ease-in-out" }
      );
    }

    // The final picture, with no motion at all (reduced motion).
    function showFinal() {
      body.setAttribute("opacity", 1);
      outline.setAttribute("opacity", 0);
      eye.setAttribute("opacity", 1);
      setLid(1);
      pd = 0;
      wm.classList.add("on");
    }

    // Eases the pulsing sparkle back to rest so the logo lands the way the app's own wordmark is drawn.
    intro.finish = function () {
      running = false;
      if (intro.pulse) {
        var el = spk, from = getComputedStyle(el).transform;
        intro.pulse.cancel();
        intro.pulse = null;
        if (from && from !== "none") el.animate([{ transform: from }, { transform: "none" }], { duration: 260, easing: "ease-out" });
      }
    };

    async function play() {
      try {
        if (reduced) { showFinal(); return; }
        stack.style.transform = "translateY(" + wrap.offsetHeight / 2 + "px)";
        body.setAttribute("opacity", 0);
        outline.setAttribute("opacity", 1);
        outline.setAttribute("stroke-dashoffset", 1);
        eye.setAttribute("opacity", 0);
        setLid(0);
        svg.style.transform = "scale(.9)";
        await wait(350);
        tween(0.9, 1, 2600, function (v) { svg.style.transform = "scale(" + v + ")"; }, E.out);
        await tween(1, 0, 1500, function (v) { outline.setAttribute("stroke-dashoffset", v); });
        await tween(0, 1, 650, function (v) { body.setAttribute("opacity", v); outline.setAttribute("opacity", 1 - v); }, E.out);
        eye.setAttribute("opacity", 1);
        await tween(0, 1, 850, setLid, E.back);
        tween(-320, 0, 950, function (v) { pd = v; }, E.back);
        await wait(250);
        tween(0, 1, 1300, function (v) { ripple.setAttribute("r", 100 + v * 520); ripple.setAttribute("opacity", 0.55 * (1 - v)); }, E.out);
        // the wordmark rises from beneath the logo
        stack.animate([{ transform: "translateY(" + wrap.offsetHeight / 2 + "px)" }, { transform: "translateY(0)" }], { duration: 1800, easing: "cubic-bezier(.22,1,.36,1)", fill: "both" });
        svg.animate(
          [{ filter: "drop-shadow(0 0 0 rgba(255,255,255,0))" }, { filter: "drop-shadow(0 0 28px rgba(255,255,255,.55))", offset: 0.4 }, { filter: "drop-shadow(0 0 0 rgba(255,255,255,0))" }],
          { duration: 2200, easing: "ease-in-out" }
        );
        setTimeout(playWM, 500);
        await wait(450); tx = -70; ty = -14;
        await wait(520); tx = 70; ty = 10;
        await wait(520); tx = 0; ty = 0;
        await wait(300);
        await tween(1, 0, 95, setLid, E.out);
        await tween(0, 1, 150, setLid, E.out);
        // let the sparkle's flare play out in full, then a beat of stillness
        await wait(1100);
      } finally {
        intro.finished = true;
      }
    }
    play().catch(function () {}).then(function () { intro.finished = true; resolveDone(); });
  }

  // The page is parsed (the markup is there) and the app's scripts haven't run yet.
  if (document.readyState === "loading") {
    document.addEventListener("readystatechange", function h() {
      if (document.readyState !== "loading") {
        document.removeEventListener("readystatechange", h);
        start();
      }
    });
  } else start();
})();
