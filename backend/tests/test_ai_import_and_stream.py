"""AI-assisted PDF import (grounding) and streamed cover letters."""

import json

from fastapi.testclient import TestClient

from main import app
from services.ai_import_service import structure_resume
from services.ai_service import AIService

RAW_TEXT = """Ada Lovelace
ada@example.com | Lahore, Pakistan
EXPERIENCE
Analytical Engines Ltd — Senior Engineer
Jan 2019 – Present
• Built the first published algorithm for the engine
• Mentored two junior engineers
EDUCATION
University of London, BSc Mathematics, 2015 – 2018
SKILLS
Python, SQL, Docker
"""

HEURISTIC = {"name": "Ada Lovelace", "email": "ada@example.com", "experience": [], "education": [], "skills": []}


def provider_json(payload: dict):
    return staticmethod(lambda **kwargs: json.dumps(payload))


def test_import_uses_heuristic_without_ai(monkeypatch) -> None:
    monkeypatch.setattr(AIService, "is_configured", staticmethod(lambda: False))

    result = structure_resume(RAW_TEXT, HEURISTIC)

    assert result.source == "heuristic"
    assert result.cv_data is HEURISTIC


def test_import_keeps_grounded_ai_data_and_drops_inventions(monkeypatch) -> None:
    monkeypatch.setattr(AIService, "is_configured", staticmethod(lambda: True))
    monkeypatch.setattr(
        AIService,
        "call_provider",
        provider_json(
            {
                "name": "Ada Lovelace",
                "email": "ada.lovelace@invented.com",
                "location": "Lahore, Pakistan",
                "experience": [
                    {
                        "company": "Analytical Engines Ltd",
                        "position": "Senior Engineer",
                        "start_date": "2019-01",
                        "end_date": "present",
                        "highlights": [
                            "Built the first published algorithm for the engine",
                            "Increased revenue by 300%",
                        ],
                    },
                    {"company": "Imaginary Corp", "position": "CTO", "start_date": "2010"},
                ],
                "education": [{"institution": "University of London", "area": "Mathematics", "degree": "BSc"}],
                "skills": [{"label": "Languages", "details": "Python, SQL"}],
            }
        ),
    )

    result = structure_resume(RAW_TEXT, HEURISTIC)

    assert result.source == "ai"
    companies = [entry["company"] for entry in result.cv_data["experience"]]
    assert companies == ["Analytical Engines Ltd"]
    assert result.cv_data["experience"][0]["highlights"] == ["Built the first published algorithm for the engine"]
    assert result.cv_data["education"][0]["institution"] == "University of London"
    # The invented email is not in the PDF, so the heuristic value stays.
    assert result.cv_data["email"] == "ada@example.com"
    assert any("experience item" in warning for warning in result.warnings)
    assert any("bullet" in warning for warning in result.warnings)


def test_import_falls_back_on_unusable_ai_output(monkeypatch) -> None:
    monkeypatch.setattr(AIService, "is_configured", staticmethod(lambda: True))
    monkeypatch.setattr(AIService, "call_provider", staticmethod(lambda **kwargs: "Sorry, I can't help with that."))

    result = structure_resume(RAW_TEXT, HEURISTIC)

    assert result.source == "heuristic"
    assert result.warnings


def parse_sse(body: str) -> list[tuple[str, dict]]:
    events = []
    for block in body.strip().split("\n\n"):
        lines = dict(line.split(": ", 1) for line in block.splitlines())
        events.append((lines["event"], json.loads(lines["data"])))
    return events


COVER_PAYLOAD = {
    "cv_data": {"name": "Ada Lovelace", "summary": "Engineer.", "skills": [{"label": "Languages", "details": "Python"}]},
    "cover_letter": {
        "target_role": "Backend Engineer",
        "company": "Northstar Labs",
        "job_description": "We need a backend engineer to build Python services and APIs for our platform.",
    },
}


def test_stream_sends_template_chunks_without_ai(monkeypatch) -> None:
    monkeypatch.setattr(AIService, "is_configured", staticmethod(lambda: False))
    client = TestClient(app)

    response = client.post("/api/cover-letter/stream", json=COVER_PAYLOAD)

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/event-stream")
    events = parse_sse(response.text)
    deltas = [data["text"] for event, data in events if event == "delta"]
    done = events[-1]
    assert len(deltas) > 3
    assert done[0] == "done"
    assert done[1]["source"] == "template"
    assert "Northstar Labs" in done[1]["letter"]


def test_stream_relays_ai_deltas(monkeypatch) -> None:
    letter = "Dear Hiring Team,\n\n" + " ".join(["I build reliable Python services for growing platforms."] * 30) + "\n\nSincerely,\nAda"
    chunks = [letter[index:index + 40] for index in range(0, len(letter), 40)]
    monkeypatch.setattr(AIService, "is_configured", staticmethod(lambda: True))
    monkeypatch.setattr(AIService, "stream_provider", staticmethod(lambda *args, **kwargs: iter(chunks)))
    client = TestClient(app)

    events = parse_sse(client.post("/api/cover-letter/stream", json=COVER_PAYLOAD).text)

    assert [data["text"] for event, data in events if event == "delta"] == chunks
    assert events[-1][0] == "done"
    assert events[-1][1]["source"] == "ai"


def test_stream_resets_to_template_when_ai_output_is_invalid(monkeypatch) -> None:
    monkeypatch.setattr(AIService, "is_configured", staticmethod(lambda: True))
    monkeypatch.setattr(AIService, "stream_provider", staticmethod(lambda *args, **kwargs: iter(["Too short."])))
    client = TestClient(app)

    events = parse_sse(client.post("/api/cover-letter/stream", json=COVER_PAYLOAD).text)
    names = [event for event, _ in events]

    assert names[0] == "delta" and "reset" in names
    assert events[-1][1]["source"] == "template"


def test_stream_ai_only_reports_error(monkeypatch) -> None:
    monkeypatch.setattr(AIService, "is_configured", staticmethod(lambda: True))
    monkeypatch.setattr(AIService, "stream_provider", staticmethod(lambda *args, **kwargs: iter([])))
    client = TestClient(app)

    events = parse_sse(client.post("/api/cover-letter/stream", json={**COVER_PAYLOAD, "ai_only": True}).text)

    assert events == [("error", {"detail": "AI cover letter generation is temporarily unavailable. Please try again."})]
