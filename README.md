# ⬡ Portal — Local AI Chat Interface

> A fully offline, ChatGPT-style web UI for your locally installed Ollama LLMs.  
> No cloud. No API keys. No telemetry. No subscriptions. Everything runs on your own machine.

![License](https://img.shields.io/badge/license-MIT-green) ![Offline](https://img.shields.io/badge/internet-not%20required-brightgreen) ![Ollama](https://img.shields.io/badge/powered%20by-Ollama-black) ![Python](https://img.shields.io/badge/python-3.8+-blue) ![Platform](https://img.shields.io/badge/platform-Linux-orange)

---

## What is Portal?

Portal is a lightweight, browser-based chat interface that puts a polished front-end on top of [Ollama](https://ollama.com) — the tool that lets you run large language models locally on your own hardware.

Most people who run local LLMs interact with them through a terminal, which isn't ideal for long conversations, multi-turn reasoning, or sharing with less technical users. Portal solves that by giving you a clean, modern chat UI — the kind you'd expect from a paid cloud service — except everything stays on your machine. Your conversations, your hardware, your data. Full stop.

There is no account to create. No API key to manage. No usage limit. No monthly bill. No company logging what you ask. Once it's running, it works entirely offline — pull the ethernet cable and it still works fine.

---

## Why Portal?

There are other local AI frontends out there. Portal was built with a few specific priorities:

- **Zero internet dependency** — not even fonts are fetched from a CDN. Every byte served comes from your own machine.
- **No Electron, no Docker, no containers** — just a Python script, three web files, and a shell launcher. Nothing heavy to install.
- **Streaming first** — responses stream token by token the moment the model starts generating, just like ChatGPT. You don't sit staring at a blank screen waiting for the full response.
- **Respects your existing setup** — Portal never downloads models. It reads whatever you already have installed via Ollama and puts them in a dropdown. You stay in control of what's on your disk.
- **One command to launch** — `./portal.sh` handles everything: checks dependencies, starts the server, opens the browser, and shuts down cleanly on Ctrl+C.

---

## ✨ Features

### Chat Experience
- **Real-time token streaming** — text appears word by word as the model generates it, via Server-Sent Events
- **Stop generation** — cancel a running response instantly with the stop button or by pressing `Esc`
- **Full markdown rendering** — the assistant's responses support bold, italic, headers, bullet and numbered lists, blockquotes, inline code, and fenced code blocks with syntax highlighting
- **Copy code button** — every code block has a one-click copy button so you can grab snippets without selecting text
- **Date dividers** — long conversations are broken up by date so you can orient yourself quickly

### Model Management
- **Auto model detection** — on startup Portal queries your local Ollama instance and populates the model dropdown with everything you have installed. No configuration needed.
- **Switch models mid-session** — change the model from the dropdown at any time without restarting anything
- **Never downloads** — Portal will refuse to send a request for a model that isn't already installed locally. You won't accidentally trigger an Ollama pull.

### Sessions & History
- **Multi-session** — create as many separate conversations as you want, each with its own independent history
- **Persistent history** — all sessions are saved in your browser's localStorage and survive page refreshes and server restarts
- **Clear conversation** — wipe the current chat with one click when you want a fresh start

### Interface
- **Sidebar toggle** — collapse the sidebar for a distraction-free full-width chat view
- **Ollama health indicator** — a live status dot in the sidebar shows whether Ollama is reachable, and re-checks every 30 seconds
- **Responsive layout** — works on narrow browser windows and small screens
- **Dark theme** — easy on the eyes for long sessions, especially at night

### Privacy & Security
- **No telemetry** — zero analytics, zero tracking, zero beacons
- **No external requests** — the UI makes no network calls outside your own machine. Not even font files are fetched remotely.
- **No accounts** — nothing to sign up for, nothing to authenticate against
- **Air-gap friendly** — works on machines with no internet connection at all

### Keyboard Shortcuts
| Shortcut | Action |
|---|---|
| `Enter` | Send message |
| `Shift + Enter` | Insert newline |
| `Esc` | Stop generation |
| `Ctrl + Shift + N` | New conversation |

---

## 🖥️ Requirements

- **OS:** Linux (developed and tested on Fedora; works on Ubuntu, Debian, Arch, and others)
- **Ollama:** installed and running with at least one model pulled — [ollama.com](https://ollama.com)
- **Python:** 3.8 or newer
- **Python packages:** `flask`, `flask-cors`, `requests` (the launcher installs these automatically if missing)
- **Browser:** any modern browser (Firefox, Chrome, Chromium, etc.)

---

## 🚀 Setup & Installation

### Step 1 — Install Ollama

```bash
curl -fsSL https://ollama.com/install.sh | sh
```

On Fedora, the installer sets up a systemd service automatically. You can check it with:

```bash
systemctl status ollama
```

### Step 2 — Pull a model

Portal works with any model Ollama supports. A few good starting points:

```bash
ollama pull llama3      # Meta's Llama 3 — best general-purpose (~4GB)
ollama pull mistral     # Mistral 7B — fast and capable (~4GB)
ollama pull phi3        # Microsoft Phi-3 — lightweight, good on CPU (~2GB)
ollama pull gemma2      # Google Gemma 2 — well-rounded (~5GB)
ollama pull codellama   # Meta's code-focused model (~4GB)
```

You can pull as many as you like and switch between them in the Portal UI.

### Step 3 — Launch Portal

```bash
unzip portal.zip
cd portal
chmod +x portal.sh
./portal.sh
```

That's it. The launcher will:
1. Check that Python 3 is available
2. Install any missing pip packages automatically
3. Verify Ollama is reachable
4. Start the Flask server on port 5001
5. Open your browser to `http://localhost:5001`

### Every launch after that

```bash
cd portal
./portal.sh
```

---

## ⚙️ Configuration

Portal works out of the box with no configuration. If you need to change defaults, use environment variables:

```bash
# Run on a different port
PORT=8080 ./portal.sh

# Point to a remote Ollama instance on your network
OLLAMA_URL=http://192.168.1.50:11434 ./portal.sh

# Launch without auto-opening the browser
BROWSER_OPEN=false ./portal.sh

# Combine options
PORT=8080 BROWSER_OPEN=false ./portal.sh
```

---

## 📁 Project Structure

```
portal/
├── portal.sh        # Bash launcher — the only file you need to run
├── server.py        # Python/Flask backend
│                    #   • Serves the web UI as static files
│                    #   • /api/models       — lists locally installed models
│                    #   • /api/chat         — proxies requests to Ollama
│                    #   • /api/chat/stream  — streaming responses via SSE
│                    #   • /api/health       — Ollama connectivity check
└── web/
    ├── index.html   # UI shell and layout
    ├── style.css    # Dark theme, system fonts, fully offline
    └── script.js    # Chat logic, session manager, markdown renderer,
                     # SSE streaming client
```

---

## 🔧 Troubleshooting

**"Cannot connect to Ollama"**

Ollama isn't running. Start it with:
```bash
ollama serve
# or if installed as a service:
systemctl start ollama
```

**"No models found" in the dropdown**

You haven't pulled any models yet:
```bash
ollama pull llama3
```

**"Permission denied" on first run**

The script isn't marked as executable yet:
```bash
chmod +x portal.sh && ./portal.sh
```

**Port already in use**

Something else is on port 5001. Either free the port or use a different one:
```bash
fuser -k 5001/tcp && ./portal.sh
# or
PORT=8080 ./portal.sh
```

**Firewall blocking access from another device on your network**

```bash
sudo firewall-cmd --add-port=5001/tcp --permanent
sudo firewall-cmd --reload
```

---

## 📄 License

MIT — free to use, modify, and share for any purpose.
