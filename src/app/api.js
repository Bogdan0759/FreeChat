import { getChats, getHistory, getProfile, renameUser, updateAvatar } from "../data/chatStore.js";
import { arrayBufferToBase64 } from "../utils/avatar.js";
import { cleanName } from "../utils/input.js";
import { json } from "../utils/http.js";
import { writeSession } from "../data/sessionStore.js";
import { getSessionToken } from "../utils/session.js";

export async function handleApi(request, env, username, url) {
  if (!username) return json({ error: "Not authenticated" }, 401);

  if (request.method === "GET" && url.pathname === "/api/chats") {
    return json(await getChats(env.DB));
  }

  const historyMatch = url.pathname.match(/^\/api\/chats\/(\d+)\/history$/);
  if (request.method === "GET" && historyMatch) {
    return json(await getHistory(env.DB, Number(historyMatch[1])));
  }

  if (request.method === "GET" && url.pathname === "/api/user_profile") {
    return json(await getProfile(env.DB, username));
  }

  const avatarMatch = url.pathname.match(/^\/api\/user_avatar\/(.+)$/);
  if (request.method === "GET" && avatarMatch) {
    const profile = await getProfile(env.DB, decodeURIComponent(avatarMatch[1]));
    return json({ avatar_url: profile.avatar });
  }

  if (request.method === "POST" && url.pathname === "/api/user_avatars") {
    const body = await request.json();
    const names = [...new Set((body.users || []).map(cleanName).filter(Boolean))].slice(0, 100);
    const avatars = {};

    for (const name of names) {
      const profile = await getProfile(env.DB, name);
      avatars[name] = profile.avatar;
    }

    return json({ avatars });
  }

  if (request.method === "POST" && url.pathname === "/api/change_username") {
    return changeUsername(request, env, username);
  }

  if (request.method === "POST" && url.pathname === "/api/upload_avatar") {
    return uploadAvatar(request, env, username);
  }

  return null;
}

async function changeUsername(request, env, username) {
  if (!username) return json({ error: "Not authenticated" }, 401);

  const body = await request.json();
  const newUsername = cleanName(body.new_username);
  if (newUsername.length < 3 || newUsername.length > 20) {
    return json({ error: "Username must be 3-20 characters" }, 400);
  }

  try {
    if (!await renameUser(env.DB, username, newUsername)) return json({ error: "User not found" }, 404);
    await writeSession(env, getSessionToken(request), newUsername);
    return json({ success: true, new_username: newUsername });
  } catch {
    return json({ error: "Failed to update username" }, 400);
  }
}

async function uploadAvatar(request, env, username) {
  if (!username) return json({ error: "Not authenticated" }, 401);

  const form = await request.formData();
  const file = form.get("avatar");
  if (!(file instanceof File)) return json({ error: "No file provided" }, 400);
  if (!file.type.startsWith("image/")) return json({ error: "File must be an image" }, 400);
  if (file.size > 512 * 1024) return json({ error: "File too large, max 512KB on Workers+D1 MVP" }, 400);

  const avatarUrl = `data:${file.type};base64,${arrayBufferToBase64(await file.arrayBuffer())}`;
  await updateAvatar(env.DB, username, avatarUrl);
  return json({ success: true, avatar_url: avatarUrl });
}
