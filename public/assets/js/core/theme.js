/* CSS and Canvas share a saved theme; painting changes no simulation geometry. */
(function(root){
  'use strict';
  const dark=Object.freeze({background:'#1E2022',grid:'#26292C',wall:'#4A4E52',border:'#141517',wallLabel:'#292c2f',fastener:'#62666a',text:'#c5c8c6',player:'#5C7A99',node:'#C29B61',panel:'#16181A',panelBorder:'#3A3F45',route:'#32363A',states:{PATROL:'#688060',RETURN:'#B89A52',CHASE:'#B05252',ATTACK:'#D9D4CC'}});
  const light=Object.freeze({background:'#EDF0EB',grid:'#D7DED5',wall:'#A4ADA5',border:'#606D63',wallLabel:'#35453B',fastener:'#7C897E',text:'#26312D',player:'#3D6281',node:'#916B32',panel:'#F6F8F2',panelBorder:'#B9C1B8',route:'#B9C5B8',states:{PATROL:'#4F6848',RETURN:'#8A702C',CHASE:'#9E4040',ATTACK:'#6A453A'}});
  function apply(theme){
    const value=theme==='light'?'light':'dark';
    if(root.document){root.document.documentElement.dataset.theme=value;const meta=root.document.querySelector('meta[name="theme-color"]');if(meta)meta.content=value==='light'?'#edf0eb':'#16181a';}
    return value;
  }
  const api={apply,palette:()=>root.document?.documentElement.dataset.theme==='light'?light:dark};
  root.SectorTheme=api;
  if(root.document){apply(root.SectorPreferences?.read().theme);root.addEventListener('storage',e=>{if(e.key==='sector09.preferences'||e.key===null)apply(root.SectorPreferences.read().theme);});}
  if(typeof module!=='undefined'&&module.exports)module.exports={...api,dark,light};
})(typeof window!=='undefined'?window:globalThis);
