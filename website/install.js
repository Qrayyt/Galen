const buttons=[...document.querySelectorAll('.platform')],dialog=document.querySelector('#installer');
const button=document.querySelector('#start-install'),info=document.querySelector('#release-info'),archSelect=document.querySelector('#mac-arch'),archGroup=document.querySelector('#mac-arch-group');
let os='Windows',macArch='arm64',release=null,asset=null;
const origin='https://galen.galenite.org';
const feeds={Windows:{path:'/downloads/latest.json',name:'Galen-Setup-x64.exe'},arm64:{path:'/downloads/latest-macos-arm64.json',name:'Galen-macOS-arm64.dmg'},x64:{path:'/downloads/latest-macos-x64.json',name:'Galen-macOS-x64.dmg'}};
const results={};
function selectAsset(data,key){
  if(!data||data.draft||!/^v\d+\.\d+\.\d+(?:-preview\.\d+)?$/.test(data.tag_name))return null;
  const name=feeds[key].name;
  const a=data.assets?.find(a=>a.name===name&&a.state==='uploaded');
  if(!a||!/^sha256:[a-f0-9]{64}$/.test(a.digest)||!Number.isSafeInteger(a.size)||a.size<=0)return null;
  const prefix=key==='Windows'?'':'macos/';
  const expected=origin+'/downloads/'+prefix+data.tag_name+'-'+a.digest.slice(7,23)+'/'+name;
  return a.browser_download_url===expected?a:null;
}
function label(){return os==='Windows'?'Windows x64':macArch==='arm64'?'macOS · Apple Silicon':'macOS · Intel';}
function choose(name){
  os=name;
  buttons.forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.os===os)));
  archGroup.hidden=os!=='macOS';
  const key=os==='Windows'?'Windows':os==='macOS'?macArch:null;
  const entry=key?results[key]:null;
  release=entry?.data||null;asset=entry?.asset||null;
  document.querySelector('#platform-name').textContent='Galen для '+os;
  document.querySelector('#platform-note').textContent=asset?label()+' · '+release.tag_name+' · '+(asset.size/1e6).toFixed(1)+' МБ':os==='Linux'||entry?.failure?'Сборка для этой платформы пока не опубликована.':'Проверяем доступную версию…';
  button.disabled=!asset;
  button.textContent=asset?'Скачать установщик ↓':os==='Linux'||entry?.failure?'Пока недоступно':'Проверяем версию…';
  info.textContent=asset?'Последняя опубликованная версия: '+release.tag_name+'. SHA-256 проверен при публикации.':os==='Linux'?'Версия Linux готовится.':entry?.failure?'Проверенный установщик для этой платформы пока недоступен.':'Проверяем опубликованный установщик.';
}
buttons.forEach(b=>b.onclick=()=>choose(b.dataset.os));
archSelect.onchange=()=>{macArch=archSelect.value;choose('macOS');};
const platform=navigator.userAgentData?.platform||navigator.platform||'';
choose(/mac/i.test(platform)?'macOS':/linux/i.test(platform)&&!/android/i.test(navigator.userAgent)?'Linux':'Windows');
async function load(key){
  try{
    const response=await fetch(feeds[key].path,{cache:'no-store'});
    if(!response.ok)throw Error('Release unavailable');
    const data=await response.json(),next=selectAsset(data,key);
    if(!next)throw Error('Invalid release');
    results[key]={data,asset:next};
  }catch{results[key]={failure:true};}
  choose(os);
}
Object.keys(feeds).forEach(key=>void load(key));
button.onclick=()=>{
  if(!asset)return;
  document.querySelector('#install-title').textContent='Скачивание Galen';
  document.querySelector('#install-status').textContent=os==='macOS'?'Загрузка передана браузеру. Откройте DMG и перетащите Galen в папку Программы.':'Загрузка передана браузеру. После завершения откройте EXE и следуйте инструкциям.';
  document.querySelector('#install-os').textContent=release.tag_name+' · '+label();
  document.querySelector('#percent').textContent=(asset.size/1e6).toFixed(1)+' МБ';
  dialog.querySelector('.progress').hidden=true;
  dialog.showModal();
  const a=document.createElement('a');a.href=asset.browser_download_url;a.download=asset.name;document.body.append(a);a.click();a.remove();
};
document.querySelector('#finish-install').onclick=()=>dialog.close();
dialog.querySelector('.close').onclick=()=>dialog.close();
