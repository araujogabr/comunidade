/* POST /api/login  { senha }  →  { token, expira }
   O token vale 8 horas e é enviado pelo painel em "Authorization: Bearer ...". */
const { metodoPermitido, exigirConfig, lerCorpo, senhaConfere, criarToken, enviar, erro, esperar } = require("./_lib");

module.exports = async (req, res) => {
  if (!metodoPermitido(req, res, ["POST"])) return;
  if (!exigirConfig(res)) return;
  let corpo;
  try { corpo = await lerCorpo(req); } catch { return erro(res, 400, "Requisição inválida."); }
  const senha = String(corpo.senha || "");
  if (!senha || !senhaConfere(senha)) {
    await esperar(1200); // atrasa tentativas de adivinhar a senha
    return erro(res, 401, "Senha incorreta.");
  }
  enviar(res, 200, criarToken());
};
