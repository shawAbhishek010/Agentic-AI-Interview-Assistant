# Placement AI — Viva Guide

**CSL374 Project 10 · Placement Interview Prep Bot**

## 1. Project overview and architecture

**30-second introduction.** Placement AI helps students prepare for technical placement interviews. A student chooses a role and gets five distinct questions from a licensed question bank, each with a reference answer, a citation, and one follow-up. The app saves the student's answers, shows which concepts they covered, and tracks their practice over time. Ava, the animated interviewer, can read questions and feedback aloud. An optional local Llama model provides contextual explanations and other source-grounded assistance. Question selection and scoring work even when the model is off.

**What can a student do?** The **Overview** shows recent activity. The **Interview Room** runs five-question sessions with typed or voice input. The **Practice Library** supports search, bookmarks, and custom five-question sets. **Feedback** shows saved answers, rubric results, references, and follow-ups. **Analytics** shows trends from the student's saved practice and supports CSV export. The **Knowledge Base** shows source citations and workflow traces, offers a local model test, and lets students create notes or practice questions from private study documents.

**Request flow**

```text
React browser app → Nginx (Docker) or Vite proxy (development) → Spring Boot gateway
                                                                  ├─ PostgreSQL (H2 in local development)
                                                                  └─ FastAPI agent
                                                                     ├─ LangGraph → licensed question bank
                                                                     ├─ llama.cpp → optional local Llama
                                                                     └─ Piper → local narration fallback
```

The browser calls only the gateway's `/api` routes. Spring handles identity, permissions, and saved records. FastAPI handles document extraction, retrieval, evaluation, and local inference. The gateway authenticates private calls with `X-Internal-Token`. Both APIs use snake_case JSON. This split keeps the Python retrieval and model libraries in one service while the Java gateway controls who can read and change user data.

For example, clicking **Start interview** sends `POST /api/interviews` through Nginx to Spring Boot. Spring identifies the student, asks FastAPI to plan the interview, saves the returned five questions in PostgreSQL, and sends the new session back to React. Docker publishes only the web entry point at `127.0.0.1:8088`. Spring Boot and FastAPI use ports 8080 and 8001 on the private Compose network.

PostgreSQL stores user accounts, interview snapshots, answers, conversations, bookmarks, practice sets, and private study material. The agent's Docker volume stores imported shared sources. Saved sessions retain their original question text, reference answers, and citations if the shared bank changes. [Architecture](docs/ARCHITECTURE.md) · [REST API contract](docs/API_CONTRACT.md)

## 2. Technologies — what, why, and where

| Technology | Why it is used | Where it is used |
| --- | --- | --- |
| **React + TypeScript** | Reusable UI components and compile-time checks for page state and API data. | [Frontend pages](frontend/src/pages), [shared UI](frontend/src/components.tsx), and [API types](frontend/src/types.ts). |
| **Vite + Tailwind CSS** | Vite runs the dev server and builds browser assets. Tailwind and CSS provide responsive layouts and styling. | [Vite config](frontend/vite.config.ts) and [styles.css](frontend/src/styles.css). |
| **Recharts + Lucide** | Recharts draws real practice trends. Lucide provides consistent interface icons. | [Analytics.tsx](frontend/src/pages/Analytics.tsx) and [shared UI](frontend/src/components.tsx). |
| **Java + Spring Boot + Maven** | Spring Boot exposes the REST API. Maven builds and tests the JAR. The project targets Java 17 and the Docker image runs it on Java 21. | [InterviewController.java](backend/src/main/java/com/placementai/InterviewController.java), [pom.xml](backend/pom.xml), and [backend Dockerfile](backend/Dockerfile). |
| **Spring Security + JWT + BCrypt** | BCrypt hashes passwords. Signed, expiring JWTs identify users on later requests. Spring Security enforces access rules. | [AuthController.java](backend/src/main/java/com/placementai/AuthController.java) and [SecurityConfig.java](backend/src/main/java/com/placementai/SecurityConfig.java). |
| **Spring Data JPA + PostgreSQL + H2** | JPA maps Java entities to stored records. PostgreSQL provides durable Compose storage. File-backed H2 simplifies Windows development. | [InterviewRepository.java](backend/src/main/java/com/placementai/InterviewRepository.java) and [application.yml](backend/src/main/resources/application.yml). |
| **Python + FastAPI + Pydantic + Uvicorn** | Python hosts the retrieval and document libraries. FastAPI defines private routes, Pydantic validates their payloads, and Uvicorn serves them. | [main.py](agent/app/main.py), [models.py](agent/app/models.py), and [pyproject.toml](agent/pyproject.toml). |
| **LangChain Core + LangGraph** | LangChain supplies document objects and a retrieval callable. LangGraph runs a fixed sequence and exposes the steps for inspection. | [engine.py](agent/app/engine.py), in the interview planning and retrieval code. |
| **Sentence Transformers + FAISS** | Optional semantic search finds similar wording by comparing vectors. MiniLM creates the embeddings and FAISS searches them. | [engine.py](agent/app/engine.py), with weights prepared by [prepare_embeddings.py](agent/app/prepare_embeddings.py). |
| **Llama-3.2-3B-Instruct + llama.cpp** | The optional quantized model runs on a local CPU without a paid API. It helps explain source material and generate study content. | [local_slm.py](agent/app/local_slm.py) and [compose.slm.yaml](compose.slm.yaml). |
| **pypdf + python-docx** | Extract readable text from uploaded PDF and Word documents. | [Shared imports](agent/app/main.py) and [private study imports](agent/app/study.py). |
| **Web Speech API + Piper** | Browser speech recognition transcribes answers. Browser speech synthesis narrates replies, with Piper WAV audio as the local fallback. | [voice.ts](frontend/src/voice.ts) and [speech.py](agent/app/speech.py). |
| **Docker Compose + Nginx** | Compose starts the stack with persistent volumes. Nginx serves the frontend and proxies API requests on the same origin. | [compose.yaml](compose.yaml) and [frontend Dockerfile](frontend/Dockerfile). |

## 3. How the interview and AI features work

1. **Ingest and index.** The initial MIT-licensed bank contains 103 Q&A records from `30-seconds-of-interviews`. Cleaning and overlapping text windows of 1,200 characters with a 1,000-character stride produce 137 chunks. Records retain the source URL, license, and original locator. Administrators can import structured JSON/CSV or PDF/DOCX with explicit question and answer pairs. [Data attribution](data/ATTRIBUTION.md)
2. **Retrieve and select.** `POST /api/interviews` takes a role and optional topic or difficulty filters. The initial roles are Frontend, React, JavaScript, Full Stack, and Backend Developer (Node.js/JavaScript). Default retrieval uses TF-IDF-style lexical matching, which gives more weight to distinctive terms. Optional semantic search compares MiniLM vectors, with a lexical evidence check. LangGraph retrieves candidates, selects five distinct questions across topics (or validates the student's custom set), and creates a template study plan. Fewer than five valid candidates returns HTTP 422.
3. **Evaluate and save.** `POST /api/interviews/{id}/answers` evaluates one main answer and saves the result. A rubric concept counts as covered when at least 45% of its meaningful words appear in the answer. The score is 85% concept coverage and 15% an answer-length proxy, with zero if no concepts match. Feedback shows matched and missing concepts. This heuristic can miss paraphrases, negation, and factual mistakes. Completion requires all five answers, and duplicate submissions for a question are rejected.
4. **Ask and follow up.** Each question has a deterministic follow-up. If model-assisted follow-ups are explicitly enabled, a successful Llama response can supply the saved follow-up, with its own `follow_up_mode`. Ask Ava uses the saved question, reference, recent discussion, and any saved candidate answer and actual follow-up. Clarification and follow-up discussion are ungraded. After microphone consent, Ava reads the question, listens, displays and speaks the feedback and follow-up, then listens for discussion. Stop, pause, and navigation cancel playback and capture. Students can mute speech or type at any point.

**What is RAG in this project?** Retrieval-augmented generation first looks up relevant passages, then supplies them to the model as context. For example, an explicit local-model request about JavaScript closures retrieves the source explanation before Llama answers. The app retains the citations. If inference is unavailable, it serves the cited reference with a fallback label. If retrieval finds no supporting material, the app reports that and skips inference. Llama generates text, MiniLM produces search vectors, and the rubric computes the score.

## 4. Starting the project, privacy, and viva recap

**Run it yourself.** Start Docker Desktop, then open PowerShell in the project folder containing `compose.yaml`. For a fresh copy, initialize `.env` once.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/init-env.ps1 -AdminEmail admin@placement.local
```

For the full Llama and Piper demo, prepare the local weights once and start the stack. If the model and voice files are already in `.models/`, you can run just the Docker command.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/prepare-slm.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/prepare-voice.ps1
docker compose -f compose.yaml -f compose.slm.yaml up --build -d
```

Open **http://127.0.0.1:8088** and choose **Explore demo workspace**. For source-based practice without local Llama, start with `docker compose up --build -d`. To stop the full stack and keep your data, run `docker compose -f compose.yaml -f compose.slm.yaml stop`. The Windows development option runs from `scripts/start-local.ps1` after setup and uses H2 at the backend and Vite on port 5173. [Full setup and troubleshooting commands](README.md)

**What starts, and in what order?**

1. **Docker Compose** reads `compose.yaml` and `.env`. When the model override is included, the private llama.cpp service loads the verified GGUF weights and must become healthy before the agent starts. PostgreSQL starts independently and uses a persistent volume. [Compose configuration](compose.yaml) · [Model override](compose.slm.yaml)
2. **FastAPI** starts through Uvicorn, which loads `app.main:app` on port 8001. The agent initializes the question bank when a route first requests it. [Agent entry point](agent/app/main.py)
3. **Spring Boot** starts once PostgreSQL and FastAPI pass their health checks. Docker runs `java -jar app.jar`, which calls `PlacementApplication.main()` and brings up the gateway on port 8080. [Java entry point](backend/src/main/java/com/placementai/PlacementApplication.java)
4. **Nginx** starts after the gateway passes its health check. It serves the Vite build and proxies `/api` to Spring Boot. When the browser loads the page, `main.tsx` mounts the React app. [Nginx configuration](frontend/nginx.conf) · [React entry point](frontend/src/main.tsx)

**How are users and documents protected?** A demo login creates an isolated ordinary user. The gateway checks ownership for sessions and private files. Only administrators can add, reindex, or delete shared sources. Signed-in users can upload private PDF, DOCX, TXT, or Markdown files up to 5 MB and request notes or one to five practice questions. The app validates passage citations and can fall back to extracting material from the passages. Private uploads stay out of the shared index. Scanned PDFs need OCR before import. Document text is treated as data. The app saves transcript text and leaves microphone audio unstored. Browser recognition may use the browser vendor's service.

**What was verified?** The recorded checks dated 17 November 2026 cover 80 Python tests (pytest), 30 Java tests (Maven), and 25 Playwright browser cases including a targeted rerun. Newman executed 15 Postman requests and 15 assertions. Saved evidence covers Docker persistence, three real role queries, a missing-source case, and an actual local Llama response explaining JavaScript closures. The five-minute recording shows the earlier baseline before tutoring and private study uploads were added. Physical microphone accuracy still needs a manual check. [Verification and academic evidence](docs/EVIDENCE.md) · [Local model result](docs/evidence/local-slm.json) · [Demo script](docs/DEMO.md)

**Common viva questions**

- **Why exactly five questions?** It is the handout's interview requirement. The workflow validates quantity and uniqueness before a session is created.
- **Is FAISS the main database?** FAISS is an optional search index over question-bank chunks. PostgreSQL is the persistent database for accounts and student activity. The index can be rebuilt from the bank.
- **Does a ready model prove inference worked?** The status endpoint only reports readiness. The authenticated model test runs a real prompt and returns the output, model identity, usage, and latency.
- **What should I show live?** Start a React Developer interview, submit one answer, show its citation and rubric, then use Ask Ava and show that the scored turn count stays the same. In the Knowledge Base, run the local closure test and try an out-of-bank query such as photosynthesis to show the missing-source behavior.
