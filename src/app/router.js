import { handleApi } from "./api.js";
import { login, logout, register, showAuth } from "./auth.js";
import { chatPage } from "../pages/chat.js";
import { avatarResponse } from "../utils/avatar.js";
import { html, notFound, redirect } from "../utils/http.js";
import { getSessionUser } from "../utils/session.js";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const username = getSessionUser(request);

    if (url.pathname === "/ws") {
      const id = env.ROOM.idFromName("global");
      return env.ROOM.get(id).fetch(request);
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
    if (request.method === "GET" && url.pathname === "/logout") return logout();

    if (request.method === "GET" && url.pathname === "/chat") {
      if (!username) return redirect("/auth");
      return html(chatPage(username));
    }

    const apiResponse = await handleApi(request, env, username, url);
    if (apiResponse) return apiResponse;

    return notFound();
  },
};
