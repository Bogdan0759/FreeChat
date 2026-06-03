export function defaultAvatar(username) {
  let hash = 0;
  for (const char of username) hash = ((hash << 5) - hash + char.charCodeAt(0)) | 0;
  return `/static/avatars/default_${Math.abs(hash % 8) + 1}.png`;
}

export function avatarResponse(pathname) {
  const n = Number((pathname.match(/default_(\d+)/) || [])[1] || 1);
  const colors = ["5865f2", "2dd4bf", "f97316", "ef4444", "22c55e", "eab308", "ec4899", "38bdf8"];
  const color = colors[(n - 1) % colors.length];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96"><rect width="96" height="96" rx="48" fill="#${color}"/><circle cx="48" cy="36" r="18" fill="white" opacity=".9"/><path d="M18 90c6-20 23-30 30-30s24 10 30 30" fill="white" opacity=".9"/></svg>`;
  return new Response(svg, { headers: { "Content-Type": "image/svg+xml" } });
}

export function arrayBufferToBase64(buffer) {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}
