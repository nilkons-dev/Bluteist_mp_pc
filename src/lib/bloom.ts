// @ts-nocheck
/**
 * Flowers and a butterfly for the corner of the Your Library panel — ported from the supplied "Bloom corner v11"
 * design (canvas drawing, stem physics, petals, the swallowtail with its landing recipes).
 *
 * What changed for the app:
 *  - it draws onto canvases React renders inside the panel, and listens on that panel;
 *  - the butterfly lands on the panel's own icons (header glyph, row icons, pins);
 *  - setActive(false) stops the loop (used while the panel is folded to its strip, after it has faded);
 *  - the loop also stops while the window is hidden, and drops to half rate if frames get expensive;
 *  - dispose() releases every listener and observer.
 */
export interface BloomRefs {
  /** the panel: pointer position is read from it, and the butterfly's world is its border */
  side: HTMLElement;
  /** 244 x 208 canvas pinned to the panel's bottom-right corner */
  bloom: HTMLCanvasElement;
  /** canvas covering the whole panel, for the butterfly */
  fly: HTMLCanvasElement;
}

export function mountBloom(refs: BloomRefs): { setActive(v: boolean): void; dispose(): void } {
  const root = document.documentElement;
  const mq = matchMedia("(prefers-reduced-motion: reduce)");
  let reduce = mq.matches || root.classList.contains("reduce-motion");
  const mo = new MutationObserver(() => { reduce = mq.matches || root.classList.contains("reduce-motion"); });
  mo.observe(root, { attributes: true, attributeFilter: ["class"] });
  let dead = false;
  const offs = [];
  const on = (t, ev, fn, o) => { t.addEventListener(ev, fn, o); offs.push(() => t.removeEventListener(ev, fn, o)); };
const cv=refs.bloom, ctx=cv.getContext("2d"), side=refs.side;
const TAU=Math.PI*2, PI=Math.PI;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const lerp=(a,b,t)=>a+(b-a)*t;
const rnd=(a,b)=>a+Math.random()*(b-a);
const ease={
  out3:t=>1-Math.pow(1-t,3),
  back:t=>{const c1=1.9,c3=c1+1;return 1+c3*Math.pow(t-1,3)+c1*Math.pow(t-1,2)}
};
const W=244, H=208;
let DPR=1,TX=0,TY=0;           // device pixel ratio + the head-tilt vector of the flower being drawn (for petal parallax)
let BG="#0c0c0d";   // petals are filled with the panel colour first so layers hide each other; the panel itself is glass, so a fixed near-black is used
function setup(){
  const dpr=Math.max(1,Math.min(window.devicePixelRatio||1,1.25));DPR=dpr;   // light: 1x–1.25x keeps the canvas small on old/low-end GPUs   // always drawn at 2x and scaled down: thin petal edges stay steady (no shimmer) at 100% / 125% / 150% display scaling
  cv.width=Math.round(W*dpr);cv.height=Math.round(H*dpr);
  cv.style.width=W+"px";cv.style.height=H+"px";
  ctx.setTransform(dpr,0,0,dpr,0,0);
           // petals are filled with the sidebar colour first, so layers hide each other cleanly
}
setup();

/* ---------------------------  pointer  --------------------------- */
const ptr={x:-999,y:-999,on:false}, ptv={x:0,y:0};
const sm={x:0,y:0,vx:0,vy:0,on:false};let pe=0;          // smoothed pointer + ease-in weight: nothing ever jumps
let excite=0, lastEnter=0, T0=0, nowT=0;
const PR=58;                                   // pointer influence radius (px)

/* ---------------------------  chains (stems & vines)  --------------------------- */
const chains=[], flowers=[];
function makeChain(o){
  const n=o.n;
  const c={n,seg:o.len/n,bx:o.bx,by:o.by!==undefined?o.by:H+3,
    rest:new Float32Array(n),s:new Float32Array(n),v:new Float32Array(n),
    px:new Float32Array(n+1),py:new Float32Array(n+1),th:new Float32Array(n),
    k:o.k||.05,flex:o.flex||1,delay:o.delay,dur:o.dur,ph:rnd(0,6.28),w0:o.w0||2.1,w1:o.w1||1,
    ge:0,leaves:[],berries:[],flower:null,tendril:!!o.tendril};
  for(let i=0;i<n;i++)c.rest[i]=o.theta((i+.5)/n);
  layout(c);
  return c;
}
function layout(c){
  let x=c.bx,y=c.by,a=0;c.px[0]=x;c.py[0]=y;
  for(let i=0;i<c.n;i++){
    a+=c.s[i];const th=c.rest[i]+a;c.th[i]=th;
    const g=clamp(c.ge*c.n-i,0,1);
    x+=Math.cos(th)*c.seg*g;y+=Math.sin(th)*c.seg*g;
    c.px[i+1]=x;c.py[i+1]=y;
  }
}
function pointAt(c,u){
  const idx=clamp(u,0,1)*c.n,i=Math.min(c.n-1,Math.floor(idx)),f=idx-i;
  return {x:lerp(c.px[i],c.px[i+1],f),y:lerp(c.py[i],c.py[i+1],f),th:c.th[i]};
}
function addLeaves(c,u0,u1,count,len,wid,ang,jit,kinds){
  for(let i=0;i<count;i++){
    const u=count===1?u0:lerp(u0,u1,i/(count-1));
    c.leaves.push({sa:0,sv:0,u,kind:kinds?kinds[Math.floor(Math.random()*kinds.length)]:"lance",side:i%2?1:-1,len:len*rnd(1-jit,1+jit),wid:wid*rnd(1-jit,1+jit),ang:ang*rnd(.85,1.15),ph:rnd(0,6.28)});
  }
}
/* stem direction: θ = −90° (up) + φ(u); φ<0 leans left */
const stemTheta=(a0,a1,w,p)=>u=>-PI/2+a0+(a1-a0)*Math.pow(u,p||1.4)+w*Math.sin(u*PI*1.5);

function build(){
  chains.length=0;flowers.length=0;
  const stems=[
    // back foliage
    {bx:148,len:92,a0:-1.05,a1:-0.42,w:.06,delay:0.5,dur:1.2,leaf:[.18,.95,7,15,5.2,.9],lk:["fern","lobed","round","needle"],no:true},
    {bx:232,len:90,a0:0.3,a1:-0.6,w:.06,delay:0.58,dur:1.2,leaf:[.2,.95,6,13,4.6,.9],lk:["fern","fan","round"],no:true},
    {bx:194,len:120,a0:-0.5,a1:0.12,w:.06,delay:0.66,dur:1.2,leaf:[.15,.95,8,14,4.8,.9],lk:["fern","trifoliate","lance"],no:true},
    {bx:170,len:104,a0:-0.85,a1:-0.3,w:.06,delay:0.78,dur:1.2,leaf:[.15,.95,7,15,5,.9],lk:["fern","fern","fan"],no:true},
    // flowers, back → front
    {bx:132,len:118,a0:-0.95,a1:-0.55,w:0.05,delay:0.9,dur:1.79,type:"lavender",R:10,leaf:[.2,.6,4,14,3.6,.8],lk:["lance","needle"]},
    {bx:222,len:124,a0:-0.28,a1:0.08,w:0.05,delay:0.96,dur:1.82,type:"lavender",R:9,leaf:[.2,.6,4,14,3.6,.8],lk:["needle","lance"]},
    {bx:168,len:136,a0:-0.62,a1:-0.2,w:0.05,delay:1.02,dur:1.88,type:"lily",R:15,leaf:[.2,.6,4,24,4.4,.7],lk:["lance"]},
    {bx:200,len:98,a0:-0.45,a1:0.0,w:0.05,delay:1.08,dur:1.69,type:"hydrangea",R:13,leaf:[.3,.7,3,17,5.4,1.0],lk:["heart","serrate","lobed"]},
    {bx:186,len:158,a0:-0.3,a1:-0.05,w:0.05,delay:1.14,dur:1.9,type:"dahlia",R:19,leaf:[.22,.65,4,19,6,.95],lk:["serrate","trifoliate","lance"]},
    {bx:210,len:128,a0:0,a1:0.25,w:0.05,delay:1.2,dur:1.84,type:"peony",R:14.5,leaf:[.25,.65,3,18,5.6,1.0],lk:["lobed","serrate","trifoliate"]},
    {bx:158,len:104,a0:-0.78,a1:-0.28,w:0.05,delay:1.26,dur:1.72,type:"rose",R:13.5,leaf:[.3,.7,3,17,5.5,1.0],lk:["trifoliate","serrate"]},
    {bx:228,len:112,a0:-0.1,a1:0.2,w:0.05,delay:1.32,dur:1.76,type:"cosmos",R:12.5,leaf:[.3,.7,3,16,5,.95],lk:["needle","fern","lance"]},
    {bx:176,len:90,a0:-1.0,a1:-0.5,w:0.05,delay:1.38,dur:1.65,type:"daisy",R:11,leaf:[.35,.7,2,14,4.6,1.0],lk:["round","fan","lance"]},
    {bx:154,len:72,a0:-0.95,a1:-0.5,w:0.05,delay:1.56,dur:1.56,type:"dahlia",R:10.5,leaf:[.4,.7,2,12,4,.9],lk:["serrate","fan"]},
    {bx:196,len:100,a0:-0.6,a1:-0.1,w:0.05,delay:1.62,dur:1.7,type:"cosmos",R:10.5,leaf:[.3,.7,3,14,4.6,1.0],lk:["fern","lance","needle"]},
    {bx:121,len:80,a0:-1.15,a1:-0.75,w:0.05,delay:1.74,dur:1.6,type:"lily",R:10,leaf:[.2,.6,3,18,4,.7],lk:["lance"]},
    // ground cover: short, stiff, leafy tufts that keep the base of the bouquet full while the heads sway
    {bx:112,len:40,a0:-1.3,a1:-1.0,w:.03,delay:.4,dur:1.0,k:.16,flex:.3,leaf:[.1,.95,7,14,4.6,1.0],lk:["fern","lance","round"],no:true},
    {bx:156,len:36,a0:-.8,a1:-.3,w:.03,delay:.5,dur:1.0,k:.16,flex:.3,leaf:[.1,.95,7,14,4.6,1.0],lk:["lance","fern","heart"],no:true},
    {bx:200,len:38,a0:-.35,a1:.1,w:.03,delay:.6,dur:1.0,k:.16,flex:.3,leaf:[.1,.95,7,14,4.6,1.0],lk:["lance","serrate","fern"],no:true},
    {bx:240,len:30,a0:-.1,a1:.45,w:.03,delay:.7,dur:1.0,k:.16,flex:.3,leaf:[.1,.95,6,12,4.2,1.0],lk:["round","fan","fern"],no:true}
  ];
  stems.forEach((s,i)=>{
    const c=makeChain({bx:s.bx,len:s.len,n:Math.max(9,Math.round(s.len/9)),theta:stemTheta(s.a0,s.a1,s.w),delay:s.delay,dur:s.dur,k:s.k||.05,flex:s.flex||1,w0:2.2,w1:1});
    addLeaves(c,s.leaf[0],s.leaf[1],s.leaf[2],s.leaf[3],s.leaf[4],s.leaf[5],.12,s.lk);
    if(!s.no){
      const f={ps:new Float32Array(64),pv:new Float32Array(64),lw:0,lx:0,ly:-1,type:s.type,R:s.R,bs:0,bv:0,near:0,look:0,kickAt:0,kickAmp:0,t0:T0+s.delay+s.dur*.82+rnd(0,.15),bt:0,ph:rnd(0,6.28),open:0,hx:0,hy:0};
      c.flower=f;flowers.push(f);
    }
    chains.push(c);
  });
  // creeping vines (drawn last = in front)
  const v1=makeChain({bx:W+4,by:H-7,len:184,n:18,theta:u=>PI+.3*Math.sin(u*TAU*2.2+.4)*(.35+u*.65)+.04,delay:.1,dur:1.6,k:.16,flex:.55,w0:1.5,w1:.8,tendril:true});
  addLeaves(v1,.08,.98,16,8.5,3.2,1.05,.2,["heart","heart","round","lance"]);
  [.2,.45,.7,.9].forEach(u=>v1.berries.push({u,r:1.7,ph:rnd(0,6)}));
  const v2=makeChain({bx:W-6,by:H+2,len:130,n:13,theta:u=>-PI/2+.5*Math.sin(u*TAU*2.4)*(.5+.5*u)+.1,delay:.3,dur:1.5,k:.14,flex:.6,w0:1.5,w1:.8,tendril:true});
  addLeaves(v2,.1,.98,11,8,3,1.05,.2,["heart","round"]);
  [.3,.62,.85].forEach(u=>v2.berries.push({u,r:1.6,ph:rnd(0,6)}));
  chains.push(v1,v2);
}

/* ---------------------------  particles  --------------------------- */
const petals=[], pollen=[];
function spawnPetal(f,burst){
  const c=chains.find(c=>c.flower===f); if(!c)return;
  petals.push({x:c.px[c.n],y:c.py[c.n],vx:rnd(-.3,.3)+(burst?rnd(-.9,.9):0),vy:burst?rnd(-1.1,-.2):rnd(-.05,.1),
    rot:rnd(0,TAU),vr:rnd(-.05,.05),flip:rnd(0,6),ph:rnd(0,6),size:rnd(3.6,5.4),a:.85,life:0});
  if(petals.length>14)petals.shift();
}
function spawnPollen(x,y,n,spread){
  for(let i=0;i<n;i++)pollen.push({x:x+rnd(-spread,spread),y:y+rnd(-spread,spread),vx:rnd(-.25,.25),vy:rnd(-.5,-.12),r:rnd(.6,1.3),a:.8,ph:rnd(0,6)});
  while(pollen.length>40)pollen.shift();
}

/* ---------------------------  physics  --------------------------- */
function gust(dir,amp){
  chains.forEach(c=>{for(let i=0;i<c.n;i++)c.v[i]+=dir*amp*((i+1)/c.n)*c.flex*rnd(.7,1.3)});
}
function collide(){
  for(const c of chains){c.cx=0;c.cy=0}
  const live=flowers.filter(f=>f.c&&f.bt>.6),rad=f=>f.R*(.55+.45*Math.min(f.open,1));
  for(let a=0;a<live.length;a++){
    const A=live[a],ra=rad(A);
    for(let b=a+1;b<live.length;b++){                         // heads are discs: overlap → push apart along the contact normal
      const B=live[b],dx=B.hx-A.hx,dy=B.hy-A.hy,d=Math.hypot(dx,dy)||1,mn=(ra+rad(B))*.62;
      if(d<mn){const pen=(mn-d)/mn,nx=dx/d,ny=dy/d;A.c.cx-=nx*pen;A.c.cy-=ny*pen;B.c.cx+=nx*pen;B.c.cy+=ny*pen}
    }
    if(pe>.05){                                                // pointer is a disc too
      const dx=A.hx-sm.x,dy=A.hy-sm.y,d=Math.hypot(dx,dy)||1,mn=ra+12;
      if(d<mn){const pen=(mn-d)/mn;A.c.cx+=dx/d*pen*1.0*pe+clamp(sm.vx*.05,-.5,.5)*pen;A.c.cy+=dy/d*pen*1.0*pe+clamp(sm.vy*.05,-.5,.5)*pen}
    }
  }
}
function updateChain(c,dt,t){
  c.ge=ease.out3(clamp((t-T0-c.delay)/c.dur,0,1));
  if(reduce)c.ge=1;
  const boost=reduce?0:1+.45*excite;
  for(let i=0;i<c.n;i++){
    const lever=(i+1)/c.n, grown=clamp(c.ge*c.n-i,0,1)>0;
    let F=(.00052*Math.sin(t*1.25+c.ph+i*.3)+.00034*Math.sin(t*2.3+c.ph*1.7+i*.55)+.00046*Math.sin(t*1.05-c.bx*.035+i*.14)+.0003*Math.sin(t*.43-c.bx*.02))*boost*(.35+lever)*c.flex;
    if(pe>.01&&grown&&!reduce){
      const mx=(c.px[i]+c.px[i+1])/2,my=(c.py[i]+c.py[i+1])/2,dx=mx-sm.x,dy=my-sm.y,d=Math.hypot(dx,dy);
      if(d<PR){
        let w=1-d/PR;w=w*w*(3-2*w)*pe;const inv=1/(d||1);       // smoothstep falloff
        const ux=dx*inv*w+clamp(sm.vx*.1,-1,1)*w, uy=dy*inv*w+clamp(sm.vy*.1,-1,1)*w, th=c.th[i];
        F+=(-Math.sin(th)*ux+Math.cos(th)*uy)*.0017*c.flex;
        c.v[i]*=1-clamp(.05*w*dt,0,.3);                          // a little extra damping near the pointer = silky, no jitter
      }
    }
    if(c.flower&&grown&&(c.cx||c.cy))F+=(-Math.sin(c.th[i])*c.cx+Math.cos(c.th[i])*c.cy)*lever*lever*.0016*c.flex;   // head-vs-head / pointer-vs-head collision
    if(c.flower&&grown){                                    // the sidebar wall: stems are nudged back instead of leaving the corner
      const mx=(c.px[i]+c.px[i+1])/2,wl=clamp((mx-(W-22))/22,0,1.4);
      if(wl>0)F+=Math.sin(c.th[i])*wl*.0075;                // u = (−1,0) → perp·u = sin θ
    }
    const kb=c.tendril?c.k:c.k*(1+2.6*(1-lever)*(1-lever));c.v[i]+=(F-kb*c.s[i]-.09*c.v[i])*dt;
    const lm=c.tendril?.45:.16+.3*lever;c.s[i]=clamp(c.s[i]+c.v[i]*dt,-lm,lm);
  }
  layout(c);
}
function updateFlower(f,c,dt,t){
  f.hx=c.px[c.n];f.hy=c.py[c.n];
  f.bt=reduce?1:ease.back(clamp((t-f.t0)/1.15,0,1));
  if(f.kickAt&&t>=f.kickAt){f.bv+=f.kickAmp;f.kickAt=0}
  f.bv+=(-.1*f.bs-.16*f.bv)*dt;f.bs+=f.bv*dt;
  f.open=Math.max(0,f.bt)*(1+f.bs);
  let tn=0,lk=0;
  if(pe>.01&&!reduce){
    const d=Math.hypot(sm.x-f.hx,sm.y-f.hy);
    if(d<76){const q=1-d/76;tn=q*q*(3-2*q)*pe*.5}
    lk=clamp((sm.x-f.hx)/50,-1,1)*.16*tn;
  }
  f.near+=(tn-f.near)*(1-Math.exp(-dt*.09));
  /* 3D head orientation: leans with the wind, lags behind the stem's swing, turns toward the pointer */
  let gx=0,gy=0;
  if(!reduce){
    const pc=Math.hypot(sm.x-f.hx,sm.y-f.hy)||1;
    gx=Math.sin(t*1.1+f.ph)*.7-clamp(c.v[c.n-1]*140,-1.6,1.6)+(sm.x-f.hx)/pc*3.8*f.near;
    gy=Math.cos(t*.8+f.ph)*.5-.4+(sm.y-f.hy)/pc*3.8*f.near;
  }
  const k3=1-Math.exp(-dt*.05);f.tx=(f.tx||0)+(gx-(f.tx||0))*k3;f.ty=(f.ty||0)+(gy-(f.ty||0))*k3;
  f.look+=(lk-f.look)*(1-Math.exp(-dt*.07));
}

/* ---------------------------  3D shading helpers  ---------------------------
   one light, top-left, in SCREEN space. LL() converts it into the local (rotated) frame of whatever is being drawn,
   so every petal / leaf is lit from the same side no matter how it is turned. */
const LX=-.55,LY=-.83;
function LL(){const m=ctx.getTransform(),n=Math.hypot(m.a,m.b)||1,c=m.a/n,s=m.b/n;return{x:LX*c+LY*s,y:-LX*s+LY*c,c,s,n}}
const lcol=v=>v>=0?`rgba(255,255,255,${.3*v})`:`rgba(0,0,0,${-.5*v})`;
function sh(on){if(on){ctx.shadowColor="rgba(0,0,0,.6)";ctx.shadowBlur=0;ctx.shadowOffsetX=1.2*DPR;ctx.shadowOffsetY=1.8*DPR}
  else{ctx.shadowColor="transparent";ctx.shadowBlur=0;ctx.shadowOffsetX=0;ctx.shadowOffsetY=0}}
const GC=new Map();
function gc(key,mk){let g=GC.get(key);if(!g){if(GC.size>900)GC.clear();g=mk();GC.set(key,g)}return g}   // gradients live in user space → safe to reuse
function lgrad(len,a){const L=Math.round(len)||1,A=Math.round(a*20);return gc("g"+L+"_"+A,()=>{const g=ctx.createLinearGradient(0,0,L,0);g.addColorStop(0,`rgba(255,255,255,${.1*A/20})`);g.addColorStop(1,`rgba(255,255,255,${.5*A/20})`);return g})}
function fold(w){const l=LL(),q=Math.round(l.y*6)/6,Wd=Math.max(1,Math.round(w));    // leaf: lit half / shaded half either side of the midrib
  ctx.fillStyle=gc("f"+Wd+"_"+q,()=>{const g=ctx.createLinearGradient(0,-Wd,0,Wd);g.addColorStop(0,lcol(-q*.9));g.addColorStop(.5,"rgba(0,0,0,0)");g.addColorStop(1,lcol(q*.9));return g});ctx.fill()}

/* ---------------------------  drawing: leaves & petals  --------------------------- */
function leaf(x,y,ang,len,wid,a,t,ph){
  const cy=len*.3*Math.cos(ang), fl=Math.sin(t*2.1+ph)*.02*len;
  ctx.save();ctx.translate(x,y);ctx.rotate(ang);
  ctx.beginPath();ctx.moveTo(0,0);
  ctx.bezierCurveTo(len*.25,-wid,len*.7,-wid*.8+cy*.6,len,cy+fl);
  ctx.bezierCurveTo(len*.7,wid*.8+cy*.6,len*.25,wid,0,0);
  ctx.closePath();
  ctx.fillStyle=BG;ctx.fill();
  ctx.fillStyle=lgrad(len,a);ctx.fill();fold(wid*.95);
  ctx.strokeStyle=`rgba(255,255,255,${.78*a})`;ctx.lineWidth=.6;ctx.stroke();
  // midrib + veins
  ctx.beginPath();ctx.moveTo(0,0);ctx.quadraticCurveTo(len*.5,cy*.4,len,cy+fl);
  ctx.strokeStyle=`rgba(255,255,255,${.5*a})`;ctx.lineWidth=.5;ctx.stroke();
  if(len>11){
    ctx.beginPath();
    for(const u of[.3,.5,.7]){
      const mx=len*u,my=cy*u*.4*u*2;
      ctx.moveTo(mx,my);ctx.lineTo(mx+len*.12,my-wid*.5*(1-u*.5));
      ctx.moveTo(mx,my);ctx.lineTo(mx+len*.12,my+wid*.5*(1-u*.5));
    }
    ctx.strokeStyle=`rgba(255,255,255,${.2*a})`;ctx.lineWidth=.4;ctx.stroke();
  }
  ctx.restore();
}
function petalPath(len,wid){
  ctx.moveTo(0,0);
  ctx.bezierCurveTo(wid*1.15,-len*.18,wid*1.05,-len*.78,0,-len);
  ctx.bezierCurveTo(-wid*1.05,-len*.78,-wid*1.15,-len*.18,0,0);
}
function cupPath(len,wid){
  ctx.moveTo(0,0);
  ctx.bezierCurveTo(wid*1.35,-len*.08,wid*1.3,-len*.92,0,-len);
  ctx.bezierCurveTo(-wid*1.3,-len*.92,-wid*1.35,-len*.08,0,0);
}
function heartPath(len,wid){
  ctx.moveTo(0,0);
  ctx.bezierCurveTo(wid*.9,-len*.12,wid*1.25,-len*.75,wid*.45,-len*.97);
  ctx.quadraticCurveTo(wid*.12,-len*1.02,0,-len*.86);
  ctx.quadraticCurveTo(-wid*.12,-len*1.02,-wid*.45,-len*.97);
  ctx.bezierCurveTo(-wid*1.25,-len*.75,-wid*.9,-len*.12,0,0);
}
function drawPetal(path,len,wid,a,vein,cup){
  ctx.save();
  const l=LL(),lit=clamp(.5-l.y*.5,0,1),k=.8+.5*lit,u=DPR/l.n;           // petals that face the light are brighter
  const h=CF?clamp(1.1-len/(CF.R*1.15),0,1):0;                           // inner (shorter) petals sit higher → strong parallax with head tilt
  const pk=3.4*(1+2*(CF?CF.near:0));   // hover: layers separate much further
  if(h>.02&&(TX||TY))ctx.translate((TX*l.c+TY*l.s)*h*pk*u,(-TX*l.s+TY*l.c)*h*pk*u);
  const sk=1+1.4*(CF?CF.near:0);ctx.save();ctx.translate((1.3*l.c+2*l.s)*u*sk,(-1.3*l.s+2*l.c)*u*sk);        // hard drop shadow (no blur = cheap) onto the petals underneath
  ctx.beginPath();path(len,wid);ctx.fillStyle="rgba(0,0,0,.55)";ctx.fill();ctx.restore();
  ctx.beginPath();path(len,wid);ctx.fillStyle=BG;ctx.fill();
  const Lq=Math.round(len*2)/2||.5,Wq=Math.round(wid*2)/2||.5,aq=Math.round(Math.min(1.3,a*k)*16),lq=Math.round(l.x*6)/6;
  ctx.fillStyle=gc("p"+Lq+"_"+aq,()=>{const g=ctx.createLinearGradient(0,0,0,-Lq);g.addColorStop(0,`rgba(255,255,255,${.1*aq/16})`);g.addColorStop(1,`rgba(255,255,255,${Math.min(.8,.62*aq/16)})`);return g});ctx.fill();
  ctx.fillStyle=gc("x"+Wq+"_"+lq,()=>{const g=ctx.createLinearGradient(-Wq,0,Wq,0);g.addColorStop(0,lcol(-lq*.95));g.addColorStop(.5,"rgba(0,0,0,0)");g.addColorStop(1,lcol(lq*.95));return g});ctx.fill();
  ctx.strokeStyle=`rgba(255,255,255,${Math.min(1,.82*a*(.8+.4*lit))})`;ctx.lineWidth=.6;ctx.stroke();
  if(vein){ctx.beginPath();ctx.moveTo(0,-len*.12);ctx.lineTo(0,-len*.7);ctx.strokeStyle=`rgba(255,255,255,${.24*a})`;ctx.lineWidth=.4;ctx.stroke()}
  if(cup){ctx.beginPath();ctx.moveTo(-wid*.8,-len*.78);ctx.quadraticCurveTo(0,-len*.6,wid*.8,-len*.78);ctx.strokeStyle=`rgba(255,255,255,${.34*a})`;ctx.lineWidth=.45;ctx.stroke()}
  ctx.restore();
}

/* ---------------------------  drawing: the flowers  --------------------------- */
function daisy(R,o,t,near){
  const np=12,L=R*(.25+.75*Math.min(o,1.15));
  for(let ring=0;ring<2;ring++){
    const off=ring?PI/np:0,ll=L*(ring?.9:1);
    for(let k=0;k<np;k++){
      ctx.save();const a0=k/np*TAU+off;ctx.rotate(a0+pm(a0,1));ctx.translate(0,-R*.16*Math.min(o,1));
      drawPetal(petalPath,ll*PLS*(1+near*.07*Math.sin(t*16+k*1.7)),R*.15*(ring?.95:1),ring?.72:1,true,false);
      ctx.restore();
    }
  }
  const cr=R*.3*(.4+.6*Math.min(o,1));
  ctx.beginPath();ctx.arc(0,0,cr,0,TAU);ctx.fillStyle=BG;ctx.fill();
  ctx.fillStyle="rgba(255,255,255,.16)";ctx.fill();ctx.strokeStyle="rgba(255,255,255,.9)";ctx.lineWidth=.8;ctx.stroke();
  ctx.fillStyle="rgba(255,255,255,.85)";
  for(let i=1;i<=14;i++){const r=cr*.8*Math.sqrt(i/14),a=i*2.39996;ctx.beginPath();ctx.arc(Math.cos(a)*r,Math.sin(a)*r,.5,0,TAU);ctx.fill()}
}
function rose(R,o,t,near){
  const oo=Math.min(o,1.15);
  const layers=[{n:5,l:1,w:.6,off:0},{n:5,l:.8,w:.5,off:.63},{n:4,l:.58,w:.42,off:.25},{n:3,l:.36,w:.34,off:.9}];
  layers.forEach((ly,li)=>{
    for(let k=0;k<ly.n;k++){
      ctx.save();const a0=k/ly.n*TAU+ly.off;ctx.rotate(a0+pm(a0,1));
      const len=PLS*R*ly.l*(.35+.65*oo)*(1+near*.05*Math.sin(t*14+k+li));
      drawPetal(cupPath,len,R*ly.w*(.5+.5*oo)*.62,.9-li*.08,false,true);
      ctx.restore();
    }
  });
  ctx.beginPath();
  for(let a=0;a<PI*3.4;a+=.3){const r=R*(.03+a*.028)*(.4+.6*Math.min(oo,1)),x=Math.cos(a)*r,y=Math.sin(a)*r;a?ctx.lineTo(x,y):ctx.moveTo(x,y)}
  ctx.strokeStyle="rgba(255,255,255,.7)";ctx.lineWidth=.5;ctx.stroke();
}
function blossom(R,o,t,near){
  const oo=Math.min(o,1.15),L=R*(.3+.7*oo);
  for(let k=0;k<5;k++){
    ctx.save();const a0=k/5*TAU;ctx.rotate(a0+pm(a0,1.1));
    drawPetal(heartPath,L*PLS*(1+near*.06*Math.sin(t*15+k*2)),R*.5,1,true,false);
    ctx.restore();
  }
  const sl=R*.46*(.35+.65*Math.min(oo,1));
  ctx.strokeStyle="rgba(255,255,255,.75)";ctx.lineWidth=.45;
  for(let i=0;i<9;i++){
    const a=i/9*TAU+.2,sw=Math.sin(t*3+i)*.05*near;
    ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(Math.cos(a+sw)*sl,Math.sin(a+sw)*sl);ctx.stroke();
    ctx.beginPath();ctx.arc(Math.cos(a+sw)*sl,Math.sin(a+sw)*sl,.9,0,TAU);ctx.fillStyle="rgba(255,255,255,.95)";ctx.fill();
  }
  ctx.beginPath();ctx.arc(0,0,R*.12,0,TAU);ctx.fillStyle=BG;ctx.fill();ctx.strokeStyle="rgba(255,255,255,.9)";ctx.lineWidth=.6;ctx.stroke();
}
function cosmosPath(len,wid){
  ctx.moveTo(0,0);
  ctx.bezierCurveTo(wid*1.3,-len*.18,wid*1.65,-len*.72,wid*1.1,-len*.96);
  ctx.lineTo(wid*.55,-len*.86);ctx.lineTo(0,-len*.98);ctx.lineTo(-wid*.55,-len*.86);ctx.lineTo(-wid*1.1,-len*.96);
  ctx.bezierCurveTo(-wid*1.65,-len*.72,-wid*1.3,-len*.18,0,0);
}
/* dahlia: 5 rings of pointed petals; outer rings open first, inner rings unfurl a beat later */
function dahlia(R,o,t,near){
  const rings=[[13,1,.15],[11,.82,.14],[9,.64,.13],[7,.46,.12],[5,.3,.1]];
  rings.forEach((r,li)=>{
    const oi=clamp(o*1.35-li*.13,.04,1.15),n=r[0];
    for(let k=0;k<n;k++){
      ctx.save();const a0=k/n*TAU+li*.41;ctx.rotate(a0+pm(a0,1));
      const len=PLS*R*r[1]*(.3+.7*oi)*(1+near*.05*Math.sin(t*14+k+li));
      drawPetal(petalPath,len,R*r[2]*(.55+.45*oi),.95-li*.1,li<3,false);
      ctx.restore();
    }
  });
  ctx.beginPath();ctx.arc(0,0,R*.07*(.4+.6*Math.min(o,1))+.6,0,TAU);ctx.fillStyle="rgba(255,255,255,.85)";ctx.fill();
}
/* cosmos: two rows of 8 broad, tooth-tipped petals around a stamen disc */
function cosmos(R,o,t,near){
  const oo=Math.min(o,1.15);
  for(let row=0;row<2;row++){
    const n=8,L=R*(row?.8:1)*(.3+.7*oo);
    for(let k=0;k<n;k++){
      ctx.save();const a0=k/n*TAU+row*PI/n;ctx.rotate(a0+pm(a0,1));
      drawPetal(cosmosPath,L*PLS*(1+near*.06*Math.sin(t*15+k)),R*.27*(.6+.4*oo),row?.8:1,true,false);
      ctx.restore();
    }
  }
  const cr=R*.17*(.4+.6*Math.min(oo,1));
  ctx.beginPath();ctx.arc(0,0,cr,0,TAU);ctx.fillStyle=BG;ctx.fill();ctx.fillStyle="rgba(255,255,255,.22)";ctx.fill();
  ctx.strokeStyle="rgba(255,255,255,.9)";ctx.lineWidth=.7;ctx.stroke();
  ctx.fillStyle="rgba(255,255,255,.9)";
  for(let i=0;i<8;i++){const a=i/8*TAU;ctx.beginPath();ctx.arc(Math.cos(a)*cr*.62,Math.sin(a)*cr*.62,.45,0,TAU);ctx.fill()}
}

/* ---------------------------  more leaf designs  --------------------------- */
function paintLeaf(len,a){
  ctx.fillStyle=BG;ctx.fill();
  ctx.fillStyle=lgrad(len,a);ctx.fill();fold(len*.3);ctx.strokeStyle=`rgba(255,255,255,${.78*a})`;ctx.lineWidth=.6;ctx.stroke();
}
function veins(len,wid,a,n,spread){
  ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(len*.96,0);
  for(let i=1;i<=n;i++){const u=i/(n+1)*.8+.08,w=wid*spread*(1-u*.55);
    ctx.moveTo(len*u,0);ctx.lineTo(len*(u+.15),-w);ctx.moveTo(len*u,0);ctx.lineTo(len*(u+.15),w)}
  ctx.strokeStyle=`rgba(255,255,255,${.3*a})`;ctx.lineWidth=.4;ctx.stroke();
}
function leafKind(kind,x,y,ang,len,wid,a,t,ph){
  if(!kind||kind==="lance")return leaf(x,y,ang,len,wid,a,t,ph);
  ctx.save();ctx.translate(x,y);ctx.rotate(ang+Math.sin(t*2.1+ph)*.02);
  ctx.beginPath();
  if(kind==="round"){                       // eucalyptus-like round leaf
    ctx.moveTo(0,0);ctx.bezierCurveTo(len*.1,-wid*1.5,len*.92,-wid*1.5,len,0);ctx.bezierCurveTo(len*.92,wid*1.5,len*.1,wid*1.5,0,0);
    paintLeaf(len,a);veins(len,wid,a,3,1.1);
  }else if(kind==="heart"){                 // ivy / heart leaf
    ctx.moveTo(0,0);ctx.bezierCurveTo(-len*.12,-wid*1.5,len*.38,-wid*1.9,len*.58,-wid*1.0);ctx.bezierCurveTo(len*.76,-wid*.5,len*.92,-wid*.16,len,0);
    ctx.bezierCurveTo(len*.92,wid*.16,len*.76,wid*.5,len*.58,wid*1.0);ctx.bezierCurveTo(len*.38,wid*1.9,-len*.12,wid*1.5,0,0);
    paintLeaf(len,a);veins(len,wid,a,3,1.3);
  }else if(kind==="serrate"){               // toothed rose leaf
    const N=10;ctx.moveTo(0,0);
    for(let i=1;i<=N;i++){const u=i/N,w=wid*1.05*Math.sin(PI*Math.pow(u,.8))+(i%2||i===N?0:wid*.28)*(1-u*.4);ctx.lineTo(len*u,-w)}
    for(let i=N-1;i>=0;i--){const u=i/N,w=wid*1.05*Math.sin(PI*Math.pow(u,.8))+(i%2?0:wid*.28)*(1-u*.4);ctx.lineTo(len*u,w)}
    ctx.closePath();paintLeaf(len,a);veins(len,wid,a,4,.9);
  }else if(kind==="lobed"){                  // oak-like lobed leaf
    const N=34;ctx.moveTo(0,0);
    for(let i=1;i<=N;i++){const u=i/N;ctx.lineTo(len*u,-wid*1.25*Math.sin(PI*Math.pow(u,.8))*(.7+.3*Math.cos(u*TAU*3)))}
    for(let i=N-1;i>=0;i--){const u=i/N;ctx.lineTo(len*u,wid*1.25*Math.sin(PI*Math.pow(u,.8))*(.7+.3*Math.cos(u*TAU*3)))}
    ctx.closePath();paintLeaf(len,a);veins(len,wid,a,3,1.1);
  }else if(kind==="fan"){                    // ginkgo fan with a centre notch
    const ky=clamp(wid*1.7/len,.4,.9);ctx.moveTo(0,0);
    for(let i=0;i<=16;i++){const th=-.95+i*.11875,r=len*(1-.14*Math.exp(-th*th*60));ctx.lineTo(Math.cos(th)*r,Math.sin(th)*r*ky)}
    ctx.closePath();paintLeaf(len,a);
    ctx.beginPath();for(const th of[-.6,-.3,0,.3,.6]){ctx.moveTo(0,0);ctx.lineTo(Math.cos(th)*len*.92,Math.sin(th)*len*.92*ky)}
    ctx.strokeStyle=`rgba(255,255,255,${.3*a})`;ctx.lineWidth=.4;ctx.stroke();
  }else if(kind==="needle"){                 // rosemary-like spray of fine needles
    ctx.moveTo(0,0);ctx.lineTo(len,0);
    for(let i=0;i<9;i++){const u=.1+i*.1,l=len*.3*(1-u*.4);for(const s of[-1,1]){ctx.moveTo(len*u,0);ctx.lineTo(len*u+Math.cos(.7)*l,s*Math.sin(.7)*l)}}
    ctx.strokeStyle=`rgba(255,255,255,${.7*a})`;ctx.lineWidth=.55;ctx.stroke();
  }else if(kind==="trifoliate"){             // three leaflets on a short petiole
    ctx.moveTo(0,0);ctx.lineTo(len*.28,0);ctx.strokeStyle=`rgba(255,255,255,${.6*a})`;ctx.lineWidth=.5;ctx.stroke();
    for(const[an,l,w]of[[-.75,.55,.75],[0,.75,.85],[.75,.55,.75]]){
      ctx.save();ctx.translate(len*.28,0);ctx.rotate(an);const ll=len*l,ww=wid*w;
      ctx.beginPath();ctx.moveTo(0,0);ctx.bezierCurveTo(ll*.2,-ww*1.3,ll*.8,-ww*1.1,ll,0);ctx.bezierCurveTo(ll*.8,ww*1.1,ll*.2,ww*1.3,0,0);
      paintLeaf(ll,a);veins(ll,ww,a,2,1);ctx.restore();
    }
  }else{                                    // fern frond: rib + paired leaflets
    const n=6,dx=Math.cos(.95),dy=Math.sin(.95);
    for(let i=0;i<n;i++){
      const u=.12+.8*i/(n-1),l=len*.34*(1-u*.62),px=len*u;
      for(const s of[-1,1]){
        const ddy=dy*s,tx=px+dx*l,ty=ddy*l,mx=px+dx*l*.5,my=ddy*l*.5,qx=-ddy*l*.28,qy=dx*l*.28;
        ctx.moveTo(px,0);ctx.quadraticCurveTo(mx+qx,my+qy,tx,ty);ctx.quadraticCurveTo(mx-qx,my-qy,px,0);
      }
    }
    paintLeaf(len,a);
    ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(len,0);ctx.strokeStyle=`rgba(255,255,255,${.6*a})`;ctx.lineWidth=.5;ctx.stroke();
  }
  ctx.restore();
}

/* ---------------------------  more flower designs  --------------------------- */
/* every petal is its own little spring: idle flutter at its own speed, bends away from the pointer, shivers when the flower is kicked */
let CF=null,CDT=1,CT=0,PLS=1,PIDX=0;
function pm(a,g){
  const f=CF,i=PIDX++&63,t=CT;
  let tg=(Math.sin(t*(.7+((i*.6180339)%1)*1.1)+f.ph+i*1.9)*.045+Math.sin(t*.37+i*2.7)*.02)*g+f.bs*.8*Math.sin(i*2.399)*g;
  let sc=1+.025*Math.sin(t*(1.1+i*.13)+i*3.1)*g;
  if(f.lw>.003){
    const df=angDiff(Math.atan2(f.ly,f.lx)-(a-PI/2)),gs=Math.exp(-df*df*.9);
    tg+=-Math.sin(df)*gs*f.lw*.45*g;sc*=1-.06*gs*f.lw;
  }
  PLS=sc;
  const s=f.ps,v=f.pv;v[i]+=((tg-s[i])*.05-v[i]*.22)*CDT;s[i]+=v[i]*CDT;
  return s[i];
}
function lilyPath(len,wid){
  ctx.moveTo(0,0);
  ctx.bezierCurveTo(wid*.9,-len*.2,wid*1.5,-len*.62,wid*.35,-len*.96);
  ctx.quadraticCurveTo(0,-len*1.07,-wid*.35,-len*.96);
  ctx.bezierCurveTo(-wid*1.5,-len*.62,-wid*.9,-len*.2,0,0);
}
function lily(R,o,t,near){                  // 6 recurved speckled tepals + stamens with anthers
  const oo=Math.min(o,1.15),L=R*(.3+.7*oo),W2=R*.3*(.6+.4*oo);
  for(let ring=0;ring<2;ring++)for(let k=0;k<3;k++){
    ctx.save();const a0=k/3*TAU+ring*PI/3;ctx.rotate(a0+pm(a0,1));
    const ll=L*PLS*(ring?.9:1)*(1+near*.05*Math.sin(t*13+k));
    drawPetal(lilyPath,ll,W2*(ring?1.15:.95),ring?1:.88,true,false);
    ctx.fillStyle="rgba(255,255,255,.8)";
    for(let j=0;j<4;j++){ctx.beginPath();ctx.arc((j%2?1:-1)*W2*.18,-ll*(.18+j*.13),.5,0,TAU);ctx.fill()}
    ctx.restore();
  }
  const sl=R*.62*(.35+.65*Math.min(oo,1));
  for(let i=0;i<6;i++){
    const a=i/6*TAU+.3+Math.sin(t*1.6+i)*.05+near*.05*Math.sin(t*14+i),x=Math.cos(a)*sl,y=Math.sin(a)*sl;
    ctx.beginPath();ctx.moveTo(0,0);ctx.quadraticCurveTo(x*.4+y*.12,y*.4-x*.12,x,y);ctx.strokeStyle="rgba(255,255,255,.7)";ctx.lineWidth=.45;ctx.stroke();
    ctx.save();ctx.translate(x,y);ctx.rotate(a+PI/2);ctx.beginPath();ctx.ellipse(0,0,.8,1.9,0,0,TAU);ctx.fillStyle="rgba(255,255,255,.95)";ctx.fill();ctx.restore();
  }
  ctx.beginPath();ctx.arc(0,0,R*.06,0,TAU);ctx.fillStyle=BG;ctx.fill();
}
function ruffPath(len,wid){                 // scalloped, ruffled petal edge
  ctx.moveTo(0,0);
  ctx.bezierCurveTo(wid*1.2,-len*.1,wid*1.5,-len*.6,wid*1.05,-len*.88);
  ctx.quadraticCurveTo(wid*.8,-len*1.04,wid*.4,-len*.95);
  ctx.quadraticCurveTo(wid*.15,-len*1.07,0,-len*.97);
  ctx.quadraticCurveTo(-wid*.15,-len*1.07,-wid*.4,-len*.95);
  ctx.quadraticCurveTo(-wid*.8,-len*1.04,-wid*1.05,-len*.88);
  ctx.bezierCurveTo(-wid*1.5,-len*.6,-wid*1.2,-len*.1,0,0);
}
function peony(R,o,t,near){                 // 7 layers of ruffled petals, inner layers unfurl later
  const oo=Math.min(o,1.15);
  [[8,1,.52,0],[8,.88,.5,.39],[7,.74,.46,.2],[6,.6,.42,.6],[5,.46,.36,.1],[4,.32,.3,.9],[3,.2,.24,.4]].forEach((r,li)=>{
    const oi=clamp(oo*1.3-li*.1,.05,1.15),n=r[0];
    for(let k=0;k<n;k++){
      ctx.save();const a0=k/n*TAU+r[3];ctx.rotate(a0+pm(a0,1));
      drawPetal(ruffPath,PLS*R*r[1]*(.3+.7*oi)*(1+near*.05*Math.sin(t*14+k+li)),R*r[2]*(.55+.45*oi)*.6,.92-li*.05,li<4,false);
      ctx.restore();
    }
  });
}
function hydrangea(R,o,t,near){             // dome of 4-petal florets
  const g=.35+.65*Math.min(o,1),n=22;
  for(let i=n-1;i>=0;i--){
    const a=i*2.39996,r=R*.9*Math.sqrt((i+.5)/n)*g,x=Math.cos(a)*r,y=Math.sin(a)*r*.82-R*.1;
    const fr=R*(.2-.05*(i/n))*g,pr=fr*.56;
    ctx.save();ctx.translate(x,y);ctx.rotate(a+pm(a,1.4)+near*.05*Math.sin(t*12+i));
    ctx.beginPath();
    for(let p=0;p<4;p++){const aa=p*PI/2,cx=Math.cos(aa)*pr,cy=Math.sin(aa)*pr;ctx.moveTo(cx+pr,cy);ctx.arc(cx,cy,pr,0,TAU)}
    sh(1);ctx.fillStyle=BG;ctx.fill();sh(0);ctx.fillStyle=`rgba(255,255,255,${.12+.2*(i/n)})`;ctx.fill();
    ctx.strokeStyle="rgba(255,255,255,.8)";ctx.lineWidth=.5;ctx.stroke();
    ctx.beginPath();ctx.arc(0,0,Math.max(.3,fr*.16),0,TAU);ctx.fillStyle="rgba(255,255,255,.95)";ctx.fill();
    ctx.restore();
  }
}
function lavender(R,o,t,near){              // upright spike of paired florets, opens from the base up
  const g=clamp(Math.min(o,1.15),0,1),n=11,sp=R*.36;
  for(let i=0;i<n;i++){
    const u=i/(n-1),p=clamp(g*1.5-u*.7,0,1);if(p<=0)continue;
    const y=-(i+.5)*sp*(.35+.65*g),fl=R*(.52-.24*u)*p,tw=Math.sin(t*1.5+i*.5)*.06+near*.05*Math.sin(t*12+i);
    for(const s of[-1,1]){ctx.save();ctx.translate(0,y);ctx.rotate(s*(.75-.25*u)+tw+pm(s*(.75-.25*u),1.2));drawPetal(petalPath,fl*PLS,fl*.34,.9,false,false);ctx.restore()}
    ctx.beginPath();ctx.arc(0,y,.55*p,0,TAU);ctx.fillStyle="rgba(255,255,255,.9)";ctx.fill();
  }
  ctx.save();ctx.translate(0,-(n+.2)*sp*(.35+.65*g));drawPetal(petalPath,R*.3*g,R*.1,.9,false,false);ctx.restore();
}
function gyp(R,o,t,near){                   // baby's-breath: fine branching twigs with tiny blooms
  const g=clamp(Math.min(o,1.15),0,1);
  [[-1.15,.8],[-.68,1],[-.22,1.12],[.24,1.06],[.7,.95],[1.14,.78],[0,.62]].forEach(([a0,lf],i)=>{
    const L=R*lf*1.2*g,ang=a0+pm(a0,1.5)+near*.04*Math.sin(t*12+i);
    const ex=Math.sin(ang)*L,ey=-Math.cos(ang)*L,bx=ex*.58,by=ey*.58,ba=ang+(i%2?.7:-.7),bl=L*.42,cx=bx+Math.sin(ba)*bl,cy=by-Math.cos(ba)*bl;
    ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(ex,ey);ctx.moveTo(bx,by);ctx.lineTo(cx,cy);
    ctx.strokeStyle="rgba(255,255,255,.5)";ctx.lineWidth=.4;ctx.stroke();
    for(const[x,y,r]of[[ex,ey,R*.13],[cx,cy,R*.1],[bx,by,R*.08]]){
      ctx.beginPath();ctx.arc(x,y,r*g+.01,0,TAU);ctx.fillStyle=BG;ctx.fill();ctx.fillStyle="rgba(255,255,255,.28)";ctx.fill();
      ctx.strokeStyle="rgba(255,255,255,.85)";ctx.lineWidth=.5;ctx.stroke();
      ctx.beginPath();ctx.arc(x,y,r*.28*g,0,TAU);ctx.fillStyle="rgba(255,255,255,.95)";ctx.fill();
    }
  });
}
function tulip(R,o,t,near,bud){
  const oo=Math.min(o,1.15),len=R*1.7*(.55+.45*Math.min(oo,1)),sp=bud?.05:.1+.34*oo+near*.05*Math.sin(t*12);
  ctx.save();ctx.rotate(-sp+pm(-sp,.8));drawPetal(petalPath,len,R*.62,.8,true,false);ctx.restore();
  ctx.save();ctx.rotate(sp+pm(sp,.8));drawPetal(petalPath,len,R*.62,.8,true,false);ctx.restore();
  ctx.save();ctx.rotate(pm(0,.8));drawPetal(petalPath,len*1.04,R*.68,1,true,false);ctx.restore();
}
function drawFlower(f,t){
  if(f.bt<=.01)return;
  const sc=(.35+.65*clamp(f.open,0,1.2))*(reduce?1:1+.022*Math.sin(t*.9+f.ph))*(1+.07*f.near);   // the bloom leans out toward you
  if(f.type!=="lavender"&&f.type!=="gyp"){ctx.beginPath();ctx.arc(f.hx+2+3*f.near,f.hy+3.2+4*f.near,f.R*sc*.8,0,TAU);ctx.fillStyle=`rgba(0,0,0,${.32+.2*f.near})`;ctx.fill()}   // the head casts a shadow on what is behind it
  ctx.save();ctx.translate(f.hx,f.hy);
  const c=f.c;
  const rotA=c.th[c.n-1]+PI/2+f.look;
  ctx.rotate(rotA);
  ctx.scale(sc,sc);
  TX=f.tx||0;TY=f.ty||0;
  {const lc=Math.cos(-rotA),ls=Math.sin(-rotA),ltx=TX*lc-TY*ls,lty=TX*ls+TY*lc,tm=clamp(Math.hypot(TX,TY)/2.4+.5*f.near,0,1);
   if(tm>.01){const a3=Math.atan2(lty,ltx);ctx.rotate(a3);ctx.scale(1-.3*tm,1);ctx.rotate(-a3)}}   // head foreshortens toward the lean
  CF=f;PIDX=0;
  let lwt=0;
  if(pe>.01&&!reduce){                                       // pointer position in the flower's own coordinates
    const dx=sm.x-f.hx,dy=sm.y-f.hy,d=Math.hypot(dx,dy),infl=f.R*sc*1.5+22;
    if(d<infl){const q=1-d/infl,cs=Math.cos(-rotA),sn=Math.sin(-rotA);lwt=q*q*(3-2*q)*pe;f.lx=(dx*cs-dy*sn)/sc;f.ly=(dx*sn+dy*cs)/sc}
  }
  f.lw+=(lwt-f.lw)*(1-Math.exp(-CDT*.1));
  if(f.type==="dahlia")dahlia(f.R,f.open,t,f.near);
  else if(f.type==="lily")lily(f.R,f.open,t,f.near);
  else if(f.type==="peony")peony(f.R,f.open,t,f.near);
  else if(f.type==="hydrangea")hydrangea(f.R,f.open,t,f.near);
  else if(f.type==="lavender")lavender(f.R,f.open,t,f.near);
  else if(f.type==="gyp")gyp(f.R,f.open,t,f.near);
  else if(f.type==="cosmos")cosmos(f.R,f.open,t,f.near);
  else if(f.type==="daisy")daisy(f.R,f.open,t,f.near);
  else if(f.type==="rose")rose(f.R,f.open,t,f.near);
  else if(f.type==="blossom")blossom(f.R,f.open,t,f.near);
  else if(f.type==="tulip")tulip(f.R,f.open,t,f.near,false);
  else{ // bud: a closed tulip with two small sepals
    tulip(f.R,Math.min(f.open,1)*.3,t,0,true);
    ctx.save();ctx.rotate(-.5);drawPetal(petalPath,f.R*.9,f.R*.26,.7,false,false);ctx.restore();
    ctx.save();ctx.rotate(.5);drawPetal(petalPath,f.R*.9,f.R*.26,.7,false,false);ctx.restore();
  }
  if(f.type!=="lavender"&&f.type!=="gyp"){                     // soft specular glare on the light side of the bloom
    const cA=Math.cos(rotA),sA=Math.sin(rotA),gx=(LX*cA+LY*sA)*f.R*.35,gy=(-LX*sA+LY*cA)*f.R*.35,gr=f.R*.8;
    const hg=ctx.createRadialGradient(gx,gy,0,gx,gy,gr);hg.addColorStop(0,`rgba(255,255,255,${.16+.3*f.near})`);hg.addColorStop(1,"rgba(255,255,255,0)");
    ctx.fillStyle=hg;ctx.beginPath();ctx.arc(gx,gy,gr,0,TAU);ctx.fill();
  }
  ctx.restore();
}

/* ---------------------------  drawing: chains  --------------------------- */
function drawStem(c){                       // lit tube: shadow, body, specular line — drawn as a few polylines, not one stroke per segment
  ctx.lineCap="round";ctx.lineJoin="round";
  const m=Math.min(c.n,Math.ceil(c.ge*c.n-1e-6));if(m<=0)return;
  const cs=Math.max(2,Math.ceil(m/3));
  for(let pass=0;pass<3;pass++){
    ctx.strokeStyle=pass===0?"rgba(0,0,0,.5)":pass===1?"#7b7b80":"#ececef";
    for(let s=0;s<m;s+=cs){
      const e=Math.min(m,s+cs),w=lerp(c.w0,c.w1,(s+e)/2/c.n),o=pass===2?-w*.22:pass===0?1.3:0;
      ctx.beginPath();ctx.moveTo(c.px[s]+o,c.py[s]+o*1.3);
      for(let i=s+1;i<=e;i++)ctx.lineTo(c.px[i]+o,c.py[i]+o*1.3);
      ctx.lineWidth=pass===2?w*.4:pass===0?w+.8:w;ctx.stroke();
    }
  }
}
function drawLeaves(c,t,boost){
  for(const L of c.leaves){
    const g=clamp((c.ge-L.u)/.22,0,1); if(g<=0)continue;
    const p=pointAt(c,L.u), s=ease.back(g);
    const flut=Math.sin(t*1.7+L.ph)*.07*boost;
    let tg=0;
    if(pe>.01&&!reduce){const dx=sm.x-p.x,dy=sm.y-p.y,d=Math.hypot(dx,dy);
      if(d<46){const q=1-d/46,w=q*q*(3-2*q)*pe,df=angDiff(Math.atan2(dy,dx)-(p.th+L.side*L.ang));tg=-Math.sin(df)*w*.7+Math.sin(t*8+L.ph)*.04*w}}
    L.sv+=((tg-L.sa)*.06-L.sv*.2)*CDT;L.sa+=L.sv*CDT;
    const ang=p.th+L.side*L.ang+flut+L.sa;
    leafKind(L.kind,p.x,p.y,ang,L.len*s,L.wid*s,.9*Math.min(1,g*2),t,L.ph);
  }
}
function drawBerries(c,t){
  for(const b of c.berries){
    const g=clamp((c.ge-b.u)/.2,0,1); if(g<=0)continue;
    const p=pointAt(c,b.u),r=b.r*ease.back(g);
    ctx.beginPath();ctx.arc(p.x,p.y,r,0,TAU);ctx.fillStyle=BG;ctx.fill();
    ctx.strokeStyle="rgba(255,255,255,.85)";ctx.lineWidth=.6;ctx.stroke();
    ctx.beginPath();ctx.arc(p.x-r*.3,p.y-r*.3,r*.22,0,TAU);ctx.fillStyle="rgba(255,255,255,.8)";ctx.fill();
  }
}
function drawTendril(c){
  const g=clamp((c.ge-.9)/.1,0,1); if(g<=0)return;
  const x=c.px[c.n],y=c.py[c.n],ang=c.th[c.n-1],rad=4.2;
  const cx=x-Math.sin(ang)*rad,cyy=y+Math.cos(ang)*rad,a0=ang-PI/2;
  ctx.beginPath();
  for(let i=0;i<=34;i++){
    const u=i/34*g,a=a0+u*TAU*1.5,r=rad*(1-.78*u);
    const px=cx+Math.cos(a)*r,py=cyy+Math.sin(a)*r;i?ctx.lineTo(px,py):ctx.moveTo(px,py);
  }
  ctx.strokeStyle="rgba(255,255,255,.55)";ctx.lineWidth=.6;ctx.stroke();
}
function drawPetalFall(p){
  ctx.save();ctx.translate(p.x,p.y);ctx.rotate(p.rot);ctx.scale(1,Math.abs(Math.cos(p.flip))*.8+.2);
  ctx.globalAlpha=p.a;
  ctx.beginPath();petalPath(p.size,p.size*.42);
  ctx.fillStyle="rgba(255,255,255,.6)";ctx.fill();ctx.strokeStyle="rgba(255,255,255,.9)";ctx.lineWidth=.5;ctx.stroke();
  ctx.restore();
}

/* ---------------------------  events  --------------------------- */
function setPtr(e){
  const r=CR,x=e.clientX-r.left,y=e.clientY-r.top;
  const inside=x>-16&&x<W+4&&y>-18&&y<H+4;
  if(ptr.on&&inside){ptv.x=ptv.x*.6+(x-ptr.x)*.4;ptv.y=ptv.y*.6+(y-ptr.y)*.4}
  else{ptv.x=0;ptv.y=0}
  const was=ptr.on;ptr.x=x;ptr.y=y;ptr.on=inside;
  if(inside&&!was)onEnter();
}
function onEnter(){
  if(reduce||nowT-lastEnter<1.1)return;
  lastEnter=nowT;
  gust(ptr.x<W*.5?1:-1,.0014);
  flowers.forEach((f,i)=>{f.kickAt=nowT+i*.06+Math.abs(f.hx-ptr.x)*.0008;f.kickAmp=.02});
  const near=flowers.slice().sort((a,b)=>Math.hypot(a.hx-ptr.x,a.hy-ptr.y)-Math.hypot(b.hx-ptr.x,b.hy-ptr.y))[0];
  if(near&&near.bt>.6)spawnPollen(near.hx,near.hy,7,5);
}
on(side,"pointermove",setPtr);
on(side,"pointerleave",()=>{ptr.on=false;ptv.x=ptv.y=0});
on(side,"pointerdown",e=>{
  setPtr(e);if(!ptr.on||reduce)return;
  gust(Math.random()<.5?-1:1,.005);
  flowers.forEach((f,i)=>{f.kickAt=nowT+i*.04;f.kickAmp=.04});
  const open=flowers.filter(f=>f.bt>.6);
  for(let i=0;i<5&&open.length;i++)spawnPetal(open[Math.floor(Math.random()*open.length)],true);
  spawnPollen(ptr.x,ptr.y,14,10);
});

/* ---------------------------  butterfly  --------------------------- */
const fcv=refs.fly,fx=fcv.getContext("2d");
let VW=innerWidth,VH=innerHeight;
let SR=null,CR=null,EP=0,FD=1;                // cached layout rects (reading them every frame forces layout)
function fitFly(force){
  const r=side.getBoundingClientRect();CR=cv.getBoundingClientRect();EP++;
  if(!force&&SR&&r.left===SR.left&&r.top===SR.top&&r.width===SR.width&&r.height===SR.height)return;
  SR=r;VW=innerWidth;VH=innerHeight;FD=1;
  const s=fcv.style;s.width=r.width+"px";s.height=r.height+"px";   // the canvas covers only the sidebar → far fewer pixels
  fcv.width=Math.round(r.width*FD);fcv.height=Math.round(r.height*FD);
}
let rszQ=0;
fitFly(true);on(window,"resize",()=>fitFly(true));
const rsz=new ResizeObserver(()=>{if(!rszQ)rszQ=requestAnimationFrame(()=>{rszQ=0;if(!dead&&SR)fitFly(true)})});rsz.observe(side);
const mp={x:-999,y:-999,on:false,sp:0};
on(window,"pointermove",e=>{mp.sp=mp.on?Math.hypot(e.clientX-mp.x,e.clientY-mp.y):0;mp.x=e.clientX;mp.y=e.clientY;mp.on=true},{passive:true});
on(window,"pointerdown",e=>{mp.x=e.clientX;mp.y=e.clientY;mp.on=true});
on(window,"pointerup",e=>{if(e.pointerType!=="mouse")mp.on=false});
on(document.documentElement,"pointerleave",()=>{mp.on=false});
const angDiff=a=>{a%=TAU;if(a>PI)a-=TAU;if(a<-PI)a+=TAU;return a};

/* Flight modes — each movement has its own wing-beat recipe:
   θ(t)=mid+amp·sin(phase) is the wing elevation (0 = flat, ~1.4 = folded up over the back);
   the top-down width of a wing is |cos θ|, the hind wing lags the fore wing by `lag`. */
const MODES={
  cruise:{mid:.45,amp:.95,fq:7.2,lag:.45},     // level flight: full, easy beats
  climb: {mid:.62,amp:1.1,fq:8.8,lag:.5},      // going up: deeper, faster beats, wings held higher
  glide: {mid:.12,amp:.3,fq:4.2,lag:.4},       // going down: wings spread, short flutter bursts between glides
  hover: {mid:.78,amp:.5,fq:11,lag:.3},        // approaching a landing spot: quick shallow beats, legs out
  takeoff:{mid:.5,amp:1.2,fq:9.8,lag:.5},      // lift-off: big powerful strokes
  flee:  {mid:.5,amp:1.05,fq:12.5,lag:.5},     // startled: frantic
  land:  {mid:1.25,amp:.1,fq:3,lag:.2}         // touch-down: wings swing up and fold
};
const bf={st:"away",x:0,y:0,vx:0,vy:0,hd:-PI/2,ph:rnd(0,6),flap:0,wait:1e9,visits:0,tg:null,until:0,rest:0,dx:0,dy:-1,
  t0:0,born:0,landT:0,vis:0,z:1,dz:0,gl:1,legs:0,bank:0,pitch:0,mid:.45,amp:.9,fq:7,lag:.45};

/* places to land: flower heads + every icon of the sidebar */
const ICONS=".lb-head-ico, .lb-row .lb-ib, .lb-pin";
function bnd(){return{x0:SR.left+10,x1:SR.right-10,y0:SR.top+10,y1:SR.bottom-10}}   // the sidebar border = the butterfly's world
function tgPos(tg){
  let p;
  if(tg.f)p={x:CR.left+tg.f.hx+tg.ox,y:CR.top+tg.f.hy+tg.oy};
  else{if(tg.ep!==EP){const r=tg.el.getBoundingClientRect();tg.cx=r.left+r.width*.5;tg.cy=r.top+r.height*.5;tg.ep=EP}p={x:tg.cx+tg.ox,y:tg.cy+tg.oy}}
  const b=bnd();return{x:clamp(p.x,b.x0,b.x1),y:clamp(p.y,b.y0,b.y1)};
}
function pickTarget(ex){
  if(Math.random()<.45){
    const els=[...side.querySelectorAll(ICONS)].filter(e=>(!ex||ex.el!==e)&&e.offsetParent!==null);
    if(els.length)return{el:els[Math.floor(Math.random()*els.length)],f:null,ox:rnd(-3,5),oy:rnd(-4,1)};
  }
  const ok=flowers.filter(f=>(!ex||ex.f!==f)&&f.bt>.95&&!["bud","lavender","gyp"].includes(f.type)&&f.R>=8);
  if(!ok.length)return null;
  const f=ok[Math.floor(Math.random()*ok.length)];
  return{f,el:null,ox:rnd(-.25,.25)*f.R,oy:rnd(-.2,.1)*f.R};
}
function spawnBF(t){                      // always appears INSIDE the sidebar border, never from outside
  const tg=pickTarget(null);if(!tg)return false;
  const r=SR;
  bf.x=rnd(r.left+50,r.right-50);bf.y=r.top+rnd(50,150);
  bf.vx=rnd(-.4,.4);bf.vy=-.5;bf.hd=-PI/2+rnd(-.6,.6);bf.bank=0;bf.pitch=0;bf.gl=1;bf.legs=0;
  bf.z=1;bf.dz=0;bf.tg=tg;bf.st="fly";bf.t0=t;bf.born=t;bf.visits=2+(Math.random()<.5?1:0);return true;
}
function takeOff(t,st){if(bf.tg&&bf.tg.f)bf.tg.f.bv+=.05;bf.tg=null;bf.st=st;bf.t0=t}
function scare(t){                        // pointer came close: bolt away from it, upward, off-screen
  const a=Math.atan2(bf.y-mp.y,bf.x-mp.x);let dx=Math.cos(a),dy=Math.sin(a)-.2;{const q=SR;dx+=(q.left+q.width/2-bf.x)/q.width*1.2;dy+=(q.top+q.height*.6-bf.y)/q.height*.8}const l=Math.hypot(dx,dy)||1;   // bolt away, but turn inward — never toward the outside
  bf.dx=dx/l;bf.dy=dy/l;bf.vy-=1.2;takeOff(t,"flee");
}

/* realistic swallowtail-style wings (right wing; the left one is mirrored) */
const FW=new Path2D("M1 -1.6 C2.2 -9 9 -16.5 16.2 -19.2 C18.6 -20 19.8 -17.8 18.8 -14.6 C17.6 -10 15.4 -5.6 12 -2.8 C9.4 -.8 5 .3 1 .3Z");
const HW=new Path2D("M1 .3 C5.5 -1 11.5 -.6 15 2.6 C17.5 5.2 16.6 9.2 14.6 11.8 C13.7 13 14.2 16 13.3 19.2 C12.5 20 11.4 19 11.3 17.2 C11 14 10 12.6 8.4 11.6 C5.4 9.6 2.4 6.4 1 2.6Z");
const VNF=new Path2D("M1.4 -1.2 L16.2 -17.4 M1.4 -1 L18.2 -13.2 M1.4 -.6 L16.6 -8.6 M1.4 -.2 L12.6 -3.6 M1.6 -1.4 L7.6 -12.4");
const VNH=new Path2D("M1.4 .8 L14 3.4 M1.4 1.2 L15.4 8.6 M1.6 1.8 L12.4 15 M1.6 2 L7 11");
const DOTF=[[16.6,-16.4],[18,-12.8],[16.8,-8.8],[14.6,-5.2],[11.4,-3.4]],DOTH=[[14.4,4],[15.6,8],[13.6,11.4],[12.4,16]];
const wgr=fx.createRadialGradient(1,0,0,1,0,21);
wgr.addColorStop(0,"rgba(255,255,255,.06)");wgr.addColorStop(.5,"rgba(255,255,255,.18)");wgr.addColorStop(1,"rgba(255,255,255,.46)");
const sheen=fx.createLinearGradient(0,-20,16,6);sheen.addColorStop(0,"rgba(255,255,255,.24)");sheen.addColorStop(.45,"rgba(255,255,255,0)");sheen.addColorStop(1,"rgba(0,0,0,.3)");   // light across the wing surface
/* wing elevation θ(phase): quick power downstroke, slower upstroke (0 = flat, ~1.4 = folded up over the back) */
const wf=p=>Math.sin(p)-.2*Math.sin(2*p);
const thv=p=>clamp(bf.mid+bf.amp*bf.gl*wf(p),-.45,1.38);
function wingPaint(path,vn,dots){
  fx.save();fx.translate(.7,.9);fx.fillStyle="rgba(255,255,255,.16)";fx.fill(path);fx.restore();   // wing thickness
  fx.fillStyle="#0d0d0e";fx.fill(path);fx.fillStyle=wgr;fx.fill(path);fx.fillStyle=sheen;fx.fill(path);
  fx.save();fx.clip(path);fx.lineWidth=5.2;fx.strokeStyle="rgba(255,255,255,.2)";fx.stroke(path);fx.restore();   // darker margin band
  fx.strokeStyle="rgba(255,255,255,.3)";fx.lineWidth=.5;fx.stroke(vn);                                              // veins
  fx.fillStyle="rgba(255,255,255,.85)";for(const d of dots){fx.beginPath();fx.arc(d[0],d[1],.95,0,TAU);fx.fill()}  // margin spots
  fx.strokeStyle="rgba(255,255,255,.14)";fx.lineWidth=2.6;fx.stroke(path);fx.strokeStyle="rgba(255,255,255,.9)";fx.lineWidth=.8;fx.stroke(path);
}
/* a flexible wing: the root and the tip are drawn with their own foreshortening, the tip lags behind (like a real wing bending in the air) */
function wingDraw(path,vn,dots,sIn,sOut,seam,side,a){
  fx.save();fx.scale(side,1);fx.globalAlpha=a*bf.vis;
  fx.save();fx.scale(sIn,1);fx.beginPath();fx.rect(-2,-30,seam+2.6,60);fx.clip();wingPaint(path,vn,dots);fx.restore();
  fx.save();fx.translate(seam*(sIn-sOut),0);fx.scale(sOut,1);fx.beginPath();fx.rect(seam,-30,40,60);fx.clip();wingPaint(path,vn,dots);fx.restore();
  fx.restore();
}
function wingGhost(path,sx,side,a){                        // motion-blur trail of the previous instant
  fx.save();fx.scale(side*sx,1);fx.globalAlpha=a*bf.vis;fx.fillStyle=wgr;fx.fill(path);
  fx.strokeStyle="rgba(255,255,255,.6)";fx.lineWidth=.6;fx.stroke(path);fx.restore();
}
function ball(x,y,rx,ry,c0,c1){const g=fx.createRadialGradient(x-rx*.45,y-ry*.5,0,x,y,Math.max(rx,ry)*1.2);g.addColorStop(0,c0);g.addColorStop(1,c1);fx.fillStyle=g;fx.beginPath();fx.ellipse(x,y,rx,ry,0,0,TAU);fx.fill()}
function drawBF(t,dt){
  bf.vis=clamp(1-bf.z,0,1)*(.86+.14*clamp((bf.dz+.6)/1.2,0,1));bf.drawn=true;
  const dep=(1+bf.dz*.42)*(1-bf.z*.6),S=.8*dep*(.55+.45*ease.out3(bf.vis)),ph=bf.flap,step=bf.fq*TAU/60*dt,flap=bf.fq>1.5;
  const fIn=thv(ph),fOut=thv(ph-.6),hIn=thv(ph-bf.lag),hOut=thv(ph-bf.lag-.5);
  const sweep=bf.fq>1?.14*Math.cos(ph):0,blur=step>.22?clamp((step-.22)*1.6,0,.34):0;
  const rot=bf.hd+PI/2+(flap?.03*Math.sin(ph):0);
  {                                                         // soft shadow on the sidebar surface: closer to the viewer = further + fainter
    const hg=clamp(.6+bf.dz*.9,.15,1.5),k=clamp(Math.abs(Math.cos(fIn)),.07,1);
    fx.save();fx.translate(bf.x+7*hg,bf.y+12*hg);fx.rotate(rot);fx.scale(S*(1-.1*hg),S*(1-.1*hg));
    fx.globalAlpha=.26*bf.vis/(1+hg*.6);fx.fillStyle="#000";
    for(const s of[-1,1]){fx.save();fx.scale(s*k,1);fx.fill(FW);fx.fill(HW);fx.restore()}
    fx.restore();
  }
  fx.save();fx.translate(bf.x,bf.y);fx.rotate(rot);fx.scale(S,S);
  fx.transform(1,0,-bf.bank*.34,1,0,0);                       // banking leans the body in perspective
  for(const side of[-1,1]){
    const bk=1-side*bf.bank*.6,cw=x=>clamp(Math.abs(Math.cos(x))*bk,.07,1.05);
    if(blur>0){const gp=ph-step*.7;wingGhost(HW,cw(thv(gp-bf.lag)),side,blur);wingGhost(FW,cw(thv(gp)),side,blur)}
    const fw=clamp(1-.45*side*bf.bank,.45,1.15),aH=(.55+.45*(1-clamp(hIn/1.3,0,1)))*fw,aF=(.55+.45*(1-clamp(fIn/1.3,0,1)))*fw;   // the wing on the far side of a bank is darker
    fx.save();fx.rotate(side*sweep);fx.scale(1,1+side*bf.bank*.1);   // near wing a bit larger (perspective)
    wingDraw(HW,VNH,DOTH,cw(hIn),cw(hOut),7.5,side,aH);
    wingDraw(FW,VNF,DOTF,cw(fIn),cw(fOut),8.5,side,aF);
    fx.restore();
  }
  fx.globalAlpha=bf.vis;
  fx.save();fx.scale(1,(1-Math.abs(bf.pitch)*.5)*(1+(flap?.03*Math.cos(ph):0)));
  fx.save();fx.translate(0,1.5);fx.rotate(.07*Math.sin(ph-1)*(flap?1:.2));
  ball(0,7.5,1.3,8,"#ffffff","#74747b");                     // abdomen, lit like a small cylinder
  fx.strokeStyle="rgba(13,13,14,.55)";fx.lineWidth=.45;fx.beginPath();
  for(let i=0;i<6;i++){const y=2.1+i*1.9;fx.moveTo(-1.2,y);fx.lineTo(1.2,y)}fx.stroke();
  fx.restore();
  ball(0,-.6,2,3.2,"#ffffff","#8c8c93");                     // thorax
  ball(0,-4.7,1.55,1.55,"#ffffff","#8c8c93");                // head
  fx.fillStyle="#0d0d0e";fx.beginPath();fx.arc(-.75,-5,.45,0,TAU);fx.fill();fx.beginPath();fx.arc(.75,-5,.45,0,TAU);fx.fill();
  const tw=Math.sin(t*4.3+bf.ph)*.4;
  fx.strokeStyle="rgba(255,255,255,.9)";fx.lineWidth=.55;fx.beginPath();
  fx.moveTo(-.6,-5.9);fx.quadraticCurveTo(-2.2,-10.4,-4.8+tw,-12.8);fx.moveTo(.6,-5.9);fx.quadraticCurveTo(2.2,-10.4,4.8-tw,-12.8);fx.stroke();
  fx.fillStyle="#f6f6f8";fx.beginPath();fx.arc(-4.8+tw,-12.9,.8,0,TAU);fx.fill();fx.beginPath();fx.arc(4.8-tw,-12.9,.8,0,TAU);fx.fill();
  if(bf.legs>.05){
    fx.strokeStyle=`rgba(255,255,255,${.7*bf.legs})`;fx.lineWidth=.5;fx.beginPath();
    for(const s of[-1,1])for(let j=0;j<3;j++){const y=-1.6+j*1.3;fx.moveTo(s,y);fx.lineTo(s*(3.4+j*.8),y+(j-1)*2.4+1)}
    fx.stroke();
  }
  fx.restore();fx.restore();
}
function butterfly(t,dt){                   // everything the butterfly does is clipped to the sidebar's rounded border
  const r=SR;
  fx.setTransform(FD,0,0,FD,-r.left*FD,-r.top*FD);
  if(bf.drawn||bf.st!=="away")fx.clearRect(r.left-2,r.top-2,r.width+4,r.height+4);
  bf.drawn=false;
  if(reduce)return;
  fx.save();fx.beginPath();
  if(fx.roundRect)fx.roundRect(r.left+1,r.top+1,r.width-2,r.height-2,17);else fx.rect(r.left+1,r.top+1,r.width-2,r.height-2);
  fx.clip();butterflyStep(t,dt);fx.restore();
}
function butterflyStep(t,dt){
  if(bf.st==="away"){
    if(t>bf.wait&&flowers.filter(f=>f.bt>.95).length>3&&!spawnBF(t))bf.wait=t+2;
    if(bf.st==="away")return;
  }
  if(bf.st==="fly"||bf.st==="perch")bf.z=Math.max(0,bf.z-dt*.016);   // emerges out of the depth of the screen, already inside the border
  const k=1-Math.exp(-dt*.09);
  if(mp.on&&bf.st!=="flee"){
    const rr=(bf.st==="perch"&&bf.tg&&bf.tg.el?44:58)+Math.min(mp.sp,40)*.9;
    if(Math.hypot(mp.x-bf.x,mp.y-bf.y)<rr)scare(t);
  }
  let dist=999;
  if(bf.st==="fly"){
    const h=tgPos(bf.tg),dx=h.x-bf.x,dy=h.y-bf.y;dist=Math.hypot(dx,dy)||1;
    const wob=(.55*Math.sin(t*2.7+bf.ph)+.3*Math.sin(t*5.3+bf.ph*2.1))*clamp(dist/170,0,1),ca=Math.cos(wob),sa=Math.sin(wob);   // lazy S-curves
    const ux=(dx*ca-dy*sa)/dist,uy=(dx*sa+dy*ca)/dist,sp=clamp(dist*.035+.2,.2,2.0)*(.72+.5*Math.max(0,Math.sin(bf.flap+1)));   // thrust pulses with each wing beat
    bf.vx+=(ux*sp-bf.vx)*k;bf.vy+=(uy*sp-bf.vy)*k;
    bf.x+=bf.vx*dt;bf.y+=bf.vy*dt+Math.cos(bf.flap)*.55*dt*clamp(dist/50,0,1);                    // bob with each wing beat
    if(dist<5){bf.st="perch";bf.landT=t;bf.until=t+rnd(5.5,9.5);bf.rest=-PI/2+rnd(-.8,.8);if(bf.tg.f)bf.tg.f.bv+=.04}
  }else if(bf.st==="perch"){
    const h=tgPos(bf.tg),e=1-Math.exp(-dt*.16);
    bf.x+=(h.x-bf.x)*e;bf.y+=(h.y-bf.y)*e;bf.vx*=.8;bf.vy*=.8;
    if(t>bf.until){
      const nx=--bf.visits>0?pickTarget(bf.tg):null;
      if(nx){if(bf.tg.f)bf.tg.f.bv+=.04;bf.tg=nx;bf.st="fly";bf.t0=t;bf.vy-=1.4}
      else{const ax=rnd(-.3,1),ay=-rnd(.5,1),l=Math.hypot(ax,ay);bf.dx=ax/l;bf.dy=ay/l;bf.vy-=1.4;takeOff(t,"leave")}
    }
  }else{                                       // leave | flee
    const fast=bf.st==="flee",age=t-bf.t0;
    const sp=fast?Math.min(6.5,2+age*16):Math.min(2.6,.8+age*1.4);
    const wob=(fast?.5:.28)*Math.sin(t*(fast?10:3.2)+bf.ph),ca=Math.cos(wob),sa=Math.sin(wob);
    const ux=bf.dx*ca-bf.dy*sa,uy=bf.dx*sa+bf.dy*ca,kk=fast?.2:k;
    bf.vx+=(ux*sp-bf.vx)*kk;bf.vy+=(uy*sp-bf.vy)*kk;bf.x+=bf.vx*dt;bf.y+=bf.vy*dt;
    bf.z=Math.min(1,bf.z+dt*(fast?.017:.007));   // leaving = diving into the depth (smaller, fainter) — never out through the border
    if(bf.z>=1){bf.st="away";bf.wait=t+(fast?rnd(9,15):rnd(10,18));return}
  }
  {                                                           // hard + soft walls: the butterfly lives strictly inside the sidebar
    const b=bnd(),zn=26;if(bf.st==="fly"){bf.vx+=Math.sin(t*1.3+bf.ph*2)*.012*dt;bf.vy+=Math.cos(t*1.1+bf.ph)*.01*dt}   // air currents
    bf.vx+=(clamp((b.x0+zn-bf.x)/zn,0,1)-clamp((bf.x-(b.x1-zn))/zn,0,1))*.1*dt;
    bf.vy+=(clamp((b.y0+zn-bf.y)/zn,0,1)-clamp((bf.y-(b.y1-zn))/zn,0,1))*.1*dt;
    if(bf.x<b.x0){bf.x=b.x0;bf.vx=Math.abs(bf.vx)*.3}if(bf.x>b.x1){bf.x=b.x1;bf.vx=-Math.abs(bf.vx)*.3}
    if(bf.y<b.y0){bf.y=b.y0;bf.vy=Math.abs(bf.vy)*.3}if(bf.y>b.y1){bf.y=b.y1;bf.vy=-Math.abs(bf.vy)*.3}
  }
  /* heading, banking, pitch */
  const sp2=Math.hypot(bf.vx,bf.vy),perch=bf.st==="perch";
  let dh=0;
  if(perch)dh=angDiff(bf.rest-bf.hd)*(1-Math.exp(-dt*.08));
  else if(sp2>.25)dh=angDiff(Math.atan2(bf.vy,bf.vx)-bf.hd)*(1-Math.exp(-dt*.1));
  bf.hd+=dh;
  bf.bank+=((perch?0:clamp(dh/dt*40,-1,1))-bf.bank)*(1-Math.exp(-dt*.12));
  bf.pitch+=((perch?0:clamp(bf.vy*.16,-.45,.45))-bf.pitch)*(1-Math.exp(-dt*.1));
  /* depth: climbing or turning hard swings it toward the viewer (bigger), diving moves it away (smaller) */
  bf.dz+=((perch?0:clamp(-bf.vy*.35+Math.abs(dh/dt)*6-.1+.3*Math.sin(t*.8+bf.ph*1.7),-.6,.9))-bf.dz)*(1-Math.exp(-dt*.05));
  /* which wing-beat recipe fits this movement? */
  const age=t-bf.t0;let mode="cruise";
  if(perch)mode=(t-bf.landT<.9)?"land":"rest";
  else if(bf.st==="flee")mode="flee";
  else if(age<.7)mode="takeoff";
  else if(bf.st==="fly"&&dist<34)mode="hover";
  else if(bf.vy<-.55)mode="climb";
  else if(bf.vy>.55)mode="glide";
  const pulse=.5+.5*Math.sin(t*1.1+bf.ph);
  const M=mode==="rest"?{mid:1.36-.95*pulse*pulse*pulse,amp:.04,fq:0,lag:.2}:MODES[mode];
  const kk=1-Math.exp(-dt*(perch?.14:.09));
  bf.mid+=(M.mid-bf.mid)*kk;bf.amp+=(M.amp-bf.amp)*kk;bf.fq+=(M.fq-bf.fq)*kk;bf.lag+=(M.lag-bf.lag)*kk;
  bf.gl+=((mode==="glide"?.3+.7*(.5+.5*Math.sin(t*2.2+bf.ph)):1)-bf.gl)*(1-Math.exp(-dt*.1));
  bf.flap+=dt*bf.fq*TAU/60;
  bf.legs+=((perch||mode==="hover"?1:0)-bf.legs)*(1-Math.exp(-dt*.1));
  drawBF(t,dt);
}

/* ---------------------------  frame loop  --------------------------- */
let last=0,nextDrop=0,nextGust=0,FC=0,MG=null;
function edgeFade(){                          // soft corner fade painted once on the canvas (replaces the per-frame CSS mask)
  if(!MG){MG=ctx.createRadialGradient(0,0,0,0,0,1);MG.addColorStop(0,"#000");MG.addColorStop(.72,"#000");MG.addColorStop(1,"rgba(0,0,0,.72)")}
  ctx.save();ctx.globalCompositeOperation="destination-in";ctx.translate(W,H);ctx.scale(1.12*W,1.08*H);ctx.fillStyle=MG;ctx.fillRect(-1,-1,1,1);ctx.restore();
}
let running=false,active=false,half=false,slow=0,fast=0,skip=0;
let lastRun=0,lastPaint=0;
const awake=()=>!document.hidden&&document.hasFocus();
function kick(){if(active&&!running&&!dead&&awake()){running=true;last=0;lastRun=0;requestAnimationFrame(frame)}}
on(window,"focus",kick);on(document,"visibilitychange",kick);
function frame(ms){
  if(dead||!active||!awake()){running=false;last=0;return}
  // ~30 fps is plenty for slow-swaying flowers and halves the work on every machine (60 Hz → 30 fps)
  if(lastRun&&ms-lastRun<30){requestAnimationFrame(frame);return}
  lastRun=ms;
  const w0=performance.now();
  if(++FC%30===0)fitFly();
  const t=ms/1000,dt=last?clamp((ms-last)/16.667,.2,3):1;last=ms;nowT=t;
  if(!T0){T0=t+.25;build();nextDrop=t+5;bf.wait=t+5.5}
  excite+=((ptr.on?1:0)-excite)*(1-Math.exp(-dt*.06));
  if(ptr.on){
    if(!sm.on){sm.x=ptr.x;sm.y=ptr.y;sm.on=true}
    const e=1-Math.exp(-dt*.2),px=sm.x,py=sm.y;sm.x+=(ptr.x-sm.x)*e;sm.y+=(ptr.y-sm.y)*e;
    sm.vx+=((sm.x-px)/dt-sm.vx)*.2;sm.vy+=((sm.y-py)/dt-sm.vy)*.2;
  }else{sm.on=false;sm.vx*=.9;sm.vy*=.9}
  pe+=((ptr.on?1:0)-pe)*(1-Math.exp(-dt*.07));
  CDT=dt;CT=t;
  collide();
  chains.forEach(c=>{updateChain(c,dt,t)});
  flowers.forEach(f=>{if(!f.c)f.c=chains.find(c=>c.flower===f);updateFlower(f,f.c,dt,t)});
  if(!reduce&&t>nextGust){if(nextGust)gust(Math.random()<.65?1:-1,.0016);nextGust=t+rnd(6,11)}   // ambient breeze
  if(!reduce&&t>nextDrop){
    const open=flowers.filter(f=>f.bt>.9);
    if(open.length)spawnPetal(open[Math.floor(Math.random()*open.length)],false);
    if(open.length&&Math.random()<.6)spawnPollen(open[0].hx,open[0].hy,2,6);
    nextDrop=t+rnd(4.5,8);
  }
  for(let i=petals.length-1;i>=0;i--){
    const p=petals[i];p.life+=dt;
    p.vy=Math.min(.42,p.vy+.012*dt);p.vx+=(Math.sin(t*2.4+p.ph)*.012-p.vx*.02)*dt;
    if(pe>.05){const dx=p.x-sm.x,dy=p.y-sm.y,d=Math.hypot(dx,dy);if(d<26&&d>0){p.vx+=dx/d*.05*dt;p.vy+=dy/d*.05*dt}}
    p.x+=p.vx*dt;p.y+=p.vy*dt;p.rot+=p.vr*dt;p.flip+=.07*dt;
    if(p.y>H+8||p.x<-10||p.x>W+10){petals.splice(i,1)}
  }
  for(let i=pollen.length-1;i>=0;i--){
    const p=pollen[i];p.x+=(p.vx+Math.sin(t*2+p.ph)*.12)*dt;p.y+=p.vy*dt;p.a-=.006*dt;
    if(p.a<=0||p.y<-6)pollen.splice(i,1);
  }

  // The flowers are the heavy part to draw and sway slowly: when frames get expensive they are redrawn every other
  // frame (the physics above still runs every frame, so the motion is the same), while the butterfly stays at full rate.
  const paint=ms-lastPaint>=(half||root.classList.contains("perf-lite")?110:55);if(paint)lastPaint=ms;   // flowers repaint at ~18 fps (~9 fps when frames run long); the butterfly keeps the full loop rate
  const boost=reduce?0:1+.4*excite;let ci=0;
  if(paint){
  ctx.clearRect(0,0,W,H);
  for(const c of chains){
    if(c.tendril)continue;                                  // vines come last
    // atmospheric depth: every layer drawn after this one sits in front, so what is behind dims a touch
    if(++ci%3===0){ctx.save();ctx.globalCompositeOperation="source-atop";ctx.fillStyle="rgba(13,13,14,.03)";ctx.fillRect(0,0,W,H);ctx.restore()}
    drawStem(c);drawLeaves(c,t,boost);
    if(c.flower)drawFlower(c.flower,t);
  }
  for(const c of chains){
    if(!c.tendril)continue;
    drawStem(c);drawLeaves(c,t,boost);drawBerries(c,t);drawTendril(c);
  }
  for(const p of pollen){
    ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,TAU);ctx.fillStyle=`rgba(255,255,255,${p.a*.9})`;ctx.fill();
    ctx.beginPath();ctx.arc(p.x,p.y,p.r*2.6,0,TAU);ctx.fillStyle=`rgba(255,255,255,${p.a*.12})`;ctx.fill();
  }
  for(const p of petals)drawPetalFall(p);
  edgeFade();
  }
  butterfly(t,dt);
  const cost=performance.now()-w0;
  if(!paint){requestAnimationFrame(frame);return}   // only frames that repainted the flowers say how heavy they are
  if(!half){if(cost>6){if(++slow>20){half=true;slow=0;fast=0}}else slow=Math.max(0,slow-1)}
  else{if(cost<4.5){if(++fast>240){half=false;fast=0;slow=0}}else fast=Math.max(0,fast-1)}
  requestAnimationFrame(frame);
}
function setActive(v){
  active=!!v;
  kick()
}
  return {
    setActive,
    dispose() {
      dead = true;
      mo.disconnect();
      rsz.disconnect();
      offs.forEach((f) => f());
    },
  };
}
