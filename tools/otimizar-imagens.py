"""
Comunidade.com — otimizador de imagens
======================================

Converte as fotos da pasta img/ (jpg, jpeg, png) para .webp leves,
redimensionadas, prontas para o site carregar rápido no 4G.

Como usar (na pasta do projeto):

    pip install pillow
    python tools/otimizar-imagens.py

Opções:
    --largura 900     tamanho máximo do lado maior, em pixels (padrão 900)
    --qualidade 80    qualidade do webp, de 1 a 100 (padrão 80)
    --manter          não move os originais para img/originais/

O que acontece:
  * img/29.jpg  ->  img/29.webp  (o site procura .webp primeiro)
  * o original vai para img/originais/29.jpg (fica fora do site;
    essa pasta está no .gitignore, então não sobe para o GitHub)
  * logo.png, banner.* e a pasta icons/ não são alterados
"""

import argparse
import shutil
import sys
from pathlib import Path

try:
    from PIL import Image, ImageOps
except ImportError:
    sys.exit("Pillow não está instalado. Rode:  pip install pillow")

RAIZ = Path(__file__).resolve().parent.parent
IMG = RAIZ / "img"
ORIGINAIS = IMG / "originais"
EXTENSOES = {".jpg", ".jpeg", ".png"}
IGNORAR = {"logo", "banner"}


def kb(n):
    return f"{n / 1024:,.0f} KB".replace(",", ".")


def otimizar(arquivo: Path, largura: int, qualidade: int, manter: bool):
    destino = arquivo.with_suffix(".webp")
    antes = arquivo.stat().st_size
    with Image.open(arquivo) as im:
        im = ImageOps.exif_transpose(im)  # corrige fotos "deitadas" do celular
        tem_alpha = im.mode in ("RGBA", "LA") or (im.mode == "P" and "transparency" in im.info)
        im = im.convert("RGBA" if tem_alpha else "RGB")
        im.thumbnail((largura, largura), Image.LANCZOS)
        im.save(destino, "WEBP", quality=qualidade, method=6)
    depois = destino.stat().st_size
    if not manter:
        ORIGINAIS.mkdir(exist_ok=True)
        alvo = ORIGINAIS / arquivo.name
        if alvo.exists():
            alvo.unlink()
        shutil.move(str(arquivo), alvo)
    return antes, depois


def main():
    ap = argparse.ArgumentParser(description="Converte as fotos de img/ para .webp otimizado.")
    ap.add_argument("--largura", type=int, default=900)
    ap.add_argument("--qualidade", type=int, default=80)
    ap.add_argument("--manter", action="store_true", help="não mover os originais")
    args = ap.parse_args()

    if not IMG.is_dir():
        sys.exit(f"Pasta não encontrada: {IMG}")

    fotos = sorted(
        f for f in IMG.iterdir()
        if f.is_file() and f.suffix.lower() in EXTENSOES and f.stem.lower() not in IGNORAR
    )
    if not fotos:
        print("Nenhuma foto .jpg/.png para otimizar em img/.")
        return

    total_antes = total_depois = 0
    print(f"Otimizando {len(fotos)} foto(s) — máx. {args.largura}px, qualidade {args.qualidade}\n")
    for f in fotos:
        try:
            antes, depois = otimizar(f, args.largura, args.qualidade, args.manter)
        except Exception as e:  # arquivo corrompido etc.
            print(f"  ✖ {f.name}: {e}")
            continue
        total_antes += antes
        total_depois += depois
        print(f"  ✔ {f.name:<22} {kb(antes):>10}  ->  {f.stem}.webp {kb(depois):>9}")

    if total_antes:
        eco = 100 - total_depois * 100 / total_antes
        print(f"\nTotal: {kb(total_antes)} -> {kb(total_depois)}  (economia de {eco:.0f}%)")
    if not args.manter:
        print("Originais guardados em img/originais/ (não vão para o site).")


if __name__ == "__main__":
    main()
