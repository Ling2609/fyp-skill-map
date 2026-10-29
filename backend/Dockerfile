# SkillMap API (28 Oct, TC-67). Built by docker-compose.yml; data/ is NOT in the image, it is mounted from your computer
# (the relationship model folder alone is gigabytes).
FROM python:3.13-slim

ENV PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1 PIP_DISABLE_PIP_VERSION_CHECK=1 HF_HOME=/opt/hf
WORKDIR /app

# CPU-only PyTorch: requirements.txt pins torch==2.14.0, and the Linux build on PyPI would also pull the GPU libraries
ARG TORCH_INDEX=https://download.pytorch.org/whl/cpu
COPY requirements.txt .
RUN if [ -n "$TORCH_INDEX" ]; then pip install --extra-index-url "$TORCH_INDEX" -r requirements.txt; else pip install -r requirements.txt; fi

# The SBERT model is downloaded once here, so the running container never needs the internet for it
RUN python -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('all-MiniLM-L6-v2')"
ENV HF_HUB_OFFLINE=1

COPY app ./app
COPY scripts ./scripts
COPY migrations ./migrations

EXPOSE 8000
# One process, as in the README; keep-alive 15 s (uvicorn's default is 5 s, which dropped idle connections in the
# load test, docs/evidence/performance/load_runs)
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--timeout-keep-alive", "15"]
