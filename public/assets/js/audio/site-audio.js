/* One shared audio system per document, used by menus and gameplay. Full-page
 * navigation restores the pattern step; browsers still control autoplay.
 */
(function(root){
  'use strict';
  const sound=new root.SectorSoundSystem();
  let disabled=false,activated=false;
  const button=document.createElement('button');button.type='button';button.className='music-toggle';
  button.setAttribute('aria-label','Enable background music');document.body.append(button);
  const session=(key,value)=>{
    try {if(value===undefined)return root.sessionStorage.getItem(key);root.sessionStorage.setItem(key,value);}
    catch(error){root.SectorErrors?.report('MUSIC_SESSION',error,{notify:false,message:'Music playback position could not be saved.'});}
  };
  activated=session('sector09.musicActive')==='1';
  const step=Number(session('sector09.musicStep'));
  if(Number.isInteger(step)&&step>=0&&step<16)sound.resumeMusicStep=step;
  function paint(){
    const playing=sound.musicTimer!==null;
    button.textContent=playing?'Music on':sound.settings.music===0||sound.muted?'Music off':'Enable music';
    button.setAttribute('aria-pressed',String(playing));button.setAttribute('aria-label',playing?'Turn background music off':'Enable background music');
  }
  async function start(){
    if(disabled||document.hidden)return false;
    const ready=await sound.unlock();
    if(ready&&!disabled&&!document.hidden){activated=true;session('sector09.musicActive','1');sound.setMusic(true);paint();}
    return ready;
  }
  function stop(permanent=false){
    if(permanent)disabled=true;
    session('sector09.musicStep',String(sound.musicStep%16));
    sound.setAlert(false);sound.setMusic(false);paint();
  }
  function sync(){sound.applySettings(root.SectorPreferences.read());if(!sound.muted&&sound.settings.music>0)start();else paint();}
  function gesture(event){if(event.target?.closest?.('.music-toggle'))return;if(!disabled&&sound.musicTimer===null)start();}
  root.addEventListener('pointerdown',gesture,{capture:true});
  root.addEventListener('keydown',gesture,{capture:true});
  button.addEventListener('click',()=>{
    const turnOff=sound.musicTimer!==null;
    root.SectorPreferences.save({music:turnOff?0:1});sound.applySettings(root.SectorPreferences.read());
    if(turnOff){sound.setMusic(false);paint();}else start();
    const slider=document.getElementById('music'),output=document.getElementById('music-value');
    if(slider)slider.value=turnOff?0:100;if(output)output.textContent=turnOff?'0%':'100%';
  });
  root.addEventListener('pagehide',()=>stop());
  document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();else if(activated)start();});
  root.addEventListener('storage',e=>{if(e.key==='sector09.preferences'||e.key===null)sync();});
  root.SectorAudio={sound,start,stop,sync};
  paint();
  // Try to resume on later pages. If browser policy suspends the context, the
  // next real interaction resolves it; no autoplay promise is treated as fatal.
  if(activated&&!sound.muted&&sound.settings.music>0)start();
})(window);
