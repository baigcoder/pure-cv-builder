"""Turn resume text into structured CV data with an AI provider, safely.

The heuristic parser always runs first and is the fallback. AI output is
validated against the CV schema and then *grounded*: every entry's anchor
(company, institution, project or publication title) and every contact
detail must appear in the PDF text, so hallucinated jobs, schools or emails
are dropped rather than imported.
"""

import json
import logging
import re
from dataclasses import dataclass, field
from typing import Any

from pydantic import ValidationError

from schemas.cv import CVData
from services.ai_service import AIService, parse_json_object

logger = logging.getLogger(__name__)

MAX_TEXT_CHARS = 14000
IMPORT_TIMEOUT_SECONDS = 60

SCALAR_FIELDS = ("name", "headline", "email", "phone", "location", "website", "linkedin", "github", "summary")
# Field that must appear in the source text for an entry to be kept.
ANCHORS = {
    "experience": ("company", "position"),
    "education": ("institution",),
    "projects": ("name",),
    "publications": ("title",),
    "honors": ("bullet",),
    "skills": ("details",),
}

SYSTEM_PROMPT = (
    "You convert resume text into JSON. Copy facts exactly as written. "
    "Never invent, infer, or embellish content. Return JSON only."
)


@dataclass
class ImportResult:
    cv_data: dict[str, Any]
    source: str  # "ai" | "heuristic"
    warnings: list[str] = field(default_factory=list)


def _normalize(text: str) -> str:
    return re.sub(r"[^a-z0-9@+#.]+", " ", text.lower()).strip()


def _grounded(value: str, haystack: str) -> bool:
    """True when ``value`` (normalised) occurs in the source text."""
    needle = _normalize(value)
    if not needle:
        return False
    if needle in haystack:
        return True
    # Tolerate line breaks or punctuation splitting a long phrase: require
    # every significant word to appear.
    words = [word for word in needle.split() if len(word) > 2]
    return len(words) >= 2 and all(f" {word} " in f" {haystack} " for word in words)


def _prompt(raw_text: str) -> str:
    schema = {
        "name": "", "headline": "", "email": "", "phone": "", "location": "",
        "website": "", "linkedin": "username only", "github": "username only", "summary": "",
        "experience": [{"company": "", "position": "", "start_date": "YYYY-MM", "end_date": "YYYY-MM or present",
                        "location": "", "summary": "", "highlights": [""]}],
        "education": [{"institution": "", "area": "field of study", "degree": "", "start_date": "", "end_date": "",
                       "location": "", "highlights": [""]}],
        "skills": [{"label": "category", "details": "comma-separated skills"}],
        "projects": [{"name": "", "start_date": "", "end_date": "", "url": "", "summary": "", "highlights": [""]}],
        "publications": [{"title": "", "authors": ["Name"], "journal": "", "date": "", "doi": "", "url": ""}],
        "honors": [{"bullet": "award or certification, issuer, year"}],
    }
    return f"""Extract this resume into JSON with exactly this shape:
{json.dumps(schema, indent=2)}

Rules:
- Copy names, companies, schools, titles and bullet text verbatim. Do not rewrite or improve wording.
- Leave a field empty if it is not in the resume. Do not guess dates, emails, or links.
- Dates as YYYY-MM when month is known, otherwise YYYY. Use "present" for current roles.
- One highlights item per bullet point in the resume.

Resume text:
\"\"\"
{raw_text[:MAX_TEXT_CHARS]}
\"\"\"
"""


def _ground(ai_cv: dict[str, Any], heuristic: dict[str, Any], raw_text: str) -> tuple[dict[str, Any], list[str]]:
    haystack = _normalize(raw_text)
    merged: dict[str, Any] = dict(heuristic)
    warnings: list[str] = []

    for name in SCALAR_FIELDS:
        value = str(ai_cv.get(name) or "").strip()
        if not value:
            continue
        # Free text is allowed to differ slightly; identifiers must match.
        if name in {"summary", "headline", "location"} or _grounded(value, haystack):
            merged[name] = value

    for section, anchors in ANCHORS.items():
        entries = ai_cv.get(section) or []
        kept = []
        for entry in entries:
            anchor = next((str(entry.get(key) or "") for key in anchors if str(entry.get(key) or "").strip()), "")
            if anchor and _grounded(anchor, haystack):
                if isinstance(entry.get("highlights"), list):
                    bullets = [item for item in entry["highlights"] if _grounded(str(item), haystack)]
                    if len(bullets) < len(entry["highlights"]):
                        warnings.append(f"Skipped a {section} bullet not found in the PDF text.")
                    entry = {**entry, "highlights": bullets}
                kept.append(entry)
        dropped = len(entries) - len(kept)
        if dropped:
            warnings.append(f"Skipped {dropped} {section} item{'s' if dropped != 1 else ''} not found in the PDF text.")
        if kept:
            merged[section] = kept
    return merged, warnings


def structure_resume(raw_text: str, heuristic: dict[str, Any]) -> ImportResult:
    """Best available structured CV: grounded AI output, else the heuristic parse."""
    if not AIService.is_configured():
        return ImportResult(heuristic, "heuristic")

    generated = AIService.call_provider(
        prompt=_prompt(raw_text),
        max_tokens=3500,
        temperature=0.0,
        timeout=IMPORT_TIMEOUT_SECONDS,
        system=SYSTEM_PROMPT,
    )
    parsed = parse_json_object(generated)
    if not parsed:
        logger.info("AI import returned no JSON; using heuristic parse")
        return ImportResult(heuristic, "heuristic", ["AI import was unavailable, so a basic parser was used."])

    try:
        ai_cv = CVData.model_validate(parsed).model_dump()
    except ValidationError:
        logger.info("AI import JSON did not match the CV schema; using heuristic parse")
        return ImportResult(heuristic, "heuristic", ["AI import returned unusable data, so a basic parser was used."])

    merged, warnings = _ground(ai_cv, heuristic, raw_text)
    if len(raw_text) > MAX_TEXT_CHARS:
        warnings.append("The resume is long; only the first part was read by AI. Check the last sections.")
    return ImportResult(CVData.model_validate(merged).model_dump(), "ai", warnings)
