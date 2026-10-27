"""Parse experience, education and project entries, and contact details, from layout rows.

Input lines come from ``pdf_layout``: one visual row per line, cells joined
with `` | ``, bullets normalised to ``•`` and wrapped bullets already joined.
An entry is a block of header lines followed by bullets; each header cell is
classified as dates, location, sentence or identity text.
"""

import re

from services.pdf_layout import BULLET_RE, DATE_RANGE_RE, DURATION_RE, LOCATION_RE, SINGLE_DATE_RE

MONTHS = {
    name: index
    for index, names in enumerate(
        [("jan", "january"), ("feb", "february"), ("mar", "march"), ("apr", "april"), ("may",), ("jun", "june"),
         ("jul", "july"), ("aug", "august"), ("sep", "sept", "september"), ("oct", "october"), ("nov", "november"),
         ("dec", "december")],
        start=1,
    )
    for name in names
}

ROLE_WORDS = re.compile(
    r"\b(engineer|developer|manager|analyst|designer|intern|lead|director|consultant|specialist|scientist|officer|"
    r"head|architect|associate|coordinator|administrator|assistant|executive|president|founder|co-founder|owner|"
    r"researcher|teacher|lecturer|professor|tutor|accountant|editor|writer|producer|technician|representative|"
    r"advisor|adviser|partner|principal|supervisor|strategist|programmer|cto|ceo|cfo|vp|sde|swe|devops|marketer|"
    r"recruiter|nurse|attorney|counsel|clerk|agent|operator|fellow|trainee|apprentice|volunteer)\b",
    re.I,
)
INSTITUTION_WORDS = re.compile(
    r"\b(university|université|universidad|college|institute|institut|school|academy|polytechnic|conservatory|"
    r"faculty|ecole|école)\b",
    re.I,
)
DEGREE_RE = re.compile(
    r"\b(B\.?\s?Sc\.?|B\.?\s?S\.?|B\.?\s?A\.?|B\.?\s?Eng\.?|B\.?\s?Tech\.?|B\.?\s?Com\.?|BBA|LLB|M\.?\s?Sc\.?|M\.?\s?S\.?|"
    r"M\.?\s?A\.?|M\.?\s?Eng\.?|M\.?\s?Tech\.?|MBA|LLM|M\.?\s?Phil\.?|Ph\.?\s?D\.?|DPhil|MD|JD|"
    r"Bachelor(?:'s)?(?: of [A-Z][\w ]+?)?|Master(?:'s)?(?: of [A-Z][\w ]+?)?|Doctor(?:ate)?(?: of [A-Z][\w ]+?)?|"
    r"Associate(?:'s)? Degree|Diploma|Certificate|HND|A-Levels|GCSEs?|High School Diploma)(?=$|[\s,(|-])",
)
EMAIL_RE = re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+")
PHONE_RE = re.compile(r"(?<!\d)\+?\d[\d\s().-]{7,}\d(?!\d)")
SEPARATORS = re.compile(r"\s*(?:\||·|•|●|–(?=\s)|—|/(?=\s))\s*")


def _iso(value: str) -> str:
    """'Mar 2021' -> '2021-03', '03/2021' -> '2021-03', 'present' stays."""
    value = value.strip().rstrip(".")
    if re.fullmatch(r"present|current|now|ongoing", value, re.I):
        return "present"
    match = re.fullmatch(r"([A-Za-z]+)\.?\s+(\d{4})", value)
    if match and match.group(1).lower() in MONTHS:
        return f"{match.group(2)}-{MONTHS[match.group(1).lower()]:02d}"
    match = re.fullmatch(r"(\d{1,2})/(\d{4})", value)
    if match and 1 <= int(match.group(1)) <= 12:
        return f"{match.group(2)}-{int(match.group(1)):02d}"
    return value


def _split_range(value: str) -> list[str]:
    """Split a date range on its separator without breaking ISO dates like 2021-03."""
    for pattern in (r"\s+(?:-|–|—|to)\s+", r"\s*[–—]\s*", r"(?<=\d{4})-(?=\d{4}|present|current|now)", r"(?<=[a-z])-(?=[a-z0-9])"):
        parts = re.split(pattern, value, maxsplit=1, flags=re.I)
        if len(parts) == 2:
            return parts
    return [value]


def _dates(text: str) -> tuple[str, str, str]:
    """(start, end, text without the date range)."""
    match = DATE_RANGE_RE.search(text)
    if not match:
        return "", "", text
    parts = _split_range(match.group(0))
    rest = (text[: match.start()] + text[match.end():]).strip(" ,|·-–")
    return _iso(parts[0]), _iso(parts[1]) if len(parts) > 1 else "", rest


def _is_bullet(line: str) -> bool:
    return bool(BULLET_RE.match(line))


def _blocks(lines: list[str]) -> list[dict]:
    """Group lines into entries: header lines, then bullets."""
    entries: list[dict] = []
    current: dict | None = None
    for line in lines:
        line = line.strip()
        if not line:
            continue
        if _is_bullet(line):
            if current is None:
                current = {"header": [], "bullets": [], "has_date": False}
                entries.append(current)
            current["bullets"].append(BULLET_RE.sub("", line).strip())
            continue
        has_date = bool(DATE_RANGE_RE.search(line))
        starts_new = (
            current is None
            or bool(current["bullets"])
            or (has_date and current["has_date"] and not _is_sentence(line))
            or (len(current["header"]) >= 2 and current["has_date"] and not _is_sentence(line) and _looks_like_identity(line))
        )
        if starts_new:
            current = {"header": [], "bullets": [], "has_date": False}
            entries.append(current)
        current["header"].append(line)
        current["has_date"] = current.get("has_date", False) or has_date
    return [e for e in entries if e["header"] or e["bullets"]]


def _is_sentence(text: str) -> bool:
    return len(text.split()) >= 6 and (text.rstrip().endswith(".") or len(text.split()) >= 12)


def _looks_like_identity(text: str) -> bool:
    first = text.split(" | ")[0]
    return len(first.split()) <= 8 and not first.endswith(".")


def _classify(header: list[str]) -> dict:
    """Split header cells into dates, location, identity parts and summary sentences."""
    out = {"start": "", "end": "", "location": "", "parts": [], "summary": []}
    for line_index, line in enumerate(header):
        cells = [c.strip() for c in line.split(" | ") if c.strip()]
        for cell_index, cell in enumerate(cells):
            if DURATION_RE.match(cell):
                continue
            start, end, rest = _dates(cell)
            if start and not out["start"]:
                out["start"], out["end"] = start, end
            if not rest:
                continue
            if SINGLE_DATE_RE.match(rest) and not out["start"]:
                out["start"] = _iso(rest)
                continue
            # "Engineer, Northwind – Toronto, Canada": the trailing place is the location.
            tail = re.search(r"\s[–—-]\s([^–—]+)$", rest)
            if tail and not out["location"] and _is_place(tail.group(1)):
                out["location"] = tail.group(1).strip()
                rest = rest[: tail.start()].strip()
            first_cell = line_index == 0 and cell_index == 0
            if not first_cell and not out["location"] and _is_place(rest):
                out["location"] = rest
            elif _is_sentence(rest):
                out["summary"].append(rest)
            else:
                out["parts"].append(rest)
    return out


def _is_place(text: str) -> bool:
    text = text.strip()
    return (
        bool(LOCATION_RE.match(text))
        and len(text.split()) <= 5
        and not ROLE_WORDS.search(text)
        and not INSTITUTION_WORDS.search(text)
        and not DEGREE_RE.search(text)
    )


def _split_identity(parts: list[str]) -> list[str]:
    """One combined identity cell ('Engineer, Northwind' / 'Engineer at Northwind') becomes two parts."""
    if len(parts) != 1:
        return parts
    for pattern in (r"\s+at\s+", r"\s+@\s+", r"\s+[–—-]\s+", r",\s+"):
        pieces = re.split(pattern, parts[0], maxsplit=1)
        if len(pieces) == 2 and all(p.strip() for p in pieces):
            return [p.strip() for p in pieces]
    return parts


def parse_experience(lines: list[str]) -> list[dict]:
    entries = []
    for block in _blocks(lines):
        info = _classify(block["header"])
        parts = _split_identity(info["parts"])
        position = company = ""
        if parts:
            role_index = next((i for i, p in enumerate(parts[:2]) if ROLE_WORDS.search(p)), None)
            if role_index is None:
                company = parts[0]
                position = parts[1] if len(parts) > 1 else ""
            else:
                position = parts[role_index]
                others = [p for i, p in enumerate(parts) if i != role_index]
                company = others[0] if others else ""
        if not (position or company):
            continue
        entries.append({
            "company": company,
            "position": position,
            "start_date": info["start"],
            "end_date": info["end"] or ("present" if info["start"] else ""),
            "location": info["location"],
            "summary": " ".join(info["summary"]),
            "highlights": block["bullets"],
        })
    return entries


def parse_education(lines: list[str]) -> list[dict]:
    entries = []
    for block in _blocks(lines):
        info = _classify(block["header"])
        institution = degree = area = ""
        for part in info["parts"]:
            pieces = [p.strip() for p in re.split(r",\s+", part) if p.strip()]
            for piece in pieces:
                degree_match = DEGREE_RE.search(piece)
                if not institution and INSTITUTION_WORDS.search(piece):
                    institution = piece
                elif degree_match and not degree:
                    degree = degree_match.group(0).strip()
                    tail = re.sub(r"^\s*(?:in|of|,|-|–)\s*", "", piece[degree_match.end():]).strip(" ,()")
                    area = area or tail
                elif not area and not DEGREE_RE.search(piece):
                    area = piece
        if not institution and info["parts"]:
            institution = info["parts"][0]
            if area == institution:
                area = ""
        if not institution:
            continue
        entries.append({
            "institution": institution,
            "degree": degree,
            "area": area,
            "start_date": info["start"],
            "end_date": info["end"],
            "location": info["location"],
            "summary": " ".join(info["summary"]),
            "highlights": block["bullets"],
        })
    return entries


def parse_projects(lines: list[str]) -> list[dict]:
    entries = []
    for block in _blocks(lines):
        info = _classify(block["header"])
        if not info["parts"]:
            continue
        name = re.sub(r"\s*[|(]?\s*(?:live demo|github|source|link)\b.*$", "", info["parts"][0], flags=re.I).strip()
        url = next((p for p in info["parts"][1:] if re.search(r"\w\.\w{2,}/|https?://", p)), "")
        summary = " ".join(info["summary"] + [p for p in info["parts"][1:] if p != url])
        entries.append({
            "name": name,
            "start_date": info["start"],
            "end_date": info["end"],
            "url": url,
            "summary": summary,
            "highlights": block["bullets"],
        })
    return entries


def parse_contact(header_lines: list[str], links: list[str]) -> dict:
    """Contact details from the lines above the first section, plus PDF link targets."""
    found: dict[str, str] = {}
    for uri in links:
        lower = uri.lower()
        if lower.startswith("mailto:") and "email" not in found:
            found["email"] = uri[7:].split("?")[0]
        elif lower.startswith("tel:") and "phone" not in found:
            found["phone"] = uri[4:]
        elif (m := re.search(r"linkedin\.com/in/([\w\-%]+)", uri, re.I)) and "linkedin" not in found:
            found["linkedin"] = m.group(1)
        elif (m := re.search(r"github\.com/([\w-]+)/?$", uri, re.I)) and "github" not in found:
            found["github"] = m.group(1)
        elif lower.startswith(("http://", "https://")) and "website" not in found and not re.search(r"linkedin|github|orcid|scholar\.google", lower):
            found["website"] = re.sub(r"^https?://(www\.)?", "", uri).rstrip("/")

    for line in header_lines[1:]:
        for part in SEPARATORS.split(line):
            part = BULLET_RE.sub("", part).strip()
            if not part:
                continue
            if "email" not in found and (m := EMAIL_RE.search(part)):
                found["email"] = m.group(0)
            elif "linkedin" not in found and (m := re.search(r"linkedin\.com/in/([\w-]+)", part, re.I)):
                found["linkedin"] = m.group(1)
            elif "github" not in found and (m := re.search(r"github\.com/([\w-]+)", part, re.I)):
                found["github"] = m.group(1)
            elif "phone" not in found and PHONE_RE.fullmatch(part):
                found["phone"] = part
            elif "location" not in found and _is_place(part):
                found["location"] = part
            elif "website" not in found and re.fullmatch(r"(?:https?://)?(?:www\.)?[\w-]+(?:\.[\w-]+)+(?:/\S*)?", part) and "@" not in part:
                found["website"] = re.sub(r"^https?://(www\.)?", "", part).rstrip("/")
    return found
