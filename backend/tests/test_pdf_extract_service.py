import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from services.pdf_extract_service import PDFExtractService


def test_parse_rendercv_pdf_text_with_trailing_headings_and_numbered_sections() -> None:
    raw_text = """
Last updated in Mar 2026
John Doe
San Francisco, CA
john.doe@email.com
rendercv.com
Education 
PhD
Princeton University, Computer Science
• Thesis: Efficient Neural Architecture Search
Princeton, NJ
Sept 2018 – May 2023
Experience 
Nexus AI, Co-Founder & CTO
• Built infrastructure serving 2M+ monthly API requests
San Francisco, CA
June 2023 – present
2 years 10 months
Projects 
FlashInfer
Open-source library for high-performance LLM inference kernels
• Achieved 2.8x speedup on A100 GPUs
Jan 2023 – present
Skills 
Languages: Python, C++, CUDA
Patents 
1. Adaptive Quantization for Neural Network Inference on Edge Devices
Invited Talks 
1. Efficient Deep Learning: A Practitioner’s Perspective — Google Tech Talk (2022)
John Doe – 2/2
"""

    parsed = PDFExtractService._parse_cv_text(raw_text)

    assert parsed["name"] == "John Doe"
    assert parsed["headline"] == ""
    assert parsed["location"] == "San Francisco, CA"
    assert parsed["website"] == "rendercv.com"
    assert parsed["experience"][0]["company"] == "Nexus AI"
    assert parsed["experience"][0]["position"] == "Co-Founder & CTO"
    assert parsed["experience"][0]["start_date"] == "June 2023"
    assert parsed["education"][0]["institution"] == "Princeton University"
    assert parsed["education"][0]["area"] == "Computer Science"
    assert parsed["skills"] == [{"label": "Languages", "details": "Python, C++, CUDA"}]
    assert parsed["patents"] == [
        {"number": "Adaptive Quantization for Neural Network Inference on Edge Devices"}
    ]
    assert parsed["talks"] == [
        {
            "reversed_number": "Efficient Deep Learning: A Practitioner’s Perspective — Google Tech Talk (2022)"
        }
    ]


def test_parse_uploaded_pdf_text_with_wrapped_project_bullets() -> None:
    raw_text = """
Muhammad Hassan Baig
hassanbaig1243@gmail.com |
03007038803 | Dha Phase 8 Lahore Pakistan | GitHub |
LinkedIn|
EDUCATION
The University of Lahore
January 2021 - July 2025
Bachelor’s degree in computer software engineering
Lahore, Punjab, Pakistan
●
GPA: 3.25/4.0
●
Relevant Coursework: Data Structures & Algorithms, Database Management Systems, Web Development,
Software Engineering, Machine Learning, Object-Oriented Programming, Computer Networks
PROJECTS
Social Media App (FYP)
June 2025
Full-Stack Developer (Project)
Engineered a full-stack social media application with real-time messaging using WebSocket and Redis for
session management
●
Integrated AI/ML model for detecting deep-fake content in images and videos, enhancing user trust.
●
Developed real-time messaging with WebSocket and Redis for efficient session management.
Stacks: React, Node.js, TypeScript, MongoDB, Express, Redis, Tailwind CSS, Tan Stack Query, Zegocloud.
Job Portal with AI-Powered Features
April 2025
Full-Stack Developer (Project)
Built a comprehensive job portal with candidate-employer matching system and application tracking
CERTIFICATIONS, SKILLS & INTERESTS
•
Certifications: IBM Front-End Developer
•
Technologies:
React.js, TypeScript, Next.js, Node.js, Express.js, Fastify, MongoDB, Postgres SQL, Redis, Tailwind CSS,
Git, Linux, Shell Scripting, Docker, GitLab
"""

    parsed = PDFExtractService._parse_cv_text(raw_text)

    assert parsed["name"] == "Muhammad Hassan Baig"
    assert parsed["phone"] == "03007038803"
    assert parsed["location"] == "Dha Phase 8 Lahore Pakistan"
    assert parsed["education"][0]["institution"] == "The University of Lahore"
    assert parsed["education"][0]["degree"] == "Bachelor’s degree in computer software engineering"
    assert parsed["education"][0]["location"] == "Lahore, Punjab, Pakistan"
    assert len(parsed["projects"]) == 2
    assert parsed["projects"][0]["name"] == "Social Media App (FYP)"
    assert parsed["projects"][0]["date"] == "June 2025"
    assert parsed["projects"][0]["summary"] == "Full-Stack Developer (Project)"
    assert "Integrated AI/ML model" in parsed["projects"][0]["highlights"][0]
    assert any(skill["label"] == "Technologies" for skill in parsed["skills"])


def test_parse_experience_when_dates_precede_highlights() -> None:
    raw_text = """
Jane Smith
jane@example.com
EXPERIENCE
Acme Corp
Senior Software Engineer
Jan 2022 - Present
Built APIs used by 1M users
Improved latency by 40%
Beta LLC
Software Engineer
Jan 2020 - Dec 2021
Shipped internal dashboards
SKILLS
Languages: Python, TypeScript
"""

    parsed = PDFExtractService._parse_cv_text(raw_text)

    assert parsed["experience"] == [
        {
            "company": "Acme Corp",
            "position": "Senior Software Engineer",
            "start_date": "Jan 2022",
            "end_date": "Present",
            "location": "",
            "summary": "",
            "highlights": [
                "Built APIs used by 1M users",
                "Improved latency by 40%",
            ],
        },
        {
            "company": "Beta LLC",
            "position": "Software Engineer",
            "start_date": "Jan 2020",
            "end_date": "Dec 2021",
            "location": "",
            "summary": "",
            "highlights": ["Shipped internal dashboards"],
        },
    ]
