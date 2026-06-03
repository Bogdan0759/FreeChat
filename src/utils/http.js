export function html(body) {
  return new Response(body, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

export function json(data, status = 200, options = {}) {
  const headers = new Headers({ "Content-Type": "application/json; charset=utf-8" });
  if (options.cookie) headers.set("Set-Cookie", options.cookie);
  return new Response(JSON.stringify(data), { status, headers });
}

export function redirect(location, options = {}) {
  const headers = new Headers({ Location: location });
  if (options.cookie) headers.set("Set-Cookie", options.cookie);
  return new Response(null, { status: 303, headers });
}

export function notFound() {
  return new Response("Not found", { status: 404 });
}

export function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
