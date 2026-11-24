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
const layer=network.querySelector('.network-particles');
let particles=[],networkFrame=0,networkVisible=false,lastSpawn=0,bag=[];
function nextLogo(){if(!bag.length)bag=logos.map(x=>({...x})).sort(()=>Math.random()-.5);return bag.pop();}
function spawn(now,age=0){const w=network.clientWidth,h=network.clientHeight;const theta=Math.random()*Math.PI*2;const r=.36+Math.random()*.60;const x=w/2+Math.cos(theta)*(w/2-30)*r,y=h/2+Math.sin(theta)*(h/2-30)*r;const logo=nextLogo(),el=document.createElement('img');el.className='network-particle';el.alt='';el.src=logo.url;el.decoding='async';layer.append(el);particles.push({el,x,y,start:now-age,duration:3500+Math.random()*1800});}
function clearParticles(){particles.forEach(p=>p.el.remove());particles=[];}
function networkDraw(now){networkFrame=0;if(now-lastSpawn>460&&particles.length<11){spawn(now);lastSpawn=now;}const cx=network.clientWidth/2,cy=network.clientHeight/2;particles=particles.filter(p=>{const t=Math.max(0,(now-p.start)/p.duration);if(t>=1){p.el.remove();return false;}const move=Math.max(0,(t-.14)/.86);const eased=move*move*(3-2*move);const x=p.x+(cx-p.x)*eased,y=p.y+(cy-p.y)*eased;const alpha=Math.min(1,t/.19,(1-t)/.25);p.el.style.opacity=String(Math.max(0,alpha));p.el.style.transform=`translate(${x}px,${y}px) translate(-50%,-50%) scale(${1-.75*eased})`;return true;});if(networkVisible&&!document.hidden&&!motion.matches)networkFrame=requestAnimationFrame(networkDraw);}
function networkSync(){if(networkFrame)cancelAnimationFrame(networkFrame);networkFrame=0;clearParticles();if(!networkVisible||document.hidden)return;const now=performance.now();if(motion.matches){logos.forEach((logo,i)=>{const el=document.createElement('img');el.src=logo.url;el.alt='';el.className='network-particle';el.style.left=(50+40*Math.cos(i*Math.PI/4))+'%';el.style.top=(50+38*Math.sin(i*Math.PI/4))+'%';el.style.transform='translate(-50%,-50%)';el.style.opacity='1';layer.append(el);particles.push({el});});return;}for(let i=0;i<5;i++)spawn(now,i*380);lastSpawn=now;networkFrame=requestAnimationFrame(networkDraw);}
new IntersectionObserver(entries=>{networkVisible=entries[0].isIntersecting;networkSync();},{threshold:.05}).observe(network);document.addEventListener('visibilitychange',networkSync);motion.addEventListener('change',networkSync);
