/* =========================================================
   Comunidade.com — Service Worker (modo offline / app instalável)
   - Páginas, CSS, JS e JSON: tenta a rede primeiro (sempre atualizado)
     e usa a cópia salva só quando estiver sem internet.
   - Imagens e fontes: usa a cópia salva e atualiza em segundo plano.
   Ao mudar arquivos do site NÃO é preciso mexer aqui. Só aumente a
   VERSAO se quiser forçar a limpeza do cache de todos os visitantes.
   ========================================================= */
const VERSAO = "v6";
const CACHE = `comunidade-${VERSAO}`;
const ESSENCIAIS = [
  "./",
  "index.html",
  "css/style.css",
  "js/app.js",
  "data/produtos.json",
  "manifest.webmanifest",
  "favicon.ico",
  "img/icons/favicon-32.png",
  "img/icons/icon-192.png",
  "img/icons/icon-512.png",
  "img/abertura.jpg",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ESSENCIAIS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("comunidade-") && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  const mesmaOrigem = url.origin === self.location.origin;
  const fonte = /fonts\.(googleapis|gstatic)\.com$/.test(url.hostname);
  if (!mesmaOrigem && !fonte) return; // WhatsApp etc.: não mexe
  // painel e API nunca passam pelo cache (dados sempre atuais e privados)
  if (mesmaOrigem && (url.pathname.startsWith("/api/") || /^\/admin(\.html)?$/.test(url.pathname) || url.pathname.includes("/js/admin") || url.pathname.includes("/css/admin"))) return;

  const ehImagem = req.destination === "image" || fonte;
  e.respondWith(ehImagem ? cacheDepoisRede(e, req) : redeDepoisCache(req));
});

async function redeDepoisCache(req) {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch(req, { cache: "no-store" });
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch {
    const salvo = await cache.match(req, { ignoreSearch: true });
    if (salvo) return salvo;
    if (req.mode === "navigate") return cache.match("index.html");
    return Response.error();
  }
}

async function cacheDepoisRede(e, req) {
  const cache = await caches.open(CACHE);
  const salvo = await cache.match(req);
  const rede = fetch(req)
    .then((res) => { if (res.ok || res.type === "opaque") cache.put(req, res.clone()); return res; })
    .catch(() => null);
  if (salvo) { e.waitUntil(rede); return salvo; }
  return (await rede) || Response.error();
}
