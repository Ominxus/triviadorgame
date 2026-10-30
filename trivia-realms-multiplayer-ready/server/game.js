'use strict';
const crypto = require('node:crypto');
const {TERRITORIES,QUESTIONS,neighbors} = require('./data');
const QUESTION_MS=20_000;
const EXPANSION_TURNS=16;
const MAX_TURNS={quick:30,long:42};
const ROOM_ALPHABET='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const safeName=(name,fallback)=>typeof name==='string'?(name.replace(/[\u0000-\u001f\u007f]/g,'').trim().slice(0,18)||fallback):fallback;
const newToken=()=>crypto.randomBytes(24).toString('hex');
const createCode=()=>Array.from({length:6},()=>ROOM_ALPHABET[crypto.randomInt(ROOM_ALPHABET.length)]).join('');
const landCount=(g,p)=>g.owners.filter(o=>o===p).length;
const score=(g,p)=>TERRITORIES.reduce((total,t)=>total+(g.owners[t.id]===p?t.value:0),g.bonus[p]);
const activeSeat=g=>g.turn%2;
const phase=g=>g.turn<EXPANSION_TURNS?'expansion':'battle';
const targetPlayers=g=>g.pending?.kind==='duel'?[0,1]:[activeSeat(g)];
function legal(g){if(g.phase!=='map')return [];
  const p=activeSeat(g);
  return TERRITORIES.filter(t=>g.owners[t.id]!==p&&
    TERRITORIES.some(a=>g.owners[a.id]===p&&neighbors(a.id,t.id))&&
    (g.owners[t.id]===null||phase(g)==='battle')).map(t=>t.id);
}
function addLog(g,message,ico='⚔️'){g.events.unshift({message,ico});g.events=g.events.slice(0,7);}
function createMatch(names,mode='quick'){
  const g={names:[...names],mode:mode==='long'?'long':'quick',turn:0,phase:'map',owners:TERRITORIES.map(t=>t.capital),forts:[2,2],bonus:[0,0],hints:[1,1],attackWins:[0,0],used:[],pending:null,result:null,winner:null,events:[]};
  addLog(g,`${names[0]} and ${names[1]} enter Eldoria. The conquest begins!`,'📜');return g;
}
function pickQuestion(g){let available=QUESTIONS.filter(q=>!g.used.includes(q.id));if(!available.length){g.used=[];available=QUESTIONS;}let selected=available[crypto.randomInt(available.length)];g.used.push(selected.id);return selected;}
function begin(g,seat,target){
  if(g.phase!=='map'||seat!==activeSeat(g)||!Number.isInteger(target)||!legal(g).includes(target))return false;
  const kind=g.owners[target]===null?'claim':'duel',q=pickQuestion(g);
  g.pending={target,kind,qid:q.id,answers:[null,null],hidden:[[],[]],remainingMs:QUESTION_MS,startedAt:null,deadline:null,paused:true,timer:null};
  g.result=null;g.phase='question';return true;
}
function remaining(p){return p.paused?p.remainingMs:Math.max(0,p.deadline-Date.now());}
function answer(g,seat,choice){
  const p=g.pending;if(g.phase!=='question'||!p||p.paused||!targetPlayers(g).includes(seat)||p.answers[seat]!==null||![0,1,2,3].includes(choice)&&choice!==-1)return false;
  if(p.hidden[seat].includes(choice))return false;
  const elapsed=Math.max(0,QUESTION_MS-remaining(p));
  p.answers[seat]={choice:choice===-1?null:choice,timeMs:elapsed};return true;
}
function readyToResolve(g){return targetPlayers(g).every(s=>g.pending.answers[s]!==null);}
function addHint(g,seat){
  const p=g.pending;if(g.phase!=='question'||!p||p.paused||g.hints[seat]<1||!targetPlayers(g).includes(seat)||p.answers[seat]!==null||p.hidden[seat].length)return null;
  const q=QUESTIONS[p.qid],incorrect=[0,1,2,3].filter(i=>i!==q.answer);
  for(let i=incorrect.length-1;i>0;i--){const j=crypto.randomInt(i+1);[incorrect[i],incorrect[j]]=[incorrect[j],incorrect[i]];}
  p.hidden[seat]=incorrect.slice(0,2);g.hints[seat]--;return p.hidden[seat];
}
function resolve(g){
  if(g.phase!=='question'||!g.pending)return;
  const p=g.pending,q=QUESTIONS[p.qid],attacker=activeSeat(g),defender=1-attacker,t=TERRITORIES[p.target];
  let heading,message,winning=null;
  if(p.kind==='claim'){
    if(p.answers[attacker]?.choice===q.answer){g.owners[t.id]=attacker;g.bonus[attacker]+=20;winning=attacker;heading='Territory conquered!';message=`${g.names[attacker]} claimed ${t.name} and earned a 20-point knowledge bonus.`;addLog(g,`${g.names[attacker]} claimed ${t.name}!`,'🏳️');}
    else {heading='The land remains free';message=`No correct answer this time. ${t.name} remains neutral.`;addLog(g,`${g.names[attacker]} could not claim ${t.name}.`,'⌛');}
  }else{
    const a=p.answers[attacker],d=p.answers[defender],ac=a?.choice===q.answer,dc=d?.choice===q.answer;
    const win=ac&&(!dc||a.timeMs<d.timeMs-50);
    if(win){winning=attacker;g.attackWins[attacker]++;g.bonus[attacker]+=50;
      if(t.capital!==null){g.forts[defender]--;if(g.forts[defender]<=0){g.owners[t.id]=attacker;g.winner=attacker;heading='THE CASTLE HAS FALLEN!';message=`${g.names[attacker]} captured ${g.names[defender]}'s castle and won the kingdom!`;addLog(g,`${g.names[attacker]} conquered ${t.name}!`,'👑');}
        else {heading='Castle walls breached!';message=`${g.names[attacker]} broke a castle shield. ${g.forts[defender]} shield remains.`;addLog(g,`${g.names[attacker]} damaged ${t.name} castle!`,'💥');}}
      else{g.owners[t.id]=attacker;heading='Land captured!';message=`${g.names[attacker]} seized ${t.name} from ${g.names[defender]}.`;addLog(g,`${g.names[attacker]} captured ${t.name}!`,'⚔️');}}
    else {winning=defender;g.bonus[defender]+=25;heading='The defense holds!';message=ac&&dc?'Both players were correct, but the defender was faster.':!ac&&!dc?'Neither player answered correctly. The defender keeps the territory.':'The defender protected the territory.';message+=' +25 defense bonus.';addLog(g,`${g.names[defender]} defended ${t.name}.`,'🛡️');}
  }
  g.result={kind:p.kind,target:p.target,heading,message,winning,correct:q.answer,options:q.options,answers:p.answers.map(a=>a?{choice:a.choice,timeMs:a.timeMs}:null)};
  g.phase='result';g.pending=null;
}
function finish(g){if(g.winner===null){const a=score(g,0),b=score(g,1);g.winner=a===b?'tie':a>b?0:1;}g.pending=null;g.phase='gameover';addLog(g,g.winner==='tie'?'The realm finishes in a draw!':`${g.names[g.winner]} has won the kingdom!`,'👑');}
function advance(g){if(g.phase!=='result')return false;
  g.turn++;g.result=null;
  if(g.winner!==null||g.turn>=MAX_TURNS[g.mode]){finish(g);return true;}
  g.phase='map';if(g.turn===EXPANSION_TURNS)addLog(g,'The expansion phase is over. The battle begins!','📣');
  let skips=0;
  while(!legal(g).length&&g.turn<MAX_TURNS[g.mode]&&skips<MAX_TURNS[g.mode]){addLog(g,`${g.names[activeSeat(g)]} has no legal neighboring moves.`,'⏩');g.turn++;skips++;}
  if(g.turn>=MAX_TURNS[g.mode])finish(g);
  return true;
}
function pass(g,seat){if(g.phase!=='map'||seat!==activeSeat(g))return false;addLog(g,`${g.names[seat]} passed a turn.`,'⏭️');g.phase='result';g.result={kind:'pass',heading:'Turn passed',message:`${g.names[seat]} passed.`,winning:null};advance(g);return true;}
function snapshot(room,seat){
  const g=room.game;
  const basic={code:room.code,seat,players:room.players.map(p=>p?{name:p.name,online:!!p.client}:null),mode:room.mode,host:seat===0,stage:g?g.phase:'lobby',serverNow:Date.now(),territories:TERRITORIES};
  if(!g)return basic;
  Object.assign(basic,{names:g.names,turn:g.turn,maxTurns:MAX_TURNS[g.mode],subPhase:phase(g),current:activeSeat(g),owners:g.owners,forts:g.forts,bonus:g.bonus,hints:g.hints,attackWins:g.attackWins,scores:[score(g,0),score(g,1)],lands:[landCount(g,0),landCount(g,1)],events:g.events,winner:g.winner,legal:g.phase==='map'&&seat===activeSeat(g)?legal(g):[],result:g.phase==='result'?g.result:null});
  if(g.phase==='question'){
    const p=g.pending,q=QUESTIONS[p.qid];
    basic.question={target:p.target,kind:p.kind,category:q.category,text:q.text,options:q.options,
      playing:targetPlayers(g).includes(seat),answered:!!p.answers[seat],opponentAnswered:!!p.answers[1-seat],
      hidden:p.hidden[seat],paused:p.paused,deadline:p.paused?null:p.deadline,remainingMs:remaining(p)};
  }
  return basic;
}
module.exports={QUESTION_MS,MAX_TURNS,safeName,newToken,createCode,createMatch,begin,remaining,answer,readyToResolve,addHint,resolve,advance,pass,snapshot};
