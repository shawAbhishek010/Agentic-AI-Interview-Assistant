"""Local evidence retrieval and bounded, inspectable rule workflow. No provider calls."""
from collections import Counter
from pathlib import Path
from typing import TypedDict
import hashlib
import json
import math
import os
import re
import threading
import time
import uuid

# Never send student answers or source content to hosted tracing services.
os.environ["LANGSMITH_TRACING"] = "false"
os.environ["LANGCHAIN_TRACING_V2"] = "false"

from langchain_core.documents import Document
from langchain_core.runnables import RunnableLambda
from langgraph.graph import StateGraph, START, END

from .models import Question, Source, PlanRequest, Trace, PlanResponse, Evaluation, QueryResponse

ROOT = Path(__file__).resolve().parents[2]
BANK_REV = "da235b6185721161b7ebc413075b76dc70339ccf"
STOP = set("a an the is are of to in for and or on how what why when which with this that it as be can does do you your from by explain describe have has about between not into".split())
ROLE_TOPICS = {
    "Frontend Developer": {"JavaScript", "React", "CSS", "HTML", "Accessibility", "Security"},
    "React Developer": {"React"},
    "JavaScript Developer": {"JavaScript"},
    "Full Stack Developer": {"JavaScript", "Node.js", "React", "CSS", "HTML", "Accessibility", "Security", "SQL"},
    "Backend Developer": {"Node.js", "Security", "JavaScript", "SQL"},
    "Java Developer": {"Java"},
    "Python Developer": {"Python"},
    "SQL Developer": {"SQL"},
}
TOPICS = {"react": "React", "javascript": "JavaScript", "css": "CSS", "html": "HTML", "node": "Node.js", "security": "Security", "accessibility": "Accessibility"}
ALLOWED_LICENSES = {"MIT", "Apache-2.0", "BSD-2-Clause", "BSD-3-Clause", "CC0-1.0", "CC-BY-4.0", "CC-BY-SA-4.0"}
DIFFICULTIES = ("beginner", "intermediate", "advanced")
VENDORED_THEORY_PROMPTS = {
    "callback-hell": "What is callback hell, and how can it be avoided?",
    "node-error-first-callback": "What are the advantages of the error-first callback convention in Node.js?",
}
EXERCISE_PROMPT = re.compile(
    r"^(?:please\s+)?(?:(?:can|could|would) you\s+)?(?:using[^,]+,\s*)?"
    r"(?:write|create|implement|generate|solve|build|complete|fix|debug|refactor|code|given)\b"
    r"|^what (?:is the output|(?:will|would) .*\b(?:print|log|return|output)\b|does .+ (?:evaluate to|return)\??$)",
    re.I,
)


def is_theory_prompt(question: str) -> bool:
    return bool(question.strip()) and "```" not in question and "~~~" not in question and not EXERCISE_PROMPT.search(question)


THEORY_FOLLOW_UP = "Can you give a practical example and explain it in words?"


def tokens(text: str) -> set[str]:
    return {t for t in re.findall(r"[a-z0-9]+", text.lower()) if len(t) > 1 and t not in STOP}


def clean(text: str) -> str:
    text = re.sub(r"<script\b[^>]*>.*?</script>", "", str(text), flags=re.S | re.I)
    return re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f]", "", text).strip()


class PlanState(TypedDict, total=False):
    request: PlanRequest
    candidates: list[Question]
    questions: list[Question]
    trace: list[Trace]
    study_plan: list[str]


class Bank:
    def __init__(self, storage: Path | None = None):
        self.storage = storage or Path(os.getenv("AGENT_DATA_DIR", str(ROOT / "agent" / ".data")))
        self.storage.mkdir(parents=True, exist_ok=True)
        self.lock = threading.RLock()
        self.questions: list[Question] = []
        self.sources: dict[str, dict] = {}
        self.documents: list[Document] = []
        self.semantic = None
        self.load()
        self.retriever = RunnableLambda(lambda query: self.search(query))
        graph = StateGraph(PlanState)
        graph.add_node("retrieve", self._retrieve)
        graph.add_node("select_five", self._select)
        graph.add_node("study_plan", self._study)
        graph.add_edge(START, "retrieve")
        graph.add_edge("retrieve", "select_five")
        graph.add_edge("select_five", "study_plan")
        graph.add_edge("study_plan", END)
        self.workflow = graph.compile()

    def load(self):
        raw_path = Path(os.getenv("PUBLIC_BANK_PATH", str(ROOT / "data" / "public" / "questions.raw.json")))
        raw = json.loads(raw_path.read_text(encoding="utf-8-sig"))
        questions, retired = [], {}
        for item in raw:
            qid = item["name"].removesuffix(".md")
            qtags = set(item.get("tags", ["javascript"]))
            if "react" in item["question"].lower():
                qtags.add("react")
            tag = "react" if "react" in qtags else "node" if "node" in qtags else "security" if "security" in qtags or qid == "cors" else next(iter(sorted(qtags)))
            concepts = [clean(c)[:300] for c in item.get("goodToHear", []) if len(tokens(c)) > 0][:6]
            if not concepts:
                concepts = sorted(tokens(item["question"]) & tokens(item["answer"]))[:5] or sorted(tokens(item["answer"]))[:4]
            follow_up = f"What does this point mean in practice? {concepts[0].rstrip('.')}."
            source = Source(id="30-seconds", title="30 seconds of interviews", url=f"https://github.com/30-seconds/30-seconds-of-interviews/blob/{BANK_REV}/questions/{item['name']}", license="MIT", locator=f"questions/{item['name']} @ {BANK_REV[:12]}")
            prompt = VENDORED_THEORY_PROMPTS.get(qid, clean(item["question"]))
            q = Question(id=qid, role="Frontend Developer", topic=TOPICS.get(tag, tag), difficulty={0:"beginner",1:"beginner",2:"intermediate",3:"advanced"}.get(item.get("expertise",1),"intermediate"), question=prompt, answer=clean(item["answer"]), follow_up=follow_up, concepts=concepts, source=source)
            if is_theory_prompt(q.question):
                questions.append(q)
            else:
                retired[q.id] = q
        self.sources = {"30-seconds": {"id":"30-seconds", "title":"30 seconds of interviews", "url":f"https://github.com/30-seconds/30-seconds-of-interviews/tree/{BANK_REV}", "license":"MIT", "status":"indexed", "question_count":len(questions), "chunk_count":0}}
        self._load_theory(questions)
        self.bundled_source_ids = frozenset(self.sources)
        for path in sorted(self.storage.glob("*.json")):
            saved = json.loads(path.read_text(encoding="utf-8"))
            active_count = 0
            for item in saved["questions"]:
                q = Question.model_validate(item)
                if is_theory_prompt(q.question):
                    if not is_theory_prompt(q.follow_up):
                        q = q.model_copy(update={"follow_up": THEORY_FOLLOW_UP})
                    questions.append(q)
                    active_count += 1
                else:
                    retired[q.id] = q
            self.sources[saved["source"]["id"]] = {**saved["source"], "question_count": active_count, "chunk_count": 0}
        self.questions = questions
        self.by_id = {q.id: q for q in questions}
        self.retired_by_id = retired
        self.documents = []
        for q in questions:
            text = f"{q.question}\n{q.answer}"
            for i in range(0, len(text), 1000):
                self.documents.append(Document(page_content=text[i:i+1200], metadata={"question_id":q.id,"source_id":q.source.id,"locator":q.source.locator,"offset":i}))
                self.sources[q.source.id]["chunk_count"] += 1
        self.doc_frequency = Counter(t for q in questions for t in tokens(q.question + " " + q.answer))
        if os.getenv("RETRIEVAL_BACKEND", "lexical") == "semantic":
            self._build_semantic()

    def _load_theory(self, questions: list[Question]) -> None:
        groups = json.loads((ROOT / "data" / "theory" / "questions.json").read_text(encoding="utf-8"))
        for group in groups:
            topic, source_id = group["topic"], group["id"]
            title = f'Placement AI theory · {group["reference"]}'
            license_name = "CC0-1.0"
            role = next(role for role, topics in ROLE_TOPICS.items() if topic in topics)
            for item in group["questions"]:
                source = Source(id=source_id, title=title, url=item["url"], license=license_name, locator=item["locator"])
                fields = {key: value for key, value in item.items() if key not in {"url", "locator"}}
                q = Question(role=role, topic=topic, source=source, **fields)
                if not is_theory_prompt(q.question) or not is_theory_prompt(q.follow_up):
                    raise ValueError(f"Theory bank contains a coding prompt in {q.id}.")
                questions.append(q)
            self.sources[source_id] = {
                "id": source_id, "title": title, "url": group["url"], "license": license_name,
                "status": "indexed", "question_count": len(group["questions"]), "chunk_count": 0,
            }

    def _build_semantic(self):
        # Explicitly opt-in: optional dependencies and model weights must be installed locally.
        import faiss
        import numpy as np
        from sentence_transformers import SentenceTransformer
        model = SentenceTransformer(os.getenv("EMBEDDING_MODEL", "sentence-transformers/all-MiniLM-L6-v2"), cache_folder=os.getenv("EMBEDDING_CACHE_DIR", str(self.storage / ".models")), local_files_only=True)
        vectors = model.encode([d.page_content for d in self.documents], normalize_embeddings=True)
        index = faiss.IndexFlatIP(vectors.shape[1])
        index.add(np.asarray(vectors, dtype="float32"))
        self.semantic = (model, index, [d.metadata["question_id"] for d in self.documents])

    @property
    def backend(self):
        return "sentence-transformers/FAISS" if self.semantic else "local lexical TF-IDF"

    def catalog(self):
        with self.lock:
            roles = sorted(set(ROLE_TOPICS) | {q.role for q in self.questions if q.source.id not in self.bundled_source_ids})
            options = {}
            for role in roles:
                counts = {"": Counter()}
                for q in self._role_questions(role):
                    counts[""][q.difficulty] += 1
                    counts.setdefault(q.topic, Counter())[q.difficulty] += 1
                options[role] = {
                    topic: [level for level in DIFFICULTIES if per_level[level] >= 5]
                    for topic, per_level in sorted(counts.items()) if sum(per_level.values()) >= 5
                }
            return {
                "roles": roles, "topics": sorted({q.topic for q in self.questions}),
                "interview_options": options, "question_count": len(self.questions), "mode": "demo",
            }

    def _role_questions(self, role):
        topics = ROLE_TOPICS.get(role, ())
        return [
            q for q in self.questions
            if (q.topic in topics if q.source.id in self.bundled_source_ids else q.role == role)
        ]

    def list_questions(self, role=None, topic=None, difficulty=None, search=None):
        with self.lock:
            result = [q.model_copy(update={"role": role}) for q in self._role_questions(role)] if role else list(self.questions)
        if topic:
            result = [q for q in result if q.topic.lower() == topic.lower()]
        if difficulty:
            result = [q for q in result if q.difficulty == difficulty]
        if search:
            wanted = tokens(search)
            result = [q for q in result if wanted & tokens(q.question + " " + q.answer)]
        return result

    def search(self, query, role=None, limit=5):
        candidates = self.list_questions(role=role)
        wanted = tokens(query)
        if not wanted:
            return []
        scores = []
        for q in candidates:
            title = tokens(q.question)
            body = tokens(q.answer)
            overlap = wanted & (title | body)
            if not overlap:
                continue
            # Prefer a distinctive question-title match to ubiquitous answer words.
            score = sum((3 if t in title else 1) * math.log(1 + len(self.questions)/(1+self.doc_frequency[t])) for t in overlap)
            score *= len(overlap)/len(wanted)
            scores.append((score, q))
        scores.sort(key=lambda item: (-item[0], item[1].id))
        if self.semantic and scores:
            import numpy as np
            model, index, chunk_questions = self.semantic
            vector = model.encode([query], normalize_embeddings=True)
            _, ids = index.search(np.asarray(vector,dtype="float32"), len(chunk_questions))
            rank = {}
            for n,i in enumerate(ids[0]):
                if i >= 0:
                    rank.setdefault(chunk_questions[i],n)
            scores.sort(key=lambda item:rank.get(item[1].id,99999))
        return [q for score,q in scores[:limit]]

    def _retrieve(self, state):
        start = time.perf_counter()
        req = state["request"]
        candidates = self.list_questions(req.role, req.topic, req.difficulty)
        return {"candidates":candidates,"trace":[Trace(step="retrieve",detail=f"Retrieved {len(candidates)} licensed candidate questions using {self.backend}; document text is treated as data.",duration_ms=round((time.perf_counter()-start)*1000,3))]}

    def _select(self, state):
        start = time.perf_counter()
        req, candidates = state["request"], state["candidates"]
        if req.question_ids:
            allowed = {q.id:q for q in candidates}
            if len(set(req.question_ids)) != 5 or any(qid not in allowed for qid in req.question_ids):
                raise ValueError("A practice set must contain exactly five distinct questions matching its role and filters.")
            selected = [allowed[qid] for qid in req.question_ids]
        else:
            groups = {}
            for q in candidates:
                groups.setdefault(q.topic, []).append(q)
            # Stable round-robin selection makes source coverage reproducible.
            selected = []
            while groups and len(selected) < 5:
                for topic in list(groups):
                    selected.append(groups[topic].pop(0))
                    if not groups[topic]:
                        del groups[topic]
                    if len(selected) == 5:
                        break
        if len(selected) != 5:
            raise ValueError("Not found in the interview knowledge base: at least five distinct questions are required for this role and filters.")
        return {"questions":selected,"trace":state["trace"]+[Trace(step="select_five",detail="Selected exactly five distinct source-grounded questions with reference answers and one follow-up each.",duration_ms=round((time.perf_counter()-start)*1000,3))]}

    def _study(self, state):
        start = time.perf_counter()
        topics = list(dict.fromkeys(q.topic for q in state["questions"]))
        return {"study_plan":[f"Review {topic}; explain a cited answer and apply it to an example." for topic in topics],"trace":state["trace"]+[Trace(step="study_plan",detail="Created a bounded template study plan. Model calls: 0; paid spend: 0. Demo / rule-based.",duration_ms=round((time.perf_counter()-start)*1000,3))]}

    def plan(self, request):
        with self.lock:
            result = self.workflow.invoke({"request":request}, config={"recursion_limit":8})
        return PlanResponse(questions=result["questions"],trace=result["trace"],study_plan=result["study_plan"])

    def evaluation_question(self, question_id):
        with self.lock:
            q = self.by_id.get(question_id) or self.retired_by_id.get(question_id)
        if not q:
            raise KeyError(question_id)
        return q

    def evaluate(self, question_id, answer):
        q = self.evaluation_question(question_id)
        answer_tokens = tokens(answer)
        matched, missing = [], []
        for concept in q.concepts:
            key = tokens(concept)
            (matched if key and len(key & answer_tokens)/len(key) >= 0.45 else missing).append(concept)
        coverage = round(100*len(matched)/max(1,len(q.concepts)))
        # Transparent heuristic, not factual correctness or human communication scoring.
        clarity = min(100, round(len(answer.split())/20*100)) if coverage else 0
        score = round(0.85*coverage+0.15*clarity)
        feedback = ["Demo / rule-based: concept coverage is lexical overlap, not a factual correctness judgment.", f"Matched {len(matched)} of {len(q.concepts)} source concepts; clarity estimates answer length (20 words reaches 100)."]
        feedback.append("Add the missing source concepts and a concrete example." if missing else "All rubric concepts were mentioned. Check your explanation against the cited reference.")
        return Evaluation(score=score,accuracy=coverage,completeness=coverage,clarity=clarity,matched_concepts=matched,missing_concepts=missing,feedback=feedback,follow_up=q.follow_up,source=q.source)

    def query(self, query, role=None):
        start = time.perf_counter()
        result = self.retriever.invoke(query) if not role else self.search(query, role)
        # A match must cover a substantial portion of query vocabulary; incidental words do not count.
        if result:
            wanted = tokens(query)
            result = [q for q in result if len(wanted & tokens(q.question+" "+q.answer))/max(1,len(wanted)) >= 0.35]
        return QueryResponse(answer=result[0].answer if result else "Not found in the interview knowledge base",questions=result[:3],trace=[Trace(step="retrieve",detail=f"{len(result)} relevant source questions; backend: {self.backend}; no language model invoked.",duration_ms=round((time.perf_counter()-start)*1000,3))])

    def import_questions(self, items, title, url, license_name):
        if license_name not in ALLOWED_LICENSES:
            raise ValueError("Use a supported SPDX license and confirm you have permission to import this source.")
        if not url.startswith("https://") or len(url) > 2000:
            raise ValueError("A public HTTPS provenance URL is required.")
        if not isinstance(items,list) or not 1 <= len(items) <= 500:
            raise ValueError("Source must contain between 1 and 500 structured Q&A records.")
        sid = "source-"+uuid.uuid4().hex
        parsed = []
        for i,item in enumerate(items):
            if not isinstance(item,dict):
                raise ValueError("Every record must be a question/answer object.")
            question, answer = clean(item.get("question","")), clean(item.get("answer",""))
            if not is_theory_prompt(question):
                raise ValueError(f"Record {i + 1} must ask a theory question without a coding exercise or code block.")
            follow_up = clean(item.get("follow_up") or THEORY_FOLLOW_UP)
            if not is_theory_prompt(follow_up):
                raise ValueError(f"Record {i + 1} must use a theory follow-up without a coding exercise or code block.")
            concepts = item.get("concepts") or sorted(tokens(question) & tokens(answer))[:5] or sorted(tokens(answer))[:4]
            if isinstance(concepts,str):
                concepts = [c.strip() for c in concepts.split(";") if c.strip()]
            if len(concepts) > 10 or any(not isinstance(c,str) or len(c)>300 for c in concepts):
                raise ValueError("Concepts must be a list of at most 10 short strings.")
            parsed.append(Question(id=f"{sid}-{i+1}",role=clean(item.get("role","Software Engineer"))[:100],topic=clean(item.get("topic","General"))[:100],difficulty=item.get("difficulty") or "intermediate",question=question,answer=answer,follow_up=follow_up,concepts=concepts,source=Source(id=sid,title=clean(title)[:200],url=url,license=license_name,locator=f"record {i+1}")))
        source = {"id":sid,"title":clean(title)[:200],"url":url,"license":license_name,"status":"indexed","question_count":len(parsed),"chunk_count":0}
        payload = {"source":source,"questions":[q.model_dump() for q in parsed]}
        with self.lock:
            dest = self.storage/f"{sid}.json"
            temp = self.storage/f"{sid}.tmp"
            temp.write_text(json.dumps(payload,ensure_ascii=False),encoding="utf-8")
            temp.replace(dest)
            self.load()
        return self.sources[sid]

    def delete_source(self, sid):
        if sid in self.bundled_source_ids:
            raise ValueError("The bundled public source is read-only; remove imported sources instead.")
        if sid not in self.sources or not re.fullmatch(r"source-[a-f0-9]{32}",sid):
            raise KeyError(sid)
        with self.lock:
            (self.storage/f"{sid}.json").unlink()
            self.load()
