# 🌐 Portal — Local LLM Web Interface

A modern, browser-based ChatGPT-style interface powered entirely by a local Ollama LLM.
No cloud. No API keys. No telemetry.

---

## 📁 Project Structure

```
portal/
├── portal.sh          # Bash launcher — run this to start everything
├── server.py          # Python/Flask backend (LLM proxy + static file server)
├── web/
│   ├── index.html     # Chat UI shell
│   ├── style.css      # Dark terminal aesthetic, phosphor-green
│   └── script.js      # Chat logic, session management, markdown renderer
└── README.md
```

---

## 🐧 Setup on Linux / Fedora

### 1. Install Ollama

```bash
curl -fsSL https://ollama.com/install.sh | sh
```

Or on Fedora via the official installer:
```bash
# The install script works on Fedora (uses systemd automatically)
curl -fsSL https://ollama.com/install.sh | sh
```

### 2. Pull a model

```bash
ollama pull llama3          # ~4GB — best general-purpose model
# or lighter options:
ollama pull mistral         # ~4GB
ollama pull phi3            # ~2GB — fast on CPU
ollama pull gemma2          # ~5GB
```

### 3. Start Ollama (if not already running as a service)

```bash
ollama serve
```

> On Fedora, Ollama may auto-start as a systemd service after install.
> Check: `systemctl status ollama`

### 4. Install Python dependencies

```bash
pip install flask flask-cors requests
# or with user flag if needed:
pip install --user flask flask-cors requests
```

### 5. Launch Portal

```bash
chmod +x portal.sh
./portal.sh
```

The browser opens automatically at **http://localhost:5001**.

---

## ⚙️ Environment Variables

You can override defaults before running:

```bash
PORT=8080 OLLAMA_MODEL=mistral ./portal.sh

# Full example:
export PORT=5001
export OLLAMA_MODEL=llama3
export OLLAMA_URL=http://localhost:11434
export BROWSER_OPEN=true    # set to 'false' to skip auto-opening browser
./portal.sh
```

---

## 🎯 Features

| Feature | Details |
|---|---|
| **Multi-session** | Create and switch between conversations; sessions auto-saved in localStorage |
| **Model selector** | Dropdown auto-populates with all locally installed Ollama models |
| **Markdown rendering** | Bold, italic, code blocks, inline code, headers, lists, links |
| **Health indicator** | Live Ollama connection status in sidebar (checks every 30s) |
| **Auto-scaling input** | Textarea grows with content, max 200px |
| **Keyboard shortcuts** | `Enter` to send · `Shift+Enter` for newline |
| **Responsive** | Works on narrow screens, sidebar collapses |
| **Zero external deps** | All fonts loaded from Google Fonts CDN; everything else is local |

---

## 🔧 Troubleshooting

**"Cannot connect to Ollama"**
```bash
# Start Ollama manually:
ollama serve

# Or check systemd service:
systemctl start ollama
systemctl status ollama
```

**"No models found" in dropdown**
```bash
# Pull a model first:
ollama pull llama3
```

**Port already in use**
```bash
# The launcher auto-kills the old process, but you can do it manually:
fuser -k 5001/tcp
# Or use a different port:
PORT=8080 ./portal.sh
```

**Python packages not found**
```bash
# Fedora: use --user flag or a virtualenv
python3 -m venv venv
source venv/bin/activate
pip install flask flask-cors requests
./portal.sh
```

**Firewall (Fedora/SELinux)**
```bash
# If accessing from another machine on the network:
sudo firewall-cmd --add-port=5001/tcp --permanent
sudo firewall-cmd --reload
```

---

## 🚀 Running as a background service (optional)

```bash
# Start in background, log to file:
nohup ./portal.sh > portal.log 2>&1 &
echo "Portal PID: $!"

# Stop it:
kill $(lsof -ti tcp:5001)
```

---

## License

MIT — use freely, modify as needed.
