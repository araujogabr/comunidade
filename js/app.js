/* =========================================================
   Comunidade.com — lógica da loja (HTML + CSS + JS puro)
   Todos os dados vêm de data/produtos.json
   ========================================================= */
(() => {
  "use strict";

  // ---------- Configurações ----------
  const DATA_URL = "data/produtos.json";
  const CART_KEY = "comunidade-cart-v2";
  const COUPON_KEY = "comunidade-cupom";
  const THEME_KEY = "comunidade-theme";
  const IMG_DIR = "img/";
  const IMG_EXTS = ["webp", "jpg", "png"]; // ordem de tentativa (webp = otimizada)
  const LOADER_MIN = 2000; // ms — tempo mínimo da animação
  const LOADER_MAX = 3000; // ms — nunca passa disso
  const LOW_STOCK = 3;
  const SUGGEST_MAX = 6;

  // ---------- Estado ----------
  const state = {
    loja: {},
    categorias: [],
    produtos: [],
    kits: [],
    cupons: [],
    filtros: novoFiltro(),
    precoLimites: [0, 0],
    carrinho: load(CART_KEY, {}), // { "29": 2, "kit:robotica": 1 }
    cupom: load(COUPON_KEY, ""),
    selecao: {}, // quantidade escolhida antes de adicionar
    modalItem: null,
    modalFoto: 0,
    abertoPorNavegacao: false,
  };

  function novoFiltro() {
    return { categoria: "todos", condicao: "todas", busca: "", soDisponiveis: false, ordem: "item", precoMin: null, precoMax: null };
  }

  // ---------- Helpers ----------
  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
  const brl = (v) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const norm = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const onlyDigits = (s) => String(s ?? "").replace(/\D/g, "");
  const round2 = (n) => Math.round(n * 100) / 100;
  const getProduto = (item) => state.produtos.find((p) => String(p.item) === String(item));
  const getKit = (id) => state.kits.find((k) => k.id === id);
  const nomeCategoria = (id) => state.categorias.find((c) => c.id === id)?.nome || id || "";
  const siteUrl = () => location.origin + location.pathname;
  const nomeLoja = () => state.loja.nome || "Comunidade.com";

  function load(key, fallback) {
    try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
  }
  function save(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* ignore */ }
  }

  // Telefone BR -> formato internacional para o WhatsApp (55 + DDD + número)
  function phoneToWa(raw) {
    let d = onlyDigits(raw).replace(/^0+/, "");
    if (d.length === 10 || d.length === 11) d = "55" + d;
    return d.length >= 12 ? d : "";
  }
  function maskPhone(v) {
    const d = onlyDigits(v).slice(0, 11);
    if (d.length <= 2) return d.length ? `(${d}` : "";
    if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
    if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
    return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  }
  const waLink = (numero, texto) => `https://api.whatsapp.com/send?phone=${numero}&text=${encodeURIComponent(texto)}`;
  const waShare = (texto) => `https://api.whatsapp.com/send?text=${encodeURIComponent(texto)}`;
  const lojaWa = () => onlyDigits(state.loja.whatsapp);
  function openWa(url) {
    const w = window.open(url, "_blank", "noopener");
    if (!w) location.href = url; // se o navegador bloquear pop-up
  }
  function dataHora() {
    return new Date().toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
  }
  function codigo(prefixo) {
    const d = new Date();
    const ymd = `${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
    return `${prefixo}-${ymd}-${Math.floor(1000 + Math.random() * 9000)}`;
  }
  async function copiar(texto) {
    try { await navigator.clipboard.writeText(texto); return true; } catch {
      const t = document.createElement("textarea");
      t.value = texto; t.style.position = "fixed"; t.style.opacity = "0";
      document.body.appendChild(t); t.select();
      const ok = document.execCommand("copy"); t.remove(); return ok;
    }
  }

  // =========================================================
  // IMAGENS — nome = número do item (29.webp, 29-2.webp...)
  // =========================================================
  function placeholder(label) {
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 300'>
      <rect width='400' height='300' fill='#f1f1f1'/>
      <g fill='none' stroke='#5dd62c' stroke-width='4' opacity='.6'>
        <path d='M0 90h120l30 30h40M0 210h110l30-30h50M400 90H280l-30 30h-40M400 210H290l-30-30h-50'/>
      </g>
      <rect x='150' y='95' width='100' height='110' rx='12' fill='#202020'/>
      <g fill='#9a9a9a'>${[0, 1, 2, 3].map((i) => `<rect x='${160 + i * 22}' y='82' width='8' height='13'/><rect x='${160 + i * 22}' y='205' width='8' height='13'/>`).join("")}</g>
      <text x='200' y='158' font-family='monospace' font-size='24' font-weight='700' fill='#fff' text-anchor='middle'>${esc(label)}</text>
    </svg>`;
    return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  }
  // base: "29" (foto 1) ou "29-2" (foto 2)
  function imgTag({ base, alt = "", cls = "", custom = "", label = "", eager = false }) {
    const src = custom || `${IMG_DIR}${base}.${IMG_EXTS[0]}`;
    return `<img class="${cls}" src="${esc(src)}" alt="${esc(alt)}" ${eager ? "" : 'loading="lazy"'} decoding="async" referrerpolicy="no-referrer"
      data-base="${esc(base)}" data-label="${esc(label || "#" + base)}" data-try="${custom ? -1 : 0}"
      onerror="window.__comunidadeImg(this)" />`;
  }
  window.__comunidadeImg = (img) => {
    const t = Number(img.dataset.try);
    if (t >= 0 && t + 1 < IMG_EXTS.length) {
      img.dataset.try = t + 1;
      img.src = `${IMG_DIR}${img.dataset.base}.${IMG_EXTS[t + 1]}`;
    } else if (t === -1) {
      // caminho personalizado falhou: tenta o padrão
      img.dataset.try = 0;
      img.src = `${IMG_DIR}${img.dataset.base}.${IMG_EXTS[0]}`;
    } else {
      img.onerror = null;
      img.src = placeholder(img.dataset.label);
    }
  };
  // ---- fotos vindas de links (campo "imagens" no produtos.json) ----
  // Aceita links diretos e corrige automaticamente links de compartilhamento
  // do Google Drive, Dropbox e GitHub para o endereço da imagem em si.
  function normalizarUrl(url) {
    const u = String(url || "").trim();
    let m = u.match(/drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?(?:export=\w+&)?id=)([\w-]+)/);
    if (m) return `https://drive.google.com/thumbnail?id=${m[1]}&sz=w1200`;
    if (/dropbox\.com\//.test(u)) return u.replace(/[?&]dl=0/, "").replace(/(\?|$)/, (x) => (x === "?" ? "?raw=1&" : "?raw=1")).replace(/&$/, "");
    m = u.match(/^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/blob\/(.+)$/);
    if (m) return `https://raw.githubusercontent.com/${m[1]}/${m[2]}/${m[3]}`;
    return u;
  }
  // lista de links do produto (vazia = usa as fotos locais img/29.webp, img/29-2.webp…)
  function linksFotos(p) {
    if (p._links) return p._links;
    let lista = Array.isArray(p.imagens) ? p.imagens : p.imagens ? [p.imagens] : p.imagem ? [p.imagem] : [];
    p._links = lista.filter((x) => typeof x === "string" && x.trim()).map(normalizarUrl);
    return p._links;
  }
  const fotoBase = (p, i) => (i === 0 ? String(p.item) : `${p.item}-${i + 1}`);
  const totalFotos = (p) => linksFotos(p).length || Math.max(1, parseInt(p.fotos, 10) || 1);
  const produtoImg = (p, cls = "", i = 0, eager = false) =>
    imgTag({ base: fotoBase(p, i), alt: p.nome, cls, custom: linksFotos(p)[i] || "", label: `#${p.item}`, eager });

  // chuva de caracteres estilo "Matrix" (fundo da abertura)
  function chuvaDigital(canvas) {
    if (!canvas) return () => {};
    const ctx = canvas.getContext("2d");
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const TAM = 15;
    const CHARS = "01アイウエオカキクケコ0123456789ABCDEF<>/{}#$".split("");
    let colunas, gotas, w, h, rodando = true, ultimo = 0;
    function medir() {
      w = canvas.clientWidth; h = canvas.clientHeight;
      canvas.width = w * dpr; canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      colunas = Math.ceil(w / TAM);
      gotas = Array.from({ length: colunas }, () => Math.random() * -h / TAM);
      ctx.fillStyle = "#050505"; ctx.fillRect(0, 0, w, h);
    }
    medir();
    window.addEventListener("resize", medir);
    function quadro(t) {
      if (!rodando) return;
      requestAnimationFrame(quadro);
      if (t - ultimo < 45) return; // ~22 fps é suficiente e leve
      ultimo = t;
      ctx.fillStyle = "rgba(5, 5, 5, .14)";
      ctx.fillRect(0, 0, w, h);
      ctx.font = `600 ${TAM - 2}px "JetBrains Mono", monospace`;
      for (let i = 0; i < colunas; i++) {
        const y = gotas[i] * TAM;
        const ch = CHARS[(Math.random() * CHARS.length) | 0];
        ctx.fillStyle = Math.random() > .96 ? "#f8f8f8" : (Math.random() > .5 ? "#5dd62c" : "#337418");
        ctx.fillText(ch, i * TAM, y);
        if (y > h && Math.random() > .975) gotas[i] = 0;
        gotas[i] += 1;
      }
    }
    requestAnimationFrame(quadro);
    return () => { rodando = false; window.removeEventListener("resize", medir); };
  }

  // =========================================================
  // LOADER — boot de "sistema embarcado" (máx. 3s)
  // =========================================================
  const loader = (() => {
    const start = performance.now();
    const logEl = $("#loaderLog");
    const bar = $("#loaderBar");
    const linhas = [
      ["SYS ", "Inicializando terminal..."],
      ["NET ", "Conectando à comunidade..."],
      ["I2C ", "Sensores detectados: 0x3C 0x68"],
      ["PWM ", "Atuadores calibrados"],
      ["AUTH", "Acesso liberado"],
      ["HTTP", "Carregando catálogo"],
      ["OK  ", "Bem-vindo à Comunidade.com"],
    ];
    let i = 0, finished = false, dataReady = false;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const minTime = reduced ? 400 : LOADER_MIN;
    const pararChuva = reduced ? () => {} : chuvaDigital($("#loaderRain"));

    const logTimer = setInterval(() => {
      if (i >= linhas.length) return clearInterval(logTimer);
      const [tag, msg] = linhas[i++];
      const li = document.createElement("li");
      li.innerHTML = `<b>[${esc(tag)}]</b> ${esc(msg)}`;
      logEl.appendChild(li);
      while (logEl.children.length > 3) logEl.firstChild.remove();
    }, LOADER_MIN / linhas.length);

    let raf;
    const tick = () => {
      const t = performance.now() - start;
      bar.style.width = Math.min(100, (t / minTime) * (dataReady ? 100 : 90)) + "%";
      if (!finished) raf = requestAnimationFrame(tick);
    };
    tick();

    const callbacks = [];
    function finish() {
      if (finished) return;
      finished = true;
      clearInterval(logTimer);
      cancelAnimationFrame(raf);
      bar.style.width = "100%";
      setTimeout(pararChuva, 700);
      setTimeout(() => {
        $("#loader").classList.add("is-done");
        document.body.classList.remove("is-loading");
        setTimeout(() => $("#loader")?.remove(), 500);
        callbacks.forEach((fn) => fn());
      }, 120);
    }
    setTimeout(finish, LOADER_MAX - 120 - (performance.now() - start)); // teto de 3 s

    return {
      ready() {
        dataReady = true;
        setTimeout(finish, Math.max(0, minTime - (performance.now() - start)));
      },
      onDone(fn) { finished ? fn() : callbacks.push(fn); },
    };
  })();

  // =========================================================
  // CARREGAR DADOS
  // =========================================================
  async function init() {
    try {
      const res = await fetch(DATA_URL, { cache: "no-store" });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const data = await res.json();
      state.loja = data.loja || {};
      state.categorias = data.categorias || [];
      state.cupons = data.cupons || [];
      state.produtos = (data.produtos || []).map((p) => ({
        ...p,
        preco: Number(p.preco) || 0,
        quantidade: Math.max(0, parseInt(p.quantidade, 10) || 0),
        condicao: (p.condicao || "novo").toLowerCase(),
      }));
      state.kits = []; // área de kits removida do site

      sanitizeCart();
      applyLoja();
      setupPriceFilter();
      renderCategorias();
      renderCondicoes();
      renderProdutos();
      renderComoFunciona(data.comoFunciona || []);
      renderCart();
      loader.onDone(() => routeFromHash(true));
    } catch (err) {
      console.error(err);
      const arquivo = location.protocol === "file:";
      const rede = err instanceof TypeError && /fetch/i.test(err.message);
      const json = err instanceof SyntaxError;
      $("#productGrid").innerHTML = `<div class="empty" style="grid-column:1/-1">
        <p><strong>Não foi possível carregar o catálogo.</strong></p>
        <p>${arquivo || rede
          ? "Se você abriu o arquivo direto (file://), rode um servidor local — ex.: extensão <em>Live Server</em> do VS Code ou <code>python -m http.server</code>."
          : json
            ? "O arquivo <code>data/produtos.json</code> tem um erro de sintaxe. Abra <a href=\"validar.html\">validar.html</a> para ver a linha."
            : `Erro no site: <code>${esc(err.message)}</code>`}</p>
      </div>`;
    } finally {
      loader.ready();
    }
  }

  function applyLoja() {
    const l = state.loja;
    // cada elemento é opcional: se for removido do HTML, o site continua funcionando
    const set = (sel, fn) => { const el = $(sel); if (el) fn(el); };
    if (l.slogan) set("#lojaSlogan", (el) => (el.textContent = l.slogan));
    if (l.cidade) set("#lojaCidade", (el) => (el.textContent = l.cidade));
    const vender = waLink(lojaWa(), l.mensagemVenderDoar || "Olá! Gostaria de vender/doar componentes.");
    set("#venderDoar", (el) => (el.href = vender));
    set("#footerVender", (el) => (el.href = vender));
    set("#footerWhats", (el) => (el.href = waLink(lojaWa(), `Olá! Vim pelo site ${nomeLoja()}.`)));
    if (l.instagram) set("#footerInsta", (a) => {
      a.href = l.instagram.startsWith("http") ? l.instagram : `https://instagram.com/${l.instagram.replace("@", "")}`;
      a.hidden = false;
    });
    const pay = l.formasPagamento?.length ? l.formasPagamento : ["Pix", "Cartão", "Dinheiro"];
    set("#paySelect", (el) => (el.innerHTML = `<option value="">Selecione...</option>` + pay.map((f) => `<option>${esc(f)}</option>`).join("")));
    if (l.entrega) set("#checkoutDelivery", (el) => (el.textContent = "🚚 " + l.entrega));
  }

  // =========================================================
  // ESTOQUE (produtos avulsos + produtos dentro de kits)
  // =========================================================
  const kitKey = (id) => "kit:" + id;
  const isKitKey = (key) => key.startsWith("kit:");

  // quanto de um produto já está no carrinho (avulso + dentro de kits)
  function reservado(item, ignorarChave = null) {
    let total = 0;
    for (const [key, qtd] of Object.entries(state.carrinho)) {
      if (key === ignorarChave) continue;
      if (isKitKey(key)) {
        const kit = getKit(key.slice(4));
        kit?.itens.forEach((c) => { if (String(c.item) === String(item)) total += c.qtd * qtd; });
      } else if (key === String(item)) total += qtd;
    }
    return total;
  }
  const disponivel = (p) => p.quantidade - reservado(p.item);

  function kitPrecoCheio(kit) {
    return round2(kit.itens.reduce((s, c) => s + getProduto(c.item).preco * c.qtd, 0));
  }
  function kitPreco(kit) {
    return round2(kitPrecoCheio(kit) * (1 - kit.desconto / 100));
  }
  // quantos kits ainda cabem no estoque (desconsiderando uma chave, se preciso)
  function kitMax(kit, ignorarChave = null) {
    return Math.max(0, Math.min(...kit.itens.map((c) => {
      const p = getProduto(c.item);
      return Math.floor((p.quantidade - reservado(p.item, ignorarChave)) / c.qtd);
    })));
  }

  function sanitizeCart() {
    const antes = JSON.stringify(state.carrinho);
    for (const key of Object.keys(state.carrinho)) {
      const ok = isKitKey(key) ? getKit(key.slice(4)) : getProduto(key);
      if (!ok || !(state.carrinho[key] > 0)) delete state.carrinho[key];
    }
    // ajusta ao estoque atual
    for (const key of Object.keys(state.carrinho)) {
      const max = isKitKey(key) ? kitMax(getKit(key.slice(4)), key) : getProduto(key).quantidade - reservado(key, key);
      if (max <= 0) delete state.carrinho[key];
      else state.carrinho[key] = Math.min(state.carrinho[key], max);
    }
    if (JSON.stringify(state.carrinho) !== antes) save(CART_KEY, state.carrinho);
  }

  // =========================================================
  // FILTROS
  // =========================================================
  function renderCategorias() {
    const usadas = state.categorias.filter((c) => state.produtos.some((p) => p.categoria === c.id));
    const count = (id) => state.produtos.filter((p) => id === "todos" || p.categoria === id).length;
    const lista = [{ id: "todos", nome: "Todos" }, ...usadas];

    $("#chipsCategorias").innerHTML = lista
      .map((c) => `<button class="chip" role="tab" data-cat="${esc(c.id)}">${esc(c.nome)}<small>${count(c.id)}</small></button>`)
      .join("");
    const links = [];
    links.push(...usadas.slice(0, 4).map((c) => `<button data-cat="${esc(c.id)}">${esc(c.nome)}</button>`));
    $("#navLinks").innerHTML = links.join("");
    $("#footerCategorias").innerHTML = usadas.map((c) => `<li><button data-cat="${esc(c.id)}">${esc(c.nome)}</button></li>`).join("");
    syncCategoriaAtiva();
  }

  function renderCondicoes() {
    const conds = [...new Set(state.produtos.map((p) => p.condicao))];
    const box = $("#chipsCondicao");
    if (conds.length < 2) { box.hidden = true; return; }
    const label = { novo: "Novos", usado: "Usados", "usado testado": "Usados testados" };
    box.innerHTML = [["todas", "Todos"], ...conds.map((c) => [c, label[c] || c])]
      .map(([v, t]) => `<button class="chip" data-cond="${esc(v)}">${esc(t)}</button>`)
      .join("");
    syncCondicaoAtiva();
  }

  function syncCategoriaAtiva() {
    $$("[data-cat]").forEach((b) => b.classList.toggle("active", b.dataset.cat === state.filtros.categoria));
    $$("#chipsCategorias [data-cat]").forEach((b) => b.setAttribute("aria-selected", b.classList.contains("active")));
  }
  function syncCondicaoAtiva() {
    $$("[data-cond]").forEach((b) => b.classList.toggle("active", b.dataset.cond === state.filtros.condicao));
  }

  // ---- faixa de preço ----
  function setupPriceFilter() {
    const precos = state.produtos.map((p) => p.preco);
    if (!precos.length) return ($("#priceFilter").hidden = true);
    const min = Math.floor(Math.min(...precos));
    const max = Math.ceil(Math.max(...precos));
    state.precoLimites = [min, max];
    for (const el of [$("#priceMin"), $("#priceMax")]) {
      el.min = min; el.max = max; el.step = 1;
    }
    resetPrice();
  }
  function resetPrice() {
    const [min, max] = state.precoLimites;
    $("#priceMin").value = min;
    $("#priceMax").value = max;
    state.filtros.precoMin = null;
    state.filtros.precoMax = null;
    updatePriceUI();
  }
  function updatePriceUI() {
    const [min, max] = state.precoLimites;
    const a = Number($("#priceMin").value), b = Number($("#priceMax").value);
    const pct = (v) => ((v - min) / (max - min || 1)) * 100;
    $("#priceFill").style.left = pct(a) + "%";
    $("#priceFill").style.right = 100 - pct(b) + "%";
    $("#priceOut").textContent = `${brl(a).replace(",00", "")} – ${brl(b).replace(",00", "")}`;
  }
  function onPriceInput(e) {
    const minEl = $("#priceMin"), maxEl = $("#priceMax");
    let a = Number(minEl.value), b = Number(maxEl.value);
    if (a > b) {
      if (e.target === minEl) minEl.value = a = b; else maxEl.value = b = a;
    }
    const [min, max] = state.precoLimites;
    state.filtros.precoMin = a > min ? a : null;
    state.filtros.precoMax = b < max ? b : null;
    updatePriceUI();
    renderProdutosDebounced();
  }

  function combina(p, termos) {
    if (!termos.length) return true;
    const alvo = norm(`${p.nome} ${p.descricao} ${nomeCategoria(p.categoria)} ${p.item} ${Object.values(p.especificacoes || {}).join(" ")}`);
    return termos.every((t) => alvo.includes(t));
  }
  const termosBusca = (q) => norm(q).trim().split(/\s+/).filter(Boolean);

  function produtosFiltrados() {
    const f = state.filtros;
    const termos = termosBusca(f.busca);
    const lista = state.produtos.filter((p) => {
      if (f.categoria !== "todos" && p.categoria !== f.categoria) return false;
      if (f.condicao !== "todas" && p.condicao !== f.condicao) return false;
      if (f.soDisponiveis && p.quantidade <= 0) return false;
      if (f.precoMin != null && p.preco < f.precoMin) return false;
      if (f.precoMax != null && p.preco > f.precoMax) return false;
      return combina(p, termos);
    });
    const sorters = {
      item: (a, b) => (parseFloat(a.item) || 0) - (parseFloat(b.item) || 0),
      "preco-asc": (a, b) => a.preco - b.preco,
      "preco-desc": (a, b) => b.preco - a.preco,
      nome: (a, b) => a.nome.localeCompare(b.nome, "pt-BR"),
      estoque: (a, b) => b.quantidade - a.quantidade,
    };
    lista.sort(sorters[f.ordem] || sorters.item);
    lista.sort((a, b) => (a.quantidade > 0 ? 0 : 1) - (b.quantidade > 0 ? 0 : 1)); // esgotados por último
    return lista;
  }

  // =========================================================
  // PRODUTOS (cards)
  // =========================================================
  function stockLabel(p) {
    if (p.quantidade <= 0) return `<span class="stock stock--out">Esgotado</span>`;
    const cls = p.quantidade <= LOW_STOCK ? "stock stock--low" : "stock";
    const txt = p.quantidade === 1 ? "Última unidade" : `${p.quantidade} disponíveis`;
    return `<span class="${cls}">${txt}</span>`;
  }
  function badge(p) {
    const usado = p.condicao.startsWith("usado");
    const txt = usado ? (p.condicao.includes("testado") ? "Usado<br>testado" : "Usado") : "Novo";
    return `<span class="badge ${usado ? "badge--usado" : ""}">${txt}</span>`;
  }
  function avisoLink(nome, ref) {
    return waLink(lojaWa(), `Olá! Quero ser avisado quando *${nome}* (${ref}) estiver disponível de novo. 🔔`);
  }

  // bloco de quantidade + adicionar (ou "avise-me")
  function buyControls(p, ctx) {
    const livre = disponivel(p);
    const sel = Math.min(state.selecao[p.item] || 1, Math.max(1, livre));
    if (p.quantidade <= 0) {
      return `<a class="btn btn--notify" href="${esc(avisoLink(p.nome, "#" + p.item))}" target="_blank" rel="noopener">🔔 Avise-me quando chegar</a>`;
    }
    const limite = livre <= 0;
    // com só 1 unidade livre, o seletor de quantidade não faz sentido
    if (livre === 1) {
      return `<button class="btn btn--orange ${ctx === "card" ? "card__add" : ""}" data-act="add" data-item="${esc(p.item)}">Adicionar</button>`;
    }
    return `
      <div class="qty" aria-label="Quantidade">
        <button data-act="dec" data-item="${esc(p.item)}" ${sel <= 1 || limite ? "disabled" : ""} aria-label="Diminuir">−</button>
        <span>${limite ? 0 : sel}</span>
        <button data-act="inc" data-item="${esc(p.item)}" ${limite ? "disabled" : ""} ${sel >= livre ? 'aria-disabled="true"' : ""} aria-label="Aumentar">+</button>
      </div>
      <button class="btn btn--orange ${ctx === "card" ? "card__add" : ""}" data-act="add" data-item="${esc(p.item)}" ${limite ? "disabled" : ""}>
        ${limite ? "Tudo no carrinho" : "Adicionar"}
      </button>`;
  }

  function cardHTML(p, idx) {
    return `
      <article class="card ${p.quantidade <= 0 ? "card--out" : ""}" data-item="${esc(p.item)}" style="animation-delay:${Math.min(idx, 12) * 30}ms">
        <a class="card__media" href="#item-${esc(p.item)}" aria-label="Ver detalhes de ${esc(p.nome)}">
          <span class="card__num">#${esc(p.item)}</span>
          ${badge(p)}
          ${produtoImg(p)}
          <span class="card__more">Ver detalhes</span>
        </a>
        <div class="card__body">
          <span class="card__cat">${esc(nomeCategoria(p.categoria))}</span>
          <h3 class="card__title"><a href="#item-${esc(p.item)}">${esc(p.nome)}</a></h3>
          <p class="card__desc">${esc(p.descricao)}</p>
          <div class="card__meta">
            <span class="card__price">${brl(p.preco)}</span>
            ${stockLabel(p)}
          </div>
          <div class="card__actions">${buyControls(p, "card")}</div>
        </div>
      </article>`;
  }

  function renderProdutos() {
    const lista = produtosFiltrados();
    $("#productGrid").innerHTML = lista.map(cardHTML).join("");
    $("#emptyState").hidden = lista.length > 0;
    const n = lista.length;
    $("#resultCount").textContent = `${n} ${n === 1 ? "item encontrado" : "itens encontrados"}`;
  }
  let renderTimer;
  function renderProdutosDebounced() {
    clearTimeout(renderTimer);
    renderTimer = setTimeout(renderProdutos, 120);
  }

  // atualiza só o que mudou após mexer no carrinho
  function refreshItem(item) {
    const el = $(`.card[data-item="${CSS.escape(String(item))}"]`);
    const p = getProduto(item);
    if (el && p) {
      const tmp = document.createElement("div");
      tmp.innerHTML = cardHTML(p, 0);
      tmp.firstElementChild.style.animation = "none";
      el.replaceWith(tmp.firstElementChild);
    }
    if (state.modalItem && String(state.modalItem) === String(item)) {
      const buy = $("#pmBuy");
      if (buy) buy.innerHTML = buyControls(p, "modal");
    }
  }
  function refreshAll() {
    renderProdutos();
    renderKits();
    if (state.modalItem) $("#pmBuy") && ($("#pmBuy").innerHTML = buyControls(getProduto(state.modalItem), "modal"));
  }

  // =========================================================
  // KITS
  // =========================================================
  function kitHTML(k) {
    const cheio = kitPrecoCheio(k), preco = kitPreco(k), max = kitMax(k);
    const thumbs = k.itens.slice(0, 4).map((c) => {
      const p = getProduto(c.item);
      return `<a href="#item-${esc(p.item)}" title="${esc(p.nome)}">${produtoImg(p)}${c.qtd > 1 ? `<span>${c.qtd}x</span>` : ""}</a>`;
    }).join("");
    const lista = k.itens.map((c) => {
      const p = getProduto(c.item);
      const falta = p.quantidade < c.qtd;
      return `<li><a href="#item-${esc(p.item)}">${c.qtd}x ${esc(p.nome)}</a>${falta ? `<span class="out">esgotado</span>` : `<span>${brl(p.preco * c.qtd)}</span>`}</li>`;
    }).join("");
    const noCarrinho = state.carrinho[kitKey(k.id)] || 0;
    const semEstoque = kitMax(k, kitKey(k.id)) <= 0;
    let acao;
    if (semEstoque) {
      acao = `<a class="btn btn--notify" href="${esc(avisoLink(k.nome, "kit"))}" target="_blank" rel="noopener">🔔 Avise-me quando voltar</a>`;
    } else {
      acao = `<button class="btn btn--orange" data-kit-add="${esc(k.id)}" ${max <= 0 ? "disabled" : ""}>${max <= 0 ? "Tudo no carrinho" : noCarrinho ? "Adicionar outro kit" : "Adicionar kit"}</button>`;
    }
    return `
      <article class="kit" id="kit-${esc(k.id)}">
        ${k.desconto ? `<span class="kit__off">-${k.desconto}%</span>` : ""}
        <div class="kit__thumbs">${thumbs}</div>
        <h3>${esc(k.nome)}</h3>
        ${k.descricao ? `<p>${esc(k.descricao)}</p>` : ""}
        <ul class="kit__list">${lista}</ul>
        <div class="kit__prices">
          ${k.desconto ? `<s>${brl(cheio)}</s>` : ""}
          <strong>${brl(preco)}</strong>
          ${k.desconto ? `<em>economize ${brl(cheio - preco)}</em>` : ""}
        </div>
        <div class="kit__actions">
          ${acao}
          <button class="btn btn--ghost btn--sm" data-kit-share="${esc(k.id)}" aria-label="Compartilhar kit no WhatsApp" title="Compartilhar">
            <svg viewBox="0 0 24 24"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4"/></svg>
          </button>
        </div>
      </article>`;
  }
  function renderKits() {
    if (!$("#kits")) return; // seção removida
    $("#kits").hidden = !state.kits.length;
    $("#kitGrid").innerHTML = state.kits.map(kitHTML).join("");
  }

  // =========================================================
  // COMO FUNCIONA + FAQ
  // =========================================================
  const STEP_ICONS = [
    `<svg viewBox="0 0 24 24"><path d="M3 4h2l2.4 10.2a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 2-1.5L21 8H6.2"/><circle cx="10" cy="20" r="1.5"/><circle cx="17" cy="20" r="1.5"/></svg>`,
    `<svg viewBox="0 0 24 24"><path d="M21 11.5a8.4 8.4 0 0 1-12.4 7.4L3 21l2-5.4A8.5 8.5 0 1 1 21 11.5z"/></svg>`,
    `<svg viewBox="0 0 24 24"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20M6 15h4"/></svg>`,
    `<svg viewBox="0 0 24 24"><circle cx="5.5" cy="17.5" r="3"/><circle cx="18.5" cy="17.5" r="3"/><path d="M8.5 17.5h6l-3-8H8m7.5 0H18l2.5 8M14 6h3l1 3.5"/></svg>`,
  ];
  function renderComoFunciona(passos) {
    if (!passos.length || !$("#como-funciona")) return; // seção removida
    $("#como-funciona").hidden = false;
    $("#steps").innerHTML = passos.map((s, i) => `
      <li class="step">
        <div class="step__icon">${STEP_ICONS[i % STEP_ICONS.length]}</div>
        <h3>${esc(s.titulo)}</h3>
        <p>${esc(s.texto)}</p>
      </li>`).join("");
    if (state.loja.entrega) {
      $("#deliveryNote").hidden = false;
      $("#deliveryNote p").textContent = state.loja.entrega;
    }
  }
  function renderFaq(faq) {
    if (!$("#faq")) return; // seção removida
    if (!faq.length) return;
    $("#faq").hidden = false;
    $("#faqList").innerHTML = faq.map((q) => `
      <details><summary>${esc(q.pergunta)}</summary><p>${esc(q.resposta)}</p></details>`).join("");
  }

  // =========================================================
  // MODAL DE PRODUTO (link próprio: #item-29)
  // =========================================================
  function productModalHTML(p) {
    const fotos = totalFotos(p);
    const usado = p.condicao.startsWith("usado");
    const specs = Object.entries(p.especificacoes || {});
    const kitsCom = state.kits.filter((k) => k.itens.some((c) => String(c.item) === String(p.item)));
    return `
      <button class="icon-btn pm__close" data-close aria-label="Fechar">✕</button>
      <div class="gallery">
        <div class="gallery__main">
          <div class="slider" id="pmSlider" tabindex="0" aria-roledescription="carrossel" aria-label="Fotos de ${esc(p.nome)}">
            ${Array.from({ length: fotos }, (_, i) =>
              `<div class="slide" aria-label="Foto ${i + 1} de ${fotos}">${produtoImg(p, "", i, i === 0)}</div>`).join("")}
          </div>
          ${fotos > 1 ? `
          <button class="gallery__nav prev" data-foto="-1" aria-label="Foto anterior">‹</button>
          <button class="gallery__nav next" data-foto="+1" aria-label="Próxima foto">›</button>
          <span class="gallery__count" id="pmCount">1 / ${fotos}</span>
          <div class="gallery__dots">${Array.from({ length: fotos }, (_, i) =>
            `<button data-foto-idx="${i}" class="${i === 0 ? "active" : ""}" aria-label="Ir para foto ${i + 1}"></button>`).join("")}</div>` : ""}
        </div>
        ${fotos > 1 ? `<div class="gallery__thumbs">${Array.from({ length: fotos }, (_, i) =>
          `<button data-foto-idx="${i}" class="${i === 0 ? "active" : ""}" aria-label="Foto ${i + 1}">${produtoImg(p, "", i)}</button>`).join("")}</div>
        <p class="gallery__hint">Arraste para o lado para ver mais fotos</p>` : ""}
      </div>
      <div class="pm__info">
        <div class="pm__tags">
          <span class="tag ${usado ? "tag--usado" : "tag--novo"}">${esc(p.condicao)}</span>
          <span class="tag">${esc(nomeCategoria(p.categoria))}</span>
          <span class="tag">#${esc(p.item)}</span>
        </div>
        <h2 id="pmTitle">${esc(p.nome)}</h2>
        <div class="pm__price">${brl(p.preco)}</div>
        ${stockLabel(p)}
        <p class="pm__desc">${esc(p.descricaoLonga || p.descricao)}</p>
        ${specs.length ? `<table class="specs"><tbody>${specs.map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join("")}</tbody></table>` : ""}
        <div class="pm__buy" id="pmBuy">${buyControls(p, "modal")}</div>
        <div class="pm__share">
          <a class="btn btn--wa" href="${esc(waShare(textoCompartilhar(p)))}" target="_blank" rel="noopener">
            <svg viewBox="0 0 24 24"><path d="M21 11.5a8.4 8.4 0 0 1-12.4 7.4L3 21l2-5.4A8.5 8.5 0 1 1 21 11.5z"/></svg>
            Compartilhar
          </a>
          <button class="btn btn--ghost" data-copy="${esc(linkProduto(p))}">
            <svg viewBox="0 0 24 24"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"/></svg>
            Copiar link
          </button>
        </div>
        ${kitsCom.length ? `<p class="pm__kits">Também faz parte de: ${kitsCom.map((k) => `<a href="#kit-${esc(k.id)}">${esc(k.nome)}</a>`).join(", ")}</p>` : ""}
      </div>`;
  }
  const linkProduto = (p) => `${siteUrl()}#item-${p.item}`;
  const textoCompartilhar = (p) =>
    `Olha esse componente na ${nomeLoja()}:\n*${p.nome}* — ${brl(p.preco)}${p.quantidade <= 0 ? " (esgotado no momento)" : ""}\n${linkProduto(p)}`;

  function openProduct(item) {
    const p = getProduto(item);
    if (!p) return;
    state.modalItem = p.item;
    state.modalFoto = 0;
    $("#productModalBody").innerHTML = productModalHTML(p);
    const dlg = $("#productModal");
    if (!dlg.open) dlg.showModal();
    $("#productModalBody").scrollTop = 0;
    setupSlider();
    document.title = `${p.nome} — ${nomeLoja()}`;
  }
  // ---- slider de fotos (arrastar no celular e com o mouse) ----
  function setFoto(i, suave = true) {
    const p = getProduto(state.modalItem);
    const sl = $("#pmSlider");
    if (!p || !sl) return;
    const n = totalFotos(p);
    const idx = (i + n) % n;
    sl.scrollTo({ left: idx * sl.clientWidth, behavior: suave ? "smooth" : "auto" });
    marcarFoto(idx);
  }
  function marcarFoto(idx) {
    state.modalFoto = idx;
    $$(".gallery__thumbs button, .gallery__dots button").forEach((b) => b.classList.toggle("active", Number(b.dataset.fotoIdx) === idx));
    const c = $("#pmCount");
    if (c) c.textContent = `${idx + 1} / ${totalFotos(getProduto(state.modalItem))}`;
    $(".gallery__thumbs button.active")?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }
  function setupSlider() {
    const sl = $("#pmSlider");
    if (!sl || sl.children.length < 2) return;
    let raf;
    sl.addEventListener("scroll", () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const idx = Math.round(sl.scrollLeft / sl.clientWidth);
        if (idx !== state.modalFoto) marcarFoto(idx);
      });
    }, { passive: true });

    // arrastar com o mouse (no toque o navegador já faz sozinho)
    let x0 = 0, left0 = 0, arrastando = false, moveu = false;
    sl.addEventListener("pointerdown", (e) => {
      if (e.pointerType !== "mouse" || e.button !== 0) return;
      arrastando = true; moveu = false;
      x0 = e.clientX; left0 = sl.scrollLeft;
      sl.classList.add("dragging");
      sl.setPointerCapture(e.pointerId);
    });
    sl.addEventListener("pointermove", (e) => {
      if (!arrastando) return;
      const dx = e.clientX - x0;
      if (Math.abs(dx) > 3) moveu = true;
      sl.scrollLeft = left0 - dx;
    });
    const soltar = (e) => {
      if (!arrastando) return;
      arrastando = false;
      sl.classList.remove("dragging");
      const dx = e.clientX - x0;
      const base = Math.round(left0 / sl.clientWidth);
      // um arraste curto já passa para a próxima/anterior
      const alvo = Math.abs(dx) > sl.clientWidth * 0.15 ? base + (dx < 0 ? 1 : -1) : base;
      const n = sl.children.length;
      setFoto(Math.max(0, Math.min(n - 1, alvo)));
    };
    sl.addEventListener("pointerup", soltar);
    sl.addEventListener("pointercancel", soltar);
    sl.addEventListener("click", (e) => { if (moveu) { e.preventDefault(); e.stopPropagation(); } }, true);
    sl.addEventListener("dragstart", (e) => e.preventDefault());
    sl.addEventListener("keydown", (e) => {
      if (e.key === "ArrowRight") { e.preventDefault(); setFoto(state.modalFoto + 1); }
      if (e.key === "ArrowLeft") { e.preventDefault(); setFoto(state.modalFoto - 1); }
    });
  }
  function onProductClosed() {
    state.modalItem = null;
    document.title = `${nomeLoja()} — Componentes para TCC`;
    if (/^#item-/.test(location.hash)) {
      if (state.abertoPorNavegacao) history.back();
      else history.replaceState(null, "", location.pathname + location.search);
    }
    state.abertoPorNavegacao = false;
  }

  // roteamento por hash: #item-29 abre o produto, #kit-id destaca o kit
  function routeFromHash(inicial = false) {
    const h = decodeURIComponent(location.hash.slice(1));
    const m = h.match(/^item-(.+)$/);
    if (m) {
      if (!inicial) state.abertoPorNavegacao = true;
      if (getProduto(m[1])) openProduct(m[1]);
      else history.replaceState(null, "", location.pathname + location.search);
      return;
    }
    if ($("#productModal").open) {
      state.abertoPorNavegacao = false;
      $("#productModal").close();
    }
    const k = h.match(/^kit-(.+)$/);
    if (k) {
      const el = document.getElementById(h);
      if (el) {
        el.scrollIntoView({ behavior: inicial ? "auto" : "smooth", block: "center" });
        el.classList.remove("flash"); void el.offsetWidth; el.classList.add("flash");
      }
    } else if (inicial && h) {
      document.getElementById(h)?.scrollIntoView();
    }
  }

  // =========================================================
  // CUPOM
  // =========================================================
  function hojeISO() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
  function findCupom(code) {
    return state.cupons.find((c) => norm(c.codigo) === norm(code).trim());
  }
  // retorna { cupom, desconto, erro }
  function avaliarCupom(code, subtotal) {
    if (!code) return { desconto: 0 };
    const c = findCupom(code);
    if (!c || c.ativo === false) return { erro: "Cupom inválido.", desconto: 0 };
    if (c.validade && hojeISO() > c.validade) return { cupom: c, erro: "Este cupom expirou.", desconto: 0 };
    if (c.minimo && subtotal < c.minimo) return { cupom: c, erro: `Válido para compras a partir de ${brl(c.minimo)}.`, pendente: true, desconto: 0 };
    const v = Number(c.valor) || 0;
    const desconto = round2(c.tipo === "percentual" ? subtotal * v / 100 : Math.min(v, subtotal));
    return { cupom: c, desconto };
  }

  // =========================================================
  // CARRINHO
  // =========================================================
  function cartEntries() {
    return Object.entries(state.carrinho).map(([key, qtd]) => {
      if (isKitKey(key)) {
        const k = getKit(key.slice(4));
        if (!k) return null;
        return { key, tipo: "kit", kit: k, qtd, nome: k.nome, unit: kitPreco(k), sub: round2(kitPreco(k) * qtd) };
      }
      const p = getProduto(key);
      if (!p) return null;
      return { key, tipo: "produto", p, qtd, nome: p.nome, unit: p.preco, sub: round2(p.preco * qtd) };
    }).filter((e) => e && e.qtd > 0);
  }
  function resumo() {
    const itens = cartEntries();
    const subtotal = round2(itens.reduce((s, e) => s + e.sub, 0));
    const cup = avaliarCupom(state.cupom, subtotal);
    const total = round2(subtotal - cup.desconto);
    const qtd = itens.reduce((s, e) => s + e.qtd, 0);
    return { itens, subtotal, cup, total, qtd };
  }

  function addToCart(item, qtd) {
    const p = getProduto(item);
    if (!p) return;
    const add = Math.min(qtd, disponivel(p));
    if (add <= 0) return toast("A quantidade máxima em estoque já está no carrinho.", true);
    state.carrinho[p.item] = (state.carrinho[p.item] || 0) + add;
    state.selecao[p.item] = 1;
    afterCartChange();
    toast(`${add}x ${p.nome} adicionado ao carrinho`);
  }
  function addKit(id) {
    const k = getKit(id);
    if (!k) return;
    if (kitMax(k) <= 0) return toast("Não há estoque suficiente para mais um kit.", true);
    state.carrinho[kitKey(id)] = (state.carrinho[kitKey(id)] || 0) + 1;
    afterCartChange();
    toast(`${k.nome} adicionado ao carrinho`);
  }
  function setCartQty(key, qtd) {
    if (qtd <= 0) delete state.carrinho[key];
    else {
      const max = isKitKey(key)
        ? kitMax(getKit(key.slice(4)), key)
        : getProduto(key).quantidade - reservado(key, key);
      state.carrinho[key] = Math.min(qtd, max);
    }
    afterCartChange();
  }
  function afterCartChange() {
    save(CART_KEY, state.carrinho);
    renderCart();
    refreshAll();
    const c = $("#cartCount");
    c.classList.remove("bump"); void c.offsetWidth; c.classList.add("bump");
  }

  function totalsHTML(r) {
    return `
      <div><span>Subtotal</span><span>${brl(r.subtotal)}</span></div>
      ${r.cup.desconto ? `<div class="disc"><span>Cupom ${esc(r.cup.cupom.codigo)}</span><span>− ${brl(r.cup.desconto)}</span></div>` : ""}
      <div><span>Frete</span><span>por aplicativo</span></div>
      <div class="grand"><span>Total</span><strong>${brl(r.total)}</strong></div>`;
  }

  function renderCart() {
    const r = resumo();
    $("#cartCount").textContent = r.qtd;
    $("#cartFoot").hidden = !r.itens.length;

    if (!r.itens.length) {
      $("#cartItems").innerHTML = `<div class="cart-empty">
        <svg viewBox="0 0 24 24"><path d="M3 4h2l2.4 10.2a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 2-1.5L21 8H6.2"/><circle cx="10" cy="20" r="1.5"/><circle cx="17" cy="20" r="1.5"/></svg>
        <p>Seu carrinho está vazio.<br/>Que tal começar por um kit?</p></div>`;
      return;
    }
    $("#cartItems").innerHTML = r.itens.map((e) => {
      const kit = e.tipo === "kit";
      const max = kit ? e.qtd + kitMax(e.kit) : e.qtd + disponivel(e.p);
      const img = kit ? `<div class="cart-item__kit">KIT</div>` : produtoImg(e.p, "cart-item__img");
      const sub = kit
        ? `<small>${e.kit.itens.map((c) => `${c.qtd}x ${esc(getProduto(c.item).nome)}`).join(" · ")}</small><small>${brl(e.unit)} por kit${e.kit.desconto ? ` (−${e.kit.desconto}%)` : ""}</small>`
        : `<small>${brl(e.unit)} un. · #${esc(e.p.item)}</small>`;
      return `
        <div class="cart-item" data-key="${esc(e.key)}">
          ${kit ? img : `<a href="#item-${esc(e.p.item)}">${img}</a>`}
          <div><h4>${esc(e.nome)}</h4>${sub}</div>
          <div class="cart-item__right">
            <strong>${brl(e.sub)}</strong>
            <div class="qty">
              <button data-cart="dec" aria-label="Diminuir">−</button>
              <span>${e.qtd}</span>
              <button data-cart="inc" ${e.qtd >= max ? "disabled" : ""} aria-label="Aumentar">+</button>
            </div>
            <button class="remove" data-cart="rm">Remover</button>
          </div>
        </div>`;
    }).join("");

    // cupom
    const box = $("#couponApplied");
    if (state.cupom) {
      box.hidden = false;
      box.innerHTML = r.cup.desconto
        ? `<span>✅ <strong>${esc(r.cup.cupom.codigo)}</strong> ${esc(r.cup.cupom.descricao || "")}</span><button class="link-btn" id="couponRemove">remover</button>`
        : `<span>⚠️ <strong>${esc(state.cupom)}</strong>: ${esc(r.cup.erro || "")}</span><button class="link-btn" id="couponRemove">remover</button>`;
      box.style.borderColor = r.cup.desconto ? "" : "rgba(255,122,26,.5)";
      box.style.background = r.cup.desconto ? "" : "rgba(255,122,26,.1)";
      $("#couponForm").hidden = true;
    } else {
      box.hidden = true;
      $("#couponForm").hidden = false;
    }
    $("#cartTotals").innerHTML = totalsHTML(r);
  }

  function aplicarCupom(e) {
    e.preventDefault();
    const code = $("#couponInput").value.trim();
    if (!code) return;
    const r = resumo();
    const res = avaliarCupom(code, r.subtotal);
    if (!res.cupom) return toast("Cupom inválido.", true);
    if (res.erro && !res.pendente) return toast(res.erro, true); // expirado/inativo não fica salvo
    state.cupom = res.cupom.codigo;
    save(COUPON_KEY, state.cupom);
    $("#couponInput").value = "";
    renderCart();
    toast(res.desconto ? `Cupom aplicado: − ${brl(res.desconto)}` : res.erro, !res.desconto);
  }

  function openCart() {
    $("#cartDrawer").classList.add("open");
    $("#cartDrawer").setAttribute("aria-hidden", "false");
    $("#overlay").hidden = false;
    document.body.style.overflow = "hidden";
  }
  function closeCart() {
    $("#cartDrawer").classList.remove("open");
    $("#cartDrawer").setAttribute("aria-hidden", "true");
    $("#overlay").hidden = true;
    document.body.style.overflow = "";
  }

  // =========================================================
  // MENSAGENS DO WHATSAPP
  // =========================================================
  function listaItensTexto(r) {
    return r.itens.map((e) => {
      if (e.tipo === "kit") {
        const comp = e.kit.itens.map((c) => `   ↳ ${c.qtd * e.qtd}x ${getProduto(c.item).nome} (#${c.item})`).join("\n");
        return `• ${e.qtd}x 🧰 ${e.nome}${e.kit.desconto ? ` (−${e.kit.desconto}%)` : ""}\n   ${brl(e.unit)} por kit = *${brl(e.sub)}*\n${comp}`;
      }
      return `• ${e.qtd}x ${e.nome} (#${e.p.item})\n   ${brl(e.unit)} un. = *${brl(e.sub)}*`;
    }).join("\n");
  }
  function totaisTexto(r) {
    const l = [`Subtotal: ${brl(r.subtotal)}`];
    if (r.cup.desconto) l.push(`🏷️ Cupom ${r.cup.cupom.codigo}: − ${brl(r.cup.desconto)}`);
    l.push(`💰 *TOTAL: ${brl(r.total)}*`);
    l.push(`🚚 Frete: entrega por aplicativo (calculado pela distância, pago pelo cliente)`);
    return l.join("\n");
  }
  function mensagemPedido(d, r) {
    const linhas = [
      `🛒 *NOVO PEDIDO — ${nomeLoja()}*`,
      `Pedido: *${codigo("COM")}*`,
      `Data: ${dataHora()}`,
      ``, `*ITENS*`, listaItensTexto(r),
      ``, totaisTexto(r),
      ``, `*DADOS DO CLIENTE*`,
      `👤 Nome: ${d.nome}`,
      `📱 Telefone: ${d.telefone}`,
      `💳 Pagamento: ${d.pagamento}`,
      `📍 Endereço de entrega: ${d.endereco}`,
    ];
    if (d.obs) linhas.push(`📝 Obs.: ${d.obs}`);
    return linhas.join("\n");
  }
  function mensagemOrcamento(r, nome) {
    const dias = state.loja.orcamentoValidadeDias;
    return [
      `📋 *ORÇAMENTO — ${nomeLoja()}*`,
      nome ? `Para: ${nome}` : null,
      `Data: ${dataHora()}`,
      ``, listaItensTexto(r),
      ``, totaisTexto(r),
      ``,
      dias ? `_Orçamento válido por ${dias} dias, sujeito ao estoque._` : `_Valores e estoque sujeitos a alteração._`,
      `Para fechar o pedido: ${siteUrl()}`,
    ].filter((l) => l !== null).join("\n");
  }

  // =========================================================
  // ORÇAMENTO EM PDF (impressão) E IMAGEM (canvas)
  // =========================================================
  function docHTML(r, nome, cod) {
    const dias = state.loja.orcamentoValidadeDias;
    const linhas = r.itens.map((e) => {
      const desc = e.tipo === "kit"
        ? `<strong>${esc(e.nome)}</strong>${e.kit.desconto ? ` (−${e.kit.desconto}%)` : ""}<br><small>${e.kit.itens.map((c) => `${c.qtd}x ${esc(getProduto(c.item).nome)}`).join(" · ")}</small>`
        : `${esc(e.nome)} <small>#${esc(e.p.item)}</small>`;
      return `<tr><td>${desc}</td><td class="n">${e.qtd}</td><td class="n">${brl(e.unit)}</td><td class="n">${brl(e.sub)}</td></tr>`;
    }).join("");
    const tel = maskPhone(onlyDigits(state.loja.whatsapp).replace(/^55/, ""));
    return `
      <div class="doc">
        <div class="doc__head">
          <div>
            <div class="doc__brand">Comunidade<span>.com</span></div>
            <small>${esc(state.loja.slogan || "")}${state.loja.cidade ? " · " + esc(state.loja.cidade) : ""}</small>
            <small>WhatsApp: ${esc(tel)} · ${esc(siteUrl())}</small>
          </div>
          <div class="doc__meta">
            <strong>ORÇAMENTO</strong>
            Nº ${esc(cod)}<br>${esc(dataHora())}
            ${nome ? `<br>Para: <b>${esc(nome)}</b>` : ""}
          </div>
        </div>
        <table>
          <thead><tr><th>Descrição</th><th class="n">Qtd</th><th class="n">Unitário</th><th class="n">Subtotal</th></tr></thead>
          <tbody>${linhas}</tbody>
        </table>
        <div class="doc__totals">
          <div><span>Subtotal</span><span>${brl(r.subtotal)}</span></div>
          ${r.cup.desconto ? `<div><span>Cupom ${esc(r.cup.cupom.codigo)}</span><span>− ${brl(r.cup.desconto)}</span></div>` : ""}
          <div class="grand"><span>Total</span><span>${brl(r.total)}</span></div>
        </div>
        <div class="doc__note">🚚 ${esc(state.loja.entrega || "Entrega por aplicativo. Frete calculado pela distância e pago pelo cliente.")}</div>
        <div class="doc__foot">${dias ? `Orçamento válido por ${dias} dias a partir da data de emissão, sujeito à disponibilidade de estoque.` : "Valores sujeitos à disponibilidade de estoque."}</div>
      </div>`;
  }

  function baixarPdf() {
    const r = resumo();
    if (!r.itens.length) return;
    const nome = $("#quoteForm").nome.value.trim();
    const cod = codigo("ORC");
    $("#printArea").innerHTML = docHTML(r, nome, cod);
    const tituloAntigo = document.title;
    document.title = `Orcamento-${cod}`; // vira o nome sugerido do arquivo
    $("#quoteModal").close();
    document.body.classList.add("printing");
    const fim = () => {
      document.body.classList.remove("printing");
      document.title = tituloAntigo;
      window.removeEventListener("afterprint", fim);
    };
    window.addEventListener("afterprint", fim);
    setTimeout(() => { window.print(); setTimeout(fim, 500); }, 60);
  }

  async function baixarImagem() {
    const r = resumo();
    if (!r.itens.length) return;
    const nome = $("#quoteForm").nome.value.trim();
    const cod = codigo("ORC");
    try {
      await Promise.all([
        document.fonts.load('700 48px "Chakra Petch"'),
        document.fonts.load('400 24px "Inter"'),
        document.fonts.load('600 24px "Inter"'),
      ]);
    } catch { /* usa fonte padrão */ }

    const W = 1080, P = 60, S = 2; // S = escala para ficar nítido
    const F = { d: '"Chakra Petch", sans-serif', t: '"Inter", sans-serif' };
    const ctx0 = document.createElement("canvas").getContext("2d");
    const quebra = (texto, font, largura) => {
      ctx0.font = font;
      const palavras = texto.split(" "); const linhas = []; let l = "";
      for (const w of palavras) {
        const t = l ? l + " " + w : w;
        if (ctx0.measureText(t).width > largura && l) { linhas.push(l); l = w; } else l = t;
      }
      if (l) linhas.push(l);
      return linhas;
    };
    // monta as linhas da tabela
    const colNome = W - P * 2 - 260;
    const rows = r.itens.map((e) => {
      const titulo = quebra(`${e.qtd}x ${e.tipo === "kit" ? "🧰 " : ""}${e.nome}`, `600 26px ${F.t}`, colNome);
      const detalhe = e.tipo === "kit"
        ? quebra(e.kit.itens.map((c) => `${c.qtd * e.qtd}x ${getProduto(c.item).nome}`).join(" · "), `400 20px ${F.t}`, colNome)
        : [`${brl(e.unit)} un. · #${e.p.item}`];
      if (e.tipo === "kit") detalhe.push(`${brl(e.unit)} por kit${e.kit.desconto ? ` (−${e.kit.desconto}%)` : ""}`);
      return { e, titulo, detalhe, h: titulo.length * 34 + detalhe.length * 27 + 26 };
    });
    const nota = quebra("🚚 " + (state.loja.entrega || "Entrega por aplicativo. Frete calculado pela distância e pago pelo cliente."), `400 21px ${F.t}`, W - P * 2 - 40);
    const headH = 220;
    const H = headH + 40 + (nome ? 44 : 0) + 50 + rows.reduce((s, x) => s + x.h, 0) + 40 + (r.cup.desconto ? 150 : 110) + 30 + nota.length * 30 + 40 + 110;

    const cv = document.createElement("canvas");
    cv.width = W * S; cv.height = H * S;
    const c = cv.getContext("2d");
    c.scale(S, S);
    c.fillStyle = "#ffffff"; c.fillRect(0, 0, W, H);

    // cabeçalho
    const g = c.createLinearGradient(0, 0, W, headH);
    g.addColorStop(0, "#202020"); g.addColorStop(1, "#0f0f0f");
    c.fillStyle = g; c.fillRect(0, 0, W, headH);
    c.strokeStyle = "rgba(93,214,44,.18)"; c.lineWidth = 3;
    c.beginPath(); c.moveTo(W - 330, 40); c.lineTo(W - 250, 40); c.lineTo(W - 220, 70); c.lineTo(W - 120, 70); c.stroke();
    c.beginPath(); c.moveTo(W - 300, 180); c.lineTo(W - 200, 180); c.lineTo(W - 170, 150); c.lineTo(W - 60, 150); c.stroke();
    c.fillStyle = "#5dd62c"; c.fillRect(0, headH - 8, W, 8);
    c.textBaseline = "alphabetic";
    c.font = `700 58px ${F.d}`; c.fillStyle = "#ffffff";
    c.fillText("Comunidade", P, 100);
    const wBrand = c.measureText("Comunidade").width;
    c.fillStyle = "#5dd62c"; c.fillText(".com", P + wBrand, 100);
    c.font = `400 22px ${F.t}`; c.fillStyle = "#a6a6a6";
    c.fillText((state.loja.slogan || "") + (state.loja.cidade ? " · " + state.loja.cidade : ""), P, 138);
    c.textAlign = "right";
    c.font = `700 34px ${F.d}`; c.fillStyle = "#5dd62c"; c.fillText("ORÇAMENTO", W - P, 92);
    c.font = `400 21px ${F.t}`; c.fillStyle = "#f8f8f8";
    c.fillText(`Nº ${cod}`, W - P, 128); c.fillText(dataHora(), W - P, 158);
    c.textAlign = "left";

    let y = headH + 40;
    if (nome) {
      c.font = `400 24px ${F.t}`; c.fillStyle = "#555555"; c.fillText("Para:", P, y + 10);
      c.font = `600 24px ${F.t}`; c.fillStyle = "#0f0f0f"; c.fillText(nome, P + 70, y + 10);
      y += 44;
    }
    // cabeçalho da tabela
    c.fillStyle = "#0f0f0f"; c.fillRect(P, y, W - P * 2, 44);
    c.font = `600 19px ${F.t}`; c.fillStyle = "#ffffff";
    c.fillText("ITEM", P + 16, y + 29);
    c.textAlign = "right"; c.fillText("SUBTOTAL", W - P - 16, y + 29); c.textAlign = "left";
    y += 50;

    rows.forEach((row, i) => {
      if (i % 2) { c.fillStyle = "#f4f4f4"; c.fillRect(P, y - 4, W - P * 2, row.h); }
      let yy = y + 26;
      c.font = `600 26px ${F.t}`; c.fillStyle = "#0f0f0f";
      row.titulo.forEach((l) => { c.fillText(l, P + 16, yy); yy += 34; });
      c.font = `400 20px ${F.t}`; c.fillStyle = "#555555";
      row.detalhe.forEach((l) => { c.fillText(l, P + 16, yy - 6); yy += 27; });
      c.textAlign = "right"; c.font = `700 28px ${F.d}`; c.fillStyle = "#0f0f0f";
      c.fillText(brl(row.e.sub), W - P - 16, y + 28); c.textAlign = "left";
      y += row.h;
      c.strokeStyle = "#e3e3e3"; c.lineWidth = 1;
      c.beginPath(); c.moveTo(P, y - 4); c.lineTo(W - P, y - 4); c.stroke();
    });

    // totais
    y += 36;
    const linhaTotal = (rotulo, valor, cor = "#555555", font = `400 24px ${F.t}`) => {
      c.font = font; c.fillStyle = cor;
      c.fillText(rotulo, W - P - 420, y); c.textAlign = "right"; c.fillText(valor, W - P, y); c.textAlign = "left";
      y += 40;
    };
    linhaTotal("Subtotal", brl(r.subtotal));
    if (r.cup.desconto) linhaTotal(`Cupom ${r.cup.cupom.codigo}`, "− " + brl(r.cup.desconto), "#337418");
    c.fillStyle = "#0f0f0f"; c.fillRect(W - P - 420, y - 26, 420, 3);
    y += 16;
    linhaTotal("TOTAL", brl(r.total), "#0f0f0f", `700 36px ${F.d}`);

    // nota do frete
    y += 4;
    const notaH = nota.length * 30 + 26;
    c.fillStyle = "#eff9ea"; c.fillRect(P, y, W - P * 2, notaH);
    c.fillStyle = "#337418"; c.fillRect(P, y, 6, notaH);
    c.font = `400 21px ${F.t}`; c.fillStyle = "#0f0f0f";
    nota.forEach((l, i) => c.fillText(l, P + 24, y + 34 + i * 30));
    y += notaH + 40;

    // rodapé
    const dias = state.loja.orcamentoValidadeDias;
    c.font = `400 19px ${F.t}`; c.fillStyle = "#555555";
    c.fillText(dias ? `Válido por ${dias} dias, sujeito ao estoque.` : "Sujeito à disponibilidade de estoque.", P, y);
    const tel = maskPhone(onlyDigits(state.loja.whatsapp).replace(/^55/, ""));
    c.fillText(`WhatsApp ${tel} · ${siteUrl().replace(/^https?:\/\//, "")}`, P, y + 30);

    cv.toBlob((blob) => {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `orcamento-${cod}.png`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      toast("Imagem do orçamento baixada!");
    }, "image/png");
  }

  // =========================================================
  // FORMULÁRIOS
  // =========================================================
  function setError(field, msg) {
    const wrap = field.closest(".field");
    wrap.classList.toggle("invalid", !!msg);
    let e = wrap.querySelector(".err");
    if (msg) {
      if (!e) { e = document.createElement("span"); e.className = "err"; wrap.appendChild(e); }
      e.textContent = msg;
    } else e?.remove();
  }
  function validar(fields) {
    let ok = true;
    fields.forEach((f) => {
      let msg = "";
      const v = f.value.trim();
      if (f.required && !v) msg = "Campo obrigatório";
      else if (v && f.hasAttribute("data-phone") && !phoneToWa(v)) msg = "Informe DDD + número";
      else if (f.name === "nome" && f.required && v.length < 3) msg = "Informe seu nome";
      setError(f, msg);
      if (msg && ok) { f.focus(); ok = false; }
    });
    return ok;
  }
  function summaryHTML(r) {
    return `<div><span>${r.qtd} ${r.qtd === 1 ? "item" : "itens"}</span><span>${brl(r.subtotal)}</span></div>
      ${r.cup.desconto ? `<div><span>Cupom ${esc(r.cup.cupom.codigo)}</span><strong>− ${brl(r.cup.desconto)}</strong></div>` : ""}
      <div class="grand"><span>Total (sem frete)</span><strong>${brl(r.total)}</strong></div>`;
  }
  function abrirCheckout() {
    const r = resumo();
    if (!r.itens.length) return;
    $("#checkoutSummary").innerHTML = summaryHTML(r);
    $("#checkoutModal").showModal();
  }
  function abrirOrcamento() {
    const r = resumo();
    if (!r.itens.length) return;
    $("#quoteSummary").innerHTML = summaryHTML(r);
    $("#quoteModal").showModal();
  }

  function enviarPedido(e) {
    e.preventDefault();
    const form = e.currentTarget;
    if (!validar($$("[name]", form))) return;
    if (!lojaWa()) return toast("WhatsApp da loja não configurado no JSON.", true);
    const d = Object.fromEntries([...new FormData(form)].map(([k, v]) => [k, String(v).trim()]));
    openWa(waLink(lojaWa(), mensagemPedido(d, resumo())));
    form.reset();
    $("#checkoutModal").close();
    state.carrinho = {};
    state.cupom = "";
    save(CART_KEY, state.carrinho);
    save(COUPON_KEY, "");
    renderCart();
    refreshAll();
    closeCart();
    toast("Pedido gerado! Confirme o envio no WhatsApp. 🚀");
  }
  function enviarOrcamento(e) {
    e.preventDefault();
    const form = e.currentTarget;
    const tel = form.telefone;
    tel.required = true;
    const ok = validar([tel]);
    tel.required = false;
    if (!ok) return;
    openWa(waLink(phoneToWa(tel.value), mensagemOrcamento(resumo(), form.nome.value.trim())));
    $("#quoteModal").close();
    toast("Orçamento pronto! Envie para você mesmo no WhatsApp.");
  }

  // =========================================================
  // BUSCA COM SUGESTÕES
  // =========================================================
  function destacar(texto, termos) {
    if (!termos.length) return esc(texto);
    // mapeia cada caractere original para a versão normalizada
    const chars = [...texto];
    const normChars = chars.map((ch) => norm(ch));
    const alvo = normChars.join("");
    const marca = new Array(chars.length).fill(false);
    const offsets = [];
    let acc = 0;
    normChars.forEach((n) => { offsets.push(acc); acc += n.length; });
    termos.forEach((t) => {
      let idx = alvo.indexOf(t);
      while (idx !== -1) {
        chars.forEach((_, i) => { if (offsets[i] >= idx && offsets[i] < idx + t.length) marca[i] = true; });
        idx = alvo.indexOf(t, idx + t.length);
      }
    });
    let out = "", aberto = false;
    chars.forEach((ch, i) => {
      if (marca[i] && !aberto) { out += "<mark>"; aberto = true; }
      if (!marca[i] && aberto) { out += "</mark>"; aberto = false; }
      out += esc(ch);
    });
    return out + (aberto ? "</mark>" : "");
  }

  let sugestoes = [], sugIdx = -1;
  function renderSuggest() {
    const input = $("#searchInput");
    const q = input.value;
    const termos = termosBusca(q);
    const box = $("#suggest");
    if (!termos.length) return fecharSuggest();
    const todos = state.produtos.filter((p) => combina(p, termos));
    // prioriza quem tem o termo no nome
    todos.sort((a, b) => {
      const an = termos.every((t) => norm(a.nome).includes(t)) ? 0 : 1;
      const bn = termos.every((t) => norm(b.nome).includes(t)) ? 0 : 1;
      return an - bn || (b.quantidade > 0) - (a.quantidade > 0);
    });
    sugestoes = todos.slice(0, SUGGEST_MAX);
    sugIdx = -1;
    if (!sugestoes.length) {
      box.innerHTML = `<li class="suggest__empty">Nada encontrado para “${esc(q)}”.</li>`;
    } else {
      box.innerHTML = sugestoes.map((p, i) => `
        <li role="option" id="sug-${i}" data-sug="${esc(p.item)}" aria-selected="false">
          ${produtoImg(p)}
          <div><strong>${destacar(p.nome, termos)}</strong><small>${esc(nomeCategoria(p.categoria))}${p.quantidade <= 0 ? " · esgotado" : ""}</small></div>
          <span class="price-tag">${brl(p.preco)}</span>
        </li>`).join("") +
        (todos.length > SUGGEST_MAX ? `<li class="suggest__all" data-sug-all>Ver todos os ${todos.length} resultados</li>` : "");
    }
    box.hidden = false;
    input.setAttribute("aria-expanded", "true");
  }
  function fecharSuggest() {
    $("#suggest").hidden = true;
    $("#searchInput").setAttribute("aria-expanded", "false");
    $("#searchInput").removeAttribute("aria-activedescendant");
    sugIdx = -1;
  }
  function moverSuggest(delta) {
    if (!sugestoes.length) return;
    sugIdx = (sugIdx + delta + sugestoes.length) % sugestoes.length;
    $$("#suggest [data-sug]").forEach((li, i) => li.setAttribute("aria-selected", i === sugIdx));
    $("#searchInput").setAttribute("aria-activedescendant", "sug-" + sugIdx);
  }
  function irParaResultados() {
    fecharSuggest();
    $("#produtos").scrollIntoView({ behavior: "smooth" });
  }

  // =========================================================
  // TEMA, PWA, TOAST
  // =========================================================
  function toggleTheme() {
    const atual = document.documentElement.dataset.theme === "light" ? "dark" : "light";
    document.documentElement.dataset.theme = atual;
    try { localStorage.setItem(THEME_KEY, atual); } catch { /* ignore */ }
    toast(atual === "light" ? "Tema claro ativado ☀️" : "Tema escuro ativado 🌙");
  }

  let installPrompt = null;
  function setupPwa() {
    if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
      window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
    }
    window.addEventListener("beforeinstallprompt", (e) => {
      e.preventDefault();
      installPrompt = e;
      $("#installBtn").hidden = false;
    });
    window.addEventListener("appinstalled", () => {
      $("#installBtn").hidden = true;
      toast("App instalado! 📲");
    });
    $("#installBtn").addEventListener("click", async () => {
      if (!installPrompt) return;
      installPrompt.prompt();
      await installPrompt.userChoice;
      installPrompt = null;
      $("#installBtn").hidden = true;
    });
  }

  let toastTimer;
  function toast(msg, warn = false) {
    const t = $("#toast");
    // dentro de um modal aberto o toast precisa estar no mesmo "top layer"
    const dlg = $("dialog[open]");
    (dlg || document.body).appendChild(t);
    t.textContent = msg;
    t.classList.toggle("warn", warn);
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("show"), 2600);
  }

  // =========================================================
  // EVENTOS
  // =========================================================
  function bind() {
    // categoria (chips, menu e rodapé)
    document.addEventListener("click", (e) => {
      const b = e.target.closest("[data-cat]");
      if (!b) return;
      state.filtros.categoria = b.dataset.cat;
      syncCategoriaAtiva();
      renderProdutos();
      if (!b.closest("#chipsCategorias")) $("#produtos").scrollIntoView({ behavior: "smooth" });
    });
    $("#chipsCondicao").addEventListener("click", (e) => {
      const b = e.target.closest("[data-cond]");
      if (!b) return;
      state.filtros.condicao = b.dataset.cond;
      syncCondicaoAtiva();
      renderProdutos();
    });
    $("#priceMin").addEventListener("input", onPriceInput);
    $("#priceMax").addEventListener("input", onPriceInput);
    $("#onlyAvailable").addEventListener("change", (e) => {
      state.filtros.soDisponiveis = e.target.checked;
      renderProdutos();
    });
    $("#sortSelect").addEventListener("change", (e) => {
      state.filtros.ordem = e.target.value;
      renderProdutos();
    });
    $("#clearFilters").addEventListener("click", () => {
      state.filtros = novoFiltro();
      $("#searchInput").value = "";
      $("#onlyAvailable").checked = false;
      $("#sortSelect").value = "item";
      resetPrice();
      syncCategoriaAtiva();
      syncCondicaoAtiva();
      renderProdutos();
    });

    // busca + sugestões
    const input = $("#searchInput");
    let debounce;
    input.addEventListener("input", () => {
      renderSuggest();
      clearTimeout(debounce);
      debounce = setTimeout(() => { state.filtros.busca = input.value; renderProdutos(); }, 150);
    });
    input.addEventListener("focus", () => input.value && renderSuggest());
    input.addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown") { e.preventDefault(); if ($("#suggest").hidden) renderSuggest(); moverSuggest(1); }
      else if (e.key === "ArrowUp") { e.preventDefault(); moverSuggest(-1); }
      else if (e.key === "Escape") fecharSuggest();
      else if (e.key === "Enter") {
        e.preventDefault();
        if (sugIdx >= 0 && sugestoes[sugIdx]) { location.hash = "item-" + sugestoes[sugIdx].item; fecharSuggest(); input.blur(); }
        else irParaResultados();
      }
    });
    $("#suggest").addEventListener("mousedown", (e) => e.preventDefault()); // não perde o foco antes do clique
    $("#suggest").addEventListener("click", (e) => {
      const li = e.target.closest("[data-sug]");
      if (li) { location.hash = "item-" + li.dataset.sug; fecharSuggest(); input.blur(); return; }
      if (e.target.closest("[data-sug-all]")) irParaResultados();
    });
    document.addEventListener("click", (e) => { if (!e.target.closest(".search")) fecharSuggest(); });

    // ações de compra (cards e modal)
    document.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-act]");
      if (!btn) return;
      const item = btn.dataset.item;
      const p = getProduto(item);
      if (!p) return;
      const atual = state.selecao[item] || 1;
      if (btn.dataset.act === "add") return addToCart(item, atual);
      if (btn.dataset.act === "inc") {
        const livre = disponivel(p);
        if (atual >= livre) return toast(`Só ${livre === 1 ? "temos 1 unidade disponível" : `temos ${livre} unidades disponíveis`}${reservado(p.item) ? " além das que já estão no carrinho" : ""}.`, true);
        state.selecao[item] = atual + 1;
      }
      if (btn.dataset.act === "dec") state.selecao[item] = Math.max(1, atual - 1);
      refreshItem(item);
    });

    // kits
    $("#kitGrid")?.addEventListener("click", (e) => {
      const add = e.target.closest("[data-kit-add]");
      if (add) return addKit(add.dataset.kitAdd);
      const share = e.target.closest("[data-kit-share]");
      if (share) {
        const k = getKit(share.dataset.kitShare);
        openWa(waShare(`Olha esse kit na ${nomeLoja()}:\n*${k.nome}* — ${brl(kitPreco(k))}${k.desconto ? ` (${k.desconto}% off)` : ""}\n${siteUrl()}#kit-${k.id}`));
      }
    });

    // modal de produto
    window.addEventListener("hashchange", () => routeFromHash(false));
    const pm = $("#productModal");
    pm.addEventListener("close", onProductClosed);
    pm.addEventListener("click", (e) => {
      if (e.target === pm || e.target.closest("[data-close]")) return pm.close();
      const nav = e.target.closest("[data-foto]");
      if (nav) return setFoto(state.modalFoto + Number(nav.dataset.foto));
      const th = e.target.closest("[data-foto-idx]");
      if (th) return setFoto(Number(th.dataset.fotoIdx));
      const cp = e.target.closest("[data-copy]");
      if (cp) copiar(cp.dataset.copy).then((ok) => toast(ok ? "Link copiado! 🔗" : "Não foi possível copiar.", !ok));
      // link para outro kit fecha o modal e rola até ele
      const kitLink = e.target.closest('a[href^="#kit-"]');
      if (kitLink) { e.preventDefault(); const h = kitLink.getAttribute("href"); state.abertoPorNavegacao = false; pm.close(); history.replaceState(null, "", h); routeFromHash(false); }
    });
    pm.addEventListener("keydown", (e) => {
      if (!state.modalItem || totalFotos(getProduto(state.modalItem)) < 2 || e.target.closest("#pmSlider, input, select, textarea")) return;
      if (e.key === "ArrowRight") setFoto(state.modalFoto + 1);
      if (e.key === "ArrowLeft") setFoto(state.modalFoto - 1);
    });

    // carrinho
    $("#cartOpen").addEventListener("click", openCart);
    $("#cartClose").addEventListener("click", closeCart);
    $("#overlay").addEventListener("click", closeCart);
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && $("#cartDrawer").classList.contains("open") && !$("dialog[open]")) closeCart();
    });
    $("#cartItems").addEventListener("click", (e) => {
      const btn = e.target.closest("[data-cart]");
      if (btn) {
        const key = btn.closest(".cart-item").dataset.key;
        const q = state.carrinho[key] || 0;
        if (btn.dataset.cart === "inc") setCartQty(key, q + 1);
        if (btn.dataset.cart === "dec") setCartQty(key, q - 1);
        if (btn.dataset.cart === "rm") setCartQty(key, 0);
        return;
      }
      if (e.target.closest('a[href^="#item-"]')) closeCart();
    });
    $("#couponForm").addEventListener("submit", aplicarCupom);
    $("#couponApplied").addEventListener("click", (e) => {
      if (!e.target.closest("#couponRemove")) return;
      state.cupom = "";
      save(COUPON_KEY, "");
      renderCart();
    });
    $("#btnClear").addEventListener("click", () => {
      state.carrinho = {};
      save(CART_KEY, state.carrinho);
      renderCart();
      refreshAll();
    });
    $("#btnCheckout").addEventListener("click", abrirCheckout);
    $("#btnQuote").addEventListener("click", abrirOrcamento);
    $("#btnPdf").addEventListener("click", baixarPdf);
    $("#btnPng").addEventListener("click", baixarImagem);

    // modais de formulário
    [$("#checkoutModal"), $("#quoteModal")].forEach((d) => {
      d.addEventListener("click", (e) => {
        if (e.target === d || e.target.closest("[data-close]")) d.close();
      });
    });
    $("#checkoutForm").addEventListener("submit", enviarPedido);
    $("#quoteForm").addEventListener("submit", enviarOrcamento);
    $$("[data-phone]").forEach((i) => i.addEventListener("input", () => (i.value = maskPhone(i.value))));
    $$(".field input, .field select, .field textarea").forEach((f) =>
      f.addEventListener("input", () => f.closest(".field").classList.contains("invalid") && setError(f, ""))
    );

    $("#themeToggle").addEventListener("click", toggleTheme);
  }

  bind();
  setupPwa();
  init();
})();
