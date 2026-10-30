'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const Game=require('../server/game');const {TERRITORIES,QUESTIONS,neighbors}=require('../server/data');
test('map has two capitals and 18 territories with 96 questions',()=>{
  assert.equal(TERRITORIES.length,18);assert.equal(TERRITORIES.filter(t=>t.capital!==null).length,2);
  assert.equal(QUESTIONS.length,96);for(const q of QUESTIONS){assert.ok(q.answer>=0&&q.answer<4);assert.equal(q.options.length,4);}
});
test('correct neutral answer captures territory and awards points',()=>{
  const g=Game.createMatch(['Test A','Test B'],'quick');
  const target=TERRITORIES.find(t=>t.capital===null&&neighbors(t.id,4)).id; // Westwatch is ID 4
  assert.equal(Game.begin(g,0,target),true);
  assert.equal(g.phase,'question');
  const q=QUESTIONS[g.pending.qid];g.pending.paused=false;g.pending.deadline=Date.now()+20_000;
  assert.equal(Game.answer(g,0,q.answer),true);
  assert.equal(Game.answer(g,0,q.answer),false);
  assert.equal(Game.readyToResolve(g),true);Game.resolve(g);
  assert.equal(g.owners[target],0);assert.equal(g.bonus[0],20);assert.equal(g.phase,'result');
  assert.equal(Game.advance(g),true);assert.equal(g.turn,1);
});
test('private duel gives land to attacker if attacker correct and defender wrong',()=>{
  const g=Game.createMatch(['A','B']);g.turn=16;
  const target=TERRITORIES.find(t=>t.capital===null&&neighbors(t.id,4)).id;
  g.owners[target]=1;
  assert.equal(Game.begin(g,0,target),true);assert.equal(g.pending.kind,'duel');
  const q=QUESTIONS[g.pending.qid];g.pending.paused=false;g.pending.deadline=Date.now()+20_000;
  assert.equal(Game.answer(g,0,q.answer),true);assert.equal(Game.readyToResolve(g),false);
  assert.equal(Game.answer(g,1,(q.answer+1)%4),true);assert.equal(Game.readyToResolve(g),true);
  Game.resolve(g);assert.equal(g.owners[target],0);assert.equal(g.attackWins[0],1);
});
test('player views do not contain answer keys or rival hidden options during questions',()=>{
  const r={code:'AAAAAA',mode:'quick',players:[{name:'A',client:true},{name:'B',client:true}],game:Game.createMatch(['A','B'])};
  const g=r.game;const target=TERRITORIES.find(t=>t.capital===null&&neighbors(t.id,4)).id;
  Game.begin(g,0,target);g.pending.paused=false;g.pending.deadline=Date.now()+20_000;
  const s0=Game.snapshot(r,0),s1=Game.snapshot(r,1);
  assert.equal(s0.question.playing,true);assert.equal(s1.question.playing,false);
  assert.equal('answer' in s0.question,false);assert.equal('qid' in s0.question,false);
  assert.equal(JSON.stringify(s0).includes('correct'),false);
});
