/* GET /api/produtos  →  { catalogo, sha }         (lê data/produtos.json do GitHub)
   PUT /api/produtos  { catalogo, sha, mensagem } →  { sha, commitUrl }
   Cada "Publicar" do painel vira um commit; a Vercel publica o site sozinha em ~1 min. */
const {
  ARQUIVO_CATALOGO, metodoPermitido, exigirConfig, exigirLogin, lerCorpo,
  lerArquivo, gravarArquivo, validarCatalogo, formatarCatalogo, enviar, erro,
} = require("./_lib");

module.exports = async (req, res) => {
  if (!metodoPermitido(req, res, ["GET", "PUT"])) return;
  if (!exigirConfig(res)) return;
  if (!exigirLogin(req, res)) return;

  try {
    if (req.method === "GET") {
      const { texto, sha } = await lerArquivo(ARQUIVO_CATALOGO);
      let catalogo;
      try { catalogo = JSON.parse(texto); } catch (e) {
        return erro(res, 422, `O produtos.json do repositório tem um erro de sintaxe: ${e.message}`);
      }
      return enviar(res, 200, { catalogo, sha });
    }

    // PUT
    let corpo;
    try { corpo = await lerCorpo(req); } catch { return erro(res, 400, "Requisição inválida."); }
    const { catalogo, sha, mensagem } = corpo;
    if (!sha) return erro(res, 400, "Versão do catálogo ausente. Recarregue o painel.");
    const problemas = validarCatalogo(catalogo);
    if (problemas.length) return erro(res, 422, "O catálogo tem problemas e não foi salvo.", { problemas });

    const texto = formatarCatalogo(catalogo);
    if (texto.length > 900 * 1024) return erro(res, 413, "Catálogo grande demais (máx. ~900 KB).");
    const resumo = String(mensagem || "Atualiza catálogo").replace(/\s+/g, " ").slice(0, 200);
    const r = await gravarArquivo(ARQUIVO_CATALOGO, texto, sha, `Painel: ${resumo}`);
    return enviar(res, 200, r);
  } catch (e) {
    if (e.status === 409) {
      return erro(res, 409, "O catálogo foi alterado por outra pessoa (ou em outra aba) depois que você abriu o painel. Recarregue para ver a versão mais nova.");
    }
    console.error(e);
    return erro(res, e.status || 500, e.message || "Erro inesperado.");
  }
};
