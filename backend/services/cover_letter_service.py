"""Cover letter generation and PDF rendering helpers."""

from __future__ import annotations

from datetime import date
import re
from typing import Any

import fitz


class CoverLetterService:
    """Build ATS-friendly cover letters from CV data and job descriptions."""

    TONE_LABELS: dict[str, str] = {
        "professional": "professional and confident",
        "warm": "warm and personable",
        "concise": "concise and direct",
        "executive": "executive and strategic",
    }
    COUNTRY_HINTS: tuple[str, ...] = (
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
    GENERIC_COMPANY_NAMES: tuple[str, ...] = (
        "",
        "company",
        "target company",
        "target organization",
        "the company",
        "the hiring team",
        "your company",
        "your organization",
        "your team",
    )
    SKILL_CATEGORY_LABELS: tuple[str, ...] = (
        "backend",
        "cloud",
        "databases",
        "devops",
        "frameworks",
        "frontend",
        "languages",
        "programming languages",
        "soft skills",
        "technical skills",
        "technologies",
        "tools",
    )
    KEYWORD_STOP_WORDS: frozenset[str] = frozenset(
        {
            "and", "the", "for", "with", "that", "this", "from", "your", "you",
            "are", "will", "our", "have", "has", "job", "role", "work", "team",
            "skills", "experience", "requirements", "responsibilities",
            "auto", "auto-generated", "generated", "application", "brief", "candidate", "location",
            "country", "context", "target", "professional", "summary", "relevant",
            "project", "projects", "education", "write", "strong", "one", "page",
            "cover", "letter", "hiring", "teams", "match", "edited", "live",
            "data", "emphasize", "plain", "text", "readable",
        }
    )

    @classmethod
    def build_fallback_letter(
        cls,
        cv_data: dict[str, Any],
        target_role: str,
        company: str,
        hiring_manager: str = "",
        job_description: str = "",
        tone: str = "professional",
    ) -> str:
        """Create a deterministic tailored cover letter.

        Args:
            cv_data: Existing CV editor data.
            target_role: Target role title.
            company: Target company.
            hiring_manager: Optional hiring manager name.
            job_description: Pasted job description text.
            tone: Requested tone preset.

        Returns:
            A complete plain-text cover letter with greeting and sign-off.
        """
        name = cls.clean_text(cv_data.get("name")) or "Your Name"
        headline = cls.clean_text(cv_data.get("headline"))
        summary = cls.clean_text(cv_data.get("summary"))
        greeting = cls.clean_text(hiring_manager) or "Hiring Team"
        tone_label = cls.TONE_LABELS.get(tone, cls.TONE_LABELS["professional"])
        clean_role = cls.sanitize_role(target_role)
        clean_company = cls.sanitize_company(company)
        skills = cls.extract_skill_terms(cv_data)
        keywords = cls.extract_keywords(job_description)
        strongest_experience = cls.extract_strongest_experience(cv_data)
        project = cls.extract_project(cv_data)
        location = cls.clean_text(cv_data.get("location"))
        country = cls.infer_country(location)

        role_phrase = f"the {clean_role} role" if clean_role else "this role"
        company_reference = cls.company_reference(clean_company)
        company_goal = f"{clean_company}'s goals" if clean_company else "your team's goals"
        company_target = clean_company or "your team"
        skill_phrase = ", ".join(skills[:5]) or "full-stack delivery, product thinking, and reliable execution"
        keyword_phrase = ", ".join(keywords[:5])
        value_sentence = (
            summary
            or f"My background centers on {skill_phrase}, with a practical focus on shipping reliable software."
        )
        keyword_sentence = (
            f"The role's focus on {keyword_phrase} connects directly with my hands-on work in {skill_phrase}. "
            if keyword_phrase
            else f"My strongest fit is in {skill_phrase}, backed by hands-on project delivery and careful execution. "
        )

        paragraphs = [
            (
                f"Dear {greeting},"
            ),
            (
                f"I am applying for {role_phrase} {company_reference}. "
                f"As {headline or 'a results-focused professional'}, I bring a {tone_label} approach to "
                f"turning requirements into shipped, useful software. {value_sentence}"
            ),
            (
                keyword_sentence
                +
                f"{cls.location_sentence(location, country)}"
                f"{strongest_experience}"
            ),
            (
                f"I would bring the same disciplined execution to {company_target}: clear communication, reliable delivery, "
                f"and a habit of turning ambiguous requirements into shipped work. {project}"
            ),
            (
                f"Thank you for reviewing my application. I would welcome the opportunity to discuss how my background "
                f"can support {company_goal} for this role."
            ),
            f"Sincerely,\n{name}",
        ]

        return "\n\n".join(paragraph.strip() for paragraph in paragraphs if paragraph.strip())

    @classmethod
    def render_pdf(
        cls,
        cv_data: dict[str, Any],
        letter_text: str,
    ) -> bytes:
        """Render a simple one-page PDF cover letter.

        Args:
            cv_data: Existing CV editor data for header/contact details.
            letter_text: Complete cover letter body.

        Returns:
            PDF bytes.
        """
        name = cls.clean_text(cv_data.get("name")) or "Cover Letter"
        contact_line = cls.build_contact_line(cv_data)
        today = date.today().strftime("%B %d, %Y")
        header = f"{name}\n{contact_line}\n\n{today}\n\n" if contact_line else f"{name}\n\n{today}\n\n"
        document_text = cls.normalize_letter_spacing(f"{header}{letter_text}")

        doc = fitz.open()
        page = doc.new_page(width=612, height=792)
        margin = 54
        text_rect = fitz.Rect(margin, margin, 612 - margin, 792 - margin)
        remaining = page.insert_textbox(
            text_rect,
            document_text,
            fontsize=10.5,
            fontname="helv",
            color=(0, 0, 0),
            align=fitz.TEXT_ALIGN_LEFT,
        )

        if remaining < 0:
            page.clean_contents()
            page.insert_textbox(
                text_rect,
                document_text,
                fontsize=9.5,
                fontname="helv",
                color=(0, 0, 0),
                align=fitz.TEXT_ALIGN_LEFT,
            )

        return doc.tobytes()

    @staticmethod
    def word_count(text: str) -> int:
        """Count plain-text words."""
        return len(re.findall(r"\b[\w'-]+\b", text))

    @staticmethod
    def clean_text(value: object) -> str:
        """Normalize optional text values."""
        return str(value or "").strip()

    @classmethod
    def clean_phrase(cls, value: object) -> str:
        """Normalize generated phrases before using them in prose."""
        text = cls.clean_text(value)
        text = re.sub(r"\s+\?\s+", " - ", text)
        text = re.sub(r"\s*\|\s*live demo\b.*$", "", text, flags=re.IGNORECASE)
        text = re.sub(r"\b(live demo|source code|github)\b", "", text, flags=re.IGNORECASE)
        text = re.sub(r"\s+", " ", text)
        return text.strip(" .,:;|-")

    @classmethod
    def sanitize_role(cls, value: object) -> str:
        """Remove portfolio/link noise from a target role."""
        text = cls.clean_phrase(value)
        text = re.sub(r"\s*\((project|contract|internship|remote)\)\s*", " ", text, flags=re.IGNORECASE)
        text = re.sub(
            r"\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{4}\b.*$",
            "",
            text,
            flags=re.IGNORECASE,
        )
        return cls.clean_phrase(text)

    @classmethod
    def sanitize_company(cls, value: object) -> str:
        """Return a company name only when it is not a placeholder."""
        text = cls.clean_phrase(value)
        return "" if text.lower() in cls.GENERIC_COMPANY_NAMES else text

    @staticmethod
    def company_reference(company: str) -> str:
        """Format the company reference for an opening sentence."""
        return f"at {company}" if company else "with your team"

    @classmethod
    def normalize_letter_spacing(cls, text: str) -> str:
        """Keep generated letter text compact and ATS-readable."""
        normalized = re.sub(r"\n{3,}", "\n\n", text.strip())
        return "\n".join(line.rstrip() for line in normalized.splitlines())

    @classmethod
    def build_contact_line(cls, cv_data: dict[str, Any]) -> str:
        """Build a single contact line for the PDF header."""
        contact_parts = [
            cls.clean_text(cv_data.get("email")),
            cls.clean_text(cv_data.get("phone")),
            cls.clean_text(cv_data.get("location")),
            cls.clean_text(cv_data.get("website")),
        ]
        return " | ".join(part for part in contact_parts if part)

    @classmethod
    def extract_skill_terms(cls, cv_data: dict[str, Any]) -> list[str]:
        """Extract skill terms from CV skills entries."""
        terms: list[str] = []
        for entry in cv_data.get("skills", []) or []:
            if not isinstance(entry, dict):
                continue
            label = cls.clean_phrase(entry.get("label"))
            details = cls.clean_phrase(entry.get("details"))
            if label and label.lower() not in cls.SKILL_CATEGORY_LABELS:
                terms.append(label)
            if details:
                terms.extend(part.strip() for part in re.split(r"[,;/|]", details) if part.strip())
        return cls.unique_terms(terms)[:8]

    @classmethod
    def extract_keywords(cls, job_description: str) -> list[str]:
        """Extract high-signal keywords from a pasted job description."""
        candidates = re.findall(r"\b[A-Za-z][A-Za-z0-9+#.-]{2,}\b", job_description)
        useful = [
            word
            for word in candidates
            if word.lower() not in cls.KEYWORD_STOP_WORDS
            and word.lower() not in cls.SKILL_CATEGORY_LABELS
            and not word.isdigit()
        ]
        return cls.unique_terms(useful)[:8]

    @classmethod
    def extract_strongest_experience(cls, cv_data: dict[str, Any]) -> str:
        """Summarize the first complete experience entry."""
        for entry in cv_data.get("experience", []) or []:
            if not isinstance(entry, dict):
                continue
            position = cls.clean_text(entry.get("position"))
            company = cls.clean_text(entry.get("company"))
            highlights = entry.get("highlights") if isinstance(entry.get("highlights"), list) else []
            first_highlight = cls.clean_phrase(highlights[0]) if highlights else ""
            if position and company:
                if first_highlight:
                    return f"In my work as {position} at {company}, a key result was: {first_highlight}."
                return f"My experience as {position} at {company} has strengthened my ability to deliver in similar environments."
        return "My CV shows repeated ownership across planning, execution, and measurable product delivery."

    @classmethod
    def extract_project(cls, cv_data: dict[str, Any]) -> str:
        """Summarize a relevant project when available."""
        for entry in cv_data.get("projects", []) or []:
            if not isinstance(entry, dict):
                continue
            name = cls.sanitize_project_name(entry.get("name"))
            summary = cls.sanitize_project_summary(entry.get("summary"))
            if name and summary:
                return f"A representative project is {name}: {summary}."
            if name:
                return f"A representative project is {name}, which reflects my ability to turn ideas into usable results."
        return ""

    @classmethod
    def sanitize_project_name(cls, value: object) -> str:
        """Clean portfolio project names before using them in a sentence."""
        text = cls.clean_phrase(value)
        text = re.sub(
            r"\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{4}\b",
            "",
            text,
            flags=re.IGNORECASE,
        )
        return cls.clean_phrase(text)

    @classmethod
    def sanitize_project_summary(cls, value: object) -> str:
        """Clean noisy project summaries and skip link-only role labels."""
        text = cls.sanitize_role(value)
        if not text:
            return ""
        if re.fullmatch(r"[A-Za-z -]*(developer|engineer|designer)[A-Za-z -]*", text, flags=re.IGNORECASE):
            return ""
        return text.rstrip(".")

    @classmethod
    def infer_country(cls, location: str) -> str:
        """Infer a country or market label from a free-form location."""
        if not location:
            return ""
        for country in cls.COUNTRY_HINTS:
            if re.search(rf"\b{re.escape(country)}\b", location, re.IGNORECASE):
                return country
        parts = [part.strip() for part in location.split(",") if part.strip()]
        return parts[-1] if len(parts) > 1 else ""

    @classmethod
    def location_sentence(cls, location: str, country: str) -> str:
        """Build a short sentence that uses location without overclaiming."""
        if location and country:
            return f"Based in {location}, I understand the expectations of teams hiring in {country} and remote-first markets. "
        if location:
            return f"Based in {location}, I bring location-aware communication and collaboration habits. "
        return ""

    @staticmethod
    def unique_terms(values: list[str]) -> list[str]:
        """Return values in order while removing case-insensitive duplicates."""
        seen: set[str] = set()
        unique: list[str] = []
        for value in values:
            cleaned = re.sub(r"\s+", " ", value).strip(" .,:;()[]|-")
            key = cleaned.lower()
            if cleaned and key not in seen:
                seen.add(key)
                unique.append(cleaned)
        return unique
