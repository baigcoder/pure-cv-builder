"""Rewrite one CV bullet several ways: improve, quantify, shorten or strengthen the verb.

AI-first with deterministic fallbacks, so the feature still helps without a key.
The quantify mode may add bracketed prompts such as ``[X%]`` that the user fills
in; nothing else may invent facts.
"""

import json
import logging
import re
from dataclasses import dataclass

from services.ai_service import AIService, clean_plain_text, parse_json_object, word_count

logger = logging.getLogger(__name__)

MODES = ("improve", "quantify", "shorten", "stronger")

MODE_INSTRUCTIONS = {
    "improve": "Make it clearer and more impactful: lead with a strong past-tense action verb, show the result, cut filler.",
    "quantify": (
        "Show measurable impact. Keep any numbers already present exactly. Where a number would strengthen it "
        "but none is given, insert a short bracketed prompt the candidate can fill in, like [X%], [N users] or [N hours/week]."
    ),
    "shorten": "Make it at most 18 words without losing the core achievement.",
    "stronger": "Replace weak openings (worked on, helped, responsible for) with a precise, strong action verb.",
}

# Weak openings and stronger replacements, longest first so multi-word phrases win.
WEAK_OPENERS = [
    ("was responsible for", "Owned"),
    ("responsible for", "Owned"),
    ("was in charge of", "Led"),
    ("in charge of", "Led"),
    ("participated in", "Contributed to"),
    ("was involved in", "Contributed to"),
    ("involved in", "Contributed to"),
    ("was part of", "Collaborated on"),
    ("helped with", "Contributed to"),
    ("helped to", "Helped"),
    ("worked on", "Built"),
    ("worked with", "Partnered with"),
    ("assisted with", "Supported"),
    ("assisted", "Supported"),
    ("handled", "Managed"),
    ("did", "Delivered"),
    ("made", "Created"),
    ("tasked with", "Drove"),
]

FILLER = [
    (r"\bin order to\b", "to"),
    (r"\bwas able to\s+", ""),
    (r"\bsuccessfully\s+", ""),
    (r"\bvarious\s+", ""),
    (r"\ba number of\b", "several"),
    (r"\bvery\s+", ""),
    (r"\breally\s+", ""),
    (r"\butilized\b", "used"),
    (r"\butilize\b", "use"),
    (r"\bon a daily basis\b", "daily"),
    (r"\bdue to the fact that\b", "because"),
]


@dataclass
class RewriteResult:
    variants: list[str]
    source: str


def _tidy(text: str) -> str:
    text = re.sub(r"\s+", " ", text).strip().rstrip(".")
    return text[:1].upper() + text[1:] if text else text


def _stronger(text: str) -> str:
    lower = text.lower()
    for weak, strong in WEAK_OPENERS:
        if lower.startswith(weak + " "):
            return _tidy(strong + text[len(weak):])
    return _tidy(text)


def _trim_filler(text: str) -> str:
    for pattern, replacement in FILLER:
        text = re.sub(pattern, replacement, text, flags=re.IGNORECASE)
    return _tidy(text)


def _shorter(text: str) -> str:
    text = _trim_filler(text)
    if len(text.split()) <= 18:
        return text
    # Drop trailing clauses, but never one that carries a number: that's the result.
    clauses = re.split(r"(,\s|;\s|\s(?:while|which)\s)", text)
    kept = clauses[0]
    for separator, clause in zip(clauses[1::2], clauses[2::2]):
        if re.search(r"\d", clause) or len(kept.split()) < 8:
            kept += separator + clause
    return _tidy(kept)


def _quantified(text: str) -> list[str]:
    base = _stronger(text)
    if re.search(r"\d", base):
        return [base]
    return [
        f"{base}, improving [metric] by [X%]",
        f"{base} for [N] users",
        f"{base}, saving [N] hours per week",
    ]


def fallback(text: str, mode: str) -> list[str]:
    if mode == "quantify":
        return _quantified(text)
    if mode == "shorten":
        return [_shorter(text), _shorter(_stronger(text))]
    if mode == "stronger":
        return [_stronger(text)]
    return [_trim_filler(_stronger(text)), _shorter(_stronger(text))]


def _clean_variants(original: str, variants: list[str], allow_brackets: bool) -> list[str]:
    seen = {original.strip().rstrip(".").lower()}
    out: list[str] = []
    for variant in variants:
        text = _tidy(clean_plain_text(str(variant)))
        if not text or text.lower() in seen or word_count(text) > 40:
            continue
        if not allow_brackets and "[" in text:
            continue
        seen.add(text.lower())
        out.append(text)
    return out[:3]


def rewrite(text: str, mode: str, role: str = "", job_description: str = "") -> RewriteResult:
    text = text.strip()
    if AIService.is_configured():
        prompt = f"""Rewrite this CV bullet point three different ways.

Bullet: {text}
Target role: {role or "not specified"}
Job description excerpt: {job_description[:1500] or "none"}

Goal: {MODE_INSTRUCTIONS[mode]}
Rules: one line each, plain text, past tense unless the role is current, no first person, never invent employers,
tools or numbers{" (bracketed prompts are allowed)" if mode == "quantify" else ""}.

Return JSON only: {{"variants": ["...", "...", "..."]}}"""
        try:
            raw = AIService.call_provider(prompt=prompt, max_tokens=320, temperature=0.55)
            parsed = parse_json_object(raw) or {}
            variants = _clean_variants(text, parsed.get("variants") or [], mode == "quantify")
            if variants:
                return RewriteResult(variants=variants, source="ai")
        except (ValueError, json.JSONDecodeError):
            logger.info("AI rewrite returned unusable output; using fallback")
        except Exception:
            logger.exception("AI rewrite failed; using fallback")
    variants = _clean_variants(text, fallback(text, mode), mode == "quantify")
    return RewriteResult(variants=variants, source="fallback")
