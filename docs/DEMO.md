# Five-minute demonstration script

Use the live application and actual output. Distinguish deterministic question selection/rubric scores from actual local Llama generation. The reproducible recording instructions are in [demo-recording.md](demo-recording.md).

The completed [300-second narrated recording](demo-output/Placement-AI-five-minute-demo.mp4), [transcript](demo-output/transcript.md), [subtitles](demo-output/chapters.srt) and [execution manifest](demo-output/recording-manifest.json) are included. The video records genuine application requests and local-model inference; narration was generated offline.

| Time | Demonstration |
| --- | --- |
| 0:00–0:35 | Show the Project 10 objective, architecture and zero-paid defaults. Explain the private local Llama-3.2-3B-Instruct CPU service and the separately labelled rule-based rubric. |
| 0:35–1:10 | Show `data/ATTRIBUTION.md`, the included MIT notice, and `scripts/ingestion-sample.ps1` for the theory question count, chunk count, and a source locator. |
| 1:10–2:10 | Open the application, enter an isolated demo workspace, choose a supported role, and start an interview. Show exactly five questions, reference answers, and one follow-up each in the REST response. Type an answer; show the saved lexical rubric and a source link. |
| 2:10–2:45 | Show Practice Library, bookmark a question, and create a five-question set. Show the bundled Java, Python, and SQL topics. |
| 2:45–3:25 | Review saved feedback and real analytics. Explain that scores are heuristic concept-coverage proxies. Demonstrate replay, microphone consent, and the typed fallback. The avatar is animated. |
| 3:25–4:15 | In Knowledge Base, retrieve a closure answer with sources, inspect the workflow, then ask `Explain photosynthesis chloroplasts in orchids`. Show the exact no-source message and empty citation list. |
| 4:15–5:00 | Run the local model test and show its actual prompt, response and latency. Show the Postman/Newman summary and three actual role-based query records. The handout's suggested SLM is now demonstrated locally; Grok remains disabled. |

## Three sample API queries

`POST /api/interviews` with `{"role":"Backend Developer"}`, `{"role":"React Developer"}`, and `{"role":"Frontend Developer"}`. Use the bearer token obtained from demo auth. Each result must contain five distinct, cited Q&A records and one follow-up per record. Actual responses are captured by `node scripts/smoke.mjs` in `docs/evidence/actual-api-results.json`.

## Failure case

`POST /api/knowledge/query` with `{"query":"Explain photosynthesis chloroplasts in orchids"}` returns `Not found in the interview knowledge base` and an empty questions/citations list. Unsupported role setup and filters with fewer than five questions return a clear validation error. These are deliberate graceful fallbacks.

## Voice fallback

Mic access is optional and requested only after an explicit consent dialog. If permission is denied, the UI displays a denial message and keeps the typed answer path working. The automated browser test simulates the browser denial event; physical microphone quality and vendor speech recognition require manual testing on the presenting device.

## Genuine local model evidence

Run the model-enabled Compose stack. `POST /api/model/test {}` returns an actual Llama-3.2-3B-Instruct response to a fixed closure prompt. `POST /api/knowledge/query` with `{"query":"What are JavaScript closures?","use_model":true}` returns a generated, source-grounded answer with server-retained citations. `node scripts/model-evidence.mjs` saves actual responses and exercises both disabled and unreachable model fallbacks without disturbing the running inference service.
