// Лулу мессссссссссссссселдежерер — клиент
const API = '';
let me = null;
let token = localStorage.getItem('lulu_token');
let currentChat = null;
let socket = null;
let contacts = [];
let chats = [];
let messagesCache = [];
let selectedFile = null;

// DOM
const loginScreen = document.getElementById('loginScreen');
const appEl = document.getElementById('app');
const loginInput = document.getElementById('loginInput');
const loginBtn = document.getElementById('loginBtn');
const loginError = document.getElementById('loginError');
const myUsername = document.getElementById('myUsername');
const myAvatar = document.getElementById('myAvatar');
const avatarInput = document.getElementById('avatarInput');
const searchInput = document.getElementById('searchInput');
const searchBtn = document.getElementById('searchBtn');
const addContactBtn = document.getElementById('addContactBtn');
const searchResult = document.getElementById('searchResult');
const contactsList = document.getElementById('contactsList');
const chatsList = document.getElementById('chatsList');
const messagesEl = document.getElementById('messages');
const chatTitle = document.getElementById('chatTitle');
const msgInput = document.getElementById('msgInput');
const sendBtn = document.getElementById('sendBtn');
const photoInput = document.getElementById('photoInput');
const videoInput = document.getElementById('videoInput');
const fileName = document.getElementById('fileName');
const typingIndicator = document.getElementById('typingIndicator');
const voiceCallBtn = document.getElementById('voiceCallBtn');
const voiceHangBtn = document.getElementById('voiceHangBtn');
const voiceStatus = document.getElementById('voiceStatus');
const remoteAudio = document.getElementById('remoteAudio');
const connStatus = document.getElementById('connStatus');
const onlineCount = document.getElementById('onlineCount');

// init
if(token){
  fetchMe();
} else {
  showLogin();
}

loginBtn.onclick = doLogin;
loginInput.onkeydown = e=>{ if(e.key==='Enter') doLogin(); };
document.getElementById('logoutBtn').onclick = ()=>{
  localStorage.removeItem('lulu_token');
  location.reload();
};

async function doLogin(){
  const username = loginInput.value.trim();
  if(!username){ loginError.textContent='Введи логин!'; return; }
  loginBtn.disabled=true; loginError.textContent='Соединение с сервером 56k...';
  try{
    const res = await fetch('/api/auth/login', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({username})});
    const data = await res.json();
    if(!res.ok) throw new Error(data.error||'Ошибка');
    token = data.token;
    localStorage.setItem('lulu_token', token);
    me = data.user;
    if(data.isNew) alert(`Добро пожаловать, ${me.username}! Аккаунт создан. Не забудь поставить аву!`);
    await fetchMe();
  }catch(e){
    loginError.textContent = e.message;
  }finally{ loginBtn.disabled=false; }
}

async function fetchMe(){
  try{
    const res = await fetch('/api/me', {headers:{'x-token':token}});
    if(!res.ok) throw new Error('auth');
    me = await res.json();
    showApp();
  }catch(e){
    localStorage.removeItem('lulu_token');
    token=null;
    showLogin();
  }
}

function showLogin(){
  loginScreen.classList.remove('hidden');
  appEl.classList.add('hidden');
}
function showApp(){
  loginScreen.classList.add('hidden');
  appEl.classList.remove('hidden');
  myUsername.textContent = me.username;
  myAvatar.src = me.avatar || 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="%23c0c0c0"/><text x="50" y="60" text-anchor="middle" font-size="40">👤</text></svg>';
  initSocket();
  loadContacts();
  loadChats();
  initMusic();
  initMinesweeper();
  initEggGame();
  initModes();
}

// avatar
avatarInput.onchange = async()=>{
  const f = avatarInput.files[0];
  if(!f) return;
  const fd = new FormData();
  fd.append('avatar', f);
  const res = await fetch('/api/avatar', {method:'POST', headers:{'x-token':token}, body: fd});
  const data = await res.json();
  if(res.ok){ me=data; myAvatar.src=data.avatar; alert('Аватарка обновлена! Теперь ты уникальный!'); }
  else alert(data.error);
};

// contacts
async function loadContacts(){
  const res = await fetch('/api/contacts', {headers:{'x-token':token}});
  contacts = await res.json();
  renderContacts();
}
function renderContacts(){
  contactsList.innerHTML = contacts.length? contacts.map(c=>`
    <div class="contact-item" data-id="${c.id}" onclick="openPrivate('${c.username}')">
      <img src="${c.avatar||'data:image/svg+xml;utf8,<svg xmlns=%27http://www.w3.org/2000/svg%27 width=%2732%27 height=%2732%27><rect width=%2732%27 height=%2732%27 fill=%27%23fff%27/><text x=%2716%27 y=%2720%27 text-anchor=%27middle%27 font-size=%2716%27>👤</text></svg>'}">
      <div><div>${c.username}</div><div class="meta">${c.avatar?'● ава есть':'○ без авы'}</div></div>
    </div>
  `).join('') : '<div class="small" style="padding:6px; background:#fff; border:1px inset #808080;">Контактов нет. Добавь первого друга по логину сверху!</div>';
}

searchBtn.onclick = doSearch;
addContactBtn.onclick = doAddContact;
searchInput.onkeydown = e=>{ if(e.key==='Enter') doSearch(); };

let lastSearch = null;
async function doSearch(){
  const q = searchInput.value.trim();
  if(!q) return;
  searchResult.textContent='Поиск среди реальных пользователей...';
  const res = await fetch('/api/users/search?q='+encodeURIComponent(q), {headers:{'x-token':token}});
  const users = await res.json();
  if(users.length){
    lastSearch = users[0];
    searchResult.innerHTML = `Найден: <b>${users[0].username}</b> <img src="${users[0].avatar||''}" style="width:20px;height:20px;vertical-align:middle;border:1px solid #000;"> — нажми «+ ДОБАВИТЬ»`;
  } else {
    lastSearch=null;
    searchResult.textContent='Не найдено. Только реальные логины, без фейков!';
  }
}
async function doAddContact(){
  const q = searchInput.value.trim() || (lastSearch && lastSearch.username);
  if(!q) return alert('Введи логин');
  const res = await fetch('/api/contacts/add', {method:'POST', headers:{'Content-Type':'application/json','x-token':token}, body: JSON.stringify({username:q})});
  const data = await res.json();
  if(!res.ok) return alert(data.error);
  searchResult.textContent=`✓ Добавлен ${q}`;
  searchInput.value='';
  await loadContacts();
  await loadChats();
}

window.openPrivate = async(username)=>{
  // найти чат
  await loadChats();
  const chat = chats.find(c=> !c.is_group && c.members.some(m=>m.username===username) && c.members.some(m=>m.id===me.id));
  if(chat) openChat(chat.id);
  else {
    // создаст через addContact уже
    alert('Сначала добавь в контакты');
  }
};

// groups
document.getElementById('createGroupBtn').onclick = async()=>{
  const name = document.getElementById('groupName').value.trim();
  const membersStr = document.getElementById('groupMembers').value.trim();
  if(!name) return alert('Название группы?');
  const members = membersStr? membersStr.split(',').map(s=>s.trim()).filter(Boolean):[];
  const res = await fetch('/api/groups/create', {method:'POST', headers:{'Content-Type':'application/json','x-token':token}, body: JSON.stringify({name, members})});
  const data = await res.json();
  if(!res.ok) return alert(data.error);
  document.getElementById('groupName').value=''; document.getElementById('groupMembers').value='';
  await loadChats();
  openChat(data.chatId);
};

// chats
async function loadChats(){
  const res = await fetch('/api/chats', {headers:{'x-token':token}});
  chats = await res.json();
  renderChats();
}
function renderChats(){
  if(!chats.length){
    chatsList.innerHTML='<div class="small" style="padding:6px;background:#fff;border:1px inset #808080;">Чатов нет. Добавь контакт — чат создастся автоматически.</div>';
    return;
  }
  chatsList.innerHTML = chats.map(ch=>{
    const isGroup = ch.is_group;
    let title, avatar;
    if(isGroup){
      title = ch.name;
      avatar = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" fill="%23ffff00"/><text x="16" y="20" text-anchor="middle">👥</text></svg>';
    } else {
      const other = ch.members.find(m=>m.id!==me.id);
      title = other? other.username : '???';
      avatar = other && other.avatar ? other.avatar : 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" fill="%23fff"/><text x="16" y="20" text-anchor="middle">👤</text></svg>';
    }
    const last = ch.lastMsg ? (ch.lastMsg.text? ch.lastMsg.text.slice(0,20) : '['+ch.lastMsg.type+']') : 'нет сообщений';
    const unread = ch.unread? `<span class="unread">${ch.unread}</span>`:'';
    const active = currentChat===ch.id?' active':'';
    return `<div class="chat-item${active}" onclick="openChat('${ch.id}')">
      <img src="${avatar}">
      <div style="flex:1;min-width:0;"><div style="display:flex;justify-content:space-between;"><b style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${title}</b> ${unread}</div><div class="meta" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${last}</div></div>
    </div>`;
  }).join('');
}

window.openChat = async(chatId)=>{
  currentChat = chatId;
  renderChats();
  const chat = chats.find(c=>c.id===chatId);
  if(!chat) return;
  let title;
  if(chat.is_group) title = '👥 '+chat.name + ` [${chat.members.length} чел]`;
  else {
    const other = chat.members.find(m=>m.id!==me.id);
    title = '💬 '+ (other? other.username : chatId);
  }
  chatTitle.textContent = title;
  voiceCallBtn.classList.remove('hidden');
  messagesEl.innerHTML='<div class="small" style="text-align:center;padding:10px;">Загрузка истории... 14.4k modem</div>';
  const res = await fetch('/api/messages/'+chatId, {headers:{'x-token':token}});
  const msgs = await res.json();
  messagesCache = msgs;
  renderMessages();
  // join socket room
  if(socket) socket.emit('join_chat', chatId);
  // mark read
  fetch('/api/messages/'+chatId+'/read', {method:'POST', headers:{'x-token':token}});
};

function renderMessages(){
  if(!messagesCache.length){
    messagesEl.innerHTML='<div class="welcome-90s"><p>Пока пусто. Напиши первое сообщение! Текст, фото или видео — всё улетит в реальном времени.</p><p>Статусы: <b>✓</b> доставлено живому человеку, <b>✓✓</b> прочитано.</p></div>';
    return;
  }
  messagesEl.innerHTML = messagesCache.map(m=>{
    const isMe = m.sender_id===me.id;
    const sender = chats.find(c=>c.id===m.chat_id)?.members.find(mm=>mm.id===m.sender_id);
    const name = isMe? 'Ты' : (sender? sender.username : '???');
    const time = new Date(m.created_at).toLocaleTimeString('ru-RU', {hour:'2-digit', minute:'2-digit'});
    let body='';
    if(m.type==='text' || (m.text && !m.media_url)){
      body = `<div>${escapeHtml(m.text||'')}</div>`;
    } else if(m.type==='image'){
      body = `${m.text?'<div>'+escapeHtml(m.text)+'</div>':''}<img src="${m.media_url}" loading="lazy" onclick="window.open('${m.media_url}')">`;
    } else if(m.type==='video'){
      body = `${m.text?'<div>'+escapeHtml(m.text)+'</div>':''}<video src="${m.media_url}" controls preload="metadata"></video>`;
    } else {
      body = `${m.text?'<div>'+escapeHtml(m.text)+'</div>':''}<a href="${m.media_url}" target="_blank">📎 ${m.media_name||'файл'}</a>`;
    }
    const status = isMe ? `<span class="status ${m.read?'read':'delivered'}">${m.read?'✓✓':'✓'}</span>` : '';
    return `<div class="msg ${isMe?'me':'other'}">
      <div style="font-size:10px; color:${isMe?'#808000':'#000080'}; font-family:'Press Start 2P';">${name} • ${time} ${status}</div>
      ${body}
    </div>`;
  }).join('');
  messagesEl.scrollTop = messagesEl.scrollHeight;
  // ack delivered for others
  messagesCache.forEach(m=>{
    if(m.sender_id!==me.id && !m.delivered){
      if(socket) socket.emit('message_delivered', {messageId:m.id, chatId:m.chat_id});
    }
    if(m.sender_id!==me.id && !m.read){
      if(socket) socket.emit('message_read', {messageId:m.id, chatId:m.chat_id});
      // mark visually
    }
  });
}
function escapeHtml(s){ return s.replace(/[&<>"']/g, c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

// send
photoInput.onchange = ()=>{ if(photoInput.files[0]){ selectedFile=photoInput.files[0]; fileName.textContent='📷 '+selectedFile.name; } };
videoInput.onchange = ()=>{ if(videoInput.files[0]){ selectedFile=videoInput.files[0]; fileName.textContent='🎬 '+selectedFile.name; } };

sendBtn.onclick = sendMessage;
msgInput.onkeydown = e=>{
  if(e.key==='Enter' && !e.shiftKey){ e.preventDefault(); sendMessage(); }
  else { // typing
    if(currentChat && socket) socket.emit('typing', {chatId: currentChat, isTyping:true});
    clearTimeout(window._typingTimeout);
    window._typingTimeout=setTimeout(()=> socket && socket.emit('typing', {chatId: currentChat, isTyping:false}), 1200);
  }
};

async function sendMessage(){
  if(!currentChat) return alert('Выбери чат слева!');
  const text = msgInput.value.trim();
  if(!text && !selectedFile) return;
  const fd = new FormData();
  fd.append('chatId', currentChat);
  if(text) fd.append('text', text);
  if(selectedFile) fd.append('file', selectedFile);
  msgInput.value=''; fileName.textContent=''; 
  const lastFile = selectedFile;
  selectedFile=null; photoInput.value=''; videoInput.value='';
  try{
    const res = await fetch('/api/messages', {method:'POST', headers:{'x-token':token}, body: fd});
    const data = await res.json();
    if(!res.ok) throw new Error(data.error);
    messagesCache.push(data);
    renderMessages();
    loadChats();
    if(socket) socket.emit('typing', {chatId: currentChat, isTyping:false});
  }catch(e){ alert(e.message); }
}

// socket
function initSocket(){
  socket = io({auth:{token}});
  socket.on('connect', ()=>{
    connStatus.textContent='● online';
    connStatus.style.color='#0f0';
    console.log('socket connected');
  });
  socket.on('disconnect', ()=>{
    connStatus.textContent='● offline';
    connStatus.style.color='red';
  });
  socket.on('online_list', list=>{
    onlineCount.textContent = `● ${list.length} online`;
  });
  socket.on('new_message', msg=>{
    if(msg.chat_id===currentChat){
      messagesCache.push(msg);
      renderMessages();
      // ack
      socket.emit('message_delivered', {messageId:msg.id, chatId:msg.chat_id});
      setTimeout(()=> socket.emit('message_read', {messageId:msg.id, chatId:msg.chat_id}), 500);
      fetch('/api/messages/'+msg.chat_id+'/read', {method:'POST', headers:{'x-token':token}});
    }
    loadChats();
    // notify
    if(msg.sender_id!==me.id && msg.chat_id!==currentChat){
      // simple beep
      try{ new Audio('data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQQAAAAAAA==').play(); }catch{}
    }
  });
  socket.on('typing', ({chatId, username, isTyping})=>{
    if(chatId===currentChat){
      typingIndicator.textContent = isTyping? `${username} печатает...` : '';
    }
  });
  socket.on('message_status', ({messageId, delivered, read})=>{
    const m = messagesCache.find(x=>x.id===messageId);
    if(m){ m.delivered=delivered; m.read=read; renderMessages(); }
  });
  socket.on('messages_read', ({chatId})=>{
    if(chatId===currentChat){
      messagesCache.forEach(m=>{ if(m.sender_id===me.id) m.read=1; });
      renderMessages();
    }
  });
  socket.on('user_updated', user=>{
    loadContacts(); loadChats();
  });
  // voice
  socket.on('voice:offer', onVoiceOffer);
  socket.on('voice:answer', onVoiceAnswer);
  socket.on('voice:ice', onVoiceIce);
  socket.on('voice:leave', onVoiceLeave);
}

// VOICE - low bitrate, no noise suppression
let pc=null, localStream=null, voiceChatId=null;
voiceCallBtn.onclick = async()=>{
  if(!currentChat) return alert('Выбери чат');
  await startVoice(true);
};
voiceHangBtn.onclick = hangVoice;

async function startVoice(isCaller){
  voiceChatId = currentChat;
  voiceStatus.classList.remove('hidden');
  voiceHangBtn.classList.remove('hidden');
  voiceCallBtn.classList.add('hidden');
  try{
    localStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        sampleRate: 8000,
        sampleSize: 8,
        autoGainControl: false,
        noiseSuppression: false,
        echoCancellation: false,
      },
      video:false
    });
  }catch(e){ alert('Микрофон нужен! '+e.message); hangVoice(); return; }

  pc = new RTCPeerConnection({ iceServers: [{urls:'stun:stun.l.google.com:19302'}] });
  // force low bitrate
  localStream.getTracks().forEach(t=> pc.addTrack(t, localStream));
  
  pc.onicecandidate = e=>{
    if(e.candidate) socket.emit('voice:ice', {chatId: voiceChatId, candidate: e.candidate});
  };
  pc.ontrack = e=>{
    remoteAudio.srcObject = e.streams[0];
  };

  if(isCaller){
    // hack low bitrate via SDP munging
    const offer = await pc.createOffer({ offerToReceiveAudio:true });
    // mangle SDP: set maxaveragebitrate 8000
    offer.sdp = offer.sdp.replace(/a=fmtp:111.*\r\n/, 'a=fmtp:111 minptime=10;useinbandfec=0; maxaveragebitrate=8000\r\n');
    await pc.setLocalDescription(offer);
    socket.emit('voice:offer', {chatId: voiceChatId, sdp: offer});
  }
  voiceStatus.innerHTML = '<span class="blink">● REC</span> Соединение... 8 kbps • без шумодава • хрипло как в 2002';
}

async function onVoiceOffer({sdp, from, username, chatId}){
  if(chatId!==currentChat){
    // auto join?
    if(!confirm(`Входящий голосовой от ${username} (${chatId}). Принять?`)) return;
    // find chat and open
    currentChat = chatId; voiceChatId=chatId;
  } else {
    voiceChatId=chatId;
  }
  voiceStatus.classList.remove('hidden');
  voiceHangBtn.classList.remove('hidden');
  voiceCallBtn.classList.add('hidden');
  if(!pc){
    try{
      localStream = await navigator.mediaDevices.getUserMedia({
        audio:{ channelCount:1, sampleRate:8000, autoGainControl:false, noiseSuppression:false, echoCancellation:false },
        video:false
      });
    }catch(e){ alert(e.message); return; }
    pc = new RTCPeerConnection({iceServers:[{urls:'stun:stun.l.google.com:19302'}]});
    localStream.getTracks().forEach(t=> pc.addTrack(t, localStream));
    pc.onicecandidate = e=>{ if(e.candidate) socket.emit('voice:ice', {chatId: voiceChatId, candidate:e.candidate}); };
    pc.ontrack = e=>{ remoteAudio.srcObject = e.streams[0]; };
  }
  await pc.setRemoteDescription(new RTCSessionDescription(sdp));
  const answer = await pc.createAnswer();
  answer.sdp = answer.sdp.replace(/a=fmtp:111.*\r\n/, 'a=fmtp:111 minptime=10;useinbandfec=0; maxaveragebitrate=8000\r\n');
  await pc.setLocalDescription(answer);
  socket.emit('voice:answer', {chatId: voiceChatId, sdp: answer});
  voiceStatus.innerHTML = '<span class="blink">● ON AIR</span> Говори! Хрип и 8 kbps — как и просили';
}

async function onVoiceAnswer({sdp}){
  if(pc) await pc.setRemoteDescription(new RTCSessionDescription(sdp));
  voiceStatus.innerHTML = '<span class="blink">● ON AIR</span> Соединено! 8 kbps • без шумоподавления';
}
async function onVoiceIce({candidate}){
  if(pc && candidate) try{ await pc.addIceCandidate(new RTCIceCandidate(candidate)); }catch{}
}
function onVoiceLeave(){
  hangVoice();
  alert('Собеседник повесил трубку');
}
function hangVoice(){
  if(pc){ pc.close(); pc=null; }
  if(localStream){ localStream.getTracks().forEach(t=>t.stop()); localStream=null; }
  remoteAudio.srcObject=null;
  voiceStatus.classList.add('hidden');
  voiceHangBtn.classList.add('hidden');
  voiceCallBtn.classList.remove('hidden');
  if(voiceChatId && socket) socket.emit('voice:leave', {chatId: voiceChatId});
  voiceChatId=null;
}

// MUSIC
function initMusic(){
  const tracks = [
    {title:'adsadssadfs', file:'/music/track1.mp3'},
    {title:'Кто создал тьму', file:'/music/track2.mp3'},
    {title:'oh no no no laugh x 666 Mashup', file:'/music/track3.mp3'},
    {title:'музыка', file:'/music/track4.mp3'},
  ];
  const playlist = document.getElementById('playlist');
  const player = document.getElementById('audioPlayer');
  const display = document.getElementById('trackDisplay');
  playlist.innerHTML = tracks.map((t,i)=> `<div class="track" data-i="${i}"><span>${i+1}. ${t.title}.mp3</span><span>►</span></div>`).join('');
  let cur = null;
  playlist.querySelectorAll('.track').forEach(el=>{
    el.onclick = ()=>{
      const i = +el.dataset.i;
      cur=i;
      player.src = tracks[i].file;
      player.play();
      display.textContent = '▶ ИГРАЕТ: ' + tracks[i].title;
      playlist.querySelectorAll('.track').forEach(x=>x.classList.remove('active'));
      el.classList.add('active');
    };
  });
  player.onended = ()=>{
    if(cur!==null && cur+1 < tracks.length){
      playlist.querySelectorAll('.track')[cur+1].click();
    } else {
      display.textContent='■ STOPPED';
    }
  };
  player.onplay = ()=> display.textContent = '▶ ' + (tracks[cur]?.title || 'PLAY');
  player.onpause = ()=> { if(!player.ended) display.textContent='❚❚ PAUSE'; };
}

// GAMES TABS
document.querySelectorAll('.tab-btn').forEach(b=>{
  b.onclick=()=>{
    document.querySelectorAll('.tab-btn').forEach(x=>x.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(x=>x.classList.remove('active'));
    b.classList.add('active');
    document.getElementById('tab-'+b.dataset.tab).classList.add('active');
  };
});

// MINESWEEPER
function initMinesweeper(){
  const container = document.getElementById('minesweeper');
  const ROWS=9, COLS=9, MINES=10;
  let grid=[], revealed, flagged, gameOver;
  function newGame(){
    grid = Array.from({length:ROWS}, ()=> Array(COLS).fill(0));
    revealed = Array.from({length:ROWS}, ()=> Array(COLS).fill(false));
    flagged = Array.from({length:ROWS}, ()=> Array(COLS).fill(false));
    gameOver=false;
    // place mines
    let placed=0;
    while(placed<MINES){
      const r=Math.floor(Math.random()*ROWS), c=Math.floor(Math.random()*COLS);
      if(grid[r][c]!=='M'){ grid[r][c]='M'; placed++; }
    }
    // numbers
    for(let r=0;r<ROWS;r++) for(let c=0;c<COLS;c++) if(grid[r][c]!=='M'){
      let cnt=0;
      for(let dr=-1;dr<=1;dr++) for(let dc=-1;dc<=1;dc++){
        const nr=r+dr, nc=c+dc;
        if(nr>=0&&nr<ROWS&&nc>=0&&nc<COLS&&grid[nr][nc]==='M') cnt++;
      }
      grid[r][c]=cnt;
    }
    render();
  }
  function render(){
    container.innerHTML='';
    for(let r=0;r<ROWS;r++) for(let c=0;c<COLS;c++){
      const cell=document.createElement('div');
      cell.className='cell'+(revealed[r][c]?' revealed':'');
      if(revealed[r][c]){
        if(grid[r][c]==='M'){ cell.textContent='💣'; cell.classList.add('mine'); }
        else if(grid[r][c]>0){ cell.textContent=grid[r][c]; cell.style.color=['','#00f','#080','#f00','#000080','#800000','#008080','#000','#808080'][grid[r][c]]; }
      } else {
        cell.textContent = flagged[r][c]?'🚩':'';
        if(flagged[r][c]) cell.classList.add('flag');
      }
      cell.oncontextmenu = e=>{ e.preventDefault(); if(!revealed[r][c]&&!gameOver){ flagged[r][c]=!flagged[r][c]; render(); } };
      cell.onclick = ()=>{
        if(gameOver||flagged[r][c]) return;
        if(grid[r][c]==='M'){
          revealed[r][c]=true; gameOver=true;
          // reveal all
          for(let rr=0;rr<ROWS;rr++) for(let cc=0;cc<COLS;cc++) if(grid[rr][cc]==='M') revealed[rr][cc]=true;
          render();
          setTimeout(()=> alert('💥 БУМ! Ты подорвался! Как в Windows 98!'),100);
        } else {
          flood(r,c);
          render();
          checkWin();
        }
      };
      container.appendChild(cell);
    }
  }
  function flood(r,c){
    if(r<0||r>=ROWS||c<0||c>=COLS||revealed[r][c]||flagged[r][c]) return;
    revealed[r][c]=true;
    if(grid[r][c]===0){
      for(let dr=-1;dr<=1;dr++) for(let dc=-1;dc<=1;dc++) flood(r+dr,c+dc);
    }
  }
  function checkWin(){
    let cnt=0;
    for(let r=0;r<ROWS;r++) for(let c=0;c<COLS;c++) if(!revealed[r][c] && grid[r][c]!=='M') cnt++;
    if(cnt===0){ gameOver=true; alert('🎉 Победа! Ты сапёр 80 lvl!'); }
  }
  document.getElementById('newSaperBtn').onclick=newGame;
  newGame();
}

// EGG CATCHER
function initEggGame(){
  const canvas=document.getElementById('eggCanvas');
  const ctx=canvas.getContext('2d');
  const scoreEl=document.getElementById('eggScore');
  let basketX=110, basketW=60, basketH=12, score=0, eggs=[], running=false, animId=null;
  let keys={};
  document.addEventListener('keydown', e=>{ keys[e.key]=true; if(['ArrowLeft','ArrowRight'].includes(e.key)) e.preventDefault(); });
  document.addEventListener('keyup', e=> keys[e.key]=false);
  // mobile/touch
  canvas.addEventListener('mousemove', e=>{
    const rect=canvas.getBoundingClientRect();
    basketX = (e.clientX-rect.left)*(canvas.width/rect.width) - basketW/2;
  });
  canvas.addEventListener('touchmove', e=>{
    const rect=canvas.getBoundingClientRect();
    basketX = (e.touches[0].clientX-rect.left)*(canvas.width/rect.width) - basketW/2;
    e.preventDefault();
  }, {passive:false});

  function spawnEgg(){
    eggs.push({x: Math.random()*(canvas.width-16), y:-20, vy: 1.5+Math.random()*1.5 + score*0.05, crack:false});
  }
  function loop(){
    if(!running) return;
    // move basket
    if(keys['ArrowLeft']) basketX-=4;
    if(keys['ArrowRight']) basketX+=4;
    basketX = Math.max(0, Math.min(canvas.width-basketW, basketX));
    // spawn
    if(Math.random()<0.04) spawnEgg();
    // update eggs
    ctx.clearRect(0,0,canvas.width,canvas.height);
    // basket
    ctx.fillStyle='#8B4513';
    ctx.fillRect(basketX, canvas.height-basketH-6, basketW, basketH);
    ctx.fillStyle='#D2691E';
    ctx.fillRect(basketX+4, canvas.height-basketH-10, basketW-8, 4);
    // eggs
    for(let i=eggs.length-1;i>=0;i--){
      const e=eggs[i];
      e.y+=e.vy;
      // draw egg
      ctx.beginPath();
      ctx.ellipse(e.x+8, e.y+10, 8, 10, 0, 0, Math.PI*2);
      ctx.fillStyle = e.crack ? '#ff0' : '#ffffe0';
      ctx.fill();
      ctx.strokeStyle='#c0a000'; ctx.stroke();
      // catch?
      if(e.y+20 >= canvas.height-basketH-6 && e.y+10 <= canvas.height && e.x+16 >= basketX && e.x <= basketX+basketW){
        eggs.splice(i,1);
        score++; scoreEl.textContent=score;
        // pop effect
      } else if(e.y>canvas.height){
        eggs.splice(i,1);
        score = Math.max(0, score-1); scoreEl.textContent=score;
        // crack
      }
    }
    // bg grid like old
    ctx.strokeStyle='rgba(0,0,0,0.05)';
    for(let x=0;x<canvas.width;x+=20){ ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,canvas.height); ctx.stroke(); }
    animId=requestAnimationFrame(loop);
  }
  document.getElementById('eggStartBtn').onclick=()=>{
    if(running){ running=false; cancelAnimationFrame(animId); document.getElementById('eggStartBtn').textContent='СТАРТ'; return; }
    eggs=[]; score=0; scoreEl.textContent=0; basketX=110;
    running=true;
    document.getElementById('eggStartBtn').textContent='СТОП';
    loop();
  };
  // initial draw
  ctx.fillStyle='#87ceeb'; ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.fillStyle='#8B4513'; ctx.fillRect(basketX, canvas.height-basketH-6, basketW, basketH);
}

// MODES
function initModes(){
  const btns=document.querySelectorAll('.mode-btn');
  btns.forEach(b=>{
    b.onclick=()=>{
      const mode=b.dataset.mode;
      document.body.className = 'theme-default';
      if(mode!=='default') document.body.classList.add(mode);
      // evil needs extra
      if(mode==='evil') document.getElementById('evilOverlay').classList.remove('hidden');
      else document.getElementById('evilOverlay').classList.add('hidden');
      if(mode==='psychedelic') document.getElementById('psyOverlay').classList.remove('hidden');
      else document.getElementById('psyOverlay').classList.add('hidden');
      btns.forEach(x=>x.classList.remove('active'));
      b.classList.add('active');
      // save
      localStorage.setItem('lulu_mode', mode);
    };
  });
  const saved=localStorage.getItem('lulu_mode');
  if(saved){
    const btn=document.querySelector(`[data-mode="${saved}"]`);
    if(btn) btn.click();
  }
}

// periodic refresh chats
setInterval(()=>{ if(me) loadChats(); }, 5000);
