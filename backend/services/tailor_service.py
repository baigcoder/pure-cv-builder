"""Suggest job-targeted rewrites of experience and project bullets.

With an AI provider, bullets are reworded to surface job keywords the bullet
already implies. Every rewrite is checked before it reaches the user: it must
not introduce numbers absent from the original (no invented metrics) and must
stay a single bullet of similar length. Without a provider, the service
returns honest guidance (which keywords fit which bullet) instead of
templated rewrites.
"""

import json
import logging
import re
from dataclasses import dataclass, field
from typing import Literal

from services.ai_service import AIService, clean_plain_text, parse_json_object
from services.job_match_service import analyze, find_skills
from services.skills_lexicon import SKILLS

logger = logging.getLogger(__name__)

BulletSection = Literal["experience", "projects"]
NUMBER = re.compile(r"\d+(?:[.,]\d+)?")

# Keyword categories a bullet about one category can plausibly mention.
RELATED_CATEGORIES = {
    "language": {"language", "framework", "practice"},
    "framework": {"framework", "language", "data", "practice"},
    "data": {"data", "cloud", "framework"},
    "cloud": {"cloud", "devops", "data"},
    "devops": {"devops", "cloud", "practice"},
    "ai": {"ai", "data", "language"},
    "practice": {"practice"},
    "tool": {"tool", "practice", "domain"},
    "soft": {"soft"},
    "domain": {"domain", "tool", "practice"},
    # Certifications are held or not; never hinted into a bullet.
    "certification": set(),
}
LEADERSHIP_VERBS = re.compile(r"\b(led|lead|managed|mentored|coached|owned|drove|coordinated|partnered|presented)\b", re.IGNORECASE)


@dataclass
class Bullet:
    section: BulletSection
    entry_index: int
    bullet_index: int
    text: str

    @property
    def key(self) -> str:
        return f"{self.section}:{self.entry_index}:{self.bullet_index}"


@dataclass
class TailorResult:
    source: Literal["ai", "guidance"]
    suggestions: list[dict] = field(default_factory=list)
    hints: list[dict] = field(default_factory=list)
    message: str = ""


def collect_bullets(cv_data: dict, limit: int) -> list[Bullet]:
    bullets: list[Bullet] = []
    for section in ("experience", "projects"):
        for entry_index, entry in enumerate(cv_data.get(section) or []):
            if not isinstance(entry, dict):
                continue
            for bullet_index, text in enumerate(entry.get("highlights") or []):
                if isinstance(text, str) and len(text.split()) >= 3:
                    bullets.append(Bullet(section, entry_index, bullet_index, text.strip()))
    return bullets[:limit]


def target_keywords(cv_data: dict, job_description: str, requested: list[str]) -> list[str]:
    if requested:
        return [keyword.strip() for keyword in requested if keyword.strip()][:30]
    match = analyze(cv_data, job_description)
    return [item.keyword for item in match.missing][:15]


def hints_for(bullets: list[Bullet], keywords: list[str]) -> list[dict]:
    """Pair each bullet with up to two missing keywords it could plausibly show."""
    keyword_categories = {keyword: SKILLS[keyword][0] for keyword in keywords if keyword in SKILLS}
    hints: list[dict] = []
    for bullet in bullets:
        mentioned = {SKILLS[name][0] for name in find_skills(bullet.text)}
        allowed = set().union(*(RELATED_CATEGORIES[category] for category in mentioned)) if mentioned else set()
        if LEADERSHIP_VERBS.search(bullet.text):
            allowed |= {"soft"}
        fits = [keyword for keyword, category in keyword_categories.items() if category in allowed][:2]
        if fits:
            hints.append({**_ref(bullet), "original": bullet.text, "keywords": fits})
    return hints


def _ref(bullet: Bullet) -> dict:
    return {"section": bullet.section, "entry_index": bullet.entry_index, "bullet_index": bullet.bullet_index}


def is_safe_rewrite(original: str, rewrite: str) -> bool:
    """Reject rewrites that add facts or stop being one comparable bullet."""
    if not rewrite or rewrite.strip() == original.strip():
        return False
    if "\n" in rewrite.strip():
        return False
    if len(rewrite) > max(len(original) * 2, len(original) + 120):
        return False
    original_numbers = set(NUMBER.findall(original))
    return set(NUMBER.findall(rewrite)) <= original_numbers


def _prompt(bullets: list[Bullet], keywords: list[str], job_description: str) -> str:
    items = [{"id": bullet.key, "text": bullet.text} for bullet in bullets]
    return f"""You tailor CV bullet points to a job post without inventing anything.

Job keywords the CV is missing: {", ".join(keywords) or "none"}
Job post (for context):
{job_description[:4000]}

Bullets (JSON):
{json.dumps(items, ensure_ascii=False)}

Rules:
- Only rewrite a bullet when it already implies one of the keywords (e.g. "built APIs" can become "built REST APIs"). Otherwise omit it.
- Keep every fact. Never add numbers, metrics, employers, tools, or outcomes that are not in the original.
- Start with a strong past-tense verb. One sentence. Plain text, no markdown.

Return one JSON object only:
{{"suggestions": [{{"id": "<bullet id>", "text": "<rewritten bullet>"}}]}}
"""


def tailor(cv_data: dict, job_description: str, requested_keywords: list[str], max_bullets: int) -> TailorResult:
    bullets = collect_bullets(cv_data, max_bullets)
    if not bullets:
        return TailorResult("guidance", message="Add experience or project bullets first, then tailor them to the job.")

    keywords = target_keywords(cv_data, job_description, requested_keywords)
    hints = hints_for(bullets, keywords)
    guidance = TailorResult(
        "guidance",
        hints=hints,
        message=(
            "AI rewriting isn't configured, so here are the bullets where missing keywords fit best. "
            "Reword them yourself only where the keyword is true for that work."
            if hints
            else "None of your bullets clearly relate to the missing keywords. Consider adding a bullet for that work."
        ),
    )
    if not AIService.is_configured() or not keywords:
        return guidance

    generated = AIService.call_provider(prompt=_prompt(bullets, keywords, job_description), max_tokens=1200, temperature=0.3)
    parsed = parse_json_object(generated) or {}
    by_key = {bullet.key: bullet for bullet in bullets}
    target = {keyword.lower() for keyword in keywords}

    suggestions: list[dict] = []
    for item in parsed.get("suggestions") or []:
        if not isinstance(item, dict):
            continue
        bullet = by_key.get(str(item.get("id", "")))
        rewrite = clean_plain_text(str(item.get("text", "")))
        if bullet is None or not is_safe_rewrite(bullet.text, rewrite):
            continue
        added = [
            name for name in find_skills(rewrite)
            if name not in find_skills(bullet.text) and name.lower() in target
        ]
        suggestions.append({**_ref(bullet), "original": bullet.text, "suggestion": rewrite, "keywords_added": added})

    if not suggestions:
        logger.info("AI tailoring returned no usable rewrites; returning guidance")
        guidance.message = (
            "None of your bullets clearly show the job's missing keywords, so there's nothing to reword honestly. "
            + ("The bullets below are the closest fits if the keyword is true for that work." if hints else "Consider adding a bullet for that work.")
        )
        return guidance
    return TailorResult(
        "ai",
        suggestions=suggestions,
        hints=hints,
        message=f"{len(suggestions)} bullet{'s' if len(suggestions) != 1 else ''} reworded for this job. Review each before accepting.",
    )
