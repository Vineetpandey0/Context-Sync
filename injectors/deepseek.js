// injectors/deepseek.js
// Runs on chat.deepseek.com
// Storage: chrome.storage.LOCAL (session is unreliable in content scripts)

const PENDING_INJECT_KEY = "pending_context_inject";

// ── Wait for DeepSeek's textarea to mount
async function waitForDeepSeekInput(maxRetries = 60) {
  for (let i = 0; i < maxRetries; i++) {
    const el = findDeepSeekInput();
    if (el) return el;
    await new Promise(r => setTimeout(r, 300));
  }
  return null;
}

function findDeepSeekInput() {
  // Primary: confirmed textarea selector
  const ta = document.querySelector("textarea#chat-input");
  if (ta && ta.offsetParent !== null) return ta;
  // Fallback 1: any visible textarea
  for (const el of document.querySelectorAll("textarea")) {
    if (el.offsetParent !== null) return el;
  }
  // Fallback 2: contenteditable (future DS changes)
  const ce = document.querySelector('[contenteditable="true"][data-lexical-editor="true"]');
  if (ce && ce.offsetParent !== null) return ce;
  return null;
}

function injectIntoDeepSeek(el, context) {
  el.focus();
  if (el.tagName === "TEXTAREA") {
    // React requires native setter to bypass synthetic event wrapping
    const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")?.set;
    nativeSetter ? nativeSetter.call(el, context) : (el.value = context);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  } else {
    document.execCommand("selectAll", false, null);
    document.execCommand("delete", false, null);
    document.execCommand("insertText", false, context);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }
}

async function submitDeepSeekInput() {
  for (let i = 0; i < 20; i++) {
    const btn = document.querySelector(
      'button[aria-label*="Send" i]:not([disabled]),' +
      'button[type="submit"]:not([disabled])'
    );
    if (btn) { btn.click(); return true; }
    await new Promise(r => setTimeout(r, 200));
  }
  const inp = findDeepSeekInput();
  if (inp) {
    inp.focus();
    inp.dispatchEvent(new KeyboardEvent("keydown", {
      key: "Enter", code: "Enter", keyCode: 13,
      bubbles: true, cancelable: true, composed: true,
    }));
    return true;
  }
  return false;
}

async function tryInjectContext() {
  let pending;
  try {
    const result = await chrome.storage.local.get([PENDING_INJECT_KEY]);
    pending = result[PENDING_INJECT_KEY];
  } catch (e) { return; }

  if (!pending) return;
  if (pending.target !== "deepseek") return;
  if (Date.now() - pending.ts > 60000) {
    await chrome.storage.local.remove([PENDING_INJECT_KEY]); return;
  }

  const input = await waitForDeepSeekInput();
  if (!input) { showBanner("Could not find DeepSeek input field.", true); return; }

  try { await chrome.storage.local.remove([PENDING_INJECT_KEY]); } catch (_) { }

  injectIntoDeepSeek(input, pending.context);
  await new Promise(r => setTimeout(r, 500));
  showBanner("Sending context to DeepSeek…");
  const ok = await submitDeepSeekInput();
  if (!ok) showBanner("Injected — please press Send manually.", true);
}


// BLOCK B — DeepSeek conversation scraper
function scrapeCurrentConversation() {
  const messages = [];
  const now = new Date().toISOString();

  const allMessages = document.querySelectorAll(
    ".fbb737a4, .f9bf7997, [class*='user-message'], [class*='assistant-message'], .ds-markdown"
  );

  if (!allMessages.length) {
    document.querySelectorAll("article, [role='listitem'], .message").forEach(el => {
      const text = el.innerText?.trim();
      if (text) messages.push({ type: "unknown", content: text, timestamp: now });
    });
    return messages;
  }

  allMessages.forEach(el => {
    const isUser = el.classList.contains("fbb737a4") ||
      el.closest("[class*='user']") !== null ||
      el.querySelector("textarea") !== null;
    const type = isUser ? "user" : "assistant";
    const content = el.innerText?.trim();
    if (content) messages.push({ type, content, format: "text", timestamp: now });
  });

  return messages;
}

// BLOCK C — Shared UI helpers
function showBanner(msg, isError = false) {
  document.getElementById("cc-banner")?.remove();
  const b = document.createElement("div");
  b.id = "cc-banner";
  Object.assign(b.style, {
    position: "fixed", top: "16px", left: "50%",
    transform: "translateX(-50%) translateY(-8px)",
    background: "#18181b", color: "#fafafa",
    fontFamily: "system-ui, sans-serif", fontSize: "13px", fontWeight: "500",
    padding: "10px 20px", borderRadius: "999px",
    border: `1px solid ${isError ? "#f43f5e" : "#3f3f46"}`,
    boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
    zIndex: "2147483647", display: "flex", alignItems: "center", gap: "8px",
    opacity: "0", transition: "opacity 0.2s, transform 0.2s", whiteSpace: "nowrap",
  });
  b.innerHTML = isError
    ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f43f5e" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>${msg}`
    : `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>${msg}`;
  document.body.appendChild(b);
  requestAnimationFrame(() => { b.style.opacity = "1"; b.style.transform = "translateX(-50%) translateY(0)"; });
  setTimeout(() => { b.style.opacity = "0"; setTimeout(() => b.remove(), 300); }, 3500);
}

function downloadCurrentChat() {
  const messages = scrapeCurrentConversation();
  if (!messages.length) { showBanner("No conversation found to download.", true); return; }
  const title = messages.find(m => m.type === "user")?.content?.slice(0, 60) || "conversation";
  const data = {
    id: `scraped_${Date.now()}`,
    title, url: window.location.href, messages,
    savedAt: new Date().toISOString(),
    source: "deepseek", version: 1,
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${title.replace(/[^\w\d]+/g, "_").slice(0, 50)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function sendFromThisPage(target) {
  const messages = scrapeCurrentConversation();
  if (!messages.length) { showBanner("No conversation found on this page.", true); return; }
  const title = messages.find(m => m.type === "user")?.content?.slice(0, 60) || "Untitled";
  const lines = [
    `[Context from DeepSeek conversation: "${title}"]`,
    `[Scraped: ${new Date().toLocaleString()}]`,
    "",
  ];
  for (const msg of messages) {
    lines.push(`${msg.type === "user" ? "User" : "DeepSeek"}: ${msg.content}`, "");
  }
  lines.push("---", "I'm continuing this conversation. What are your thoughts?");

  const context = lines.join("\n");
  const AI_URLS = {
    claude: "https://claude.ai/new",
    gemini: "https://gemini.google.com/app",
    chatgpt: "https://chatgpt.com/",
  };

  try {
    chrome.storage.local.set(
      { [PENDING_INJECT_KEY]: { target, context, ts: Date.now() } },
      () => window.open(AI_URLS[target], "_blank")
    );
  } catch (e) {
    window.open(AI_URLS[target], "_blank");
  }
}

// AI options for DeepSeek panel (excludes DeepSeek itself)
const CC_AI_OPTIONS = [
  {
    id: "claude", label: "Claude", color: "#d97706", bg: "rgba(217,119,6,0.12)",
    svg: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M14.5 2C11 2 8.5 4.5 8.5 7.5c0 1.5.5 2.8 1.4 3.8L4 17.5l1.5 1.5 5.9-6.2c1 .9 2.3 1.4 3.6 1.4C18 14.2 20.5 11.7 20.5 8.5S18 2 14.5 2zm0 2c2.2 0 4 1.8 4 4s-1.8 4-4 4-4-1.8-4-4 1.8-4 4-4z" fill="#d97706"/></svg>`
  },
  {
    id: "gemini", label: "Gemini", color: "#4285F4", bg: "rgba(66,133,244,0.12)",
    svg: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 2C9.5 7.5 6.5 9.5 2 12c4.5 2.5 7.5 4.5 10 10 2.5-5.5 5.5-7.5 10-10-4.5-2.5-7.5-4.5-10-10z" fill="#4285F4"/></svg>`
  },
  {
    id: "chatgpt", label: "ChatGPT", color: "#10a37f", bg: "rgba(16,163,127,0.12)",
    svg: `<svg width="14" height="14" viewBox="0 0 24 24" fill="#10a37f"><circle cx="12" cy="12" r="10"/><path d="M8 12h8M12 8v8" stroke="white" stroke-width="2" stroke-linecap="round"/></svg>`
  },
];

function ensureStyles() {
  if (document.getElementById("cc-styles")) return;
  const s = document.createElement("style");
  s.id = "cc-styles";
  s.textContent = `
    #cc-ask-ai-btn {
      display: inline-flex !important;
      align-items: center !important;
      gap: 5px !important;
      padding: 0 10px !important;
      height: 32px !important;
      background: transparent !important;
      border: 1px solid rgba(255,255,255,0.15) !important;
      border-radius: 8px !important;
      color: rgba(255,255,255,0.65) !important;
      cursor: pointer !important;
      font-family: system-ui, sans-serif !important;
      font-size: 12px !important;
      font-weight: 600 !important;
      transition: background 0.15s, border-color 0.15s, color 0.15s !important;
      flex-shrink: 0 !important;
      white-space: nowrap !important;
      outline: none !important;
      box-shadow: none !important;
      vertical-align: middle !important;
    }
    #cc-ask-ai-btn:hover {
      background: rgba(255,255,255,0.07) !important;
      border-color: rgba(255,255,255,0.3) !important;
      color: rgba(255,255,255,0.9) !important;
    }
    #cc-ask-ai-btn.cc-active {
      background: rgba(255,255,255,0.1) !important;
      border-color: rgba(255,255,255,0.35) !important;
      color: rgba(255,255,255,0.95) !important;
    }
    #cc-ask-ai-panel {
      position: fixed !important;
      background: #18181b !important;
      border: 1px solid rgba(255,255,255,0.1) !important;
      border-radius: 14px !important;
      padding: 8px !important;
      box-shadow: 0 8px 32px rgba(0,0,0,0.6), 0 0 0 1px rgba(0,0,0,0.1) !important;
      z-index: 2147483647 !important;
      display: none !important;
      flex-direction: column !important;
      gap: 3px !important;
      min-width: 210px !important;
      font-family: system-ui, sans-serif !important;
    }
    #cc-ask-ai-panel.cc-open {
      display: flex !important;
      animation: cc-pop 0.16s cubic-bezier(0.16,1,0.3,1) !important;
    }
    @keyframes cc-pop {
      from { opacity:0; transform:translateY(6px) scale(0.97); }
      to   { opacity:1; transform:translateY(0) scale(1); }
    }
    .cc-panel-hdr {
      font-size: 10px !important;
      font-weight: 700 !important;
      color: rgba(255,255,255,0.35) !important;
      text-transform: uppercase !important;
      letter-spacing: 0.8px !important;
      padding: 3px 8px 8px !important;
      border-bottom: 1px solid rgba(255,255,255,0.07) !important;
      margin-bottom: 2px !important;
    }
    .cc-ai-opt {
      display: flex !important;
      align-items: center !important;
      gap: 10px !important;
      width: 100% !important;
      padding: 8px 10px !important;
      background: transparent !important;
      border: none !important;
      border-radius: 8px !important;
      cursor: pointer !important;
      font-family: system-ui, sans-serif !important;
      transition: background 0.12s, transform 0.1s !important;
      text-align: left !important;
    }
    .cc-ai-opt:hover { background: rgba(255,255,255,0.06) !important; transform: translateX(2px) !important; }
    .cc-ai-opt:active { transform: scale(0.97) !important; }
    .cc-ai-ico {
      width: 28px !important; height: 28px !important;
      border-radius: 8px !important;
      display: flex !important; align-items: center !important; justify-content: center !important;
      flex-shrink: 0 !important;
    }
    .cc-ai-lbl { font-size: 13px !important; font-weight: 600 !important; color: rgba(255,255,255,0.9) !important; display:block !important; }
    .cc-ai-sub { font-size: 10px !important; color: rgba(255,255,255,0.4) !important; display:block !important; margin-top:1px !important; }
    .cc-arr { margin-left: auto !important; color: rgba(255,255,255,0.35) !important; flex-shrink: 0 !important; }
    .cc-divider { height: 1px !important; background: rgba(255,255,255,0.07) !important; margin: 3px 0 !important; }
  `;
  document.head.appendChild(s);
}

let _panel = null;
let _panelOpen = false;

function buildPanel() {
  const panel = document.createElement("div");
  panel.id = "cc-ask-ai-panel";

  const hdr = document.createElement("div");
  hdr.className = "cc-panel-hdr";
  hdr.textContent = "Send context to";
  panel.appendChild(hdr);

  for (const ai of CC_AI_OPTIONS) {
    const opt = document.createElement("button");
    opt.className = "cc-ai-opt";
    opt.type = "button";
    opt.innerHTML = `
      <span class="cc-ai-ico" style="background:${ai.bg}">${ai.svg}</span>
      <span>
        <span class="cc-ai-lbl">${ai.label}</span>
        <span class="cc-ai-sub">Open &amp; inject context</span>
      </span>
      <svg class="cc-arr" width="11" height="11" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
        <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
      </svg>
    `;
    opt.addEventListener("mousedown", (e) => {
      e.preventDefault();
      closePanel();
      sendFromThisPage(ai.id);
    });
    panel.appendChild(opt);
  }

  const divider = document.createElement("div");
  divider.className = "cc-divider";
  panel.appendChild(divider);

  const dlBtn = document.createElement("button");
  dlBtn.className = "cc-ai-opt";
  dlBtn.type = "button";
  dlBtn.innerHTML = `
    <span class="cc-ai-ico" style="background:rgba(255,255,255,0.06)">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.65)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
      </svg>
    </span>
    <span>
      <span class="cc-ai-lbl">Download chat</span>
      <span class="cc-ai-sub">Save as JSON</span>
    </span>
  `;
  dlBtn.addEventListener("mousedown", (e) => {
    e.preventDefault();
    closePanel();
    downloadCurrentChat();
  });
  panel.appendChild(dlBtn);

  document.body.appendChild(panel);
  return panel;
}

function openPanel(btn) {
  if (!_panel) _panel = buildPanel();
  const r = btn.getBoundingClientRect();
  const panelH = 220;
  if (r.top > panelH + 10) {
    _panel.style.bottom = `${window.innerHeight - r.top + 8}px`;
    _panel.style.top = "auto";
  } else {
    _panel.style.top = `${r.bottom + 8}px`;
    _panel.style.bottom = "auto";
  }
  _panel.style.left = `${Math.min(r.left, window.innerWidth - 220)}px`;
  _panel.classList.add("cc-open");
  btn.classList.add("cc-active");
  _panelOpen = true;
}

function closePanel() {
  _panel?.classList.remove("cc-open");
  document.getElementById("cc-ask-ai-btn")?.classList.remove("cc-active");
  _panelOpen = false;
}

function createAskAIButton() {
  const btn = document.createElement("button");
  btn.id = "cc-ask-ai-btn";
  btn.type = "button";
  btn.title = "Send this conversation to another AI";
  btn.innerHTML = `
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
      <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
    </svg>
    Export
  `;
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    _panelOpen ? closePanel() : openPanel(btn);
  });
  document.addEventListener("click", (e) => {
    if (_panelOpen && !_panel?.contains(e.target) && e.target !== btn) closePanel();
  });
  return btn;
}

// DeepSeek toolbar injection
function findDeepSeekSlot() {
  return document.querySelector(".ec4f5d61");
}

function injectDeepSeekButton() {
  if (document.getElementById("cc-ask-ai-btn")) return;
  ensureStyles();
  const slot = findDeepSeekSlot();
  if (!slot) return;

  const btn = createAskAIButton();
  slot.insertBefore(btn, slot.firstChild);
}

// BLOCK D — Keep button alive
let _deepseekObserver = null;
function watchForButtonRemoval() {
  if (_deepseekObserver) return;
  _deepseekObserver = new MutationObserver(() => {
    if (!document.getElementById("cc-ask-ai-btn")) {
      setTimeout(injectDeepSeekButton, 300);
    }
  });
  _deepseekObserver.observe(document.body, { childList: true, subtree: true });
}

let _injectAttempts = 0;
function retryInjectButton() {
  if (document.getElementById("cc-ask-ai-btn")) { watchForButtonRemoval(); return; }
  if (_injectAttempts++ > 30) return;
  injectDeepSeekButton();
  if (!document.getElementById("cc-ask-ai-btn")) {
    setTimeout(retryInjectButton, 500);
  } else {
    watchForButtonRemoval();
  }
}

// BLOCK E — Entry point
function init() {
  tryInjectContext();
  retryInjectButton();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}