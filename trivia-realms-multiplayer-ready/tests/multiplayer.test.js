'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
process.env.PORT='0';
const {server,rooms}=require('../server/index');
function opening(ws){return new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true});});}
function waitFor(ws,predicate,ms=5000){return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{ws.removeEventListener('message',handle);reject(new Error('Timed out waiting for WS event'));},ms);
  function handle(e){const msg=JSON.parse(e.data);if(predicate(msg)){clearTimeout(timer);ws.removeEventListener('message',handle);resolve(msg);}}ws.addEventListener('message',handle);});}
function send(ws,type,data={}){ws.send(JSON.stringify({type,...data}));}
function wsURL(){return `ws://127.0.0.1:${server.address().port}/ws`;}
async function openSocket(){const ws=new WebSocket(wsURL());await opening(ws);return ws;}
test('two separate WebSocket clients create a room, join and play a shared trivia turn',async()=>{
  if(!server.listening)await new Promise(r=>server.once('listening',r));
  const a=await openSocket(),b=await openSocket();
  try{
    const pa=waitFor(a,m=>m.type==='joined');send(a,'create',{name:'Alice',mode:'quick'});const ja=await pa;
    assert.match(ja.code,/^[A-HJ-NP-Z2-9]{6}$/);assert.equal(ja.seat,0);
    const pb=waitFor(b,m=>m.type==='joined');send(b,'join',{name:'Bob',code:ja.code});const jb=await pb;
    assert.equal(jb.seat,1);
    const stA=waitFor(a,m=>m.type==='state'&&m.state.stage==='map');const stB=waitFor(b,m=>m.type==='state'&&m.state.stage==='map');send(a,'start');
    const [sA,sB]=await Promise.all([stA,stB]);
    assert.equal(sA.state.players[1].name,'Bob');assert.equal(sB.state.names[0],'Alice');
    assert.equal(sA.state.legal.length>0,true);assert.equal(sB.state.legal.length,0);
    const target=sA.state.legal[0];
    const qa=waitFor(a,m=>m.type==='state'&&m.state.stage==='question');const qb=waitFor(b,m=>m.type==='state'&&m.state.stage==='question');send(a,'challenge',{target});
    const [qA,qB]=await Promise.all([qa,qb]);
    assert.equal(qA.state.question.playing,true);assert.equal(qB.state.question.playing,false);
    assert.equal(qA.state.question.text,qB.state.question.text);
    const answer=rooms.get(ja.code).game.pending.qid;
    const {QUESTIONS}=require('../server/data');
    const resultA=waitFor(a,m=>m.type==='state'&&m.state.stage==='result');const resultB=waitFor(b,m=>m.type==='state'&&m.state.stage==='result');
    send(a,'answer',{choice:QUESTIONS[answer].answer});const [rA,rB]=await Promise.all([resultA,resultB]);
    assert.equal(rA.state.owners[target],0);assert.equal(rB.state.owners[target],0);
    assert.equal(rB.state.result.correct,QUESTIONS[answer].answer);
    const next=waitFor(b,m=>m.type==='state'&&m.state.turn===1&&m.state.stage==='map');send(a,'next');await next;
    const code=ja.code,token=jb.token;
    const offline=waitFor(a,m=>m.type==='state'&&!m.state.players[1].online);b.close();await offline;
    const resumed=await openSocket();try{const resumedMsg=waitFor(resumed,m=>m.type==='joined');send(resumed,'resume',{code,token});assert.equal((await resumedMsg).seat,1);
      const stateBack=await waitFor(a,m=>m.type==='state'&&m.state.players[1].online);assert.equal(stateBack.state.turn,1);
    }finally{resumed.close();}
  }finally{a.close();b.close();}
});
test('an interrupted question pauses for reconnection and resumes with the saved seat',async()=>{
  const host=await openSocket(),guest=await openSocket();
  try{
    const created=waitFor(host,m=>m.type==='joined');send(host,'create',{name:'Host'});const j=await created;
    const joined=waitFor(guest,m=>m.type==='joined');send(guest,'join',{name:'Guest',code:j.code});const gj=await joined;
    const ready=waitFor(host,m=>m.type==='state'&&m.state.stage==='map');send(host,'start');const initial=(await ready).state;
    const q=waitFor(host,m=>m.type==='state'&&m.state.stage==='question'&&!m.state.question.paused);
    send(host,'challenge',{target:initial.legal[0]});await q;
    const paused=waitFor(host,m=>m.type==='state'&&m.state.stage==='question'&&m.state.question.paused);
    guest.close();const statePaused=(await paused).state;
    assert.equal(statePaused.question.deadline,null);
    const reconnect=await openSocket();
    try{
      const back=waitFor(host,m=>m.type==='state'&&m.state.stage==='question'&&!m.state.question.paused);
      const resumed=waitFor(reconnect,m=>m.type==='joined');send(reconnect,'resume',{code:j.code,token:gj.token});await resumed;
      const stateBack=(await back).state;
      assert.ok(stateBack.question.remainingMs>0);
    }finally{reconnect.close();}
  }finally{host.close();guest.close();}
});

test.after(()=>new Promise(resolve=>server.close(resolve)));
