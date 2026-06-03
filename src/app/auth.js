import { authenticateUser, createUser } from "../data/chatStore.js";
import { createSession, deleteSession } from "../data/sessionStore.js";
import { authPage } from "../pages/auth.js";
import { cleanName } from "../utils/input.js";
import { html, redirect } from "../utils/http.js";
import { clearSessionCookie, getSessionToken, sessionCookie } from "../utils/session.js";

export async function showAuth(request) {
  const url = new URL(request.url);
  return html(authPage(url.searchParams.get("error") || ""));
}

export async function login(request, env) {
  const form = await request.formData();
  const username = cleanName(form.get("username"));
  const password = String(form.get("password") || "");

  if (await authenticateUser(env.DB, username, password)) {
    const token = await createSession(env, username);
    return redirect("/chat", { cookie: sessionCookie(token, request) });
  }

  return authError("Неверное имя пользователя или пароль");
}

export async function register(request, env) {
  const form = await request.formData();
  const username = cleanName(form.get("username"));
  const password = String(form.get("password") || "");

  if (username.length < 3) return authError("Имя пользователя должно содержать минимум 3 символа");
  if (password.length < 4) return authError("Пароль должен содержать минимум 4 символа");

  try {
    await createUser(env.DB, username, password);
    const token = await createSession(env, username);
    return redirect("/chat", { cookie: sessionCookie(token, request) });
  } catch {
    return authError("Пользователь с таким именем уже существует");
  }
}

export async function logout(request, env) {
  await deleteSession(env, getSessionToken(request));
  return redirect("/auth", { cookie: clearSessionCookie(request) });
}

function authError(message) {
  return redirect("/auth?error=" + encodeURIComponent(message));
}
