import { escapeHtml } from "../utils/http.js";

export function chatPage(username) {
  return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>FreeChat - ${escapeHtml(username)}</title>
<style>${chatCss}</style>
</head>
<body>
  <div class="app">
    <aside class="side">
      <div class="brand">FreeChat</div>
      <div id="chats" class="chats"><div class="system">Загрузка...</div></div>
      <div id="user" class="user">
        <div id="user-avatar" class="avatar"></div>
        <div>
          <div id="user-name" class="name">${escapeHtml(username)}</div>
          <div class="user-subtitle">Профиль</div>
        </div>
        <a class="logout" href="/logout">Выйти</a>
      </div>
    </aside>
    <main class="main">
      <header id="head" class="head"><h1>Выберите чат</h1><p></p></header>
      <section id="messages" class="messages"><div class="system">Выберите чат слева, чтобы начать общение</div></section>
      <div class="input"><input id="msg" disabled placeholder="Введите сообщение..."><button id="send" disabled>➤</button></div>
    </main>
  </div>
  <div id="modal" class="modal">
    <div class="modal-card">
      <h3>Профиль</h3>
      <label class="file">Сменить аватар<input id="avatar-file" type="file" accept="image/*"></label>
      <input id="new-name" maxlength="20" placeholder="Новое имя">
      <button onclick="saveProfile()">Сохранить</button>
      <button onclick="closeModal()" class="secondary">Отмена</button>
    </div>
  </div>
<script>${chatClient(username)}</script>
</body>
</html>`;
}

const chatCss = `
*{box-sizing:border-box}
body{margin:0;height:100vh;overflow:hidden;background:#111827;color:#e5e7eb;font-family:Inter,system-ui,sans-serif}
.app{height:100%;display:flex}.side{width:300px;background:#202632;border-right:1px solid #303846;display:flex;flex-direction:column}
.brand{height:58px;display:flex;align-items:center;padding:0 16px;font-size:22px;font-weight:850;border-bottom:1px solid #303846}
.chats{flex:1;overflow:auto}.chat-item{padding:13px 16px;border-bottom:1px solid #303846;cursor:pointer}.chat-item:hover,.chat-item.active{background:#2f3a4b}.chat-item h2{font-size:15px;margin:0 0 5px}.chat-item p{font-size:13px;color:#aeb6c2;margin:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.user{height:76px;display:flex;align-items:center;gap:12px;padding:12px 16px;border-top:1px solid #303846}.user-subtitle{font-size:12px;color:#9aa3af}.avatar,.msg-avatar{border-radius:50%;background-size:cover;background-position:center;flex:none}.avatar{width:46px;height:46px}.msg-avatar{width:38px;height:38px}.name{font-weight:700;overflow:hidden;text-overflow:ellipsis}.logout{margin-left:auto;color:#fff;background:#dc2626;text-decoration:none;border-radius:8px;padding:8px 10px;font-size:13px}
.main{flex:1;min-width:0;display:flex;flex-direction:column;background:#111827}.head{height:58px;padding:10px 18px;border-bottom:1px solid #303846;background:#1f2937}.head h1{font-size:17px;margin:0}.head p{font-size:13px;color:#aeb6c2;margin:3px 0 0}.messages{flex:1;overflow:auto;padding:18px;display:flex;flex-direction:column;gap:12px}.message{display:flex;gap:11px}.meta{display:flex;gap:8px;align-items:baseline;margin-bottom:4px}.nick{font-weight:800;color:#93c5fd}.time{font-size:12px;color:#8b95a5}.text{white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.45}.system{align-self:center;color:#aeb6c2;background:#1f2937;border-radius:999px;padding:7px 12px;font-size:13px}
.input{height:60px;display:flex;border-top:1px solid #303846}.input input{flex:1;border:0;background:#0b1220;color:white;padding:0 16px;font:inherit;outline:0}.input button{width:64px;border:0;background:#5865f2;color:white;font-size:20px;cursor:pointer}.input button:disabled,.input input:disabled{opacity:.55}
.modal{display:none;position:fixed;inset:0;background:#000a;place-items:center}.modal.active{display:grid}.modal-card{width:min(390px,92vw);background:#202632;border:1px solid #3b4556;border-radius:12px;padding:20px}.modal-card input{width:100%;border:1px solid #4b5563;background:#111827;color:white;border-radius:8px;padding:10px;margin:10px 0}.modal-card button{border:0;border-radius:8px;padding:9px 12px;margin-right:8px;background:#5865f2;color:white;cursor:pointer}.modal-card .secondary{background:#4b5563}.file{display:block;background:#374151;border-radius:8px;padding:10px;text-align:center;cursor:pointer}.file input{display:none}
@media(max-width:720px){.app{flex-direction:column}.side{width:100%;height:42%;border-right:0}.main{height:58%}.user{height:68px}}
`;

function chatClient(username) {
  return `
let username=${JSON.stringify(username)}, currentChatId=null, chats=[], avatars={};
let ws;
const PROTOCOL_VERSION=1;
const OP={SET_USERNAME:1,JOIN_CHAT:2,SEND_MESSAGE:3,CHATS_LIST:101,CHAT_HISTORY:102,NEW_MESSAGE:103,UPDATE_LAST_MESSAGE:104,USER_JOINED:105,ERROR:255};
const OP_NAME=Object.fromEntries(Object.entries(OP).map(([name,code])=>[code,name.toLowerCase()]));
const NAME_OP={set_username:OP.SET_USERNAME,join_chat:OP.JOIN_CHAT,send_message:OP.SEND_MESSAGE,chats_list:OP.CHATS_LIST,chat_history:OP.CHAT_HISTORY,new_message:OP.NEW_MESSAGE,update_last_message:OP.UPDATE_LAST_MESSAGE,user_joined:OP.USER_JOINED,error:OP.ERROR};
const protocolEncoder=new TextEncoder(), protocolDecoder=new TextDecoder();
function encodePacket(type,data){const payload=protocolEncoder.encode(JSON.stringify(data||{}));const buffer=new ArrayBuffer(10+payload.byteLength);const view=new DataView(buffer);const bytes=new Uint8Array(buffer);view.setUint8(0,70);view.setUint8(1,67);view.setUint8(2,PROTOCOL_VERSION);view.setUint8(3,NAME_OP[type]);view.setUint16(4,0,false);view.setUint32(6,payload.byteLength,false);bytes.set(payload,10);return buffer}
async function decodePacket(message){const buffer=message instanceof Blob?await message.arrayBuffer():message;const view=new DataView(buffer);if(view.getUint8(0)!==70||view.getUint8(1)!==67)throw new Error('Bad protocol magic');if(view.getUint8(2)!==PROTOCOL_VERSION)throw new Error('Bad protocol version');const op=view.getUint8(3);const length=view.getUint32(6,false);const payload=new Uint8Array(buffer,10,length);return {type:OP_NAME[op]||'unknown',data:length?JSON.parse(protocolDecoder.decode(payload)):{} }}
function connect(){ws=new WebSocket((location.protocol==='https:'?'wss://':'ws://')+location.host+'/ws');ws.binaryType='arraybuffer';ws.onopen=()=>sendPacket('set_username',{username});ws.onmessage=async e=>{try{const p=await decodePacket(e.data);handlers[p.type]?.(p.data)}catch(err){console.error('Protocol error',err)}};ws.onclose=()=>setTimeout(connect,1000)}
function sendPacket(type,data){if(ws?.readyState===1)ws.send(encodePacket(type,data))}
const handlers={chats_list:data=>{chats=data;renderChats()},chat_history:data=>{if(data.chat_id!==currentChatId)return;messages.innerHTML='';if(!data.messages.length)addSystem('История сообщений пуста. Напишите первое сообщение!');data.messages.forEach(m=>addMessage(m.nick,m.message,m.timestamp));scrollBottom()},new_message:data=>{if(data.chat_id===currentChatId){addMessage(data.nick,data.message,data.timestamp);scrollBottom()}updateLast(data.chat_id,data.nick+': '+short(data.message))},update_last_message:data=>updateLast(data.chat_id,data.last_message),user_joined:data=>{if(data.chat_id===currentChatId)addSystem(data.username+' присоединился к чату')}};
async function loadProfile(){const p=await (await fetch('/api/user_profile')).json();username=p.username;document.getElementById('user-name').textContent=username;document.getElementById('new-name').value=username;document.getElementById('user-avatar').style.backgroundImage='url('+p.avatar+')'}
async function avatar(nick){if(avatars[nick])return avatars[nick];const data=await (await fetch('/api/user_avatar/'+encodeURIComponent(nick))).json();avatars[nick]=data.avatar_url;return avatars[nick]}
function renderChats(){const el=document.getElementById('chats');el.innerHTML='';chats.forEach(c=>{const d=document.createElement('div');d.className='chat-item'+(c.id===currentChatId?' active':'');d.dataset.id=c.id;d.innerHTML='<h2>'+esc(c.name)+'</h2><p>'+esc(c.last_message||'Нет сообщений')+'</p>';d.onclick=()=>join(c);el.appendChild(d)})}
function join(c){currentChatId=c.id;document.getElementById('head').innerHTML='<h1>'+esc(c.name)+'</h1><p>'+esc(c.description||'')+'</p>';document.getElementById('msg').disabled=false;document.getElementById('send').disabled=false;renderChats();sendPacket('join_chat',{chat_id:c.id});document.getElementById('msg').focus()}
async function addMessage(nick,message,timestamp){const row=document.createElement('div');row.className='message';const time=timestamp?new Date(timestamp).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}):'';row.innerHTML='<div class="msg-avatar"></div><div><div class="meta"><span class="nick">'+esc(nick)+'</span><span class="time">'+time+'</span></div><div class="text">'+esc(message)+'</div></div>';row.querySelector('.msg-avatar').style.backgroundImage='url('+await avatar(nick)+')';messages.appendChild(row)}
function addSystem(text){const d=document.createElement('div');d.className='system';d.textContent=text;messages.appendChild(d)}
function sendMessage(){const input=document.getElementById('msg');const message=input.value.trim();if(!message||currentChatId===null)return;sendPacket('send_message',{message});input.value=''}
function updateLast(id,text){const item=document.querySelector('.chat-item[data-id="'+id+'"] p');if(item)item.textContent=text}
function short(text){return text.length>30?text.slice(0,27)+'...':text}
function scrollBottom(){messages.scrollTop=messages.scrollHeight}
function esc(v){const d=document.createElement('div');d.textContent=v||'';return d.innerHTML}
function openModal(){document.getElementById('modal').classList.add('active')}
function closeModal(){document.getElementById('modal').classList.remove('active')}
async function saveProfile(){const newName=document.getElementById('new-name').value.trim();if(newName&&newName!==username){const r=await fetch('/api/change_username',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({new_username:newName})});if(!r.ok){alert('Не удалось сменить имя');return}username=newName;document.getElementById('user-name').textContent=username;sendPacket('set_username',{username})}const file=document.getElementById('avatar-file').files[0];if(file){const fd=new FormData();fd.append('avatar',file);const r=await fetch('/api/upload_avatar',{method:'POST',body:fd});if(r.ok){const data=await r.json();document.getElementById('user-avatar').style.backgroundImage='url('+data.avatar_url+')';avatars={}}else alert('Не удалось загрузить аватар')}closeModal()}
document.getElementById('send').onclick=sendMessage;document.getElementById('msg').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();sendMessage()}};document.getElementById('user').onclick=e=>{if(e.target.tagName!=='A')openModal()};loadProfile().then(connect);
`;
}
