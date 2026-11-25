const buttons=[...document.querySelectorAll('.platform')],dialog=document.querySelector('#installer');
const button=document.querySelector('#start-install'),info=document.querySelector('#release-info'),macDownloads=document.querySelector('#mac-downloads');
const macButtons=[...macDownloads.querySelectorAll('[data-mac]')];
let os='Windows';
const origin='https://galen.galenite.org';
const feeds={Windows:{path:'/downloads/latest.json',name:'Galen-Setup-x64.exe',label:'Windows x64'},arm64:{path:'/downloads/latest-macos-arm64.json',name:'Galen-macOS-arm64.dmg',label:'macOS · Apple Silicon'},x64:{path:'/downloads/latest-macos-x64.json',name:'Galen-macOS-x64.dmg',label:'macOS · Intel'}};
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
function status(entry){return entry?.asset?entry.data.tag_name+' · '+(entry.asset.size/1e6).toFixed(1)+' МБ':entry?.failure?'Пока не опубликовано':'Проверяем версию…';}
function choose(name){
  os=name;
  buttons.forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.os===os)));
  macDownloads.hidden=os!=='macOS';
  document.querySelector('#standard-download').hidden=os==='macOS';
  document.querySelector('#platform-name').textContent='Galen для '+os;
  const note=document.querySelector('#platform-note');
  if(os==='macOS'){
    for(const b of macButtons){
      const key=b.dataset.mac,entry=results[key];
      b.disabled=!entry?.asset;
      b.textContent=entry?.asset?'Скачать установщик ↓':entry?.failure?'Пока недоступно':'Проверяем версию…';
      document.querySelector('#mac-'+key+'-note').textContent=feeds[key].label+' · '+status(entry);
    }
    info.textContent=macButtons.some(b=>!b.disabled)?'SHA-256 проверен при публикации.':'Скачивание станет доступно после публикации проверенной сборки.';
    return;
  }
  const entry=os==='Windows'?results.Windows:null;
  button.disabled=!entry?.asset;
  note.textContent=entry?.asset?feeds.Windows.label+' · '+status(entry):os==='Linux'||entry?.failure?'Сборка для этой платформы пока не опубликована.':'Проверяем доступную версию…';
  button.textContent=entry?.asset?'Скачать установщик ↓':os==='Linux'||entry?.failure?'Пока недоступно':'Проверяем версию…';
  info.textContent=entry?.asset?'Последняя опубликованная версия: '+entry.data.tag_name+'. SHA-256 проверен при публикации.':os==='Linux'?'Версия Linux пока недоступна.':entry?.failure?'Проверенный установщик пока недоступен.':'Проверяем опубликованный установщик.';
}
buttons.forEach(b=>b.onclick=()=>choose(b.dataset.os));
const platform=navigator.userAgentData?.platform||navigator.platform||'';
choose(/mac/i.test(platform)?'macOS':/linux/i.test(platform)&&!/android/i.test(navigator.userAgent)?'Linux':'Windows');
async function load(key){
  try{
    const response=await fetch(feeds[key].path,{cache:'no-store'});
    if(!response.ok)throw Error('Release unavailable');
    const data=await response.json(),asset=selectAsset(data,key);
    if(!asset)throw Error('Invalid release');
    results[key]={data,asset};
  }catch{results[key]={failure:true};}
  choose(os);
}
function download(key){
  const entry=results[key];if(!entry?.asset)return;
  const {asset,data}=entry;
  document.querySelector('#install-title').textContent='Скачивание Galen';
  document.querySelector('#install-status').textContent=key!=='Windows'?'Загрузка передана браузеру. Откройте DMG и перетащите Galen в папку Программы.':'Загрузка передана браузеру. После завершения откройте EXE и следуйте инструкциям.';
  document.querySelector('#install-os').textContent=data.tag_name+' · '+feeds[key].label;
  document.querySelector('#percent').textContent=(asset.size/1e6).toFixed(1)+' МБ';
  dialog.querySelector('.progress').hidden=true;
  dialog.showModal();
  const a=document.createElement('a');a.href=asset.browser_download_url;a.download=asset.name;document.body.append(a);a.click();a.remove();
}
button.onclick=()=>{if(os==='Windows')download('Windows');};
macButtons.forEach(b=>b.onclick=()=>{if(os==='macOS')download(b.dataset.mac);});
document.querySelector('#finish-install').onclick=()=>dialog.close();
dialog.querySelector('.close').onclick=()=>dialog.close();
Object.keys(feeds).forEach(key=>void load(key));
