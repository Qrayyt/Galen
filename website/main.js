const canvas=document.getElementById('waves'),ctx=canvas.getContext('2d');
const motion=window.matchMedia('(prefers-reduced-motion: reduce)');
let w=0,h=0,dpr=1,points=[],frame=0;
function resize(){
 w=canvas.clientWidth; h=canvas.clientHeight; dpr=Math.min(devicePixelRatio||1,2);
 canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);
 const mobile=w<760,cols=mobile?34:55,rows=mobile?24:34;points=[];
 for(const side of [-1,1])for(let j=0;j<rows;j++)for(let i=0;i<cols;i++){
  const t=j/(rows-1),u=i/(cols-1),edge=1-u,ridge=Math.pow(edge,2.2);
  const x=w/2+side*w*(.07+.48*edge+.035*Math.sin(t*3.3+u*4));
  const y=h*(.87-.46*ridge+.025*Math.sin(u*8+t*3+side*.3)+t*(.13+.34*ridge));
  const fade=Math.pow(edge,1.45)*Math.min(1,(1-t)*5),size=(.35+2.9*Math.pow(edge,1.5))*(mobile?.7:1);
  points.push({x,y,size,side,phase:u*7+t*2.7,amp:(mobile?7:13)*(.3+.7*edge),color:`rgba(10,10,10,${Math.max(0,fade)})`});
 }
 draw(performance.now());
}
function draw(now){
 ctx.clearRect(0,0,w,h);const time=now*.00085;
 for(const p of points){
  const dy=motion.matches?0:p.amp*Math.sin(p.phase-time+p.side*.35);
  const dx=motion.matches?0:p.side*p.amp*.22*Math.cos(p.phase-time);
  ctx.fillStyle=p.color;ctx.fillRect(p.x+dx-p.size/2,p.y+dy-p.size/2,p.size,p.size);
 }
}
function tick(now){frame=0;draw(now);if(!motion.matches&&!document.hidden)frame=requestAnimationFrame(tick);}
function sync(){if(frame)cancelAnimationFrame(frame);frame=0;draw(performance.now());if(!motion.matches&&!document.hidden)frame=requestAnimationFrame(tick);}
window.addEventListener('resize',resize);motion.addEventListener('change',sync);document.addEventListener('visibilitychange',sync);resize();sync();
const platform=navigator.userAgentData?.platform||navigator.platform||'';const os=/mac/i.test(platform)?'macOS':/linux/i.test(platform)&&!/android/i.test(navigator.userAgent)?'Linux':'Windows';document.getElementById('download-label').textContent='Скачать для '+os;if(os!=='Windows')document.querySelector('.os-icon').style.display='none';
const network=document.getElementById('network');
const brands=['github','gmail','googledrive','figma','openai','googlegemini','claude','openrouter'];
const logos=brands.map(name=>({name,url:`https://raw.githubusercontent.com/simple-icons/simple-icons/${name==='openai'?'11.15.0':'develop'}/icons/${name}.svg`}));
const layer=network.querySelector('.network-particles'),hub=network.querySelector('.network-hub');
let particles=[],networkFrame=0,networkVisible=false,lastSpawn=0,lastFrame=0,bag=[],hover=false,boostUntil=0;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function nextLogo(){
 const active=new Set(particles.map(p=>p.name));
 if(!bag.some(x=>!active.has(x.name)))bag=logos.filter(x=>!active.has(x.name)).map(x=>({...x}));
 const available=bag.filter(x=>!active.has(x.name));
 if(!available.length)return null;
 const logo=available[Math.floor(Math.random()*available.length)];bag=bag.filter(x=>x.name!==logo.name);return logo;
}
function spawn(progress=0){
 const logo=nextLogo();if(!logo)return;
 const theta=Math.random()*Math.PI*2,r=.78+Math.random()*.19;
 const el=document.createElement('img');el.className='network-particle';el.alt='';el.src=logo.url;el.decoding='async';
 el.addEventListener('error',()=>{el.remove();particles=particles.filter(p=>p.el!==el);},{once:true});
 layer.append(el);particles.push({el,name:logo.name,theta,r,progress,duration:5900+Math.random()*1600});
}
function clearParticles(){particles.forEach(p=>p.el.remove());particles=[];}
function smooth(t){t=clamp(t,0,1);return t*t*(3-2*t);}
function networkDraw(now){
 networkFrame=0;const dt=lastFrame?Math.min(now-lastFrame,50):0;lastFrame=now;
 const boosted=now<boostUntil,speed=boosted?1.8:hover?1.35:1;
 const width=network.clientWidth,height=network.clientHeight,cx=width/2,cy=height/2;
 const hw=hub.offsetWidth/2,hh=hub.offsetHeight/2;
 const limit=width<600?4:6;
 if(now-lastSpawn>(boosted?650:1200)&&particles.length<limit){spawn();lastSpawn=now;}
 particles=particles.filter(p=>{
  p.progress+=dt*speed/p.duration;const t=p.progress;
  if(t>=1){p.el.remove();return false;}
  const ux=Math.cos(p.theta),uy=Math.sin(p.theta);
  const half=p.el.offsetWidth/2;
  const dx=ux*Math.max(1,cx-half-12)*p.r,dy=uy*Math.max(1,cy-half-12)*p.r;
  const distance=Math.hypot(dx,dy);
  const safe=Math.min(distance,Math.min((hw+half+8)/Math.max(Math.abs(dx/distance),.0001),(hh+half+8)/Math.max(Math.abs(dy/distance),.0001)));
  const end=Math.min(1,safe/Math.max(distance,1));
  const travel=smooth((t-.10)/.90);
  const ratio=1-(1-end)*travel;
  const alpha=smooth(t/.16)*(1-smooth((t-.62)/.38));
  p.el.style.opacity=String(alpha);
  p.el.style.transform=`translate(${cx+dx*ratio}px,${cy+dy*ratio}px) translate(-50%,-50%) scale(${1-.68*travel})`;
  return true;
 });
 if(networkVisible&&!document.hidden&&!motion.matches)networkFrame=requestAnimationFrame(networkDraw);
}
function networkSync(){
 if(networkFrame)cancelAnimationFrame(networkFrame);networkFrame=0;clearParticles();lastFrame=0;hover=false;boostUntil=0;
 if(!networkVisible||document.hidden)return;
 if(motion.matches){
  logos.slice(0,6).forEach((logo,i)=>{const el=document.createElement('img');el.src=logo.url;el.alt='';el.className='network-particle';el.style.left=(50+39*Math.cos(i*Math.PI/3))+'%';el.style.top=(50+38*Math.sin(i*Math.PI/3))+'%';el.style.transform='translate(-50%,-50%)';el.style.opacity='1';layer.append(el);particles.push({el,name:logo.name});});return;
 }
 for(let i=0;i<3;i++)spawn(.12+i*.19);
 lastSpawn=performance.now();networkFrame=requestAnimationFrame(networkDraw);
}
hub.addEventListener('pointerenter',()=>{hover=true;});
hub.addEventListener('pointerleave',()=>{hover=false;});
hub.addEventListener('click',()=>{
 if(motion.matches)return;
 const now=performance.now();if(now<boostUntil)return;boostUntil=now+3000;
 if(particles.length<(network.clientWidth<600?4:6))spawn();
 hub.querySelector('img').animate([{transform:'scale(1)'},{transform:'scale(.94)'},{transform:'scale(1.035)'},{transform:'scale(1)'}],{duration:550,easing:'ease-out'});
});
new IntersectionObserver(entries=>{const visible=entries[0].isIntersecting;if(visible!==networkVisible){networkVisible=visible;networkSync();}},{threshold:.05}).observe(network);
document.addEventListener('visibilitychange',networkSync);motion.addEventListener('change',networkSync);
