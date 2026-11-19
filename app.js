import {firebaseConfig} from './firebase-config.js';
import {questions, questionPools} from './questions.js?v=3';
import {initializeApp} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import {getAuth,signInAnonymously,onAuthStateChanged} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import {getDatabase,ref,onValue,runTransaction,get,set,serverTimestamp} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-database.js';
const el=document.getElementById('app'),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const configured=!!(firebaseConfig.apiKey&&firebaseConfig.databaseURL&&firebaseConfig.projectId);
let db,auth,uid,room=localStorage.getItem('dummeste-room'),state=null,offset=0,unsub=null,busy=false;
const code = () => crypto.getRandomValues(new Uint32Array(1))[0].toString(36).slice(-6).padStart(6, '0').toUpperCase();
const difficultyLabels = { easy: 'Lett', medium: 'Middels', hard: 'Vanskelig' };
const defaultDifficulty = 'medium';
let selectedDifficulty;

function shuffle(deck) {
  for (let index = deck.length - 1; index > 0; index--) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [deck[index], deck[swapIndex]] = [deck[swapIndex], deck[index]];
  }
  return deck;
}

function makeQuestionDeck(difficulty) {
  const pool = questionPools[difficulty];
  const deck = shuffle(pool.filter(index => !questions[index][3]));
  const pictureQuestions = shuffle(pool.filter(index => questions[index][3]));
  pictureQuestions.forEach((questionIndex, round) => {
    const position = round * QUESTIONS_PER_ROUND + Math.floor(Math.random() * QUESTIONS_PER_ROUND);
    deck.splice(position, 0, questionIndex);
  });
  return deck;
}

function lobbyDifficulty() {
  return selectedDifficulty ?? state.difficulty ?? defaultDifficulty;
}

function renderDifficultyPicker() {
  const selected = lobbyDifficulty();
  const options = Object.entries(difficultyLabels).map(([value, label]) =>
    `<option value="${value}"${value === selected ? ' selected' : ''}>${label}</option>`
  ).join('');
  return `<label class="difficulty-label" for="difficulty">Vanskelighetsnivå</label><select id="difficulty">${options}</select>`;
}
const QUESTIONS_PER_ROUND = 10;
const QUESTION_TIME_MS = 20_000;

const current=()=>state?.players?.[uid];
const questionsPerRound = game => game.questionsPerRound ?? 3;

function currentSubmission(game, playerId) {
  const submission = game.submissions?.[playerId];
  if (submission?.deadline === game.deadline && Number.isFinite(submission.sent) &&
      submission.sent < game.deadline) {
    return submission;
  }
}

function allActivePlayersAnswered(game) {
  const players = Object.entries(game.players ?? {}).filter(([, player]) => player.active);
  return players.length > 0 && players.every(([id]) => currentSubmission(game, id));
}
const active=()=>Object.entries(state?.players||{}).filter(([,p])=>p.active);
const remaining=()=>Math.max(0,Math.ceil(((state?.deadline||0)-(Date.now()+offset))/1000));
function msg(s){el.innerHTML=`<p class="error">${esc(s)}</p><button id="back">Til forsiden</button>`;document.getElementById('back').onclick=()=>{localStorage.removeItem('dummeste-room');location.reload()}}
function home(){el.innerHTML=`<h2>Spill fra hver deres mobil</h2><p class="muted">Lag et rom eller bli med med en seks tegn lang kode.</p><button id="create">Opprett nytt spill</button><div class="divider">ELLER</div><input id="room" placeholder="Romkode" maxlength="6" autocapitalize="characters"><input id="name" placeholder="Ditt navn" maxlength="24"><button id="join">Bli med i spillet</button><p class="small">Enheten som oppretter rommet må være tilkoblet gjennom hele spillet for å styre rundene automatisk.</p>`;document.getElementById('create').onclick=async()=>{const c=code();const r=ref(db,'rooms/'+c);try {
  const result = await runTransaction(r, value => value === null ? {
    host: uid, phase: 'lobby', created: Date.now() + offset,
    round: 1, qnum: 0, deadline: 0
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

function leaveRoom() {
  if (unsub) unsub();
  unsub = null;
  state = null;
  room = null;
  selectedDifficulty = undefined;
  localStorage.removeItem('dummeste-room');
  home();
}

function renderQuestionImage(image) {
  if (!image) return '';
  return `<img class="question-image" id="question-image" src="${esc(image.src)}" alt="${esc(image.clue)}" referrerpolicy="no-referrer"><p class="notice" id="question-clue" hidden>${esc(image.clue)}</p>`;
}

function listen(){
  if (unsub) unsub();
  const listeningRoom = room;
  unsub = onValue(ref(db, 'rooms/' + listeningRoom), snapshot => {
    if (room !== listeningRoom) return;
    state = snapshot.val();
    if (!state) {
      leaveRoom();
      return;
    }
    render();
    if (state.phase === 'question' && state.host === uid && allActivePlayersAnswered(state)) {
      advance();
    }
  }, error => {
    if (room !== listeningRoom) return;
    console.error(error);
    msg('Kunne ikke åpne spillrommet. Sjekk romkoden og prøv igjen.');
  });
}

function render(){if(!state)return home();const p=current(),host=state.host===uid;let html=`<div class="top"><span>Rom <strong>${esc(room)}</strong></span><span>${active().length} aktive / ${Object.keys(state.players||{}).length} spillere</span></div>`;
if(state.phase==='lobby'){html+=`<div class="code">${esc(room)}</div><p class="small">Del denne romkoden og nettadressen med vennene dine.</p><div class="players">${Object.values(state.players||{}).map(x=>`<span class="chip">${esc(x.name)}</span>`).join('')}</div>`;if(!p)html+=`<input id="name" placeholder="Ditt navn" maxlength="24"><button id="selfjoin">${host?'Bli med som spiller':'Bli med'}</button>`;if(host)html+=`${renderDifficultyPicker()}<button id="start" ${Object.keys(state.players||{}).length<2?'disabled':''}>Start spillet</button>`;else html+='<p class="muted">Venter på at spillet starter …</p>';
}else if(state.phase==='question'){const q=questions[state.deck[state.index]];html+=`<div class="top"><span>Runde ${state.round} · Oppgave ${state.qnum+1}/${questionsPerRound(state)}</span><span class="timer" id="timer">${remaining()} s</span></div><div class="question">${esc(q[0])}</div>${renderQuestionImage(q[3])}`;if(p?.active){const answer=state.submissions?.[uid]?.answer;html+=q[1].map((o,i)=>`<button class="option ${answer===i?'selected':''}" data-answer="${i}" ${answer!==undefined?'disabled':''}>${esc(o)}</button>`).join('');if(answer!==undefined)html+='<p class="muted">Svaret er registrert. Venter på de andre …</p>';}else html+='<p class="muted">Du er ute, men kan følge resten av spillet.</p>';
}else if(state.phase==='reveal'||state.phase==='elimination'){html+=`<h2>${state.phase==='elimination'?'En spiller ryker ut!':'Fasit'}</h2><div class="notice">${esc(state.lastText||'')}</div><p class="muted">Neste oppgave starter automatisk …</p>`;
}else if(state.phase==='finished'){const winner=active()[0]?.[1]?.name||'Ukjent';html+=`<h2>Spillet er ferdig!</h2><div class="winner">🏆 ${esc(winner)}</div><p class="muted">Gratulerer! Du er kveldens dummeste.</p>`;if(host)html+='<button id="reset">Nytt spill med samme gjeng</button>';}
const leaveLabel = state.phase === 'finished' ? 'Avslutt spillet' : 'Forlat spillrommet';
html+=`<button class="secondary" id="leave-room">${leaveLabel}</button>`;
html+=`<div class="line"><div class="players">${Object.values(state.players||{}).map(x=>`<span class="chip ${x.active?'':'out'}">${esc(x.name)}${state.phase!=='lobby'&&x.active?' · '+(x.points||0)+' p':''}</span>`).join('')}</div></div>`;el.innerHTML=html;

document.getElementById('leave-room').onclick = () => {
  const gameIsRunning = !['lobby', 'finished'].includes(state.phase);
  if (host && gameIsRunning && !window.confirm('Spillet stopper for de andre hvis du forlater rommet. Vil du fortsette?')) return;
  leaveRoom();
};

const picture = document.getElementById('question-image');
if (picture) {
  const clue = document.getElementById('question-clue');
  const showClue = () => {
    picture.hidden = true;
    clue.hidden = false;
  };
  picture.addEventListener('error', showClue, {once: true});
  if (picture.complete && !picture.naturalWidth) showClue();
}

const self=document.getElementById('selfjoin');if(self)self.onclick=async()=>{const name=document.getElementById('name').value.trim();if(!name)return;try {
  if (!await joinRoom(room, name)) msg('Navnet er opptatt, eller rommet er fullt.');
} catch (error) {
  console.error(error);
  msg('Kunne ikke koble til spillrommet. Prøv igjen.');
}};
const difficultyPicker = document.getElementById('difficulty');
if (difficultyPicker) {
  difficultyPicker.onchange = () => { selectedDifficulty = difficultyPicker.value; };
}
const start = document.getElementById('start');
if (start) start.onclick = () => {
  const difficulty = lobbyDifficulty();
  const deck = makeQuestionDeck(difficulty);
  return runTransaction(ref(db, 'rooms/' + room), game => {
    if (!game || game.host !== uid || game.phase !== 'lobby') return;
    admitPlayers(game);
    if (Object.keys(game.players ?? {}).length < 2) return game;
    game.phase = 'question';
    game.deck = deck;
    game.difficulty = difficulty;
    game.index = 0;
    game.qnum = 0;
    game.round = 1;
    game.questionsPerRound = QUESTIONS_PER_ROUND;
    game.deadline = Date.now() + offset + QUESTION_TIME_MS;
    delete game.submissions;
    return game;
  }, {applyLocally: false});
};
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
const reset=document.getElementById('reset');if(reset)reset.onclick=()=>runTransaction(ref(db,'rooms/'+room),v=>{if(!v||v.host!==uid)return;v.phase='lobby';v.round=1;v.qnum=0;delete v.deck;v.index=0;v.deadline=0;for(const p of Object.values(v.players||{})){p.active=true;p.points=0;p.ms=0;}return v;},{applyLocally:false});}
function phaseIsReady(game, now) {
  if (game.phase === 'finished') return false;
  if (game.phase === 'lobby') {
    return Object.values(game.requests ?? {}).some(request => !request.status);
  }
  return game.deadline <= now ||
    (game.phase === 'question' && allActivePlayersAnswered(game));
}

function openNextQuestion(game, now) {
  game.index++;
  delete game.submissions;
  game.phase = 'question';
  game.deadline = now + QUESTION_TIME_MS;
}

async function advance() {
  if (busy || !state || state.host !== uid || !phaseIsReady(state, Date.now() + offset)) return;

  busy = true;
  try {
    await runTransaction(ref(db, 'rooms/' + room), game => {
      const now = Date.now() + offset;
      if (!game || game.host !== uid || !phaseIsReady(game, now)) return;

      if (game.phase === 'lobby') {
        admitPlayers(game);
      } else if (game.phase === 'question') {
        const question = questions[game.deck[game.index]];
        for (const [id, player] of Object.entries(game.players ?? {})) {
          if (!player.active) continue;
          const submission = currentSubmission(game, id);
          if (submission?.answer === question[2]) player.points = (player.points ?? 0) + 1;
          const responseTime = submission
            ? Math.max(1, submission.sent - (game.deadline - QUESTION_TIME_MS))
            : QUESTION_TIME_MS;
          player.ms = (player.ms ?? 0) + responseTime;
        }
        game.lastText = `Riktig svar: ${question[1][question[2]]}`;
        game.phase = 'reveal';
        game.deadline = now + 3500;
      } else if (game.phase === 'reveal') {
        if (game.qnum + 1 < questionsPerRound(game)) {
          game.qnum++;
          openNextQuestion(game, now);
        } else {
          const sorted = Object.entries(game.players).filter(([, player]) => player.active)
            .sort((a, b) => (b[1].points ?? 0) - (a[1].points ?? 0) ||
              (a[1].ms ?? 0) - (b[1].ms ?? 0) || (a[1].joined ?? 0) - (b[1].joined ?? 0));
          if (!sorted.length) return;
          const eliminated = sorted[0][1];
          eliminated.active = false;
          game.lastText = `${eliminated.name} var for flink og ryker ut!`;
          game.phase = sorted.length === 2 ? 'finished' : 'elimination';
          game.deadline = now + 5500;
        }
      } else if (game.phase === 'elimination') {
        game.round++;
        game.qnum = 0;
        for (const player of Object.values(game.players)) {
          player.points = 0;
          player.ms = 0;
        }
        openNextQuestion(game, now);
      }
      return game;
    }, {applyLocally: false});
  } catch (error) {
    console.error(error);
  } finally {
    busy = false;
  }
}
if(!configured){el.innerHTML='<h2>Flerspiller er ikke aktivert ennå</h2><p>Spillrom blir tilgjengelige når Firebase er koblet til.</p>';}else{try{const app=initializeApp(firebaseConfig);auth=getAuth(app);db=getDatabase(app);onAuthStateChanged(auth,async user=>{if(!user){try{await signInAnonymously(auth);}catch(error){console.error(error);msg('Kunne ikke logge inn i spillet. Prøv igjen.');}return;}uid=user.uid;try{const server=await get(ref(db,'.info/serverTimeOffset'));offset=server.val()||0;}catch{}if(room)listen();else home();setInterval(()=>{if(state){const t=document.getElementById('timer');if(t)t.textContent=remaining()+' s';advance();}},700);});}catch(e){msg('Firebase kunne ikke starte: '+e.message);}}
