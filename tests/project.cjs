'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{pathToFileURL,fileURLToPath}=require('node:url'),{spawnSync}=require('node:child_process');
const {publicRoot,createServer}=require('../scripts/serve.cjs');
function files(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(path.join(dir,e.name)):[path.join(dir,e.name)]);}
test('Every local HTML link, script and stylesheet resolves within public/',()=>{
  for(const file of files(publicRoot).filter(f=>f.endsWith('.html'))){const html=fs.readFileSync(file,'utf8');for(const m of html.matchAll(/(?:src|href)="([^"]+)"/g)){
    if(/^(https?:|#|data:)/.test(m[1]))continue;
    const target=m[1].startsWith('/')?path.join(publicRoot,m[1].slice(1)||'index.html'):fileURLToPath(new URL(m[1],pathToFileURL(file)));
    assert.ok(target.startsWith(publicRoot),`Escaped public root: ${m[1]}`);assert.ok(fs.existsSync(target),`${path.relative(publicRoot,file)} -> ${m[1]}`);
  }}
});
test('Every shipped JavaScript module passes syntax validation',()=>{for(const file of files(path.join(publicRoot,'assets/js'))){const result=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});assert.equal(result.status,0,result.stderr);}});
test('Deployment exposes only public assets and preserves original page URLs',()=>{
  const config=require('../vercel.json');assert.equal(config.outputDirectory,'public');assert.equal(config.redirects.length,5);for(const r of config.redirects)assert.ok(fs.existsSync(path.join(publicRoot,r.destination)));
  assert.ok(config.headers[0].headers.some(h=>h.key==='Cache-Control'&&h.value.includes('must-revalidate')),'Unversioned production assets must revalidate');
  const origin='https://sector-09.vercel.app',sitemap=fs.readFileSync(path.join(publicRoot,'sitemap.xml'),'utf8');
  const urls=[...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m=>m[1]);
  assert.deepEqual(urls,[origin+'/',origin+'/pages/play.html',origin+'/pages/controls.html']);
  for(const url of urls){const page=new URL(url).pathname;const html=fs.readFileSync(path.join(publicRoot,page==='/'?'index.html':page),'utf8');assert.ok(html.includes('<link rel="canonical" href="'+url+'">'));assert.ok(html.includes('<meta name="robots" content="index, follow">'));assert.ok(/<meta name="description" content="[^"]+">/.test(html));}
  for(const page of ['settings','sound','exit'])assert.ok(fs.readFileSync(path.join(publicRoot,'pages',page+'.html'),'utf8').includes('noindex, follow'));
  const robots=fs.readFileSync(path.join(publicRoot,'robots.txt'),'utf8');assert.ok(robots.includes('Allow: /')&&robots.includes('Sitemap: '+origin+'/sitemap.xml'));
  const home=fs.readFileSync(path.join(publicRoot,'index.html'),'utf8');const data=JSON.parse(home.match(/<script type="application\/ld\+json">([^<]+)<\/script>/)[1]);assert.equal(data['@type'],'VideoGame');assert.equal(data.name,'SECTOR-09');assert.equal(data.url,origin+'/');assert.equal(data.isAccessibleForFree,true);
});
test('Server handles routes, legacy redirects, missing assets, bad requests and methods',async()=>{
  const server=createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${server.address().port}`;
  try{
    for(const route of ['/','/pages/play.html','/pages/settings.html','/pages/sound.html','/pages/controls.html','/pages/exit.html','/assets/js/core/errors.js'])assert.equal((await fetch(base+route)).status,200,route);
    const old=await fetch(base+'/play.html',{redirect:'manual'});assert.equal(old.status,308);assert.equal(old.headers.get('location'),'/pages/play.html');
    const icon=await fetch(base+'/assets/icons/sector09.svg');assert.equal(icon.status,200);assert.equal(icon.headers.get('content-type'),'image/svg+xml');
    for(const [route,type] of [['/robots.txt','text/plain'],['/sitemap.xml','application/xml']]){const r=await fetch(base+route);assert.equal(r.status,200);assert.ok(r.headers.get('content-type').startsWith(type));}
    assert.equal((await fetch(base+'/missing-file.js')).status,404);assert.equal((await fetch(base+'/README.md')).status,404);assert.equal((await fetch(base+'/%zz')).status,400);assert.equal((await fetch(base+'/',{method:'POST'})).status,405);assert.equal((await fetch(base+'/',{method:'HEAD'})).status,200);
  }finally{await new Promise(resolve=>server.close(resolve));}
});
