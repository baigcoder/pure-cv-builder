"""
AI Suggestions Service using Groq API - Enhanced Version
Provides accurate, field-specific CV writing assistance
"""
import os
from groq import Groq

# Load .env file if it exists
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass  # python-dotenv not installed, use environment variables directly

# Initialize Groq client - requires GROQ_API_KEY environment variable
GROQ_API_KEY = os.getenv("GROQ_API_KEY")
if GROQ_API_KEY:
    client = Groq(api_key=GROQ_API_KEY)
else:
    client = None
    print("Warning: GROQ_API_KEY not set. AI suggestions will not work.")


class AIService:
    """Enhanced service for generating AI-powered CV suggestions."""

    @staticmethod
    def improve_summary(current_summary: str, job_title: str = "") -> str:
        """Improve a professional summary to be more impactful."""
        prompt = f"""You are a senior professional CV writer with 15+ years of experience.
Rewrite this professional summary to be:
- Compelling and confident (avoiding clichés like "passionate" or "team player")
- Achievement-focused with specific value propositions
- ATS-optimized with relevant keywords
- 2-3 sentences maximum, under 50 words

Current summary: {current_summary if current_summary else "No summary provided"}
Target role: {job_title if job_title else "General professional"}

Return ONLY the improved summary. No quotes, no explanation."""

        return AIService._call_groq(prompt)

    @staticmethod
    def generate_headline(name: str, role: str = "", experience: str = "") -> str:
        """Generate a compelling professional headline/tagline."""
        prompt = f"""You are a LinkedIn profile optimization expert.
Create a powerful, concise professional headline for:
Name: {name}
Current/Target Role: {role if role else "Professional"}
Background: {experience if experience else "Experienced professional"}

Requirements:
- 5-10 words maximum
- Include specialty or unique value
- No generic terms like "seeking opportunities"

Examples of great headlines:
- "ML Engineer | Ex-Google | NeurIPS Author"
- "Full-Stack Developer | React & Node.js | Startup Builder"
- "Product Manager | B2B SaaS | 10x Revenue Growth"

Return ONLY the headline. No quotes."""

        return AIService._call_groq(prompt)

    @staticmethod
    def improve_experience_bullet(bullet: str, role: str = "", company: str = "") -> str:
        """Improve an experience bullet point with STAR method."""
        prompt = f"""You are an expert CV writer specializing in tech and business roles.
Transform this bullet point using the STAR method (Situation-Task-Action-Result):

Current: {bullet}
Role: {role}
Company: {company}

Requirements:
- Start with a powerful action verb (Led, Architected, Spearheaded, Drove, Optimized)
- Include quantifiable metrics if possible (%, $, time saved, users impacted)
- Be specific about technologies, methodologies, or approaches used
- Maximum 20 words, one complete sentence

Return ONLY the improved bullet point. No quotes, no bullet symbol."""

        return AIService._call_groq(prompt)

    @staticmethod
    def improve_education_highlight(highlight: str, degree: str = "", field: str = "") -> str:
        """Improve an education highlight to showcase achievements."""
        prompt = f"""You are an academic CV specialist.
Enhance this education highlight:

Current: {highlight}
Degree: {degree}
Field of Study: {field}

Make it:
- Quantify achievements (GPA, percentile, ranking)
- Highlight honors, awards, or distinctions
- Mention relevant coursework or thesis if applicable
- Concise: 10-15 words maximum

Return ONLY the improved highlight. No quotes."""

        return AIService._call_groq(prompt)

    @staticmethod
    def improve_project_summary(summary: str, project_name: str = "") -> str:
        """Improve a project summary to highlight impact and tech stack."""
        prompt = f"""You are a technical portfolio curator.
Rewrite this project summary:

Project: {project_name if project_name else "Software Project"}
Current summary: {summary}

Requirements:
- Lead with the problem solved or value delivered
- Mention key technologies used
- Include metrics if available (users, performance, stars)
- 15-25 words maximum

Return ONLY the improved summary. No quotes."""

        return AIService._call_groq(prompt)

    @staticmethod
    def improve_project_highlight(highlight: str, project_name: str = "") -> str:
        """Improve a project bullet point."""
        prompt = f"""You are a technical writer for developer portfolios.
Enhance this project achievement:

Project: {project_name}
Current: {highlight}

- Use technical specifics (algorithms, frameworks, patterns)
- Quantify impact (performance gains, adoption metrics)
- Maximum 15 words

Return ONLY the improved highlight."""

        return AIService._call_groq(prompt)

    @staticmethod
    def suggest_skills(job_title: str, current_skills: list[str]) -> list[str]:
        """Suggest additional relevant skills based on job title."""
        prompt = f"""You are a tech recruiter who knows exactly what skills are in demand.
Suggest 5 additional in-demand skills for a {job_title} role in 2024.

Current skills: {', '.join(current_skills) if current_skills else 'None listed'}

Focus on:
- Technical skills that complement existing ones
- Tools and frameworks currently trending
- Soft skills relevant to the role

Return ONLY comma-separated skill names, no explanations.
Example format: Python, AWS Lambda, Agile, System Design, Technical Writing"""

        result = AIService._call_groq(prompt)
        return [s.strip() for s in result.split(",")][:5]

    @staticmethod
    def generate_summary(name: str, job_title: str, years_exp: int = 0) -> str:
        """Generate a professional summary from scratch."""
        prompt = f"""You are a career coach who has helped 1000+ professionals land top jobs.
Write a compelling professional summary for:

Name: {name}
Target Role: {job_title}
Experience Level: {f"{years_exp} years" if years_exp else "Entry-level"}

Requirements:
- 2-3 impactful sentences
- Focus on value delivery, not self-description
- Include industry-specific terminology
- Avoid: "passionate", "driven", "dedicated", "team player"
- Include: specific expertise, industries, and achievements

Return ONLY the summary. No quotes, no labels."""

        return AIService._call_groq(prompt)

    @staticmethod
    def improve_publication_title(title: str, field: str = "") -> str:
        """Suggest improvements for a publication title (if needed)."""
        # Publications typically shouldn't be modified, but we can help format
        return title  # Return as-is for publications

    @staticmethod
    def generate_honor_entry(context: str) -> str:
        """Help format an honor/award entry professionally."""
        prompt = f"""You are formatting an honor or award for a CV.
Given this context: {context}

Format it as a single, professional bullet point that includes:
- Award name
- Granting organization (if applicable)
- Year (if mentioned)
- Brief significance (if notable)

Example formats:
- "Forbes 30 Under 30 in Technology (2024)"
- "NSF Graduate Research Fellowship (2020–2023, $138,000)"
- "Best Paper Award, NeurIPS 2023"

Return ONLY the formatted honor. Maximum 15 words."""

        return AIService._call_groq(prompt)

    @staticmethod
    def _call_groq(prompt: str) -> str:
        """Make a call to the Groq API with enhanced settings."""
        if client is None:
            return ""
        try:
            chat_completion = client.chat.completions.create(
                messages=[
                    {
                        "role": "system", 
                        "content": """You are an elite professional CV and resume writer. 
Your responses are always:
- Direct and actionable (no preamble or explanation)
- Specific with numbers and metrics when possible
- Using industry-standard terminology
- Optimized for ATS (Applicant Tracking Systems)
- Following modern CV best practices

Never use quotes around your response. Never explain what you did."""
                    },
                    {"role": "user", "content": prompt}
                ],
                model="llama-3.3-70b-versatile",
                temperature=0.6,  # Slightly lower for more consistency
                max_tokens=300,   # Reduced for more concise responses
            )
            result = chat_completion.choices[0].message.content.strip()
            # Clean up any accidental quotes
            if result.startswith('"') and result.endswith('"'):
                result = result[1:-1]
            return result
        except Exception as e:
            print(f"Groq API error: {e}")
            return ""

