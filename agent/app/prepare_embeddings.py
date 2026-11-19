"""Explicitly download the free embedding weights; no chat/model API is called."""
import os
from pathlib import Path

os.environ["HF_HUB_DISABLE_TELEMETRY"]="1"
os.environ["LANGSMITH_TRACING"]="false"

def main():
    from sentence_transformers import SentenceTransformer
    storage=Path(os.getenv("AGENT_DATA_DIR",str(Path(__file__).resolve().parents[1]/".data")))
    cache=os.getenv("EMBEDDING_CACHE_DIR",str(storage/".models"))
    model=SentenceTransformer("sentence-transformers/all-MiniLM-L6-v2",cache_folder=cache)
    vector=model.encode(["A source-grounded interview question."])
    print(f"Embedding weights ready locally; dimensions={vector.shape[1]}. No chat inference or paid API used.")

if __name__=="__main__":
    main()
