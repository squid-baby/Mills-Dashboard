#!/usr/bin/env python3
"""
transcribe.py — WhisperX transcription with optional speaker diarization.

Args:
  <audio.wav>  Path to audio file

Stdout: SPEAKER_XX: <text>  (one line per speaker segment)
Stderr: progress messages (so stdout stays clean for the Node pipeline)

Env vars (passed through from process-meeting.mjs):
  WHISPER_MODEL   Model size: tiny, base, small, medium, large-v2 (default: base)
  HF_TOKEN        HuggingFace token for speaker diarization (optional)
                  Without this, all output is labeled SPEAKER_00.
"""

import sys
import os


def main():
    if len(sys.argv) < 2:
        print("Usage: transcribe.py <audio.wav>", file=sys.stderr)
        sys.exit(1)

    # Ensure ffmpeg (installed via Homebrew) is findable by whisperx subprocesses
    os.environ['PATH'] = '/opt/homebrew/bin:' + os.environ.get('PATH', '')

    audio_path = sys.argv[1]
    model_name = os.environ.get("WHISPER_MODEL", "base")
    hf_token   = os.environ.get("HF_TOKEN", "")

    try:
        import whisperx
        import torch
    except ImportError:
        print("Error: whisperx not installed. Run: pip3 install whisperx", file=sys.stderr)
        sys.exit(1)

    # PyTorch 2.6+ changed torch.load default to weights_only=True, which breaks
    # pyannote/lightning checkpoints that use omegaconf globals. Patch to restore
    # the legacy behavior for checkpoint loading only.
    _orig_torch_load = torch.load
    def _patched_torch_load(f, *args, **kwargs):
        kwargs['weights_only'] = False  # force: lightning_fabric passes None which PyTorch 2.6+ treats as True
        return _orig_torch_load(f, *args, **kwargs)
    torch.load = _patched_torch_load

    device  = "cuda" if torch.cuda.is_available() else "cpu"
    compute = "float16" if device == "cuda" else "int8"

    print(f"[transcribe] Loading model '{model_name}' on {device}...", file=sys.stderr)
    model = whisperx.load_model(model_name, device, compute_type=compute)

    print(f"[transcribe] Loading audio: {audio_path}", file=sys.stderr)
    audio = whisperx.load_audio(audio_path)

    print("[transcribe] Transcribing...", file=sys.stderr)
    result = model.transcribe(audio, batch_size=16)

    # Align timestamps for accurate diarization assignment
    print("[transcribe] Aligning...", file=sys.stderr)
    try:
        align_model, align_metadata = whisperx.load_align_model(
            language_code=result["language"], device=device
        )
        result = whisperx.align(
            result["segments"], align_model, align_metadata, audio, device,
            return_char_alignments=False
        )
    except Exception as e:
        print(f"[transcribe] Alignment warning (continuing without): {e}", file=sys.stderr)

    segments = result.get("segments", [])

    # ── Speaker diarization (optional — requires HF_TOKEN) ───────────────────
    if hf_token:
        print("[transcribe] Diarizing speakers...", file=sys.stderr)
        try:
            diarize_pipeline = whisperx.diarize.DiarizationPipeline(
                use_auth_token=hf_token, device=device
            )
            diarize_segments = diarize_pipeline(audio)
            result   = whisperx.assign_word_speakers(diarize_segments, result)
            segments = result.get("segments", [])
            print("[transcribe] Diarization complete.", file=sys.stderr)
        except Exception as e:
            print(f"[transcribe] Diarization failed (all labeled SPEAKER_00): {e}", file=sys.stderr)
    else:
        print("[transcribe] No HF_TOKEN — skipping diarization, all output as SPEAKER_00.", file=sys.stderr)

    # ── Emit clean transcript to stdout ──────────────────────────────────────
    for seg in segments:
        text = seg.get("text", "").strip()
        if text:
            speaker = seg.get("speaker", "SPEAKER_00")
            print(f"{speaker}: {text}")

    print("[transcribe] Done.", file=sys.stderr)


if __name__ == "__main__":
    main()
