from typing import Literal
from pydantic import BaseModel, ConfigDict, Field


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class Source(StrictModel):
    id: str
    title: str
    url: str
    license: str
    locator: str


class Question(StrictModel):
    id: str
    role: str
    topic: str
    difficulty: Literal["beginner", "intermediate", "advanced"]
    question: str = Field(min_length=5, max_length=6000)
    answer: str = Field(min_length=5, max_length=30000)
    follow_up: str
    concepts: list[str]
    source: Source


class PlanRequest(StrictModel):
    role: str = Field(min_length=2, max_length=100)
    topic: str | None = Field(default=None, max_length=100)
    difficulty: str | None = Field(default=None, pattern="^(beginner|intermediate|advanced)$")
    question_ids: list[str] | None = Field(default=None, min_length=5, max_length=5)


class EvaluateRequest(StrictModel):
    question_id: str = Field(min_length=1, max_length=200)
    answer: str = Field(min_length=1, max_length=12000)


class QueryRequest(StrictModel):
    query: str = Field(min_length=2, max_length=2000)
    role: str | None = Field(default=None, max_length=100)
    use_model: bool = False


class ChatMessage(StrictModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=3000)


class ChatRequest(StrictModel):
    question: Question
    message: str = Field(min_length=1, max_length=2000)
    history: list[ChatMessage] = Field(default_factory=list, max_length=6)
    candidate_answer: str | None = Field(default=None, min_length=1, max_length=12000)
    interviewer_follow_up: str | None = Field(default=None, min_length=1, max_length=1000)


class ChatResponse(StrictModel):
    answer: str = Field(min_length=1, max_length=3000)
    mode: Literal["local_slm", "demo"]
    source: Source
    model: dict | None = None
    warning: str | None = None


class Trace(StrictModel):
    step: str
    status: str = "completed"
    detail: str
    duration_ms: float


class Evaluation(StrictModel):
    score: int
    accuracy: int
    completeness: int
    clarity: int
    matched_concepts: list[str]
    missing_concepts: list[str]
    feedback: list[str]
    follow_up: str
    mode: str = "demo"
    source: Source
    follow_up_mode: str = "demo"
    model: dict | None = None
    warning: str | None = None


class PlanResponse(StrictModel):
    questions: list[Question] = Field(min_length=5, max_length=5)
    trace: list[Trace]
    mode: str = "demo"
    study_plan: list[str]


class QueryResponse(StrictModel):
    answer: str
    questions: list[Question]
    trace: list[Trace]
    mode: str = "demo"
    model: dict | None = None
    warning: str | None = None
