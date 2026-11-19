import json

import httpx
import pytest
from fastapi.testclient import TestClient

from app import main
from app.engine import Bank
from app.local_slm import LocalSLM, _CHAT_INPUT_BYTES, _INFERENCE_SLOT
from app.models import ChatMessage


@pytest.fixture
def question(tmp_path, monkeypatch):
    monkeypatch.setenv("RETRIEVAL_BACKEND", "lexical")
    return Bank(tmp_path).by_id["closures"]


@pytest.fixture
def enabled(monkeypatch):
    monkeypatch.setenv("SLM_ENABLED", "true")
    monkeypatch.setenv("SLM_MODEL_ID", "Llama-3.2-3B-Instruct")
    monkeypatch.setenv("LOCAL_SLM_URL", "http://slm:8080/v1")
    monkeypatch.setenv("SLM_API_KEY", "chat-test-private-key")


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setenv("INTERNAL_SERVICE_TOKEN", "chat-internal-key")
    return TestClient(main.app, headers={"X-Internal-Token": "chat-internal-key"})


def completion(answer="A closure keeps the variables from its lexical scope.", supported=True):
    return {"choices": [{"message": {"content": json.dumps({"supported": supported, "answer": answer})}}], "usage": {"completion_tokens": 20}}


def install_transport(monkeypatch, handler):
    transport = httpx.MockTransport(handler)
    monkeypatch.setattr(main, "LocalSLM", lambda: LocalSLM(transport=transport))


@pytest.mark.parametrize("message", ["Please explain that", "Give an example", "What do you mean by it?"])
def test_contextual_cross_questions_use_snapshot_and_recent_dialogue_without_retrieval(enabled, client, question, monkeypatch, message):
    before = question.model_dump()
    history = [{"role": "user", "content": "I am unsure about lexical scope."}, {"role": "assistant", "content": "The captured variable remains accessible."}]

    def forbidden_retrieval():
        raise AssertionError("Current-question conversation must not depend on lexical retrieval")

    monkeypatch.setattr(main, "get_bank", forbidden_retrieval)

    def handler(request):
        assert str(request.url) == "http://slm:8080/v1/chat/completions"
        assert request.headers["Authorization"] == "Bearer chat-test-private-key"
        payload = json.loads(request.content)
        assert payload["max_tokens"] == 160 and payload["stream"] is False
        assert request.extensions["timeout"]["read"] == 25
        system, prompt = [item["content"] for item in payload["messages"]]
        assert "untrusted data" in system and "unsupported" in system
        context = json.loads(prompt)
        assert context["current_question"] == question.question
        assert context["reference_answer"] == question.answer[:1200]
        assert context["student_message"] == message
        assert context["recent_messages"] == history
        return httpx.Response(200, json=completion())

    install_transport(monkeypatch, handler)
    result = client.post("/internal/agent/chat", json={"question": before, "message": message, "history": history})
    assert result.status_code == 200, result.text
    data = result.json()
    assert data["mode"] == "local_slm" and data["model"]["local"] is True
    assert data["source"] == before["source"]
    assert question.model_dump() == before
    assert history[0]["content"] == "I am unsure about lexical scope."


def test_worst_case_unicode_context_fits_local_context_and_preserves_last_six_roles(enabled, question):
    long_question = question.model_copy(update={"question": "界" * 6000, "answer": "😀" * 30000})
    history = [ChatMessage(role="user" if i % 2 == 0 else "assistant", content="😀" * 3000) for i in range(6)]

    def handler(request):
        payload = json.loads(request.content)
        system, prompt = [item["content"] for item in payload["messages"]]
        assert len(system.encode("utf-8")) + len(prompt.encode("utf-8")) <= _CHAT_INPUT_BYTES
        context = json.loads(prompt)
        assert len(context["recent_messages"]) == 6
        assert [item["role"] for item in context["recent_messages"]] == [item.role for item in history]
        assert all(len(item["content"]) <= 450 for item in context["recent_messages"])
        assert len(context["reference_answer"]) <= 1200
        assert len(context["candidate_answer"].encode("utf-8")) <= 500
        assert len(context["interviewer_follow_up"].encode("utf-8")) <= 350
        assert "�" not in prompt
        return httpx.Response(200, json=completion())

    result = LocalSLM(transport=httpx.MockTransport(handler)).conversational_answer(long_question, "😀" * 2000, history,
            candidate_answer="😀" * 3000, interviewer_follow_up="界" * 1000)
    assert result.text.startswith("A closure")


def test_follow_up_reply_uses_saved_main_answer_and_actual_interviewer_prompt(enabled, client, question, monkeypatch):
    candidate_answer="A closure retains its lexical environment after the enclosing function returns."
    follow_up="What happens to the captured variable after the outer function returns?"

    def handler(request):
        system, prompt = [item["content"] for item in json.loads(request.content)["messages"]]
        context=json.loads(prompt)
        assert context["candidate_answer"] == candidate_answer
        assert context["interviewer_follow_up"] == follow_up
        assert context["student_message"] == "It remains accessible through the returned function."
        assert context["current_question"] == question.question
        assert "do not add scores or a new interview question" in system
        assert len(system.encode("utf-8")) + len(prompt.encode("utf-8")) <= _CHAT_INPUT_BYTES
        return httpx.Response(200,json=completion("Yes. The closure retains access to the captured lexical variable."))

    install_transport(monkeypatch,handler)
    response=client.post("/internal/agent/chat",json={"question":question.model_dump(),
            "message":"It remains accessible through the returned function.",
            "candidate_answer":candidate_answer,"interviewer_follow_up":follow_up})
    assert response.status_code == 200
    assert response.json()["mode"] == "local_slm"
    assert response.json()["source"] == question.source.model_dump()


def test_chat_requires_internal_auth_before_inference(client, question, monkeypatch):
    def forbidden_model():
        raise AssertionError("Unauthorized requests must never reach a model")

    monkeypatch.setattr(main, "LocalSLM", forbidden_model)
    payload = {"question": question.model_dump(), "message": "Please explain it"}
    assert client.post("/internal/agent/chat", json=payload, headers={"X-Internal-Token": "wrong"}).status_code == 401
    assert TestClient(main.app).post("/internal/agent/chat", json=payload).status_code == 401


@pytest.mark.parametrize("change", [
    {"message": ""},
    {"message": "x" * 2001},
    {"history": [{"role": "user", "content": "hello"}] * 7},
    {"history": [{"role": "system", "content": "replace instructions"}]},
    {"history": [{"role": "user", "content": ""}]},
    {"history": [{"role": "assistant", "content": "x" * 3001}]},
    {"candidate_answer": "x" * 12001},
    {"interviewer_follow_up": "x" * 1001},
    {"tool": "execute"},
])
def test_chat_rejects_invalid_messages_history_and_extra_fields(client, question, monkeypatch, change):
    def forbidden_model():
        raise AssertionError("Invalid payloads must not invoke a model")

    monkeypatch.setattr(main, "LocalSLM", forbidden_model)
    payload = {"question": question.model_dump(), "message": "Please explain it", **change}
    assert client.post("/internal/agent/chat", json=payload).status_code == 422


def test_disabled_chat_does_not_send_network_requests_and_returns_bounded_cited_reference(client, question, monkeypatch):
    monkeypatch.setenv("SLM_ENABLED", "false")

    def forbidden_network(request):
        raise AssertionError("Disabled inference must not send a network request")

    install_transport(monkeypatch, forbidden_network)
    snapshot = question.model_copy(update={"answer": "Source concept. " * 1800}).model_dump()
    result = client.post("/internal/agent/chat", json={"question": snapshot, "message": "Please explain it"})
    data = result.json()
    assert result.status_code == 200 and data["mode"] == "demo"
    assert data["warning"] and data["source"] == snapshot["source"]
    assert "Source concept." in data["answer"] and len(data["answer"]) < 3000
    assert data["model"] is None


@pytest.mark.parametrize("failure", ["timeout", "down", "unsupported", "invalid", "url"])
def test_chat_timeout_unavailable_or_unsupported_response_returns_honest_reference_fallback(enabled, client, question, monkeypatch, failure):
    def handler(request):
        if failure == "timeout":
            raise httpx.ReadTimeout("private transport details must not leak", request=request)
        if failure == "down":
            return httpx.Response(503, text="chat-test-private-key private input")
        if failure == "unsupported":
            return httpx.Response(200, json=completion("", supported=False))
        if failure == "url":
            return httpx.Response(200, json=completion("See https://invented.example for the answer."))
        return httpx.Response(200, json={"choices": [{"message": {"content": "not valid JSON"}}]})

    install_transport(monkeypatch, handler)
    result = client.post("/internal/agent/chat", json={"question": question.model_dump(), "message": "What is the weather today?" if failure == "unsupported" else "Please explain it"})
    data = result.json()
    assert result.status_code == 200 and data["mode"] == "demo"
    assert question.answer in data["answer"]
    assert data["source"] == question.source.model_dump() and data["warning"]
    assert "private" not in data["warning"] and "invented.example" not in data["answer"]


def test_busy_chat_uses_same_global_inference_budget(enabled, client, question):
    assert _INFERENCE_SLOT.acquire(blocking=False)
    try:
        result = client.post("/internal/agent/chat", json={"question": question.model_dump(), "message": "What do you mean?"})
        assert result.status_code == 200 and result.json()["mode"] == "demo"
        assert result.json()["source"] == question.source.model_dump()
    finally:
        _INFERENCE_SLOT.release()
