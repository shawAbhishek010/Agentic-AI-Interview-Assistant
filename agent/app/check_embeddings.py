"""Execute a small semantic retrieval benchmark against real local embeddings."""
import json
import os
from pathlib import Path
import time

os.environ["RETRIEVAL_BACKEND"]="semantic"
os.environ["HF_HUB_DISABLE_TELEMETRY"]="1"
from .engine import Bank

if __name__=="__main__":
    started=time.perf_counter();bank=Bank()
    cases=[("What are closures in JavaScript?","closures"),("What are React keys?","keys"),("Explain the Node.js event loop","node-event-loop"),("What is CSS specificity?","css-specificity"),("Explain the CSS box model","css-box-model"),("What is ARIA accessibility?","accessibility-aria"),("What is prototypal inheritance?","prototypal-inheritance"),("What is event delegation?","event-delegation"),("What are JavaScript promises?","promises"),("What are pure functions?","pure-functions")]
    results=[]
    for query,expected in cases:
        ids=[q.id for q in bank.query(query).questions]
        results.append({"query":query,"expected":expected,"retrieved":ids,"passed":expected in ids})
    fallback=bank.query("Explain photosynthesis chloroplasts in orchids")
    result={"backend":bank.backend,"model":"sentence-transformers/all-MiniLM-L6-v2","dimensions":384,"indexed_chunks":len(bank.documents),"cases":results,"passed":sum(r["passed"] for r in results),"total":len(results),"missing_source_passed":not fallback.questions,"elapsed_seconds":round(time.perf_counter()-started,2),"chat_inference":False}
    target=Path(__file__).resolve().parents[2]/"docs"/"evidence"/"semantic-retrieval.json"
    target.parent.mkdir(parents=True,exist_ok=True);target.write_text(json.dumps(result,indent=2)+"\n",encoding="utf-8")
    print(json.dumps(result,indent=2))
    if result["passed"]<8 or not result["missing_source_passed"]:
        raise SystemExit(1)
