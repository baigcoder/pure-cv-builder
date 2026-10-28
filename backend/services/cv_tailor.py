"""Tailor a whole CV to one job, as reviewable edits.

Rules that need no AI:

* Skills the job asks for move to the front of each skills group.
* The headline takes the job's title when the current headline is in the same
  line of work (shares a role word), keeping the candidate's own strengths.
* Skills the job wants but the CV lacks are listed for the user to add only if
  true; they are never added automatically.

With an AI provider, the summary is rewritten for the job and the most
relevant bullets are reworded (``tailor_service``). Every AI rewrite is
grounded: it may not introduce numbers or skills that aren't already in the CV.
"""

import copy
import json
import logging
import re
from dataclasses import dataclass, field

from services import grounding, tailor_service
from services.ai_service import AIService, clean_plain_text, parse_json_object, word_count
from services.job_match_service import _title_words, analyze, find_skills
from services.skills_lexicon import SKILLS

logger = logging.getLogger(__name__)



@dataclass
class TailoredCV:
    cv_data: dict
    source: str  # "ai" | "rules"
    changes: list[str] = field(default_factory=list)
    missing_keywords: list[str] = field(default_factory=list)
    score_before: int = 0
    score_after: int = 0


def _cv_text(cv: dict) -> str:
    return json.dumps(cv, ensure_ascii=False)


def _reorder_skills(cv: dict, wanted: set[str]) -> int:
    """Within each skills group, put the job's skills first. Returns how many groups changed."""
    changed = 0
    for entry in cv.get("skills") or []:
        if not isinstance(entry, dict):
            continue
        items = [item.strip() for item in re.split(r",\s*", str(entry.get("details") or "")) if item.strip()]
        if len(items) < 2:
            continue
        relevant = [item for item in items if set(find_skills(item)) & wanted]
        ordered = relevant + [item for item in items if item not in relevant]
        if ordered != items:
            entry["details"] = ", ".join(ordered)
            changed += 1
    return changed


def _headline(cv: dict, target_title: str, matched: list[str]) -> str | None:
    """The job's title plus the candidate's top matching skills, when it's the same line of work."""
    current = str(cv.get("headline") or "").strip()
    target_words = _title_words(target_title)
    current_words = _title_words(current)
    if not target_title or not current_words or target_words <= current_words:
        return None
    if not current_words & target_words:
        return None  # a different field; changing the headline would misrepresent the candidate
    # Tools and technologies read well in a headline; soft skills and practices don't.
    technical = [name for name in matched if SKILLS.get(name, ("",))[0] not in ("soft", "practice")]
    skills = ", ".join(technical[:2])
    return f"{target_title} | {skills}" if skills else target_title


def _grounded(rewrite: str, cv_text: str) -> bool:
    """No new numbers and no skills the CV doesn't already show."""
    invented = grounding.check(rewrite, cv_text)
    if invented:
        logger.info("Tailoring rewrite rejected; it added %s", invented.describe())
    return not invented


def _ai_summary(cv: dict, job_description: str, target_title: str, matched: list[str]) -> str | None:
    summary = str(cv.get("summary") or "").strip()
    experience = [
        {k: e.get(k) for k in ("company", "position", "start_date", "end_date", "highlights")}
        for e in (cv.get("experience") or [])[:4]
        if isinstance(e, dict)
    ]
    prompt = f"""Rewrite this CV summary for one job. Use only facts from the CV below.

Target role: {target_title or "not given"}
Job keywords the CV already shows: {", ".join(matched[:10]) or "none"}
Job post (context only):
{job_description[:3000]}

Current summary: {summary or "(none)"}
Headline: {cv.get("headline") or ""}
Experience (JSON): {json.dumps(experience, ensure_ascii=False)[:3000]}
Skills: {"; ".join(f"{s.get('label')}: {s.get('details')}" for s in cv.get("skills") or [] if isinstance(s, dict))}

Rules: 45-80 words, two or three sentences, no first person, plain text. Lead with what makes the
candidate a fit for this role. Use the job's wording where it is true for the candidate. Never add
numbers, employers, tools or achievements that are not in the CV.

Return JSON only: {{"summary": "..."}}"""
    try:
        parsed = parse_json_object(AIService.call_provider(prompt=prompt, max_tokens=300, temperature=0.4)) or {}
    except Exception:
        logger.exception("AI summary tailoring failed")
        return None
    rewrite = clean_plain_text(str(parsed.get("summary") or ""))
    if not rewrite or rewrite == summary or not 25 <= word_count(rewrite) <= 110:
        return None
    return rewrite if _grounded(rewrite, _cv_text(cv)) else None


def tailor_cv(cv_data: dict, job_description: str, target_role: str = "") -> TailoredCV:
    before = analyze(cv_data, job_description, target_role)
    tailored = copy.deepcopy(cv_data)
    matched = [item.keyword for item in before.matched]
    changes: list[str] = []
    source = "rules"

    groups = _reorder_skills(tailored, set(matched))
    if groups:
        changes.append(f"Moved the job's skills to the front of {groups} skills group{'s' if groups != 1 else ''}.")

    headline = _headline(tailored, before.target_title, matched)
    if headline:
        tailored["headline"] = headline
        changes.append("Aligned the headline with the job title.")

    if AIService.is_configured():
        summary = _ai_summary(tailored, job_description, before.target_title, matched)
        if summary:
            tailored["summary"] = summary
            changes.append("Rewrote the summary for this job using only facts from your CV.")
            source = "ai"
        bullets = tailor_service.tailor(tailored, job_description, [], 12)
        cv_text = _cv_text(cv_data)
        applied = 0
        for suggestion in bullets.suggestions:
            # Strict: a bullet may echo the job's wording, but not claim a skill the CV doesn't show.
            if not _grounded(suggestion["suggestion"], cv_text):
                continue
            entries = tailored.get(suggestion["section"]) or []
            entry = entries[suggestion["entry_index"]] if suggestion["entry_index"] < len(entries) else None
            highlights = entry.get("highlights") if isinstance(entry, dict) else None
            if isinstance(highlights, list) and suggestion["bullet_index"] < len(highlights):
                highlights[suggestion["bullet_index"]] = suggestion["suggestion"]
                applied += 1
        if applied:
            changes.append(f"Reworded {applied} bullet{'s' if applied != 1 else ''} to use the job's language.")
            source = "ai"

    after = analyze(tailored, job_description, target_role)
    return TailoredCV(
        cv_data=tailored,
        source=source,
        changes=changes,
        missing_keywords=[item.keyword for item in before.missing][:12],
        score_before=before.score,
        score_after=after.score,
    )
