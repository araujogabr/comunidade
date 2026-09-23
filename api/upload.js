/* POST /api/upload  { nome, tipo, base64 }  →  { caminho }
   Salva a foto em img/produtos/ no repositório. O painel já envia a imagem
   reduzida e em .webp, então cada foto fica com ~50–200 KB. */
const { metodoPermitido, exigirConfig, exigirLogin, lerCorpo, gravarArquivo, enviar, erro } = require("./_lib");

const TIPOS = { "image/webp": "webp", "image/jpeg": "jpg", "image/png": "png" };
const LIMITE = 3 * 1024 * 1024; // 3 MB

const slug = (t) => String(t || "foto").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .toLowerCase().replace(/\.[a-z0-9]+$/, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "foto";

module.exports = async (req, res) => {
  if (!metodoPermitido(req, res, ["POST"])) return;
  if (!exigirConfig(res)) return;
  if (!exigirLogin(req, res)) return;
  try {
    let corpo;
    try { corpo = await lerCorpo(req); } catch { return erro(res, 400, "Requisição inválida."); }
    const ext = TIPOS[corpo.tipo];
    if (!ext) return erro(res, 415, "Envie uma imagem JPG, PNG ou WEBP.");
    const dados = Buffer.from(String(corpo.base64 || "").replace(/^data:[^,]+,/, ""), "base64");
    if (!dados.length) return erro(res, 400, "Imagem vazia.");
    if (dados.length > LIMITE) return erro(res, 413, "Imagem grande demais (máx. 3 MB).");

    const carimbo = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
    const caminho = `img/produtos/${slug(corpo.nome)}-${carimbo}-${Math.random().toString(36).slice(2, 6)}.${ext}`;
    await gravarArquivo(caminho, dados, null, `Painel: envia foto ${caminho.split("/").pop()}`);
    return enviar(res, 200, { caminho });
  } catch (e) {
    console.error(e);
    return erro(res, e.status || 500, e.message || "Erro ao enviar a foto.");
  }
};
