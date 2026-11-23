import json

import pytest

from app import practice
from app.local_slm import LocalModelUnavailable, ModelOutput


JAVA_SUM = """class Solution {
    static int solve(int a, int b) {
        // Write your solution here.
        return a+b;
    }
}"""
JAVA_WITH_LOCAL = JAVA_SUM.replace("return a+b;", "int sum = a+b; return sum;")


@pytest.mark.parametrize(
    "language,source,expected",
    [
        ("java", JAVA_SUM, "matches the expected values for all 2 examples"),
        ("java", JAVA_SUM.replace("a+b", "a-b"), "gives -3, and the expected value is 11"),
        ("python", "def solve(first, second):\n    return (second + first)", "matches the expected values for all 2 examples"),
    ],
)
def test_simple_integer_return_gets_a_model_independent_check(monkeypatch, language, source, expected):
    def unexpected_model_call():
        pytest.fail("A simple return expression should be checked without the model")

    monkeypatch.setattr(practice, "LocalSLM", unexpected_model_call)
    response = practice.coding_coach(practice.CoachingRequest(
        challenge_id="sum-two", language=language, action="review", code=source,
    ))
    assert response["mode"] == "demo" and response["review_basis"] == "static"
    assert expected in response["text"]


@pytest.mark.parametrize(
    "outputs,source,expected_text",
    [
        ([11, -3], JAVA_WITH_LOCAL, "predicts the expected return values for all 2 examples"),
        ([11, 11], JAVA_WITH_LOCAL, "could not confirm the result for Example 2"),
        ([11, None], JAVA_WITH_LOCAL, "could not determine every return value"),
    ],
)
def test_java_review_compares_predicted_values_to_canonical_examples(monkeypatch, outputs, source, expected_text):
    class Model:
        def complete(self, system, prompt, **options):
            context = json.loads(prompt)
            assert context == {
                "language": "java",
                "required_entry_point": "class Solution with static int solve(int a, int b)",
                "challenge": "Return the sum of a and b.",
                "inputs": [[4, 7], [-5, 2]],
                "submitted_source": source,
            }
            assert "fit the starter's declared types" in system
            assert "Trace the submitted code, not the desired algorithm" in system
            assert options["response_schema"]["required"] == ["predicted_outputs"]
            return ModelOutput(json.dumps({"predicted_outputs": outputs}), 1, {}, {"local": True})

    monkeypatch.setattr(practice, "LocalSLM", Model)
    response = practice.coding_coach(practice.CoachingRequest(
        challenge_id="sum-two", language="java", action="review", code=source,
    ))
    assert response["mode"] == "local_slm"
    assert expected_text in response["text"]
    assert "predicted from the source" in response["warning"]


def test_unavailable_model_and_unchanged_starter_do_not_claim_a_result(monkeypatch):
    class Unavailable:
        def complete(self, *args, **kwargs):
            raise LocalModelUnavailable("Disabled")

    monkeypatch.setattr(practice, "LocalSLM", Unavailable)
    fields = {"challenge_id": "sum-two", "language": "python", "action": "review"}
    request = practice.CoachingRequest(**fields, code="def solve(a, b):\n    total = a+b\n    return total")
    fallback = practice.coding_coach(request)
    assert fallback["mode"] == "demo"
    assert "could not complete" in fallback["warning"]
    starter = practice.coding_coach(request.model_copy(update={
        "code": practice.challenges()["sum-two"]["starter"]["python"],
    }))
    assert starter["mode"] == "demo" and "starter is still unchanged" in starter["text"]
