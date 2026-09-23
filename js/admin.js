/* =========================================================
   Comunidade.com — painel de gerenciamento (/admin)
   Fluxo: entra com senha → edita à vontade (tudo fica só no navegador)
          → "Publicar" envia o catálogo para a API → commit no GitHub
          → a Vercel publica o site em ~1 minuto.
   ========================================================= */
(() => {
  "use strict";

  const TOKEN_KEY = "comunidade-admin-token";
  const RASCUNHO_KEY = "comunidade-admin-rascunho";
  const FOTO_MAX = 1400; // px do maior lado ao enviar foto
  const CONDICOES = ["novo", "usado", "usado testado"];

  const st = {
    token: sessionStorage.getItem(TOKEN_KEY) || "",
    original: null, // catálogo como está no GitHub
    atual: null,    // catálogo com as edições
    sha: "",
    aba: "produtos",
    editando: null, // item do produto aberto no formulário (null = novo)
    previews: {},   // caminho enviado → URL local para mostrar antes da publicação
    publicando: false,
  };

  // ---------- helpers ----------
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const brl = (v) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const norm = (s) => String(s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const slug = (s) => norm(s).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const numero = (v) => {
    if (typeof v === "number") return v;
    const t = String(v ?? "").trim().replace(/\s|R\$/g, "");
    // aceita 49,90 · 49.90 · 1.234,56
    const n = t.includes(",") ? Number(t.replace(/\./g, "").replace(",", ".")) : Number(t);
    return Number.isFinite(n) ? Math.round(n * 100) / 100 : NaN;
  };
  const precoTexto = (v) => (typeof v === "number" ? v.toFixed(2).replace(".", ",") : "");

  // mesma regra da loja: converte links do Drive/Dropbox/GitHub
  function normalizarUrl(url) {
    const u = String(url || "").trim();
    let m = u.match(/drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?(?:export=\w+&)?id=)([\w-]+)/);
    if (m) return `https://drive.google.com/thumbnail?id=${m[1]}&sz=w1200`;
    if (/dropbox\.com\//.test(u)) return u.replace(/[?&]dl=0/, "").replace(/(\?|$)/, (x) => (x === "?" ? "?raw=1&" : "?raw=1")).replace(/&$/, "");
    m = u.match(/^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/blob\/(.+)$/);
    if (m) return `https://raw.githubusercontent.com/${m[1]}/${m[2]}/${m[3]}`;
    return u;
  }
  const PLACEHOLDER = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><rect width='64' height='64' fill='#f1f1f1'/><rect x='20' y='20' width='24' height='24' rx='4' fill='#202020'/><path d='M26 16v4M32 16v4M38 16v4M26 44v4M32 44v4M38 44v4' stroke='#9a9a9a' stroke-width='2'/></svg>`);
  function fotoSrc(caminho) {
    if (!caminho) return PLACEHOLDER;
    if (st.previews[caminho]) return st.previews[caminho];
    return normalizarUrl(caminho);
  }
  function primeiraFoto(p) {
    const l = Array.isArray(p.imagens) ? p.imagens : p.imagens ? [p.imagens] : p.imagem ? [p.imagem] : [];
    return l[0] ? fotoSrc(l[0]) : `img/${p.item}.webp`;
  }
  // quando a imagem falha: tenta .jpg/.png da pasta img/ e depois o desenho padrão
  window.__admImg = (img) => {
    const tentativas = (img.dataset.alt || "").split("|").filter(Boolean);
    const prox = tentativas.shift();
    img.dataset.alt = tentativas.join("|");
    if (prox) img.src = prox; else { img.onerror = null; img.src = PLACEHOLDER; }
  };
  const imgHTML = (src, item, cls = "") =>
    `<img class="${cls}" src="${esc(src)}" alt="" loading="lazy" referrerpolicy="no-referrer"
      data-alt="${item != null ? `img/${esc(item)}.jpg|img/${esc(item)}.png` : ""}" onerror="window.__admImg(this)" />`;

  // ---------- API ----------
  async function api(caminho, opcoes = {}) {
    const r = await fetch(`/api/${caminho}`, {
      ...opcoes,
      headers: { "Content-Type": "application/json", ...(st.token ? { Authorization: `Bearer ${st.token}` } : {}), ...(opcoes.headers || {}) },
    });
    let dados = {};
    try { dados = await r.json(); } catch { /* resposta vazia */ }
    if (r.status === 401 && caminho !== "login") {
      sair(true);
      throw Object.assign(new Error(dados.erro || "Sessão expirada."), { status: 401 });
    }
    if (!r.ok) {
      const msg = r.status === 404 && !dados.erro
        ? "A API não foi encontrada. No computador, rode node tools/dev-server.js; online, confira se a pasta api/ foi publicada na Vercel."
        : dados.erro || `Erro ${r.status}`;
      throw Object.assign(new Error(msg), { status: r.status, dados });
    }
    return dados;
  }

  // ---------- login ----------
  async function entrar(e) {
    e.preventDefault();
    const btn = $("#loginBtn");
    const erroEl = $("#loginErro");
    erroEl.hidden = true;
    btn.disabled = true; btn.textContent = "Entrando...";
    try {
      const { token } = await api("login", { method: "POST", body: JSON.stringify({ senha: $("#loginSenha").value }) });
      st.token = token;
      sessionStorage.setItem(TOKEN_KEY, token);
      $("#loginSenha").value = "";
      await abrirPainel();
    } catch (err) {
      erroEl.textContent = err.message;
      erroEl.hidden = false;
    } finally {
      btn.disabled = false; btn.textContent = "Entrar";
    }
  }
  function sair(expirou = false) {
    st.token = "";
    sessionStorage.removeItem(TOKEN_KEY);
    $("#viewApp").hidden = true;
    $("#viewLogin").hidden = false;
    if (expirou) {
      $("#loginErro").textContent = "Sua sessão expirou. Entre de novo — suas alterações não publicadas foram guardadas neste navegador.";
      $("#loginErro").hidden = false;
    }
  }

  // ---------- carregar ----------
  async function abrirPainel() {
    $("#viewLogin").hidden = true;
    $("#viewApp").hidden = false;
    setStatus("Carregando catálogo...");
    try {
      const { catalogo, sha } = await api("produtos");
      st.original = catalogo;
      st.sha = sha;
      st.atual = clone(catalogo);
      garantirEstrutura(st.atual);
      recuperarRascunho();
      renderTudo();
    } catch (err) {
      if (err.status === 401) return;
      aviso("erro", `Não foi possível carregar o catálogo: ${esc(err.message)}`);
      setStatus("");
    }
  }
  function garantirEstrutura(c) {
    c.loja = c.loja || {};
    c.categorias = Array.isArray(c.categorias) ? c.categorias : [];
    c.cupons = Array.isArray(c.cupons) ? c.cupons : [];
    c.produtos = Array.isArray(c.produtos) ? c.produtos : [];
  }

  // rascunho: se a sessão cair ou a aba fechar, as edições não se perdem
  function salvarRascunho() {
    try {
      if (temAlteracoes()) localStorage.setItem(RASCUNHO_KEY, JSON.stringify({ sha: st.sha, atual: st.atual, em: Date.now() }));
      else localStorage.removeItem(RASCUNHO_KEY);
    } catch { /* ignore */ }
  }
  function recuperarRascunho() {
    let r;
    try { r = JSON.parse(localStorage.getItem(RASCUNHO_KEY) || "null"); } catch { r = null; }
    if (!r || !r.atual) return;
    if (r.sha === st.sha) {
      st.atual = r.atual;
      garantirEstrutura(st.atual);
      aviso("ok", "Recuperamos as alterações que você não tinha publicado.", `<button class="btn btn--ghost btn--sm" id="avDescartar">Descartar</button>`);
      $("#avDescartar")?.addEventListener("click", descartar);
    } else {
      aviso("erro", "Havia alterações não publicadas, mas o catálogo mudou no GitHub desde então. Elas foram guardadas em um arquivo para você conferir.",
        `<button class="btn btn--ghost btn--sm" id="avBaixar">Baixar rascunho</button>`);
      $("#avBaixar")?.addEventListener("click", () => baixarJSON(r.atual, "rascunho-produtos.json"));
      localStorage.removeItem(RASCUNHO_KEY);
    }
  }

  // ---------- alterações ----------
  const temAlteracoes = () => st.atual && JSON.stringify(st.atual) !== JSON.stringify(st.original);
  function resumoAlteracoes() {
    if (!st.atual) return { total: 0, texto: "" };
    const antes = new Map(st.original.produtos.map((p) => [String(p.item), JSON.stringify(p)]));
    const depois = new Map(st.atual.produtos.map((p) => [String(p.item), JSON.stringify(p)]));
    const novos = [], editados = [], excluidos = [];
    depois.forEach((v, k) => { if (!antes.has(k)) novos.push(k); else if (antes.get(k) !== v) editados.push(k); });
    antes.forEach((_, k) => { if (!depois.has(k)) excluidos.push(k); });
    const partes = [];
    const lista = (arr) => arr.slice(0, 6).map((i) => "#" + i).join(", ") + (arr.length > 6 ? "…" : "");
    if (novos.length) partes.push(`novo ${lista(novos)}`);
    if (editados.length) partes.push(`edita ${lista(editados)}`);
    if (excluidos.length) partes.push(`exclui ${lista(excluidos)}`);
    for (const k of ["loja", "categorias", "cupons"]) {
      if (JSON.stringify(st.atual[k]) !== JSON.stringify(st.original[k])) partes.push(k);
    }
    const outras = ["loja", "categorias", "cupons"].filter((k) => JSON.stringify(st.atual[k]) !== JSON.stringify(st.original[k])).length;
    return { total: novos.length + editados.length + excluidos.length + outras, texto: partes.join("; "), novos, editados };
  }
  function mudou() {
    salvarRascunho();
    atualizarTopo();
  }
  function atualizarTopo() {
    const r = resumoAlteracoes();
    $("#btnPublicar").disabled = !r.total || st.publicando;
    $("#pubCount").textContent = r.total ? r.total : "";
    $("#btnDescartar").hidden = !r.total;
    if (!st.publicando) setStatus(r.total ? `<span class="pend">● ${r.total} alteração(ões) não publicada(s)</span>` : `<span class="ok">✓ Tudo publicado</span>`);
    $("#cntProdutos").textContent = st.atual ? st.atual.produtos.length : "";
  }
  const setStatus = (html) => ($("#status").innerHTML = html);

  async function descartar() {
    if (!(await confirmar("Descartar alterações?", "Tudo que não foi publicado será perdido.", "Descartar"))) return;
    st.atual = clone(st.original);
    garantirEstrutura(st.atual);
    $("#aviso").hidden = true;
    mudou();
    renderTudo();
    toast("Alterações descartadas.");
  }

  // ---------- publicar ----------
  async function publicar() {
    const r = resumoAlteracoes();
    if (!r.total || st.publicando) return;
    const problemas = checarCatalogo(st.atual);
    if (problemas.length) {
      aviso("erro", `<b>Corrija antes de publicar:</b><br>${problemas.map(esc).join("<br>")}`);
      return;
    }
    st.publicando = true;
    $("#btnPublicar").disabled = true;
    setStatus("Publicando...");
    try {
      const catalogo = limparCatalogo(st.atual);
      const res = await api("produtos", { method: "PUT", body: JSON.stringify({ catalogo, sha: st.sha, mensagem: r.texto }) });
      st.sha = res.sha;
      st.original = clone(catalogo);
      st.atual = clone(catalogo);
      garantirEstrutura(st.atual);
      localStorage.removeItem(RASCUNHO_KEY);
      const hora = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
      aviso("ok", `✅ Publicado às ${hora}. O site atualiza em cerca de 1 minuto.` + (res.commitUrl ? ` <a href="${esc(res.commitUrl)}" target="_blank" rel="noopener">Ver alteração no GitHub</a>` : ""));
      toast("Catálogo publicado! 🚀");
      renderTudo();
    } catch (err) {
      if (err.status === 409) {
        aviso("erro", esc(err.message) + " Suas alterações continuam aqui; baixe-as antes de recarregar.",
          `<button class="btn btn--ghost btn--sm" id="avBaixar">Baixar minhas alterações</button><button class="btn btn--orange btn--sm" id="avRecarregar">Recarregar</button>`);
        $("#avBaixar").addEventListener("click", () => baixarJSON(st.atual, "minhas-alteracoes.json"));
        $("#avRecarregar").addEventListener("click", () => { localStorage.removeItem(RASCUNHO_KEY); abrirPainel(); });
      } else if (err.status !== 401) {
        const extra = err.dados?.problemas ? "<br>" + err.dados.problemas.map(esc).join("<br>") : "";
        aviso("erro", `Não foi possível publicar: ${esc(err.message)}${extra}`);
      }
    } finally {
      st.publicando = false;
      atualizarTopo();
    }
  }
  function checarCatalogo(c) {
    const p = [];
    const vistos = new Set();
    const cats = new Set(c.categorias.map((x) => x.id));
    c.produtos.forEach((x) => {
      if (vistos.has(String(x.item))) p.push(`Número de item repetido: #${x.item}`);
      vistos.add(String(x.item));
      if (!x.nome) p.push(`Produto #${x.item} sem nome.`);
      if (!(x.preco >= 0)) p.push(`Produto #${x.item} com preço inválido.`);
      if (!Number.isInteger(x.quantidade) || x.quantidade < 0) p.push(`Produto #${x.item} com estoque inválido.`);
      if (x.categoria && !cats.has(x.categoria)) p.push(`Produto #${x.item} usa a categoria "${x.categoria}", que não existe.`);
    });
    const ids = new Set();
    c.categorias.forEach((x) => {
      if (!x.id) p.push("Há uma categoria sem código.");
      else if (ids.has(x.id)) p.push(`Categoria repetida: ${x.id}`);
      ids.add(x.id);
    });
    const cods = new Set();
    c.cupons.forEach((x) => {
      if (!x.codigo) p.push("Há um cupom sem código.");
      else if (cods.has(x.codigo.toUpperCase())) p.push(`Cupom repetido: ${x.codigo}`);
      cods.add((x.codigo || "").toUpperCase());
      if (!(x.valor > 0)) p.push(`Cupom ${x.codigo || "?"} sem valor.`);
    });
    return p.slice(0, 12);
  }
  // remove campos vazios para o JSON ficar limpo
  function limparCatalogo(c) {
    const out = clone(c);
    out.produtos = out.produtos.map((p) => {
      const q = {};
      for (const [k, v] of Object.entries(p)) {
        if (k.startsWith("_")) continue;
        if (v === "" || v == null) continue;
        if (Array.isArray(v) && !v.length) continue;
        if (typeof v === "object" && !Array.isArray(v) && !Object.keys(v).length) continue;
        q[k] = v;
      }
      return q;
    });
    out.cupons = out.cupons.map((x) => {
      const q = { ...x };
      ["minimo", "validade", "descricao"].forEach((k) => { if (q[k] === "" || q[k] == null) delete q[k]; });
      if (q.ativo !== false) delete q.ativo;
      return q;
    });
    return out;
  }
  function baixarJSON(obj, nome) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" }));
    a.download = nome;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 3000);
  }

  // ---------- render ----------
  function renderTudo() {
    renderFiltroCat();
    renderProdutos();
    renderCategorias();
    renderCupons();
    renderLoja();
    atualizarTopo();
  }
  const nomeCat = (id) => st.atual.categorias.find((c) => c.id === id)?.nome || id || "sem categoria";

  function renderFiltroCat() {
    const sel = $("#filtroCat");
    const atual = sel.value;
    sel.innerHTML = `<option value="">Todas as categorias</option>` +
      st.atual.categorias.map((c) => `<option value="${esc(c.id)}">${esc(c.nome || c.id)}</option>`).join("");
    sel.value = atual;
  }

  function produtosFiltrados() {
    const termos = norm($("#busca").value).split(/\s+/).filter(Boolean);
    const cat = $("#filtroCat").value, est = $("#filtroEst").value;
    return st.atual.produtos
      .filter((p) => !cat || p.categoria === cat)
      .filter((p) => !est || (est === "zero" ? p.quantidade === 0 : p.quantidade <= 3))
      .filter((p) => termos.every((t) => norm(`${p.nome} ${p.item} ${nomeCat(p.categoria)}`).includes(t)))
      .sort((a, b) => (parseFloat(a.item) || 0) - (parseFloat(b.item) || 0));
  }

  function renderProdutos() {
    const orig = new Map(st.original.produtos.map((p) => [String(p.item), JSON.stringify(p)]));
    const lista = produtosFiltrados();
    if (!lista.length) {
      $("#lista").innerHTML = `<div class="vazio">${st.atual.produtos.length ? "Nenhum produto com esses filtros." : "Nenhum produto ainda. Clique em <b>Novo produto</b>."}</div>`;
      return;
    }
    $("#lista").innerHTML = lista.map((p) => {
      const k = String(p.item);
      const estado = !orig.has(k) ? "linha--novo" : orig.get(k) !== JSON.stringify(p) ? "linha--mod" : "";
      return `
        <div class="linha ${estado}" data-item="${esc(k)}">
          ${imgHTML(primeiraFoto(p), p.item, "linha__img")}
          <div class="linha__info">
            <strong title="${esc(p.nome)}">${esc(p.nome)}</strong>
            <small><span class="tagm">#${esc(p.item)}</span>${esc(nomeCat(p.categoria))} · ${esc(p.condicao || "novo")}</small>
          </div>
          <div class="linha__campos">
            <label>Preço<input data-campo="preco" value="${esc(precoTexto(p.preco))}" inputmode="decimal" aria-label="Preço de ${esc(p.nome)}" /></label>
            <label>Estoque<input data-campo="quantidade" type="number" min="0" step="1" value="${esc(p.quantidade)}" class="${p.quantidade === 0 ? "zero" : ""}" aria-label="Estoque de ${esc(p.nome)}" /></label>
          </div>
          <div class="linha__acoes">
            <button class="icon-btn" data-acao="editar" title="Editar" aria-label="Editar ${esc(p.nome)}"><svg viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16v4zM14 6l4 4"/></svg></button>
            <button class="icon-btn" data-acao="duplicar" title="Duplicar" aria-label="Duplicar ${esc(p.nome)}"><svg viewBox="0 0 24 24"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"/></svg></button>
            <button class="icon-btn del" data-acao="excluir" title="Excluir" aria-label="Excluir ${esc(p.nome)}"><svg viewBox="0 0 24 24"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg></button>
          </div>
        </div>`;
    }).join("");
  }

  function renderCategorias() {
    const uso = (id) => st.atual.produtos.filter((p) => p.categoria === id).length;
    $("#tabCategorias").innerHTML = st.atual.categorias.map((c, i) => `
      <div class="trow trow--cat" data-i="${i}">
        <label>Nome<input data-campo="nome" value="${esc(c.nome)}" placeholder="Ex.: Sensores" /></label>
        <label>Código<input data-campo="id" value="${esc(c.id)}" placeholder="ex.: sensores" /></label>
        <span class="uso">${uso(c.id)} produto(s)</span>
        <button class="icon-btn" data-acao="del" title="Excluir categoria" aria-label="Excluir categoria"><svg viewBox="0 0 24 24"><path d="M4 7h16M6 7l1 13h10l1-13M9 7V4h6v3"/></svg></button>
      </div>`).join("") || `<div class="vazio">Nenhuma categoria.</div>`;
  }

  function renderCupons() {
    $("#tabCupons").innerHTML = st.atual.cupons.map((c, i) => `
      <div class="trow trow--cupom" data-i="${i}">
        <label>Código<input data-campo="codigo" value="${esc(c.codigo)}" placeholder="TCC10" style="text-transform:uppercase" /></label>
        <label>Tipo<select data-campo="tipo"><option value="percentual" ${c.tipo === "percentual" ? "selected" : ""}>%</option><option value="valor" ${c.tipo === "valor" ? "selected" : ""}>R$</option></select></label>
        <label>Valor<input data-campo="valor" value="${esc(c.valor ?? "")}" inputmode="decimal" /></label>
        <label>Mínimo R$<input data-campo="minimo" value="${esc(c.minimo ?? "")}" inputmode="decimal" placeholder="—" /></label>
        <label>Validade<input data-campo="validade" type="date" value="${esc(c.validade || "")}" /></label>
        <label class="full">Descrição<input data-campo="descricao" value="${esc(c.descricao || "")}" /></label>
        <label class="chk"><input type="checkbox" data-campo="ativo" ${c.ativo === false ? "" : "checked"} /> ativo</label>
        <button class="icon-btn" data-acao="del" title="Excluir cupom" aria-label="Excluir cupom"><svg viewBox="0 0 24 24"><path d="M4 7h16M6 7l1 13h10l1-13M9 7V4h6v3"/></svg></button>
      </div>`).join("") || `<div class="vazio">Nenhum cupom.</div>`;
  }

  function renderLoja() {
    const f = $("#formLoja"), l = st.atual.loja;
    for (const el of f.elements) {
      if (!el.name) continue;
      const v = l[el.name];
      el.value = el.name === "formasPagamento" ? (v || []).join(", ") : v ?? "";
    }
  }

  // ---------- edição rápida (preço/estoque na lista) ----------
  function editarNaLista(e) {
    const inp = e.target.closest("[data-campo]");
    if (!inp) return;
    const k = inp.closest(".linha").dataset.item;
    const p = st.atual.produtos.find((x) => String(x.item) === k);
    if (!p) return;
    if (inp.dataset.campo === "preco") {
      const n = numero(inp.value);
      if (Number.isNaN(n) || n < 0) { inp.style.borderColor = "var(--bad)"; return; }
      inp.style.borderColor = "";
      p.preco = n;
    } else {
      const n = parseInt(inp.value, 10);
      if (!Number.isInteger(n) || n < 0) { inp.style.borderColor = "var(--bad)"; return; }
      inp.style.borderColor = "";
      p.quantidade = n;
      inp.classList.toggle("zero", n === 0);
    }
    const linha = inp.closest(".linha");
    const orig = st.original.produtos.find((x) => String(x.item) === k);
    linha.classList.toggle("linha--mod", !!orig && JSON.stringify(orig) !== JSON.stringify(p));
    mudou();
  }

  // ---------- formulário de produto ----------
  const proximoItem = () => Math.max(0, ...st.atual.produtos.map((p) => parseInt(p.item, 10) || 0)) + 1;

  function abrirForm(p = null, duplicar = false) {
    st.editando = p && !duplicar ? String(p.item) : null;
    const f = $("#formProduto");
    const base = p ? clone(p) : { condicao: "novo", quantidade: 1, categoria: st.atual.categorias[0]?.id || "" };
    if (duplicar) { base.item = proximoItem(); base.nome = `${base.nome} (cópia)`; }
    if (!p) base.item = proximoItem();
    $("#pformTitulo").textContent = st.editando ? `Editar #${base.item}` : duplicar ? "Duplicar produto" : "Novo produto";
    f.categoria.innerHTML = st.atual.categorias.map((c) => `<option value="${esc(c.id)}">${esc(c.nome || c.id)}</option>`).join("");
    f.item.value = base.item ?? "";
    f.nome.value = base.nome || "";
    f.categoria.value = base.categoria || "";
    f.condicao.value = CONDICOES.includes(base.condicao) ? base.condicao : "novo";
    f.preco.value = precoTexto(base.preco);
    f.quantidade.value = base.quantidade ?? 0;
    f.descricao.value = base.descricao || "";
    f.descricaoLonga.value = base.descricaoLonga || "";
    $("#specs").innerHTML = "";
    Object.entries(base.especificacoes || {}).forEach(([k, v]) => addSpec(k, v));
    $("#fotos").innerHTML = "";
    const imgs = Array.isArray(base.imagens) ? base.imagens : base.imagens ? [base.imagens] : base.imagem ? [base.imagem] : [];
    imgs.forEach((u) => addFoto(u));
    const legado = $("#fotosLegado");
    legado.hidden = !!imgs.length;
    legado.textContent = imgs.length ? "" : `Sem fotos cadastradas aqui: a loja usa os arquivos da pasta img/ (${base.item}.webp, ${base.item}-2.webp…), se existirem.`;
    f.dataset.fotosLegado = base.fotos || "";
    $("#pformErro").hidden = true;
    $("#dlgProduto").showModal();
    setTimeout(() => f.nome.focus(), 50);
  }

  function addSpec(k = "", v = "") {
    const d = document.createElement("div");
    d.className = "spec";
    d.innerHTML = `<input placeholder="Ex.: Tensão" value="${esc(k)}" /><input placeholder="Ex.: 5 V" value="${esc(v)}" />
      <button type="button" class="icon-btn" aria-label="Remover">✕</button>`;
    d.querySelector("button").onclick = () => d.remove();
    $("#specs").appendChild(d);
    return d;
  }

  function addFoto(url = "", carregando = false) {
    const d = document.createElement("div");
    d.className = "foto";
    d.innerHTML = `
      ${carregando ? `<span class="foto__load"></span>` : imgHTML(url ? fotoSrc(url) : PLACEHOLDER, null)}
      <div class="foto__meta">
        <input value="${esc(url)}" placeholder="https://... (link da imagem)" ${carregando ? "disabled" : ""} />
        <small>${carregando ? "Enviando..." : url.startsWith("img/") ? "arquivo no repositório" : url ? "link externo" : ""}</small>
      </div>
      <div class="foto__btns">
        <button type="button" class="icon-btn" data-f="up" title="Subir" aria-label="Mover para cima">↑</button>
        <button type="button" class="icon-btn" data-f="down" title="Descer" aria-label="Mover para baixo">↓</button>
        <button type="button" class="icon-btn" data-f="del" title="Remover" aria-label="Remover foto">✕</button>
      </div>`;
    const inp = d.querySelector("input");
    inp.addEventListener("change", () => {
      const img = d.querySelector("img");
      if (img) { img.dataset.alt = ""; img.src = inp.value.trim() ? fotoSrc(inp.value.trim()) : PLACEHOLDER; }
      d.querySelector("small").textContent = inp.value.trim().startsWith("img/") ? "arquivo no repositório" : inp.value.trim() ? "link externo" : "";
    });
    $("#fotos").appendChild(d);
    $("#fotosLegado").hidden = true;
    return d;
  }

  function moverFoto(e) {
    const b = e.target.closest("[data-f]");
    if (!b) return;
    const row = b.closest(".foto");
    if (b.dataset.f === "del") row.remove();
    if (b.dataset.f === "up" && row.previousElementSibling) row.parentNode.insertBefore(row, row.previousElementSibling);
    if (b.dataset.f === "down" && row.nextElementSibling) row.parentNode.insertBefore(row.nextElementSibling, row);
  }

  // reduz a foto no navegador (maior lado 1400 px, WEBP) antes de enviar
  function comprimir(arquivo) {
    return new Promise((ok, falha) => {
      const url = URL.createObjectURL(arquivo);
      const img = new Image();
      img.onload = () => {
        const escala = Math.min(1, FOTO_MAX / Math.max(img.naturalWidth, img.naturalHeight));
        const c = document.createElement("canvas");
        c.width = Math.round(img.naturalWidth * escala);
        c.height = Math.round(img.naturalHeight * escala);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        c.toBlob((blob) => {
          URL.revokeObjectURL(url);
          if (!blob) return falha(new Error("Não foi possível processar a imagem."));
          const tipo = blob.type || "image/jpeg";
          const leitor = new FileReader();
          leitor.onload = () => ok({ base64: String(leitor.result).split(",")[1], tipo, blob });
          leitor.readAsDataURL(blob);
        }, "image/webp", 0.82);
      };
      img.onerror = () => { URL.revokeObjectURL(url); falha(new Error(`"${arquivo.name}" não é uma imagem válida.`)); };
      img.src = url;
    });
  }

  async function enviarFotos(e) {
    const arquivos = [...e.target.files];
    e.target.value = "";
    for (const arq of arquivos) {
      const row = addFoto("", true);
      try {
        const { base64, tipo, blob } = await comprimir(arq);
        const { caminho } = await api("upload", { method: "POST", body: JSON.stringify({ nome: $("#formProduto").nome.value || arq.name, tipo, base64 }) });
        st.previews[caminho] = URL.createObjectURL(blob);
        const nova = addFoto(caminho);
        row.replaceWith(nova);
        toast("Foto enviada. Ela aparece no site depois de Publicar.");
      } catch (err) {
        row.remove();
        if (err.status !== 401) toast(err.message, true);
      }
    }
  }

  function guardarProduto(e) {
    e.preventDefault();
    const f = $("#formProduto");
    const erros = [];
    const item = f.item.value.trim();
    const itemNum = /^\d+$/.test(item) ? Number(item) : item;
    const preco = numero(f.preco.value);
    const qtd = parseInt(f.quantidade.value, 10);
    if (!item) erros.push("Informe o número do item.");
    else if (st.atual.produtos.some((p) => String(p.item) === String(itemNum) && String(p.item) !== st.editando)) erros.push(`Já existe um produto com o número #${item}.`);
    if (!f.nome.value.trim()) erros.push("Informe o nome.");
    if (!f.categoria.value) erros.push("Escolha uma categoria (cadastre na aba Categorias, se não houver).");
    if (Number.isNaN(preco) || preco < 0) erros.push("Preço inválido. Use por exemplo 49,90.");
    if (!Number.isInteger(qtd) || qtd < 0) erros.push("Estoque deve ser um número inteiro (0 ou mais).");
    if ($("#fotos .foto__load")) erros.push("Aguarde o envio das fotos terminar.");
    if (erros.length) {
      $("#pformErro").innerHTML = erros.map(esc).join("<br>");
      $("#pformErro").hidden = false;
      return;
    }
    const antigo = st.editando ? st.atual.produtos.find((p) => String(p.item) === st.editando) : null;
    const p = antigo ? clone(antigo) : {};
    Object.assign(p, {
      item: itemNum,
      nome: f.nome.value.trim(),
      descricao: f.descricao.value.trim(),
      categoria: f.categoria.value,
      preco,
      quantidade: qtd,
      condicao: f.condicao.value,
      descricaoLonga: f.descricaoLonga.value.trim(),
    });
    const specs = {};
    $$("#specs .spec").forEach((s) => {
      const [k, v] = $$("input", s).map((i) => i.value.trim());
      if (k && v) specs[k] = v;
    });
    p.especificacoes = specs;
    const imagens = $$("#fotos .foto input").map((i) => i.value.trim()).filter(Boolean);
    p.imagens = imagens;
    delete p.imagem;
    if (imagens.length) delete p.fotos;
    else if (f.dataset.fotosLegado) p.fotos = Number(f.dataset.fotosLegado);

    // mantém a ordem dos campos parecida com a do arquivo original
    const ordem = ["item", "nome", "descricao", "categoria", "preco", "quantidade", "condicao", "imagens", "fotos", "descricaoLonga", "especificacoes"];
    const final = {};
    ordem.forEach((k) => { if (k in p) final[k] = p[k]; });
    Object.keys(p).forEach((k) => { if (!(k in final)) final[k] = p[k]; });

    if (antigo) st.atual.produtos[st.atual.produtos.indexOf(antigo)] = final;
    else st.atual.produtos.push(final);
    $("#dlgProduto").close();
    mudou();
    renderProdutos();
    toast(antigo ? `#${final.item} atualizado (falta publicar).` : `#${final.item} criado (falta publicar).`);
  }

  async function excluirProduto(k) {
    const p = st.atual.produtos.find((x) => String(x.item) === k);
    if (!p) return;
    if (!(await confirmar("Excluir produto?", `#${p.item} — ${p.nome}. Ele sai da loja quando você publicar.`, "Excluir"))) return;
    st.atual.produtos = st.atual.produtos.filter((x) => x !== p);
    mudou();
    renderProdutos();
    toast(`#${p.item} excluído (falta publicar).`);
  }

  // ---------- categorias / cupons / loja ----------
  function editarTabela(e, lista, render) {
    const inp = e.target.closest("[data-campo]");
    if (!inp) return;
    const i = Number(inp.closest(".trow").dataset.i);
    const obj = st.atual[lista][i];
    const campo = inp.dataset.campo;
    let v = inp.type === "checkbox" ? inp.checked : inp.value;
    if (lista === "categorias" && campo === "id") {
      if (e.type === "input") return; // o código só é aplicado ao sair do campo
      const antigo = obj.id;
      v = slug(v);
      // renomear o código atualiza os produtos que usam a categoria
      if (e.type === "change" && antigo && v && antigo !== v) {
        st.atual.produtos.forEach((p) => { if (p.categoria === antigo) p.categoria = v; });
      }
      if (e.type === "change") inp.value = v;
    }
    if (lista === "cupons") {
      if (campo === "codigo") v = v.toUpperCase().replace(/\s+/g, "");
      if (campo === "valor" || campo === "minimo") v = v === "" ? "" : numero(v);
      if (campo === "ativo") v = inp.checked ? true : false;
    }
    obj[campo] = v;
    mudou();
    if (e.type === "change" && render) { render(); renderFiltroCat(); }
  }

  function novaCategoria() {
    st.atual.categorias.push({ id: "", nome: "" });
    renderCategorias();
    mudou();
    $$("#tabCategorias .trow").pop()?.querySelector("input")?.focus();
  }
  async function excluirCategoria(i) {
    const c = st.atual.categorias[i];
    const n = st.atual.produtos.filter((p) => p.categoria === c.id).length;
    if (n) return toast(`Não dá para excluir: ${n} produto(s) usam "${c.nome || c.id}". Mude a categoria deles antes.`, true);
    if (!(await confirmar("Excluir categoria?", c.nome || c.id || "(sem nome)", "Excluir"))) return;
    st.atual.categorias.splice(i, 1);
    renderCategorias(); renderFiltroCat(); mudou();
  }
  function novoCupom() {
    const ano = new Date().getFullYear();
    st.atual.cupons.push({ codigo: "", tipo: "percentual", valor: 10, minimo: "", validade: `${ano}-12-31`, descricao: "" });
    renderCupons();
    mudou();
    $$("#tabCupons .trow").pop()?.querySelector("input")?.focus();
  }
  async function excluirCupom(i) {
    const c = st.atual.cupons[i];
    if (!(await confirmar("Excluir cupom?", c.codigo || "(sem código)", "Excluir"))) return;
    st.atual.cupons.splice(i, 1);
    renderCupons(); mudou();
  }
  function editarLoja(e) {
    const el = e.target;
    if (!el.name) return;
    const l = st.atual.loja;
    if (el.name === "formasPagamento") l.formasPagamento = el.value.split(",").map((s) => s.trim()).filter(Boolean);
    else if (el.name === "orcamentoValidadeDias") l.orcamentoValidadeDias = el.value === "" ? undefined : parseInt(el.value, 10) || 0;
    else if (el.name === "whatsapp") l.whatsapp = el.value.replace(/\D/g, "");
    else l[el.name] = el.value;
    if (l.orcamentoValidadeDias === undefined) delete l.orcamentoValidadeDias;
    mudou();
  }

  // ---------- UI geral ----------
  function trocarAba(aba) {
    st.aba = aba;
    $$(".abas [data-aba]").forEach((b) => b.classList.toggle("active", b.dataset.aba === aba));
    $$("[data-painel]").forEach((p) => (p.hidden = p.dataset.painel !== aba));
  }
  function aviso(tipo, html, botoes = "") {
    const a = $("#aviso");
    a.className = `aviso aviso--${tipo}`;
    a.innerHTML = `<span>${html}</span>${botoes}`;
    a.hidden = false;
    a.scrollIntoView({ block: "nearest" });
  }
  function confirmar(titulo, texto, botao = "Confirmar") {
    return new Promise((ok) => {
      const d = $("#dlgConfirma");
      $("#confTitulo").textContent = titulo;
      $("#confTexto").textContent = texto;
      $("#confBtn").textContent = botao;
      d.returnValue = "";
      d.showModal();
      d.addEventListener("close", () => ok(d.returnValue === "sim"), { once: true });
    });
  }
  let toastT;
  function toast(msg, ruim = false) {
    const t = $("#toast");
    (document.querySelector("dialog[open]") || document.body).appendChild(t);
    t.textContent = msg;
    t.classList.toggle("warn", ruim);
    t.classList.add("show");
    clearTimeout(toastT);
    toastT = setTimeout(() => t.classList.remove("show"), 3200);
  }

  // ---------- eventos ----------
  $("#loginForm").addEventListener("submit", entrar);
  $("#btnSair").addEventListener("click", async () => {
    if (temAlteracoes() && !(await confirmar("Sair sem publicar?", "As alterações ficam guardadas neste navegador e voltam quando você entrar de novo.", "Sair"))) return;
    sair();
  });
  $("#btnPublicar").addEventListener("click", publicar);
  $("#btnDescartar").addEventListener("click", descartar);
  $$(".abas [data-aba]").forEach((b) => b.addEventListener("click", () => trocarAba(b.dataset.aba)));

  ["input", "change"].forEach((ev) => {
    $("#busca").addEventListener(ev, renderProdutos);
  });
  $("#filtroCat").addEventListener("change", renderProdutos);
  $("#filtroEst").addEventListener("change", renderProdutos);
  $("#btnNovo").addEventListener("click", () => {
    if (!st.atual.categorias.length) { trocarAba("categorias"); return toast("Cadastre ao menos uma categoria primeiro.", true); }
    abrirForm();
  });
  $("#lista").addEventListener("input", editarNaLista);
  $("#lista").addEventListener("change", (e) => {
    const inp = e.target.closest("[data-campo='preco']");
    if (inp && !Number.isNaN(numero(inp.value))) inp.value = precoTexto(numero(inp.value));
  });
  $("#lista").addEventListener("click", (e) => {
    const b = e.target.closest("[data-acao]");
    if (!b) return;
    const k = b.closest(".linha").dataset.item;
    const p = st.atual.produtos.find((x) => String(x.item) === k);
    if (b.dataset.acao === "editar") abrirForm(p);
    if (b.dataset.acao === "duplicar") abrirForm(p, true);
    if (b.dataset.acao === "excluir") excluirProduto(k);
  });

  $("#tabCategorias").addEventListener("input", (e) => editarTabela(e, "categorias"));
  $("#tabCategorias").addEventListener("change", (e) => editarTabela(e, "categorias", renderCategorias));
  $("#tabCategorias").addEventListener("click", (e) => { if (e.target.closest("[data-acao='del']")) excluirCategoria(Number(e.target.closest(".trow").dataset.i)); });
  $("#btnNovaCat").addEventListener("click", novaCategoria);
  $("#tabCupons").addEventListener("input", (e) => editarTabela(e, "cupons"));
  $("#tabCupons").addEventListener("change", (e) => editarTabela(e, "cupons", renderCupons));
  $("#tabCupons").addEventListener("click", (e) => { if (e.target.closest("[data-acao='del']")) excluirCupom(Number(e.target.closest(".trow").dataset.i)); });
  $("#btnNovoCupom").addEventListener("click", novoCupom);
  $("#formLoja").addEventListener("input", editarLoja);

  $("#formProduto").addEventListener("submit", guardarProduto);
  $("#btnAddSpec").addEventListener("click", () => addSpec().querySelector("input").focus());
  $("#btnAddLink").addEventListener("click", () => addFoto().querySelector("input").focus());
  $("#fotoArquivo").addEventListener("change", enviarFotos);
  $("#fotos").addEventListener("click", moverFoto);
  $$("dialog").forEach((d) => d.addEventListener("click", (e) => {
    if (e.target.closest("[data-close]")) d.close();
  }));

  window.addEventListener("beforeunload", (e) => {
    if (temAlteracoes()) { e.preventDefault(); e.returnValue = ""; }
  });

  // início
  if (st.token) abrirPainel();
})();
