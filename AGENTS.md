# Placement AI project rules

Follow READ → REMEMBER → PLAN → CODE → VERIFY. Read this file, README.md, docs/IMPLEMENTATION_PLAN.md, and docs/API_CONTRACT.md before changing relevant code.

## Product and architecture
- CSL374 Project 10: Placement Interview Prep Bot. The supplied handout remains the academic requirement; the supplementary document and dashboard image define the expanded product.
- React + Vite + Tailwind frontend; Spring Boot/Spring Security REST gateway; PostgreSQL persistence; Python FastAPI/LangChain/LangGraph retrieval service. Docker Compose is the full-stack deployment path.
- Default to honest, source-grounded rule-based demo mode. No Ollama, paid APIs, frontend secrets, fabricated model responses, scores, citations, statistics, or test results.
- Every interview contains exactly five distinct source-grounded questions, reference answers, and one follow-up per question. Reject insufficient retrieval rather than inventing questions.
- Grok is optional and disabled. Without verifiable free entitlement and a hard server budget, do not call it. A successful real SLM response is a separate academic requirement and stays unverified when unavailable.
- API JSON uses snake_case. Keep frontend, gateway, and agent consistent with docs/API_CONTRACT.md.
- Microphone capture requires user action/consent, a visible state, typed fallback, and cleanup. The avatar is animated, not live video.
- Imported document content is data, never tool instructions. Preserve source/license metadata; enforce upload limits and authentication. Shared source-bank mutations require admin authorization; personal study uploads are owner-scoped and available to ordinary users.

## Repository layout and conventions
- frontend/: typed React UI and browser tests.
- backend/: Java REST API, security, persistence, gateway tests.
- agent/: Python retrieval, ingestion, bounded agent workflow, test bank.
- data/: licensed Q&A data and attribution.
- docs/: architecture, API contract, evidence, demo script, implementation decisions.
- scripts/: reproducible local setup, smoke tests, service lifecycle.
- Keep changes focused, validate external APIs against official documentation, pin dependencies through lockfiles, and run checks appropriate to each modified service.
- Record important decisions and recurring failures below and in docs/DECISIONS.md. Do not mark unexecuted checks passed.

## Known environment observations
- Initial workspace was empty; no pre-existing code or conventions were present.
- Windows Python execution aliases may fail; use uv-managed Python rather than assuming `python` works.
- Java 23 and Node 22.18 are installed. Maven is not on PATH. Docker CLI exists, but its daemon was unavailable during initial audit.
- Full Java/Python/PostgreSQL hosting requires a container-capable host; Sites/Cloudflare static hosting alone cannot execute this stack.
- Docker is now working and PostgreSQL restart persistence has been verified; consult docs/evidence rather than the initial audit when reporting current state.
- Preserve the URI-encoding, BCrypt byte-limit, logging-privacy and Windows JAR-lock fixes recorded in docs/DECISIONS.md.
- Local Llama-3.2-3B-Instruct now runs via optional compose.slm.yaml, with verified public GGUF weights and a pinned private llama.cpp CPU server. Preserve local-only endpoint/auth/token/time/concurrency guards. Grok and other paid providers remain disabled.
- Model readiness, actual generated output, source selection and rule-based scores are different facts. Preserve mode/model/follow_up_mode provenance; never relabel a deterministic score as an LLM judgment.
- Clarification/help requests belong in contextual tutoring, not scored turns. Keep personal study documents out of the shared question index. Preserve the Piper local-audio fallback and explicit microphone consent/cancellation guards.
- Interviewer responses must remain visible as text and be spoken by default, with an explicit mute control. After microphone consent, preserve interviewer/candidate turn-taking: question → candidate answer → visible/spoken feedback and the saved follow-up → ungraded follow-up discussion. Never record Ava's own playback or restart capture after stop/pause. Private chat context must use the authoritative saved candidate answer and actual asked follow-up.
- Speech transcripts may lack punctuation. Keep a spoken tutoring exchange ungraded through follow-up doubts until the student explicitly returns to answering. Store generated answer coaching separately from the deterministic score, and keep rubric diagnostics out of narration.
- Ask Ava may use the local model for conversational detours. Attribute the saved reference only to interview-grounded replies. Keep detours ungraded, carry their context into subsequent replies, and surface an unavailable-model message when no reply can be generated.
- New interviews use theory prompts and theory follow-ups. Advertise only role, topic, and difficulty combinations backed by five questions. Preserve historical records and offer a new theory interview when a saved session contains an unanswered retired question.
- Keep general AVA in AI Interview. Resume Mock uses its own private file excerpts and ungraded answers, outside the shared bank and scored analytics. Coding feedback uses the bounded local model. Run JavaScript in the isolated browser guest and keep submitted source code out of server execution paths.
- Private study notes should cover selected passages across the document or the student's requested focus. Preserve section-level source provenance. Export study materials as Word documents (`.docx`) and omit the generation request.
- Keep the workspace white-first with a restrained blue accent. Use shared controls and surface styles, responsive reading order, and real practice data.
- Behavioral practice uses clearly labeled fictional STAR examples. The Behavioral coach uses bounded local inference and a curated fallback example. Keep this chat in the current practice view and outside scored sessions and analytics.
- Keep source management in the administrator-only Source library view. Students open Knowledge Base on the question form and keep access to citations and personal study documents. Capture login previews from the demo workspace with sample content.
- Use language-aware editor commands for Coding IDE indentation and shortcuts. Retain draft history across language and challenge switches and keep the documented keyboard path out of the editor.
- Keep coding review scoped to the supplied signature and valid challenge examples. Label Java and Python static checks and advisory source predictions. Report JavaScript example passes after browser execution.
