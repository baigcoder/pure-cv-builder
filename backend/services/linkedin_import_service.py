"""Parse a LinkedIn profile exported with "Save to PDF".

LinkedIn's export has a fixed shape: a side column (Contact, Top Skills,
Languages, Certifications, Honors-Awards), then the name, headline and
location, then Summary, Experience and Education. Roles can be grouped under
one company with a total duration line. This parser follows that shape and
returns editor CV data, or ``None`` when the text isn't a LinkedIn export.
"""

import re

MONTHS = {
    m: i
    for i, names in enumerate(
        [("january", "jan"), ("february", "feb"), ("march", "mar"), ("april", "apr"), ("may",), ("june", "jun"),
         ("july", "jul"), ("august", "aug"), ("september", "sep", "sept"), ("october", "oct"), ("november", "nov"),
         ("december", "dec")],
        start=1,
    )
    for m in names
}
_MONTH = r"(?:January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)"
DATE_LINE = re.compile(
    rf"^(?P<start>(?:{_MONTH}\s+)?\d{{4}})\s*[-–]\s*(?P<end>Present|(?:{_MONTH}\s+)?\d{{4}})(?:\s*\((?P<span>[^)]*)\))?$",
    re.IGNORECASE,
)
DURATION_LINE = re.compile(r"^\d+\s+(?:years?|yrs?)(?:\s+\d+\s+months?)?$|^\d+\s+months?$", re.IGNORECASE)
PAGE_LINE = re.compile(r"^Page\s+\d+\s+of\s+\d+$", re.IGNORECASE)
SIDEBAR_HEADINGS = {"contact", "top skills", "languages", "certifications", "honors-awards", "publications", "patents"}
MAIN_HEADINGS = {"summary", "experience", "education"}
BULLET = re.compile(r"^[•·\-▪●*]\s*")


def is_linkedin_export(text: str) -> bool:
    return (
        "linkedin.com/in/" in text.lower()
        and re.search(r"^\s*Experience\s*$", text, re.MULTILINE) is not None
        and (re.search(r"^\s*Top Skills\s*$", text, re.MULTILINE) is not None
             or re.search(r"^\s*Contact\s*$", text, re.MULTILINE) is not None)
    )


def _iso(value: str) -> str:
    value = value.strip()
    if value.lower() == "present":
        return "present"
    match = re.match(r"(?:([A-Za-z]+)\s+)?(\d{4})$", value)
    if not match:
        return value
    month = MONTHS.get((match.group(1) or "").lower())
    return f"{match.group(2)}-{month:02d}" if month else match.group(2)


def _lines(text: str) -> list[str]:
    out = []
    for raw in text.splitlines():
        line = re.sub(r"\s+", " ", raw).strip()
        if line and not PAGE_LINE.match(line):
            out.append(line)
    return out


def _sections(lines: list[str], headings: set[str]) -> dict[str, list[str]]:
    found: dict[str, list[str]] = {}
    current = None
    for line in lines:
        key = line.lower()
        if key in headings:
            current = key
            found.setdefault(current, [])
        elif current:
            found[current].append(line)
    return found


def _looks_like_location(line: str) -> bool:
    return len(line.split()) <= 8 and ("," in line or re.search(r"\b(Area|Remote|Hybrid|Region)\b", line) is not None)


def _looks_like_company(line: str) -> bool:
    """Company names are short labels, not sentences from the previous role's description."""
    return (
        bool(line)
        and len(line) <= 60
        and len(line.split()) <= 6
        and re.match(r"[A-Za-z0-9]", line) is not None
        and not line.endswith((".", ",", ";"))
        and not BULLET.match(line)
    )


def _paragraphs(lines: list[str]) -> tuple[str, list[str]]:
    """Description lines to (summary, bullets): bulleted lines become highlights, wrapped lines rejoin."""
    summary_parts: list[str] = []
    bullets: list[str] = []
    for line in lines:
        if BULLET.match(line):
            bullets.append(BULLET.sub("", line))
        elif bullets:
            bullets[-1] += " " + line
        else:
            summary_parts.append(line)
    return " ".join(summary_parts).strip(), [b.strip() for b in bullets if b.strip()]


def _parse_experience(lines: list[str]) -> list[dict]:
    dates = [i for i, line in enumerate(lines) if DATE_LINE.match(line)]
    entries: list[dict] = []
    starts: list[int] = []
    company = ""
    for d in dates:
        title = lines[d - 1] if d >= 1 else ""
        before = lines[d - 2] if d >= 2 else ""
        start = d - 1
        if DURATION_LINE.match(before) and d >= 3:
            company, start = lines[d - 3], d - 3
        elif _looks_like_company(before) and (not entries or d - 2 > dates[len(entries) - 1] + 1):
            company, start = before, d - 2
        starts.append(start)
        match = DATE_LINE.match(lines[d])
        entries.append({"company": company, "position": title, "start_date": _iso(match.group("start")), "end_date": _iso(match.group("end")), "_date_index": d})

    for index, entry in enumerate(entries):
        d = entry.pop("_date_index")
        end = starts[index + 1] if index + 1 < len(starts) else len(lines)
        body = lines[d + 1:end]
        if body and _looks_like_location(body[0]):
            entry["location"] = body.pop(0)
        summary, highlights = _paragraphs(body)
        entry["summary"] = summary
        entry["highlights"] = highlights
    return [e for e in entries if e["company"] or e["position"]]


def _parse_education(lines: list[str]) -> list[dict]:
    entries: list[dict] = []
    i = 0
    while i < len(lines):
        school = lines[i]
        detail = lines[i + 1] if i + 1 < len(lines) else ""
        if "·" in detail or re.search(r"\(\s*\d{4}", detail):
            text, _, when = detail.partition("·")
            years = re.search(r"\(([^)]*)\)", when or detail)
            degree_text = text.strip().rstrip(",")
            degree, _, area = degree_text.partition(",")
            short = re.search(r"-\s*([A-Z][A-Za-z.]{1,8})$", degree.strip())
            entry = {"institution": school, "degree": (short.group(1) if short else degree).strip(), "area": area.strip()}
            if years:
                span = re.split(r"\s*[-–]\s*", years.group(1).strip())
                entry["start_date"] = _iso(span[0]) if span and span[0] else ""
                entry["end_date"] = _iso(span[1]) if len(span) > 1 else ""
            entries.append(entry)
            i += 2
        else:
            entries.append({"institution": school})
            i += 1
    return entries


def parse_linkedin(text: str) -> dict | None:
    if not is_linkedin_export(text):
        return None
    lines = _lines(text)
    lowered = [line.lower() for line in lines]
    anchor_key = "summary" if "summary" in lowered else "experience"
    anchor = lowered.index(anchor_key)

    # Name, headline and location sit just above the first main heading; the headline may wrap.
    header = lines[max(0, anchor - 4):anchor]
    location = header[-1] if header and _looks_like_location(header[-1]) else ""
    rest = header[:-1] if location else header
    # The name sits directly above the headline (which may wrap), so search upwards from there.
    name_like = re.compile(r"[A-Z][\w'.\-]*(?: [A-Z][\w'.\-]*){1,3}")
    name_index = next(
        (i for i in range(len(rest) - 2, -1, -1) if name_like.fullmatch(rest[i]) and rest[i].lower() not in SIDEBAR_HEADINGS),
        max(0, len(rest) - 2),
    )
    name = rest[name_index] if rest else ""
    headline = " ".join(rest[name_index + 1:])

    sidebar_end = max(0, anchor - len(header) + name_index) if rest else anchor
    side = _sections(lines[:sidebar_end], SIDEBAR_HEADINGS)
    main = _sections(lines[anchor:], MAIN_HEADINGS)

    contact_text = " ".join(side.get("contact", []))
    email = re.search(r"[\w.+-]+@[\w-]+\.[\w.-]+", contact_text)
    linkedin = re.search(r"linkedin\.com/in/([A-Za-z0-9_-]+)", contact_text)
    phone = re.search(r"\+?\d[\d\s().-]{7,}\d", contact_text)
    websites = [
        url for url in re.findall(r"(?:https?://)?(?:www\.)?[\w-]+\.[a-z]{2,}(?:/[\w./-]*)?", contact_text)
        if "linkedin.com" not in url and "@" not in url and email and url not in email.group(0)
    ]

    skills = []
    if side.get("top skills"):
        skills.append({"label": "Top skills", "details": ", ".join(side["top skills"])})
    if side.get("languages"):
        skills.append({"label": "Languages", "details": ", ".join(side["languages"])})
    honors = [{"bullet": f"Certification: {line}"} for line in side.get("certifications", [])]
    honors += [{"bullet": line} for line in side.get("honors-awards", [])]

    return {
        "name": name,
        "headline": headline,
        "location": location,
        "email": email.group(0) if email else "",
        "phone": phone.group(0).strip() if phone else "",
        "linkedin": linkedin.group(1) if linkedin else "",
        "website": websites[0] if websites else "",
        "summary": " ".join(main.get("summary", [])),
        "experience": _parse_experience(main.get("experience", [])),
        "education": _parse_education(main.get("education", [])),
        "skills": skills,
        "honors": honors,
    }
