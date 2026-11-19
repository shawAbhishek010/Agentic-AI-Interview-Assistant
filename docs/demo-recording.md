# Reproducible five-minute recording

`scripts/record-demo.mjs` records real browser actions against the running application. It covers all six screens, exactly five questions and their actual REST response, five saved answers, source-backed references, account-specific analytics, a missing-source fallback, and a genuine local SLM test.

The final recorder requires `GET /api/model/status` to report `ready`. It refuses to publish a final recording if the model test does not return actual `local_slm` output, the browser fails, or actions overrun the planned five-minute timeline.

Prerequisites are the project frontend dependencies and Chromium installed by Playwright, a healthy local or Docker application, `uv`, and Windows SAPI voices. The script uses an isolated pinned `imageio-ffmpeg` utility for assembly; it does not add dependencies to the application services. Audio narration uses an installed offline Windows voice. No paid speech or avatar service is called.

```powershell
# From the repository root, with the app and model running:
node scripts/record-demo.mjs --dry-run
node scripts/record-demo.mjs
```

Set `DEMO_BASE_URL` if using a different application port, or `DEMO_FFMPEG` to select an already installed full FFmpeg executable. A dry run checks automation and stores only temporary `.runtime/demo` artifacts; it does not publish a completion demonstration.

Final outputs are `docs/demo-output/Placement-AI-five-minute-demo.mp4`, a transcript, chapter subtitles and an execution manifest. The MP4 is verified to contain 300 seconds of H.264 video and AAC narration. The manifest retains actual question IDs, answer counts and model output without authentication tokens.

The recorder explicitly identifies source-derived sample answers and heuristic feedback. It shows microphone consent and chooses the typed path. This artifact is an automated application demonstration with synthetic narration, not a human classroom presentation or a test of physical microphone quality. Presentation-device voice behavior should still be checked before presenting.
