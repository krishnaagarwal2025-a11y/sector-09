/* Development/test server; production serves public/ directly on Vercel. */
'use strict';
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const publicRoot = path.resolve(__dirname,'../public');
const redirects = require('../vercel.json').redirects;
const types = { '.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'application/javascript; charset=utf-8','.json':'application/json; charset=utf-8' };
function createServer() {
  return http.createServer(async (req,res) => {
    res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Cache-Control','no-store');
    const reply=(status,text,type='text/plain; charset=utf-8')=>{res.writeHead(status,{'Content-Type':type});res.end(req.method==='HEAD'?undefined:text);};
    if (!['GET','HEAD'].includes(req.method)) {res.setHeader('Allow','GET, HEAD');return reply(405,'Method not allowed');}
    try {
      let route;
      try { route=decodeURIComponent(new URL(req.url,'http://localhost').pathname); }
      catch (_) { return reply(400,'Invalid request URL'); }
      if(route.includes('\0')) return reply(400,'Invalid path');
      const redirect=redirects.find(r=>r.source===route);
      if(redirect){res.writeHead(308,{Location:redirect.destination});return res.end();}
      const target=path.resolve(publicRoot,'.'+(route==='/'?'/index.html':route));
      if(!target.startsWith(publicRoot+path.sep))return reply(403,'Forbidden');
      let real;
      try {real=await fs.realpath(target);}catch(error){if(!['ENOENT','ENOTDIR'].includes(error.code))throw error;}
      if(real && !real.startsWith(publicRoot+path.sep))return reply(403,'Forbidden');
      if(real && (await fs.stat(real)).isFile()) return reply(200,await fs.readFile(real),types[path.extname(real)]||'application/octet-stream');
      return reply(404,await fs.readFile(path.join(publicRoot,'404.html')),'text/html; charset=utf-8');
    } catch(error) {console.error('[SERVER]',error);if(!res.headersSent)reply(500,'Unable to serve this request.');else res.end();}
  });
}
if(require.main===module){
  const port=Number(process.env.PORT||process.argv[2]||3000);
  if(!Number.isInteger(port)||port<0||port>65535){console.error('PORT must be an integer between 0 and 65535.');process.exitCode=1;}
  else {const server=createServer();server.on('error',error=>{console.error(`Server could not start: ${error.message}`);process.exitCode=1;});server.listen(port,'127.0.0.1',()=>console.log(`SECTOR-09: http://127.0.0.1:${server.address().port}`));}
}
module.exports={createServer,publicRoot};
