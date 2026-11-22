"""Render/copy original-paper figures for a reading note.

Usage:
  1. Copy this script into <slug>_notes/  (so BASE resolves to that dir).
  2. Set FIG to the extracted TeX figures dir (default: source/tex/figures).
  3. Fill COPY (original PNG/JPG -> output name) and RENDER (vector PDF -> output name).
  4. Run:  python render_figures.py

Deps: pymupdf  (managed python: C:/Users/HP/.workbuddy-ai/binaries/python/versions/3.13.12/python.exe)

Every output name MUST match the `figures/<name>` reference used in the note .md.
"""
from pathlib import Path
import shutil
import pymupdf

BASE = Path(__file__).parent
FIG = BASE / "source" / "tex" / "figures"   # adjust if TeX tree differs
OUT = BASE / "figures"
OUT.mkdir(parents=True, exist_ok=True)

# ---- EDIT THESE TWO MAPS PER PAPER -------------------------------------------
# original raster figures already high-res: source rel path -> output png name
COPY = {
    # "teaser.png": "fig1_teaser.png",
    # "experiment/plot.png": "fig6_throughput.png",
}

# vector figure PDFs to render at 300 DPI: source rel path -> output png name
RENDER = {
    # "teaser_v2.pdf": "fig1_overview.png",
    # "subdir/architecture.pdf": "fig2_arch.png",
}
# -----------------------------------------------------------------------------

DPI = 300
mat = pymupdf.Matrix(DPI / 72.0, DPI / 72.0)

for src, name in COPY.items():
    s = FIG / src
    if not s.exists():
        print("MISSING", src)
        continue
    shutil.copy2(s, OUT / name)
    print(f"{name:34s} <- {src}")

for src, name in RENDER.items():
    s = FIG / src
    if not s.exists():
        print("MISSING", src)
        continue
    doc = pymupdf.open(s)
    pix = doc[0].get_pixmap(matrix=mat, alpha=False)
    pix.save(OUT / name)
    print(f"{name:34s} {pix.width}x{pix.height} <- {src}")

print("Done. Verify every figures/<name> is referenced in the note .md, and vice versa.")
