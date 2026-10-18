/* Pointer-based analog input. It never synthesizes keyboard events, so touch and
 * physical keyboard state remain independent. Capture keeps drags reliable.
 */
(function(root){
  'use strict';
  class TouchControls {
    static direction(dx,dy,radius){
      if(![dx,dy,radius].every(Number.isFinite)||radius<=0)return {x:0,y:0};
      const distance=Math.hypot(dx,dy),magnitude=Math.min(1,distance/radius),deadzone=0.14;
      if(magnitude<=deadzone)return {x:0,y:0};
      const speed=(magnitude-deadzone)/(1-deadzone);
      return {x:dx/distance*speed,y:dy/distance*speed};
    }
    constructor(game){
      this.game=game;this.document=game.document;this.pad=this.document.getElementById('joystick');this.thumb=this.document.getElementById('joystick-thumb');this.ui=this.document.getElementById('touch-controls');
      this.vector={x:0,y:0};this.pointer=null;this.landscape=root.innerWidth>root.innerHeight;
      this.pad.addEventListener('pointerdown',event=>{
        if(!this.enabled||this.game.mode!=='RUNNING'||this.pointer!==null)return;
        event.preventDefault();this.pointer=event.pointerId;
        try{this.pad.setPointerCapture(event.pointerId);}catch(_) { /* Window release still clears input. */ }
        this.move(event);
      });
      this.pad.addEventListener('pointermove',event=>{if(event.pointerId===this.pointer){event.preventDefault();this.move(event);}});
      const release=event=>{if(event.pointerId===this.pointer)this.clear();};
      root.addEventListener('pointerup',release);root.addEventListener('pointercancel',release);
      this.pad.addEventListener('lostpointercapture',release);
      this.pad.addEventListener('contextmenu',event=>event.preventDefault());
      root.addEventListener('blur',()=>this.clear());root.addEventListener('pagehide',()=>this.clear());
      this.document.addEventListener('visibilitychange',()=>{if(this.document.hidden)this.clear();});
      root.addEventListener('resize',()=>{
        this.clear();const landscape=root.innerWidth>root.innerHeight;
        if(landscape!==this.landscape&&this.game.mode==='RUNNING')this.game.togglePause();
        this.landscape=landscape;this.refresh();
      });
      // Secondary fingers do not reliably synthesize click while the joystick
      // finger is held. Act on touch pointerdown and ignore its later click.
      const bindButton=(id,action)=>{
        let lastTouch=0;const button=this.document.getElementById(id);
        button.addEventListener('pointerdown',event=>{if(event.pointerType==='touch'||event.pointerType==='pen'){event.preventDefault();lastTouch=Date.now();action();}});
        button.addEventListener('click',event=>{if(event.detail>0&&Date.now()-lastTouch<800)return;action();});
      };
      bindButton('touch-pause',()=>this.game.togglePause());
      bindButton('touch-mute',()=>this.game.toggleMute());
      this.refresh();
    }
    move(event){
      const r=this.pad.getBoundingClientRect(),radius=r.width*0.3,dx=event.clientX-r.left-r.width/2,dy=event.clientY-r.top-r.height/2;
      this.vector=TouchControls.direction(dx,dy,radius);
      const distance=Math.hypot(dx,dy),scale=distance>radius?radius/distance:1;
      this.thumb.style.setProperty('--stick-x',`${dx*scale}px`);this.thumb.style.setProperty('--stick-y',`${dy*scale}px`);
    }
    clear(){
      const pointer=this.pointer;this.pointer=null;this.vector={x:0,y:0};
      this.thumb.style.setProperty('--stick-x','0px');this.thumb.style.setProperty('--stick-y','0px');
      try{if(pointer!==null&&this.pad.hasPointerCapture(pointer))this.pad.releasePointerCapture(pointer);}catch(_) {}
    }
    refresh(){
      this.enabled=!!(root.matchMedia?.('(pointer: coarse)').matches||root.navigator?.maxTouchPoints>0);
      this.document.body.dataset.touch=String(this.enabled);
      if(this.enabled)this.document.getElementById('fullscreen').textContent=this.document.fullscreenElement?'Exit fullscreen':'Fullscreen';
      const running=this.enabled&&this.game.mode==='RUNNING';this.ui.hidden=!running;
      if(!running)this.clear();
      this.document.getElementById('touch-mute').textContent=this.game.sound.muted?'Sound off':'Sound on';
      this.document.getElementById('touch-mute').setAttribute('aria-pressed',String(this.game.sound.muted));
    }
  }
  root.SectorTouchControls=TouchControls;
  if(typeof module!=='undefined'&&module.exports)module.exports=TouchControls;
})(typeof window!=='undefined'?window:globalThis);
