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

  /* ===== Launch sound: Blutheist · Minimal Cinematic Sound, Spatial 8D (HRTF binaural, Web Audio) =====
     Played in step with the show below (begin, eye, pupil, boom, word). Synthesised here, no audio files. Headphones
     give the 8D effect. If the window may not make sound yet, or the sound can't start, the show simply plays silent. */
  const SFX=(()=>{
    const AC=window.AudioContext||window.webkitAudioContext;
    const TAU=Math.PI*2;
    let ctx,master,bus,rv,nbuf,muted=false;
    const LEVEL=.85;
    // az 0 = front, +az = to the right; el = elevation; r = distance from head
    const sph=(az,el,r)=>[r*Math.cos(el)*Math.sin(az),r*Math.sin(el),-r*Math.cos(el)*Math.cos(az)];
    function makeIR(sec){const r=ctx.sampleRate,n=r*sec|0,b=ctx.createBuffer(2,n,r);
      for(let c=0;c<2;c++){const d=b.getChannelData(c);let lp=0;
        for(let i=0;i<n;i++){const x=i/n;lp+=((Math.random()*2-1)-lp)*(.07*(1-x)+.02);d[i]=lp*Math.pow(1-x,3)*5}}
      return b}
    function ensure(){
      if(!AC)return false;
      if(!ctx){
        ctx=new AC();
        const L=ctx.listener;
        if(L.positionX){L.positionX.value=0;L.positionY.value=0;L.positionZ.value=0;
          L.forwardX.value=0;L.forwardY.value=0;L.forwardZ.value=-1;L.upX.value=0;L.upY.value=1;L.upZ.value=0}
        else if(L.setOrientation){L.setPosition(0,0,0);L.setOrientation(0,0,-1,0,1,0)}
        const comp=ctx.createDynamicsCompressor();comp.threshold.value=-20;comp.knee.value=24;comp.ratio.value=3;comp.attack.value=.02;comp.release.value=.4;
        const soft=ctx.createBiquadFilter();soft.type='lowpass';soft.frequency.value=7000;soft.Q.value=.5;
        master=ctx.createGain();master.gain.value=muted?0:LEVEL;
        master.connect(soft);soft.connect(comp);comp.connect(ctx.destination);
        nbuf=ctx.createBuffer(1,ctx.sampleRate*3,ctx.sampleRate);
        const d=nbuf.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=Math.random()*2-1;
      }
      if(ctx.state==='suspended')ctx.resume();
      return true}
    function newBus(){
      bus=ctx.createGain();bus.gain.value=1;bus.connect(master);
      rv=ctx.createConvolver();rv.buffer=makeIR(4.2);
      const w=ctx.createGain();w.gain.value=.8;rv.connect(w);w.connect(bus)}
    function stop(){
      if(!bus)return;const b=bus,t=ctx.currentTime;
      b.gain.cancelScheduledValues(t);b.gain.setValueAtTime(b.gain.value,t);b.gain.linearRampToValueAtTime(0,t+.35);
      setTimeout(()=>{try{b.disconnect()}catch(e){}},700);bus=null}
    const ok=()=>ctx&&bus;
    const now=()=>ctx.currentTime;
    function pan3(){const p=ctx.createPanner();p.panningModel='HRTF';p.distanceModel='inverse';
      p.refDistance=1;p.maxDistance=60;p.rolloffFactor=1;p.coneInnerAngle=360;p.coneOuterAngle=360;return p}
    // centred (mono) routing — used for sub-bass so it stays solid in the middle
    function route(n,wet){
      n.connect(bus);
      if(wet){const s=ctx.createGain();s.gain.value=wet;n.connect(s);s.connect(rv)}}
    // spatialised routing: the source moves along fn(u), u = 0..1 over dur seconds (sample-accurate automation)
    function spat(n,t,dur,fn,wet,strong){
      const p=pan3(),N=Math.max(8,Math.ceil(dur*40));
      const X=new Float32Array(N),Y=new Float32Array(N),Z=new Float32Array(N);
      for(let i=0;i<N;i++){const v=fn(i/(N-1));X[i]=v[0];Y[i]=v[1];Z[i]=v[2]}
      if(p.positionX){
        p.positionX.value=X[0];p.positionY.value=Y[0];p.positionZ.value=Z[0];
        p.positionX.setValueCurveAtTime(X,t,dur);p.positionY.setValueCurveAtTime(Y,t,dur);p.positionZ.setValueCurveAtTime(Z,t,dur);
      }else p.setPosition(X[0],Y[0],Z[0]);
      n.connect(p);let out=p;
      // "strong" mode — makes direction unmistakable on headphones: HRTF keeps depth/elevation, a true stereo pan
      // (sin of the angle) pushes the sound hard to the correct ear, and a low-pass darkens it as it passes behind you
      if(strong){
        const sp=ctx.createStereoPanner(),lp=filt('lowpass',16000,.5),PA=new Float32Array(N),FA=new Float32Array(N);
        for(let i=0;i<N;i++){const r=Math.hypot(X[i],Y[i],Z[i])||1;PA[i]=Math.max(-1,Math.min(1,X[i]/r));FA[i]=16000-13500*Math.max(0,Z[i]/r)}
        sp.pan.value=PA[0];lp.frequency.value=FA[0];
        sp.pan.setValueCurveAtTime(PA,t,dur);lp.frequency.setValueCurveAtTime(FA,t,dur);
        p.connect(lp);lp.connect(sp);out=sp}
      out.connect(bus);
      if(wet){const s=ctx.createGain();s.gain.value=wet;out.connect(s);s.connect(rv)}}
    function still(n,az,el,r,wet,strong){
      const p=pan3(),v=sph(az,el,r);
      if(p.positionX){p.positionX.value=v[0];p.positionY.value=v[1];p.positionZ.value=v[2]}else p.setPosition(v[0],v[1],v[2]);
      n.connect(p);let out=p;
      if(strong){const sp=ctx.createStereoPanner();sp.pan.value=Math.sin(az)*Math.cos(el);p.connect(sp);out=sp}
      out.connect(bus);
      if(wet){const s=ctx.createGain();s.gain.value=wet;out.connect(s);s.connect(rv)}}
    function env(g,t,a,pk,d){
      g.gain.setValueAtTime(.0001,t);
      g.gain.exponentialRampToValueAtTime(pk,t+a);
      g.gain.exponentialRampToValueAtTime(.0001,t+a+d)}
    // sustained envelope: quick attack, FLAT hold (so every position on the path is equally loud), then release
    function sus(g,t,a,pk,hold,rel){
      g.gain.setValueAtTime(.0001,t);
      g.gain.exponentialRampToValueAtTime(pk,t+a);
      g.gain.setValueAtTime(pk,t+a+hold);
      g.gain.exponentialRampToValueAtTime(.0001,t+a+hold+rel)}
    function osc(type,f,t,dur,f2){
      const o=ctx.createOscillator();o.type=type;o.frequency.setValueAtTime(f,t);
      if(f2)o.frequency.exponentialRampToValueAtTime(f2,t+dur);
      o.start(t);o.stop(t+dur+.1);return o}
    function nz(t,dur){
      const s=ctx.createBufferSource();s.buffer=nbuf;s.loop=true;s.start(t,Math.random()*2);s.stop(t+dur+.1);return s}
    function filt(type,f,q){const x=ctx.createBiquadFilter();x.type=type;x.frequency.value=f;if(q!=null)x.Q.value=q;return x}

    /* 0.0s — centred sub drone; two upper voices counter-orbit the head; a breath spirals inward */
    function begin(){
      if(!ensure())return;stop();newBus();
      const t=now()+.03;
      {const g=ctx.createGain(),f=filt('lowpass',200,.4);
        g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(.2,t+3.6);g.gain.exponentialRampToValueAtTime(.0001,t+10);
        [[55,.9],[55.25,.6]].forEach(([fr,l])=>{const o=osc('sine',fr,t,10.2),x=ctx.createGain();x.gain.value=l;o.connect(x);x.connect(f)});
        f.connect(g);route(g,.1)}
      [[82.41,1],[110,-1]].forEach(([fr,dir],i)=>{
        const o=osc('sine',fr,t,10.2),g=ctx.createGain();
        g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(.1,t+3.6);g.gain.exponentialRampToValueAtTime(.0001,t+10);
        o.connect(g);
        spat(g,t,10.2,u=>sph(i*Math.PI+dir*TAU*1.15*u,.22*Math.sin(TAU*1.5*u+i),2.4),.3)});
      // outline trace (1.5s, in step with the line being drawn): a soft glowing point starts at the centre,
      // goes to the RIGHT ear, around the back to the LEFT ear, and comes home to the centre
      {const t0=t+.37,D=1.5,path=u=>sph(TAU*u,.04,1.6+.3*Math.sin(Math.PI*u));
        const s=nz(t0,D),b=filt('bandpass',700,1.2),ng=ctx.createGain();
        b.frequency.setValueAtTime(500,t0);b.frequency.exponentialRampToValueAtTime(1400,t0+D);
        sus(ng,t0,.08,.06,1.1,.32);
        s.connect(b);b.connect(ng);spat(ng,t0,D,path,.15,true);
        // the pitched point (a pure tone is far easier to localise than noise)
        const o=osc('sine',329.63,t0,D,659.25),g=ctx.createGain();
        sus(g,t0,.08,.085,1.1,.32);
        o.connect(g);spat(g,t0,D,path,.15,true);
        // faint comet tail following the point
        const o2=osc('sine',164.81,t0+.12,D,329.63),g2=ctx.createGain();
        sus(g2,t0+.12,.1,.03,1.0,.4);
        o2.connect(g2);spat(g2,t0+.12,D,path,.2,true)}
      // swell into the eye while the body fills in: centred, gently rising
      {const o=osc('sine',110,t+1.8,.9,164.81),g=ctx.createGain();
        g.gain.setValueAtTime(.0001,t+1.8);g.gain.exponentialRampToValueAtTime(.05,t+2.45);g.gain.exponentialRampToValueAtTime(.0001,t+2.7);
        o.connect(g);route(g,.35)}
    }
    /* 2.5s — eye opens: soft pulse, centred sub + a gentle front-facing body */
    function eye(){
      if(!ok())return;const t=now()+.01;
      {const o=osc('sine',98,t,1,65),g=ctx.createGain();env(g,t,.06,.2,1);o.connect(g);route(g,.2)}
      {const o=osc('sine',196,t,1,130),g=ctx.createGain();env(g,t,.06,.03,1);o.connect(g);still(g,0,.05,1.4,.4)}
    }
    /* 3.35s — pupil appears: one round, warm tone dead-centre */
    function pupil(){
      if(!ok())return;const t=now()+.01;
      [[164.81,.11,1.3],[329.63,.045,.9],[82.41,.07,1.4]].forEach(([fr,v,d])=>{
        const o=osc('sine',fr,t,d),g=ctx.createGain();env(g,t,.02,v,d-.02);o.connect(g);route(g,.35)})}
    /* 3.6s — ripple: centred sub hit, then the energy expands outward in a spiral around the listener */
    function boom(){
      if(!ok())return;const t=now()+.01;
      {const o=ctx.createOscillator(),g=ctx.createGain();o.type='sine';
        o.frequency.setValueAtTime(92,t);o.frequency.exponentialRampToValueAtTime(45,t+.7);o.frequency.exponentialRampToValueAtTime(38,t+3.4);
        g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(.62,t+.03);g.gain.exponentialRampToValueAtTime(.0001,t+3.4);
        o.start(t);o.stop(t+3.5);o.connect(g);route(g,.15)}
      // body of the impact: soft low noise rushing outward, 1.3 revolutions
      {const s=nz(t,1.8),l=filt('lowpass',420,.3),g=ctx.createGain();
        l.frequency.setValueAtTime(520,t);l.frequency.exponentialRampToValueAtTime(130,t+1.6);
        env(g,t,.03,.2,1.7);s.connect(l);l.connect(g);
        spat(g,t,1.8,u=>sph(TAU*1.3*u,.05+.15*u,.9+5.5*u),.6)}
      // ripple glide: a pure tone falling as it travels outward the other way
      {const o=osc('sine',587.33,t+.05,1.6,196),g=ctx.createGain();env(g,t+.05,.15,.03,1.4);o.connect(g);
        spat(g,t+.05,1.6,u=>sph(2.2-TAU*1.1*u,.1+.1*u,1+4.5*u),.6)}
      // pad A2 · E3 · A3 — six pure sines, each slowly orbiting from a different phase: an immersive halo
      let k=0;
      [[110,.07],[164.81,.045],[220,.03]].forEach(([fr,v])=>[.9985,1.0015].forEach(dt=>{
        const o=osc('sine',fr*dt,t,7),g=ctx.createGain(),ph=k*TAU/6,dir=k%2?-1:1;k++;
        env(g,t,1.3,v,5.4);o.connect(g);
        spat(g,t,7,u=>sph(ph+dir*TAU*.65*u,.12*Math.sin(TAU*u+ph),2.8),.55)}));
    }
    /* 4.1s — wordmark: 9 tones sweep a full circle around the head, then one pure bell rises above-right */
    function word(){
      if(!ok())return;const t=now()+.01;
      // track: a soft glowing sweep travels LEFT → RIGHT across the front, in step with the letters rising
      {const D=1,T=D+.25,s=nz(t,T),b=filt('bandpass',900,1),g=ctx.createGain();
        b.frequency.setValueAtTime(600,t);b.frequency.exponentialRampToValueAtTime(2200,t+D);
        sus(g,t,.04,.045,.85,.36);
        s.connect(b);b.connect(g);
        const arc=u=>{const v=Math.min(1,u*T/D),e=v*v*(3-2*v);return sph(-1.5+3*e,.06,1.9)};
        spat(g,t,T,arc,.2,true);
        // pitched point riding the same path, so the left → right motion is easy to follow
        const o=osc('sine',440,t,T,880),pg=ctx.createGain();
        sus(pg,t,.04,.06,.85,.36);
        o.connect(pg);spat(pg,t,T,arc,.2,true)}
      // nine soft notes, one per letter, placed left → right along the same arc
      const notes=[440,523.25,587.33,659.25,783.99,880,1046.5,1174.66,1318.51];
      notes.forEach((fr,k)=>{
        const tt=t+k*.08,o=osc('sine',fr,tt,1.4),g=ctx.createGain();
        env(g,tt,.012,.02+k*.0008,1.3);o.connect(g);
        still(g,-1.5+3*k/8,.06,1.9,.5,true)});
      const ts=t+1.17;
      [[1318.51,.03],[1760,.018]].forEach(([fr,v],i)=>{
        const o=osc('sine',fr,ts,4),g=ctx.createGain();env(g,ts,.02,v,3.8);o.connect(g);
        spat(g,ts,4,u=>sph(.6+(i?-1:1)*1.4*u,.6-.3*u,2.4+2*u),.9)});
    }
    function glance(){}
    function blink(){}
    function setMuted(m){muted=m;if(master)master.gain.setTargetAtTime(m?0:LEVEL,ctx.currentTime,.05)}
    // Done with it: fade what is left and give the audio device back.
  function release(){stop();setTimeout(()=>{try{ctx&&ctx.close()}catch(e){}ctx=null;bus=null},1200)}
  return{begin,eye,pupil,boom,word,glance,blink,stop,release,setMuted,get muted(){return muted},unlock:ensure};
  })();

  /* The same sound, already rendered (public/intro-sound.js holds it as a small ogg). Playing one ready-made buffer costs
     the page nothing, where building the whole spatial graph live (dozens of HRTF panners and a long reverb) made the
     eye and the wordmark stutter on slower machines. If it isn't there or can't be decoded, SFX above plays it live. */
  const PRE=(()=>{
    const AC=window.AudioContext||window.webkitAudioContext;
    let ctx=null,buf=null,node=null;
    function bytes(){
      const uri=window.__bluIntroSound;if(typeof uri!=='string')return null;
      const b64=uri.slice(uri.indexOf(',')+1),bin=atob(b64),u=new Uint8Array(bin.length);
      for(let i=0;i<bin.length;i++)u[i]=bin.charCodeAt(i);
      return u.buffer}
    function load(){
      try{
        if(!AC)return Promise.resolve(false);
        const ab=bytes();if(!ab)return Promise.resolve(false);
        ctx=new AC({latencyHint:'playback'});
        return new Promise(res=>{
          const ok=b=>{buf=b;res(true)},no=()=>res(false);
          const r=ctx.decodeAudioData(ab,ok,no);if(r&&r.catch)r.catch(no)})
      }catch(e){return Promise.resolve(false)}}
    function play(){
      if(!ctx||!buf)return;
      if(ctx.state==='suspended')ctx.resume();
      node=ctx.createBufferSource();node.buffer=buf;node.connect(ctx.destination);node.start(ctx.currentTime+.03)}
    function release(){
      try{node&&node.stop()}catch(e){}
      try{ctx&&ctx.close()}catch(e){}
      ctx=null;buf=null;node=null}
    return{load,play,release}
  })();

  // The sound is on unless it was turned off (localStorage "blutheist.introSound" = "off") or motion is reduced.
  var soundOn = !reduced && (function () { try { return localStorage.getItem("blutheist.introSound") !== "off"; } catch (e) { return true; } })();
  intro.sound = soundOn;

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

    // The audio device is opened now, so it is running by the time the first sound is due.
    // The ready-made sound is decoded first; only when that fails is the sound built live.
    var usePre = false;
    var preReady = soundOn ? PRE.load() : Promise.resolve(false);
    var sfx = function (name) {
      if (!soundOn) return;
      try {
        if (usePre) { if (name === "begin") PRE.play(); }
        else SFX[name]();
      } catch (e) { soundOn = false; }
    };
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
        if (soundOn) {
          // decoding takes a few dozen ms; nothing has moved yet, so waiting for it costs no smoothness
          usePre = await Promise.race([preReady, wait(600).then(function () { return false; })]);
          if (!usePre) { PRE.release(); try { SFX.unlock(); } catch (e) { soundOn = false; } }
        }
        sfx("begin");
        await wait(350);
        tween(0.9, 1, 2600, function (v) { svg.style.transform = "scale(" + v + ")"; }, E.out);
        await tween(1, 0, 1500, function (v) { outline.setAttribute("stroke-dashoffset", v); });
        await tween(0, 1, 650, function (v) { body.setAttribute("opacity", v); outline.setAttribute("opacity", 1 - v); }, E.out);
        eye.setAttribute("opacity", 1);
        sfx("eye");
        await tween(0, 1, 850, setLid, E.back);
        sfx("pupil");
        tween(-320, 0, 950, function (v) { pd = v; }, E.back);
        await wait(250);
        sfx("boom");
        tween(0, 1, 1300, function (v) { ripple.setAttribute("r", 100 + v * 520); ripple.setAttribute("opacity", 0.55 * (1 - v)); }, E.out);
        // the wordmark rises from beneath the logo
        stack.animate([{ transform: "translateY(" + wrap.offsetHeight / 2 + "px)" }, { transform: "translateY(0)" }], { duration: 1800, easing: "cubic-bezier(.22,1,.36,1)", fill: "both" });
        svg.animate(
          [{ filter: "drop-shadow(0 0 0 rgba(255,255,255,0))" }, { filter: "drop-shadow(0 0 28px rgba(255,255,255,.55))", offset: 0.4 }, { filter: "drop-shadow(0 0 0 rgba(255,255,255,0))" }],
          { duration: 2200, easing: "ease-in-out" }
        );
        setTimeout(function () { playWM(); sfx("word"); }, 500);
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
        // The last notes ring out a few seconds, then the audio device is let go.
        if (soundOn) setTimeout(function () { try { if (usePre) PRE.release(); else SFX.release(); } catch (e) {} }, usePre ? 8000 : 5000);
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
