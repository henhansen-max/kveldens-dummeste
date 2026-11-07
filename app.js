import {firebaseConfig} from './firebase-config.js';
import {questions} from './questions.js';
import {initializeApp} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import {getAuth,signInAnonymously,onAuthStateChanged} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import {getDatabase,ref,onValue,runTransaction,get,set,serverTimestamp} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-database.js';
const el=document.getElementById('app'),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const configured=!!(firebaseConfig.apiKey&&firebaseConfig.databaseURL&&firebaseConfig.projectId);
let db,auth,uid,room=localStorage.getItem('dummeste-room'),state=null,offset=0,unsub=null,busy=false;
const code = () => crypto.getRandomValues(new Uint32Array(1))[0].toString(36).slice(-6).padStart(6, '0').toUpperCase();
const shuffled=()=>questions.map((_,i)=>i).sort(()=>Math.random()-.5);
const current=()=>state?.players?.[uid];
const active=()=>Object.entries(state?.players||{}).filter(([,p])=>p.active);
const remaining=()=>Math.max(0,Math.ceil(((state?.deadline||0)-(Date.now()+offset))/1000));
function msg(s){el.innerHTML=`<p class="error">${esc(s)}</p><button id="back">Til forsiden</button>`;document.getElementById('back').onclick=()=>{localStorage.removeItem('dummeste-room');location.reload()}}
function home(){el.innerHTML=`<h2>Spill fra hver deres mobil</h2><p class="muted">Lag et rom eller bli med med en seks tegn lang kode.</p><button id="create">Opprett nytt spill</button><div class="divider">ELLER</div><input id="room" placeholder="Romkode" maxlength="6" autocapitalize="characters"><input id="name" placeholder="Ditt navn" maxlength="24"><button id="join">Bli med i spillet</button><p class="small">Enheten som oppretter rommet må være tilkoblet gjennom hele spillet for å styre rundene automatisk.</p>`;document.getElementById('create').onclick=async()=>{const c=code();const r=ref(db,'rooms/'+c);try {
  const result = await runTransaction(r, value => value === null ? {
    host: uid, phase: 'lobby', created: Date.now() + offset,
    round: 1, qnum: 0, deck: shuffled(), deadline: 0
  } : undefined, {applyLocally: false});
  if (!result.committed) return msg('Prøv å opprette rommet på nytt.');
  room = c;
  localStorage.setItem('dummeste-room', room);
  listen();
} catch (error) {
  console.error(error);
  msg('Kunne ikke opprette spillrommet. Prøv igjen.');
}};document.getElementById('join').onclick=async()=>{const c=document.getElementById('room').value.trim().toUpperCase(),name=document.getElementById('name').value.trim();if(!/^[A-Z0-9]{6}$/.test(c)||!name)return msg('Skriv inn romkode og navn.');try {
  if (!await joinRoom(c, name)) return msg('Rommet finnes ikke, er fullt, startet eller navnet er opptatt.');
  room = c;
  localStorage.setItem('dummeste-room', room);
  listen();
} catch (error) {
  console.error(error);
  msg('Kunne ikke koble til spillrommet. Prøv igjen.');
}};}
async function joinRoom(code, name) {
  const request = ref(db, 'rooms/' + code + '/requests/' + uid);
  await runTransaction(request, value => {
    if (value?.status === 'accepted') return;
    return {name: name.slice(0, 24)};
  }, {applyLocally: false});

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      stop();
      reject(new Error('Spillverten svarte ikke'));
    }, 15000);
    const stop = onValue(request, snapshot => {
      const status = snapshot.val()?.status;
      if (!status) return;
      clearTimeout(timeout);
      queueMicrotask(() => stop());
      resolve(status === 'accepted');
    }, error => {
      clearTimeout(timeout);
      reject(error);
    });
  });
}

function admitPlayers(value) {
  const players = value.players ?? {};
  for (const [id, request] of Object.entries(value.requests ?? {})) {
    if (request.status) continue;
    if (players[id]) {
      request.status = 'accepted';
      continue;
    }
    const name = request.name;
    const duplicate = Object.values(players).some(player => player.name.toLowerCase() === name.toLowerCase());
    if (Object.keys(players).length >= 8 || duplicate) {
      request.status = 'rejected';
      continue;
    }
    players[id] = {name, active: true, points: 0, ms: 0, joined: Date.now() + offset};
    request.status = 'accepted';
  }
  value.players = players;
}

function listen(){
  if (unsub) unsub();
  unsub = onValue(ref(db, 'rooms/' + room), snapshot => {
    state = snapshot.val();
    if (!state) {
      room = null;
      localStorage.removeItem('dummeste-room');
      home();
      return;
    }
    render();
  }, error => {
    console.error(error);
    msg('Kunne ikke åpne spillrommet. Sjekk romkoden og prøv igjen.');
  });
}

function render(){if(!state)return home();const p=current(),host=state.host===uid;let html=`<div class="top"><span>Rom <strong>${esc(room)}</strong></span><span>${active().length} aktive / ${Object.keys(state.players||{}).length} spillere</span></div>`;
if(state.phase==='lobby'){html+=`<div class="code">${esc(room)}</div><p class="small">Del denne romkoden og nettadressen med vennene dine.</p><div class="players">${Object.values(state.players||{}).map(x=>`<span class="chip">${esc(x.name)}</span>`).join('')}</div>`;if(!p)html+=`<input id="name" placeholder="Ditt navn" maxlength="24"><button id="selfjoin">${host?'Bli med som spiller':'Bli med'}</button>`;if(host)html+=`<button id="start" ${Object.keys(state.players||{}).length<2?'disabled':''}>Start spillet</button>`;else html+='<p class="muted">Venter på at spillet starter …</p>';
}else if(state.phase==='question'){const q=questions[state.deck[state.index]];html+=`<div class="top"><span>Runde ${state.round} · Oppgave ${state.qnum+1}/3</span><span class="timer" id="timer">${remaining()} s</span></div><div class="question">${esc(q[0])}</div>`;if(p?.active){const answer=state.submissions?.[uid]?.answer;html+=q[1].map((o,i)=>`<button class="option ${answer===i?'selected':''}" data-answer="${i}" ${answer!==undefined?'disabled':''}>${esc(o)}</button>`).join('');if(answer!==undefined)html+='<p class="muted">Svaret er registrert. Venter på de andre …</p>';}else html+='<p class="muted">Du er ute, men kan følge resten av spillet.</p>';
}else if(state.phase==='reveal'||state.phase==='elimination'){html+=`<h2>${state.phase==='elimination'?'En spiller ryker ut!':'Fasit'}</h2><div class="notice">${esc(state.lastText||'')}</div><p class="muted">Neste oppgave starter automatisk …</p>`;
}else if(state.phase==='finished'){const winner=active()[0]?.[1]?.name||'Ukjent';html+=`<h2>Spillet er ferdig!</h2><div class="winner">🏆 ${esc(winner)}</div><p class="muted">Gratulerer! Du er kveldens dummeste.</p>`;if(host)html+='<button id="reset">Nytt spill med samme gjeng</button>';}html+=`<div class="line"><div class="players">${Object.values(state.players||{}).map(x=>`<span class="chip ${x.active?'':'out'}">${esc(x.name)}${state.phase!=='lobby'&&x.active?' · '+(x.points||0)+' p':''}</span>`).join('')}</div></div>`;el.innerHTML=html;
const self=document.getElementById('selfjoin');if(self)self.onclick=async()=>{const name=document.getElementById('name').value.trim();if(!name)return;try {
  if (!await joinRoom(room, name)) msg('Navnet er opptatt, eller rommet er fullt.');
} catch (error) {
  console.error(error);
  msg('Kunne ikke koble til spillrommet. Prøv igjen.');
}};
const start=document.getElementById('start');if(start)start.onclick=()=>runTransaction(ref(db,'rooms/'+room),v=>{if(!v||v.host!==uid||v.phase!=='lobby')return;admitPlayers(v);if(Object.keys(v.players||{}).length<2)return v;v.phase='question';v.index=0;v.qnum=0;v.round=1;v.deadline=Date.now()+offset+20000;delete v.submissions;return v;},{applyLocally:false});
const deadline = state.deadline;
document.querySelectorAll('[data-answer]').forEach(button => {
  button.onclick = async () => {
    if (Date.now() + offset >= deadline) return;
    const options = document.querySelectorAll('[data-answer]');
    options.forEach(option => { option.disabled = true; });
    try {
      await set(ref(db, 'rooms/' + room + '/submissions/' + uid), {
        answer: Number(button.dataset.answer), deadline, sent: serverTimestamp()
      });
    } catch (error) {
      console.error(error);
      if (state?.deadline === deadline && !state.submissions?.[uid]) {
        options.forEach(option => { option.disabled = false; });
      }
    }
  };
});
const reset=document.getElementById('reset');if(reset)reset.onclick=()=>runTransaction(ref(db,'rooms/'+room),v=>{if(!v||v.host!==uid)return;v.phase='lobby';v.round=1;v.qnum=0;v.deck=shuffled();v.index=0;v.deadline=0;for(const p of Object.values(v.players||{})){p.active=true;p.points=0;p.ms=0;}return v;},{applyLocally:false});}
async function advance(){if(busy||!state||state.host!==uid||state.phase==='finished')return;
if (state.phase === 'lobby') {
  if (!Object.values(state.requests ?? {}).some(request => !request.status)) return;
} else if (state.deadline > Date.now() + offset) return;
busy=true;try{await runTransaction(ref(db,'rooms/'+room),v=>{if(!v||v.host!==uid)return;
if (v.phase === 'lobby') {
  admitPlayers(v);
  return v;
}
const now=Date.now()+offset;
if (v.deadline > now || v.phase === 'finished') return;
if(v.phase==='question'){const q=questions[v.deck[v.index]];for(const [id,p] of Object.entries(v.players||{})){if(!p.active)continue;const submission=v.submissions?.[id];if(submission?.answer===q[2])p.points=(p.points||0)+1;p.ms=(p.ms||0)+(submission?Math.max(1,20000-(v.deadline-submission.sent)):20000);}v.lastText=`Riktig svar: ${q[1][q[2]]}`;v.phase='reveal';v.deadline=now+3500;}else if(v.phase==='reveal'){if(v.qnum<2){v.qnum++;v.index++;delete v.submissions;v.phase='question';v.deadline=now+20000;}else{const sorted=Object.entries(v.players).filter(([,p])=>p.active).sort((a,b)=>(b[1].points||0)-(a[1].points||0)||(a[1].ms||0)-(b[1].ms||0)||(a[1].joined||0)-(b[1].joined||0));if(!sorted.length)return;v.players[sorted[0][0]].active=false;v.lastText=`${sorted[0][1].name} var for flink og ryker ut!`;v.phase=sorted.length===2?'finished':'elimination';v.deadline=now+5500;}}else if(v.phase==='elimination'){v.round++;v.qnum=0;v.index++;delete v.submissions;for(const p of Object.values(v.players)){p.points=0;p.ms=0;}v.phase='question';v.deadline=now+20000;}return v;},{applyLocally:false});}catch(e){console.error(e)}finally{busy=false;}}
if(!configured){el.innerHTML='<h2>Flerspiller er ikke aktivert ennå</h2><p>Spillrom blir tilgjengelige når Firebase er koblet til.</p>';}else{try{const app=initializeApp(firebaseConfig);auth=getAuth(app);db=getDatabase(app);onAuthStateChanged(auth,async user=>{if(!user){try{await signInAnonymously(auth);}catch(error){console.error(error);msg('Kunne ikke logge inn i spillet. Prøv igjen.');}return;}uid=user.uid;try{const server=await get(ref(db,'.info/serverTimeOffset'));offset=server.val()||0;}catch{}if(room)listen();else home();setInterval(()=>{if(state){const t=document.getElementById('timer');if(t)t.textContent=remaining()+' s';advance();}},700);});}catch(e){msg('Firebase kunne ikke starte: '+e.message);}}
