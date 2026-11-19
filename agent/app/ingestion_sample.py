import json
import sys
from pathlib import Path
from .engine import Bank

if __name__=="__main__":
    bank=Bank()
    payload={"input_records":len(bank.questions),"indexed_chunks":len(bank.documents),"source":bank.sources["30-seconds"],"sample_question":bank.by_id["closures"].model_dump(),"sample_chunk":{"text":next(d.page_content for d in bank.documents if d.metadata["question_id"]=="closures"),"metadata":next(d.metadata for d in bank.documents if d.metadata["question_id"]=="closures")}}
    output=json.dumps(payload,indent=2,ensure_ascii=False)+"\n"
    if "--save" in sys.argv:
        target=Path(__file__).resolve().parents[2]/"docs"/"evidence"/"ingestion-sample.json"
        target.parent.mkdir(parents=True,exist_ok=True);target.write_text(output,encoding="utf-8")
        print(f"Saved ingestion sample: {len(bank.questions)} Q&A records, {len(bank.documents)} indexed chunks.")
    else:
        print(output)
