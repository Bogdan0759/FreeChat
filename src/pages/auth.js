import { escapeHtml } from "../utils/http.js";

export function authPage(error = "") {
  return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>FreeChat - вход</title>
<style>${authCss}</style>
</head>
<body>
  <main class="card">
    <div class="logo">FreeChat</div>
    ${error ? `<div class="error">${escapeHtml(error)}</div>` : ""}
    <div class="tabs">
      <button id="login-tab" class="active" onclick="tab('login')">Вход</button>
      <button id="register-tab" onclick="tab('register')">Регистрация</button>
    </div>
    <form id="login" class="form active" action="/login" method="post">
      <label>Имя пользователя</label>
      <input name="username" required autocomplete="username">
      <label>Пароль</label>
      <input name="password" type="password" required autocomplete="current-password">
      <button type="submit">Войти</button>
    </form>
    <form id="register" class="form" action="/register" method="post">
      <label>Имя пользователя</label>
      <input name="username" required autocomplete="username">
      <label>Пароль</label>
      <input name="password" type="password" required autocomplete="new-password">
      <button type="submit">Зарегистрироваться</button>
    </form>
    <div class="hint">Тестовые аккаунты: admin/123456, alice/alice123, bob/bob123</div>
  </main>
<script>
function tab(id) {
  for (const x of ['login', 'register']) {
    document.getElementById(x).classList.toggle('active', x === id);
    document.getElementById(x + '-tab').classList.toggle('active', x === id);
  }
}
</script>
</body>
</html>`;
}

const authCss = `
*{box-sizing:border-box}
body{margin:0;min-height:100vh;background:#202329;color:#fff;font-family:Inter,system-ui,sans-serif;display:grid;place-items:center;padding:20px}
.card{width:min(440px,100%);background:#2b2f36;border:1px solid #444a55;border-radius:16px;padding:32px;box-shadow:0 18px 50px #0008}
.logo{font-size:32px;font-weight:800;text-align:center;margin-bottom:24px}
.tabs{display:flex;gap:8px;background:#1d2026;padding:4px;border-radius:10px;margin-bottom:24px}
.tabs button{flex:1;border:0;border-radius:8px;background:transparent;color:#aeb6c2;padding:10px;font-weight:700;cursor:pointer}
.tabs button.active{background:#434b5a;color:white}
.form{display:none}.form.active{display:block}
label{display:block;font-size:14px;margin:14px 0 8px;color:#d6d9df}
input{width:100%;border:1px solid #535a66;background:#171a20;color:#fff;border-radius:10px;padding:12px;font:inherit}
button[type=submit]{width:100%;border:0;border-radius:10px;background:#5865f2;color:white;margin-top:20px;padding:12px;font-weight:800;cursor:pointer}
.error{background:#4a2028;border-left:3px solid #ef4444;color:#ffd1d1;padding:10px;border-radius:8px;margin-bottom:16px}
.hint{text-align:center;color:#9aa3af;font-size:13px;margin-top:18px}
`;
