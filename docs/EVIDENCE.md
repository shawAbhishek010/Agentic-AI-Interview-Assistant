# Verification and academic evidence

Latest verification: **17 November 2026**, with earlier baseline artifacts retained from 16 November. Reports below reflect commands actually executed; they do not claim instructor grading or a human classroom presentation.

| Check | Executed result | Evidence |
| --- | --- | --- |
| Python unit/API tests | 80 passed, including saved candidate/follow-up context and bounds, contextual chat, ordinary-prose imports, requested facts near a passage's end, generated study schema/count/citations, JSON fences, unavailable-model fallback and WAV/no-cache behavior | `cd agent; uv run --extra voice --extra semantic pytest -q` |
| Gateway integration and real HTTP client tests | 30 passed, including authoritative saved follow-up forwarding, spoofed-context rejection, chat persistence/ownership, private documents, voice routes, authentication and actual HTTP URI encoding | Maven Surefire XML under ignored `backend/target/surefire-reports/` |
| Frontend TypeScript/production build | Passed; pages are split into lazy-loaded chunks | `cd frontend; npm run build` |
| Browser checks | 25 passed across the full run and a targeted rerun: 10 application flows against Docker/PostgreSQL, 6 mocked model-mode cases and 9 simulated dialogue/voice lifecycle cases. The full run passed 24; its old manual-replay audio check was updated for automatic narration and then passed separately. | `frontend/tests/workspace.spec.ts`, `model-mode.spec.ts`, `conversation-study.spec.ts`, `interview-dialogue.spec.ts`, `voice-lifecycle.spec.ts`; screenshots in `docs/screenshots/` |
| Postman collection runtime | 15 requests, 15 assertions, zero failures, executed using Newman; Postman GUI was not used | [postman-summary.json](evidence/postman-summary.json) |
| Real local API smoke | Three role queries, exact-five/citation contract, five saved answers, completion, analytics, missing-source fallback and cross-account 404 passed | [actual-api-results.json](evidence/actual-api-results.json) |
| Real Docker/PostgreSQL API smoke | Same three role queries and end-to-end checks passed through Nginx/Spring/FastAPI/PostgreSQL | [docker-api-results.json](evidence/docker-api-results.json) |
| Container persistence and admin boundary | Answer survived API container restart; source import/reindex/delete and imported-role exact-five worked; ordinary user received 403 | [docker-check.json](evidence/docker-check.json) |
| Local semantic retrieval | Real MiniLM 384-dimensional embeddings and FAISS indexed 137 chunks; all ten retrieval probes and missing-source fallback passed | [semantic-retrieval.json](evidence/semantic-retrieval.json) |
| Genuine SLM inference | Real Llama-3.2-3B-Instruct Q4_K_M CPU inference through the authenticated app API; basic closure answer, source-grounded generated answer, default source-only mode and two actual disabled/unreachable-model fallbacks passed | [local-slm.json](evidence/local-slm.json) |
| Persisted generated follow-up | Actual local-model follow-up persisted through the gateway, while score/accuracy/completeness/clarity remained equal to the deterministic baseline | [model-deployment-check.json](evidence/model-deployment-check.json) |
| Contextual learning and personal documents | Actual local Llama tutoring plus a contextual cross-question persisted as four messages with zero scored turns; requested notes and two questions generated from synthetic uploaded prose; foreign-account document lookup returned 404; Piper returned real RIFF/WAV audio | [learning-assistant.json](evidence/learning-assistant.json), reproduced by `node scripts/learning-evidence.mjs` |
| Interview follow-up text and audio | A scripted source-derived candidate answer produced one saved scored turn; actual local-model follow-up clarification produced two chat messages without another scored turn, and the exact reply text produced real Piper WAV audio | [interview-dialogue.json](evidence/interview-dialogue.json), reproduced by `node scripts/dialogue-evidence.mjs` |
| Ingestion sample | 103 public Q&A records, 137 chunks, license + original locator preserved | [ingestion-sample.json](evidence/ingestion-sample.json) |
| Setup utilities | PowerShell syntax parsed; start-local reached healthy services; Maven archive SHA-512 checked | Scripts and decisions |
| Five-minute recorded demonstration | Verified 300.00 seconds, H.264 video + AAC offline narration; actual five-answer session, all six screens, retrieval failure and genuine local-model response, no browser runtime errors | [MP4](demo-output/Placement-AI-five-minute-demo.mp4), [manifest](demo-output/recording-manifest.json), [transcript](demo-output/transcript.md) |

The browser checks cover all six screens, real five-question completion/deletion, feedback persistence, analytics/report download, bookmarks/custom sets, retrieval, mobile navigation and model labels. Additional simulated cases verify interviewer/candidate turn-taking, matching text and speech, ungraded follow-up answers, spoken next-question navigation, stop/pause with delayed replies, long browser/Piper speech chunks, duplicate speech-end events and empty recognition results. Real Piper playback is checked separately. Mocked outputs are not inference or physical microphone evidence; recognition accuracy, other browser engines and human scoring quality remain unverified.

The main automated checks total **135 passing cases** (80 Python + 30 Java + 25 browser), including the targeted browser rerun described above; [executed-check summary](evidence/learning-checks.json). The ten semantic retrieval probes and fifteen Postman assertions are additional baseline checks. Actual SLM response artifacts are separate from all mocked tests. The five-minute video predates the contextual tutoring, personal-document and dialogue extensions; it remains evidence of the earlier baseline only.

## Definition of Done mapping

| Handout requirement | Status | Evidence / limitation |
| --- | --- | --- |
| DoD 1 — data ingestion/cleaning/chunking (3 marks) | Implemented and verified | Public repository license/revision in `data/ATTRIBUTION.md`; actual ingestion sample retained. |
| DoD 2 — actual chosen SLM response (3 marks) | **Implemented and verified** | The handout's suggested Llama-3.2-3B-Instruct runs locally in a verified Q4_K_M build. `local-slm.json` retains the real prompt, correct closure answer, model identity, usage and latency. No paid API or Ollama. |
| DoD 3 — role → five questions, model reference answers, one follow-up each (5 marks) | Implemented and verified | Exact-five cited Q&A tested for five supported roles. Reference answers remain from the public bank; deterministic follow-ups are always present. Optional answer-conditioned local-model follow-ups were also exercised and persisted with explicit provenance. |
| DoD 4 — REST endpoint and Postman evidence (5 marks) | REST and collection runtime verified | 15 runnable collection requests with actual Newman execution. Import the collection in Postman GUI for classroom presentation if required. |
| DoD 5 — README, setup, three actual queries, failure case, five-minute demo (4 marks) | Implemented, recorded and verified | README/setup, three actual role responses, no-source failure, script, transcript and a real 300-second narrated application recording are included. The recording is automated; no human classroom presentation is claimed. |

No instructor mark is claimed. Real local SLM evidence now exists independently of optional voice/avatar/analytics features.

## Known limits to demonstrate honestly

- Default retrieval is lexical; optional MiniLM/FAISS was exercised locally. The default Docker image runs lexical mode. It has not been claimed to run semantic mode unless explicitly rebuilt/prepared.
- Some initial source examples describe older JavaScript/React APIs. The bank contains JavaScript/web roles, not invented Java/Python coverage.
- The rubric matches concept words; it cannot reliably judge negation, factual correctness or paraphrases. Scores are practice indicators.
- The local model can still make mistakes. Generated answers/follow-ups are marked separately, original references remain accessible, model requests are opt-in/bounded, and failure preserves an honest source-only fallback.
- Shared administrator Q&A-bank import requires explicit question/answer pairs. Personal study imports accept ordinary PDF/DOCX/TXT/MD prose, remain owner-private and generate notes or 1–5 practice questions. Scanned PDFs require OCR before import. Generation uses a bounded selection of passages rather than the entire document at once.
- Imported source metadata lives on the agent volume, while session/user data lives in PostgreSQL. Historical references remain after source deletion; active sessions depending on deleted source questions should be ended and restarted.
- The app is bound to loopback for local use. Public deployment hardening and physical voice testing are outside the recorded checks.
