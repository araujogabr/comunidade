# Comunidade.com — loja de componentes

Loja estática (HTML + CSS + JS puro, sem banco de dados). Tudo vem de `data/produtos.json`.

## Estrutura

```
index.html              página da loja
validar.html            validador do catálogo (não aparece no menu)
css/style.css           estilos (tema escuro e claro)
js/app.js               lógica da loja
data/produtos.json      ← loja, cupons, kits, FAQ, categorias e produtos
img/                    fotos dos produtos, logo e banner
img/icons/              ícones do app (PWA)
manifest.webmanifest    dados do app instalável
sw.js                   service worker (funciona offline)
tools/otimizar-imagens.py   converte fotos para .webp leve
```

## Rodar localmente

O navegador bloqueia a leitura do JSON quando o arquivo é aberto direto (file://). Use um servidor local:

- **VS Code:** extensão *Live Server* → "Go Live"; ou
- **Terminal** (na pasta do projeto): `python -m http.server 5500` → http://localhost:5500

Validador: http://localhost:5500/validar.html

## Fotos

| Arquivo | Uso |
|---|---|
| `img/29.webp` (ou `.jpg` / `.png`) | foto principal do item 29 |
| `img/29-2.webp`, `img/29-3.webp`… | fotos extras (declare `"fotos": 3` no produto) |
| `img/logo.png` | logo do topo |
| `img/banner.jpg` | imagem do banner (opcional) |
| `img/abertura.jpg` | imagem da animação de abertura (hacker) |

O site procura **.webp → .jpg → .png**. Sem foto, aparece um chip com o número do item.

### Fotos por link (campo `imagens`)

Em vez de arquivos na pasta `img/`, o produto pode trazer os links das fotos:

```json
{ "item": 29, "nome": "Arduino Uno", ...,
  "imagens": [
    "https://exemplo.com/arduino-frente.jpg",
    "https://exemplo.com/arduino-verso.jpg"
  ] }
```

- A **primeira** imagem aparece no card; todas aparecem no slider ao abrir o produto.
- Com um link só, também pode escrever `"imagens": "https://..."`.
- Links de compartilhamento do **Google Drive**, **Dropbox** e **GitHub** são convertidos automaticamente (no Drive, o arquivo precisa estar como “Qualquer pessoa com o link”).
- Prefira `https://`. Se um link falhar, o site tenta a foto local `img/29.webp` e, por último, mostra o chip com o número.
- Produto sem `imagens` continua usando as fotos da pasta `img/` e o campo `fotos`.

### Otimizar as fotos

```
pip install pillow
python tools/otimizar-imagens.py
```

Gera `.webp` com até 900 px e move os originais para `img/originais/` (fica fora do GitHub pelo `.gitignore`).
Opções: `--largura 1200`, `--qualidade 85`, `--manter` (não move os originais).

## Editando o `produtos.json`

### Produto
```json
{ "item": 29, "nome": "Arduino Uno", "descricao": "Texto curto do card.",
  "categoria": "microcontroladores", "preco": 49.90, "quantidade": 16, "condicao": "novo",
  "fotos": 2,
  "descricaoLonga": "Opcional: texto maior só na página do produto.",
  "especificacoes": { "Microcontrolador": "ATmega328P", "Tensão": "5 V" } }
```
- `preco` com ponto (49.90). `quantidade: 0` = esgotado (aparece "Avise-me quando chegar").
- `condicao`: `novo`, `usado` ou `usado testado`.
- `fotos`, `descricaoLonga` e `especificacoes` são opcionais.

### Kit
```json
{ "id": "robotica", "nome": "Kit Robótica com Arduino", "descricao": "...", "desconto": 10,
  "itens": [{ "item": 29, "qtd": 1 }, { "item": 21, "qtd": 2 }] }
```
O preço é a soma dos itens com o `desconto` (%). O estoque do kit usa o estoque dos próprios produtos.
`id` só com letras minúsculas, números e hífen — vira o link `site/#kit-robotica`.

### Cupom
```json
{ "codigo": "TCC10", "tipo": "percentual", "valor": 10, "minimo": 50, "validade": "2026-12-31", "descricao": "10% off acima de R$ 50" }
```
`tipo`: `percentual` ou `valor` (reais). `minimo` e `validade` são opcionais. Para desativar sem apagar: `"ativo": false`.
> Cupons ficam visíveis no JSON público — use para campanhas, não para descontos secretos.

### Outros campos
- `loja.whatsapp`: número que recebe os pedidos (55 + DDD + número, só dígitos).
- `loja.entrega`: texto sobre a entrega por aplicativo (aparece no carrinho, no pedido e no orçamento).
- `loja.orcamentoValidadeDias`: validade impressa no orçamento.
- `comoFunciona` e `faq`: textos das seções "Como funciona" e "Perguntas frequentes".

**Sempre rode o `validar.html` antes de publicar.**

## Links diretos

- Produto: `https://seusite/#item-29` (abre a página do produto)
- Kit: `https://seusite/#kit-robotica`

## App instalável (PWA)

Funciona em `https://` (GitHub Pages) ou `localhost`. No celular aparece "Adicionar à tela inicial"; no computador, o botão ⬇ no topo.
O site busca sempre a versão mais nova do JSON; a cópia salva só é usada sem internet.

## Deploy no GitHub Pages

1. Crie um repositório e envie todos os arquivos.
2. Settings → Pages → Source: *Deploy from a branch* → `main` / `root`.
3. Para atualizar produtos, edite `data/produtos.json` no GitHub, confira em `/validar.html` e pronto.

## Painel de gerenciamento (/admin)

O dono da loja cadastra, edita e exclui produtos em `https://seusite/admin`, sem mexer em código.

**Como funciona:** o painel envia o catálogo para a API (`api/`, funções serverless da Vercel), que faz um *commit* do `data/produtos.json` no GitHub. A Vercel percebe o commit e publica o site em ~1 minuto. Fotos enviadas pelo painel vão para `img/produtos/`.

| Arquivo | Função |
|---|---|
| `admin.html`, `js/admin.js`, `css/admin.css` | tela do painel |
| `api/login.js` | confere a senha e devolve um token de sessão (8 h) |
| `api/produtos.js` | lê (GET) e publica (PUT) o catálogo |
| `api/upload.js` | envia fotos para `img/produtos/` |
| `api/_lib.js` | funções compartilhadas (GitHub, login, validação) |
| `vercel.json` | endereço `/admin`, cache e cabeçalhos |
| `tools/dev-server.js` | servidor para testar tudo no computador |

### Variáveis de ambiente (Vercel → Settings → Environment Variables)

| Nome | Valor |
|---|---|
| `ADMIN_SENHA` | senha do painel |
| `GITHUB_TOKEN` | token *fine-grained* do GitHub, só deste repositório, permissão **Contents: Read and write** |
| `GITHUB_REPO` | `dono/repositorio` (ex.: `araujogabr/comunidade`) |
| `GITHUB_BRANCH` | branch publicada (padrão `main`) |
| `SESSION_SECRET` | texto aleatório longo (opcional, recomendado) |

Depois de criar ou alterar variáveis, faça um **Redeploy** na Vercel.

### Testar no computador

```
node tools/dev-server.js
```

Abra http://localhost:3000/admin (senha `admin`). Nesse modo local o painel grava no `data/produtos.json` da própria pasta — nada vai para o GitHub.
Para testar contra o GitHub de verdade, crie um `.env.local` com as mesmas variáveis (ele está no `.gitignore`).
