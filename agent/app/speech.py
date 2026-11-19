"""Optional offline Piper speech; input/audio are never logged or persisted."""
import importlib.util
import io
import os
from pathlib import Path
import threading
import wave

from fastapi import APIRouter,HTTPException,Response
from pydantic import Field
from .models import StrictModel

router=APIRouter(prefix="/internal/voice",tags=["Local speech"])
_lock=threading.Lock()
_voice=None
_voice_path=None


class SpeechRequest(StrictModel):
    text:str=Field(min_length=1,max_length=2000)


def model_path():
    return Path(os.getenv("PIPER_MODEL_PATH",str(Path(__file__).resolve().parents[2]/".models"/"piper"/"en_US-mike-medium.onnx")))


@router.get("/status")
def status():
    path=model_path()
    return {"provider":"piper","available":path.is_file() and Path(str(path)+".json").is_file() and importlib.util.find_spec("piper") is not None,"voice":"en_US-mike-medium","local":True}


@router.post("/speech")
def speak(payload:SpeechRequest):
    global _voice,_voice_path
    if not status()["available"]:
        raise HTTPException(503,"Local Piper voice is not prepared. Browser speech and typed replies remain available.")
    if not _lock.acquire(blocking=False):
        raise HTTPException(503,"Local voice is busy. Retry playback in a moment.")
    try:
        from piper import PiperVoice
        path=model_path()
        if _voice is None or _voice_path!=path:
            _voice=PiperVoice.load(path,use_cuda=False)
            _voice_path=path
        output=io.BytesIO()
        with wave.open(output,"wb") as audio:
            _voice.synthesize_wav(payload.text,audio)
        data=output.getvalue()
        if len(data)<44 or len(data)>20_000_000:
            raise RuntimeError("Invalid synthesized audio")
        return Response(data,media_type="audio/wav",headers={"Cache-Control":"no-store"})
    except Exception as exc:
        raise HTTPException(503,"Local voice could not synthesize this reply. The text reply remains available.") from exc
    finally:
        _lock.release()
