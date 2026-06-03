export const COOKIE_NAME = "freechat_user";

export function getSessionUser(request) {
  const cookies = request.headers.get("Cookie") || "";
  for (const part of cookies.split(";")) {
    const [key, value] = part.trim().split("=");
    if (key === COOKIE_NAME) return decodeURIComponent(value || "");
  }
  return "";
}

export function sessionCookie(username) {
  return `${COOKIE_NAME}=${encodeURIComponent(username)}; Path=/; Max-Age=2592000; SameSite=Lax; HttpOnly`;
}

export function clearSessionCookie() {
  return `${COOKIE_NAME}=; Path=/; Max-Age=0; SameSite=Lax`;
}
