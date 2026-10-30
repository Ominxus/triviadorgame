'use strict';
const el=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const SESSION_KEY='trivia-realms-online-session-v1';
let ws=null,state=null,session=null,tab='create',localDeadline=null,toastTimer=null;
try{session=JSON.parse(localStorage.getItem(SESSION_KEY)||'null');}catch{session=null;}
function send(type,fields={}){if(!ws||ws.readyState!==WebSocket.OPEN){toast('Connection lost. Reconnecting…');return false;}ws.send(JSON.stringify({type,...fields}));return true;}
function toast(text){el('toast').textContent=text;el('toast').classList.remove('hidden');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el('toast').classList.add('hidden'),3200);}
function connectionView(status){const pill=el('connectionPill');pill.className='connection-pill '+status;pill.innerHTML='<span class="connection-dot"></span> '+(status==='online'?'Connected':status==='offline'?'Disconnected':'Connecting');}
function connect(){connectionView('connecting');ws=new WebSocket((location.protocol==='https:'?'wss://':'ws://')+location.host+'/ws');
  ws.onopen=()=>{connectionView('online');if(session)send('resume',session);};
  ws.onmessage=ev=>{let m;try{m=JSON.parse(ev.data);}catch{return;}
    if(m.type==='joined'){session={code:m.code,token:m.token};try{localStorage.setItem(SESSION_KEY,JSON.stringify(session));}catch{};history.replaceState(null,'','/?room='+encodeURIComponent(m.code));return;}
    if(m.type==='state'){state=m.state;render();return;}
    if(m.type==='session-expired'){session=null;state=null;localStorage.removeItem(SESSION_KEY);render();toast('That room is no longer available. Create or join a new room.');return;}
    if(m.type==='taken-over'){session=null;state=null;render();toast('This seat was opened in another tab.');return;}
    if(m.type==='left'){session=null;state=null;localStorage.removeItem(SESSION_KEY);history.replaceState(null,'','/');render();return;}
    if(m.type==='error'){toast(m.message||'Action could not be completed.');el('homeError').textContent=m.message||'Could not join the room.';el('homeError').classList.toggle('hidden',!!state);}
  };
  ws.onerror=()=>{};
  ws.onclose=()=>{connectionView('offline');setTimeout(connect,1800);};
}
function setTab(next){tab=next;for(const b of document.querySelectorAll('[data-tab]')){const yes=b.dataset.tab===next;b.classList.toggle('active',yes);b.setAttribute('aria-selected',String(yes));}el('joinFields').classList.toggle('hidden',next!=='join');el('createFields').classList.toggle('hidden',next!=='create');el('roomSubmit').innerHTML=next==='join'?'⚔ Join the battle <span aria-hidden="true">→</span>':'♜ Create private room <span aria-hidden="true">→</span>';el('homeError').classList.add('hidden');}
function render(){const joined=!!state;
  el('homeScreen').classList.toggle('hidden',joined);
  el('roomScreen').classList.toggle('hidden',!joined);
  el('exitButton').classList.toggle('hidden',!joined);
  if(!joined){el('sceneOverlay').classList.add('hidden');return;}
  el('roomCodeText').textContent=state.code;
  const lobby=state.stage==='lobby';
  el('lobbyStage').classList.toggle('hidden',!lobby);
  el('matchStage').classList.toggle('hidden',lobby);
  if(lobby){renderLobby();el('sceneOverlay').classList.add('hidden');return;}
  renderMatch();renderScene();
}
function renderLobby(){
  const both=state.players.every(p=>p&&p.online);
  const full=state.players[1]!=null;
  el('lobbyMessage').textContent=!full?'Waiting for your rival to enter the kingdom…':!both?'Your rival has disconnected. Waiting for them to rejoin…':'Both champions are here. Prepare for battle!';
  el('lobbyPlayers').innerHTML=[0,1].map(i=>{const p=state.players[i],status=p?(p.online?'● Online':'○ Offline'):'Waiting for player…';return `<div class="lobby-player ${i===0?'blue':'red'}"><span>${i===0?'♜':'♞'}</span><b>${esc(p?.name||(i===0?'Host':'Challenger'))}</b><small class="${p?.online?'online':''}">${status}</small></div>`;}).join('');
  el('lobbyControls').innerHTML=state.host?`<button type="button" class="primary-button wide" data-action="start" ${both?'':'disabled'}>⚔ Begin the conquest →</button>`:'<div class="wait-pill">Waiting for the host to begin the match…</div>';
}
function polygon(cx,cy,r=56){return Array.from({length:6},(_,i)=>{const a=(-90+i*60)*Math.PI/180;return `${(cx+Math.cos(a)*r).toFixed(1)},${(cy+Math.sin(a)*r).toFixed(1)}`;}).join(' ');}
function renderMap(){const svg=el('realmMap');let out=`<defs><radialGradient id="seaGlow"><stop stop-color="#417b86" stop-opacity=".27"/><stop offset="1" stop-color="#183e49" stop-opacity="0"/></radialGradient><filter id="landShadow" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="1" dy="4" stdDeviation="3" flood-color="#030c1a" flood-opacity=".65"/></filter></defs><ellipse cx="325" cy="235" rx="323" ry="201" fill="url(#seaGlow)"/><path d="M30 396 Q105 427 210 420 M475 30 Q535 40 606 105 M19 185 Q10 260 30 288" fill="none" stroke="#91bdba" stroke-opacity=".15" stroke-width="2" stroke-dasharray="4 8"/>`;
  for(const t of state.territories){const owner=state.owners[t.id],cl=owner===null?'neutral':owner===0?'blue':'red',can=state.legal.includes(t.id)&&allOnline();const home=t.capital!==null;const shield=home?state.forts[t.capital]:null;
    const middle=home?`<text x="0" y="-7" class="tower">🏰</text><text x="0" y="16" class="shield">${shield} 🛡</text>`:`<text x="0" y="-6" class="terrain">${esc(t.icon)}</text><text x="0" y="27" class="t-value">${t.value} pts</text>`;
    out+=`<g role="button" tabindex="${can?'0':'-1'}" class="territory ${cl} ${can?'legal':''}" data-territory="${t.id}" aria-label="${esc(t.name)}: ${owner===null?'unclaimed':esc(state.names[owner])}${can?', available to challenge':''}" transform="translate(${t.x} ${t.y})"><title>${esc(t.name)} — ${home?'Castle':t.value+' points'}</title><polygon class="land" filter="url(#landShadow)" points="${polygon(0,0)}"/><polygon class="inner" points="${polygon(0,0,47)}"/>${middle}<text class="t-name" x="0" y="${home?36:12}">${esc(t.name)}</text></g>`;
  }
  svg.innerHTML=out;
}
function allOnline(){return !!state?.players?.every(p=>p&&p.online);}
function renderMatch(){
  renderMap();
  el('legendBlue').textContent=state.names[0];el('legendRed').textContent=state.names[1];
  const expansion=state.subPhase==='expansion';
  el('phaseBadge').textContent=expansion?'🌿 EXPANSION':'⚔ BATTLE';
  el('mapSubtitle').textContent=expansion?'Claim neutral lands with correct answers.':'Attack neighboring enemy lands or claim neutral regions.';
  el('mapFooter').textContent=!allOnline()?'⚠ A player is offline. Play resumes once both are connected.':state.stage==='map'&&state.current===state.seat?'✨ Click a glowing neighboring territory to challenge it.':state.stage==='map'?'⏳ It is your rival’s turn to choose a territory.':'⚔ A challenge is underway.';
  el('scoreboard').innerHTML=[0,1].map(i=>{const p=state.players[i];return `<div class="player-row ${i===1?'red':''} ${state.current===i&&state.stage!=='gameover'?'active':''}"><div class="avatar">${i===0?'♜':'♞'}</div><div><div class="name">${esc(p?.name||'Player')}</div><div class="stats">${state.lands[i]} lands · ${state.forts[i]} 🛡 · ${state.hints[i]} hints</div><div class="status ${p?.online?'':'disconnected'}">${p?.online?'● Online':'○ Offline'} ${state.seat===i?'· YOU':''}</div></div><div class="points">${state.scores[i].toLocaleString()}</div></div>`;}).join('');
  const my=state.current===state.seat,player=esc(state.names[state.current]),count=state.legal.length;
  const stage=state.stage;
  let text=stage==='gameover'?'The campaign has ended.':!allOnline()?'Your opponent is offline; the match is paused.':stage==='map'?(my?'It is your move. Choose a glowing neighboring territory.':'Your rival is choosing the next challenge.'):'The question is being answered.';
  el('turnInfo').innerHTML=`<h3>${stage==='gameover'?'The crown is claimed':my?'Your turn':player+'’s turn'}</h3><p>${text}</p><div class="note">Turn ${Math.min(state.turn+1,state.maxTurns)} of ${state.maxTurns} · ${expansion?'Expansion':'Battle'} phase${stage==='map'&&my?' · '+count+' available':' '}</div>${stage==='map'&&my?`<button type="button" class="outline-button" data-action="pass" ${allOnline()?'':'disabled'}>⏭ Pass turn</button>`:''}`;
  el('battleLog').innerHTML=(state.events.length?state.events.map(e=>`<div class="chronicle-entry"><span>${esc(e.ico)}</span><div>${esc(e.message)}</div></div>`).join(''):'<div class="chronicle-entry">History will be written here.</div>');
}
function renderScene(){let html='';
  if(state.stage==='question')html=questionHTML();
  else if(state.stage==='result')html=resultHTML();
  else if(state.stage==='gameover')html=winnerHTML();
  el('sceneOverlay').classList.toggle('hidden',!html);
  if(html)el('sceneCard').innerHTML=html;
  if(state.stage==='question'){
    const q=state.question;
    localDeadline=q.paused?null:Date.now()+Math.max(0,q.deadline-state.serverNow);
    updateTimer();
  }
}
function questionHTML(){const q=state.question,t=state.territories[q.target],attacker=state.names[state.current];
  if(!allOnline()||q.paused)return `<div class="center-symbol">⏸️</div><div class="tag">BATTLE PAUSED</div><h2>Waiting for reconnection</h2><p class="description">${esc(state.players.find(p=>!p?.online)?.name||'A player')} is offline. The timer is paused and will resume when both players return.</p><div class="wait-pill">⏳ Your realm is safe while waiting.</div>`;
  const badge=`<div class="question-top"><div class="question-category">✦ ${esc(q.category)} · ${q.kind==='duel'?'Trivia duel':'Conquest'}</div><span id="clock" class="countdown">20s</span></div><div class="time-track"><div id="timeFill" class="time-fill"></div></div>`;
  const title=`<div class="question-owner ${state.seat===1?'red':''}">${esc(q.kind==='duel'?'⚔ Battle for ':'🏳 Claiming ')}${esc(t.name)} · ${state.seat===state.current?'Attacker':'Defender'}</div><div class="question-text">${esc(q.text)}</div>`;
  let body='';
  if(!q.playing)body=`<div class="wait-pill">${esc(attacker)} is claiming this territory. Watch the map when their answer is resolved.</div>`;
  else if(q.answered)body=`<div class="wait-pill">✅ Your answer is locked in.<br>${q.kind==='duel'?'Waiting for your opponent to answer…':'Calculating your conquest…'}</div>`;
  else{body=`<div class="answer-grid">${q.options.map((opt,i)=>`<button type="button" class="answer-option ${q.hidden.includes(i)?'omitted':''}" data-answer="${i}" ${q.hidden.includes(i)?'disabled':''}><span class="letter">${'ABCD'[i]}</span><span>${esc(opt)}</span></button>`).join('')}</div><div class="question-bottom"><span>⌨️ Press 1–4 to answer · ${q.kind==='duel'?(q.opponentAnswered?'Rival has answered':'Both answer privately'):'One chance to conquer'}</span><button type="button" class="hint-button" data-action="hint" ${state.hints[state.seat]&&q.hidden.length===0?'':'disabled'}>✧ ${state.hints[state.seat]&&q.hidden.length===0?'Use 50:50 hint':'Hint unavailable'}</button></div>`;}
  return badge+title+body;
}
function updateTimer(){const clock=el('clock'),fill=el('timeFill');if(!clock||!fill||state?.stage!=='question'||!state.question)return;
  const left=state.question.paused?state.question.remainingMs:Math.max(0,localDeadline-Date.now());
  clock.textContent=Math.ceil(left/1000)+'s';clock.classList.toggle('urgent',left<=5000);
  fill.style.width=Math.max(0,Math.min(100,left/200))+'%';
}
function resultHTML(){const r=state.result;if(!r)return '';
  const correct=r.options?.[r.correct]||'—';
  const badge=(r.answers||[]).map((a,i)=>{const good=a&&a.choice===r.correct;const answer=a?.choice===null||!a?'Ran out of time':r.options[a.choice];return `<div class="outcome-item"><b class="${i===0?'azure-text':'crimson-text'}">${esc(state.names[i])}</b><div class="ans">${esc(answer)}</div>${a?`<span class="result-chip ${good?'good':''}">${good?'✓ Correct':'✗ Incorrect'} · ${(a.timeMs/1000).toFixed(1)}s</span>`:'<span class="result-chip">Not involved</span>'}</div>`;}).join('');
  return `<div class="center-symbol">${state.winner!==null?'👑':r.winning===null?'⌛':r.winning===state.current?'⚔️':'🛡️'}</div><div class="tag">${r.kind==='duel'?'BATTLE REPORT':'CONQUEST REPORT'}</div><h2>${esc(r.heading)}</h2><p class="description">Correct answer: <strong class="gold-text">${esc(correct)}</strong></p><div class="outcome-grid">${badge}</div><div class="result-note">${esc(r.message)}</div><button type="button" class="primary-button wide" data-action="next">${state.winner!==null?'Reveal the champion':'Continue to next turn'} →</button>`;
}
function winnerHTML(){const tie=state.winner==='tie',winner=tie?'A legendary draw!':`${esc(state.names[state.winner])} reigns supreme!`;
  return `<div class="center-symbol">👑</div><div class="tag">THE CAMPAIGN HAS ENDED</div><h2>${winner}</h2><p class="description">${tie?'The two houses fought to a perfect draw.':`The crown of Eldoria belongs to ${esc(state.names[state.winner])}. A realm won by strategy, courage and knowledge.`}</p><div class="victory-stats">${[0,1].map(i=>`<div class="victory-stat"><span class="${i===0?'azure-text':'crimson-text'}">${esc(state.names[i])}</span><strong>${state.scores[i].toLocaleString()}</strong><small>${state.lands[i]} territories · ${state.attackWins[i]} attacks won</small></div>`).join('')}</div>${state.host?`<button type="button" class="primary-button wide" data-action="rematch" ${allOnline()?'':'disabled'}>⚔ Play another match →</button>`:'<div class="wait-pill">Waiting for the host to start a rematch…</div>'}`;
}
async function copyText(text){try{await navigator.clipboard.writeText(text);toast('Copied to clipboard!');}catch{const box=document.createElement('textarea');box.value=text;document.body.append(box);box.select();const ok=document.execCommand('copy');box.remove();toast(ok?'Copied to clipboard!':'Copy this manually: '+text);}}
document.addEventListener('click',e=>{
  const tabButton=e.target.closest('[data-tab]');if(tabButton){setTab(tabButton.dataset.tab);return;}
  const terrain=e.target.closest('[data-territory]');if(terrain){const target=Number(terrain.dataset.territory);if(state?.legal.includes(target)&&allOnline())send('challenge',{target});return;}
  const a=e.target.closest('[data-answer]');if(a&&state?.stage==='question'&&state.question.playing&&!state.question.answered&&!state.question.paused){send('answer',{choice:Number(a.dataset.answer)});a.disabled=true;return;}
  const button=e.target.closest('[data-action]');if(!button)return;
  const action=button.dataset.action;
  if(action==='start'||action==='rematch'||action==='next'||action==='pass'||action==='hint')send(action);
  else if(action==='copy-code')copyText(state.code);
  else if(action==='copy-link')copyText(location.origin+'/?room='+encodeURIComponent(state.code));
  else if(action==='close-rules')el('rulesOverlay').classList.add('hidden');
});
el('roomForm').addEventListener('submit',e=>{e.preventDefault();if(ws?.readyState!==WebSocket.OPEN){toast('Connecting to the game server…');return;}
  const name=el('displayName').value.trim().slice(0,18);if(!name){el('homeError').textContent='Please enter a champion name.';el('homeError').classList.remove('hidden');return;}
  el('homeError').classList.add('hidden');
  if(tab==='create')send('create',{name,mode:el('matchMode').value});
  else{const code=el('roomInput').value.trim().toUpperCase();if(!/^[A-Z2-9]{6}$/.test(code)){el('homeError').textContent='Enter the six-character room code.';el('homeError').classList.remove('hidden');return;}send('join',{name,code});}
});
el('roomInput').addEventListener('input',()=>{el('roomInput').value=el('roomInput').value.toUpperCase().replace(/[^A-Z2-9]/g,'').slice(0,6);});
el('rulesButton').onclick=()=>el('rulesOverlay').classList.remove('hidden');
el('exitButton').onclick=()=>{if(confirm('Leave this room? In-progress seats are reserved, so you cannot rejoin without your saved session. Closing the tab keeps your session for reconnection.'))send('leave');};
document.addEventListener('keydown',e=>{if(el('rulesOverlay').classList.contains('hidden')&&state?.stage==='question'&&state.question.playing&&!state.question.answered&&!state.question.paused&&!e.altKey&&!e.metaKey&&!e.ctrlKey){const i=Number(e.key)-1;if(i>=0&&i<4&&!state.question.hidden.includes(i)){send('answer',{choice:i});e.preventDefault();}}if(e.key==='Escape')el('rulesOverlay').classList.add('hidden');});
const codeParam=new URLSearchParams(location.search).get('room');if(codeParam&&/^[A-Za-z2-9]{6}$/.test(codeParam)){el('roomInput').value=codeParam.toUpperCase();setTab('join');}
setInterval(updateTimer,150);
render();connect();
