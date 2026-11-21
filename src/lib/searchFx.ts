// @ts-nocheck
/**
 * The search bar's living parts, ported from the supplied "String v16" design: a plucked string along the
 * bottom edge of the field, and a little pool inside it with fish, a rare hunter and crabs.
 *
 * It is a straight port of that file's canvas code. What changed for the app:
 *  - it works on the elements React renders (passed in) instead of looking them up by id;
 *  - every listener, observer and loop is released by the returned dispose function;
 *  - both loops sleep when the window is hidden, and the pool loop sleeps while the bar is off screen;
 *  - "Reduce animation" in Settings (the `reduce-motion` class on <html>) counts like the OS setting.
 * The results dropdown is the app's own (TopBar), so none of the demo list code came across.
 */
export interface SearchFxRefs {
  field: HTMLElement;
  /** the string, drawn over the field */
  canvas: HTMLCanvasElement;
  /** the water, drawn behind the text */
  aqua: HTMLCanvasElement;
  /** thin strip under the bar that plucks the string when the pointer crosses it */
  zone: HTMLElement;
  input: HTMLInputElement;
}

export function mountSearchFx(refs: SearchFxRefs): () => void {
  const search = refs.field.parentElement, field = refs.field, canvas = refs.canvas, aq = refs.aqua, zone = refs.zone, q = refs.input;
  const ctx = canvas.getContext("2d");
  const actx = aq.getContext("2d");
  const root = document.documentElement;
  const mq = matchMedia("(prefers-reduced-motion: reduce)");
  let reduce = mq.matches || root.classList.contains("reduce-motion");
  const mo = new MutationObserver(() => { reduce = mq.matches || root.classList.contains("reduce-motion"); });
  mo.observe(root, { attributes: true, attributeFilter: ["class"] });
  let dead = false;
  const offs = [];
  const on = (t, ev, fn, o) => { t.addEventListener(ev, fn, o); offs.push(() => t.removeEventListener(ev, fn, o)); };
const N=460, SCALE=N/180;
const Y=new Float32Array(N), V=new Float32Array(N);
const WAVE=2.08*SCALE;      // wave speed in points per frame (≈ same px speed as before)
const DAMP=.064, PULL=.007; // per-frame damping / restoring force
const R=18;
let W=0,H=0,base=0,focusAmt=0,focusTarget=0,running=false,dpr=1,last=0;

function resize(){
  dpr=Math.min(window.devicePixelRatio||1,2);
  const r=canvas.getBoundingClientRect();W=r.width;H=r.height;base=H-10-.5;
  canvas.width=Math.round(W*dpr);canvas.height=Math.round(H*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);kick();
}
const ro1=new ResizeObserver(resize);ro1.observe(canvas);

function pluck(x,amp,spread=5){
  if(reduce)return;
  const c=Math.max(0,Math.min(N-1,(x-R)/Math.max(1,W-2*R)*(N-1))), s=spread*SCALE;
  for(let i=0;i<N;i++){const d=i-c;V[i]+=amp*Math.exp(-(d*d)/(2*s*s))}
  kick();
}

function step(dtFrames){
  const sub=Math.max(1,Math.ceil(dtFrames*8)), dt=dtFrames/sub, k=WAVE*WAVE;
  for(let s=0;s<sub;s++){
    for(let i=1;i<N-1;i++){
      V[i]+=(k*(Y[i-1]+Y[i+1]-2*Y[i])-DAMP*V[i]-PULL*Y[i])*dt;
    }
    for(let i=1;i<N-1;i++)Y[i]+=V[i]*dt;
  }
}
const soft=y=>y<0?-30*Math.tanh(-y/30):7*Math.tanh(y/7);

function draw(){
  ctx.clearRect(0,0,W,H);
  const f=focusAmt, sx=(W-2*R)/(N-1), L=.5, Rt=W-.5, T=.5, B=base, r=R-.5;
  ctx.strokeStyle=`rgba(255,255,255,${.58+.2*f})`;ctx.lineWidth=1.4+.2*f;   // same soft white as the home ring
  ctx.lineJoin="round";ctx.lineCap="round";
  ctx.shadowColor="rgba(255,255,255,.35)";ctx.shadowBlur=7*f;

  // static outline: all four rounded corners, open along the bottom where the string lives
  const outline=new Path2D();
  outline.moveTo(W-R,B);
  outline.arcTo(Rt,B,Rt,B-R,r);
  outline.lineTo(Rt,T+R);
  outline.arcTo(Rt,T,W-R,T,r);
  outline.lineTo(R,T);
  outline.arcTo(L,T,L,T+R,r);
  outline.lineTo(L,B-R);
  outline.arcTo(L,B,R,B,r);
  ctx.stroke(outline);

  // the live string between the two bottom corners
  const path=new Path2D();
  path.moveTo(R,base+soft(Y[0]));
  for(let i=1;i<N-1;i++){
    const x0=R+i*sx,y0=base+soft(Y[i]),x1=R+(i+1)*sx,y1=base+soft(Y[i+1]);
    path.quadraticCurveTo(x0,y0,(x0+x1)/2,(y0+y1)/2);
  }
  path.lineTo(W-R,base+soft(Y[N-1]));
  ctx.stroke(path);ctx.shadowBlur=0;

}
function energy(){let e=0;for(let i=0;i<N;i+=2)e+=Math.abs(V[i])+Math.abs(Y[i]);return e/SCALE}

function loop(now){
  if(dead){running=false;return}
  const dtFrames=last?Math.min((now-last)/16.667,3):1; last=now;
  step(dtFrames);
  focusAmt+=(focusTarget-focusAmt)*(1-Math.exp(-dtFrames*.11));
  if(Math.abs(focusTarget-focusAmt)<.002)focusAmt=focusTarget;
  draw();
  if(energy()>.08||focusAmt!==focusTarget)requestAnimationFrame(loop);
  else{Y.fill(0);V.fill(0);draw();running=false;last=0}
}
function kick(){if(!dead&&!running){running=true;last=0;requestAnimationFrame(loop)}}

/* ---- interactions ---- */
const localX=e=>e.clientX-canvas.getBoundingClientRect().left;
on(field,"mousedown",e=>{
  field.dataset.clicked=1;setTimeout(()=>delete field.dataset.clicked,300);
  if(!e.target.closest(".tb"))pluck(localX(e),-5.2,7);
});
on(field,"focusin",e=>{
  focusTarget=1;
  if(!e.relatedTarget&&!field.dataset.clicked)pluck(W/2,-3.4,10);
  kick();
});
on(field,"focusout",()=>{focusTarget=0;kick()});

let lastX=null,lastT=0;
on(zone,"mousemove",e=>{
  const x=localX(e),t=performance.now();
  if(lastX!==null&&t-lastT>24){
    const sp=Math.min(Math.abs(x-lastX),40)/40;
    if(sp>.05)pluck(x,-.9*sp-.25,4);
    lastT=t;
  }
  lastX=x;
});
on(zone,"mouseleave",()=>{lastX=null});
on(zone,"mousedown",e=>{e.preventDefault();q.focus();pluck(localX(e),-5.2,7)});

const measure=document.createElement("canvas").getContext("2d");
function caretX(){
  const cs=getComputedStyle(q);measure.font=`${cs.fontSize} ${cs.fontFamily}`;
  const w=measure.measureText(q.value.slice(0,q.selectionStart||0)).width;
  return q.getBoundingClientRect().left-canvas.getBoundingClientRect().left+w+2;
}
on(q,"input",e=>{
  const del=e.inputType&&e.inputType.startsWith("delete");
  pluck(Math.max(8,Math.min(W-8,caretX())),del?-1.1:-2.1-Math.random()*1.1,3.5);
});
/* =====================================================================
   AQUA v16 — the bar is a little pool.
   • 5 small fish swim around all the time
   • ONE long hunter visits only now and then. It swims in and tries to catch a small fish.
       first try caught it  → it swims calmly for a few seconds, then leaves
       first try missed     → it tries ONE more time, then leaves whatever happens
     afterwards it stays away for roughly 25–40 s (never more than one long fish in the bar)
   • 3 crabs (two normal, one small) walk along the bottom string. When frightened they run to the side
     and simply sink down below the border line (no burrow, no hole), peek out while the pointer is over
     the bar, and climb back up when it leaves
   • turning is a real yaw turn in pseudo-3D: the flank foreshortens, the head comes towards the viewer
     (bigger, with two eyes), the tail lags in a curve, the fish slows through the turn and swims off
     the other way
   • going up or down the fish stays almost level: gentle nose angle, the body arches, the path is a
     long diagonal glide — it is never a stick tilted at a steep angle
   • pointer enters the bar or you tap → fish dart out, but 2–3 shy fish bolt into the
     corners and hover there watching the pointer
   • pointer leaves → everybody is back and swimming within ~4 s
   • the water is clipped to the exact inside of the bar (outline + live string),
     so its edge never shows — the string IS the water's edge
   ===================================================================== */

let AW=0,AH=0;
function aqResize(){
  const d=Math.min(window.devicePixelRatio||1,2), r=aq.getBoundingClientRect();
  AW=r.width;AH=r.height;aq.width=Math.round(AW*d);aq.height=Math.round(AH*d);actx.setTransform(d,0,0,d,0,0);
}
const ro2=new ResizeObserver(aqResize);ro2.observe(aq);

const SURF=10, YMIN=21, YMAX=45, LEFT_PAD=52, RIGHT_PAD=44, CORNER_X=17, CORNER_Y=40;
const floorY=()=>AH-10.5;                         // the aqua canvas is 10px taller than the bar, exactly like the string canvas
const rnd=(a,b)=>a+Math.random()*(b-a);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const ripples=[], bubbles=[];
const ptr={x:0,y:0};
let kb=false;                                   // keyboard (Ctrl K) focus keeps them away too
function ripple(x,amp){ if(reduce)return; ripples.push({x,amp,t:performance.now()}); if(ripples.length>12)ripples.shift() }
function bubble(x,y){ if(!reduce) bubbles.push({x,y,r:rnd(.8,1.8),vy:rnd(.25,.55),wob:rnd(0,6),a:.55}) }
const hdx=f=>Math.cos(f.yaw)*Math.cos(f.p), hdy=f=>Math.sin(f.p);     // unit heading as seen on screen

/* y of the bottom string at a given x (so crabs can stand on it) */
function groundY(x){
  const sx=(AW-2*R)/(N-1); let u=sx>0?(x-R)/sx:0; u=clamp(u,0,N-1);
  const i=Math.floor(u),fr=u-i,y0=Y[i],y1=Y[Math.min(N-1,i+1)];
  return floorY()+soft(y0+(y1-y0)*fr);
}

/* ---------------------------  the fish  --------------------------- */
function makeFish(i,long){
  const dir=Math.random()<.5?-1:1;
  return {
    long, L:long?rnd(30,35):rnd(10,15), aspect:long?.085:.19, wl:long?7.2:5.2, ampK:long?.55:1, tailK:long?.15:.22,
    x:rnd(90,480), y:long?rnd(26,40):rnd(YMIN,YMAX), h:dir>0?0:Math.PI, w:0, sp:0, base:long?rnd(.5,.66):rnd(.32,.6),
    yaw:dir>0?0:Math.PI, p:0, vp:0, pl:0, ysd:dir, te:0, ft:dir,   // yaw 0 = facing right, π = facing left (through 'facing the camera') · p = path pitch · vp = drawn pitch · pl = lagging pitch (body arch)
    phase:rnd(0,6), pec:rnd(0,6), pulse:rnd(0,6),
    amp:.03, ampT:.03, pr:.2, pecR:.15, pecA:.5,
    bt:0, cbend:0, csg:0, cT:0, bend:0, ix:0,
    alpha:long?.50+i*.05:.40+i*.035+rnd(0,.03),         // dimmer fish are drawn first = "deeper"; long ones are drawn last
    state:"swim", shy:false, enter:false, alarm:0, fleeDir:1, fvy:0, burst:6, tF:0, tH:0,
    settled:false, cs:-1, slot:0, cy0:CORNER_Y, tx:0, ty:0, nextPick:0, pauseUntil:0, seed:rnd(0,100),
    sz:1, gulp:0, prey:null, pred:null, huntT:0, tL:0, tE:0, catchIt:false, tries:0, fed:false,
    respawn:0, returnAt:0
  };
}
const fishes=[0,1,2,3,4].map(i=>makeFish(i,false)).concat([makeFish(0,true)]);
const hunter=fishes[5];                                  // the one and only long fish — it is away most of the time
hunter.state="gone";hunter.visitAt=performance.now()+rnd(9000,14000);hunter.leaveAt=0;hunter.lt=0;hunter.leaveDir=1;
fishes.forEach(f=>{f.sp=f.base;f.tx=f.x;f.ty=f.y});

function cstart(f,sg){ f.csg=sg||(Math.random()<.5?-1:1); f.cT=0 }

/* A fish turns by YAWING, like a real one: its flank foreshortens as it swings through "facing the camera"
   and comes out the other side. The turn rate follows a bell curve (slow – fast – slow).
   Pitch (nose up / down) is separate, small, and limited to `pm` radians so a fish never looks like a tilted stick.
   yaw 0 = facing right · yaw π = facing left · cos(yaw) is the horizontal share of its speed. */
function steer(f,dt,want,maxW,resp,pm=.4){
  const wx=Math.cos(want), wy=Math.sin(want);
  if(wx>.28)f.ysd=1; else if(wx<-.28)f.ysd=-1;           // hysteresis: a near-vertical target never makes it flip sides
  const yT=f.ysd>0?0:Math.PI, pT=clamp(Math.atan2(wy,Math.max(.5,Math.abs(wx))),-pm,pm);
  const dy=yT-f.yaw;
  const rate=maxW*(.3+.7*Math.sin(clamp(f.yaw,0,Math.PI)));
  const tw=Math.sign(dy)*Math.min(Math.abs(dy)*.12,rate);   // bell-shaped angular speed, easing out at the end
  f.w+=(tw-f.w)*(1-Math.exp(-dt*resp));                     // eased in/out → a smooth, weighty swing
  f.yaw=clamp(f.yaw+f.w*dt,0,Math.PI);
  f.p+=(pT-f.p)*(1-Math.exp(-dt*resp*.5));
  f.te=Math.abs(dy)+Math.abs(pT-f.p)*.6;
  f.h=Math.atan2(Math.sin(f.p),Math.cos(f.yaw)*Math.cos(f.p));
  f.ft=Math.cos(f.yaw)>=0?1:-1;
}
function move(f,dt){
  f.x+=(Math.cos(f.yaw)*Math.cos(f.p)*f.sp+f.ix)*dt;      // mid-turn it is moving towards the camera → no sideways travel
  f.y+=Math.sin(f.p)*f.sp*dt;
  f.ix*=Math.exp(-dt*.14);
}
function fishPick(f,now,fromCorner){
  const lo=LEFT_PAD, hi=Math.max(lo+40,AW-RIGHT_PAD);
  let dx=rnd(90,220)*(Math.random()<.5?-1:1);
  if(fromCorner)dx=Math.abs(dx)*(f.cs<0?1:-1);          // leave the corner heading into open water
  let tx=f.x+dx; if(tx<lo||tx>hi)tx=f.x-dx;
  f.tx=clamp(tx,lo,hi); f.ty=rnd(YMIN,YMAX); f.nextPick=now+rnd(2800,6500);
  if(!fromCorner&&Math.random()<.2)f.pauseUntil=now+rnd(500,1500);   // sometimes just hang in the water
}

/* normal swimming: wander between waypoints, burst-and-glide, polite to neighbours */
function swim(f,dt,now,slow){
  const paused=now<f.pauseUntil;
  if(f.enter&&f.x>LEFT_PAD-10&&f.x<AW-RIGHT_PAD+10)f.enter=false;
  let dx=f.tx-f.x, dy=f.ty-f.y; const dist=Math.hypot(dx,dy);
  if(!paused&&(dist<8||now>f.nextPick)){fishPick(f,now);dx=f.tx-f.x;dy=f.ty-f.y}
  const d2=Math.hypot(dx,dy)||1;
  let vx=dx/d2, vy=dy/d2;
  for(const o of fishes){
    if(o===f||o.state==="gone"||o.state==="swallow")continue;
    const ox=f.x-o.x, oy=f.y-o.y, od=Math.hypot(ox,oy), sep=(f.long||o.long)?24:16;
    if(od<sep&&od>0){const k=(sep-od)/sep*1.6;vx+=ox/od*k;vy+=oy/od*k}
  }
  if(f.y<YMIN+3)vy+=(YMIN+3-f.y)*.12;
  if(f.y>YMAX-3)vy-=(f.y-(YMAX-3))*.12;
  const want=Math.atan2(vy,vx), turn=f.te||0;
  steer(f,dt,want,.075,.16);
  f.pulse+=dt*(.05+f.base*.04);
  let sp=f.base*(.6+.7*Math.max(0,Math.sin(f.pulse)));         // burst & glide
  if(f.enter)sp*=2.4;                                            // coming back: swim in briskly
  sp*=1-.6*Math.min(1,turn/1.3);                                 // slow down in tight turns
  if(d2<30)sp*=.35+.65*d2/30;
  if(paused)sp=.04;
  f.sp+=(sp*slow-f.sp)*(1-Math.exp(-dt*.07));
  move(f,dt);
  const spn=Math.min(1,f.sp/.7);
  f.ampT=.022+.05*spn+(turn>.5?.01:0);
  f.pr=Math.min(.6,.1+f.sp*.6);
  f.pecR=.1+.2*(1-spn); f.pecA=.3+.5*(1-spn);
}

/* panic: fast, straight, strong tail beats, speed decays into a glide */
function fleeStep(f,dt){
  f.tF+=dt;
  let vy=f.fvy;
  if(f.y<YMIN+2)vy=Math.abs(vy)+.05;
  if(f.y>YMAX+2)vy=-Math.abs(vy)-.05;
  steer(f,dt,Math.atan2(vy,f.fleeDir),.35,.35,.55);
  const ts=3.0+(f.burst-3.0)*Math.exp(-f.tF/30);
  f.sp+=((f.tF<5?.5:ts)-f.sp)*(1-Math.exp(-dt*.45));
  move(f,dt);
  f.ampT=.11; f.pr=Math.min(.95,.35+f.sp*.12); f.pecR=.5; f.pecA=.2;
  if(Math.random()<.04*dt)bubble(f.x,f.y);
  if(f.x<-40||f.x>AW+40){f.state="gone";f.shy=false;if(f.long)f.visitAt=0}
}

/* shy fish: dash into the corner, then hover and keep an eye on the pointer */
function cornerPos(f){
  const off=f.L>20?(f.L-14)*.55:0, sl=f.slot||0;
  return {x:f.cs<0?CORNER_X+off+sl*22:AW-CORNER_X-2-off-sl*22, y:f.cy0};
}
function hideStep(f,dt,now){
  const cp=cornerPos(f), cx=cp.x, cy=cp.y;
  const hov=search.matches(":hover");
  if(!f.settled){
    f.tH+=dt;
    const dx=cx-f.x,dy=cy-f.y,d=Math.hypot(dx,dy);
    steer(f,dt,Math.atan2(dy,dx),.3,.3,.55);
    const ts=Math.min(2.9*Math.exp(-f.tH/38)+.7,d*.07+.1);
    f.sp+=(ts-f.sp)*(1-Math.exp(-dt*.3));
    move(f,dt);
    f.ampT=.03+.09*Math.min(1,f.sp/1.5); f.pr=Math.min(.8,.2+f.sp*.3); f.pecR=.3; f.pecA=.4;
    if(d<8)f.settled=true;
  }else{
    const t=now/1000;
    const gx=cx+Math.sin(t*.8+f.seed)*.9, gy=cy+Math.sin(t*.63+f.seed*1.7)*.8;
    const k=1-Math.exp(-dt*.07);
    f.x+=(gx-f.x)*k+f.ix*dt; f.y+=(gy-f.y)*k; f.ix*=Math.exp(-dt*.14);
    f.sp+=(0-f.sp)*(1-Math.exp(-dt*.15));
    let want;
    const near=hov&&Math.hypot(ptr.x-f.x,ptr.y-f.y)<85;
    if(hov){
      const sg=ptr.x>f.x?1:-1, ang=clamp(Math.atan2(ptr.y-f.y,Math.abs(ptr.x-f.x)||1),-.4,.4);
      want=sg>0?ang:Math.PI-ang;                                   // face the pointer
    }else{
      const sg=f.cs<0?1:-1;
      want=(sg>0?0:Math.PI)+sg*Math.sin(t*.4+f.seed)*.3;           // look around
    }
    steer(f,dt,want,.05,.12,.3);
    f.ampT=near?.05:.017; f.pr=near?.55:.13; f.pecR=near?.55:.2; f.pecA=near?.5:.9;
    if(Math.random()<.0012*dt)bubble(f.x+hdx(f)*f.L*.5,f.y);
  }
}

/* ---------------------------  predation  --------------------------- */
let nextHunt=0;
/* the hunter only hunts while it is "visiting": it picks the nearest small fish, stalks it and lunges.
   It gets at most TWO tries per visit; a successful catch ends the hunting at once. */
function tryHunt(now){
  if(now<nextHunt)return;
  const p=hunter;
  if(p.fed||p.tries>=2)return;                           // one meal per visit, two tries at most
  if(p.state!=="swim"||p.enter){nextHunt=now+500;return}
  nextHunt=now+rnd(900,1600);
  const prey=fishes.filter(f=>!f.long&&f.state==="swim"&&!f.enter&&f.x>LEFT_PAD&&f.x<AW-RIGHT_PAD);
  const pool=fishes.filter(f=>!f.long&&(f.state==="swim"||f.state==="evade")).length;
  if(!prey.length||pool<4)return;                        // never thin the school out too far
  prey.sort((a,b)=>Math.hypot(a.x-p.x,a.y-p.y)-Math.hypot(b.x-p.x,b.y-p.y));
  p.tries++;
  p.state="stalk";p.prey=prey[0];p.huntT=0;p.catchIt=Math.random()<(p.tries===1?.6:.5);
}
function startLeave(f){f.state="leave";f.lt=0;f.leaveDir=f.x<AW/2?-1:1;f.enter=false;f.prey=null}
function endHunt(f,now){
  f.prey=null;
  if(f.long){
    if(f.tries>=2||f.fed){startLeave(f);return}          // second miss → it leaves
    f.state="swim";fishPick(f,now);nextHunt=now+rnd(1100,2000);return;   // first miss → it circles once and tries again
  }
  f.state="swim";fishPick(f,now);
}
function abortHunts(now){
  fishes.forEach(f=>{
    if(f.state==="stalk"||f.state==="lunge"){f.prey=null;f.state="swim";fishPick(f,now)}
    else if(f.state==="evade"){f.pred=null;f.state="swim";fishPick(f,now)}
  });
}
/* unhurried swim out of the bar, to the nearest side */
function leaveStep(f,dt,now){
  f.lt+=dt;
  let vy=Math.sin(f.lt*.04+f.seed)*.08;
  if(f.y<YMIN+3)vy+=(YMIN+3-f.y)*.1;
  if(f.y>YMAX-3)vy-=(f.y-(YMAX-3))*.1;
  steer(f,dt,Math.atan2(vy,f.leaveDir),.1,.18);
  f.sp+=(1.15-f.sp)*(1-Math.exp(-dt*.04));
  move(f,dt);
  f.ampT=.05;f.pr=.38+f.sp*.12;f.pecR=.2;f.pecA=.4;
  if(f.x<-f.L-24||f.x>AW+f.L+24){f.state="gone";f.visitAt=0}
}
function stalkStep(f,dt,now){
  const q=f.prey;
  if(!q||q.state!=="swim"||f.huntT>320){endHunt(f,now);return}
  f.huntT+=dt;
  const dx=q.x-f.x,dy=q.y-f.y,d=Math.hypot(dx,dy);
  steer(f,dt,Math.atan2(dy,dx),.07,.16);
  const ts=d>90?f.base*1.2:f.base*.5;                     // approach, then creep
  f.sp+=(ts-f.sp)*(1-Math.exp(-dt*.08));
  move(f,dt);
  f.ampT=.02+.03*Math.min(1,f.sp/.7);f.pr=.14+f.sp*.3;f.pecR=.15;f.pecA=.4;
  if(d<46){                                                // strike!
    f.state="lunge";f.tL=0;cstart(f);
    q.state="evade";q.pred=f;q.tE=0;cstart(q);bubble(q.x,q.y);
  }
}
function lungeStep(f,dt,now){
  const q=f.prey;
  if(!q||q.state!=="evade"||f.x<10||f.x>AW-10){endHunt(f,now);return}
  f.tL+=dt;
  const lead=q.sp*5, tx=q.x+hdx(q)*lead, ty=q.y+hdy(q)*lead;
  steer(f,dt,Math.atan2(ty-f.y,tx-f.x),.3,.35,.5);
  f.sp+=(3.4-f.sp)*(1-Math.exp(-dt*.35));
  move(f,dt);
  f.ampT=.12;f.pr=.85;f.pecR=.4;f.pecA=.2;
  const mx=f.x+hdx(f)*f.L*.5,my=f.y+hdy(f)*f.L*.5;
  if(f.catchIt&&Math.hypot(q.x-mx,q.y-my)<q.L*.6+3){      // gulp
    q.state="swallow";q.sw=0;q.pred=f;f.gulp=1;f.prey=null;
    f.state="swim";f.sp*=.5;fishPick(f,now);f.fed=true;f.leaveAt=now+rnd(3500,5500);   // full → a few calm seconds, then it leaves
    bubble(mx,my);bubble(mx+2,my-2);ripple(f.x,.25);
  }else if(f.tL>(f.catchIt?90:26)){endHunt(f,now)}
}
function evadeStep(f,dt,now){
  const p=f.pred; f.tE+=dt;
  if(!p||(f.tE>40&&p.state!=="lunge")||f.tE>130){f.pred=null;f.state="swim";fishPick(f,now);return}
  let vx=f.x-p.x,vy=f.y-p.y;const dd=Math.hypot(vx,vy)||1;vx/=dd;vy/=dd;
  if(f.x<LEFT_PAD+10)vx+=(LEFT_PAD+10-f.x)*.06;
  if(f.x>AW-RIGHT_PAD-10)vx-=(f.x-(AW-RIGHT_PAD-10))*.06;
  if(f.y<YMIN+3)vy+=(YMIN+3-f.y)*.12;
  if(f.y>YMAX-3)vy-=(f.y-(YMAX-3))*.12;
  vy+=Math.sin(f.tE*.3+f.seed)*.5;                         // zig-zag
  steer(f,dt,Math.atan2(vy,vx),.35,.35,.5);
  f.sp+=((f.tE<4?.6:2.3)-f.sp)*(1-Math.exp(-dt*.4));
  move(f,dt);f.x=clamp(f.x,8,AW-8);
  f.ampT=.11;f.pr=Math.min(.95,.35+f.sp*.12);f.pecR=.5;f.pecA=.2;
}
function swallowStep(f,dt,now){
  const p=f.pred;f.sw+=dt;
  if(p){
    const mx=p.x+hdx(p)*p.L*.5,my=p.y+hdy(p)*p.L*.5,k=1-Math.exp(-dt*.3);
    f.x+=(mx-f.x)*k;f.y+=(my-f.y)*k;
  }
  f.sz=Math.max(0,1-f.sw/12);f.sp=0;
  if(f.sw>=12){f.state="gone";f.sz=1;f.pred=null;f.shy=false;f.respawn=now+rnd(4500,7500);f.returnAt=0}
}

/* ---------------------------  crabs  --------------------------- */
/* No burrow, no hole: a frightened crab runs to the side and simply sinks below the border line.
   The water is clipped at the string, so the part of the crab under the line is never drawn. */
const DEEP=13;                                              // how far a crab sinks below the string when it is fully hidden
function makeCrab(i,small){
  return {x:[110,300,470][i]+rnd(-20,20),y:null,tilt:0,v:0,dir:Math.random()<.5?-1:1,ph:rnd(0,6),cl:0,snap:0,look:0,
    alpha:.62,state:"walk",tx:0,rest:performance.now()+rnd(500,2500),go:0,side:-1,slot:0,seed:rnd(0,100),returnAt:0,
    sc:small?.6:rnd(.96,1.08),spd:small?1.22:1,
    dep:0,hx:40};                                           // dep = depth below the string · hx = where it runs to when frightened
}
const crabs=[makeCrab(0),makeCrab(1),makeCrab(2,true)];
crabs.forEach(c=>{c.tx=c.x});
function crabPick(c){
  let tx=rnd(34,Math.max(60,AW-34));
  for(let n=0;n<8&&!crabs.every(o=>o===c||Math.abs(o.x-tx)>30);n++)tx=rnd(34,Math.max(60,AW-34));
  c.tx=tx;
}
/* walk → flee (run to the side) → dive (sinks below the line) → hide (peeks out, ducks if the pointer comes close)
   → emerge (climbs back up when the pointer has gone) → walk */
function updateCrab(c,dt,now){
  const gy=groundY(c.x);
  c.y=c.y===null?gy:c.y+(gy-c.y)*(1-Math.exp(-dt*.5));
  const slope=groundY(c.x+4)-groundY(c.x-4), flat=1-clamp(c.dep/4,0,1);
  c.tilt+=(clamp(Math.atan2(slope,8)*.8,-.45,.45)*flat-c.tilt)*(1-Math.exp(-dt*.3));
  const hov=search.matches(":hover");
  let want=0,raise=0,depT=0;
  if(c.state==="walk"){
    if(now>=c.rest){
      const d=c.tx-c.x;
      if(Math.abs(d)<1.5){c.rest=now+rnd(1400,4200);crabPick(c)}
      else{c.dir=d>0?1:-1;want=c.dir*(.3+.1*Math.sin(c.seed+now/1500))*c.spd}
    }
  }else if(c.state==="flee"){
    raise=.6;
    if(now>=c.go){
      const d=c.hx-c.x;
      if(Math.abs(d)<1.5)c.state="dive";
      else{c.dir=d>0?1:-1;want=c.dir*Math.min(1.7,Math.abs(d)*.12+.2)*c.spd}
    }
  }else if(c.state==="dive"){
    raise=.3;depT=DEEP;
    if(c.dep>DEEP-.8)c.state="hide";
  }else if(c.state==="emerge"){
    raise=.5;depT=0;
    if(c.dep<.5){c.state="walk";c.rest=now+rnd(200,900);crabPick(c)}
  }else{                                                    // hide: eyes and claws just above the line
    const duck=hov&&Math.hypot(ptr.x-c.x,ptr.y-(c.y-3))<38;
    depT=duck?DEEP:6.2*c.sc;raise=duck?0:.85;
  }
  c.v+=(want-c.v)*(1-Math.exp(-dt*.14));
  c.x+=c.v*dt;
  c.ph+=dt*(Math.abs(c.v)*.95);
  c.cl+=(raise-c.cl)*(1-Math.exp(-dt*.12));
  c.dep+=(depT-c.dep)*(1-Math.exp(-dt*(c.state==="dive"?.055:.075)));
  const watching=c.state==="hide"&&hov;
  const near=watching&&Math.abs(ptr.x-c.x)<120;
  c.look+=((watching?clamp((ptr.x-c.x)/40,-1,1):0)-c.look)*(1-Math.exp(-dt*.15));
  c.snap=near?(Math.sin(now/120+c.seed)*.5+.5):c.snap*Math.exp(-dt*.2);
}
function releaseCrab(c,now){
  c.state="emerge";
}
function drawCrab(c){
  if(c.y===null)c.y=groundY(c.x);
  const a=c.alpha, mv=Math.min(1,Math.abs(c.v)/.3);
  actx.save();actx.translate(c.x,c.y-.5+c.dep);actx.rotate(c.tilt);actx.scale(c.sc,c.sc);
  actx.lineCap="round";actx.lineJoin="round";
  // legs (3 per side, alternating gait)
  actx.strokeStyle=`rgba(255,255,255,${a*.75})`;actx.lineWidth=.8/c.sc**.5;
  for(const sd of[-1,1])for(let i=0;i<3;i++){
    const w=c.ph*1.15+i*2.1+(sd>0?Math.PI:0);
    const sw=Math.sin(w)*1.1*mv, lf=Math.max(0,Math.cos(w))*1.1*mv;
    actx.beginPath();
    actx.moveTo(sd*(2+i*.9),-2.6+i*.25);
    actx.lineTo(sd*(4.7+i*.8)+sw*.4,-4.4-lf*.5);
    actx.lineTo(sd*(5.3+i*1.1)+sw,-.2-lf);
    actx.stroke();
  }
  // claws
  const cl=c.cl, open=.3+.55*c.snap;
  for(const sd of[-1,1]){
    const ex=sd*(6.1-.4*cl), ey=-5.1-cl*1.9, cx=sd*(6.0-.5*cl), cy=-7.7-cl*2.4;
    actx.strokeStyle=`rgba(255,255,255,${a*.8})`;actx.lineWidth=.85/c.sc**.5;
    actx.beginPath();actx.moveTo(sd*3.8,-3.9);actx.lineTo(ex,ey);actx.lineTo(cx,cy+.8);actx.stroke();
    actx.fillStyle=`rgba(255,255,255,${a*.9})`;
    const base=-Math.PI/2+sd*.25;
    for(const j of[-1,1]){
      actx.beginPath();
      actx.ellipse(cx+Math.cos(base+j*open)*.9,cy+Math.sin(base+j*open)*.9,1.45,.62,base+j*open,0,6.3);
      actx.fill();
    }
  }
  // shell
  const g=actx.createLinearGradient(0,-6.4,0,-1);
  g.addColorStop(0,`rgba(255,255,255,${a})`);g.addColorStop(1,`rgba(255,255,255,${a*.5})`);
  actx.beginPath();actx.ellipse(0,-3.5,4.7,2.8,0,0,6.3);actx.fillStyle=g;actx.fill();
  actx.strokeStyle=`rgba(255,255,255,${a*.9})`;actx.lineWidth=.45;actx.stroke();
  // eyes on stalks
  for(const sd of[-1,1]){
    actx.strokeStyle=`rgba(255,255,255,${a*.8})`;actx.lineWidth=.6;
    actx.beginPath();actx.moveTo(sd*1.4,-5.5);actx.lineTo(sd*1.55,-7.2);actx.stroke();
    actx.beginPath();actx.arc(sd*1.55,-7.5,.85,0,6.3);actx.fillStyle="rgba(255,255,255,.9)";actx.fill();
    actx.beginPath();actx.arc(sd*1.55+c.look*.35,-7.5,.42,0,6.3);actx.fillStyle="rgba(8,8,10,.95)";actx.fill();
  }
  actx.restore();
}

/* ---------------------------  scare / release  --------------------------- */
function setFace(f,sg){f.yaw=sg>0?0:Math.PI;f.p=0;f.vp=0;f.pl=0;f.ysd=sg;f.ft=sg;f.h=sg>0?0:Math.PI;f.w=0;f.te=0}

function reduceScare(){
  if(fishes.some(f=>f.state==="hide"))return;
  fishes.forEach((f,i)=>{
    if(i<3){f.state="hide";f.settled=true;f.shy=true;f.cs=i%2?1:-1;f.slot=i>>1;f.cy0=CORNER_Y-f.slot*7;
      const cp=cornerPos(f);f.x=cp.x;f.y=cp.y;setFace(f,f.cs<0?1:-1)}
    else{f.state="gone";f.shy=false}
  });
  crabs.forEach((c,i)=>{c.state="hide";c.cl=.85;c.hx=i%2?AW-40-(i>>1)*28:40+(i>>1)*28;c.x=c.hx;c.dep=6.2*c.sc});
}
function scare(cx,cy,loud=true){
  const now=performance.now();
  ripple(cx,loud?1:.55);
  if(reduce){reduceScare();return}
  if(loud)for(let i=0;i<5;i++)bubble(cx+rnd(-8,8),rnd(24,42));
  abortHunts(now);                                         // a hunt is called off the moment you show up
  if(hunter.state==="leave"){hunter.state="flee";hunter.tF=0;hunter.burst=5.2;hunter.fleeDir=hunter.leaveDir;hunter.fvy=0}

  // fish already hiding just flinch
  fishes.forEach(f=>{
    if(f.shy&&f.state==="hide"){
      const d=Math.hypot(f.x-cx,f.y-cy);
      if(loud&&d<170){cstart(f);f.ix=(f.x<cx?-1:1)*clamp(2.4-d/90,.5,2.4)}
    }
  });

  const live=fishes.filter(f=>f.state==="swim");
  live.forEach(f=>{
    f.fleeDir=Math.abs(f.x-cx)<14?(Math.random()<.5?-1:1):(f.x<cx?-1:1);
    f.shy=false;
  });

  // two or three shy fish keep to the corners (up to two per corner, always on the side they flee towards)
  const have=fishes.filter(f=>f.shy&&f.state!=="gone");
  const occ={"-1":0,"1":0};have.forEach(f=>occ[f.cs]++);
  let need=(Math.random()<.5?2:3)-have.length;
  if(need>0){
    const near=f=>(f.fleeDir<0?f.x:AW-f.x)+rnd(0,140);
    const cand=live.filter(f=>!f.long).map(f=>({f,k:near(f)})).sort((a,b)=>a.k-b.k).map(o=>o.f);
    for(const c of cand){
      if(need<=0)break;
      const s=c.fleeDir;if(occ[s]>=2)continue;
      c.shy=true;c.cs=s;c.slot=occ[s];c.cy0=CORNER_Y-c.slot*7+rnd(-2,2);occ[s]++;need--;
    }
  }

  live.forEach(f=>{
    f.state="alarm";
    f.alarm=now+Math.hypot(f.x-cx,(f.y-cy)*1.5)*(loud?.45:.6)+rnd(0,140);   // farther fish notice a moment later
    f.fvy=clamp((f.y-cy)*.012+rnd(-.08,.08),-.16,.16);
  });

  crabs.forEach(c=>{                                       // crabs run to the nearest side and sink below the border line
    if(c.state!=="walk"&&c.state!=="emerge")return;
    const side=c.x<AW/2?-1:1;
    const slot=crabs.filter(o=>o!==c&&o.state!=="walk"&&o.state!=="emerge"&&o.side===side).length;
    c.side=side;c.slot=slot;c.hx=side<0?40+slot*28:AW-40-slot*28;
    c.state="flee";c.go=now+rnd(0,220);
  });
}

let holdUntil=0;
function release(f,now){
  f.shy=false;f.sz=1;f.prey=null;f.pred=null;
  if(f.state==="hide"){                                   // brave corner fish ventures out first
    f.state="swim";f.enter=false;f.settled=false;f.pauseUntil=0;fishPick(f,now,true);return;
  }
  const side=Math.random()<.5?-1:1;                       // the rest drift back in from a side
  f.state="swim";f.enter=true;f.pauseUntil=0;f.csg=0;f.cbend=0;f.ix=0;f.slot=0;
  f.y=rnd(YMIN,YMAX);setFace(f,side<0?1:-1);f.sp=f.base*1.2;
  const off=f.L*.5+12;
  f.x=side<0?-off:AW+off;
  f.tx=side<0?rnd(110,300):AW-rnd(110,300);f.ty=rnd(YMIN,YMAX);f.nextPick=now+rnd(3000,5000);
  if(reduce){f.x=rnd(90,Math.max(100,AW-90));f.enter=false}
}
/* the long fish: swims in from a side, hunts (see tryHunt: first try, and one more if it missed), then leaves — and stays away for a good while */
function releaseHunter(f,now){
  const side=Math.random()<.5?-1:1;
  f.shy=false;f.sz=1;f.prey=null;f.pred=null;f.gulp=0;
  f.state="swim";f.enter=true;f.pauseUntil=0;f.csg=0;f.cbend=0;f.ix=0;f.slot=0;
  f.y=rnd(26,40);setFace(f,side<0?1:-1);f.sp=f.base*1.2;
  f.x=side<0?-(f.L*.5+16):AW+f.L*.5+16;
  f.tx=side<0?rnd(140,300):AW-rnd(140,300);f.ty=rnd(YMIN,YMAX);f.nextPick=now+rnd(3000,5000);
  f.leaveAt=now+rnd(14000,19000);f.visitAt=0;f.fed=false;f.tries=0;
  nextHunt=now+rnd(2800,4500);
}

function updateFish(dt,now){
  const busy=search.matches(":hover")||kb;
  if(hunter.state==="gone"&&!hunter.visitAt)hunter.visitAt=now+rnd(24000,40000);
  if(busy){
    holdUntil=now+350;
    fishes.forEach(f=>f.returnAt=0);crabs.forEach(c=>c.returnAt=0);
  }else if(now>holdUntil){
    // pointer is gone: everybody gets a staggered return time within ~2.7 s, so the whole
    // school is back and swimming in ~4 s (fish that are still fleeing get theirs when they leave)
    const sched=(o,away,go)=>{
      if(!away||now<(o.respawn||0))return;
      if(!o.returnAt)o.returnAt=now+rnd(120,2700);
      if(now>=o.returnAt){o.returnAt=0;go(o,now)}
    };
    fishes.forEach(f=>{if(!f.long)sched(f,f.state==="hide"||f.state==="gone",release)});
    crabs.forEach(c=>sched(c,c.state==="hide",releaseCrab));
    if(now>holdUntil+1500){
      if(hunter.state==="gone"&&now>=hunter.visitAt&&!reduce)releaseHunter(hunter,now);
      tryHunt(now);
    }
  }
  if(reduce)return;
  fishes.forEach(f=>{
    if(f.state==="gone")return;
    if(f.csg){                                            // C-start: curl, then a decaying counter-flick
      f.cT+=dt;const t=f.cT;
      f.cbend=t<6?f.csg*1.15*Math.min(1,t/4):f.csg*1.15*Math.exp(-(t-6)*.16)*Math.cos((t-6)*.4);
      if(t>50){f.csg=0;f.cbend=0}
    }
    switch(f.state){
      case "swim":
        if(f.long&&!f.enter&&now>f.leaveAt){startLeave(f);break}
        swim(f,dt,now,1);break;
      case "alarm":
        swim(f,dt,now,.55);
        if(now>=f.alarm){
          cstart(f);bubble(f.x,f.y);ripple(f.x,.3);
          if(f.shy){f.state="hide";f.tH=0;f.settled=false}
          else{f.state="flee";f.tF=0;f.burst=rnd(5.4,7.2)}
        }
        break;
      case "flee": fleeStep(f,dt);break;
      case "hide": hideStep(f,dt,now);break;
      case "stalk": stalkStep(f,dt,now);break;
      case "lunge": lungeStep(f,dt,now);break;
      case "evade": evadeStep(f,dt,now);break;
      case "swallow": swallowStep(f,dt,now);break;
      case "leave": leaveStep(f,dt,now);break;
    }
    if(f.state==="gone")return;
    f.bt+=(clamp(f.w*8,-.8,.8)-f.bt)*(1-Math.exp(-dt*.2));   // the tail lags behind the swing of a turn
    f.bend=f.cbend;
    f.pl+=(f.p-f.pl)*(1-Math.exp(-dt*.1));                   // lagging pitch → the body arches when it changes depth
    f.vp+=(clamp(f.p*.6,-.3,.3)-f.vp)*(1-Math.exp(-dt*.25)); // drawn nose angle stays gentle
    f.amp+=(f.ampT-f.amp)*(1-Math.exp(-dt*.12));
    f.phase+=dt*f.pr; f.pec+=dt*f.pecR;
    if(f.gulp>0)f.gulp=Math.max(0,f.gulp-dt*.012);
    f.y=clamp(f.y,YMIN-5,YMAX+4);
  });
  crabs.forEach(c=>updateCrab(c,dt,now));
}

/* ---------------------------  drawing a fish  --------------------------- */
const NS=12;
const ST=[0,.08,.2,.35,.5,.65,.8,.92,1];
const WT=[0,.5,.85,1,.92,.7,.45,.28,.2];
const WT_LONG=[0,.42,.68,.86,1,.97,.72,.42,.24];          // pointed snout, slender, even body
function widthAt(s,prof){
  for(let i=1;i<ST.length;i++)if(s<=ST[i]){const u=(s-ST[i-1])/(ST[i]-ST[i-1]);return prof[i-1]+(prof[i]-prof[i-1])*u}
  return prof[prof.length-1];
}
const SPN=Array.from({length:NS+1},()=>({x:0,y:0,w:0,tx:0,ty:0,nx:0,ny:0}));
const FIN_SMALL={d0:3,d1:6,dm:5,dh:.16,a0:7,a1:10,am:9,ah:.11,pv:5,ph:.09};
const FIN_LONG ={d0:7,d1:10,dm:9,dh:.075,a0:8,a1:11,am:10,ah:.065,pv:6,ph:.05};   // dorsal & anal set far back, opposite each other

/* Pseudo-3D: every point of the fish is built in its own flat "side view" frame (x along the spine, y up/down),
   rotated by the (small) pitch, and then projected with the yaw:
     screen x = x·cos(yaw) + (lateral bend)·sin(yaw)      ← flank foreshortens, the tail lag swings sideways
     screen y = y · (1 + .5·sin(yaw)·x/L)                  ← the head comes towards the viewer (bigger), the tail recedes
   The fish is always drawn right way up, so a turn can never look like a sheet of paper being flipped. */
function drawFish(f){
  const L=f.L, Wm=L*f.aspect*(1+.28*f.gulp), A=L*f.amp*f.ampK, fa=f.alpha;
  const prof=f.long?WT_LONG:WT, o=f.long?FIN_LONG:FIN_SMALL;
  const yc=Math.cos(f.yaw), sy=Math.sin(f.yaw), sg=yc<0?-1:1, ayc=Math.abs(yc);
  const cv=Math.cos(f.vp), sv=Math.sin(f.vp);
  const cb=f.bend*L*.34, arch=(f.pl-f.p)*L*.5, bl=f.bt*L*.34;
  const sxf=sg*Math.max(.07,ayc);
  const P=(x,y)=>{
    const s=clamp((.5-x/L)/.82,0,1.2), a=x*cv-y*sv, b=x*sv+y*cv;
    return [a*yc+bl*s*s*sy, b*(1+.5*sy*x/L)];
  };
  for(let i=0;i<=NS;i++){
    const s=i/NS,p=SPN[i];
    p.x=L*(.5-.82*s);
    p.y=A*(.12+.88*s*s)*Math.sin(f.phase-s*f.wl)+(cb+arch)*s*s;   // travelling body wave + C-start flick + depth-change arch
    p.w=Wm*widthAt(s,prof);
  }
  for(let i=0;i<=NS;i++){
    const a=SPN[Math.max(0,i-1)],b=SPN[Math.min(NS,i+1)],p=SPN[i];
    let tx=b.x-a.x,ty=b.y-a.y;const l=Math.hypot(tx,ty)||1;tx/=l;ty/=l;
    p.tx=tx;p.ty=ty;p.nx=-ty;p.ny=tx;                          // n points "up" (back of the fish)
  }
  const T=SPN.map(p=>[p.x+p.nx*p.w,p.y+p.ny*p.w]);
  const B=SPN.map(p=>[p.x-p.nx*p.w,p.y-p.ny*p.w]);
  const PT=T.map(a=>P(a[0],a[1])), PB=B.map(a=>P(a[0],a[1]));

  actx.save();actx.translate(f.x,f.y);
  if(f.sz!==1)actx.scale(f.sz,f.sz);
  actx.lineJoin="round";

  // --- tail fin (forked, lags behind the body wave)
  const E=SPN[NS], ang=Math.atan2(E.ty,E.tx), swing=Math.sin(f.phase-f.wl-.8)*(.12+f.amp*3.5), Ep=P(E.x,E.y);
  actx.save();actx.translate(Ep[0],Ep[1]);actx.scale(sxf,1+.5*sy*E.x/L);actx.rotate(ang+swing+f.vp);
  const Lt=L*f.tailK,pw=E.w;
  actx.beginPath();
  actx.moveTo(-L*.02,-pw);
  actx.quadraticCurveTo(Lt*.5,-Lt*.3,Lt,-Lt);
  actx.quadraticCurveTo(Lt*.78,-Lt*.45,Lt*.6,0);
  actx.quadraticCurveTo(Lt*.78,Lt*.45,Lt,Lt);
  actx.quadraticCurveTo(Lt*.5,Lt*.3,-L*.02,pw);
  actx.closePath();
  actx.fillStyle=`rgba(255,255,255,${fa*.7})`;actx.fill();
  actx.restore();

  // --- dorsal, anal & pelvic fins
  actx.fillStyle=`rgba(255,255,255,${fa*.55})`;
  {
    const a=SPN[o.dm],i0=o.d0,i1=o.d1,m0=(T[o.dm-1][0]+T[o.dm][0])/2,m1=(T[o.dm-1][1]+T[o.dm][1])/2;
    const ap=P(m0+a.tx*L*.06+a.nx*L*o.dh, m1+a.ty*L*.06+a.ny*L*o.dh);
    const c0=P(T[i0][0]+SPN[i0].nx*L*o.dh*.75,T[i0][1]+SPN[i0].ny*L*o.dh*.75);
    const c1=P(T[i1][0]+SPN[i1].nx*L*o.dh*.3,T[i1][1]+SPN[i1].ny*L*o.dh*.3);
    actx.beginPath();actx.moveTo(PT[i0][0],PT[i0][1]);
    actx.quadraticCurveTo(c0[0],c0[1],ap[0],ap[1]);
    actx.quadraticCurveTo(c1[0],c1[1],PT[i1][0],PT[i1][1]);
    actx.closePath();actx.fill();
  }
  {
    const a=SPN[o.am],i0=o.a0,i1=o.a1,m0=(B[o.am-1][0]+B[o.am][0])/2,m1=(B[o.am-1][1]+B[o.am][1])/2;
    const ap=P(m0+a.tx*L*.05-a.nx*L*o.ah, m1+a.ty*L*.05-a.ny*L*o.ah);
    const c0=P(B[i0][0]-SPN[i0].nx*L*o.ah*.55,B[i0][1]-SPN[i0].ny*L*o.ah*.55);
    actx.beginPath();actx.moveTo(PB[i0][0],PB[i0][1]);
    actx.quadraticCurveTo(c0[0],c0[1],ap[0],ap[1]);
    actx.lineTo(PB[i1][0],PB[i1][1]);actx.closePath();actx.fill();
  }
  {
    const k=o.pv,a=SPN[k],ap=P(B[k][0]+a.tx*L*.07-a.nx*L*o.ph,B[k][1]+a.ty*L*.07-a.ny*L*o.ph);
    actx.beginPath();actx.moveTo(PB[k-1][0],PB[k-1][1]);actx.lineTo(ap[0],ap[1]);actx.lineTo(PB[k+1][0],PB[k+1][1]);actx.closePath();actx.fill();
  }

  // --- body (counter-shaded: lighter back, darker belly)
  const Wg=Math.max(Wm,1.2)*1.3;
  const g=actx.createLinearGradient(0,-Wg,0,Wg);
  g.addColorStop(0,`rgba(255,255,255,${fa})`);
  g.addColorStop(.55,`rgba(255,255,255,${fa*.72})`);
  g.addColorStop(1,`rgba(255,255,255,${fa*.38})`);
  actx.beginPath();actx.moveTo(PT[0][0],PT[0][1]);
  for(let i=1;i<NS;i++)actx.quadraticCurveTo(PT[i][0],PT[i][1],(PT[i][0]+PT[i+1][0])/2,(PT[i][1]+PT[i+1][1])/2);
  actx.lineTo(PT[NS][0],PT[NS][1]);actx.lineTo(PB[NS][0],PB[NS][1]);
  for(let i=NS-1;i>=1;i--)actx.quadraticCurveTo(PB[i][0],PB[i][1],(PB[i][0]+PB[i-1][0])/2,(PB[i][1]+PB[i-1][1])/2);
  actx.lineTo(PB[0][0],PB[0][1]);actx.closePath();
  actx.fillStyle=g;actx.fill();
  actx.strokeStyle=`rgba(255,255,255,${fa*.8})`;actx.lineWidth=.45;actx.stroke();

  // --- head-on volume: while it swings through "facing the camera" the flank squeezes away
  //     and a soft rounded torso takes over, so the turn reads as a body turning, not a flat shape
  {
    const hon=1-ayc;
    if(hon>.04){
      const c=P(L*.16,0);
      actx.save();actx.globalAlpha=Math.min(1,hon*1.25)*.9;
      actx.beginPath();actx.ellipse(c[0],c[1],Wm*.8*hon,Wm*1.02*(1+.5*sy*.16),0,0,6.3);
      actx.fillStyle=g;actx.fill();
      actx.restore();
    }
  }

  // --- pectoral fin (sculling)
  {
    const p=SPN[3],r=P(p.x-p.nx*p.w*.3,p.y-p.ny*p.w*.3),pk=f.long?.07:.1;
    actx.save();actx.translate(r[0],r[1]);actx.scale(sxf,1);
    actx.rotate(Math.atan2(p.ty,p.tx)-.5+Math.sin(f.pec)*f.pecA*.5+f.vp);
    actx.beginPath();actx.ellipse(L*pk*.9,0,L*pk,L*pk*.32,0,0,6.3);
    actx.fillStyle=`rgba(255,255,255,${fa*.65})`;actx.fill();
    actx.restore();
  }

  // --- lateral line + gill cover (they live on the flank, so they fade out when the fish faces us)
  const side=clamp(ayc*1.6,0,1);
  if(side>.02){
    actx.beginPath();
    for(let i=2;i<=10;i++){const p=SPN[i],q=P(p.x-p.nx*p.w*.1,p.y-p.ny*p.w*.1);i===2?actx.moveTo(q[0],q[1]):actx.lineTo(q[0],q[1])}
    actx.strokeStyle=`rgba(255,255,255,${Math.min(1,fa*1.2)*side})`;actx.lineWidth=.6;actx.stroke();
    const p=SPN[3],g0=P(p.x+p.nx*p.w*.75,p.y+p.ny*p.w*.75),g1=P(p.x-p.tx*L*.05,p.y-p.ty*L*.05),g2=P(p.x-p.nx*p.w*.75,p.y-p.ny*p.w*.75);
    actx.beginPath();actx.moveTo(g0[0],g0[1]);
    actx.quadraticCurveTo(g1[0],g1[1],g2[0],g2[1]);
    actx.strokeStyle=`rgba(8,8,10,${.28*side})`;actx.lineWidth=.55;actx.stroke();
  }

  // --- long fish: jaw line (it has a mouth full of opinions)
  if(f.long&&side>.02){
    const a=SPN[0],b=SPN[2],j0=P(a.x,a.y),j1=P(b.x+L*.012,b.y);
    actx.beginPath();actx.moveTo(j0[0],j0[1]);actx.lineTo(j1[0],j1[1]);
    actx.strokeStyle=`rgba(8,8,10,${.4*side})`;actx.lineWidth=.5;actx.stroke();
  }

  // --- eyes: one eye on the flank; when the head swings towards us the second eye appears too
  {
    const a=SPN[1],b=SPN[2];
    const ex=(a.x+b.x)/2+(a.nx+b.nx)/2*Wm*.16, ey=(a.y+b.y)/2+(a.ny+b.ny)/2*Wm*.16, r=f.long?.8:Math.max(.85,L*.058);
    const e0=P(ex,ey), off=Wm*.5*sy*sg, shift=r*.12*yc;
    const eye=(X,al)=>{
      actx.globalAlpha=al;
      actx.beginPath();actx.arc(X,e0[1],r*1.45,0,6.3);actx.fillStyle="rgba(255,255,255,.85)";actx.fill();
      actx.beginPath();actx.arc(X+shift,e0[1],r,0,6.3);actx.fillStyle="rgba(8,8,10,.95)";actx.fill();
    };
    actx.save();
    eye(e0[0]-off,1);
    const far=clamp((sy-.72)/.22,0,1);
    if(far>0)eye(e0[0]+off,far);
    actx.restore();
  }
  actx.restore();
}

/* ---------------------------  frame loop  --------------------------- */
function interiorPath(B){
  // the exact inside of the bar: the same outline + the same live string that the other canvas strokes
  const Lf=.5,Rt=AW-.5,T=.5,r=R-.5,sx=(AW-2*R)/(N-1),p=new Path2D();
  p.moveTo(AW-R,B);
  p.arcTo(Rt,B,Rt,B-R,r);p.lineTo(Rt,T+R);
  p.arcTo(Rt,T,AW-R,T,r);p.lineTo(R,T);
  p.arcTo(Lf,T,Lf,T+R,r);p.lineTo(Lf,B-R);
  p.arcTo(Lf,B,R,B,r);
  for(let i=0;i<N;i+=2)p.lineTo(R+i*sx,B+soft(Y[i]));
  p.lineTo(AW-R,B+soft(Y[N-1]));
  p.closePath();return p;
}

let aqLast=0;
let hovering=false,aqDrawn=0;
on(search,"pointerenter",()=>{hovering=true});
on(search,"pointerleave",()=>{hovering=false});
function aquaFrame(now){
  if(dead)return;
  // The pool drifts slowly: at rest it is drawn every other frame (its motion is time-based, so it looks the same);
  // the moment the pointer is on the bar or it has focus, every frame.
  // (about 20 fps at rest; paused outright while the window is unfocused or hidden, and picked up again on focus)
  if(document.hidden||!document.hasFocus()||document.documentElement.classList.contains("intro-wait")){aqLast=0;requestAnimationFrame(aquaFrame);return}
  if(!hovering&&focusAmt<.02&&now-aqDrawn<48){requestAnimationFrame(aquaFrame);return}
  aqDrawn=now;
  const dt=aqLast?Math.min((now-aqLast)/16.667,3):1;aqLast=now;
  const t=reduce?0:now/1000;
  while(ripples.length&&now-ripples[0].t>2800)ripples.shift();
  if(AW<60){requestAnimationFrame(aquaFrame);return}
  updateFish(reduce?0:dt,now);

  actx.clearRect(0,0,AW,AH);
  const B=floorY(), amp=1-.45*focusAmt;
  const surf=x=>{
    let y=SURF+amp*(1.5*Math.sin(x*.017+t*1.0)+1.0*Math.sin(x*.029-t*.75));
    for(const r of ripples){
      const age=(now-r.t)/1000,d=Math.abs(x-r.x);
      y+=r.amp*3.4*Math.exp(-age*1.7)*Math.exp(-d/190)*Math.sin(d*.11-age*10);
    }
    return y;
  };
  const xs=[],ys=[];
  for(let x=0;x<=AW+4;x+=4){xs.push(Math.min(x,AW));ys.push(surf(x))}

  actx.save();
  actx.clip(interiorPath(B));                          // nothing can ever leak past the outline or the string
                                                       // (this is also what hides a crab that sinks below the border line)
  // body of water
  const g=actx.createLinearGradient(0,SURF,0,B);
  g.addColorStop(0,`rgba(255,255,255,${.075+.03*focusAmt})`);g.addColorStop(1,`rgba(255,255,255,${.014+.02*focusAmt})`);
  actx.beginPath();actx.moveTo(0,AH);
  xs.forEach((x,i)=>actx.lineTo(x,ys[i]));
  actx.lineTo(AW,AH);actx.closePath();actx.fillStyle=g;actx.fill();

  // back wave
  actx.beginPath();
  xs.forEach((x,i)=>{const y=SURF+6+amp*1.2*Math.sin(x*.022-t*.9+1.3)+(ys[i]-SURF)*.4;i?actx.lineTo(x,y):actx.moveTo(x,y)});
  actx.strokeStyle="rgba(255,255,255,.09)";actx.lineWidth=1;actx.stroke();

  // depth order: crabs (floor) → fish
  crabs.forEach(drawCrab);
  fishes.forEach(f=>{if(f.state!=="gone")drawFish(f)});

  // bubbles
  for(let i=bubbles.length-1;i>=0;i--){
    const b=bubbles[i];
    b.y-=b.vy*dt;b.x+=Math.sin(b.wob+b.y*.2)*.15;b.a-=.004*dt;
    if(b.y<SURF+4||b.a<=0){bubbles.splice(i,1);continue}
    actx.beginPath();actx.arc(b.x,b.y,b.r,0,6.3);
    actx.strokeStyle=`rgba(255,255,255,${b.a*.6})`;actx.lineWidth=.8;actx.stroke();
  }

  // surface line
  actx.beginPath();
  xs.forEach((x,i)=>i?actx.lineTo(x,ys[i]):actx.moveTo(x,ys[i]));
  actx.strokeStyle="rgba(255,255,255,.3)";actx.lineWidth=1;actx.stroke();
  actx.restore();

  requestAnimationFrame(aquaFrame);
}
requestAnimationFrame(aquaFrame);


/* ---------------------------  pointer & keyboard hooks  --------------------------- */
const setPtr=e=>{const r=aq.getBoundingClientRect();ptr.x=e.clientX-r.left;ptr.y=e.clientY-r.top};
on(field,"mousemove",setPtr);
on(field,"mouseenter",e=>{setPtr(e);scare(ptr.x,ptr.y,false)});     // pointer arrives → they get nervous and leave
on(field,"mousedown",e=>{                                           // tap → proper fright
  if(e.target.closest(".tb,.compass"))return;
  setPtr(e);scare(ptr.x,ptr.y,true);
});
on(field,"focusin",e=>{                                             // Ctrl K also startles them
  if(!e.relatedTarget&&!field.dataset.clicked){kb=true;scare(AW/2,AH/2,true)}
});
on(field,"focusout",()=>{kb=false});
on(q,"input",()=>ripple(Math.max(8,Math.min(AW-8,caretX())),.25));
resize();
  return () => {
    dead = true;
    mo.disconnect();
    ro1.disconnect();
    ro2.disconnect();
    offs.forEach((f) => f());
  };
}
