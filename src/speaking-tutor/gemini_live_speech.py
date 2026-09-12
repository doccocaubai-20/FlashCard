import asyncio
import sys
import os
import io
import wave
import json

# Ensure IPv4 on Windows to prevent DNS lag
import socket
orig_getaddrinfo = socket.getaddrinfo
def getaddrinfo_ipv4(host, port, family=0, type=0, proto=0, flags=0):
    return orig_getaddrinfo(host, port, socket.AF_INET, type, proto, flags)
socket.getaddrinfo = getaddrinfo_ipv4

from google import genai

async def generate_speech(text: str, output_path: str, api_key: str, model: str = "gemini-3.1-flash-live-preview"):
    client = genai.Client(api_key=api_key)
    config = {
        "response_modalities": ["AUDIO"],
        "system_instruction": (
            "Bạn là Gia sư Tiếng Trung chuyên nghiệp ChongZi AI. "
            "Hãy phát âm câu này với giọng Bắc Kinh chuẩn, tự nhiên, rõ ràng, tốc độ vừa phải cho người học."
        )
    }

    try:
        async with client.aio.live.connect(model=model, config=config) as session:
            await session.send(input=text, end_of_turn=True)
            pcm_chunks = []
            async for response in session.receive():
                sc = response.server_content
                if sc and sc.model_turn:
                    for p in sc.model_turn.parts:
                        if p.inline_data:
                            pcm_chunks.append(p.inline_data.data)
                if sc and sc.turn_complete:
                    break

            if not pcm_chunks:
                sys.stderr.write("No audio received from Gemini Live\n")
                sys.exit(1)

            pcm_data = b"".join(pcm_chunks)
            os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
            with wave.open(output_path, "wb") as wav_file:
                wav_file.setnchannels(1)
                wav_file.setsampwidth(2)
                wav_file.setframerate(24000)
                wav_file.writeframes(pcm_data)

            print(json.dumps({"success": True, "output": output_path, "bytes": len(pcm_data)}))
    except Exception as e:
        sys.stderr.write(f"Gemini Live error: {str(e)}\n")
        sys.exit(1)

if __name__ == "__main__":
    if len(sys.argv) < 3:
        sys.stderr.write("Usage: python gemini_live_speech.py <text> <output_wav_path> [api_key] [model]\n")
        sys.exit(1)

    input_text = sys.argv[1]
    out_path = sys.argv[2]
    key = sys.argv[3] if len(sys.argv) > 3 else os.environ.get("GEMINI_API_KEY", "")
    mdl = sys.argv[4] if len(sys.argv) > 4 else os.environ.get("GEMINI_AUDIO_MODEL", "gemini-3.1-flash-live-preview")

    if not key:
        sys.stderr.write("GEMINI_API_KEY is required\n")
        sys.exit(1)

    asyncio.run(generate_speech(input_text, out_path, key, mdl))
