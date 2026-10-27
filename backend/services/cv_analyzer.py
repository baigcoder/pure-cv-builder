"""Review a CV the way a recruiter and an applicant tracking system would.

Four checks, all offline and deterministic:

* **Read-back** renders the CV to PDF, reads it back with the same parser the
  importer uses, and compares field by field: what a text-based ATS would see.
* **Writing** flags weak openings, first person, passive voice, filler, overlong
  or very short bullets, wrong tense for past roles and repeated opening verbs.
* **Consistency** flags missing or reversed dates, employment gaps, overlaps,
  out-of-order roles, mixed date precision and duplicate skills.
* **Page fit** measures how full the last page is, to catch a CV that spills
  onto another page by a few lines.

Issues carry a location so the editor can jump to them, and some carry a
ready-made fix the user can apply in one click.
"""

import re
from dataclasses import asdict, dataclass, field
from datetime import date
from typing import Any

import fitz

from services.cv_service import CVService
from services.pdf_extract_service import PDFExtractService
from services.rewrite_service import FILLER, WEAK_OPENERS, _stronger

FIRST_PERSON = re.compile(r"\b(I|I'm|I've|me|my|we|our|us)\b")
PASSIVE = re.compile(r"\b(was|were|been|being|is|are)\s+(\w+ed|built|made|done|given|led|run|written|taken|shown)\b", re.I)
# Base-form verbs that read as present tense at the start of a bullet.
PRESENT_VERBS = {
    "lead", "manage", "build", "develop", "design", "create", "own", "drive", "work", "help", "support", "maintain",
    "implement", "write", "run", "deliver", "coordinate", "handle", "oversee", "analyze", "analyse", "test", "deploy",
    "mentor", "train", "plan", "organize", "organise", "prepare", "review", "improve", "reduce", "increase", "launch",
    "collaborate", "communicate", "ensure", "provide", "conduct", "assist", "research", "monitor", "optimize", "optimise",
}
NUMBER = re.compile(r"\d")
MONTHS = re.compile(r"^(\d{4})(?:-(\d{2}))?")


@dataclass
class Issue:
    id: str
    severity: str  # "high" | "medium" | "low"
    category: str  # "parse" | "writing" | "consistency" | "layout"
    message: str
    detail: str = ""
    section: str = ""
    entry_index: int | None = None
    bullet_index: int | None = None
    quote: str = ""
    fix: str = ""  # replacement text for the quoted bullet, when one is safe to offer


@dataclass
class FieldCheck:
    label: str
    expected: str
    read: str
    ok: bool


@dataclass
class Analysis:
    read_back: list[FieldCheck] = field(default_factory=list)
    issues: list[Issue] = field(default_factory=list)
    page_count: int = 0
    last_page_fill: float = 0.0

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def _s(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()


def _norm(value: str) -> str:
    return re.sub(r"[^a-z0-9@.+]", "", value.lower())


def _ym(value: str) -> tuple[int, int] | None:
    """'2021-03' -> (2021, 3); '2021' -> (2021, 1); 'present' -> today."""
    value = _s(value).lower()
    if value in ("present", "current", "now"):
        today = date.today()
        return today.year, today.month
    match = MONTHS.match(value)
    if not match:
        return None
    return int(match.group(1)), int(match.group(2) or 1)


def _months(a: tuple[int, int], b: tuple[int, int]) -> int:
    return (b[0] - a[0]) * 12 + (b[1] - a[1])


def _entries(cv: dict, section: str) -> list[dict]:
    return [e for e in cv.get(section) or [] if isinstance(e, dict)]


def _bullets(entry: dict) -> list[str]:
    return [_s(b) for b in entry.get("highlights") or [] if _s(b)]


# ---------------------------------------------------------------- read-back


def _read_back(cv: dict, extracted: dict) -> tuple[list[FieldCheck], list[Issue]]:
    checks: list[FieldCheck] = []
    issues: list[Issue] = []

    def add(label: str, expected: str, read: str, *, compare=None, section: str = "", entry: int | None = None) -> None:
        if not expected:
            return
        ok = compare(expected, read) if compare else _norm(expected) == _norm(read)
        checks.append(FieldCheck(label, expected, read, ok))
        if not ok:
            issues.append(Issue(
                id=f"parse-{len(issues)}",
                severity="high" if label in ("Name", "Email") or label.endswith("dates") else "medium",
                category="parse",
                message=f"An ATS may not read your {label.lower()} correctly",
                detail=f"Read back as “{read or 'nothing'}” instead of “{expected}”.",
                section=section,
                entry_index=entry,
            ))

    digits = lambda a, b: re.sub(r"\D", "", a)[-9:] == re.sub(r"\D", "", b)[-9:]  # noqa: E731
    add("Name", _s(cv.get("name")), _s(extracted.get("name")), section="profile")
    add("Email", _s(cv.get("email")), _s(extracted.get("email")), section="profile")
    add("Phone", _s(cv.get("phone")), _s(extracted.get("phone")), compare=digits, section="profile")
    add("Location", _s(cv.get("location")), _s(extracted.get("location")), section="profile")
    for key, label in (("linkedin", "LinkedIn"), ("github", "GitHub"), ("website", "Website")):
        add(label, _s(cv.get(key)), _s(extracted.get(key)), compare=lambda a, b: _norm(a).rstrip("/") in _norm(b) or _norm(b) in _norm(a) and bool(b), section="profile")

    got_jobs = _entries(extracted, "experience")
    for index, job in enumerate(_entries(cv, "experience")):
        read = got_jobs[index] if index < len(got_jobs) else {}
        who = _s(job.get("company")) or _s(job.get("position")) or f"role {index + 1}"
        add(f"{who}: company", _s(job.get("company")), _s(read.get("company")), section="experience", entry=index)
        add(f"{who}: job title", _s(job.get("position")), _s(read.get("position")), section="experience", entry=index)
        start = _s(job.get("start_date"))
        if start:
            add(f"{who}: dates", start[:7], _s(read.get("start_date"))[:7], compare=lambda a, b: a[:4] == b[:4] and (len(a) < 7 or a == b), section="experience", entry=index)
        expected_bullets = len(_bullets(job))
        if expected_bullets:
            add(f"{who}: bullet points", str(expected_bullets), str(len(read.get("highlights") or [])), section="experience", entry=index)

    got_schools = _entries(extracted, "education")
    for index, school in enumerate(_entries(cv, "education")):
        read = got_schools[index] if index < len(got_schools) else {}
        add(f"{_s(school.get('institution')) or 'School'}: school", _s(school.get("institution")), _s(read.get("institution")), section="education", entry=index)

    skills = [s for s in _entries(cv, "skills") if _s(s.get("details"))]
    if skills:
        add("Skills groups", str(len(skills)), str(len(_entries(extracted, "skills"))), section="skills")
    return checks, issues


# ---------------------------------------------------------------- writing


def _writing(cv: dict) -> list[Issue]:
    issues: list[Issue] = []

    def issue(**kwargs) -> None:
        issues.append(Issue(id=f"writing-{len(issues)}", category="writing", **kwargs))

    summary = _s(cv.get("summary"))
    if summary:
        words = len(summary.split())
        if words > 100:
            issue(severity="low", message="Summary is long", detail=f"{words} words. Two or three sentences (40 to 80 words) read best.", section="profile")
        if FIRST_PERSON.search(summary):
            issue(severity="low", message="Summary uses first person", detail="CVs usually drop “I” and “my”: “Built...” rather than “I built...”.", section="profile")

    openers: dict[str, list[tuple[str, int, int]]] = {}
    for section in ("experience", "projects"):
        for entry_index, entry in enumerate(_entries(cv, section)):
            past_role = section == "experience" and _s(entry.get("end_date")).lower() not in ("present", "current", "now", "")
            bullets = _bullets(entry)
            for bullet_index, bullet in enumerate(bullets):
                where = {"section": section, "entry_index": entry_index, "bullet_index": bullet_index, "quote": bullet}
                lower = bullet.lower()
                words = bullet.split()
                first = re.sub(r"[^a-z]", "", words[0].lower()) if words else ""
                openers.setdefault(first, []).append((section, entry_index, bullet_index))

                weak = next((w for w, _ in WEAK_OPENERS if lower.startswith(w + " ")), None)
                if weak:
                    issue(severity="medium", message=f"Weak opening: “{weak}”", detail="Lead with a precise action verb.", fix=_stronger(bullet), **where)
                elif past_role and first in PRESENT_VERBS:
                    fixed = _past_tense(words[0]) + bullet[len(words[0]):]
                    issue(severity="medium", message="Present tense in a past role", detail="Use past tense for roles you've left.", fix=fixed if fixed != bullet else "", **where)
                if FIRST_PERSON.search(bullet):
                    issue(severity="medium", message="First person in a bullet", detail="Start with the verb instead of “I” or “we”.", **where)
                if len(words) > 32:
                    issue(severity="medium", message="Bullet is too long", detail=f"{len(words)} words. Aim for one line or two, under about 30 words.", **where)
                elif len(words) < 5:
                    issue(severity="low", message="Bullet is very short", detail="Say what you did and what changed because of it.", **where)
                if PASSIVE.search(bullet):
                    issue(severity="low", message="Passive voice", detail="Say who did it: “Reduced costs”, not “Costs were reduced”.", **where)
                filler = next((m.group(0) for pattern, _ in FILLER if (m := re.search(pattern, bullet, re.I))), None)
                if filler:
                    issue(severity="low", message=f"Filler: “{filler.strip()}”", detail="Cut it; the sentence is stronger without.", **where)

            if section == "experience" and len(bullets) >= 2 and not any(NUMBER.search(b) for b in bullets):
                who = _s(entry.get("company")) or _s(entry.get("position"))
                issue(severity="low", message=f"No numbers in {who or 'this role'}", detail="Add at least one measurable result: a percentage, amount, team size or time saved.", section=section, entry_index=entry_index)

    for verb, places in openers.items():
        if verb and len(places) >= 3:
            issue(severity="low", message=f"“{verb.capitalize()}” starts {len(places)} bullets", detail="Vary your opening verbs so each achievement stands out.", section=places[0][0], entry_index=places[0][1])
    return issues


def _past_tense(verb: str) -> str:
    irregular = {"lead": "led", "build": "built", "write": "wrote", "run": "ran", "drive": "drove", "oversee": "oversaw", "make": "made", "own": "owned"}
    base = verb.lower()
    if base in irregular:
        word = irregular[base]
    elif base.endswith("e"):
        word = base + "d"
    elif base.endswith("y") and base[-2:-1] not in "aeiou":
        word = base[:-1] + "ied"
    else:
        word = base + "ed"
    return word.capitalize() if verb[:1].isupper() else word


# ---------------------------------------------------------------- consistency


def _consistency(cv: dict) -> list[Issue]:
    issues: list[Issue] = []

    def issue(**kwargs) -> None:
        issues.append(Issue(id=f"consistency-{len(issues)}", category="consistency", **kwargs))

    jobs = _entries(cv, "experience")
    spans = []
    precisions = set()
    for index, job in enumerate(jobs):
        who = _s(job.get("company")) or _s(job.get("position")) or f"Role {index + 1}"
        start, end = _ym(job.get("start_date") or job.get("date")), _ym(job.get("end_date") or "present")
        raw_start = _s(job.get("start_date"))
        if raw_start:
            precisions.add("month" if re.match(r"^\d{4}-\d{2}", raw_start) else "year")
        if not start:
            issue(severity="medium", message=f"{who} has no start date", detail="Recruiters and ATS filters look for dates on every role.", section="experience", entry_index=index)
            continue
        if end and _months(start, end) < 0:
            issue(severity="high", message=f"{who} ends before it starts", detail="Check the start and end dates.", section="experience", entry_index=index)
            continue
        spans.append((start, end or start, index, who))

    for (a, b) in zip(spans, spans[1:]):
        if _months(a[0], b[0]) > 0:
            issue(severity="medium", message="Roles aren't in reverse date order", detail=f"{b[3]} started after {a[3]} but is listed below it. Put the most recent role first.", section="experience", entry_index=b[2])
            break

    ordered = sorted(spans, key=lambda s: s[0])
    for earlier, later in zip(ordered, ordered[1:]):
        gap = _months(earlier[1], later[0])
        if gap > 6:
            issue(severity="low", message=f"{gap}-month gap before {later[3]}", detail="Gaps are fine; a short line explaining them (study, travel, caring) can help.", section="experience", entry_index=later[2])
        elif gap < -2 and _s(jobs[earlier[2]].get("end_date")).lower() != "present":
            issue(severity="low", message=f"{earlier[3]} and {later[3]} overlap", detail="If they ran in parallel, that's fine; otherwise check the dates.", section="experience", entry_index=later[2])

    if len(precisions) > 1:
        issue(severity="low", message="Mixed date formats", detail="Some roles have month and year, others only the year. Use the same precision throughout.", section="experience")

    seen: dict[str, str] = {}
    for entry in _entries(cv, "skills"):
        for skill in re.split(r"[,;/|]", _s(entry.get("details"))):
            key = skill.strip().lower()
            if not key:
                continue
            if key in seen and seen[key] != _s(entry.get("label")):
                issue(severity="low", message=f"“{skill.strip()}” is listed twice", detail=f"It appears under both {seen[key] or 'one group'} and {_s(entry.get('label')) or 'another'}.", section="skills")
            seen.setdefault(key, _s(entry.get("label")))

    endings = [b.endswith(".") for section in ("experience", "projects") for e in _entries(cv, section) for b in _bullets(e)]
    if endings and 0 < sum(endings) < len(endings):
        issue(severity="low", message="Some bullets end with a full stop and some don't", detail="Pick one style and use it for every bullet.", section="experience")
    return issues


# ---------------------------------------------------------------- page fit


def _page_fit(pdf: bytes) -> tuple[int, float, list[Issue]]:
    with fitz.open(stream=pdf, filetype="pdf") as doc:
        pages = doc.page_count
        last = doc[pages - 1]
        blocks = [b for b in last.get_text("blocks") if b[4].strip()]
        # Ignore a footer line (page number) at the very bottom.
        content = [b for b in blocks if b[3] < last.rect.height * 0.94] or blocks
        bottom = max((b[3] for b in content), default=0)
        top_margin = min((b[1] for b in content), default=0)
        fill = max(0.0, min(1.0, (bottom - top_margin) / max(1.0, last.rect.height - 2 * top_margin)))
    issues = []
    if pages >= 2 and fill < 0.2:
        issues.append(Issue(
            id="layout-0",
            severity="medium",
            category="layout",
            message=f"Page {pages} is almost empty",
            detail="Your CV spills onto another page by a few lines. Cut a bullet, shorten the summary, or reduce the margins or font size in Design.",
            section="design",
        ))
    elif pages > 2:
        issues.append(Issue(
            id="layout-1",
            severity="low",
            category="layout",
            message=f"{pages} pages long",
            detail="Most roles expect one or two pages. Long academic CVs are the exception.",
            section="design",
        ))
    return pages, round(fill, 2), issues


SEVERITY_ORDER = {"high": 0, "medium": 1, "low": 2}


def analyze(cv_data: dict, theme: str = "folio", design_settings: dict | None = None, section_order: list[str] | None = None) -> Analysis:
    pdf, _ = CVService.render_cv(cv_data=cv_data, output_format="pdf", theme=theme, design_settings=design_settings, section_order=section_order)
    extracted = PDFExtractService.extract_from_pdf(pdf)["cv_data"]
    read_back, parse_issues = _read_back(cv_data, extracted)
    pages, fill, layout_issues = _page_fit(pdf)
    issues = parse_issues + _writing(cv_data) + _consistency(cv_data) + layout_issues
    issues.sort(key=lambda i: SEVERITY_ORDER[i.severity])
    return Analysis(read_back=read_back, issues=issues, page_count=pages, last_page_fill=fill)
