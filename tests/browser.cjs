/* Optional zero-library Chrome integration tests. Uses a fresh temporary profile.
 * Requires Node 22+ and a Chrome/Chromium binary (or CHROME_PATH).
 */
'use strict';
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawn}=require('node:child_process');
const assert=require('node:assert/strict');
const {createServer}=require('../scripts/serve.cjs');
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
(async()=>{
  const candidates=[process.env.CHROME_PATH,'C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','/usr/bin/chromium','/usr/bin/google-chrome','/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].filter(Boolean);
  const binary=candidates.find(file=>fs.existsSync(file));
  if(!binary)throw Error('Chrome not found. Set CHROME_PATH to its executable to run browser tests.');
  const server=createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${server.address().port}`;
  const profile=fs.mkdtempSync(path.join(os.tmpdir(),'sector09-browser-'));
  const browser=spawn(binary,['--headless=new','--disable-gpu','--no-first-run','--remote-debugging-port=0','--user-data-dir='+profile,'--window-size=1100,950','about:blank'],{stdio:'ignore',windowsHide:true});
  let ws;
  try{
    const portFile=path.join(profile,'DevToolsActivePort');
    for(let i=0;i<100&&!fs.existsSync(portFile);i++)await delay(100);
    if(!fs.existsSync(portFile))throw Error('Browser did not expose its test connection.');
    const port=Number(fs.readFileSync(portFile,'utf8').split('\n')[0]);
    const tabs=await(await fetch(`http://127.0.0.1:${port}/json`)).json();
    ws=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
    let id=0;const pending=new Map(),runtimeErrors=[];
    ws.onmessage=event=>{const m=JSON.parse(event.data);if(m.id){pending.get(m.id)?.(m);pending.delete(m.id);}if(m.method==='Runtime.exceptionThrown')runtimeErrors.push(m.params.exceptionDetails.text);};
    const send=(method,params={})=>new Promise((resolve,reject)=>{const n=++id;pending.set(n,m=>m.error?reject(Error(JSON.stringify(m.error))):resolve(m.result));ws.send(JSON.stringify({id:n,method,params}));});
    const ev=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,userGesture:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
    const nav=async(route,ready=true)=>{
      await send('Page.navigate',{url:base+route});
      for(let i=0;i<80;i++){await delay(50);try{if(await ev(`document.readyState==='complete' && ${ready?"document.body.dataset.ready==='true'":"!!document.querySelector('.error-fatal')"}`))return;}catch{}}
      throw Error('Page did not reach expected state: '+route);
    };
    const inject=async(source,fn)=>{const r=await send('Page.addScriptToEvaluateOnNewDocument',{source});try{await fn();}finally{await send('Page.removeScriptToEvaluateOnNewDocument',{identifier:r.identifier});}};
    await send('Runtime.enable');await send('Page.enable');await send('Network.enable');
    await nav('/');
    await ev('document.querySelector(".music-toggle").click()');await delay(150);
    assert.equal(await ev('SectorAudio.sound.musicTimer!==null && sessionStorage.getItem("sector09.musicActive")==="1"'),true,'Home music did not activate');
    await ev('document.querySelector(".music-toggle").click()');assert.equal(await ev('SectorAudio.sound.musicTimer===null && SectorPreferences.read().music===0'),true,'Music control did not turn off');
    await ev('document.querySelector(".music-toggle").click()');await delay(80);assert.equal(await ev('SectorAudio.sound.musicTimer!==null'),true,'Music control did not turn on');
    for(const route of ['/pages/settings.html','/pages/sound.html','/pages/controls.html','/pages/exit.html','/pages/play.html']){
      await nav(route);await ev('SectorAudio.start()');
      assert.equal(await ev('SectorAudio.sound.musicTimer!==null && Number(sessionStorage.getItem("sector09.musicStep"))>0'),true,'Music/phase missing on '+route);
    }
    await nav('/pages/settings.html');
    await ev(`(()=>{const d=document.getElementById('difficulty');d.value='god';d.dispatchEvent(new Event('change'));const f=document.getElementById('fullscreen');f.checked=false;f.dispatchEvent(new Event('change'));})()`);
    await ev(`(()=>{const e=document.getElementById('theme');e.value='light';e.dispatchEvent(new Event('change'))})()`);
    await nav('/pages/sound.html');
    await ev(`(()=>{const e=document.getElementById('master');e.value=25;e.dispatchEvent(new Event('input'));document.querySelector('[data-preview="collect"]').click();})()`);await delay(150);
    assert.equal(await ev('document.getElementById("saved").textContent.includes("Playing preview")'),true);
    await nav('/pages/play.html');assert.equal(await ev('sector09Game.enemies.length===5 && sector09Game.sound.settings.master===0.25'),true);
    assert.equal(await ev('document.documentElement.dataset.theme==="light" && SectorTheme.palette().background==="#EDF0EB"'),true);
    await send('Emulation.setDeviceMetricsOverride',{width:1191,height:715,deviceScaleFactor:1,mobile:false});
    await ev('document.getElementById("action").click()');await delay(100);
    assert.equal(await ev('sector09Game.mode==="RUNNING" && sector09Game.sound.context.state==="running"'),true);
    assert.equal(await ev('sector09Game.sound.musicTimer!==null'),true,'BGM did not start');
    const renderedAudio=await ev(`(async()=>{
      const rms={};
      for(const type of ['siren','music','spawn','collect','muted']){
        const offline=new OfflineAudioContext(1,26460,22050),s=new SectorSoundSystem();
        s.context=new Proxy(offline,{get(target,key){if(key==='state')return 'running';const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;}});
        s.masterGain=offline.createGain();s.effectsGain=offline.createGain();s.sirenGain=offline.createGain();s.musicGain=offline.createGain();
        s.masterGain.connect(offline.destination);for(const bus of [s.effectsGain,s.sirenGain,s.musicGain])bus.connect(s.masterGain);
        s.applySettings({master:1,effects:1,siren:1,music:1,muted:type==='muted'});
        if(type==='siren'||type==='muted')s.setAlert(true);else if(type==='music')s.scheduleMusicStep(0,0);else if(type==='spawn')s.cue('spawn');else s.click();
        const samples=(await offline.startRendering()).getChannelData(0);let sum=0,peak=0;for(const n of samples){sum+=n*n;peak=Math.max(peak,Math.abs(n));}rms[type]={rms:Math.sqrt(sum/samples.length),peak};
      }
      return rms;
    })()`);
    assert.ok(renderedAudio.siren.rms>0.012,'Siren waveform too quiet');assert.ok(renderedAudio.music.rms>0.025,'BGM synthesis output still too low');for(const type of ['music','spawn','collect'])assert.ok(renderedAudio[type].rms>0.002,type+' produced no audible signal');assert.equal(renderedAudio.muted.rms,0);for(const value of Object.values(renderedAudio))assert.ok(value.peak<0.8,'Audio clipping');
    console.log('PASS: actual rendered siren/BGM/spawn/effects waveforms, mute silence and peak levels.');
    await ev(`(()=>{const g=sector09Game;g.enemies=[Sector09.makeEnemy(0)];const e=g.enemies[0];e.pos=new Sector09.Vector2D(130,180);g.player.pos=new Sector09.Vector2D(130,240);e.transition('CHASE');g.updateAlert()})()`);
    assert.equal(await ev('sector09Game.alert && !!sector09Game.sound.siren'),true,'Visible player did not trigger siren');
    await ev('sector09Game.player.pos=new Sector09.Vector2D(315,180);sector09Game.enemies[0].decide(sector09Game.player,sector09Game.walls);sector09Game.updateAlert()');
    assert.equal(await ev('!sector09Game.sound.siren && sector09Game.sound.musicTimer!==null'),true,'Cover did not stop alarm or incorrectly stopped BGM');
    await send('Input.dispatchKeyEvent',{type:'keyDown',key:'m',code:'KeyM'});await send('Input.dispatchKeyEvent',{type:'keyUp',key:'m',code:'KeyM'});
    assert.equal(await ev('sector09Game.sound.muted && sector09Game.sound.musicTimer===null && !sector09Game.sound.siren'),true,'Mute did not stop music/alarm');
    await send('Input.dispatchKeyEvent',{type:'keyDown',key:'m',code:'KeyM'});await send('Input.dispatchKeyEvent',{type:'keyUp',key:'m',code:'KeyM'});await delay(50);
    assert.equal(await ev('!sector09Game.sound.muted && sector09Game.sound.musicTimer!==null'),true,'Unmute did not restore BGM');
    assert.equal(await ev('(()=>{sector09Game.draw();const p=sector09Game.ctx.getImageData(780,580,1,1).data;return p[0]===237&&p[1]===240&&p[2]===235})()'),true,'Canvas light palette was not rendered');
    const checkPlayLayout=async()=>assert.equal(await ev(`(()=>{const c=document.getElementById('game').getBoundingClientRect(),p=document.getElementById('controls-panel').getBoundingClientRect(),hud=document.querySelector('.status').getBoundingClientRect();return c.x===0&&c.y===0&&c.width===innerWidth&&c.height===innerHeight&&Math.abs(innerWidth-p.right)<=18&&Math.abs(innerHeight-p.bottom)<=16&&hud.top>=0&&hud.right<=innerWidth&&!document.querySelector('header,footer,#states,#log,.workspace')&&document.documentElement.scrollWidth<=innerWidth&&document.documentElement.scrollHeight<=innerHeight})()`),true,'Playfield or overlays do not fit viewport');
    await checkPlayLayout();
    const screenshots=path.resolve(__dirname,'../artifacts/screenshots');fs.mkdirSync(screenshots,{recursive:true});
    const gameShot=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(screenshots,'play-full-viewport.png'),Buffer.from(gameShot.data,'base64'));
    await ev('document.getElementById("pause").click();sector09Game.updateHUD()');assert.equal(await ev('sector09Game.mode==="PAUSED" && document.getElementById("pause").textContent==="Resume [P]"'),true);
    assert.equal(await ev('sector09Game.sound.musicTimer!==null && !sector09Game.sound.siren && sector09Game.sound===SectorAudio.sound'),true,'Pause stopped site music or duplicated audio');
    await ev('document.getElementById("pause").click()');assert.equal(await ev('sector09Game.mode==="RUNNING"'),true);
    await delay(50);assert.equal(await ev('sector09Game.sound.musicTimer!==null'),true,'BGM did not resume');
    await ev('document.querySelector("#controls-panel summary").click()');assert.equal(await ev('!document.getElementById("controls-panel").open'),true);
    await ev('sector09Game.toggleFullscreen()');await checkPlayLayout();await ev('sector09Game.toggleFullscreen()');
    for(const [width,height] of [[714,715],[390,844]]){await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});await checkPlayLayout();}
    await send('Emulation.setDeviceMetricsOverride',{width:1100,height:950,deviceScaleFactor:1,mobile:false});
    await ev('sector09Game.collect();sector09Game.togglePause()');assert.equal(await ev('Sector09.runTests(false).every(t=>t.pass)'),true);
    await ev('sector09Game.player.hp=0;sector09Game.update(Sector09.CONFIG.STEP)');assert.equal(await ev('sector09Game.mode==="OVER" && sector09Game.sound.musicTimer!==null'),true,'Game over stopped site music');
    assert.equal(runtimeErrors.length,0,'Healthy page runtime exceptions');
    console.log('PASS: all pages, gameplay, saved preferences, audio mixer/previews, browser self-tests.');
    await inject(`localStorage.setItem('sector09.preferences','{broken');`,async()=>{await nav('/pages/settings.html');assert.equal(await ev('SectorPreferences.read().difficulty==="medium" && SectorErrors.snapshot().some(e=>e.code==="PREFERENCES_CORRUPT")'),true);});
    await ev('localStorage.removeItem("sector09.preferences")');
    await inject(`Storage.prototype.getItem=function(){throw new DOMException('Denied','SecurityError')};Storage.prototype.setItem=function(){throw new DOMException('Denied','SecurityError')};`,async()=>{
      await nav('/pages/settings.html');await ev(`(()=>{const e=document.getElementById('difficulty');e.value='hard';e.dispatchEvent(new Event('change'))})()`);
      assert.equal(await ev('SectorPreferences.read().difficulty==="hard" && !SectorPreferences.isPersistent() && document.getElementById("saved").textContent.includes("page session")'),true);
    });
    await inject('window.AudioContext=undefined;window.webkitAudioContext=undefined;',async()=>{
      await nav('/pages/sound.html');await ev('document.querySelector("[data-preview]").click()');await delay(100);
      assert.equal(await ev('document.getElementById("saved").textContent.includes("unavailable") && SectorErrors.snapshot().some(e=>e.code==="AUDIO_UNSUPPORTED")'),true);
    });
    console.log('PASS: corrupt preferences, storage denied, unsupported audio, honest recovery messages.');
    await inject(`const original=Document.prototype.getElementById;Document.prototype.getElementById=function(id){return id==='game'?null:original.call(this,id)};`,async()=>{
      await nav('/pages/play.html',false);assert.equal(await ev('SectorErrors.snapshot().some(e=>e.code==="BOOTSTRAP") && !window.sector09Game'),true);
    });
    await inject('HTMLCanvasElement.prototype.getContext=function(){return null};',async()=>{await nav('/pages/play.html',false);assert.equal(await ev('SectorErrors.snapshot().some(e=>e.code==="BOOTSTRAP")'),true);});
    await send('Network.setBlockedURLs',{urls:['*assets/js/ui/menu.js']});
    await nav('/pages/settings.html',false);assert.equal(await ev('SectorErrors.snapshot().some(e=>e.code==="ASSET_LOAD" && e.severity==="fatal")'),true);
    await send('Network.setBlockedURLs',{urls:[]});
    await nav('/pages/play.html');await ev('sector09Game.draw=function(){throw Error("Injected render failure")};sector09Game.frame(performance.now())');
    assert.equal(await ev('sector09Game.failed && sector09Game.mode==="ERROR" && !!document.querySelector(".error-fatal") && !sector09Game.sound.siren'),true);
    await nav('/pages/settings.html');await ev('Promise.reject(Error("Injected rejection"));void 0');await delay(100);
    assert.equal(await ev('SectorErrors.snapshot().some(e=>e.code==="UNHANDLED_PROMISE")'),true);
    console.log('PASS: missing DOM, Canvas unavailable, blocked script, fatal frame shutdown, rejected promise.');
    await nav('/');
    await ev(`SectorPreferences.save({motion:false});document.body.classList.add('reduced-motion')`);
    for(const [width,height] of [[714,715],[390,844]]){await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});assert.equal(await ev('document.documentElement.scrollWidth<=innerWidth && document.documentElement.scrollHeight<=innerHeight'),true);}
    const shot=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(screenshots,'home.png'),Buffer.from(shot.data,'base64'));
    console.log('PASS: responsive layout. Screenshot: artifacts/screenshots/home.png');
    await send('Browser.close');
  }finally{
    ws?.close();browser.kill();await new Promise(resolve=>server.close(resolve));
    // Only this run's mkdtemp directory may be removed. Retry locked browser files.
    const resolved=path.resolve(profile),temp=path.resolve(os.tmpdir());
    if(resolved.startsWith(temp+path.sep)&&path.basename(resolved).startsWith('sector09-browser-')){
      for(let i=0;i<5;i++){try{fs.rmSync(resolved,{recursive:true,force:true});break;}catch{await delay(150);}}
    }
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
