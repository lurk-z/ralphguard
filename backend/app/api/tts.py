"""
Neural text-to-speech endpoint (Edge TTS — free, no API key).

Returns MP3 audio for the given Thai text using Microsoft's online neural voices,
which sound far more human than the browser's built-in speechSynthesis.
"""
from fastapi import APIRouter, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel

router = APIRouter()

DEFAULT_VOICE = "th-TH-PremwadeeNeural"  # natural Thai female voice


class TTSIn(BaseModel):
    text: str
    voice: str | None = None


@router.post("/")
async def tts(body: TTSIn):
    text = (body.text or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="empty text")

    try:
        import edge_tts  # lazy import so a missing package doesn't crash the whole API
    except Exception:
        raise HTTPException(status_code=503, detail="edge-tts not installed (rebuild backend)")

    voice = body.voice or DEFAULT_VOICE
    audio = bytearray()
    try:
        communicate = edge_tts.Communicate(text, voice)
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                audio.extend(chunk["data"])
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"TTS failed: {e}")

    if not audio:
        raise HTTPException(status_code=502, detail="TTS produced no audio")
    return Response(content=bytes(audio), media_type="audio/mpeg")
