#!/usr/bin/env python3
"""
Portal Server — Local Ollama LLM Backend
Serves the web UI and proxies chat requests to Ollama.
NEVER downloads models — only uses what you already have locally.
"""

import os
import requests
from flask import Flask, request, jsonify, send_from_directory, Response, stream_with_context
from flask_cors import CORS
import json

# ── Config ────────────────────────────────────────────────────────────────────
OLLAMA_BASE_URL = os.environ.get("OLLAMA_URL", "http://localhost:11434")
PORT            = int(os.environ.get("PORT", 5001))
WEB_DIR         = os.path.join(os.path.dirname(os.path.abspath(__file__)), "web")

app = Flask(__name__, static_folder=WEB_DIR)
CORS(app)

# ── Helpers ───────────────────────────────────────────────────────────────────

def ollama_list_models():
    """Return list of locally installed Ollama models (never pulls anything)."""
    try:
        resp = requests.get(f"{OLLAMA_BASE_URL}/api/tags", timeout=5)
        resp.raise_for_status()
        data = resp.json()
        models = [m["name"] for m in data.get("models", [])]
        return models
    except Exception:
        return []


def ollama_chat_stream(model: str, messages: list):
    """Stream a chat response from Ollama, yielding SSE chunks."""
    payload = {
        "model": model,
        "messages": messages,
        "stream": True,
    }
    with requests.post(
        f"{OLLAMA_BASE_URL}/api/chat",
        json=payload,
        stream=True,
        timeout=180,
    ) as resp:
        resp.raise_for_status()
        for line in resp.iter_lines():
            if line:
                try:
                    chunk = json.loads(line)
                    token = chunk.get("message", {}).get("content", "")
                    done  = chunk.get("done", False)
                    yield f"data: {json.dumps({'token': token, 'done': done})}\n\n"
                    if done:
                        break
                except Exception:
                    continue


# ── Routes ────────────────────────────────────────────────────────────────────

@app.route("/")
def index():
    return send_from_directory(WEB_DIR, "index.html")


@app.route("/<path:filename>")
def static_files(filename):
    return send_from_directory(WEB_DIR, filename)


@app.route("/api/models", methods=["GET"])
def get_models():
    """List only locally installed Ollama models. Never triggers a pull."""
    models = ollama_list_models()
    # Pick first available as default — no hardcoded name
    default = models[0] if models else ""
    return jsonify({"models": models, "default": default})


@app.route("/api/chat", methods=["POST"])
def chat():
    """
    Non-streaming chat endpoint.
    Body: { "model": "<local model name>", "messages": [...] }
    Returns: { "reply": "..." }
    The model MUST already be installed locally — we never pull.
    """
    body     = request.get_json(force=True, silent=True) or {}
    messages = body.get("messages", [])
    model    = body.get("model", "").strip()

    if not messages:
        return jsonify({"error": "No messages provided"}), 400
    if not model:
        return jsonify({"error": "No model specified. Select one from the dropdown."}), 400

    # Verify model is actually installed locally before sending
    local_models = ollama_list_models()
    if local_models and model not in local_models:
        return jsonify({
            "error": f"Model '{model}' is not installed locally. "
                     f"Available: {', '.join(local_models)}"
        }), 400

    try:
        payload = {"model": model, "messages": messages, "stream": False}
        resp = requests.post(
            f"{OLLAMA_BASE_URL}/api/chat",
            json=payload,
            timeout=180,
        )
        resp.raise_for_status()
        data  = resp.json()
        reply = data["message"]["content"]
        return jsonify({"reply": reply})

    except requests.exceptions.ConnectionError:
        return jsonify({
            "error": "Cannot connect to Ollama. Run: ollama serve"
        }), 503
    except requests.exceptions.Timeout:
        return jsonify({"error": "Ollama timed out (>180s). Try a lighter model."}), 504
    except requests.exceptions.HTTPError as e:
        return jsonify({"error": f"Ollama error: {e.response.text}"}), 502
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/chat/stream", methods=["POST"])
def chat_stream():
    """
    Streaming chat endpoint using Server-Sent Events.
    Body: { "model": "<local model name>", "messages": [...] }
    """
    body     = request.get_json(force=True, silent=True) or {}
    messages = body.get("messages", [])
    model    = body.get("model", "").strip()

    if not messages or not model:
        return jsonify({"error": "model and messages required"}), 400

    local_models = ollama_list_models()
    if local_models and model not in local_models:
        return jsonify({"error": f"Model '{model}' not installed locally."}), 400

    def generate():
        try:
            yield from ollama_chat_stream(model, messages)
        except requests.exceptions.ConnectionError:
            yield f"data: {json.dumps({'error': 'Cannot connect to Ollama. Run: ollama serve'})}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'error': str(e)})}\n\n"

    return Response(
        stream_with_context(generate()),
        mimetype="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        }
    )


@app.route("/api/health", methods=["GET"])
def health():
    """Check Ollama connectivity and return installed model count."""
    try:
        r = requests.get(f"{OLLAMA_BASE_URL}/api/tags", timeout=3)
        r.raise_for_status()
        models = [m["name"] for m in r.json().get("models", [])]
        return jsonify({
            "status": "ok",
            "ollama": "connected",
            "models_installed": len(models),
        })
    except Exception as e:
        return jsonify({
            "status": "degraded",
            "ollama": "unreachable",
            "detail": str(e)
        }), 503


# ── Entry point ───────────────────────────────────────────────────────────────
if __name__ == "__main__":
    models = ollama_list_models()
    print(f"\n  🟢  Portal  →  http://localhost:{PORT}")
    print(f"  🔗  Ollama  →  {OLLAMA_BASE_URL}")
    if models:
        print(f"  📦  Models installed locally: {len(models)}")
        for m in models:
            print(f"       • {m}")
    else:
        print("  ⚠️   No local models found — run: ollama pull <modelname>")
    print()
    app.run(host="0.0.0.0", port=PORT, debug=False, threaded=True)
