# Cross-service API contract

All JSON uses snake_case. Timestamps are ISO-8601 UTC. Scores are transparent rule-based concept-coverage estimates (0–100), never asserted to be an LLM assessment. Errors contain `message`; agent FastAPI may use `detail`. Gateway converts upstream errors to `message` with appropriate status. Query text uses `mode=local_slm` only after successful local inference; interview selection and scores retain `mode=demo` independently of model availability.

## Shared objects

- Source: `{id,title,url,license,locator}`.
- Question: `{id,role,topic,difficulty,question,answer,follow_up,concepts: string[],source}`.
- Trace: `{step,status,detail,duration_ms}`.
- Evaluation: `{score,accuracy,completeness,clarity,matched_concepts,missing_concepts,feedback,follow_up,mode,source}`. Feedback is `string[]`. Mode is `demo` unless an actual eligible model was used.
- User: `{id,name,email,role}`; role is `USER` or `ADMIN`.
- Session: `{id,role,topic,difficulty,status,questions:Question[],turns:Turn[],created_at,finished_at,trace:Trace[],mode}`. Status: `active`, `completed`, `cancelled`. Turn: `{question_id,answer,evaluation,answered_at}`.
- SourceDocument: `{id,title,url,license,status,chunk_count,question_count,error?}`.
- ModelInfo: `{provider,model_id,status,local}`; provider `llama.cpp`, model_id `Llama-3.2-3B-Instruct`, status `ready|disabled|unavailable`, local `true`. Readiness is not inference evidence.
- Evaluation adds `follow_up_mode:demo|local_slm`, optional `model:ModelInfo` and `warning`. A generated follow-up never turns the lexical score into an LLM assessment.

## Public gateway (port 8080)

`GET /api/health` → `{status,agent_status,mode}` (public).

`POST /api/auth/register {name,email,password}`, `/api/auth/login {email,password}`, `/api/auth/demo {}` → `{token,user}`. Demo creates an isolated ordinary user, never an admin. `GET /api/me` → User. All remaining routes require Bearer token. Admin registration is not public; optional administrator bootstrap is environment driven.

`GET /api/catalog` → `{roles:string[],topics:string[],question_count:number,mode}`.

Catalog also includes `model:ModelInfo`. `GET /api/model/status` returns ModelInfo. `POST /api/model/test {}` executes a fixed basic programming prompt and returns `{mode:local_slm,model,prompt,response,latency_ms,usage}`. Both require a signed-in user; unavailable/disabled inference returns 503. Status does not call completion inference.

`GET /api/questions?role=&topic=&difficulty=&search=` → Question[]. `GET /api/questions/{id}` → Question.

`POST /api/interviews {role,topic?,difficulty?,question_ids?:string[]}` → Session (201). Agent must return exactly five distinct questions. `GET /api/interviews/{id}` → Session. `POST /api/interviews/{id}/answers {question_id,answer}` → Session with added evaluated turn (duplicate question submissions rejected). `POST /api/interviews/{id}/finish {cancel?:boolean}` → Session. Completing requires all five answers; cancellation permits partial sessions. `DELETE /api/interviews/{id}` → 204. `GET /api/interviews` → Session[] newest first.

`GET /api/analytics/overview?days=30` → `{interviews_completed,questions_practiced,average_score,streak,topics_covered,score_trend:[{date,score}],recent_interviews:Session[],recommendations:string[]}`. `GET /api/analytics/topics?days=30` → `[{topic,score,answers}]`. `GET /api/analytics/history?days=30` → Session[]. Data belongs only to current user; completed sessions drive interview counts, answered turns drive practice counts.

`GET /api/practice/sets` → `[{id,name,role,question_ids,created_at}]`; `POST /api/practice/sets {name,role,question_ids}` → set (201); `DELETE /api/practice/sets/{id}` → 204. `GET /api/bookmarks` → string[]; `PUT /api/bookmarks/{questionId}` → 204; `DELETE /api/bookmarks/{questionId}` → 204.

`GET /api/sources` → SourceDocument[] (read-only catalog for all signed-in users). `POST /api/knowledge/query {query,role?}` → `{answer,questions:Question[],trace:Trace[],mode}`. `GET /api/admin/sources` returns same catalog for admins. `POST /api/admin/sources/import` is multipart `file` plus `title,url,license`; response SourceDocument (201). `POST /api/admin/sources/{id}/index` → SourceDocument. `DELETE /api/admin/sources/{id}` → 204. Only ADMIN can mutate sources.

## Private FastAPI agent (port 8001)

Require `X-Internal-Token` matching `INTERNAL_SERVICE_TOKEN` on every `/internal/*` endpoint, including health (gateway supplies it). Health may expose `/health` publicly with minimal status for container readiness.

- `GET /internal/health` → `{status,mode,question_count,retrieval_backend,model_status}`.
- `GET /internal/catalog` → public catalog shape.
- `GET /internal/questions` with the same filter parameters → Question[]. `GET /internal/questions/{id}` → Question.
- `POST /internal/agent/plan {role,topic?,difficulty?,question_ids?}` → `{questions:Question[5],trace:Trace[],mode,study_plan:string[]}`; insufficient role evidence → 422 with graceful explanation.
- `POST /internal/agent/evaluate {question_id,answer}` → Evaluation.
- `POST /internal/agent/query {query,role?}` → public knowledge-query shape.
- Query requests also accept `use_model:boolean=false`. Only explicit true requests attempt local generation after relevant source retrieval. Results add optional `model` and `warning`; failure preserves the cited reference answer with `mode=demo` and a fallback trace. Unsupported queries never invoke the model and return no references.
- `GET /internal/model/status`, `POST /internal/model/test {}` mirror the public authenticated gateway routes and additionally require the private internal service token.
- `GET /internal/sources`, `POST /internal/sources/import` (multipart), `POST /internal/sources/{id}/index`, `DELETE /internal/sources/{id}` mirror gateway source routes.

Shared Q&A-bank uploads are global/admin-managed; personal study documents, interview answers and conversations remain user-private. Browser code never calls private agent endpoints directly. Default internal token is development-only and must be overridden outside loopback development.

## Inference bounds

Local model requests allow only loopback, `slm`, or Docker's host endpoint at a `/v1` base path. Hosted endpoints, userinfo, redirects, query-bearing base URLs and alternate model identifiers are rejected before network access. One inference executes at a time; additional concurrent requests receive a safe fallback/busy response. Query/test generation is limited to 128/96 output tokens and 25 seconds. Optional follow-ups are limited to 64 tokens and 12 seconds. Gateway timeout is 45 seconds, Nginx 60 seconds, explicit browser model requests 65 seconds. No automatic hosted-provider fallback exists.

## Interview conversation

`POST /api/interviews/{id}/chat {message,question_id?}` appends a user/assistant exchange for an owned interview and returns `{messages:ChatMessage[],reply:ChatMessage}`. `GET /api/interviews/{id}/chat?question_id=` reads all saved messages or one question's conversation. Sessions add `chat_messages:ChatMessage[]` without changing the existing five interview questions or scored turns.

ChatMessage: `{id,question_id,role:user|assistant,content,created_at,mode:user|local_slm|demo,model?:ModelInfo,source?:Source,warning?:string}`. Message text is limited to 2,000 characters on input and 3,000 on output. A session allows at most 40 conversational exchanges. Ownership is required; foreign sessions return 404. Cancelled sessions cannot accept new chat. If omitted, question_id selects the current unanswered question or the last question after completion.

The gateway supplies the authoritative saved question and latest six same-question messages to `POST /internal/agent/chat {question:Question,message,history:[{role:user|assistant,content}]}`. The agent returns `{answer,mode,source,model?,warning?}`. Conversation generation is bounded to 160 tokens and 25 seconds. Context is treated as data, never tool instructions; no new citations or scored questions are generated. Local-model failure or unsupported scope returns an explicitly labelled explanation grounded in the saved reference. Conversation does not submit, grade, or advance an interview answer.

For an already answered question, the gateway also supplies optional private `candidate_answer` (up to 12,000 characters) and `interviewer_follow_up` (up to 1,000 characters) from its stored turn and evaluation. Public chat inputs cannot replace this context. The adapter clips these fields to 500/350 UTF-8 bytes inside the same total input budget. Follow-up responses remain ungraded discussion.

## Personal study documents

All routes require a signed-in user and are scoped to that user. `GET /api/documents` lists metadata. `POST /api/documents/import` multipart `file,title?` accepts PDF/DOCX/TXT/MD up to 5 MB and returns document metadata. `GET /api/documents/{id}` returns metadata, an excerpt and saved materials. `DELETE /api/documents/{id}` deletes the owned document and its materials. Foreign IDs return 404.

`POST /api/documents/{id}/generate {kind:notes|questions,request:string,count?:1..5}` returns a saved material `{id,kind,request,mode:local_slm|extractive,created_at,title,summary?,bullets?:string[],questions?:[{question,answer,citation_ids:string[]}],sources:[{id,title,locator,excerpt}],warning?}`. Generation uses selected passages from this document only, preserves server-verified citation IDs and requested question count, and falls back explicitly to source-extractive study prompts if the model is unavailable or produces invalid output. It never indexes these private uploads in the shared public source catalog.

The gateway persists extracted chunks and generated history in its user-owned document row. Private agent routes `/internal/documents/extract` (multipart) and `/internal/documents/generate` (validated text chunks and request) perform extraction/generation without retaining private files on the agent service. Scanned PDFs with no extractable text are rejected with a clear message.

Study generation permits up to 320 output tokens and 30 seconds; the general local model guard rejects more than 384 output tokens. Chat uses 160 tokens and a 3,200 UTF-8 byte input budget against the configured 4,096-token context. The agent accepts a complete optional JSON code fence but verifies the entire decoded value, count, shape and citation IDs before exposing generated study material.

## Local voice

Authenticated `GET /api/voice/status` returns `{provider:piper,available,voice:en_US-mike-medium,local:true}`. `POST /api/voice/speech {text:1..2000}` returns `audio/wav` with `Cache-Control:no-store`, or a safe 503 when unavailable/busy. Private agent equivalents require the internal token. Voice synthesis is serialized, model weights are read-only and previously prepared, and neither source text nor produced audio is logged or persisted by the voice service. Browser speech synthesis is preferred when available; Piper provides the offline output fallback. Speech recognition remains browser-dependent and requires consent.

The interview UI shows text and enables speech output by default. A user may mute it. Explicit voice-interview consent is required before capture; completed main answers are submitted once, help requests and follow-up answers use chat, and listening resumes only after Ava's entire reply finishes. Long replies are split into sequential audio chunks of at most 1,800 characters. Stop/pause/navigation invalidate pending playback and microphone callbacks; the original text remains available.
