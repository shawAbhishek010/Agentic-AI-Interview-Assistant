import json
import httpx
import pytest

from app.local_slm import LocalSLM, LocalModelUnavailable, _INFERENCE_SLOT
from app.models import QueryRequest
from app import main


@pytest.fixture
def enabled(monkeypatch):
    monkeypatch.setenv("SLM_ENABLED", "true")
    monkeypatch.setenv("SLM_MODEL_ID", "Llama-3.2-3B-Instruct")
    monkeypatch.setenv("LOCAL_SLM_URL", "http://slm:8080/v1")
    monkeypatch.setenv("SLM_API_KEY", "private-test-key")


def response(text="A closure retains access to its outer lexical scope."):
    return {"choices":[{"message":{"content":text}}],"usage":{"prompt_tokens":30,"completion_tokens":12,"total_tokens":42}}


def test_disabled_model_never_sends_requests(monkeypatch):
    monkeypatch.setenv("SLM_ENABLED", "false")
    def forbidden(request):
        raise AssertionError("Disabled local model must never send a request")
    model=LocalSLM(transport=httpx.MockTransport(forbidden))
    assert model.status()["status"]=="disabled"
    with pytest.raises(LocalModelUnavailable):
        model.basic_test()


@pytest.mark.parametrize("url",["https://api.x.ai/v1","http://example.org/v1","http://user:password@slm:8080/v1","http://slm:8080/v1?redirect=outside","http://slm:8080/other"])
def test_hosted_or_credential_embedded_endpoints_are_rejected(enabled,monkeypatch,url):
    monkeypatch.setenv("LOCAL_SLM_URL",url)
    def forbidden(request):
        raise AssertionError("Disallowed endpoint must never be contacted")
    model=LocalSLM(transport=httpx.MockTransport(forbidden))
    assert model.status()["status"]=="unavailable"
    with pytest.raises(LocalModelUnavailable):
        model.basic_test()


def test_authenticated_real_wire_contract_and_output_metadata(enabled):
    def handler(request):
        assert str(request.url)=="http://slm:8080/v1/chat/completions"
        assert request.headers["Authorization"]=="Bearer private-test-key"
        payload=json.loads(request.content)
        assert payload["model"]=="Llama-3.2-3B-Instruct"
        assert payload["max_tokens"]<=160 and payload["stream"] is False
        return httpx.Response(200,json=response())
    result=LocalSLM(transport=httpx.MockTransport(handler)).basic_test()
    assert result["mode"]=="local_slm"
    assert result["usage"]["total_tokens"]==42
    assert result["model"]["local"] is True


def test_provider_health_is_checked_without_model_inference(enabled):
    calls=[]
    def handler(request):
        calls.append(request.url.path)
        return httpx.Response(200,json={"status":"ok"})
    assert LocalSLM(transport=httpx.MockTransport(handler)).status()["status"]=="ready"
    assert calls==["/health"]


def test_timeout_and_malformed_payload_do_not_leak_private_inputs(enabled):
    for handler in [lambda req:httpx.Response(500,text="private-test-key student-answer"),lambda req:httpx.Response(200,json={"choices":[]})]:
        with pytest.raises(LocalModelUnavailable) as caught:
            LocalSLM(transport=httpx.MockTransport(handler)).complete("system","student-answer")
        assert "private-test-key" not in str(caught.value)
        assert "student-answer" not in str(caught.value)


def test_model_concurrency_is_bounded(enabled):
    assert _INFERENCE_SLOT.acquire(blocking=False)
    try:
        with pytest.raises(LocalModelUnavailable,match="busy"):
            LocalSLM().basic_test()
    finally:
        _INFERENCE_SLOT.release()


def test_token_and_time_budgets_are_enforced(enabled):
    for kwargs in [{"max_tokens":1000},{"timeout":60}]:
        with pytest.raises(ValueError):
            LocalSLM().complete("system","prompt",**kwargs)


def test_live_model_does_not_overwrite_reference_answers(enabled,tmp_path,monkeypatch):
    from app.engine import Bank
    bank=Bank(tmp_path)
    monkeypatch.setattr(main,"bank",bank)
    before=bank.by_id["closures"].answer
    class Model:
        def grounded_answer(self,query,questions):
            from app.local_slm import ModelOutput
            return ModelOutput("A closure keeps access to lexical variables.",1,{}, {"provider":"llama.cpp","model_id":"Llama-3.2-3B-Instruct","status":"ready","local":True})
    monkeypatch.setattr(main,"LocalSLM",Model)
    result=main.query(QueryRequest(query="What are JavaScript closures?",use_model=True))
    assert result.mode=="local_slm"
    assert bank.by_id["closures"].answer==before
    assert result.questions[0].source.url.startswith("https://github.com/")


def test_missing_source_does_not_invoke_model(enabled,tmp_path,monkeypatch):
    from app.engine import Bank
    monkeypatch.setattr(main,"bank",Bank(tmp_path))
    class ForbiddenModel:
        def grounded_answer(self,*args):
            raise AssertionError("No source means no inference")
    monkeypatch.setattr(main,"LocalSLM",ForbiddenModel)
    result=main.query(QueryRequest(query="Explain photosynthesis chloroplasts in orchids",use_model=True))
    assert result.mode=="demo" and not result.questions


def test_unavailable_model_preserves_cited_answer(enabled,tmp_path,monkeypatch):
    from app.engine import Bank
    monkeypatch.setattr(main,"bank",Bank(tmp_path))
    class UnavailableModel:
        def grounded_answer(self,*args):
            raise LocalModelUnavailable("unavailable")
    monkeypatch.setattr(main,"LocalSLM",UnavailableModel)
    result=main.query(QueryRequest(query="What are JavaScript closures?",use_model=True))
    assert result.mode=="demo" and result.warning
    assert result.answer==result.questions[0].answer
    assert result.trace[-1].status=="fallback"
