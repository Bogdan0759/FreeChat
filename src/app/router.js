import { handleApi } from "./api.js";
import { login, logout, register, showAuth } from "./auth.js";
import { getSessionUser } from "../data/sessionStore.js";
import { chatPage } from "../pages/chat.js";
import { avatarResponse } from "../utils/avatar.js";
import { html, notFound, redirect } from "../utils/http.js";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const username = await getSessionUser(env, request);

    if (url.pathname === "/ws") {
      if (!username) return new Response("Unauthorized", { status: 401 });
      const id = env.ROOM.idFromName("global");
      const headers = new Headers(request.headers);
      headers.set("X-FreeChat-User", username);
      return env.ROOM.get(id).fetch(new Request(request, { headers }));
    }

    if (url.pathname.startsWith("/static/avatars/default_")) {
      return avatarResponse(url.pathname);
    }

    if (request.method === "GET" && url.pathname === "/") {
      return redirect(username ? "/chat" : "/auth");
    }

    if (request.method === "GET" && url.pathname === "/auth") return showAuth(request);
    if (request.method === "POST" && url.pathname === "/login") return login(request, env);
    if (request.method === "POST" && url.pathname === "/register") return register(request, env);
    if (request.method === "GET" && url.pathname === "/logout") return logout(request, env);

    if (request.method === "GET" && url.pathname === "/chat") {
      if (!username) return redirect("/auth");
      return html(chatPage(username));
    }

    const apiResponse = await handleApi(request, env, username, url, request);
    if (apiResponse) return apiResponse;

    return notFound();
  },
};
