# Implementation plan

## Requirements and priorities

First satisfy data ingestion/chunking, grounded role-based five-question interviews with reference answers and follow-ups, a REST microservice, and reproducible setup/demo evidence. A genuine SLM response cannot be claimed from the deterministic demo. The supplementary specification intentionally proposes a different provider from the handout; instructor approval and model evidence remain explicit deliverable limitations.

## File-by-file work areas

1. `data/`: license-verified public interview bank, original license text, immutable source URLs and locators. `agent/app/engine.py` implements validation/chunking, lexical retrieval, optional sentence-transformer/FAISS indexing and the bounded LangGraph workflow.
2. `agent/pyproject.toml`, `agent/app/models.py`, `engine.py`, `local_slm.py`, `main.py`: typed FastAPI contracts, real LangGraph orchestration, inspection traces, retrieval/selection/evaluation/study-plan tools, optional local inference and honest fallbacks. `agent/tests/` validates five roles, at least ten retrieval probes, imports, local-only inference guards and failures.
3. `backend/pom.xml`, Java application/security/auth/session/practice/analytics/knowledge packages, and application profiles: JWT, BCrypt, user isolation, persisted session snapshots/answers, per-user analytics and practice sets, admin-only imports, internal service authentication. PostgreSQL for Compose; file-backed H2 as an explicitly documented local development profile.
4. `frontend/package.json`, `src/api.ts`, `types.ts`, reusable components and page modules: six responsive navy/violet/cyan screens matching the reference. Browser TTS, opt-in STT, typed fallback, animated avatar, real data and empty states. No dead controls or fabricated activity.
5. `compose.yaml`, service Dockerfiles, `.env.example`, `scripts/`: full-stack startup, local bootstrap and smoke/evidence capture.
6. `docs/ARCHITECTURE.md`, `API_CONTRACT.md`, `DECISIONS.md`, `DEMO.md`, `EVIDENCE.md`, Postman collection, and final README: architecture, actual sample outputs, provenance, limitations, executed checks, academic DoD status.

## Validation order

- Agent unit/API tests, ingestion samples, five-role exact-five invariant and ten retrieval probes.
- Gateway security/persistence/API contract tests and Maven package.
- Frontend typecheck/build and browser interaction tests, including microphone denial.
- Start all available local services; execute REST smoke flow, three sample queries and one missing-source fallback; capture actual evidence. Run Compose configuration validation when Docker CLI allows it; report daemon limitations honestly.
- Review authorization, data isolation, secret handling, cancellation/retries, frontend empty/error states and cross-service contracts.

## Design direction

Premium student workspace following the provided image: navy `#0B1020`, charcoal surfaces, violet primary actions and cyan evidence/status accents. Compact sidebar, coherent typography, restrained borders/glows, accessible responsive layouts. Analytics begin empty and populate only from real practice.

## Completion phase — 17 November 2026

1. Add `agent/app/local_slm.py`: a local-only llama.cpp adapter with endpoint allowlist, explicit enable switch, authenticated requests, finite token/time/concurrency budgets, typed status/test output, and graceful demo fallback. No hosted provider or Ollama.
2. Add reproducible model setup in `scripts/prepare-slm.ps1`: pinned public Llama-3.2-3B-Instruct GGUF, verified SHA-256, retained license/attribution; store weights only in ignored `.models/`.
3. Add optional `compose.slm.yaml`: private CPU inference container. Default Compose remains the fast demo configuration. Update API health/catalog/model routes and UI to distinguish real local inference, rule-based scores and fallback.
4. Keep exact-five source questions and reference answers immutable. Allow explicitly requested grounded query generation and bounded model follow-ups; preserve citations server-side and label each output's actual mode.
5. Execute genuine basic model inference, a grounded query, unavailable-model fallback, full service/browser checks and a reproducible five-minute narrated demonstration recording. Save actual outputs without secrets and update DoD evidence only after checks complete.

## Conversational voice fix

The initial voice layer only transcribed into a text box or replayed a question on demand. The user requires spoken replies and contextual cross-questions.

1. Add per-interview, owner-scoped conversational messages in the gateway with a bounded history; preserve exactly five scored interview questions and all existing answer APIs.
2. Add a private contextual chat endpoint and local-model adapter that use the authoritative current question/reference plus recent messages. Clarifications such as "what do you mean?" must not depend on keyword retrieval. Unsupported or unavailable-model requests return an explicit cited fallback.
3. Extend `frontend/src/voice.ts` with reliable voice loading, explicit playback errors, final-transcript completion, cancellation guards and microphone cleanup. The browser API remains a capability-dependent voice transport; it is not an AI reasoning library.
4. Add an Ask Ava panel in `InterviewRoom.tsx`, typed and spoken cross-questions, saved conversation, automatic spoken replies after opt-in, question narration and replay controls. Voice capture requires explicit consent and is visibly indicated. Typed and readable replies remain available if browser speech fails.
5. Test actual contextual chat/persistence, session isolation, pronoun/history handling, browser voice playback and final-transcript routing, permission denial, stop/pause/leave cancellation, and the exact-five invariant. Rebuild the deployed stack and document exact verification limits.

## Personal documents and study materials

Add a separate, user-private document workspace. Ordinary users can upload PDF, DOCX, TXT or Markdown, then request explanatory notes or up to five source-grounded practice questions. These uploads do not enter the shared public interview bank and do not require a public license URL. Store extracted chunks and generated materials under their owner's database record; validate file size/type and source citations, provide delete/history/download controls, and label extractive fallback if local inference cannot finish. Reuse the local SLM and existing authenticated service boundary. Verify arbitrary prose import, owner isolation, requested content/count, citation integrity and fallback.

## Audio and text interview dialogue

1. Default interview replies to visible text plus audio; retain mute/replay and readable fallback when playback fails.
2. Let explicit voice-interview consent start question narration, then capture one completed candidate answer. Preserve the five scored questions and direct help requests to ungraded chat.
3. Render and speak the same acknowledgment/feedback/follow-up text, then listen for an ungraded response. Support an explicit next-question action or spoken command.
4. Forward saved candidate answers and actual asked follow-ups from the gateway to bounded private chat; never trust client replacement context.
5. Preserve full long replies with bounded sequential audio chunks, resume capture only after the final chunk, and invalidate all stale callbacks after stop/pause/navigation. Verify multi-turn flow, delayed replies, microphone denial, long output and empty recognition separately from physical microphone accuracy.
