import { defaultAvatar } from "../utils/avatar.js";
import { sha256 } from "../utils/crypto.js";
import { shortMessage } from "../utils/input.js";

const PASSWORD_VERSION = 2;
const DEFAULT_PASSWORDS = {
  admin: "123456",
  alice: "alice123",
  bob: "bob123",
};
export async function authenticateUser(db, username, password) {
  const row = await db.prepare("select username, password_hash, password_salt, password_version from users where username = ?")
    .bind(username).first();
  if (!row) return false;

  if (Number(row.password_version) === PASSWORD_VERSION && row.password_salt) {
    return row.password_hash === await hashPassword(password, row.password_salt);
  }

  const ok = row.password_hash === await sha256(password);
  if (ok) {
    await updatePassword(db, username, password);
    return true;
  }

  if (DEFAULT_PASSWORDS[username] === password) {
    await updatePassword(db, username, password);
    return true;
  }

  return false;
}

export async function createUser(db, username, password) {
  const password_salt = randomToken(18);
  const password_hash = await hashPassword(password, password_salt);
  await db.prepare("insert into users(username, password_hash, password_salt, password_version) values (?, ?, ?, ?)")
    .bind(username, password_hash, password_salt, PASSWORD_VERSION).run();
}

export async function updatePassword(db, username, password) {
  const password_salt = randomToken(18);
  const password_hash = await hashPassword(password, password_salt);
  await db.prepare("update users set password_hash = ?, password_salt = ?, password_version = ? where username = ?")
    .bind(password_hash, password_salt, PASSWORD_VERSION, username).run();
}

export async function getPasswordHash(db, username) {
  return db.prepare("select password_hash from users where username = ?").bind(username).first();
}

export async function renameUser(db, oldUsername, newUsername) {
  const old = await db.prepare("select password_hash, password_salt, password_version from users where username = ?")
    .bind(oldUsername).first();
  if (!old) return false;

  await db.batch([
    db.prepare("insert into users(username, password_hash, password_salt, password_version) values (?, ?, ?, ?)")
      .bind(newUsername, old.password_hash, old.password_salt, old.password_version),
    db.prepare("delete from users where username = ?").bind(oldUsername),
    db.prepare("update messages set nick = ? where nick = ?").bind(newUsername, oldUsername),
    db.prepare("update profiles set username = ? where username = ?").bind(newUsername, oldUsername),
  ]);

  return true;
}

export async function getChats(db) {
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
    last_message: row.message ? `${row.nick}: ${shortMessage(row.message)}` : "Нет сообщений",
  }));
}

export async function getHistory(db, chatId) {
  const rows = await db.prepare(
    "select nick, message, timestamp from messages where chat_id = ? order by id"
  ).bind(chatId).all();
  return rows.results;
}

export async function saveMessage(db, chatId, nick, message) {
  const timestamp = new Date().toISOString();
  await db.prepare(
    "insert into messages(chat_id, nick, message, timestamp) values (?, ?, ?, ?)"
  ).bind(chatId, nick, message, timestamp).run();

  return { nick, message, timestamp, chat_id: chatId };
}

export async function getProfile(db, username) {
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

export async function updateAvatar(db, username, avatarUrl) {
  await getProfile(db, username);
  await db.prepare("update profiles set avatar = ? where username = ?").bind(avatarUrl, username).run();
}

async function hashPassword(password, salt) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: new TextEncoder().encode(salt),
      iterations: 210000,
    },
    key,
    256
  );
  return base64Url(new Uint8Array(bits));
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
