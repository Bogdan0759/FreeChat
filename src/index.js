const COOKIE_NAME = "freechat_user";

export class ChatRoom {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
  }

  async fetch(request) {
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Expected websocket", { status: 426 });
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    server.serializeAttachment({ username: null, chatId: null });
    this.ctx.acceptWebSocket(server);

    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws, rawMessage) {
    let packet;
    try {
      packet = JSON.parse(rawMessage);
    } catch {
      return;
    }

    const data = packet.data || {};
    const session = ws.deserializeAttachment() || {};

    if (packet.type === "set_username") {
      session.username = String(data.username || "").trim();
      ws.serializeAttachment(session);
      await this.send(ws, "chats_list", await getChats(this.env.DB));
      return;
    }

    if (packet.type === "join_chat") {
      const chatId = Number(data.chat_id);
      if (!Number.isInteger(chatId)) return;

      session.chatId = chatId;
      ws.serializeAttachment(session);

      await this.send(ws, "chat_history", {
        chat_id: chatId,
        messages: await getHistory(this.env.DB, chatId),
      });

      this.broadcast("user_joined", {
        username: session.username || "Anonymous",
        chat_id: chatId,
      }, ws, chatId);
      return;
    }

    if (packet.type === "send_message") {
      const message = String(data.message || "").trim();
      if (!message || !session.username || session.chatId === null || session.chatId === undefined) return;

      const timestamp = new Date().toISOString();
      await this.env.DB.prepare(
        "insert into messages(chat_id, nick, message, timestamp) values (?, ?, ?, ?)"
      ).bind(session.chatId, session.username, message, timestamp).run();

      const payload = {
        nick: session.username,
        message,
        timestamp,
        chat_id: session.chatId,
      };

      this.broadcast("new_message", payload, null, session.chatId);
      this.broadcast("update_last_message", {
        chat_id: session.chatId,
        last_message: `${session.username}: ${message.length > 30 ? message.slice(0, 27) + "..." : message}`,
      });
    }
  }

  async send(ws, type, data) {
    ws.send(JSON.stringify({ type, data }));
  }

  broadcast(type, data, skipWs = null, chatId = null) {
    const payload = JSON.stringify({ type, data });
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === skipWs) continue;
      const session = ws.deserializeAttachment() || {};
      if (chatId !== null && session.chatId !== chatId) continue;
      ws.send(payload);
    }
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/ws") {
      const id = env.ROOM.idFromName("global");
      return env.ROOM.get(id).fetch(request);
    }

    if (url.pathname.startsWith("/static/avatars/default_")) {
      return avatarResponse(url.pathname);
    }

    const username = getCookie(request, COOKIE_NAME);

    if (request.method === "GET" && url.pathname === "/") {
      return redirect(username ? "/chat" : "/auth");
    }

    if (request.method === "GET" && url.pathname === "/auth") {
      return html(authHtml(url.searchParams.get("error") || ""));
    }

    if (request.method === "POST" && url.pathname === "/login") {
      const form = await request.formData();
      const name = cleanName(form.get("username"));
      const password = String(form.get("password") || "");
      const row = await env.DB.prepare("select password_hash from users where username = ?").bind(name).first();

      if (row && row.password_hash === await sha256(password)) {
        return redirect("/chat", { cookie: sessionCookie(name) });
      }
      return redirect("/auth?error=" + encodeURIComponent("Неверное имя пользователя или пароль"));
    }

    if (request.method === "POST" && url.pathname === "/register") {
      const form = await request.formData();
      const name = cleanName(form.get("username"));
      const password = String(form.get("password") || "");

      if (name.length < 3) return redirect("/auth?error=" + encodeURIComponent("Имя пользователя должно содержать минимум 3 символа"));
      if (password.length < 4) return redirect("/auth?error=" + encodeURIComponent("Пароль должен содержать минимум 4 символа"));

      try {
        await env.DB.prepare("insert into users(username, password_hash) values (?, ?)")
          .bind(name, await sha256(password)).run();
        return redirect("/chat", { cookie: sessionCookie(name) });
      } catch {
        return redirect("/auth?error=" + encodeURIComponent("Пользователь с таким именем уже существует"));
      }
    }

    if (request.method === "GET" && url.pathname === "/logout") {
      return redirect("/auth", { cookie: `${COOKIE_NAME}=; Path=/; Max-Age=0; SameSite=Lax` });
    }

    if (request.method === "GET" && url.pathname === "/chat") {
      if (!username) return redirect("/auth");
      return html(chatHtml(username));
    }

    if (request.method === "GET" && url.pathname === "/api/chats") {
      return json(await getChats(env.DB));
    }

    const historyMatch = url.pathname.match(/^\/api\/chats\/(\d+)\/history$/);
    if (request.method === "GET" && historyMatch) {
      return json(await getHistory(env.DB, Number(historyMatch[1])));
    }

    if (request.method === "GET" && url.pathname === "/api/user_profile") {
      if (!username) return json({ error: "Not authenticated" }, 401);
      return json(await getProfile(env.DB, username));
    }

    const avatarMatch = url.pathname.match(/^\/api\/user_avatar\/(.+)$/);
    if (request.method === "GET" && avatarMatch) {
      const profile = await getProfile(env.DB, decodeURIComponent(avatarMatch[1]));
      return json({ avatar_url: profile.avatar });
    }

    if (request.method === "POST" && url.pathname === "/api/change_username") {
      if (!username) return json({ error: "Not authenticated" }, 401);
      const body = await request.json();
      const newUsername = cleanName(body.new_username);
      if (newUsername.length < 3 || newUsername.length > 20) return json({ error: "Username must be 3-20 characters" }, 400);

      try {
        const old = await env.DB.prepare("select password_hash from users where username = ?").bind(username).first();
        if (!old) return json({ error: "User not found" }, 404);

        await env.DB.batch([
          env.DB.prepare("insert into users(username, password_hash) values (?, ?)").bind(newUsername, old.password_hash),
          env.DB.prepare("delete from users where username = ?").bind(username),
          env.DB.prepare("update messages set nick = ? where nick = ?").bind(newUsername, username),
          env.DB.prepare("update profiles set username = ? where username = ?").bind(newUsername, username),
        ]);

        return json({ success: true, new_username: newUsername }, 200, { cookie: sessionCookie(newUsername) });
      } catch {
        return json({ error: "Failed to update username" }, 400);
      }
    }

    if (request.method === "POST" && url.pathname === "/api/upload_avatar") {
      if (!username) return json({ error: "Not authenticated" }, 401);
      const form = await request.formData();
      const file = form.get("avatar");
      if (!(file instanceof File)) return json({ error: "No file provided" }, 400);
      if (!file.type.startsWith("image/")) return json({ error: "File must be an image" }, 400);
      if (file.size > 512 * 1024) return json({ error: "File too large, max 512KB on Workers+D1 MVP" }, 400);

      const avatarUrl = `data:${file.type};base64,${arrayBufferToBase64(await file.arrayBuffer())}`;
      await getProfile(env.DB, username);
      await env.DB.prepare("update profiles set avatar = ? where username = ?").bind(avatarUrl, username).run();
      return json({ success: true, avatar_url: avatarUrl });
    }

    return new Response("Not found", { status: 404 });
  },
};

async function getChats(db) {
  const rows = await db.prepare(`
    select c.id, c.name, c.description, m.nick, m.message
    from chats c
    left join messages m on m.id = (
      select id from messages where chat_id = c.id order by id desc limit 1
    )
    order by c.id
  `).all();

  return rows.results.map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    last_message: row.message ? `${row.nick}: ${row.message.length > 30 ? row.message.slice(0, 27) + "..." : row.message}` : "Нет сообщений",
  }));
}

async function getHistory(db, chatId) {
  const rows = await db.prepare(
    "select nick, message, timestamp from messages where chat_id = ? order by id"
  ).bind(chatId).all();
  return rows.results;
}

async function getProfile(db, username) {
  let profile = await db.prepare("select username, avatar, bio, created_at from profiles where username = ?")
    .bind(username).first();
  if (profile) return profile;

  profile = {
    username,
    avatar: defaultAvatar(username),
    bio: "",
    created_at: new Date().toISOString(),
  };
  await db.prepare("insert into profiles(username, avatar, bio, created_at) values (?, ?, ?, ?)")
    .bind(profile.username, profile.avatar, profile.bio, profile.created_at).run();
  return profile;
}

async function sha256(value) {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function cleanName(value) {
  return String(value || "").trim().slice(0, 40);
}

function getCookie(request, name) {
  const cookies = request.headers.get("Cookie") || "";
  for (const part of cookies.split(";")) {
    const [key, value] = part.trim().split("=");
    if (key === name) return decodeURIComponent(value || "");
  }
  return "";
}

function sessionCookie(username) {
  return `${COOKIE_NAME}=${encodeURIComponent(username)}; Path=/; Max-Age=2592000; SameSite=Lax; HttpOnly`;
}

function redirect(location, options = {}) {
  const headers = new Headers({ Location: location });
  if (options.cookie) headers.set("Set-Cookie", options.cookie);
  return new Response(null, { status: 303, headers });
}

function html(body) {
  return new Response(body, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}

function json(data, status = 200, options = {}) {
  const headers = new Headers({ "Content-Type": "application/json; charset=utf-8" });
  if (options.cookie) headers.set("Set-Cookie", options.cookie);
  return new Response(JSON.stringify(data), { status, headers });
}

function arrayBufferToBase64(buffer) {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function defaultAvatar(username) {
  let hash = 0;
  for (const char of username) hash = ((hash << 5) - hash + char.charCodeAt(0)) | 0;
  return `/static/avatars/default_${Math.abs(hash % 8) + 1}.png`;
}

function avatarResponse(pathname) {
  const n = Number((pathname.match(/default_(\d+)/) || [])[1] || 1);
  const colors = ["5865f2", "2dd4bf", "f97316", "ef4444", "22c55e", "eab308", "ec4899", "38bdf8"];
  const color = colors[(n - 1) % colors.length];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96"><rect width="96" height="96" rx="48" fill="#${color}"/><circle cx="48" cy="36" r="18" fill="white" opacity=".9"/><path d="M18 90c6-20 23-30 30-30s24 10 30 30" fill="white" opacity=".9"/></svg>`;
  return new Response(svg, { headers: { "Content-Type": "image/svg+xml" } });
}

function authHtml(error = "") {
  return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>FreeChat - вход</title>
<style>
*{box-sizing:border-box}body{margin:0;min-height:100vh;background:#202329;color:#fff;font-family:Inter,system-ui,sans-serif;display:grid;place-items:center;padding:20px}.card{width:min(440px,100%);background:#2b2f36;border:1px solid #444a55;border-radius:16px;padding:32px;box-shadow:0 18px 50px #0008}.logo{font-size:32px;font-weight:800;text-align:center;margin-bottom:24px}.tabs{display:flex;gap:8px;background:#1d2026;padding:4px;border-radius:10px;margin-bottom:24px}.tabs button{flex:1;border:0;border-radius:8px;background:transparent;color:#aeb6c2;padding:10px;font-weight:700;cursor:pointer}.tabs button.active{background:#434b5a;color:white}.form{display:none}.form.active{display:block}label{display:block;font-size:14px;margin:14px 0 8px;color:#d6d9df}input{width:100%;border:1px solid #535a66;background:#171a20;color:#fff;border-radius:10px;padding:12px;font:inherit}button[type=submit]{width:100%;border:0;border-radius:10px;background:#5865f2;color:white;margin-top:20px;padding:12px;font-weight:800;cursor:pointer}.error{background:#4a2028;border-left:3px solid #ef4444;color:#ffd1d1;padding:10px;border-radius:8px;margin-bottom:16px}.hint{text-align:center;color:#9aa3af;font-size:13px;margin-top:18px}</style>
</head>
<body><main class="card"><div class="logo">FreeChat</div>${error ? `<div class="error">${escapeHtml(error)}</div>` : ""}<div class="tabs"><button id="login-tab" class="active" onclick="tab('login')">Вход</button><button id="register-tab" onclick="tab('register')">Регистрация</button></div><form id="login" class="form active" action="/login" method="post"><label>Имя пользователя</label><input name="username" required autocomplete="username"><label>Пароль</label><input name="password" type="password" required autocomplete="current-password"><button type="submit">Войти</button></form><form id="register" class="form" action="/register" method="post"><label>Имя пользователя</label><input name="username" required autocomplete="username"><label>Пароль</label><input name="password" type="password" required autocomplete="new-password"><button type="submit">Зарегистрироваться</button></form><div class="hint">Тестовые аккаунты: admin/123456, alice/alice123, bob/bob123</div></main><script>function tab(id){for(const x of ['login','register']){document.getElementById(x).classList.toggle('active',x===id);document.getElementById(x+'-tab').classList.toggle('active',x===id)}}</script></body></html>`;
}

function chatHtml(username) {
  return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>FreeChat - ${escapeHtml(username)}</title>
<style>
*{box-sizing:border-box}body{margin:0;height:100vh;overflow:hidden;background:#111827;color:#e5e7eb;font-family:Inter,system-ui,sans-serif}.app{height:100%;display:flex}.side{width:300px;background:#202632;border-right:1px solid #303846;display:flex;flex-direction:column}.brand{height:58px;display:flex;align-items:center;padding:0 16px;font-size:22px;font-weight:850;border-bottom:1px solid #303846}.chats{flex:1;overflow:auto}.chat-item{padding:13px 16px;border-bottom:1px solid #303846;cursor:pointer}.chat-item:hover,.chat-item.active{background:#2f3a4b}.chat-item h2{font-size:15px;margin:0 0 5px}.chat-item p{font-size:13px;color:#aeb6c2;margin:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.user{height:76px;display:flex;align-items:center;gap:12px;padding:12px 16px;border-top:1px solid #303846}.avatar,.msg-avatar{border-radius:50%;background-size:cover;background-position:center;flex:none}.avatar{width:46px;height:46px}.msg-avatar{width:38px;height:38px}.name{font-weight:700;overflow:hidden;text-overflow:ellipsis}.logout{margin-left:auto;color:#fff;background:#dc2626;text-decoration:none;border-radius:8px;padding:8px 10px;font-size:13px}.main{flex:1;min-width:0;display:flex;flex-direction:column;background:#111827}.head{height:58px;padding:10px 18px;border-bottom:1px solid #303846;background:#1f2937}.head h1{font-size:17px;margin:0}.head p{font-size:13px;color:#aeb6c2;margin:3px 0 0}.messages{flex:1;overflow:auto;padding:18px;display:flex;flex-direction:column;gap:12px}.message{display:flex;gap:11px}.meta{display:flex;gap:8px;align-items:baseline;margin-bottom:4px}.nick{font-weight:800;color:#93c5fd}.time{font-size:12px;color:#8b95a5}.text{white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.45}.system{align-self:center;color:#aeb6c2;background:#1f2937;border-radius:999px;padding:7px 12px;font-size:13px}.input{height:60px;display:flex;border-top:1px solid #303846}.input input{flex:1;border:0;background:#0b1220;color:white;padding:0 16px;font:inherit;outline:0}.input button{width:64px;border:0;background:#5865f2;color:white;font-size:20px;cursor:pointer}.input button:disabled,.input input:disabled{opacity:.55}.modal{display:none;position:fixed;inset:0;background:#000a;place-items:center}.modal.active{display:grid}.modal-card{width:min(390px,92vw);background:#202632;border:1px solid #3b4556;border-radius:12px;padding:20px}.modal-card input{width:100%;border:1px solid #4b5563;background:#111827;color:white;border-radius:8px;padding:10px;margin:10px 0}.modal-card button{border:0;border-radius:8px;padding:9px 12px;margin-right:8px;background:#5865f2;color:white;cursor:pointer}.file{display:block;background:#374151;border-radius:8px;padding:10px;text-align:center;cursor:pointer}.file input{display:none}@media(max-width:720px){.app{flex-direction:column}.side{width:100%;height:42%;border-right:0}.main{height:58%}.user{height:68px}}
</style>
</head>
<body><div class="app"><aside class="side"><div class="brand">FreeChat</div><div id="chats" class="chats"><div class="system">Загрузка...</div></div><div id="user" class="user"><div id="user-avatar" class="avatar"></div><div><div id="user-name" class="name">${escapeHtml(username)}</div><div style="font-size:12px;color:#9aa3af">Профиль</div></div><a class="logout" href="/logout">Выйти</a></div></aside><main class="main"><header id="head" class="head"><h1>Выберите чат</h1><p></p></header><section id="messages" class="messages"><div class="system">Выберите чат слева, чтобы начать общение</div></section><div class="input"><input id="msg" disabled placeholder="Введите сообщение..."><button id="send" disabled>➤</button></div></main></div><div id="modal" class="modal"><div class="modal-card"><h3>Профиль</h3><label class="file">Сменить аватар<input id="avatar-file" type="file" accept="image/*"></label><input id="new-name" maxlength="20" placeholder="Новое имя"><button onclick="saveProfile()">Сохранить</button><button onclick="closeModal()" style="background:#4b5563">Отмена</button></div></div>
<script>
let username=${JSON.stringify(username)}, currentChatId=null, chats=[], avatars={};
let ws;
function connect(){ws=new WebSocket((location.protocol==='https:'?'wss://':'ws://')+location.host+'/ws');ws.onopen=()=>sendPacket('set_username',{username});ws.onmessage=e=>{const p=JSON.parse(e.data);handlers[p.type]?.(p.data)};ws.onclose=()=>setTimeout(connect,1000)}
function sendPacket(type,data){if(ws?.readyState===1)ws.send(JSON.stringify({type,data}))}
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
</script></body></html>`;
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
