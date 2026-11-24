const buttons=[...document.querySelectorAll('.platform')],dialog=document.querySelector('#installer');
const button=document.querySelector('#start-install'), info=document.querySelector('#release-info');
let os='Windows', release=null, asset=null, failure=false;
const origin='https://galen.galenite.org';
function selectAsset(data){
  if(data.draft || !/^v\d+\.\d+\.\d+(?:-preview\.\d+)?$/.test(data.tag_name))return null;
  const a=data.assets?.find(a=>a.name==='Galen-Setup-x64.exe'&&a.state==='uploaded');
  if(!a||!/^sha256:[a-f0-9]{64}$/.test(a.digest)||!Number.isSafeInteger(a.size)||a.size<=0)return null;
  const expected=origin+'/downloads/'+data.tag_name+'-'+a.digest.slice(7,23)+'/Galen-Setup-x64.exe';
  return a.browser_download_url===expected?a:null;
}
function choose(name){
  os=name;
  buttons.forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.os===os)));
  document.querySelector('#platform-name').textContent='Galen для '+os;
  const available=os==='Windows'&&asset;
  document.querySelector('#platform-note').textContent=os!=='Windows'?'Нативная сборка для этой платформы пока не опубликована.':available?'Windows 11 x64 · '+release.tag_name+' · '+(asset.size/1e6).toFixed(1)+' МБ':failure?'Не удалось проверить актуальный релиз.':'Проверяем доступную версию…';
  button.disabled=!available;
  button.textContent=available?'Скачать установщик ↓':os!=='Windows'?'Пока недоступно':failure?'Загрузка недоступна':'Проверяем версию…';
}
buttons.forEach(b=>b.onclick=()=>choose(b.dataset.os));
const platform=navigator.userAgentData?.platform||navigator.platform||'';
choose(/mac/i.test(platform)?'macOS':/linux/i.test(platform)&&!/android/i.test(navigator.userAgent)?'Linux':'Windows');
async function load(){
  try{
    const response=await fetch('/downloads/latest.json',{cache:'no-store'});
    if(!response.ok)throw Error('Release unavailable');
    const data=await response.json(), next=selectAsset(data);
    if(!next)throw Error('Invalid release');
    release=data;asset=next;failure=false;
    info.textContent='Последняя опубликованная версия: '+data.tag_name+'. SHA-256 проверен при публикации.';
  }catch{
    failure=true;
    info.textContent='Не удалось получить актуальную версию. Обновите страницу и попробуйте ещё раз.';
  }
  choose(os);
}
void load();
button.onclick=()=>{
  if(os!=='Windows'||!asset)return;
  document.querySelector('#install-title').textContent='Скачивание Galen';
  document.querySelector('#install-status').textContent='Загрузка передана браузеру. После завершения откройте EXE и следуйте инструкциям.';
  document.querySelector('#install-os').textContent=release.tag_name+' · Windows x64';
  document.querySelector('#percent').textContent=(asset.size/1e6).toFixed(1)+' МБ';
  dialog.querySelector('.progress').hidden=true;
  dialog.showModal();
  const a=document.createElement('a');a.href=asset.browser_download_url;a.download=asset.name;document.body.append(a);a.click();a.remove();
};
document.querySelector('#finish-install').onclick=()=>dialog.close();
dialog.querySelector('.close').onclick=()=>dialog.close();
