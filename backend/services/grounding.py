"""Fact-check AI output against the user's own material.

AI rewrites may rephrase, but they may not add facts. Two checks catch the
inventions that matter most on a CV:

* **Numbers**: every number in the output must appear in the sources, compared
  by value so "40k", "40,000" and "40 000" match, as do "2M" and "2 million".
* **Skills**: every tool or skill the lexicon recognises in the output must
  already appear in the sources. Skills from a job ad are not sources: a job
  asking for Terraform doesn't mean the candidate has it.
"""

import re
from dataclasses import dataclass, field

from services.job_match_service import find_skills

_NUMBER = re.compile(r"(?<![\w.])(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)(?:\s*(k|m|bn|b|million|billion|thousand)\b)?(?![\d])", re.I)
_SCALE = {"k": 1e3, "thousand": 1e3, "m": 1e6, "million": 1e6, "b": 1e9, "bn": 1e9, "billion": 1e9}


def numbers(text: str) -> set[float]:
    values = set()
    for digits, scale in _NUMBER.findall(text or ""):
        value = float(digits.replace(",", ""))
        values.add(round(value * _SCALE.get(scale.lower(), 1), 3) if scale else round(value, 3))
    return values


def skills(text: str) -> set[str]:
    return set(find_skills(text or ""))


@dataclass
class Ungrounded:
    numbers: list[str] = field(default_factory=list)
    skills: list[str] = field(default_factory=list)

    def __bool__(self) -> bool:
        return bool(self.numbers or self.skills)

    def describe(self) -> str:
        parts = []
        if self.skills:
            parts.append("skills or tools: " + ", ".join(self.skills))
        if self.numbers:
            parts.append("numbers: " + ", ".join(self.numbers))
        return "; ".join(parts)


def check(text: str, *sources: str) -> Ungrounded:
    """What ``text`` claims that none of ``sources`` support."""
    source = " ".join(s for s in sources if s)
    known_numbers = numbers(source)
    new_numbers = sorted(
        {f"{value:g}" for value in numbers(text) if value not in known_numbers},
        key=lambda item: float(item),
    )
    new_skills = sorted(skills(text) - skills(source))
    return Ungrounded(numbers=new_numbers, skills=new_skills)


def is_grounded(text: str, *sources: str) -> bool:
    return not check(text, *sources)
