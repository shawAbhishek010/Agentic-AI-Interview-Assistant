import json

from fastapi.testclient import TestClient

from app import behavioral, main
from app.local_slm import ModelOutput


def test_behavioral_catalog_and_offline_examples(monkeypatch):
    monkeypatch.setenv("INTERNAL_SERVICE_TOKEN", "behavioral-internal-test")
    monkeypatch.setenv("SLM_ENABLED", "false")
    client = TestClient(main.app)
    headers = {"X-Internal-Token": "behavioral-internal-test"}
    assert client.get("/internal/behavioral/questions").status_code in (401, 403)
    items = client.get("/internal/behavioral/questions", headers=headers).json()["questions"]
    assert len(items) == len({item["id"] for item in items}) == 8
    parts = ("situation", "task", "action", "result")
    for item in items:
        assert tuple(item["answer"]) == parts
        assert all(item["answer"][part] for part in parts) and item["why_it_works"]
        fallback = client.post("/internal/behavioral/chat", headers=headers, json={
            "question_id": item["id"], "message": "Give me another example"
        })
        assert fallback.status_code == 200
        reply = fallback.json()
        assert reply["mode"] == "demo" and "fictional" in reply["warning"]
        assert all(part.title() + "\n" in reply["text"] for part in parts)
        assert item["answer"]["situation"] not in reply["text"]
    missing = client.post("/internal/behavioral/chat", headers=headers, json={
        "question_id": "unknown", "message": "Give me an example"
    })
    assert missing.status_code == 404


def test_behavioral_follow_up_uses_canonical_question_and_bounded_recent_context(monkeypatch):
    class LocalCoach:
        def complete(self, system, prompt, *, max_tokens, timeout):
            assert len(system.encode("utf-8")) + len(prompt.encode("utf-8")) <= 3200
            assert max_tokens == 280 and timeout == 35
            assert "preserve their facts" in system
            context = json.loads(prompt)
            assert context["question"] == "Describe a time you made a mistake."
            assert "reporting query" in context["example"]["situation"]
            assert context["latest_request"] == "How should I explain that outcome?"
            assert context["recent_messages"][-2]["content"] == "I corrected the report before the review."
            assert context["recent_messages"][-1]["content"] == "Describe who verified the corrected figures."
            return ModelOutput("Say how you verified the correction.", 100, {}, {"local": True})

    monkeypatch.setattr(behavioral, "LocalSLM", LocalCoach)
    history = [{"role": "assistant", "content": ("😀\\" * 450)} for _ in range(4)]
    history.extend([
        {"role": "user", "content": "I corrected the report before the review."},
        {"role": "assistant", "content": "Describe who verified the corrected figures."},
    ])
    reply = behavioral.behavioral_chat(behavioral.BehavioralRequest(
        question_id="mistake", message="How should I explain that outcome?", history=history
    ))
    assert reply == {"mode": "local_slm", "text": "Say how you verified the correction.", "model": {"local": True}}
