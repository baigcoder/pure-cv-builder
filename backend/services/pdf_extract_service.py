"""
PDF Data Extraction Service — Model-Free Edition.

Extracts structured CV data from uploaded PDF files using:
- PyMuPDF (fitz) for text extraction
- Regex / heuristic rules for intelligent section parsing

NO external AI API is required.
"""

import logging
import re
from typing import Optional

logger = logging.getLogger(__name__)

try:
    import fitz  # PyMuPDF
except ImportError:
    fitz = None
    logger.warning(
        "PyMuPDF not installed. PDF extraction will not work. "
        "Install with: pip install PyMuPDF"
    )

# ---------------------------------------------------------------------------
# Section heading patterns (case-insensitive)
# ---------------------------------------------------------------------------
_SECTION_ALIASES: dict[str, list[str]] = {
    "experience": [
        "experience", "work experience", "professional experience",
        "employment history", "employment", "work history",
        "professional background", "career history",
    ],
    "education": [
        "education", "academic background", "academic history",
        "educational background", "qualifications", "academic qualifications",
    ],
    "skills": [
        "skills", "technical skills", "core competencies", "competencies",
        "proficiencies", "areas of expertise", "technologies",
        "tools & technologies", "tools and technologies", "tech stack",
        "programming languages", "key skills",
        "certifications, skills & interests",
        "certifications, skills and interests",
        "certifications skills interests",
    ],
    "projects": [
        "projects", "personal projects", "academic projects",
        "side projects", "portfolio", "key projects",
    ],
    "publications": [
        "publications", "research", "papers", "research publications",
    ],
    "honors": [
        "honors", "awards", "honors & awards", "honors and awards",
        "achievements", "accomplishments", "certifications",
        "certificates", "licenses", "certifications & licenses",
        "selected honors", "selected awards",
    ],
    "patents": ["patents", "patent"],
    "talks": ["talks", "invited talks", "presentations", "speaking"],
    "summary": [
        "summary", "professional summary", "profile", "objective",
        "career objective", "about", "about me", "professional profile",
        "career summary", "overview",
    ],
}

# Build a reverse lookup: normalised heading text -> section key
_HEADING_MAP: dict[str, str] = {}
for section_key, aliases in _SECTION_ALIASES.items():
    for alias in aliases:
        _HEADING_MAP[alias.lower()] = section_key

# Regex helpers
_EMAIL_RE = re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+")
_PHONE_RE = re.compile(
    r"(?:\+?\d{1,3}[\s.-]?)?\(?\d{2,4}\)?[\s.-]?\d{3,4}[\s.-]?\d{3,4}"
)
_LINKEDIN_RE = re.compile(
    r"(?:linkedin\.com/in/|linkedin:\s*)([\w-]+)", re.I
)
_GITHUB_RE = re.compile(
    r"(?:github\.com/|github:\s*)([\w-]+)", re.I
)
_WEBSITE_RE = re.compile(
    r"https?://(?!(?:linkedin|github)\.com)[\w./\-?&#=]+"
)
_DATE_RE = re.compile(
    r"(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|"
    r"Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|"
    r"Nov(?:ember)?|Dec(?:ember)?)\s*\.?\s*\d{4}|\d{4}|"
    r"Present|Current|Now|Ongoing",
    re.I,
)
_DATE_RANGE_RE = re.compile(
    r"("
    r"(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|"
    r"Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|"
    r"Nov(?:ember)?|Dec(?:ember)?)\s*\.?\s*\d{4}|\d{4}"
    r")"
    r"\s*[-–—to]+\s*"
    r"("
    r"(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|"
    r"Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|"
    r"Nov(?:ember)?|Dec(?:ember)?)\s*\.?\s*\d{4}|\d{4}|"
    r"Present|Current|Now|Ongoing"
    r")",
    re.I,
)
_BULLET_RE = re.compile(r"^\s*[•●◦▪▸►\-–—\*✓✔⊳⊲➤➢❖⬥]\s*")
_LOCATION_RE = re.compile(
    r"([A-Z][\w\s]+,\s*[A-Z]{2}(?:\s+\d{5})?|"
    r"[A-Z][\w\s]+,\s*[A-Z][\w\s]+(?:,\s*[A-Z][\w\s]+)?)"
)

# Override a few patterns with clean Unicode forms. Some earlier source text
# contains mojibake, while PDF extraction returns real bullets and dashes.
_DATE_RANGE_RE = re.compile(
    r"("
    r"(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|"
    r"Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|"
    r"Nov(?:ember)?|Dec(?:ember)?)\s*\.?\s*\d{4}|\d{4}"
    r")"
    r"\s*(?:-|–|—|\bto\b)\s*"
    r"("
    r"(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|"
    r"Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|"
    r"Nov(?:ember)?|Dec(?:ember)?)\s*\.?\s*\d{4}|\d{4}|"
    r"Present|Current|Now|Ongoing"
    r")",
    re.I,
)
_BULLET_RE = re.compile(r"^\s*(?:[•●◦▪▸►\-–—*✓✔⊳⊲➤➢❖⬥]|\uf0b7)\s*")
_LOCATION_RE = re.compile(
    r"([A-Z][\w ]+,\s*[A-Z]{2}(?:\s+\d{5})?|"
    r"[A-Z][\w ]+,\s*[A-Z][\w ]+(?:,\s*[A-Z][\w ]+)?)"
)
_WEBSITE_RE = re.compile(
    r"(?<![@\w.-])(?:https?://)?(?!(?:linkedin|github)\.com\b)(?:www\.)?"
    r"[\w-]+(?:\.[\w-]+)+(?::\d+)?(?:/[\w./\-?&#=]*)?(?!@)",
    re.I,
)
_PAGE_FOOTER_RE = re.compile(r"^.+\s+[–-]\s+\d+\s*/\s*\d+\s*$")
_LAST_UPDATED_RE = re.compile(r"^last\s+updated\b", re.I)
_DURATION_RE = re.compile(
    r"^\d+\s+(?:year|years|month|months)(?:\s+\d+\s+(?:month|months))?$",
    re.I,
)
_BULLET_ONLY_RE = re.compile(r"^\s*(?:[•●◦▪▸►\-–—*✓✔⊳⊲➤➢❖⬥]|\uf0b7)\s*$")
_STACKS_RE = re.compile(r"^stacks?\s*:\s*(.+)$", re.I)


def _clean_pdf_line(line: str) -> str:
    """Normalize text artifacts produced by PDF extraction."""
    cleaned = line.replace("\xad", "")
    cleaned = re.sub(r"[\uf000-\uf8ff]", "", cleaned)
    return re.sub(r"\s+", " ", cleaned).strip()


def _heading_key(line: str) -> str:
    normalized = _clean_pdf_line(line).lower().rstrip(":")
    normalized = normalized.replace("&", "and")
    normalized = re.sub(r"\s+", " ", normalized).strip()
    return normalized


def _coalesce_bullet_lines(lines: list[str]) -> list[str]:
    """Attach standalone PDF bullet glyphs to the text line that follows."""
    output: list[str] = []
    pending_bullet = False

    for line in lines:
        stripped = line.strip()
        if not stripped:
            if output and output[-1].strip():
                output.append(line)
            continue

        if _BULLET_ONLY_RE.match(stripped):
            pending_bullet = True
            continue

        if pending_bullet:
            output.append(f"• {stripped}")
            pending_bullet = False
        else:
            output.append(line)

    return output


def _append_wrapped(items: list[str], text: str) -> None:
    """Append wrapped PDF text to the previous item when it is clearly continued."""
    cleaned = text.strip()
    if not cleaned:
        return
    if items and not re.search(r"[.!?)]$", items[-1].strip()):
        items[-1] = f"{items[-1].rstrip()} {cleaned}"
    else:
        items.append(cleaned)


def _looks_like_technology_list(text: str) -> bool:
    lowered = text.lower()
    tech_words = [
        "react", "next", "node", "express", "fastify", "mongo", "postgres",
        "redis", "tailwind", "typescript", "javascript", "python", "docker",
        "kubernetes", "git", "linux", "sql", "aws", "azure",
    ]
    return text.count(",") >= 2 and any(word in lowered for word in tech_words)


def _looks_like_role_title(text: str) -> bool:
    lowered = text.lower()
    role_words = [
        "engineer", "developer", "manager", "lead", "director", "analyst",
        "consultant", "specialist", "designer", "architect", "intern",
        "founder", "officer", "scientist", "researcher", "administrator",
    ]
    return any(word in lowered for word in role_words)


def _looks_like_organization_name(text: str) -> bool:
    lowered = text.lower()
    organization_words = [
        "inc", "llc", "ltd", "corp", "corporation", "company", "technologies",
        "labs", "systems", "solutions", "university", "group", "studio",
    ]
    return any(word in lowered for word in organization_words)


def _looks_like_experience_entry_start(line: str, next_line: str) -> bool:
    if len(line) > 120 or line.endswith((".", ";")):
        return False
    if _DATE_RE.fullmatch(line) or _DATE_RANGE_RE.search(line):
        return False
    if _looks_like_role_title(next_line) or _DATE_RANGE_RE.search(next_line):
        return True
    return _looks_like_organization_name(line)


class PDFExtractService:
    """Service for extracting CV data from uploaded PDF files (model-free)."""

    # ------------------------------------------------------------------
    # Public helpers
    # ------------------------------------------------------------------
    @staticmethod
    def is_available() -> bool:
        """Check if PDF extraction is available (PyMuPDF installed)."""
        return fitz is not None

    @staticmethod
    def is_ai_available() -> bool:
        """AI is no longer required — always True."""
        return True

    # ------------------------------------------------------------------
    # Text extraction
    # ------------------------------------------------------------------
    @staticmethod
    def extract_text_from_pdf(pdf_bytes: bytes) -> str:
        if fitz is None:
            raise RuntimeError("PyMuPDF is not installed.")

        try:
            doc = fitz.open(stream=pdf_bytes, filetype="pdf")
            text_parts = []
            for page_num in range(len(doc)):
                page = doc[page_num]
                text = page.get_text("text")
                if text.strip():
                    text_parts.append(text)
            doc.close()

            full_text = "\n\n".join(text_parts)
            if not full_text.strip():
                raise ValueError(
                    "No readable text found in the PDF. "
                    "The PDF may be image-based or scanned."
                )
            normalized_lines = [_clean_pdf_line(line) for line in full_text.splitlines()]
            return "\n".join(normalized_lines).strip()
        except (RuntimeError, ValueError):
            raise
        except Exception as e:
            logger.error(f"PDF text extraction failed: {e}")
            raise ValueError(f"Failed to read PDF file: {e}")

    # ------------------------------------------------------------------
    # Main pipeline
    # ------------------------------------------------------------------
    @staticmethod
    def extract_from_pdf(pdf_bytes: bytes) -> dict:
        raw_text = PDFExtractService.extract_text_from_pdf(pdf_bytes)
        logger.info(f"Extracted {len(raw_text)} chars from PDF")

        structured = PDFExtractService._parse_cv_text(raw_text)
        logger.info(f"Parsed CV for: {structured.get('name', 'Unknown')}")

        return {
            "cv_data": structured,
            "raw_text_length": len(raw_text),
            "raw_text_preview": raw_text[:500],
        }

    # ------------------------------------------------------------------
    # Heuristic CV parser
    # ------------------------------------------------------------------
    @staticmethod
    def _parse_cv_text(text: str) -> dict:
        """Parse raw CV text into structured data using heuristics."""
        lines = text.splitlines()

        # 1. Extract contact info from entire text
        contact = PDFExtractService._extract_contact(text, lines)

        # 2. Split text into sections
        sections = PDFExtractService._split_into_sections(lines)

        # 3. Parse each section
        experience = PDFExtractService._parse_experience(
            sections.get("experience", [])
        )
        education = PDFExtractService._parse_education(
            sections.get("education", [])
        )
        skills = PDFExtractService._parse_skills(
            sections.get("skills", [])
        )
        projects = PDFExtractService._parse_projects(
            sections.get("projects", [])
        )
        summary = PDFExtractService._parse_summary(
            sections.get("summary", [])
        )
        honors = PDFExtractService._parse_honors(
            sections.get("honors", [])
        )
        publications = PDFExtractService._parse_publications(
            sections.get("publications", [])
        )
        patents = PDFExtractService._parse_numbered_items(
            sections.get("patents", []), "number"
        )
        talks = PDFExtractService._parse_numbered_items(
            sections.get("talks", []), "reversed_number"
        )

        return {
            "name": contact.get("name", ""),
            "headline": contact.get("headline", ""),
            "email": contact.get("email", ""),
            "phone": contact.get("phone", ""),
            "location": contact.get("location", ""),
            "website": contact.get("website", ""),
            "linkedin": contact.get("linkedin", ""),
            "github": contact.get("github", ""),
            "summary": summary,
            "experience": experience,
            "education": education,
            "skills": skills,
            "projects": projects,
            "publications": publications,
            "honors": honors,
            "patents": patents,
            "talks": talks,
        }

    # ------------------------------------------------------------------
    # Contact extraction
    # ------------------------------------------------------------------
    @staticmethod
    def _extract_contact(text: str, lines: list[str]) -> dict:
        contact: dict[str, str] = {}

        # Email
        m = _EMAIL_RE.search(text)
        if m:
            contact["email"] = m.group()

        # Phone
        m = _PHONE_RE.search(text)
        if m:
            contact["phone"] = m.group().strip()

        # LinkedIn
        m = _LINKEDIN_RE.search(text)
        if m:
            contact["linkedin"] = m.group(1)

        # GitHub
        m = _GITHUB_RE.search(text)
        if m:
            contact["github"] = m.group(1)

        # Website
        for line in lines[:15]:
            stripped = line.strip()
            if not stripped or _EMAIL_RE.search(stripped):
                continue
            m = _WEBSITE_RE.fullmatch(stripped)
            if m:
                contact["website"] = m.group()
                break

        # Name — usually the very first non-empty line
        for line in lines[:5]:
            stripped = line.strip()
            if not stripped:
                continue
            if _LAST_UPDATED_RE.match(stripped) or _PAGE_FOOTER_RE.match(stripped):
                continue
            # Skip lines that look like contact info
            if _EMAIL_RE.search(stripped) or _PHONE_RE.search(stripped):
                continue
            if any(
                stripped.lower().startswith(p)
                for p in ("http", "linkedin", "github", "+", "(")
            ):
                continue
            # Likely the name
            contact["name"] = stripped
            break

        # Headline — second substantial line (before first section)
        name_found = False
        contact_block_started = False
        for line in lines[:10]:
            stripped = line.strip()
            if not stripped:
                continue
            if _LAST_UPDATED_RE.match(stripped) or _PAGE_FOOTER_RE.match(stripped):
                continue
            if not name_found:
                name_found = True
                continue
            # Skip contact-info lines
            if (
                _EMAIL_RE.search(stripped)
                or _PHONE_RE.search(stripped)
                or _WEBSITE_RE.fullmatch(stripped)
                or _LOCATION_RE.fullmatch(stripped)
            ):
                contact_block_started = True
                continue
            if contact_block_started:
                break
            if any(
                stripped.lower().startswith(p)
                for p in ("http", "linkedin", "github", "+", "(")
            ):
                continue
            low = stripped.lower()
            if low in _HEADING_MAP:
                break
            if re.fullmatch(r"[a-z0-9_.-]{2,40}", stripped):
                continue
            # If it looks like a title/headline (not too long)
            if len(stripped) < 120:
                contact["headline"] = stripped
                break

        # Location - prefer contact-line pipe segments before section content.
        for line in lines[:8]:
            for part in re.split(r"\s*\|\s*", line):
                part = part.strip()
                if not part:
                    continue
                if (
                    not _EMAIL_RE.search(part)
                    and not _PHONE_RE.search(part)
                    and not part.lower().startswith(("github", "linkedin", "http"))
                    and re.search(r"\b(?:Pakistan|India|USA|United States|UK|Canada|UAE)\b", part, re.I)
                ):
                    contact["location"] = part
                    break
            if contact.get("location"):
                break

        # Location - look for city/state patterns in top area
        for line in lines[:15]:
            if contact.get("location"):
                break
            stripped = line.strip()
            if (
                not stripped
                or _LAST_UPDATED_RE.match(stripped)
                or _PAGE_FOOTER_RE.match(stripped)
                or stripped == contact.get("name")
            ):
                continue
            m = _LOCATION_RE.fullmatch(stripped)
            if m:
                contact["location"] = m.group().strip()
                break

        if not contact.get("location"):
            for line in lines[:8]:
                for part in re.split(r"\s*\|\s*", line):
                    part = part.strip()
                    if not part:
                        continue
                    if (
                        not _EMAIL_RE.search(part)
                        and not _PHONE_RE.search(part)
                        and re.search(r"\b(?:Pakistan|India|USA|United States|UK|Canada|UAE)\b", part, re.I)
                    ):
                        contact["location"] = part
                        break
                if contact.get("location"):
                    break

        return contact

    # ------------------------------------------------------------------
    # Section splitting
    # ------------------------------------------------------------------
    @staticmethod
    def _split_into_sections(lines: list[str]) -> dict[str, list[str]]:
        """Split lines into named sections based on heading detection."""
        sections: dict[str, list[str]] = {}
        current_section: Optional[str] = None
        current_lines: list[str] = []

        for line in lines:
            stripped = line.strip()
            low = _heading_key(stripped)

            # Check if this line is a section heading
            if low in _HEADING_MAP and len(stripped) < 60:
                # Save previous section
                if current_section and current_lines:
                    sections[current_section] = sections.get(current_section, []) + current_lines
                current_section = _HEADING_MAP[low]
                current_lines = []
            elif current_section is not None:
                current_lines.append(line)

        # Save last section
        if current_section and current_lines:
            sections[current_section] = sections.get(current_section, []) + current_lines

        return sections

    # ------------------------------------------------------------------
    # Section parsers
    # ------------------------------------------------------------------
    @staticmethod
    def _parse_summary(lines: list[str]) -> str:
        parts = [l.strip() for l in lines if l.strip()]
        return " ".join(parts)

    @staticmethod
    def _parse_experience(lines: list[str]) -> list[dict]:
        if not lines:
            return []
        entries = PDFExtractService._split_entries_by_dates(lines)
        result = []
        for entry_lines in entries:
            entry = PDFExtractService._parse_exp_entry(entry_lines)
            if entry.get("company") or entry.get("position"):
                result.append(entry)
        return result

    @staticmethod
    def _parse_exp_entry(lines: list[str]) -> dict:
        entry = {
            "company": "", "position": "", "start_date": "",
            "end_date": "", "location": "", "summary": "",
            "highlights": [],
        }
        lines = [
            line.strip() for line in lines
            if line.strip()
            and not _PAGE_FOOTER_RE.match(line.strip())
            and not _DURATION_RE.match(line.strip())
        ]
        if not lines:
            return entry

        # First line often: "Company, Position" or "Position at Company".
        first = lines[0].strip()
        date_match = _DATE_RANGE_RE.search(first)
        if date_match:
            entry["start_date"] = date_match.group(1)
            entry["end_date"] = date_match.group(2)
            first = first[: date_match.start()].strip().rstrip("|-??,")

        start_index = 1
        for sep in [", ", " at ", " | ", " - ", " ? ", " ? "]:
            if sep in first:
                parts = first.split(sep, 1)
                if sep == ", ":
                    entry["company"] = parts[0].strip()
                    entry["position"] = parts[1].strip()
                else:
                    entry["position"] = parts[0].strip()
                    entry["company"] = parts[1].strip()
                break
        else:
            second = lines[1].strip() if len(lines) > 1 else ""
            if second and not _DATE_RANGE_RE.search(second) and not _BULLET_RE.match(second):
                if _looks_like_role_title(first) and not _looks_like_role_title(second):
                    entry["position"] = first
                    entry["company"] = second
                else:
                    entry["company"] = first
                    entry["position"] = second
                start_index = 2
            else:
                entry["position"] = first

        for line in lines[start_index:]:
            stripped = line.strip()
            if not stripped:
                continue

            dr = _DATE_RANGE_RE.search(stripped)
            if dr:
                if not entry["start_date"]:
                    entry["start_date"] = dr.group(1)
                    entry["end_date"] = dr.group(2)
                remainder = stripped[: dr.start()].strip().rstrip("|-??,")
                if remainder and not entry["company"]:
                    entry["company"] = remainder
                continue

            if not entry["location"] and _LOCATION_RE.match(stripped):
                entry["location"] = stripped
                continue

            if _BULLET_RE.match(stripped):
                bullet = _BULLET_RE.sub("", stripped).strip()
                if bullet:
                    entry["highlights"].append(bullet)
            elif len(stripped) > 15 and not entry["company"]:
                entry["company"] = stripped
            elif len(stripped) > 15:
                entry["highlights"].append(stripped)

        return entry

    @staticmethod
    def _parse_education(lines: list[str]) -> list[dict]:
        if not lines:
            return []
        entries = PDFExtractService._split_education_entries(lines)
        result = []
        for entry_lines in entries:
            entry = PDFExtractService._parse_edu_entry(entry_lines)
            if entry.get("institution") or entry.get("degree"):
                result.append(entry)
        return result

    @staticmethod
    def _split_education_entries(lines: list[str]) -> list[list[str]]:
        cleaned = [
            line.strip() for line in _coalesce_bullet_lines(lines)
            if line.strip() and not _PAGE_FOOTER_RE.match(line.strip())
        ]
        if not cleaned:
            return []

        entries: list[list[str]] = []
        current: list[str] = []

        for index, line in enumerate(cleaned):
            is_new_school = (
                current
                and not _BULLET_RE.match(line)
                and not _DATE_RANGE_RE.search(line)
                and not _DATE_RE.fullmatch(line)
                and index + 1 < len(cleaned)
                and (_DATE_RANGE_RE.search(cleaned[index + 1]) or _DATE_RE.fullmatch(cleaned[index + 1]))
            )
            if is_new_school:
                entries.append(current)
                current = [line]
            else:
                current.append(line)

        if current:
            entries.append(current)

        return entries

    @staticmethod
    def _parse_edu_entry(lines: list[str]) -> dict:
        entry = {
            "institution": "", "area": "", "degree": "",
            "start_date": "", "end_date": "", "location": "",
            "summary": "", "highlights": [],
        }
        lines = [
            line.strip() for line in lines
            if line.strip() and not _PAGE_FOOTER_RE.match(line.strip())
        ]
        if not lines:
            return entry

        degree_keywords = [
            "bachelor", "master", "phd", "ph.d", "doctorate", "associate",
            "diploma", "certificate", "b.s", "b.a", "m.s", "m.a",
            "mba", "bs", "ba", "ms", "ma", "bsc", "msc", "b.sc", "m.sc",
            "b.tech", "m.tech", "b.eng", "m.eng",
        ]

        first = lines[0].strip()
        date_match = _DATE_RANGE_RE.search(first)
        if date_match:
            entry["start_date"] = date_match.group(1)
            entry["end_date"] = date_match.group(2)
            first = first[: date_match.start()].strip().rstrip("|-??,")

        if any(kw == first.lower() or kw in first.lower() for kw in degree_keywords):
            entry["degree"] = first
        else:
            entry["institution"] = first

        for line in _coalesce_bullet_lines(lines[1:]):
            stripped = line.strip()
            if not stripped:
                continue

            dr = _DATE_RANGE_RE.search(stripped)
            if dr:
                if not entry["start_date"]:
                    entry["start_date"] = dr.group(1)
                    entry["end_date"] = dr.group(2)
                continue

            low = stripped.lower()
            if any(kw in low for kw in degree_keywords) and not entry["degree"]:
                for sep in [" in ", " of ", " ? ", " ? ", " - "]:
                    if sep in stripped:
                        parts = stripped.split(sep, 1)
                        entry["degree"] = stripped
                        entry["area"] = parts[1].strip()
                        break
                else:
                    entry["degree"] = stripped
                continue

            if any(kw in low for kw in degree_keywords) and not entry["area"]:
                entry["area"] = stripped
                continue

            if _BULLET_RE.match(stripped):
                bullet = _BULLET_RE.sub("", stripped).strip()
                if bullet:
                    entry["highlights"].append(bullet)
                continue

            if not entry["location"] and _LOCATION_RE.match(stripped):
                if not entry["institution"] and "," in stripped:
                    institution, area = stripped.split(",", 1)
                    entry["institution"] = institution.strip()
                    entry["area"] = area.strip()
                else:
                    entry["location"] = stripped
                continue

            if not entry["institution"]:
                if "," in stripped:
                    institution, area = stripped.split(",", 1)
                    entry["institution"] = institution.strip()
                    entry["area"] = area.strip()
                else:
                    entry["institution"] = stripped
            elif not entry["area"] and "," in stripped:
                institution, area = stripped.split(",", 1)
                entry["institution"] = entry["institution"] or institution.strip()
                entry["area"] = area.strip()
            elif not entry["area"] and entry["degree"]:
                entry["area"] = stripped

        return entry

    @staticmethod
    def _parse_skills(lines: list[str]) -> list[dict]:
        if not lines:
            return []
        skills: list[dict] = []
        current_label = ""
        current_details: list[str] = []

        for line in _coalesce_bullet_lines(lines):
            stripped = line.strip()
            if not stripped:
                continue

            was_bullet = bool(_BULLET_RE.match(stripped))
            if _BULLET_RE.match(stripped):
                stripped = _BULLET_RE.sub("", stripped).strip()
                if not stripped:
                    continue

            # Pattern: "Label: detail1, detail2"
            colon_match = re.match(r"^([^:]{2,40}):\s*(.+)$", stripped)
            if colon_match:
                if current_label:
                    skills.append({
                        "label": current_label,
                        "details": ", ".join(current_details),
                    })
                current_label = colon_match.group(1).strip()
                current_details = [colon_match.group(2).strip()]
                continue

            if (
                was_bullet
                and current_label
                and current_label.lower() in {"certifications", "certificates", "licenses"}
                and _looks_like_technology_list(stripped)
            ):
                skills.append({
                    "label": current_label,
                    "details": ", ".join(current_details),
                })
                current_label = "Technologies"
                current_details = [stripped]
                continue

            # Continuation
            if current_label:
                current_details.append(stripped)
            else:
                skills.append({"label": stripped, "details": ""})

        if current_label:
            skills.append({
                "label": current_label,
                "details": ", ".join(current_details),
            })

        # If we got no structured skills, treat each line as a skill
        if not skills:
            for line in lines:
                s = line.strip()
                if s:
                    skills.append({"label": s, "details": ""})

        return skills

    @staticmethod
    def _parse_projects(lines: list[str]) -> list[dict]:
        if not lines:
            return []
        entries = PDFExtractService._split_project_entries(lines)
        result = []
        for entry_lines in entries:
            proj: dict = {
                "name": "", "date": "", "start_date": "", "end_date": "",
                "location": "", "url": "", "summary": "",
                "highlights": [],
            }
            if not entry_lines:
                continue

            first = entry_lines[0].strip()
            dr = _DATE_RANGE_RE.search(first)
            if dr:
                proj["start_date"] = dr.group(1)
                proj["end_date"] = dr.group(2)
                first = first[: dr.start()].strip().rstrip("|-–—,")
            proj["name"] = first

            for line in _coalesce_bullet_lines(entry_lines[1:]):
                stripped = line.strip()
                if not stripped:
                    continue
                dr = _DATE_RANGE_RE.search(stripped)
                if dr:
                    proj["start_date"] = dr.group(1)
                    proj["end_date"] = dr.group(2)
                    continue
                if _DATE_RE.fullmatch(stripped):
                    proj["date"] = stripped
                    continue
                stacks_match = _STACKS_RE.match(stripped)
                if stacks_match:
                    stack_text = f"Tech stack: {stacks_match.group(1).strip()}"
                    proj["highlights"].append(stack_text)
                    continue
                if _BULLET_RE.match(stripped):
                    bullet = _BULLET_RE.sub("", stripped).strip()
                    if bullet:
                        proj["highlights"].append(bullet)
                elif not proj["summary"]:
                    proj["summary"] = stripped
                elif not proj["highlights"]:
                    continue
                else:
                    _append_wrapped(proj["highlights"], stripped)

            if proj["name"]:
                result.append(proj)
        return result

    @staticmethod
    def _split_project_entries(lines: list[str]) -> list[list[str]]:
        cleaned = [
            line.strip() for line in _coalesce_bullet_lines(lines)
            if line.strip() and not _PAGE_FOOTER_RE.match(line.strip())
        ]
        entries: list[list[str]] = []
        current: list[str] = []

        for index, line in enumerate(cleaned):
            next_line = cleaned[index + 1] if index + 1 < len(cleaned) else ""
            starts_project = (
                not _BULLET_RE.match(line)
                and not _DATE_RE.fullmatch(line)
                and not _DATE_RANGE_RE.search(line)
                and not _STACKS_RE.match(line)
                and bool(next_line)
                and (_DATE_RE.fullmatch(next_line) or _DATE_RANGE_RE.search(next_line))
            )

            if starts_project and current:
                entries.append(current)
                current = [line]
            else:
                current.append(line)

        if current:
            entries.append(current)

        return entries

    @staticmethod
    def _parse_honors(lines: list[str]) -> list[dict]:
        if not lines:
            return []
        honors = []
        for line in lines:
            stripped = line.strip()
            if not stripped:
                continue
            bullet_text = _BULLET_RE.sub("", stripped).strip()
            if bullet_text:
                honors.append({"bullet": bullet_text})
        return honors

    @staticmethod
    def _parse_publications(lines: list[str]) -> list[dict]:
        if not lines:
            return []
        cleaned = [line.strip() for line in lines if line.strip() and not _PAGE_FOOTER_RE.match(line.strip())]
        pubs = []
        current: list[str] = []
        for line in cleaned:
            current.append(line)
            if _DATE_RE.fullmatch(line) or (len(current) >= 4 and _DATE_RE.search(line)):
                pubs.append(PDFExtractService._make_pub(current))
                current = []
        if current:
            pubs.append(PDFExtractService._make_pub(current))
        return pubs

    @staticmethod
    def _parse_numbered_items(lines: list[str], key: str) -> list[dict]:
        items = []
        for line in lines:
            stripped = line.strip()
            if not stripped or _PAGE_FOOTER_RE.match(stripped):
                continue
            item = re.sub(r"^\s*\d+[.)]\s*", "", stripped).strip()
            item = _BULLET_RE.sub("", item).strip()
            if item:
                items.append({key: item})
        return items

    @staticmethod
    def _make_pub(lines: list[str]) -> dict:
        pub = {
            "title": "", "authors": "", "journal": "",
            "date": "", "doi": "", "url": "", "summary": "",
        }
        if lines:
            pub["title"] = _BULLET_RE.sub("", lines[0]).strip()
        if len(lines) > 1:
            pub["authors"] = lines[1]
        if len(lines) > 2:
            pub["journal"] = lines[2]
        if len(lines) > 3:
            pub["date"] = lines[3]

        full = " ".join(lines)
        doi_match = re.search(r"\b10\.\d{4,9}/\S+", full)
        if doi_match:
            pub["doi"] = doi_match.group(0).rstrip(".,;)")
        if not pub["date"]:
            dates = _DATE_RE.findall(full)
            if dates:
                pub["date"] = dates[-1]

        return pub

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------
    @staticmethod
    def _split_entries_by_dates(lines: list[str]) -> list[list[str]]:
        """Split section lines into entries, supporting date ranges at the
        beginning or end of an entry."""
        entries: list[list[str]] = []
        current: list[str] = []
        current_has_date = False

        cleaned = _coalesce_bullet_lines(lines)
        for index, line in enumerate(cleaned):
            stripped = line.strip()
            if not stripped:
                if current:
                    current.append(line)
                continue
            if _PAGE_FOOTER_RE.match(stripped) or _DURATION_RE.match(stripped):
                continue

            next_line = ""
            for later_line in cleaned[index + 1:]:
                if later_line.strip():
                    next_line = later_line.strip()
                    break

            if (
                current
                and current_has_date
                and not _BULLET_RE.match(stripped)
                and _looks_like_experience_entry_start(stripped, next_line)
            ):
                while current and not current[-1].strip():
                    current.pop()
                if current:
                    entries.append(current)
                current = [line]
                current_has_date = bool(_DATE_RANGE_RE.search(stripped))
                continue

            if stripped and not _BULLET_RE.match(stripped) and current:
                trailing_blanks = 0
                for prev in reversed(current):
                    if not prev.strip():
                        trailing_blanks += 1
                    else:
                        break
                if trailing_blanks >= 1 and len(stripped) < 120:
                    while current and not current[-1].strip():
                        current.pop()
                    if current:
                        entries.append(current)
                    current = [line]
                    current_has_date = bool(_DATE_RANGE_RE.search(stripped))
                    continue

            current.append(line)
            if _DATE_RANGE_RE.search(stripped):
                current_has_date = True

        while current and not current[-1].strip():
            current.pop()
        if current:
            entries.append(current)

        return entries
