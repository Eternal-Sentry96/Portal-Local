/* ══════════════════════════════════════════════════════════════
   Portal — Frontend
   • Streaming responses via SSE
   • Only uses locally installed Ollama models (never pulls)
   • Multi-session with localStorage persistence
   • Markdown rendering with syntax-highlighted code blocks
   ══════════════════════════════════════════════════════════════ */

'use strict';

// ── DOM ─────────────────────────────────────────────────────────────────────
const qs = s => document.querySelector(s);
const feedEl        = qs('#feed');
const inputEl       = qs('#input');
const btnSend       = qs('#btn-send');
const btnNew        = qs('#btn-new');
const btnClear      = qs('#btn-clear');
const btnSidebar    = qs('#btn-sidebar');
const modelSelect   = qs('#model-select');
const modelDot      = qs('#model-dot');
const chatListEl    = qs('#chat-list');
const statusBadge   = qs('#status-badge');
const statusTxt     = qs('#status-txt');
const activeModelLbl= qs('#active-model-label');
const charCountEl   = qs('#char-count');
const sidebar       = qs('#sidebar');

// ── State ───────────────────────────────────────────────────────────────────
const state = {
  sessions: [],
  activeId: null,
  model: '',
  streaming: false,
  abortCtrl: null,
};

// ── Storage helpers ─────────────────────────────────────────────────────────
const STORE_KEY = 'portal_v2';

function save() {
  try {
    const payload = {
      sessions: state.sessions.slice(0, 30).map(s => ({
        ...s,
        messages: s.messages.slice(-60), // keep last 60 msgs per session
      })),
      activeId: state.activeId,
      model: state.model,
    };
    localStorage.setItem(STORE_KEY, JSON.stringify(payload));
  } catch (_) {}
}

function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return;
    const d = JSON.parse(raw);
    state.sessions = d.sessions || [];
    state.activeId = d.activeId || null;
    state.model    = d.model    || '';
  } catch (_) {}
}

// ── Session helpers ─────────────────────────────────────────────────────────
function newSession() {
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const s  = { id, title: 'New chat', messages: [], createdAt: Date.now() };
  state.sessions.unshift(s);
  return s;
}

function activeSession() {
  return state.sessions.find(s => s.id === state.activeId) || null;
}

function setActive(id) {
  state.activeId = id;
  renderChatList();
  renderFeed();
}

// ── Model loading ────────────────────────────────────────────────────────────
async function loadModels() {
  try {
    const res  = await fetch('/api/models');
    const data = await res.json();

    modelSelect.innerHTML = '';

    if (!data.models || data.models.length === 0) {
      modelSelect.innerHTML = '<option value="">No local models found</option>';
      modelDot.className = 'model-status-dot warn';
      setStatus('warn', 'No models installed');
      return;
    }

    data.models.forEach(m => {
      const o = document.createElement('option');
      o.value = m; o.textContent = m;
      modelSelect.appendChild(o);
    });

    // Restore saved model or use first available
    const target = state.model && data.models.includes(state.model)
      ? state.model
      : data.models[0];

    modelSelect.value = state.model = target;
    modelDot.className = 'model-status-dot ok';
    updateModelLabel();

  } catch (e) {
    modelSelect.innerHTML = '<option value="">Server unreachable</option>';
    modelDot.className = 'model-status-dot err';
  }
}

function updateModelLabel() {
  activeModelLbl.textContent = state.model ? `⬡  ${state.model}` : '';
}

// ── Health check ─────────────────────────────────────────────────────────────
async function checkHealth() {
  try {
    const res  = await fetch('/api/health');
    const data = await res.json();
    if (data.ollama === 'connected') {
      setStatus('ok', `Ollama · ${data.models_installed} model${data.models_installed !== 1 ? 's' : ''}`);
      modelDot.className = state.model ? 'model-status-dot ok' : 'model-status-dot warn';
    } else {
      setStatus('err', 'Ollama unreachable');
      modelDot.className = 'model-status-dot err';
    }
  } catch {
    setStatus('err', 'Server error');
  }
}

function setStatus(type, text) {
  statusBadge.className = `s-badge s-badge--${type === 'ok' ? 'ok' : type === 'err' ? 'err' : 'wait'}`;
  statusTxt.textContent = text;
}

// ── Tiny Markdown renderer ──────────────────────────────────────────────────
function esc(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function renderMd(raw) {
  let s = raw;

  // Fenced code blocks — extract and protect
  const blocks = [];
  s = s.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) => {
    const i = blocks.length;
    blocks.push({ lang: lang || 'text', code: code.trim() });
    return `\x00CODE${i}\x00`;
  });

  // Inline code
  s = s.replace(/`([^`\n]+)`/g, (_, c) => `<code>${esc(c)}</code>`);

  // Blockquote
  s = s.replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>');

  // HR
  s = s.replace(/^---+$/gm, '<hr>');

  // Bold / italic
  s = s.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  s = s.replace(/\*\*(.+?)\*\*/g,     '<strong>$1</strong>');
  s = s.replace(/\*(.+?)\*/g,         '<em>$1</em>');
  s = s.replace(/__(.+?)__/g,         '<strong>$1</strong>');
  s = s.replace(/_([^_\n]+)_/g,       '<em>$1</em>');

  // Headings
  s = s.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  s = s.replace(/^## (.+)$/gm,  '<h2>$1</h2>');
  s = s.replace(/^# (.+)$/gm,   '<h1>$1</h1>');

  // Links
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');

  // Lists — unordered
  s = s.replace(/((?:^[ \t]*[-*+] .+\n?)+)/gm, match => {
    const items = match.trim().split('\n')
      .map(l => `<li>${l.replace(/^[ \t]*[-*+] /, '')}</li>`).join('');
    return `<ul>${items}</ul>`;
  });

  // Lists — ordered
  s = s.replace(/((?:^[ \t]*\d+\. .+\n?)+)/gm, match => {
    const items = match.trim().split('\n')
      .map(l => `<li>${l.replace(/^[ \t]*\d+\. /, '')}</li>`).join('');
    return `<ol>${items}</ol>`;
  });

  // Paragraphs
  const blockTagRe = /^<(h[1-6]|ul|ol|li|blockquote|hr|pre)/;
  s = s.split(/\n{2,}/).map(para => {
    para = para.trim();
    if (!para || blockTagRe.test(para) || para.startsWith('\x00CODE')) return para;
    return `<p>${para.replace(/\n/g, '<br>')}</p>`;
  }).join('\n');

  // Restore code blocks
  s = s.replace(/\x00CODE(\d+)\x00/g, (_, i) => {
    const { lang, code } = blocks[+i];
    return `<pre>
      <div class="code-header">
        <span>${esc(lang)}</span>
        <button class="copy-btn" onclick="copyCode(this)">Copy</button>
      </div>
      <code class="lang-${esc(lang)}">${esc(code)}</code>
    </pre>`;
  });

  return s;
}

window.copyCode = function(btn) {
  const code = btn.closest('pre').querySelector('code').textContent;
  navigator.clipboard.writeText(code).then(() => {
    btn.textContent = '✓ Copied'; btn.classList.add('copied');
    setTimeout(() => { btn.textContent = 'Copy'; btn.classList.remove('copied'); }, 2000);
  });
};

// ── Feed rendering ───────────────────────────────────────────────────────────
function renderFeed() {
  feedEl.innerHTML = '';

  const session = activeSession();
  if (!session || session.messages.length === 0) {
    feedEl.innerHTML = `
      <div id="welcome">
        <div class="wlc-orb"><svg viewBox="0 0 40 40" width="40" height="40">
          <polygon points="20,3 35,11.5 35,28.5 20,37 5,28.5 5,11.5" fill="none" stroke="currentColor" stroke-width="2"/>
          <circle cx="20" cy="20" r="5" fill="currentColor"/>
        </svg></div>
        <h1 class="wlc-title">Portal</h1>
        <p class="wlc-sub">Private intelligence, running on your hardware.</p>
        <div class="wlc-cards">
          <div class="wlc-card"><span class="wlc-card-icon">🔒</span><span>No data leaves your machine</span></div>
          <div class="wlc-card"><span class="wlc-card-icon">⚡</span><span>Real-time streaming responses</span></div>
          <div class="wlc-card"><span class="wlc-card-icon">🗂️</span><span>Full conversation history</span></div>
          <div class="wlc-card"><span class="wlc-card-icon">🎯</span><span>Switch models on the fly</span></div>
        </div>
      </div>`;
    return;
  }

  // Group messages with date dividers
  let lastDate = '';
  session.messages.forEach(msg => {
    const d = new Date(msg.ts || Date.now()).toLocaleDateString(undefined, { month:'short', day:'numeric' });
    if (d !== lastDate) {
      feedEl.appendChild(makeDivider(d));
      lastDate = d;
    }
    feedEl.appendChild(makeRow(msg.role, msg.content, msg.ts, false));
  });

  scrollBottom(false);
}

function makeDivider(label) {
  const d = document.createElement('div');
  d.className = 'feed-divider';
  d.textContent = label;
  return d;
}

function makeRow(role, content, ts, animate = true) {
  const row = document.createElement('div');
  row.className = `msg-row ${role}`;
  if (!animate) row.style.animation = 'none';

  const avatar = document.createElement('div');
  avatar.className = 'msg-avatar';
  avatar.textContent = role === 'user' ? '🧑' : role === 'error' ? '⚠️' : '⬡';

  const body = document.createElement('div');
  body.className = 'msg-body';

  const name = document.createElement('div');
  name.className = 'msg-name';
  name.textContent = role === 'user' ? 'You' : role === 'error' ? 'Error' : (state.model || 'Assistant');

  const content_el = document.createElement('div');
  content_el.className = 'msg-content';
  if (role === 'assistant') {
    content_el.innerHTML = renderMd(content);
  } else if (role === 'error') {
    content_el.textContent = content;
  } else {
    content_el.textContent = content;
  }

  const time = document.createElement('div');
  time.className = 'msg-time';
  time.textContent = new Date(ts || Date.now()).toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' });

  body.appendChild(name);
  body.appendChild(content_el);
  body.appendChild(time);
  row.appendChild(avatar);
  row.appendChild(body);
  return row;
}

function appendThinking() {
  const row = document.createElement('div');
  row.className = 'msg-row assistant thinking';
  row.id = 'thinking-row';

  const avatar = document.createElement('div');
  avatar.className = 'msg-avatar';
  avatar.textContent = '⬡';

  const body = document.createElement('div');
  body.className = 'msg-body';

  const name = document.createElement('div');
  name.className = 'msg-name';
  name.textContent = state.model || 'Assistant';

  const content_el = document.createElement('div');
  content_el.className = 'msg-content';
  content_el.innerHTML = '<div class="thinking-dots"><span></span><span></span><span></span></div>';

  body.appendChild(name);
  body.appendChild(content_el);
  row.appendChild(avatar);
  row.appendChild(body);
  feedEl.appendChild(row);
  scrollBottom();
  return row;
}

function removeThinking() {
  document.getElementById('thinking-row')?.remove();
}

function scrollBottom(smooth = true) {
  feedEl.scrollTo({ top: feedEl.scrollHeight, behavior: smooth ? 'smooth' : 'instant' });
}

// ── Chat list rendering ───────────────────────────────────────────────────────
function renderChatList() {
  chatListEl.innerHTML = '';
  if (state.sessions.length === 0) {
    chatListEl.innerHTML = '<div class="chat-list-empty">No conversations yet</div>';
    return;
  }
  state.sessions.forEach(s => {
    const el = document.createElement('div');
    el.className = 'chat-item' + (s.id === state.activeId ? ' active' : '');
    el.innerHTML = `<span class="chat-item-icon">💬</span><span class="chat-item-title">${escTxt(s.title)}</span>`;
    el.title = s.title;
    el.addEventListener('click', () => setActive(s.id));
    chatListEl.appendChild(el);
  });
}

function escTxt(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ── Send / streaming ──────────────────────────────────────────────────────────
async function send() {
  const text = inputEl.value.trim();
  if (!text || state.streaming) return;
  if (!state.model) { alert('No model selected. Make sure Ollama is running and has models installed.'); return; }

  // Ensure active session
  let session = activeSession();
  if (!session) {
    session = newSession();
    state.activeId = session.id;
  }

  // Title from first message
  if (session.messages.length === 0) {
    session.title = text.slice(0, 52) + (text.length > 52 ? '…' : '');
    renderChatList();
  }

  // Add user message
  const userMsg = { role: 'user', content: text, ts: Date.now() };
  session.messages.push(userMsg);

  // Clear input
  inputEl.value = '';
  autoResize();

  // Remove welcome if present
  qs('#welcome')?.remove();

  // Render user row
  feedEl.appendChild(makeRow('user', text, userMsg.ts));
  scrollBottom();

  // Show thinking
  appendThinking();

  state.streaming = true;
  btnSend.disabled = false;
  btnSend.classList.add('stop');
  btnSend.title = 'Stop (Esc)';
  btnSend.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="5" y="5" width="14" height="14" rx="2"/></svg>`;

  state.abortCtrl = new AbortController();

  // Use streaming endpoint
  try {
    const res = await fetch('/api/chat/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: state.abortCtrl.signal,
      body: JSON.stringify({
        model: state.model,
        messages: session.messages.map(m => ({ role: m.role, content: m.content })),
      }),
    });

    removeThinking();

    if (!res.ok) {
      const errData = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      appendErrorRow(errData.error || `HTTP ${res.status}`);
      finishStreaming();
      return;
    }

    // Create assistant row for streaming
    const ts = Date.now();
    const row = makeRow('assistant', '', ts);
    feedEl.appendChild(row);
    const contentEl = row.querySelector('.msg-content');
    const nameEl    = row.querySelector('.msg-name');
    nameEl.textContent = state.model;

    // Add cursor
    const cursor = document.createElement('span');
    cursor.className = 'stream-cursor';
    contentEl.appendChild(cursor);

    let fullText = '';
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });

      // SSE lines
      const lines = buf.split('\n');
      buf = lines.pop(); // keep incomplete line

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        try {
          const chunk = JSON.parse(line.slice(6));
          if (chunk.error) { appendErrorRow(chunk.error); break; }
          if (chunk.token) {
            fullText += chunk.token;
            cursor.remove();
            contentEl.innerHTML = renderMd(fullText);
            contentEl.appendChild(cursor);
            scrollBottom();
          }
          if (chunk.done) break;
        } catch (_) {}
      }
    }

    // Remove cursor, finalize
    cursor.remove();
    contentEl.innerHTML = renderMd(fullText);

    // Save to session
    const assistantMsg = { role: 'assistant', content: fullText, ts };
    session.messages.push(assistantMsg);
    // Update time display
    row.querySelector('.msg-time').textContent =
      new Date(ts).toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' });

  } catch (err) {
    removeThinking();
    if (err.name !== 'AbortError') {
      appendErrorRow(`Network error: ${err.message}`);
    }
  }

  save();
  finishStreaming();
  scrollBottom();
}

function appendErrorRow(msg) {
  removeThinking();
  const row = makeRow('error', msg, Date.now());
  feedEl.appendChild(row);
}

function finishStreaming() {
  state.streaming = false;
  state.abortCtrl = null;
  btnSend.classList.remove('stop');
  btnSend.title = 'Send (Enter)';
  btnSend.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>`;
  updateSendBtn();
  inputEl.focus();
}

function stopStreaming() {
  if (state.abortCtrl) {
    state.abortCtrl.abort();
    removeThinking();
    finishStreaming();
  }
}

// ── Input helpers ─────────────────────────────────────────────────────────────
function autoResize() {
  inputEl.style.height = 'auto';
  inputEl.style.height = Math.min(inputEl.scrollHeight, 220) + 'px';
  charCountEl.textContent = inputEl.value.length
    ? `${inputEl.value.length} char${inputEl.value.length !== 1 ? 's' : ''}`
    : '';
  updateSendBtn();
}

function updateSendBtn() {
  if (state.streaming) return; // streaming has its own state
  btnSend.disabled = !inputEl.value.trim();
}

// ── Events ────────────────────────────────────────────────────────────────────
inputEl.addEventListener('input', autoResize);

inputEl.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    if (state.streaming) { stopStreaming(); return; }
    if (!btnSend.disabled) send();
  }
  if (e.key === 'Escape') stopStreaming();
});

btnSend.addEventListener('click', () => {
  if (state.streaming) { stopStreaming(); return; }
  if (!btnSend.disabled) send();
});

btnNew.addEventListener('click', () => {
  const s = newSession();
  state.activeId = s.id;
  renderChatList();
  renderFeed();
  save();
  inputEl.focus();
});

btnClear.addEventListener('click', () => {
  const s = activeSession();
  if (!s || s.messages.length === 0) return;
  if (!confirm('Clear this conversation? This cannot be undone.')) return;
  s.messages = [];
  s.title = 'New chat';
  save();
  renderChatList();
  renderFeed();
});

btnSidebar.addEventListener('click', () => {
  sidebar.classList.toggle('hidden');
});

modelSelect.addEventListener('change', () => {
  state.model = modelSelect.value;
  modelDot.className = state.model ? 'model-status-dot ok' : 'model-status-dot warn';
  updateModelLabel();
  save();
});

// Ctrl+Shift+N = new chat
document.addEventListener('keydown', e => {
  if (e.ctrlKey && e.shiftKey && e.key === 'N') {
    e.preventDefault(); btnNew.click();
  }
});

// ── Init ─────────────────────────────────────────────────────────────────────
(async function init() {
  load();

  // Ensure at least one session exists and is active
  if (state.sessions.length === 0) {
    const s = newSession();
    state.activeId = s.id;
  } else if (!state.activeId || !activeSession()) {
    state.activeId = state.sessions[0].id;
  }

  renderChatList();
  renderFeed();

  await Promise.all([loadModels(), checkHealth()]);
  setInterval(checkHealth, 30_000);

  inputEl.focus();
})();
