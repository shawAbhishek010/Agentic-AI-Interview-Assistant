import csv
import io
import json
import logging
import os
import secrets
import time
import uuid
import zipfile

from fastapi import FastAPI, Depends, Header, HTTPException, UploadFile, File, Form, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import JSONResponse
from pydantic import ValidationError
from pypdf import PdfReader
from docx import Document as WordDocument

from .engine import Bank
from .models import PlanRequest, EvaluateRequest, QueryRequest, Question, PlanResponse, Evaluation, QueryResponse, ChatRequest, ChatResponse
from .local_slm import LocalSLM, LocalModelUnavailable
from .models import Trace
from . import study,speech

logger = logging.getLogger("placement.agent")
bank: Bank | None = None


def get_bank():
    global bank
    if bank is None:
        bank = Bank()
    return bank


def internal_auth(x_internal_token: str | None = Header(default=None)):
    expected = os.getenv("INTERNAL_SERVICE_TOKEN", "local-development-token-change-me")
    if not x_internal_token or not secrets.compare_digest(x_internal_token,expected):
        raise HTTPException(401,"Internal service authentication required")


app = FastAPI(title="Placement AI Agent",version="1.0.0",description="Private, source-grounded demo/rule-based interview workflow. No paid model calls.",dependencies=[])
app.include_router(study.router,dependencies=[Depends(internal_auth)])
app.include_router(speech.router,dependencies=[Depends(internal_auth)])


@app.middleware("http")
async def trace_request(request: Request, call_next):
    trace_id = uuid.uuid4().hex
    start = time.perf_counter()
    response = await call_next(request)
    response.headers["X-Trace-ID"] = trace_id
    logger.info(json.dumps({"trace_id":trace_id,"path":request.url.path,"status":response.status_code,"latency_ms":round((time.perf_counter()-start)*1000,2)}))
    return response


@app.exception_handler(ValueError)
async def bad_value(request, exc):
    return JSONResponse(status_code=422,content={"detail":str(exc)[:500]})


@app.exception_handler(KeyError)
async def not_found(request, exc):
    return JSONResponse(status_code=404,content={"detail":"Not found in the interview knowledge base"})


@app.get("/health")
def public_health():
    return {"status":"ok"}


@app.get("/internal/health",dependencies=[Depends(internal_auth)])
def health():
    store=get_bank()
    model=LocalSLM().status()
    return {"status":"ok","mode":"demo","question_count":len(store.questions),"retrieval_backend":store.backend,"model":model,"model_status":"ready: local Llama-3.2-3B-Instruct" if model["status"]=="ready" else "blocked: local SLM is not enabled/ready; paid provider calls disabled"}


@app.get("/internal/catalog",dependencies=[Depends(internal_auth)])
def catalog():
    return {**get_bank().catalog(),"model":LocalSLM().status()}


@app.get("/internal/model/status",dependencies=[Depends(internal_auth)])
def model_status():
    return LocalSLM().status()


@app.post("/internal/model/test",dependencies=[Depends(internal_auth)])
def model_test():
    try:
        return LocalSLM().basic_test()
    except LocalModelUnavailable as exc:
        raise HTTPException(503,str(exc)) from exc


@app.get("/internal/questions",response_model=list[Question],dependencies=[Depends(internal_auth)])
def questions(role: str|None=None, topic: str|None=None, difficulty: str|None=None, search: str|None=None):
    return get_bank().list_questions(role,topic,difficulty,search)


@app.get("/internal/questions/{qid}",response_model=Question,dependencies=[Depends(internal_auth)])
def question(qid:str):
    q=get_bank().by_id.get(qid)
    if q is None:
        raise HTTPException(404,"Question not found")
    return q


@app.post("/internal/agent/plan",response_model=PlanResponse,dependencies=[Depends(internal_auth)])
def plan(payload:PlanRequest):
    return get_bank().plan(payload)


@app.post("/internal/agent/evaluate",response_model=Evaluation,dependencies=[Depends(internal_auth)])
def evaluate(payload:EvaluateRequest):
    store=get_bank()
    result=store.evaluate(payload.question_id,payload.answer)
    if os.getenv("LOCAL_SLM_FOLLOWUPS","false").lower()=="true":
        try:
            generated=LocalSLM().follow_up(store.by_id[payload.question_id],payload.answer)
            result=result.model_copy(update={"follow_up":generated.text,"follow_up_mode":"local_slm","model":generated.model})
        except LocalModelUnavailable:
            result=result.model_copy(update={"warning":"Local SLM was unavailable or exceeded its budget. Showing the source-grounded follow-up template."})
    return result


@app.post("/internal/agent/query",response_model=QueryResponse,dependencies=[Depends(internal_auth)])
def query(payload:QueryRequest):
    result=get_bank().query(payload.query,payload.role)
    if not payload.use_model or not result.questions:
        return result
    started=time.perf_counter()
    try:
        generated=LocalSLM().grounded_answer(payload.query,result.questions)
        return result.model_copy(update={"answer":generated.text,"mode":"local_slm","model":generated.model,"trace":result.trace+[Trace(step="generate_answer",detail="Actual local Llama-3.2-3B-Instruct inference using retrieved evidence; citations attached by the server. No paid API.",duration_ms=generated.latency_ms)]})
    except LocalModelUnavailable:
        return result.model_copy(update={"warning":"Local SLM was unavailable or exceeded its budget. Showing the original cited source answer.","trace":result.trace+[Trace(step="generate_answer",status="fallback",detail="Bounded local inference unavailable; preserved the original source answer.",duration_ms=round((time.perf_counter()-started)*1000,2))]})


@app.get("/internal/sources",dependencies=[Depends(internal_auth)])
def sources():
    return list(get_bank().sources.values())


@app.post("/internal/agent/chat",response_model=ChatResponse,dependencies=[Depends(internal_auth)])
def chat(payload:ChatRequest):
    # The authenticated gateway supplies the saved, user-owned question snapshot.
    # Do not retrieve again: pronouns and examples refer to this exact question.
    try:
        generated=LocalSLM().conversational_answer(payload.question,payload.message,payload.history,
                candidate_answer=payload.candidate_answer,interviewer_follow_up=payload.interviewer_follow_up)
        return ChatResponse(answer=generated.text,mode="local_slm",source=payload.question.source,model=generated.model)
    except LocalModelUnavailable:
        prefix=f'Here is the reference explanation for "{payload.question.question[:200]}":\n\n'
        answer=prefix+payload.question.answer[:2999-len(prefix)]
        return ChatResponse(answer=answer,mode="demo",source=payload.question.source,warning="A grounded local reply could not be produced. Showing the current cited reference instead.")


def parse_document(filename, content):
    ext = filename.lower().rsplit(".",1)[-1]
    if ext == "json":
        return json.loads(content.decode("utf-8-sig"))
    if ext == "csv":
        return list(csv.DictReader(io.StringIO(content.decode("utf-8-sig"))))
    if ext not in {"pdf","docx"}:
        raise ValueError("Supported file types: JSON, CSV, PDF and DOCX.")
    if ext == "docx":
        with zipfile.ZipFile(io.BytesIO(content)) as archive:
            if len(archive.infolist())>2000 or sum(i.file_size for i in archive.infolist())>20_000_000:
                raise ValueError("DOCX expanded size exceeds the safety limit.")
        text="\n".join(p.text for p in WordDocument(io.BytesIO(content)).paragraphs)
    else:
        reader = PdfReader(io.BytesIO(content))
        if len(reader.pages)>100:
            raise ValueError("PDF must contain at most 100 pages.")
        text="\n".join(p.extract_text() or "" for p in reader.pages)
    # Only explicit Q:/A: pairs can be imported; never guess answers from arbitrary prose.
    import re
    pairs=re.findall(r"(?:^|\n)Q:\s*(.*?)\nA:\s*(.*?)(?=\nQ:|\Z)",text,re.S)
    if not pairs:
        raise ValueError("PDF/DOCX requires explicit Q: question and A: answer pairs; arbitrary documents are not inferred.")
    return [{"question":q.strip(),"answer":a.strip()} for q,a in pairs]


@app.post("/internal/sources/import",status_code=201,dependencies=[Depends(internal_auth)])
async def import_source(file:UploadFile=File(...), title:str=Form(...,min_length=2,max_length=200), url:str=Form(...,max_length=2000), license:str=Form(...,max_length=40)):
    content = await file.read(5_000_001)
    await file.close()
    if len(content)>5_000_000:
        raise HTTPException(413,"Maximum upload size is 5 MB.")
    if not file.filename or len(file.filename)>250:
        raise HTTPException(422,"A valid filename is required.")
    try:
        items=await run_in_threadpool(parse_document,file.filename,content)
        return await run_in_threadpool(get_bank().import_questions,items,title,url,license)
    except (ValueError,ValidationError,UnicodeError,zipfile.BadZipFile) as exc:
        raise HTTPException(422,str(exc)[:500]) from exc
    except Exception as exc:
        logger.warning("Document could not be parsed: %s",type(exc).__name__)
        raise HTTPException(422,"Document could not be parsed. Check the structured import format.") from exc


@app.post("/internal/sources/{sid}/index",dependencies=[Depends(internal_auth)])
def index_source(sid:str):
    store=get_bank()
    if sid not in store.sources:
        raise HTTPException(404,"Source not found")
    with store.lock:
        store.load()
    return store.sources[sid]


@app.delete("/internal/sources/{sid}",status_code=204,dependencies=[Depends(internal_auth)])
def delete_source(sid:str):
    get_bank().delete_source(sid)
