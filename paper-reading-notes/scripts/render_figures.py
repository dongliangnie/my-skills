"""Render/copy original-paper figures AND experiment tables for a reading note.

Usage:
  1. Copy this script into <slug>_notes/  (so BASE resolves to that dir).
  2. Set FIG / PAPER_PDF to the extracted TeX figures dir and the downloaded PDF.
  3. Fill COPY, RENDER (figures), TABLE_PDF and TABLE_PAGES (tables).
  4. Run:  python render_figures.py

Deps: pymupdf  (managed python: C:/Users/HP/.workbuddy-ai/binaries/python/versions/3.13.12/python.exe)

RULES:
  * Every output name MUST match the `figures/<name>` reference used in note .md.
  * Experiment tables are ALWAYS rendered as original images (never retyped into
    a Markdown table). Render standalone table PDFs, or crop tables from the
    compiled paper PDF. Use locate_table() to find the right page / bbox.
"""
from pathlib import Path
import shutil
import pymupdf

BASE = Path(__file__).parent
FIG = BASE / "source" / "tex" / "figures"        # adjust if TeX tree differs
PAPER_PDF = BASE / "source" / "<slug>_paper.pdf"  # adjust to downloaded PDF name
OUT = BASE / "figures"
OUT.mkdir(parents=True, exist_ok=True)

# ---- EDIT THESE MAPS PER PAPER -----------------------------------------------

# (1) original raster figures already high-res: source rel path -> output name
COPY = {
    # "teaser.png": "fig1_teaser.png",
    # "experiment/plot.png": "fig6_throughput.png",
}

# (2) vector figure PDFs to render at 300 DPI: source rel path -> output name
RENDER = {
    # "teaser_v2.pdf": "fig1_overview.png",
    # "subdir/architecture.pdf": "fig2_arch.png",
}

# (3) standalone table PDFs in the source: source rel path -> output name
TABLE_PDF = {
    # "tables/main_results.pdf": "table1_main_results.png",
}

# (4) tables typeset inside the paper PDF: output name -> (page_index_0based, clip)
#     clip = (x0, y0, x1, y1) in PDF points, or None to render the whole page.
#     Use locate_table(PAPER_PDF, "Table 1") to find page index + bbox, then
#     pad the bbox a little (e.g. +/- 6pt) to keep caption and borders.
TABLE_PAGES = {
    # "table2_ablation.png": (7, (60, 320, 550, 700)),
    # "table3_full.png": (8, None),  # whole page, when clip is unreliable
}
# -----------------------------------------------------------------------------

DPI = 300
mat = pymupdf.Matrix(DPI / 72.0, DPI / 72.0)


def locate_table(pdf_path, keyword):
    """Print pages + rects where `keyword` appears, to help set TABLE_PAGES."""
    doc = pymupdf.open(pdf_path)
    hits = 0
    for i, page in enumerate(doc):
        for r in page.search_for(keyword):
            print(f"  {keyword!r}: page_index={i} rect={tuple(round(v,1) for v in r)}")
            hits += 1
    if not hits:
        print(f"  {keyword!r}: NOT FOUND")
    doc.close()


# --- figures: copy raster ------------------------------------------------------
for src, name in COPY.items():
    s = FIG / src
    if not s.exists():
        print("MISSING", src)
        continue
    shutil.copy2(s, OUT / name)
    print(f"{name:34s} <- {src}")

# --- figures: render vector PDFs ----------------------------------------------
for src, name in RENDER.items():
    s = FIG / src
    if not s.exists():
        print("MISSING", src)
        continue
    doc = pymupdf.open(s)
    pix = doc[0].get_pixmap(matrix=mat, alpha=False)
    pix.save(OUT / name)
    print(f"{name:34s} {pix.width}x{pix.height} <- {src}")
    doc.close()

# --- tables: render standalone table PDFs -------------------------------------
for src, name in TABLE_PDF.items():
    s = FIG / src
    if not s.exists():
        print("MISSING", src)
        continue
    doc = pymupdf.open(s)
    pix = doc[0].get_pixmap(matrix=mat, alpha=False)
    pix.save(OUT / name)
    print(f"{name:34s} {pix.width}x{pix.height} <- table PDF {src}")
    doc.close()

# --- tables: crop from the compiled paper PDF ---------------------------------
if TABLE_PAGES:
    if not PAPER_PDF.exists():
        print("MISSING PAPER_PDF", PAPER_PDF)
    else:
        doc = pymupdf.open(PAPER_PDF)
        for name, (page_idx, clip) in TABLE_PAGES.items():
            page = doc[page_idx]
            kw = {"matrix": mat, "alpha": False}
            if clip:
                kw["clip"] = pymupdf.Rect(*clip)
            pix = page.get_pixmap(**kw)
            pix.save(OUT / name)
            region = "full-page" if clip is None else f"clip={clip}"
            print(f"{name:34s} {pix.width}x{pix.height} <- PDF p{page_idx+1} {region}")
        doc.close()

# Uncomment to locate tables while setting TABLE_PAGES (then re-comment):
# locate_table(PAPER_PDF, "Table 1")

print("Done. Verify every figures/<name> is referenced in the note .md, and vice versa;")
print("      and that every table image shows a COMPLETE, uncut table.")
