"""Compare a CV with a job post: keyword coverage, gaps, and where to fix them.

Deterministic and offline, so it works without an AI provider and gives the
same answer every time. Keywords come from the curated lexicon in
``skills_lexicon``; job-post lines under "requirements" headings weigh more
than lines under "nice to have" headings.
"""

import re
from dataclasses import dataclass, field
from datetime import date
from functools import lru_cache
from typing import Literal

from services.skills_lexicon import AMBIGUOUS_ALIASES, IMPLIES, SKILLS, SkillCategory

Importance = Literal["required", "core", "preferred"]
Section = Literal["summary", "headline", "skills", "experience", "projects", "education", "other"]

IMPORTANCE_WEIGHT: dict[Importance, int] = {"required": 3, "core": 2, "preferred": 1}

# Canonical names that are also single letters or English words; only their
# explicit aliases (e.g. "golang", "c++") count.
ALIAS_ONLY = {"Go", "C", "R"}

REQUIRED_HEADINGS = re.compile(
    r"\b(requirements?|required|must[- ]haves?|qualifications|what you(?:'ll)? (?:need|bring)|"
    r"you (?:have|bring|should have)|minimum|basic qualifications|who you are|skills)\b",
    re.IGNORECASE,
)
PREFERRED_HEADINGS = re.compile(
    r"\b(nice[- ]to[- ]haves?|preferred|bonus|plus|desirable|good to have|ideally|extra credit)\b",
    re.IGNORECASE,
)
NEUTRAL_HEADINGS = re.compile(
    r"\b(about (?:us|the (?:company|team|role))|responsibilities|what you(?:'ll)? do|the role|benefits|perks|why join)\b",
    re.IGNORECASE,
)
YEARS_PATTERN = re.compile(r"(\d{1,2})\s*\+?\s*(?:-\s*\d{1,2}\s*)?(?:years?|yrs?)\b", re.IGNORECASE)


@dataclass
class KeywordResult:
    keyword: str
    category: SkillCategory
    importance: Importance
    mentions: int
    found_in: list[Section] = field(default_factory=list)
    suggestion: str = ""


@dataclass
class JobMatch:
    score: int
    matched: list[KeywordResult]
    missing: list[KeywordResult]
    years_required: int | None
    title_match: bool
    target_title: str
    summary: str
    # How the score is made up, so the user can see what to improve.
    skills_coverage: int = 0
    required_matched: int = 0
    required_total: int = 0
    cv_years: float | None = None
    seniority_required: str | None = None
    seniority_cv: str | None = None


SENIORITY_LEVELS = [
    ("intern", r"\b(intern|internship|trainee|apprentice)\b"),
    ("junior", r"\b(junior|jr\.?|entry[- ]level|graduate|associate)\b"),
    ("mid", r"\b(mid[- ]level|intermediate)\b"),
    ("senior", r"\b(senior|sr\.?)\b"),
    ("lead", r"\b(lead|staff|principal|head of|manager|director|architect)\b"),
]


def _seniority(text: str) -> str | None:
    """The highest level named in the text, if any."""
    found = [level for level, pattern in SENIORITY_LEVELS if re.search(pattern, text, re.IGNORECASE)]
    return found[-1] if found else None


def cv_years_of_experience(cv_data: dict, today: date | None = None) -> float | None:
    """Total years across dated roles, counting overlapping periods once."""
    today = today or date.today()
    spans = []
    for entry in cv_data.get("experience") or []:
        if not isinstance(entry, dict):
            continue
        start = _month_index(str(entry.get("start_date") or ""), today)
        end = _month_index(str(entry.get("end_date") or "present"), today)
        if start is not None and end is not None and end >= start:
            spans.append((start, end))
    if not spans:
        return None
    total, current_start, current_end = 0, *sorted(spans)[0]
    for start, end in sorted(spans)[1:]:
        if start > current_end:
            total += current_end - current_start
            current_start, current_end = start, end
        else:
            current_end = max(current_end, end)
    total += current_end - current_start
    return round(total / 12, 1)


def _month_index(value: str, today: date) -> int | None:
    value = value.strip().lower()
    if value in ("present", "current", "now"):
        return today.year * 12 + today.month
    match = re.match(r"^(\d{4})(?:-(\d{2}))?", value)
    if not match:
        return None
    return int(match.group(1)) * 12 + int(match.group(2) or 1)


def _alias_pattern(alias: str) -> str:
    """Regex for one alias. Longer plain words also match common inflections
    ("mentor" -> "mentored", "microservice" -> "microservices")."""
    escaped = re.escape(alias)
    if alias.isalpha() and len(alias) >= 5:
        escaped += r"(?:s|es|ed|d|ing)?"
    return escaped


@lru_cache(maxsize=1)
def _matchers() -> tuple[re.Pattern[str], re.Pattern[str], dict[str, str]]:
    """One case-insensitive and one case-sensitive regex over every alias.

    Alternatives are ordered longest first and matched in a single pass, so
    "react native" is React Native (not also React) and "node.js" counts once.
    Returns the two patterns plus a lookup from matched text to canonical name.
    """
    insensitive: dict[str, str] = {}
    sensitive: dict[str, str] = {}
    for canonical, (_, aliases) in SKILLS.items():
        terms = set(aliases)
        if canonical not in ALIAS_ONLY:
            terms.add(canonical.lower())
        for term in terms:
            if term in AMBIGUOUS_ALIASES:
                for variant in (term.capitalize(), term.upper()):
                    sensitive[variant] = canonical
            else:
                insensitive[term] = canonical

    def build(terms: dict[str, str], flags: int) -> re.Pattern[str]:
        ordered = sorted(terms, key=len, reverse=True)
        # Custom boundaries: "C++", ".NET" and "CI/CD" end in non-word characters.
        groups = "|".join(f"(?P<g{index}>{_alias_pattern(term)})" for index, term in enumerate(ordered))
        return re.compile(rf"(?<![\w+#.])(?:{groups})(?![\w+#])", flags), ordered

    insensitive_pattern, insensitive_order = build(insensitive, re.IGNORECASE)
    sensitive_pattern, sensitive_order = build(sensitive, 0)
    lookup = {f"i{index}": insensitive[term] for index, term in enumerate(insensitive_order)}
    lookup.update({f"s{index}": sensitive[term] for index, term in enumerate(sensitive_order)})
    return insensitive_pattern, sensitive_pattern, lookup


def find_skills(text: str) -> dict[str, int]:
    """Canonical skill -> number of mentions in ``text``."""
    insensitive, sensitive, lookup = _matchers()
    spans: list[tuple[int, int, str]] = []
    for prefix, pattern in (("i", insensitive), ("s", sensitive)):
        for match in pattern.finditer(text):
            group = match.lastgroup or ""
            spans.append((match.start(), match.end(), lookup[prefix + group[1:]]))
    # Where the two passes overlap, keep the longer match.
    spans.sort(key=lambda span: (span[0], -(span[1] - span[0])))
    counts: dict[str, int] = {}
    last_end = -1
    for start, end, canonical in spans:
        if start < last_end:
            continue
        counts[canonical] = counts.get(canonical, 0) + 1
        last_end = end
    for skill, broader in IMPLIES.items():
        if skill in counts:
            counts[broader] = counts.get(broader, 0) + counts[skill]
    return counts


def _classify_lines(job_description: str) -> list[tuple[str, Importance]]:
    """Tag each job-post line by the heading it falls under."""
    current: Importance = "core"
    tagged: list[tuple[str, Importance]] = []
    for raw in job_description.splitlines():
        line = raw.strip()
        if not line:
            continue
        is_bullet = bool(re.match(r"^([-*•·▪◦]|\d+[.)])\s", line))
        is_heading = not is_bullet and len(line) <= 60 and (
            line.endswith(":")
            or (len(line.split()) <= 5 and "," not in line and not re.search(r"[.!?]$", line))
        )
        if is_heading:
            if PREFERRED_HEADINGS.search(line):
                current = "preferred"
            elif REQUIRED_HEADINGS.search(line):
                current = "required"
            elif NEUTRAL_HEADINGS.search(line):
                current = "core"
        importance = current
        # Inline cues override the section ("Kubernetes is a plus").
        if PREFERRED_HEADINGS.search(line) and not is_heading:
            importance = "preferred"
        elif re.search(r"\b(must|required|requirement|strong)\b", line, re.IGNORECASE) and not is_heading:
            importance = "required"
        tagged.append((line, importance))
    return tagged


def _job_keywords(job_description: str) -> dict[str, tuple[Importance, int]]:
    """Canonical skill -> (highest importance seen, total mentions)."""
    rank = {"preferred": 0, "core": 1, "required": 2}
    keywords: dict[str, tuple[Importance, int]] = {}
    for line, importance in _classify_lines(job_description):
        for skill, hits in find_skills(line).items():
            previous = keywords.get(skill)
            if previous is None:
                keywords[skill] = (importance, hits)
            else:
                best = importance if rank[importance] > rank[previous[0]] else previous[0]
                keywords[skill] = (best, previous[1] + hits)
    return keywords


def _cv_sections(cv_data: dict) -> dict[Section, str]:
    def join(entries: list, fields: tuple[str, ...]) -> str:
        parts: list[str] = []
        for entry in entries or []:
            if not isinstance(entry, dict):
                continue
            for name in fields:
                value = entry.get(name)
                if isinstance(value, list):
                    parts.extend(str(item) for item in value)
                elif value:
                    parts.append(str(value))
        return "\n".join(parts)

    return {
        "headline": str(cv_data.get("headline") or ""),
        "summary": str(cv_data.get("summary") or ""),
        "skills": join(cv_data.get("skills"), ("label", "details")),
        "experience": join(cv_data.get("experience"), ("position", "company", "summary", "highlights")),
        "projects": join(cv_data.get("projects"), ("name", "summary", "highlights")),
        "education": join(cv_data.get("education"), ("area", "degree", "summary", "highlights")),
        "other": join(cv_data.get("honors"), ("bullet",)) + "\n" + join(cv_data.get("publications"), ("title", "journal")),
    }


def _suggestion(keyword: str, category: SkillCategory, has_experience: bool) -> str:
    if category == "soft":
        return f"Show {keyword.lower()} in a bullet with a concrete example, or mention it in your summary."
    if category in {"practice"}:
        return f"Describe where you applied {keyword} in an experience or project bullet."
    if has_experience:
        return f"If you've used {keyword}, add it to Skills and name it in the bullet where you used it."
    return f"If you've used {keyword}, add it to Skills and to a project that used it."


def _title_words(title: str) -> set[str]:
    stop = {"senior", "junior", "lead", "staff", "principal", "sr", "jr", "the", "a", "an", "of", "and", "i", "ii", "iii"}
    return {word for word in re.findall(r"[a-z+#.]+", title.lower()) if word not in stop and len(word) > 1}


def analyze(cv_data: dict, job_description: str, target_role: str = "") -> JobMatch:
    job_keywords = _job_keywords(job_description)
    sections = _cv_sections(cv_data)
    found_by_section = {name: find_skills(text) for name, text in sections.items()}
    has_experience = bool(sections["experience"].strip())

    matched: list[KeywordResult] = []
    missing: list[KeywordResult] = []
    for skill, (importance, mentions) in job_keywords.items():
        category = SKILLS[skill][0]
        found_in = [name for name, found in found_by_section.items() if skill in found]
        result = KeywordResult(skill, category, importance, mentions, found_in)
        if found_in:
            matched.append(result)
        else:
            result.suggestion = _suggestion(skill, category, has_experience)
            missing.append(result)

    def weight(item: KeywordResult) -> float:
        # Repeated mentions signal emphasis, with diminishing returns.
        return IMPORTANCE_WEIGHT[item.importance] * (1 + min(item.mentions - 1, 2) * 0.25)

    total = sum(weight(item) for item in matched + missing)
    earned = sum(weight(item) for item in matched)
    # Keywords only in the Skills list count a little less than ones shown in context.
    earned -= sum(weight(item) * 0.15 for item in matched if item.found_in == ["skills"])
    coverage = earned / total if total else 0.0

    target_title = target_role.strip() or _guess_title(job_description)
    title_words = _title_words(target_title)
    title_match = bool(title_words) and title_words <= _title_words(
        f"{sections['headline']} {' '.join(str(e.get('position', '')) for e in cv_data.get('experience') or [] if isinstance(e, dict))}"
    )

    years = [int(match) for match in YEARS_PATTERN.findall(job_description)]
    years_required = max(years) if years else None
    cv_years = cv_years_of_experience(cv_data)
    # Experience counts for 10 points: full when the post names no minimum or the CV meets it.
    if years_required is None:
        experience_points = 10.0
    else:
        experience_points = 10.0 * min(1.0, (cv_years or 0) / years_required)
    title_points = 10 if title_match else 0
    score = round(coverage * 80 + title_points + experience_points) if total else round(title_points + experience_points)
    required = [item for item in matched + missing if item.importance == "required"]
    latest_title = next(
        (str(e.get("position", "")) for e in cv_data.get("experience") or [] if isinstance(e, dict) and e.get("position")),
        "",
    )

    order = {"required": 0, "core": 1, "preferred": 2}
    sort_key = lambda item: (order[item.importance], -item.mentions, item.keyword.lower())  # noqa: E731
    matched.sort(key=sort_key)
    missing.sort(key=sort_key)

    return JobMatch(
        score=max(0, min(100, score)),
        matched=matched,
        missing=missing,
        years_required=years_required,
        title_match=title_match,
        target_title=target_title,
        summary=_summary(len(matched), len(missing), missing, total),
        skills_coverage=round(coverage * 100),
        required_matched=sum(1 for item in required if item in matched),
        required_total=len(required),
        cv_years=cv_years,
        seniority_required=_seniority(target_title) or _seniority(job_description[:400]),
        seniority_cv=_seniority(f"{sections['headline']} {latest_title}"),
    )


def _guess_title(job_description: str) -> str:
    for line in job_description.splitlines():
        line = line.strip(" -:*#\t")
        if 2 <= len(line.split()) <= 7 and re.search(
            r"\b(engineer|developer|designer|manager|analyst|scientist|architect|lead|specialist|consultant)\b",
            line,
            re.IGNORECASE,
        ):
            return line
    return ""


def _summary(matched: int, missing: int, missing_items: list[KeywordResult], total: float) -> str:
    if not total:
        return "No recognisable skills found in this job post yet. Paste the full requirements section."
    required_gaps = [item.keyword for item in missing_items if item.importance == "required"]
    if not missing:
        return f"Strong match: all {matched} job keywords appear in your CV."
    if required_gaps:
        shown = ", ".join(required_gaps[:3])
        return f"Covers {matched} of {matched + missing} job keywords. Missing required: {shown}."
    return f"Covers {matched} of {matched + missing} job keywords. Remaining gaps are lower priority."
