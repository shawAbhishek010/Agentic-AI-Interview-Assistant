FROM ghcr.io/astral-sh/uv:0.12.3 AS uv
FROM python:3.12-slim
COPY --from=uv /uv /usr/local/bin/uv
WORKDIR /app/agent
COPY agent/pyproject.toml agent/uv.lock ./
ARG INSTALL_SEMANTIC=false
RUN if [ "$INSTALL_SEMANTIC" = "true" ]; then uv sync --frozen --no-dev --extra voice --extra semantic; else uv sync --frozen --no-dev --extra voice; fi
COPY agent/app ./app
COPY data /app/data
RUN useradd --create-home --uid 10001 placement && mkdir -p /app/agent/.data && chown -R placement:placement /app
USER placement
ENV PYTHONUNBUFFERED=1 LANGSMITH_TRACING=false LANGCHAIN_TRACING_V2=false HF_HUB_DISABLE_TELEMETRY=1
EXPOSE 8001
CMD ["/app/agent/.venv/bin/uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8001"]
