"""Renders the playground's demo voice with Kokoro-82M (Apache-2.0, https://huggingface.co/hexgrad/Kokoro-82M).

Needs Python 3.10+, `pip install "kokoro>=0.9.4" soundfile` and ffmpeg. Run `pnpm --filter @saystack/playground clips`,
which writes scripts/chunks.json with the library's own chunking first. Writes public/clips/*.m4a and src/clips.json.
"""

import hashlib
import json
import subprocess
import tempfile
from pathlib import Path

import kokoro.pipeline
import numpy as np
import soundfile as sf
from kokoro import KPipeline

ROOT = Path(__file__).resolve().parent.parent
CLIPS = ROOT / "public" / "clips"
RATE = 24000
REPLY_VOICE = "af_heart"
DICTATION_VOICE = "am_michael"

# The demo texts are plain English that Kokoro's lexicon covers, so it needs no espeak fallback, whose bundled
# loader fails to find its data on some platforms.
kokoro.pipeline.espeak.EspeakFallback = lambda british=False: None
pipeline = KPipeline(lang_code="a", repo_id="hexgrad/Kokoro-82M")


def render(text: str, voice: str) -> tuple[np.ndarray, list[dict]]:
    parts: list[np.ndarray] = []
    marks: list[dict] = []
    offset = 0.0
    cursor = 0

    for result in pipeline(text, voice=voice):
        audio = np.asarray(result.audio, dtype=np.float32)

        for token in result.tokens or []:
            index = text.find(token.text, cursor)

            if index < 0 or token.start_ts is None:
                continue

            cursor = index + len(token.text)

            if any(char.isalnum() for char in token.text):
                marks.append({"charIndex": index, "time": round(offset + token.start_ts, 3)})

        parts.append(audio)
        offset += len(audio) / RATE

    return np.concatenate(parts), marks


def clip(text: str, voice: str) -> dict:
    name = hashlib.sha1(f"{voice}\n{text}".encode()).hexdigest()[:12] + ".m4a"
    audio, marks = render(text, voice)

    with tempfile.NamedTemporaryFile(suffix=".wav") as wav:
        sf.write(wav.name, audio, RATE)
        subprocess.run(
            ["ffmpeg", "-y", "-loglevel", "error", "-i", wav.name, "-c:a", "aac", "-b:a", "64k", str(CLIPS / name)],
            check=True,
        )

    return {"text": text, "file": name, "duration": round(len(audio) / RATE, 3), "marks": marks}


def main() -> None:
    chunks = json.loads((ROOT / "scripts" / "chunks.json").read_text())
    CLIPS.mkdir(parents=True, exist_ok=True)

    manifest = {
        "voice": "Kokoro-82M (Apache-2.0)",
        "replies": [clip(text, REPLY_VOICE) for text in chunks["replies"]],
        "dictation": clip(chunks["dictation"], DICTATION_VOICE),
    }
    used = {entry["file"] for entry in manifest["replies"]} | {manifest["dictation"]["file"]}

    for stale in CLIPS.glob("*.m4a"):
        if stale.name not in used:
            stale.unlink()

    (ROOT / "src" / "clips.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n")
    print(f"{len(used)} clips in {CLIPS}")


if __name__ == "__main__":
    main()
