"""AI suggestion service for the RenderCV web app.

The service supports an OpenAI-compatible provider when configured and keeps
deterministic local fallbacks available so the editor remains useful in local
and offline deployments.
"""

import json
import os
import re
from copy import deepcopy
from dataclasses import dataclass
from typing import Any, Literal

from openai import OpenAI

try:
    from dotenv import load_dotenv

    load_dotenv()
except ImportError:
    pass


AITask = Literal[
    "summary",
    "headline",
    "bullet",
    "education",
    "project_summary",
    "project_highlight",
    "skills",
    "generate",
    "honor",
    "cover_letter",
]

SUPPORTED_TASKS: tuple[AITask, ...] = (
    "summary",
    "headline",
    "bullet",
    "education",
    "project_summary",
    "project_highlight",
    "skills",
    "generate",
    "honor",
    "cover_letter",
)

OPENCODE_API_KEY = os.getenv("OPENCODE_API_KEY")
OPENCODE_BASE_URL = os.getenv("OPENCODE_BASE_URL", "https://opencode.ai/zen/v1")
OPENCODE_MODEL = os.getenv("OPENCODE_MODEL", "nemotron-3-super-free")
OPENCODE_TIMEOUT = float(os.getenv("OPENCODE_TIMEOUT", "8.0"))

client = (
    OpenAI(
        api_key=OPENCODE_API_KEY,
        base_url=OPENCODE_BASE_URL,
        timeout=OPENCODE_TIMEOUT,
        max_retries=0,
    )
    if OPENCODE_API_KEY
    else None
)


@dataclass(frozen=True)
class AITextResult:
    """Result returned by AI generation or a deterministic fallback."""

    text: str
    source: Literal["ai", "fallback"]
    warnings: list[str]


def clean_plain_text(value: str) -> str:
    """Normalize provider output into plain ATS-readable text."""
    text = value.strip()
    text = re.sub(r"^```[a-zA-Z]*\s*", "", text)
    text = re.sub(r"\s*```$", "", text)
    text = re.sub(r"^\s*[-*]\s+", "", text, flags=re.MULTILINE)
    text = re.sub(r"\*\*(.*?)\*\*", r"\1", text)
    text = re.sub(r"__(.*?)__", r"\1", text)
    text = re.sub(r"`([^`]*)`", r"\1", text)
    text = re.sub(r"[ \t]+\n", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    if (text.startswith('"') and text.endswith('"')) or (text.startswith("'") and text.endswith("'")):
        text = text[1:-1].strip()
    return text


def word_count(text: str) -> int:
    """Count plain words for response metadata and validation."""
    return len(re.findall(r"\b[\w'-]+\b", text))


def extract_keywords(*values: str, limit: int = 8) -> list[str]:
    """Extract stable skill-like keywords from user-provided text."""
    joined = " ".join(values)
    candidates = re.findall(r"[A-Za-z][A-Za-z0-9+#./-]{1,}", joined)
    stop_words = {
        "and",
        "the",
        "with",
        "for",
        "from",
        "that",
        "this",
        "your",
        "role",
        "team",
        "work",
        "will",
        "need",
        "using",
        "experience",
        "professional",
    }
    seen: set[str] = set()
    keywords: list[str] = []
    for candidate in candidates:
        normalized = candidate.strip(".,:;()[]{}").lower()
        if len(normalized) < 3 or normalized in stop_words or normalized in seen:
            continue
        seen.add(normalized)
        keywords.append(candidate.strip(".,:;()[]{}"))
        if len(keywords) >= limit:
            break
    return keywords


def infer_country(location: str) -> str:
    """Infer a country or market hint from a free-form location."""
    country_hints = (
        "Pakistan",
        "India",
        "United States",
        "USA",
        "Canada",
        "United Kingdom",
        "UK",
        "United Arab Emirates",
        "UAE",
        "Germany",
        "France",
        "Australia",
        "Saudi Arabia",
    )
    if not location:
        return ""
    for country in country_hints:
        if re.search(rf"\b{re.escape(country)}\b", location, re.IGNORECASE):
            return country
    parts = [part.strip() for part in location.split(",") if part.strip()]
    return parts[-1] if len(parts) > 1 else ""


def compact_cv_context(cv_data: dict) -> dict:
    """Keep cover-letter prompts focused and token-bounded."""
    location = cv_data.get("location", "")
    return {
        "name": cv_data.get("name", ""),
        "headline": cv_data.get("headline", ""),
        "location": location,
        "country_or_market": infer_country(location),
        "summary": cv_data.get("summary", ""),
        "experience": cv_data.get("experience", [])[:3],
        "skills": cv_data.get("skills", [])[:6],
        "projects": cv_data.get("projects", [])[:3],
        "education": cv_data.get("education", [])[:2],
    }


def clean_role_text(value: str) -> str:
    """Remove portfolio/link noise from role text."""
    text = clean_plain_text(value)
    text = re.sub(r"\s*\|\s*live demo\b.*$", "", text, flags=re.IGNORECASE)
    text = re.sub(r"\s*\((project|contract|internship|remote)\)\s*", " ", text, flags=re.IGNORECASE)
    text = re.sub(r"\s+", " ", text)
    return text.strip(" .,:;|-")


def collect_skill_terms(cv_data: dict) -> list[str]:
    """Collect skill terms from editor skill rows."""
    terms: list[str] = []
    category_labels = {
        "backend", "cloud", "databases", "devops", "frameworks", "frontend",
        "languages", "programming languages", "soft skills", "technical skills",
        "technologies", "tools",
    }
    for entry in cv_data.get("skills", []) or []:
        if not isinstance(entry, dict):
            continue
        label = str(entry.get("label", "") or "").strip()
        details = str(entry.get("details", "") or "").strip()
        if label and label.lower() not in category_labels:
            terms.append(label)
        terms.extend(part.strip() for part in re.split(r"[,;/|]", details) if part.strip())
    seen: set[str] = set()
    unique: list[str] = []
    for term in terms:
        key = term.lower()
        if key not in seen:
            seen.add(key)
            unique.append(term)
    return unique


def infer_target_role(cv_data: dict, target_role: str = "") -> str:
    """Infer a target role from explicit context or CV content."""
    candidates = [
        target_role,
        str(cv_data.get("headline", "") or ""),
    ]
    for entry in cv_data.get("experience", []) or []:
        if isinstance(entry, dict):
            candidates.append(str(entry.get("position", "") or ""))
    for entry in cv_data.get("projects", []) or []:
        if isinstance(entry, dict):
            candidates.append(str(entry.get("summary", "") or ""))
    for candidate in candidates:
        role = clean_role_text(candidate)
        if role:
            return role
    return "Full-Stack Developer"


def market_skill_profile(role: str, job_description: str = "") -> list[str]:
    """Return practical ATS skills for common current software roles."""
    role_context = f"{role} {job_description}".lower()
    full_stack = [
        "TypeScript", "React", "Next.js", "Node.js", "Express.js", "REST APIs",
        "PostgreSQL", "MongoDB", "Prisma", "Docker", "Redis", "CI/CD",
    ]
    ai_product = [
        "LLM integration", "RAG", "prompt engineering", "vector search",
        "OpenAI APIs", "Python", "FastAPI", "evaluation workflows",
    ]
    frontend = ["React", "Next.js", "TypeScript", "Tailwind CSS", "Accessibility", "Performance Optimization"]
    backend = ["Node.js", "Express.js", "FastAPI", "PostgreSQL", "MongoDB", "Redis", "Docker", "API Design"]

    if "ai" in role_context or "llm" in role_context or "machine learning" in role_context:
        return ai_product + full_stack[:6]
    if "front" in role_context:
        return frontend + full_stack[3:8]
    if "back" in role_context:
        return backend
    return full_stack


def parse_json_object(value: str) -> dict[str, Any] | None:
    """Parse a provider JSON object, tolerating fenced output."""
    cleaned = clean_plain_text(value)
    match = re.search(r"\{.*\}", cleaned, flags=re.DOTALL)
    if not match:
        return None
    try:
        parsed = json.loads(match.group(0))
    except json.JSONDecodeError:
        return None
    return parsed if isinstance(parsed, dict) else None


class AIService:
    """Generate CV and cover-letter writing assistance."""

    @staticmethod
    def is_configured() -> bool:
        """Return whether a provider key is available."""
        return client is not None

    @staticmethod
    def status() -> dict:
        """Return public AI capability metadata for the frontend."""
        return {
            "configured": AIService.is_configured(),
            "provider": "OpenAI-compatible",
            "base_url": OPENCODE_BASE_URL,
            "model": OPENCODE_MODEL,
            "supported_tasks": list(SUPPORTED_TASKS),
            "fallback_available": True,
        }

    @staticmethod
    def suggest(task: AITask, text: str, context: str = "") -> AITextResult:
        """Generate task-specific text with provider-first fallback behavior."""
        trimmed_text = text.strip()
        trimmed_context = context.strip()

        if AIService.is_configured():
            prompt = AIService.build_prompt(task, trimmed_text, trimmed_context)
            generated = AIService.call_provider(
                prompt=prompt,
                max_tokens=AIService.max_tokens_for_task(task),
                temperature=AIService.temperature_for_task(task),
            )
            cleaned = clean_plain_text(generated)
            warnings = AIService.validate_text(task, cleaned)
            if cleaned and not warnings:
                return AITextResult(text=cleaned, source="ai", warnings=[])

        fallback = AIService.fallback_suggestion(task, trimmed_text, trimmed_context)
        return AITextResult(text=fallback, source="fallback", warnings=["AI provider unavailable or returned unusable text."])

    @staticmethod
    def enhance_cv_for_ats(
        cv_data: dict[str, Any],
        target_role: str = "",
        job_description: str = "",
        current_score: int = 0,
    ) -> dict[str, Any]:
        """Improve live CV data for ATS strength with AI-first fallback behavior."""
        role = infer_target_role(cv_data, target_role)
        if AIService.is_configured():
            prompt = AIService.build_ats_enhancement_prompt(cv_data, role, job_description, current_score)
            generated = AIService.call_provider(
                prompt=prompt,
                max_tokens=1200,
                temperature=0.35,
            )
            parsed = parse_json_object(generated)
            if parsed and isinstance(parsed.get("cv_data"), dict):
                return {
                    "cv_data": parsed["cv_data"],
                    "source": "ai",
                    "changes": [str(item) for item in parsed.get("changes", []) if str(item).strip()][:8],
                    "warnings": [],
                    "market_keywords": [str(item) for item in parsed.get("market_keywords", []) if str(item).strip()][:12],
                }

        fallback = AIService.fallback_cv_enhancement(cv_data, role, job_description)
        fallback["source"] = "fallback"
        fallback["warnings"] = ["AI provider unavailable or returned unusable structured CV data."]
        return fallback

    @staticmethod
    def build_ats_enhancement_prompt(
        cv_data: dict[str, Any],
        target_role: str,
        job_description: str,
        current_score: int,
    ) -> str:
        """Build a structured ATS enhancement prompt."""
        market_keywords = market_skill_profile(target_role, job_description)
        return f"""You are an expert ATS resume optimizer for 2026 software hiring.

Improve the provided live CV JSON for the target role while preserving all factual information.
Do not invent employers, degrees, dates, metrics, certifications, or links.
You may improve wording, add a missing headline, add a 45-70 word professional summary, clean noisy project titles/summaries, and add missing role-relevant skills only when they are supported by the CV context.
Keep plain text only. No markdown. No placeholders. No fake claims.

Current ATS score: {current_score}
Target role: {target_role}
Current market keywords to consider: {", ".join(market_keywords)}
Job description or user context: {job_description or "No job description supplied"}

CV JSON:
{json.dumps(cv_data, ensure_ascii=False)}

Return one JSON object only with this exact shape:
{{
  "cv_data": <complete improved CV JSON using the same schema>,
  "changes": ["short change note", "..."],
  "market_keywords": ["keyword", "..."]
}}
"""

    @staticmethod
    def fallback_cv_enhancement(
        cv_data: dict[str, Any],
        target_role: str,
        job_description: str = "",
    ) -> dict[str, Any]:
        """Apply deterministic ATS-safe enhancements when AI is unavailable."""
        enhanced = deepcopy(cv_data)
        changes: list[str] = []
        market_keywords = market_skill_profile(target_role, job_description)
        existing_skills = collect_skill_terms(enhanced)

        if not str(enhanced.get("headline", "") or "").strip():
            top_skills = existing_skills[:2] or market_keywords[:2]
            enhanced["headline"] = f"{target_role} | {', '.join(top_skills)} | Production Web Apps"
            changes.append("Added a role-specific headline for recruiter and ATS matching.")

        summary_words = word_count(str(enhanced.get("summary", "") or ""))
        if summary_words < 35:
            skills_for_summary = existing_skills[:5] or market_keywords[:5]
            location = str(enhanced.get("location", "") or "").strip()
            location_phrase = f" Based in {location}, " if location else " "
            enhanced["summary"] = (
                f"{target_role} focused on building reliable, user-centered web applications with "
                f"{', '.join(skills_for_summary)}.{location_phrase}I turn ambiguous product requirements into shipped features, "
                "clean APIs, responsive interfaces, and measurable project outcomes across full-stack systems."
            )
            changes.append("Added a 35-90 word professional summary aligned with ATS recommendations.")

        missing_market_skills = [
            skill for skill in market_keywords
            if skill.lower() not in {existing.lower() for existing in existing_skills}
        ][:6]
        if missing_market_skills:
            skills = enhanced.get("skills")
            if not isinstance(skills, list):
                skills = []
            skills.append({"label": "ATS Market Fit", "details": ", ".join(missing_market_skills)})
            enhanced["skills"] = skills
            changes.append("Added a focused ATS Market Fit skill row based on the target role.")

        projects = enhanced.get("projects")
        if isinstance(projects, list):
            for project in projects[:3]:
                if not isinstance(project, dict):
                    continue
                name = clean_role_text(str(project.get("name", "") or ""))
                summary = clean_role_text(str(project.get("summary", "") or ""))
                if name != str(project.get("name", "") or ""):
                    project["name"] = name
                    changes.append("Cleaned noisy project title text.")
                if not summary or re.fullmatch(r"[A-Za-z -]*(developer|engineer)[A-Za-z -]*", summary, flags=re.IGNORECASE):
                    project_name = name or "project"
                    project["summary"] = (
                        f"Built and improved {project_name} as a full-stack product with practical UI, API, "
                        "database, and deployment work."
                    )
                    changes.append("Rewrote a project summary to describe delivered product value.")

        return {
            "cv_data": enhanced,
            "changes": changes[:8],
            "market_keywords": market_keywords[:12],
        }

    @staticmethod
    def build_prompt(task: AITask, text: str, context: str = "") -> str:
        """Build a constrained prompt for a specific editor task."""
        prompts: dict[AITask, str] = {
            "summary": (
                "Rewrite this CV summary in 2-3 confident sentences under 70 words. "
                "Use ATS keywords naturally, avoid cliches, and keep only plain text.\n\n"
                f"Current summary: {text or 'No summary provided'}\nTarget context: {context or 'General professional'}"
            ),
            "headline": (
                "Create a concise professional headline, 5-10 words, with specialty and value. "
                "No quotes or labels.\n\n"
                f"Name or role: {text}\nContext: {context}"
            ),
            "bullet": (
                "Rewrite this CV bullet as one achievement-led sentence under 24 words. "
                "Start with a strong action verb and keep metrics only if supported by the source.\n\n"
                f"Current bullet: {text}\nRole or context: {context}"
            ),
            "education": (
                "Improve this education highlight in 10-18 words. Keep honors, GPA, thesis, or coursework factual.\n\n"
                f"Highlight: {text}\nContext: {context}"
            ),
            "project_summary": (
                "Rewrite this project summary in 18-28 words. Lead with value delivered, then technologies or scope.\n\n"
                f"Project summary: {text}\nProject context: {context}"
            ),
            "project_highlight": (
                "Rewrite this project highlight as one technical achievement under 18 words. No bullet symbol.\n\n"
                f"Highlight: {text}\nProject context: {context}"
            ),
            "skills": (
                "Suggest 5 relevant ATS-friendly skills. Return comma-separated skill names only.\n\n"
                f"Current skills: {text}\nTarget role or job context: {context}"
            ),
            "generate": (
                "Write a 2-sentence professional summary under 65 words using the target role and available context. "
                "Plain text only.\n\n"
                f"Name or profile: {text}\nTarget role: {context}"
            ),
            "honor": (
                "Format this honor or award as one concise CV entry under 18 words. Plain text only.\n\n"
                f"Honor context: {text}\nAdditional context: {context}"
            ),
            "cover_letter": text,
        }
        return prompts[task]

    @staticmethod
    def fallback_suggestion(task: AITask, text: str, context: str = "") -> str:
        """Create deterministic local suggestions when the provider is unavailable."""
        keywords = extract_keywords(text, context, limit=6)
        keyword_text = ", ".join(keywords[:4])

        if task == "headline":
            role = context or text or "Professional"
            return f"{role} | Production Impact | ATS-Ready Profile"
        if task == "bullet":
            base = text.rstrip(".")
            return f"Delivered {base} with clear ownership and measurable business impact."
        if task == "skills":
            fallback_skills = keywords or ["Communication", "Project Delivery", "Problem Solving", "Stakeholder Management", "Process Improvement"]
            return ", ".join(fallback_skills[:5])
        if task == "generate":
            role = context or "the target role"
            return (
                f"Professional focused on {role}, with experience turning complex requirements into reliable outcomes. "
                f"Brings practical execution, clear communication, and role-specific strengths{f' across {keyword_text}' if keyword_text else ''}."
            )
        if task == "honor":
            return clean_plain_text(text)[:160] or "Relevant award or recognition with organization and year"
        if task in {"project_summary", "project_highlight"}:
            base = clean_plain_text(text).rstrip(".")
            return f"Built {base} with practical technical execution and clear user value."[:220]
        if task == "education":
            base = clean_plain_text(text).rstrip(".")
            return f"{base}, emphasizing relevant coursework, honors, and academic impact."[:180]

        base_summary = clean_plain_text(text).rstrip(".")
        if not base_summary:
            base_summary = f"Professional with experience aligned to {context or 'the target role'}"
        return (
            f"{base_summary}. Highlights include practical delivery, role-relevant strengths"
            f"{f', and keywords such as {keyword_text}' if keyword_text else ''}."
        )[:420]

    @staticmethod
    def validate_text(task: AITask, text: str) -> list[str]:
        """Validate provider text before returning it to the editor."""
        warnings: list[str] = []
        if not text:
            return ["AI returned an empty response."]
        if re.search(r"\b(TODO|placeholder|insert here|your company)\b", text, re.IGNORECASE):
            warnings.append("AI returned placeholder text.")
        if task != "cover_letter" and "\n\n" in text:
            warnings.append("AI returned multi-paragraph text for a single-field task.")
        count = word_count(text)
        limits: dict[AITask, tuple[int, int]] = {
            "summary": (8, 90),
            "headline": (2, 14),
            "bullet": (4, 30),
            "education": (3, 24),
            "project_summary": (6, 34),
            "project_highlight": (4, 24),
            "skills": (1, 35),
            "generate": (8, 90),
            "honor": (2, 24),
            "cover_letter": (180, 430),
        }
        minimum, maximum = limits[task]
        if count < minimum:
            warnings.append("AI response is too short.")
        if count > maximum:
            warnings.append("AI response is too long.")
        return warnings

    @staticmethod
    def max_tokens_for_task(task: AITask) -> int:
        """Return task-specific max token budgets."""
        return 750 if task == "cover_letter" else 260

    @staticmethod
    def temperature_for_task(task: AITask) -> float:
        """Return task-specific sampling temperature."""
        return 0.45 if task in {"bullet", "skills", "honor"} else 0.6

    @staticmethod
    def call_provider(prompt: str, max_tokens: int = 300, temperature: float = 0.6) -> str:
        """Call the OpenAI-compatible provider and return plain text."""
        if client is None:
            return ""
        try:
            chat_completion = client.chat.completions.create(
                messages=[
                    {
                        "role": "system",
                        "content": (
                            "You are an expert ATS resume and cover-letter writer. "
                            "Return only the requested final text. Do not include labels, markdown, "
                            "unsupported symbols, explanations, or invented metrics."
                        ),
                    },
                    {"role": "user", "content": prompt},
                ],
                model=OPENCODE_MODEL,
                temperature=temperature,
                max_tokens=max_tokens,
            )
            return chat_completion.choices[0].message.content or ""
        except Exception as error:
            print(f"OpenAI-compatible provider error: {error}")
            return ""

    @staticmethod
    def improve_summary(current_summary: str, job_title: str = "") -> str:
        """Improve a professional summary."""
        return AIService.suggest("summary", current_summary, job_title).text

    @staticmethod
    def generate_headline(name: str, role: str = "", experience: str = "") -> str:
        """Generate a concise professional headline."""
        context = " ".join(value for value in [role, experience] if value)
        return AIService.suggest("headline", name, context).text

    @staticmethod
    def improve_experience_bullet(bullet: str, role: str = "", company: str = "") -> str:
        """Improve an experience bullet point."""
        context = " ".join(value for value in [role, company] if value)
        return AIService.suggest("bullet", bullet, context).text

    @staticmethod
    def improve_education_highlight(highlight: str, degree: str = "", field: str = "") -> str:
        """Improve an education highlight."""
        context = " ".join(value for value in [degree, field] if value)
        return AIService.suggest("education", highlight, context).text

    @staticmethod
    def improve_project_summary(summary: str, project_name: str = "") -> str:
        """Improve a project summary."""
        return AIService.suggest("project_summary", summary, project_name).text

    @staticmethod
    def improve_project_highlight(highlight: str, project_name: str = "") -> str:
        """Improve a project bullet point."""
        return AIService.suggest("project_highlight", highlight, project_name).text

    @staticmethod
    def suggest_skills(job_title: str, current_skills: list[str]) -> list[str]:
        """Suggest skills for a target role."""
        result = AIService.suggest("skills", ", ".join(current_skills), job_title).text
        return [skill.strip() for skill in result.split(",") if skill.strip()][:5]

    @staticmethod
    def generate_summary(name: str, job_title: str, years_exp: int = 0) -> str:
        """Generate a professional summary from scratch."""
        context = f"{job_title} {years_exp} years".strip()
        return AIService.suggest("generate", name, context).text

    @staticmethod
    def improve_publication_title(title: str, field: str = "") -> str:
        """Return publication titles unchanged to avoid changing scholarly records."""
        return title

    @staticmethod
    def generate_honor_entry(context: str) -> str:
        """Format an honor or award entry."""
        return AIService.suggest("honor", context).text

    @staticmethod
    def generate_cover_letter(
        cv_data: dict,
        target_role: str,
        company: str,
        hiring_manager: str,
        job_description: str,
        tone: str,
    ) -> str:
        """Generate a tailored cover letter from CV data and a job description."""
        prompt = f"""Write a tailored, ATS-readable cover letter.

Target role: {target_role}
Company: {company}
Hiring manager: {hiring_manager or "Hiring Manager"}
Tone: {tone}

CV snapshot:
{json.dumps(compact_cv_context(cv_data), ensure_ascii=False)}

Job description:
{job_description}

Requirements:
- One page, 250-350 words.
- Plain text only, no markdown, no bullets, no placeholders.
- If the company is blank or generic, write to "your team" and do not invent a company name.
- Include greeting and formal sign-off.
- Open with a specific value proposition, not a generic introduction.
- Match keywords from the job description naturally.
- Use the candidate's location/country context when it strengthens fit, but do not invent work authorization.
- Prioritize the candidate's edited skills, projects, and recent experience.
- Mention 1-2 concrete achievements or projects from the CV when available.
"""
        result = AIService.suggest("cover_letter", prompt)
        return result.text if result.source == "ai" else ""
