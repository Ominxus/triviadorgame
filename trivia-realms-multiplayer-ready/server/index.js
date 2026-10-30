'use strict';
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const {upgrade}=require('./websocket');
const Game=require('./game');
const ROOT=path.resolve(__dirname,'../public');
const PORT=process.env.PORT===undefined?3000:Number(process.env.PORT);
const rooms=new Map();
const clients=new Set();
const ASSETS={'/':'index.html','/index.html':'index.html','/app.js':'app.js','/style.css':'style.css','/favicon.svg':'favicon.svg'};
const MIME={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml'};
const server=http.createServer((req,res)=>{
  const route=new URL(req.url,'http://local').pathname;
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Referrer-Policy','same-origin');
  res.setHeader('X-Frame-Options','DENY');
  res.setHeader('Content-Security-Policy',"default-src 'self'; connect-src 'self' ws: wss:; script-src 'self'; style-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'");
  if(route==='/health'){res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({status:'ok',players:clients.size,rooms:rooms.size}));return;}
  if(req.method!=='GET'||!Object.hasOwn(ASSETS,route)){res.writeHead(404);res.end('Not found');return;}
  const file=path.join(ROOT,ASSETS[route]);
  res.setHeader('Cache-Control',route==='/'||route==='/index.html'?'no-store':'public, max-age=3600');
  res.setHeader('Content-Type',MIME[path.extname(file)]||'application/octet-stream');
  const stream=fs.createReadStream(file);
  stream.once('error',()=>{if(!res.headersSent)res.writeHead(500);res.end('Server error');});
  stream.pipe(res);
});
function reply(c,type,message){c.send({type,message});}
function sendJoined(c,r,seat){c.send({type:'joined',code:r.code,seat,token:r.players[seat].token});}
function broadcast(r){r.updated=Date.now();r.players.forEach((p,s)=>{if(p?.client&&!p.client.closed)p.client.send({type:'state',state:Game.snapshot(r,s)});});}
function bound(c){const r=rooms.get(c.roomCode);if(!r||c.seat===null||r.players[c.seat]?.client!==c)return null;return r;}
function bothOnline(r){return r.players.length===2&&r.players.every(p=>p&&p.client&&!p.client.closed);}
function pause(r){const g=r.game;if(!g||g.phase!=='question'||g.pending.paused)return;
  const p=g.pending;p.remainingMs=Game.remaining(p);p.paused=true;p.deadline=null;p.startedAt=null;
  clearTimeout(p.timer);p.timer=null;
}
function resumeTimer(r){const g=r.game;if(!g||g.phase!=='question'||!g.pending.paused||!bothOnline(r))return;
  const p=g.pending;p.paused=false;p.startedAt=Date.now();p.deadline=p.startedAt+p.remainingMs;
  p.timer=setTimeout(()=>{
    if(!rooms.has(r.code)||g.phase!=='question'||g.pending!==p||p.paused)return;
    for(let i of (p.kind==='claim'?[g.turn%2]:[0,1]))if(!p.answers[i])p.answers[i]={choice:null,timeMs:20000};
    clearTimeout(p.timer);Game.resolve(g);broadcast(r);
  },Math.max(1,p.remainingMs));
}
function detach(c){const r=bound(c);if(!r)return;
  if(r.game?.phase==='question')pause(r);
  r.players[c.seat].client=null;
  c.roomCode=null;c.seat=null;
  broadcast(r);
}
function attach(c,r,seat){if(c.roomCode)detach(c);
  const prev=r.players[seat].client;
  if(prev&&prev!==c){prev.roomCode=null;prev.seat=null;prev.send({type:'taken-over'});prev.close();}
  c.roomCode=r.code;c.seat=seat;r.players[seat].client=c;
  sendJoined(c,r,seat);
  resumeTimer(r);
  broadcast(r);
}
function reject(c,message){reply(c,'error',message);}
function handle(c,msg){
  if(!msg||typeof msg!=='object'||Array.isArray(msg))return reject(c,'Invalid request.');
  if(Date.now()-c.bucketStart>10000){c.bucketStart=Date.now();c.requests=0;}
  if(++c.requests>90)return reject(c,'Too many actions. Slow down.');
  const t=msg.type;
  if(t==='create'){
    if(c.roomCode)return reject(c,'Leave your current room first.');
    if(rooms.size>=1500)return reject(c,'The server is busy. Try again later.');
    let code;do{code=Game.createCode();}while(rooms.has(code));
    const r={code,mode:msg.mode==='long'?'long':'quick',players:[{name:Game.safeName(msg.name,'Player 1'),token:Game.newToken(),client:null},null],game:null,updated:Date.now()};
    rooms.set(code,r);attach(c,r,0);return;
  }
  if(t==='join'){
    if(c.roomCode)return reject(c,'Leave your current room first.');
    const code=typeof msg.code==='string'?msg.code.trim().toUpperCase():'';
    const r=rooms.get(code);
    if(!r)return reject(c,'No room found. Double-check the code.');
    if(r.game||r.players[1])return reject(c,'This room is full or has already started.');
    r.players[1]={name:Game.safeName(msg.name,'Player 2'),token:Game.newToken(),client:null};
    attach(c,r,1);return;
  }
  if(t==='resume'){
    if(c.roomCode)return reject(c,'Already joined.');
    const code=typeof msg.code==='string'?msg.code.trim().toUpperCase():'';
    const token=typeof msg.token==='string'?msg.token:'';
    const r=rooms.get(code);
    const seat=r?.players.findIndex(p=>p&&p.token===token);
    if(!r||seat<0)return c.send({type:'session-expired'});
    attach(c,r,seat);return;
  }
  const r=bound(c);
  if(!r)return reject(c,'You must join a room first.');
  if(t==='leave'){detach(c);c.send({type:'left'});return;}
  const g=r.game,s=c.seat;
  if(t==='start'){
    if(s!==0||g||!bothOnline(r))return reject(c,'Both players must be online. Only the host can start.');
    r.game=Game.createMatch(r.players.map(p=>p.name),r.mode);broadcast(r);return;
  }
  if(t==='rematch'){
    if(s!==0||!g||g.phase!=='gameover'||!bothOnline(r))return reject(c,'Only the host can start a rematch when both players are online.');
    r.game=Game.createMatch(r.players.map(p=>p.name),r.mode);broadcast(r);return;
  }
  if(!g)return reject(c,'Wait for the host to start the match.');
  if(t==='challenge'){
    if(!bothOnline(r))return reject(c,'Your opponent must reconnect before you can play.');
    if(!Game.begin(g,s,msg.target))return reject(c,'That territory is not available on your turn.');
    resumeTimer(r);broadcast(r);return;
  }
  if(t==='hint'){
    if(Game.addHint(g,s)===null)return reject(c,'The hint cannot be used now.');
    broadcast(r);return;
  }
  if(t==='answer'){
    if(!Game.answer(g,s,msg.choice))return reject(c,'The answer was not accepted.');
    if(Game.readyToResolve(g)){clearTimeout(g.pending.timer);Game.resolve(g);}
    broadcast(r);return;
  }
  if(t==='next'){
    if(g.phase!=='result'||!Game.advance(g))return reject(c,'There is no result to continue from.');
    broadcast(r);return;
  }
  if(t==='pass'){
    if(!Game.pass(g,s))return reject(c,'You cannot pass this turn.');
    broadcast(r);return;
  }
  reject(c,'Unknown action.');
}
server.on('upgrade',(req,socket,head)=>{
  const pathName=new URL(req.url,'http://localhost').pathname;
  let originOK=true;
  if(req.headers.origin){try{originOK=new URL(req.headers.origin).host.toLowerCase()===String(req.headers.host||'').toLowerCase();}catch{originOK=false;}}
  if(pathName!=='/ws'||!originOK){socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');socket.destroy();return;}
  if(clients.size>3000){socket.write('HTTP/1.1 503 Service Unavailable\r\n\r\n');socket.destroy();return;}
  const c=upgrade(req,socket,head,handle,closed=>{clients.delete(closed);detach(closed);});
  if(c){c.bucketStart=Date.now();c.requests=0;clients.add(c);}
});
const heartbeat=setInterval(()=>{
  for(const c of clients){if(Date.now()-c.lastPong>70_000){c.close();c.socket.destroy();}else c.ping();}
},25_000);heartbeat.unref();
const sweep=setInterval(()=>{
  for(const [code,r] of rooms)if(Date.now()-r.updated>3*3600_000||(r.players.every(p=>!p?.client)&&Date.now()-r.updated>30*60_000)){
    if(r.game?.pending?.timer)clearTimeout(r.game.pending.timer);
    rooms.delete(code);
  }
},10*60_000);sweep.unref();
server.listen(PORT,'0.0.0.0',()=>console.log(`Trivia Realms Online: http://localhost:${server.address().port}`));
module.exports={server,rooms};
