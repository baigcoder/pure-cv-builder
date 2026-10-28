"""Read CV text from a PDF in visual order, not drawing order.

PDF text comes out in whatever order it was drawn. In most CV layouts that
puts a right-hand date column after the entry's bullets and splits wrapped
bullets into separate lines. This module rebuilds the page from line
positions:

* Sidebar layouts are split into columns; the wider (main) column comes first.
* Lines are grouped into visual rows; cells far apart on a row are joined
  with `` | ``.
* Right-hand dates and locations that sit beside a bullet are moved up to the
  entry's header line, where a reader would expect them.
* Wrapped bullet lines are rejoined into one bullet, and every bullet glyph is
  normalised to ``•``.

It also returns the PDF's link targets, which hold full email, LinkedIn,
GitHub and website addresses even when the page only shows a username.
"""

import re
from dataclasses import dataclass, field

BULLET_GLYPHS = "•●◦▪▸►‣⁃∙·■◆★–—*-➤➢✔✓"
# Distinctive glyphs may touch the text ("\u25e6Led ..."); dashes and asterisks need a space.
BULLET_RE = re.compile(rf"^\s*(?:[{re.escape(BULLET_GLYPHS.replace('-', '').replace('*', '').replace(chr(0x2013), '').replace(chr(0x2014), ''))}]\s*|[-*\u2013\u2014]\s+)(?=\S)")
_MONTH = r"(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|June?|July?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?"
_DATE = rf"(?:{_MONTH}\s+\d{{4}}|\d{{1,2}}/\d{{4}}|\d{{4}}-\d{{2}}|\d{{4}})"
DATE_RANGE_RE = re.compile(rf"{_DATE}\s*(?:-|–|—|to)\s*(?:{_DATE}|Present|Current|Now|Ongoing)", re.I)
SINGLE_DATE_RE = re.compile(rf"^(?:{_DATE}|Present)$", re.I)
LOCATION_RE = re.compile(r"^(?:Remote|Hybrid|On-?site|[A-Z][\w.'\- ]+,\s*[A-Z][\w.'\- ]+(?:,\s*[A-Z][\w.'\- ]+)?)$")
DURATION_RE = re.compile(r"^\d+\s+(?:years?|yrs?|months?)(?:\s+\d+\s+months?)?$", re.I)
NOISE_RE = re.compile(r"^(?:last updated\b.*|page \d+ of \d+|.+\s[–-]\s\d+\s*/\s*\d+)$", re.I)


@dataclass
class _Line:
    text: str
    x0: float
    y0: float
    x1: float
    y1: float
    size: float
    bold: bool
    cells: list["_Line"] = field(default_factory=list)


def _clean(text: str) -> str:
    text = text.replace("\xad", "").replace(" ", " ")
    text = re.sub(r"[-](?=\s)", "•", text)  # private-use bullet glyphs
    text = re.sub(r"[-]", "", text)
    text = re.sub(r"\s+", " ", text).strip()
    return re.sub(r"\s+([,.;:)])", r"\1", text)


def _page_lines(page) -> list[_Line]:
    lines: list[_Line] = []
    for block in page.get_text("dict")["blocks"]:
        if block.get("type") != 0:
            continue
        for line in block["lines"]:
            spans = [s for s in line["spans"] if s["text"].strip()]
            if not spans:
                continue
            text = _clean(" ".join(s["text"] for s in spans))
            if not text:
                continue
            x0, y0, x1, y1 = line["bbox"]
            lines.append(_Line(
                text=text, x0=x0, y0=y0, x1=x1, y1=y1,
                size=max(s["size"] for s in spans),
                bold=any(s["flags"] & 16 or "bold" in s["font"].lower() for s in spans),
            ))
    return lines


def _split_columns(lines: list[_Line], width: float) -> list[list[_Line]]:
    """Sidebar layouts: return [main, sidebar]. Otherwise a single column."""
    if len(lines) < 12:
        return [lines]
    best = None
    for split in (width * f for f in (0.28, 0.32, 0.36, 0.40, 0.45, 0.55, 0.60, 0.64, 0.68)):
        left = [l for l in lines if l.x1 <= split + 2]
        right = [l for l in lines if l.x0 >= split - 2]
        spanning = [l for l in lines if l.x0 < split - 2 and l.x1 > split + 2]
        if len(left) >= 5 and len(right) >= 5 and len(spanning) <= max(1, len(lines) // 20):
            # Prefer the gutter with the most lines on each side.
            score = min(len(left), len(right))
            if best is None or score > best[0]:
                best = (score, left, right, spanning)
    if best is None:
        return [lines]
    _, left, right, spanning = best
    # A narrow column whose lines sit on the same rows as the other column (dates
    # beside entries, as in moderncv) is part of a table, not a sidebar.
    narrow, wide = (left, right) if len(left) <= len(right) else (right, left)
    aligned = sum(
        any(min(n.y1, w.y1) - max(n.y0, w.y0) > 0.5 * min(n.y1 - n.y0, w.y1 - w.y0) for w in wide) for n in narrow
    )
    mostly_dates = sum(_is_meta(n.text) for n in narrow) >= 0.5 * len(narrow)
    if aligned >= 0.6 * len(narrow) and mostly_dates:
        return [lines]
    chars = lambda col: sum(len(l.text) for l in col)  # noqa: E731
    main, side = (right, left) if chars(right) >= chars(left) else (left, right)
    return [sorted(spanning, key=lambda l: l.y0) + main, side]


def _rows(lines: list[_Line]) -> list[_Line]:
    """Merge lines that share a baseline into one row with ordered cells."""
    rows: list[_Line] = []
    for line in sorted(lines, key=lambda l: (round(l.y0, 0), l.x0)):
        middle = (line.y0 + line.y1) / 2
        target = next(
            (r for r in reversed(rows[-4:]) if r.y0 - 1 <= middle <= r.y1 + 1 and abs((r.y0 + r.y1) / 2 - middle) < 0.6 * min(r.size, line.size)),
            None,
        )
        if target is None:
            rows.append(_Line(line.text, line.x0, line.y0, line.x1, line.y1, line.size, line.bold, [line]))
        else:
            target.cells.append(line)
            target.cells.sort(key=lambda c: c.x0)
            target.x0, target.x1 = min(target.x0, line.x0), max(target.x1, line.x1)
            target.y0, target.y1 = min(target.y0, line.y0), max(target.y1, line.y1)
    for row in rows:
        merged: list[_Line] = []
        for cell in row.cells:
            if merged and cell.x0 - merged[-1].x1 < max(6.0, cell.size * 1.2):
                prev = merged[-1]
                merged[-1] = _Line(f"{prev.text} {cell.text}", prev.x0, prev.y0, cell.x1, cell.y1, max(prev.size, cell.size), prev.bold or cell.bold)
            else:
                merged.append(cell)
        row.cells = merged
        row.text = " | ".join(c.text for c in merged)
    return rows


def _is_meta(text: str) -> bool:
    return bool(
        DATE_RANGE_RE.search(text)
        or SINGLE_DATE_RE.match(text)
        or DURATION_RE.match(text)
        or (LOCATION_RE.match(text) and len(text.split()) <= 5)
    )


def _column_text(rows: list[_Line]) -> list[str]:
    if not rows:
        return []
    left_margin = min(r.x0 for r in rows)
    right_edge = max(r.x1 for r in rows)
    out: list[str] = []
    kinds: list[str] = []  # "bullet" | "header" | "text"
    last_header = -1
    prev_row: _Line | None = None

    for row in rows:
        if NOISE_RE.match(row.text):
            continue
        cells = [c.text for c in row.cells]
        main = cells[0]
        # A bullet glyph drawn as its own cell: fold it into the text.
        if len(cells) > 1 and re.fullmatch(rf"[{re.escape(BULLET_GLYPHS)}]", main):
            cells = [f"• {cells[1]}"] + cells[2:]
            main = cells[0]
        meta = [c for c in cells[1:] if _is_meta(c) and row.cells[cells.index(c)].x0 > left_margin + (right_edge - left_margin) * 0.5] if len(cells) > 1 else []
        rest = [c for c in cells[1:] if c not in meta]
        # Time spans ("5 years 9 months") are derived from the dates; drop them.
        meta = [c for c in meta if not DURATION_RE.match(c)]

        is_bullet = bool(BULLET_RE.match(main))
        if is_bullet:
            main = "• " + BULLET_RE.sub("", main)
        # Wrapped continuation of the previous bullet: indented past the margin, or the
        # previous bullet ran to the right edge and this line isn't a new heading or entry.
        continuation = (
            not is_bullet
            and kinds
            and kinds[-1] == "bullet"
            and prev_row is not None
            and not row.bold
            and row.size <= prev_row.size + 0.5
            # A wrapped line sits right under the previous one; a new entry has space above it.
            and row.y0 - prev_row.y1 < 0.6 * (row.y1 - row.y0)
            and not DATE_RANGE_RE.search(main)
            and (row.x0 > left_margin + 4 or prev_row.cells[0].x1 >= left_margin + (right_edge - left_margin) * 0.82 or main[:1].islower())
        )
        if continuation:
            out[-1] = f"{out[-1]} {' | '.join([main] + rest)}".strip()
        else:
            out.append(" | ".join([main] + rest))
            kinds.append("bullet" if is_bullet else "header")
            if not is_bullet:
                last_header = len(out) - 1
        # Dates/locations beside a bullet belong to the entry header above it.
        if meta:
            if (is_bullet or continuation) and last_header >= 0:
                out[last_header] = f"{out[last_header]} | {' | '.join(meta)}"
            else:
                out[-1] = f"{out[-1]} | {' | '.join(meta)}"
        prev_row = row
    return out


def extract_layout(pdf_bytes: bytes) -> tuple[str, list[str]]:
    """Visual-order text (one row per line) and every link URI in the document."""
    import fitz

    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    try:
        text_lines: list[str] = []
        links: list[str] = []
        for page in doc:
            lines = _page_lines(page)
            for column in _split_columns(lines, page.rect.width):
                text_lines.extend(_column_text(_rows(column)))
            links.extend(link["uri"] for link in page.get_links() if link.get("uri"))
        return "\n".join(text_lines), list(dict.fromkeys(links))
    finally:
        doc.close()
