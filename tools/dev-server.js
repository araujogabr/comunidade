/* =========================================================
   Servidor local para testar a loja + painel /admin SEM a Vercel.

   Uso (na pasta do projeto):
     node tools/dev-server.js
   e abra http://localhost:3000  (loja)  e  http://localhost:3000/admin  (painel)

   Por padrão roda em "modo local": o painel lê e grava o data/produtos.json
   DA SUA PASTA (nada vai para o GitHub). Senha padrão: admin
   Para testar com o GitHub de verdade, crie um arquivo .env.local com:
     ADMIN_SENHA=...
     GITHUB_TOKEN=...
     GITHUB_REPO=dono/repositorio
     GITHUB_BRANCH=main
   (o .env.local está no .gitignore e nunca vai para o repositório)
   ========================================================= */
const http = require("http");
const fs = require("fs");
const path = require("path");

const RAIZ = path.resolve(__dirname, "..");
const PORTA = Number(process.env.PORT) || 3000;

// carrega .env.local (formato CHAVE=valor) — só ele liga o modo GitHub
const env = {};
try {
  for (const linha of fs.readFileSync(path.join(RAIZ, ".env.local"), "utf8").split(/\r?\n/)) {
    const m = linha.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch { /* sem .env.local */ }
for (const k of ["ADMIN_SENHA", "GITHUB_TOKEN", "GITHUB_REPO", "GITHUB_BRANCH", "SESSION_SECRET"]) {
  if (env[k] !== undefined) process.env[k] = env[k]; else delete process.env[k];
}

if (!env.GITHUB_TOKEN) {
  process.env.ARMAZENAMENTO_LOCAL = "1";
  process.env.ADMIN_SENHA = process.env.ADMIN_SENHA || "admin";
}

const TIPOS = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".webmanifest": "application/manifest+json",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".svg": "image/svg+xml", ".ico": "image/x-icon",
};

http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  let p = decodeURIComponent(url.pathname);

  // /api/nome → api/nome.js
  const api = p.match(/^\/api\/([a-z0-9-]+)\/?$/i);
  if (api) {
    const arquivo = path.join(RAIZ, "api", api[1] + ".js");
    if (!fs.existsSync(arquivo)) { res.statusCode = 404; return res.end("API não encontrada"); }
    delete require.cache[require.resolve(arquivo)]; // recarrega a cada chamada (edições aparecem na hora)
    delete require.cache[require.resolve(path.join(RAIZ, "api", "_lib.js"))];
    try { return await require(arquivo)(req, res); } catch (e) {
      console.error(e); res.statusCode = 500; return res.end(String(e));
    }
  }

  // arquivos estáticos (com "cleanUrls": /admin → admin.html)
  if (p.endsWith("/")) p += "index.html";
  let alvo = path.join(RAIZ, p);
  if (!alvo.startsWith(RAIZ)) { res.statusCode = 403; return res.end(); }
  if (!path.extname(alvo) && fs.existsSync(alvo + ".html")) alvo += ".html";
  fs.readFile(alvo, (err, dados) => {
    if (err) { res.statusCode = 404; return res.end("Não encontrado"); }
    res.setHeader("Content-Type", TIPOS[path.extname(alvo).toLowerCase()] || "application/octet-stream");
    res.setHeader("Cache-Control", "no-store");
    res.end(dados);
  });
}).listen(PORTA, () => {
  const modo = process.env.ARMAZENAMENTO_LOCAL === "1"
    ? "MODO LOCAL — grava no data/produtos.json da pasta (senha: " + process.env.ADMIN_SENHA + ")"
    : "GITHUB — grava em " + process.env.GITHUB_REPO;
  console.log(`\n  Loja:   http://localhost:${PORTA}\n  Painel: http://localhost:${PORTA}/admin\n  ${modo}\n`);
});
