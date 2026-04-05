// injectors/gemini.js — Runs on gemini.google.com
// Context Sync — Phase 2
//
// Storage: chrome.storage.LOCAL (NOT .session — session is unreliable in content scripts)

const PENDING_INJECT_KEY = "pending_context_inject";


// ═══════════════════════════════════════════════════════════════════════════════
// BLOCK A — Wait for Gemini's actual input field
// ═══════════════════════════════════════════════════════════════════════════════

async function waitForGeminiInput(maxRetries = 60) {
  for (let i = 0; i < maxRetries; i++) {
    const el = findGeminiInput();
    if (el) {
      console.log("[CC] 🎯 Gemini input found:", el.tagName, el.className);
      return el;
    }
    await new Promise(r => setTimeout(r, 300));
  }
  return null;
}

function findGeminiInput() {
  // PRIMARY (confirmed from live DOM):
  // <rich-textarea class="ql-container ql-bubble">
  //   <div class="ql-editor ql-blank textarea new-input-ui" contenteditable="true" role="textbox" aria-label="Enter a prompt for Gemini">
  // IMPORTANT: .ql-clipboard is ALSO contenteditable inside rich-textarea — must exclude it
  const ql = document.querySelector(
    "rich-textarea .ql-editor[contenteditable='true']:not(.ql-clipboard)"
  );
  if (ql && ql.offsetParent !== null) return ql;

  // FALLBACK 1: aria-label confirmed from live DOM
  const byLabel = document.querySelector(
    '[contenteditable="true"][aria-label="Enter a prompt for Gemini"],' +
    '[contenteditable="true"][aria-label*="prompt for Gemini" i]'
  );
  if (byLabel && byLabel.offsetParent !== null) return byLabel;

  // FALLBACK 2: role=textbox + aria-multiline (Gemini-specific attributes)
  const byRole = document.querySelector(
    '[contenteditable="true"][role="textbox"][aria-multiline="true"]'
  );
  if (byRole && byRole.offsetParent !== null) return byRole;

  // FALLBACK 3: any .ql-editor contenteditable visible on screen
  const allQl = document.querySelectorAll('.ql-editor[contenteditable="true"]');
  for (const el of allQl) {
    if (el.offsetParent !== null) return el;
  }

  // FALLBACK 4: large visible contenteditable in lower viewport half (last resort)
  const allCe = document.querySelectorAll('[contenteditable="true"]:not(.ql-clipboard)');
  for (const el of allCe) {
    const rect = el.getBoundingClientRect();
    if (rect.width > 200 && rect.bottom > window.innerHeight * 0.4 && el.offsetParent !== null) {
      return el;
    }
  }

  return null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// BLOCK B — Correct injection for Quill / contenteditable
// ═══════════════════════════════════════════════════════════════════════════════

// ── Most reliable injection for Quill contenteditable
function injectIntoGemini(el, text) {
  // 1. Focus
  el.click();
  el.focus();

  // 2. Remove Quill's blank placeholder class
  el.classList.remove("ql-blank");

  // 3. Build Quill-format HTML (each line = <p>, empty lines = <p><br></p>)
  const html = text.split("\n").map(line => {
    if (!line.trim()) return "<p><br></p>";
    const escaped = line
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    return `<p>${escaped}</p>`;
  }).join("");

  // 4. Set innerHTML directly
  el.innerHTML = html;

  // 5. Place cursor at end so Quill knows editing is happening
  try {
    const range = document.createRange();
    const sel = window.getSelection();
    const lastChild = el.lastElementChild || el;
    range.selectNodeContents(lastChild);
    range.collapse(false);
    sel.removeAllRanges();
    sel.addRange(range);
  } catch (_) { }

  // 6. Fire the full event chain to update Angular/Quill state
  el.dispatchEvent(new Event("focus", { bubbles: true }));
  el.dispatchEvent(new InputEvent("beforeinput", { bubbles: true, inputType: "insertText", data: text }));
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: text }));
  el.dispatchEvent(new Event("change", { bubbles: true }));

  console.log("[CC] ✍️ Injected", text.length, "chars");
}


// ── Check if Quill field is still empty
function isQuillEmpty(el) {
  const t = (el.innerText || "").trim();
  return !t || el.innerHTML === "<p><br></p>";
}

// ═══════════════════════════════════════════════════════════════════════════════
// BLOCK C — Pending context handler (reads from chrome.storage.LOCAL)
// ═══════════════════════════════════════════════════════════════════════════════

async function submitGeminiInput() {
  for (let i = 0; i < 20; i++) {
    const btn = document.querySelector(
      'button[aria-label="Send message"]:not([aria-disabled="true"]):not([disabled])'
    );
    if (btn) {
      console.log("[CC] 🚀 Clicking Send button");
      btn.click();
      return true;
    }
    await new Promise(r => setTimeout(r, 200));
  }
  const inp = findGeminiInput();
  if (inp) {
    console.warn("[CC] Send btn not enabled — trying Enter key");
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
  } catch (e) {
    console.warn("[CC] storage error:", e.message);
    return;
  }

  console.log("[CC] storage →", pending
    ? `target=${pending.target}, age=${Math.round((Date.now() - pending.ts) / 1000)}s, len=${pending.context?.length}`
    : "no pending data"
  );

  if (!pending) return;
  if (pending.target !== "gemini") { return; }
  if (Date.now() - pending.ts > 60000) {
    return;
  }

  const input = await waitForGeminiInput();
  if (!input) {
    showBanner("Could not find Gemini input field.", true);
    return;
  }
  console.log("[CC] ✅ Input found");

  try { await chrome.storage.local.remove([PENDING_INJECT_KEY]); } catch (_) { }

  injectIntoGemini(input, pending.context);
  await new Promise(r => setTimeout(r, 600));

  showBanner("Sending context to Gemini…");
  const submitted = await submitGeminiInput();
  if (!submitted) {
    showBanner("Injected — please press Send manually.", true);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// BLOCK D — Gemini conversation scraper
// ═══════════════════════════════════════════════════════════════════════════════

function scrapeCurrentConversation() {
  const messages = [];
  const now = new Date().toISOString();

  // ── PRIMARY (confirmed from live DOM) ────────────────────────────────────────
  // User turns:  <user-query-content> → .query-text → .query-text-line (p tags)
  // Model turns: <model-response> → message-content → .markdown.markdown-main-panel

  const userEls = document.querySelectorAll("user-query-content");
  const modelEls = document.querySelectorAll("model-response");

  if (userEls.length > 0 || modelEls.length > 0) {
    const all = [
      ...[...userEls].map(el => ({ el, type: "user" })),
      ...[...modelEls].map(el => ({ el, type: "assistant" })),
    ].sort((a, b) =>
      a.el.compareDocumentPosition(b.el) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1
    );

    for (const { el, type } of all) {
      let text;
      if (type === "user") {
        // Confirmed: .query-text > .query-text-line (one <p> per line)
        const queryTextEl = el.querySelector(".query-text");
        text = queryTextEl
          ? [...queryTextEl.querySelectorAll(".query-text-line")]
            .map(p => p.innerText?.trim())
            .filter(Boolean)
            .join("\n") || queryTextEl.innerText?.trim()
          : el.querySelector(".user-query-bubble-with-background")?.innerText?.trim()
          || el.innerText?.trim();
      } else {
        // Confirmed: message-content .markdown.markdown-main-panel
        const markdownEl =
          el.querySelector("message-content .markdown") ||
          el.querySelector(".markdown") ||
          el.querySelector("message-content");
        // Strip buttons/icons from the clone before reading text
        if (markdownEl) {
          const clone = markdownEl.cloneNode(true);
          clone.querySelectorAll("button, svg, [aria-hidden], response-element, sources-list").forEach(n => n.remove());
          text = clone.innerText?.trim();
        } else {
          const clone = el.cloneNode(true);
          clone.querySelectorAll("button, svg, [aria-hidden], response-element, sources-list, message-actions").forEach(n => n.remove());
          text = clone.innerText?.trim();
        }
      }
      if (text) messages.push({ type, content: text, format: "text", timestamp: now });
    }
    return messages;
  }

  // ── FALLBACK: broad sweep ────────────────────────────────────────────────────
  document.querySelectorAll("[data-message-author], [role='listitem']").forEach(el => {
    const text = el.innerText?.trim();
    if (text) messages.push({ type: "unknown", content: text, timestamp: now });
  });

  return messages;
}

// ═══════════════════════════════════════════════════════════════════════════════
// BLOCK E — Shared UI utilities
// ═══════════════════════════════════════════════════════════════════════════════

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
    savedAt: new Date().toISOString(), source: "gemini", version: 1,
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${title.replace(/[^\w\d]+/g, "_").slice(0, 50)}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

function copyCurrentChat() {
  const messages = scrapeCurrentConversation();
  if (!messages.length) { showBanner("No conversation found to copy.", true); return; }
  const title = messages.find(m => m.type === "user")?.content?.slice(0, 60) || "conversation";
  const lines = [
    `[Gemini conversation: "${title}"]`,
    `[Copied: ${new Date().toLocaleString()}]`,
    "",
  ];
  for (const msg of messages) {
    lines.push(`${msg.type === "user" ? "User" : "Gemini"}: ${msg.content}`, "");
  }
  navigator.clipboard.writeText(lines.join("\n")).then(
    () => showBanner("Conversation copied to clipboard"),
    () => showBanner("Copy failed — try again.", true)
  );
}

function sendFromThisPage(target) {
  const messages = scrapeCurrentConversation();
  if (!messages.length) { showBanner("No conversation found on this page.", true); return; }
  const title = messages.find(m => m.type === "user")?.content?.slice(0, 60) || "Untitled";
  const lines = [
    `[Context from Gemini conversation: "${title}"]`,
    `[Scraped: ${new Date().toLocaleString()}]`, "",
  ];
  for (const msg of messages) {
    lines.push(`${msg.type === "user" ? "User" : "Gemini"}: ${msg.content}`, "");
  }
  lines.push("---", "I'm continuing this conversation. What are your thoughts?");

  const AI_URLS = { claude: "https://claude.ai/new", chatgpt: "https://chatgpt.com/", deepseek: "https://chat.deepseek.com/" };
  const context = lines.join("\n");
  try {
    chrome.storage.session.set(
      { [PENDING_INJECT_KEY]: { target, context, ts: Date.now() } },
      () => window.open(AI_URLS[target], "_blank")
    );
  } catch (e) { window.open(AI_URLS[target], "_blank"); }
}

// ═══════════════════════════════════════════════════════════════════════════════
// BLOCK F — "Ask AI" button + panel UI
// ═══════════════════════════════════════════════════════════════════════════════

const CC_AI_OPTIONS = [
  {
    id: "claude", label: "Claude", color: "#d97706", bg: "rgba(217,119,6,0.12)",
    svg: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M14.5 2C11 2 8.5 4.5 8.5 7.5c0 1.5.5 2.8 1.4 3.8L4 17.5l1.5 1.5 5.9-6.2c1 .9 2.3 1.4 3.6 1.4C18 14.2 20.5 11.7 20.5 8.5S18 2 14.5 2zm0 2c2.2 0 4 1.8 4 4s-1.8 4-4 4-4-1.8-4-4 1.8-4 4-4z" fill="#d97706"/></svg>`
  },
  {
    id: "chatgpt", label: "ChatGPT", color: "#10a37f", bg: "rgba(16,163,127,0.12)",
    svg: `<svg width="14" height="14" viewBox="0 0 24 24" fill="#10a37f"><circle cx="12" cy="12" r="10"/><path d="M8 12h8M12 8v8" stroke="white" stroke-width="2" stroke-linecap="round"/></svg>`
  },
  {
    id: "deepseek", label: "DeepSeek", color: "#1A6BFF", bg: "rgba(26,107,255,0.12)",
    svg: `<svg width="14" height="14" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#1A6BFF"/><circle cx="12" cy="12" r="5" fill="white"/><circle cx="12" cy="12" r="2.5" fill="#1A6BFF"/></svg>`
  },
];

function ensureStyles() {
  if (document.getElementById("cc-styles")) return;
  const s = document.createElement("style");
  s.id = "cc-styles";
  s.textContent = `
    #cc-ask-ai-btn {
      display: inline-flex !important; align-items: center !important; gap: 5px !important;
      padding: 0 10px !important; height: 32px !important;
      background: transparent !important; border: 1px solid rgba(255,255,255,0.15) !important;
      border-radius: 8px !important; color: rgba(255,255,255,0.65) !important;
      cursor: pointer !important; font-family: system-ui, sans-serif !important;
      font-size: 12px !important; font-weight: 600 !important;
      transition: background 0.15s, border-color 0.15s, color 0.15s !important;
      flex-shrink: 0 !important; white-space: nowrap !important;
      outline: none !important; box-shadow: none !important; vertical-align: middle !important;
    }
    #cc-ask-ai-btn:hover {
      background: rgba(255,255,255,0.07) !important;
      border-color: rgba(255,255,255,0.3) !important;
      color: rgba(255,255,255,0.9) !important;
    }
    #cc-ask-ai-btn.cc-active {
      background: rgba(255,255,255,0.1) !important;
      border-color: rgba(255,255,255,0.35) !important;
    }
    #cc-ask-ai-panel {
      position: fixed !important; background: #18181b !important;
      border: 1px solid rgba(255,255,255,0.1) !important; border-radius: 14px !important;
      padding: 8px !important; box-shadow: 0 8px 32px rgba(0,0,0,0.6) !important;
      z-index: 2147483647 !important; display: none !important;
      flex-direction: column !important; gap: 3px !important;
      min-width: 210px !important; font-family: system-ui, sans-serif !important;
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
      font-size: 10px !important; font-weight: 700 !important;
      color: rgba(255,255,255,0.35) !important; text-transform: uppercase !important;
      letter-spacing: 0.8px !important; padding: 3px 8px 8px !important;
      border-bottom: 1px solid rgba(255,255,255,0.07) !important; margin-bottom: 2px !important;
    }
    .cc-ai-opt {
      display: flex !important; align-items: center !important; gap: 10px !important;
      width: 100% !important; padding: 8px 10px !important;
      background: transparent !important; border: none !important;
      border-radius: 8px !important; cursor: pointer !important;
      font-family: system-ui, sans-serif !important;
      transition: background 0.12s, transform 0.1s !important; text-align: left !important;
    }
    .cc-ai-opt:hover { background: rgba(255,255,255,0.06) !important; transform: translateX(2px) !important; }
    .cc-ai-opt:active { transform: scale(0.97) !important; }
    .cc-ai-ico {
      width: 28px !important; height: 28px !important; border-radius: 8px !important;
      display: flex !important; align-items: center !important;
      justify-content: center !important; flex-shrink: 0 !important;
    }
    .cc-ai-lbl { font-size: 13px !important; font-weight: 600 !important; color: rgba(255,255,255,0.9) !important; display:block !important; }
    .cc-ai-sub { font-size: 10px !important; color: rgba(255,255,255,0.4) !important; display:block !important; margin-top:1px !important; }
    .cc-arr { margin-left: auto !important; color: rgba(255,255,255,0.35) !important; flex-shrink: 0 !important; }
    .cc-divider { height: 1px !important; background: rgba(255,255,255,0.07) !important; margin: 3px 0 !important; }
    .cc-action-row {
      display: flex !important;
      gap: 4px !important;
      padding: 2px 2px 2px !important;
    }
    .cc-action-btn {
      flex: 1 !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      gap: 6px !important;
      padding: 7px 10px !important;
      background: transparent !important;
      border: 1px solid rgba(255,255,255,0.08) !important;
      border-radius: 8px !important;
      color: rgba(255,255,255,0.55) !important;
      cursor: pointer !important;
      font-family: system-ui, sans-serif !important;
      font-size: 11px !important;
      font-weight: 500 !important;
      transition: background 0.12s, color 0.12s, border-color 0.12s !important;
      white-space: nowrap !important;
    }
    .cc-action-btn:hover {
      background: rgba(255,255,255,0.07) !important;
      border-color: rgba(255,255,255,0.18) !important;
      color: rgba(255,255,255,0.9) !important;
    }
    .cc-action-btn:active { opacity: 0.75 !important; }
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
    opt.addEventListener("mousedown", (e) => { e.preventDefault(); closePanel(); sendFromThisPage(ai.id); });
    panel.appendChild(opt);
  }

  const divider = document.createElement("div");
  divider.className = "cc-divider";
  panel.appendChild(divider);

  // ── Copy + Download inline row ──────────────────────────────────────────
  const actionRow = document.createElement("div");
  actionRow.className = "cc-action-row";

  const copyBtn = document.createElement("button");
  copyBtn.className = "cc-action-btn";
  copyBtn.type = "button";
  copyBtn.title = "Copy conversation to clipboard";
  copyBtn.innerHTML = `
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
    </svg>
    Copy
  `;
  copyBtn.addEventListener("mousedown", (e) => {
    e.preventDefault();
    closePanel();
    copyCurrentChat();
  });

  const dlBtn = document.createElement("button");
  dlBtn.className = "cc-action-btn";
  dlBtn.type = "button";
  dlBtn.title = "Download conversation as JSON";
  dlBtn.innerHTML = `
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M12 3v12"/><path d="m7 10 5 5 5-5"/>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
    </svg>
    Download
  `;
  dlBtn.addEventListener("mousedown", (e) => {
    e.preventDefault();
    closePanel();
    downloadCurrentChat();
  });

  actionRow.appendChild(copyBtn);
  actionRow.appendChild(dlBtn);
  panel.appendChild(actionRow);

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
  btn.style.marginBottom = "5px";
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    _panelOpen ? closePanel() : openPanel(btn);
  });
  document.addEventListener("click", (e) => {
    if (_panelOpen && !_panel?.contains(e.target) && e.target !== btn) closePanel();
  });
  return btn;
}

// ═══════════════════════════════════════════════════════════════════════════════
// BLOCK G — Button injection into Gemini toolbar
// ═══════════════════════════════════════════════════════════════════════════════

function findGeminiSlot() {
  return document.querySelector(".leading-actions-wrapper") || null;
}

function injectGeminiButton() {
  if (document.getElementById("cc-ask-ai-btn")) return;
  ensureStyles();
  const slot = findGeminiSlot();
  if (!slot) return;
  const btn = createAskAIButton();
  const toolbox = slot.querySelector("toolbox-drawer");
  toolbox ? slot.insertBefore(btn, toolbox) : slot.appendChild(btn);
}

// ═══════════════════════════════════════════════════════════════════════════════
// BLOCK H — MutationObserver to survive Angular re-renders
// ═══════════════════════════════════════════════════════════════════════════════

function observeGeminiDOM() {
  const observer = new MutationObserver(() => {
    if (!document.getElementById("cc-ask-ai-btn")) injectGeminiButton();
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

let _injectAttempts = 0;
function retryInjectButton() {
  if (document.getElementById("cc-ask-ai-btn")) { observeGeminiDOM(); return; }
  if (_injectAttempts++ > 30) return;
  injectGeminiButton();
  if (!document.getElementById("cc-ask-ai-btn")) {
    setTimeout(retryInjectButton, 500);
  } else {
    observeGeminiDOM();
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// BLOCK I — Auto-save for popup display
// ═══════════════════════════════════════════════════════════════════════════════

const CC_STORAGE_KEY = "claude_conversations";

function scrapeAndSave() {
  const messages = scrapeCurrentConversation();
  if (!messages.length) return Promise.resolve({ ok: false, reason: "no messages" });

  const title = messages.find(m => m.type === "user")?.content?.slice(0, 60) || "Gemini conversation";
  const convId = `gemini_${window.location.href}`;

  return new Promise((resolve) => {
    chrome.storage.local.get([CC_STORAGE_KEY], (res) => {
      const all = res[CC_STORAGE_KEY] || [];
      // Replace existing entry for this URL, or prepend
      const idx = all.findIndex(c => c.id === convId);
      const entry = {
        id: convId, title, url: window.location.href,
        messages, savedAt: new Date().toISOString(),
        source: "gemini", version: 1,
      };
      if (idx >= 0) all[idx] = entry; else all.unshift(entry);
      chrome.storage.local.set({ [CC_STORAGE_KEY]: all }, () => resolve({ ok: true }));
    });
  });
}

// Listen for popup's scrapeNow request
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.action === "scrapeNow") {
    scrapeAndSave().then(sendResponse);
    return true; // async
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// BLOCK J — Entry point
// ═══════════════════════════════════════════════════════════════════════════════

function init() {
  // Triple-fire to cover Angular's delayed hydration (0ms, 1.5s, 3s)
  tryInjectContext();
  setTimeout(tryInjectContext, 1500);
  setTimeout(tryInjectContext, 3000);

  retryInjectButton();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}