/* =========================================================
   Comunidade.com — funções compartilhadas da API
   (arquivos que começam com "_" não viram rota na Vercel)

   Variáveis de ambiente (Vercel → Settings → Environment Variables):
     ADMIN_SENHA     senha do painel /admin
     GITHUB_TOKEN    token "fine-grained" com acesso ao repositório (Contents: Read and write)
     GITHUB_REPO     dono/repositorio   ex.: araujogabr/comunidade
     GITHUB_BRANCH   branch publicada   ex.: main          (opcional, padrão "main")
     SESSION_SECRET  texto aleatório longo para assinar o login (opcional, recomendado)
   ========================================================= */
const crypto = require("crypto");
const fs = require("fs/promises");
const path = require("path");

const ARQUIVO_CATALOGO = "data/produtos.json";
const SESSAO_HORAS = 8;
const LOCAL = process.env.ARMAZENAMENTO_LOCAL === "1"; // só no tools/dev-server.js
const RAIZ_LOCAL = path.resolve(__dirname, "..");

// ---------------------------------------------------------
// Respostas
// ---------------------------------------------------------
function enviar(res, status, dados) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(dados));
}
const erro = (res, status, mensagem, extra = {}) => enviar(res, status, { erro: mensagem, ...extra });

function metodoPermitido(req, res, metodos) {
  if (metodos.includes(req.method)) return true;
  res.setHeader("Allow", metodos.join(", "));
  erro(res, 405, "Método não permitido.");
  return false;
}

// corpo da requisição (a Vercel já entrega req.body pronto; aqui garantimos o objeto)
async function lerCorpo(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") return JSON.parse(req.body || "{}");
  const partes = [];
  for await (const p of req) partes.push(p);
  const texto = Buffer.concat(partes).toString("utf8");
  return texto ? JSON.parse(texto) : {};
}

// ---------------------------------------------------------
// Configuração
// ---------------------------------------------------------
function config() {
  const faltando = [];
  if (!process.env.ADMIN_SENHA) faltando.push("ADMIN_SENHA");
  if (!LOCAL) {
    if (!process.env.GITHUB_TOKEN) faltando.push("GITHUB_TOKEN");
    if (!process.env.GITHUB_REPO) faltando.push("GITHUB_REPO");
  }
  return {
    faltando,
    senha: process.env.ADMIN_SENHA || "",
    token: process.env.GITHUB_TOKEN || "",
    repo: (process.env.GITHUB_REPO || "").trim().replace(/^https?:\/\/github\.com\//, "").replace(/\.git$/, ""),
    branch: process.env.GITHUB_BRANCH || "main",
  };
}
function exigirConfig(res) {
  const c = config();
  if (c.faltando.length) {
    erro(res, 500, `Configuração incompleta na Vercel. Falta: ${c.faltando.join(", ")}.`, { faltando: c.faltando });
    return null;
  }
  return c;
}

// ---------------------------------------------------------
// Login (token assinado, sem banco de dados)
// ---------------------------------------------------------
const b64url = (buf) => Buffer.from(buf).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
const hash = (t) => crypto.createHash("sha256").update(String(t)).digest();

function segredo() {
  const c = config();
  return process.env.SESSION_SECRET || hash(`comunidade|${c.senha}|${c.token}`).toString("hex");
}
function assinar(conteudo) {
  return b64url(crypto.createHmac("sha256", segredo()).update(conteudo).digest());
}
function criarToken() {
  const expira = Date.now() + SESSAO_HORAS * 3600 * 1000;
  const corpo = b64url(JSON.stringify({ exp: expira }));
  return { token: `${corpo}.${assinar(corpo)}`, expira };
}
function tokenValido(token) {
  if (!token || !token.includes(".")) return false;
  const [corpo, assinatura] = token.split(".");
  const esperado = assinar(corpo);
  const a = Buffer.from(assinatura), b = Buffer.from(esperado);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;
  try {
    const { exp } = JSON.parse(Buffer.from(corpo.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"));
    return typeof exp === "number" && exp > Date.now();
  } catch { return false; }
}
function senhaConfere(tentativa) {
  // compara resumos de mesmo tamanho para não vazar informação pelo tempo de resposta
  return crypto.timingSafeEqual(hash(tentativa), hash(config().senha));
}
function exigirLogin(req, res) {
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (tokenValido(token)) return true;
  erro(res, 401, "Sessão expirada. Entre novamente.");
  return false;
}
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------
// GitHub (lê e grava arquivos do repositório = "banco de dados")
// ---------------------------------------------------------
async function github(c, metodo, caminho, corpo) {
  const url = `https://api.github.com/repos/${c.repo}/contents/${caminho.split("/").map(encodeURIComponent).join("/")}` +
    (metodo === "GET" ? `?ref=${encodeURIComponent(c.branch)}` : "");
  const r = await fetch(process.env.GITHUB_API_URL ? url.replace("https://api.github.com", process.env.GITHUB_API_URL) : url, {
    method: metodo,
    headers: {
      Authorization: `Bearer ${c.token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "comunidade-admin",
      ...(corpo ? { "Content-Type": "application/json" } : {}),
    },
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  const dados = await r.json().catch(() => ({}));
  return { status: r.status, dados };
}

function explicarErroGithub(status, dados) {
  if (status === 401) return "O GITHUB_TOKEN é inválido ou expirou. Gere um novo token e atualize na Vercel.";
  if (status === 403) return "O GITHUB_TOKEN não tem permissão de escrita neste repositório (Contents: Read and write).";
  if (status === 404) return "Repositório, branch ou arquivo não encontrado. Confira GITHUB_REPO e GITHUB_BRANCH na Vercel.";
  return `GitHub respondeu ${status}: ${dados?.message || "erro desconhecido"}`;
}

// lê um arquivo de texto → { texto, sha }
async function lerArquivo(caminho) {
  if (LOCAL) {
    const texto = await fs.readFile(path.join(RAIZ_LOCAL, caminho), "utf8");
    return { texto, sha: hash(texto).toString("hex").slice(0, 40) };
  }
  const c = config();
  const { status, dados } = await github(c, "GET", caminho);
  if (status !== 200) throw Object.assign(new Error(explicarErroGithub(status, dados)), { status: status === 404 ? 404 : 502 });
  let texto;
  if (dados.content) texto = Buffer.from(dados.content, "base64").toString("utf8");
  else if (dados.download_url) texto = await (await fetch(dados.download_url, { headers: { Authorization: `Bearer ${c.token}` } })).text(); // arquivos > 1 MB
  return { texto, sha: dados.sha };
}

// grava (cria ou atualiza) → { sha, commitUrl }.  sha = versão que o painel tinha em mãos
async function gravarArquivo(caminho, conteudo, sha, mensagem) {
  const buffer = Buffer.isBuffer(conteudo) ? conteudo : Buffer.from(conteudo, "utf8");
  if (LOCAL) {
    const alvo = path.join(RAIZ_LOCAL, caminho);
    if (sha) {
      const atual = await fs.readFile(alvo, "utf8").catch(() => "");
      if (hash(atual).toString("hex").slice(0, 40) !== sha) throw Object.assign(new Error("conflito"), { status: 409 });
    }
    await fs.mkdir(path.dirname(alvo), { recursive: true });
    await fs.writeFile(alvo, buffer);
    return { sha: hash(buffer.toString("utf8")).toString("hex").slice(0, 40), commitUrl: null };
  }
  const c = config();
  const { status, dados } = await github(c, "PUT", caminho, {
    message: mensagem,
    content: buffer.toString("base64"),
    branch: c.branch,
    ...(sha ? { sha } : {}),
  });
  if (status === 409 || (status === 422 && /sha/i.test(dados?.message || ""))) {
    throw Object.assign(new Error("conflito"), { status: 409 });
  }
  if (status !== 200 && status !== 201) throw Object.assign(new Error(explicarErroGithub(status, dados)), { status: 502 });
  return { sha: dados.content?.sha, commitUrl: dados.commit?.html_url || null };
}

// ---------------------------------------------------------
// Catálogo: validação e formatação (1 produto por linha, fácil de ler no GitHub)
// ---------------------------------------------------------
function validarCatalogo(d) {
  const erros = [];
  if (!d || typeof d !== "object" || Array.isArray(d)) return ["O catálogo precisa ser um objeto."];
  if (!Array.isArray(d.produtos)) erros.push("Falta a lista de produtos.");
  const itens = new Set();
  (d.produtos || []).forEach((p, i) => {
    const ref = `Produto ${p && p.item != null ? "#" + p.item : i + 1}`;
    if (!p || typeof p !== "object") return erros.push(`${ref}: formato inválido.`);
    if (p.item == null || p.item === "") erros.push(`${ref}: falta o número do item.`);
    else if (itens.has(String(p.item))) erros.push(`${ref}: número repetido.`);
    else itens.add(String(p.item));
    if (!p.nome || typeof p.nome !== "string") erros.push(`${ref}: falta o nome.`);
    if (typeof p.preco !== "number" || !(p.preco >= 0)) erros.push(`${ref}: preço inválido.`);
    if (!Number.isInteger(p.quantidade) || p.quantidade < 0) erros.push(`${ref}: quantidade inválida.`);
    if (p.imagens != null && !Array.isArray(p.imagens) && typeof p.imagens !== "string") erros.push(`${ref}: imagens inválidas.`);
  });
  if (d.categorias != null && !Array.isArray(d.categorias)) erros.push("Categorias inválidas.");
  if (d.cupons != null && !Array.isArray(d.cupons)) erros.push("Cupons inválidos.");
  return erros.slice(0, 20);
}

function formatarCatalogo(d) {
  const linha = (v) => JSON.stringify(v);
  const blocos = Object.entries(d).map(([chave, valor]) => {
    if (Array.isArray(valor)) {
      if (!valor.length) return `  ${linha(chave)}: []`;
      return `  ${linha(chave)}: [\n${valor.map((x) => "    " + linha(x)).join(",\n")}\n  ]`;
    }
    if (valor && typeof valor === "object") {
      return `  ${linha(chave)}: ` + JSON.stringify(valor, null, 2).replace(/\n/g, "\n  ");
    }
    return `  ${linha(chave)}: ${linha(valor)}`;
  });
  return `{\n${blocos.join(",\n\n")}\n}\n`;
}

module.exports = {
  ARQUIVO_CATALOGO, LOCAL,
  enviar, erro, metodoPermitido, lerCorpo,
  config, exigirConfig, criarToken, senhaConfere, exigirLogin, esperar,
  lerArquivo, gravarArquivo, validarCatalogo, formatarCatalogo,
};
