import { sha256 } from "../utils/crypto.js";
import { cleanName } from "../utils/input.js";
import { getSessionToken } from "../utils/session.js";

const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;

export async function createSession(env, username) {
  const token = randomToken(32);
  await writeSession(env, token, username);
  return token;
}

export async function writeSession(env, token, username) {
  if (!env.SESSIONS || !token || !username) return;

  const key = await sessionKey(token);
  const value = {
    username: cleanName(username),
    created_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + SESSION_TTL_SECONDS * 1000).toISOString(),
  };

  await env.SESSIONS.put(key, JSON.stringify(value), { expirationTtl: SESSION_TTL_SECONDS });
}

export async function deleteSession(env, token) {
  if (!env.SESSIONS || !token) return;
  await env.SESSIONS.delete(await sessionKey(token));
}

export async function getSessionUser(env, request) {
  const token = getSessionToken(request);
  if (!token || !env.SESSIONS) return "";

  const raw = await env.SESSIONS.get(await sessionKey(token));
  if (!raw) return "";

  try {
    const session = JSON.parse(raw);
    if (!session.username || new Date(session.expires_at).getTime() <= Date.now()) return "";
    return cleanName(session.username);
  } catch {
    return "";
  }
}

function sessionKey(token) {
  return sha256(token).then((hash) => `session:${hash}`);
}

function randomToken(byteLength) {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return base64Url(bytes);
}

function base64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}
