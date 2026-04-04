// content.js — DOM Scraper + Send-to-AI button for Claude.ai

// ── Code-block helpers ────────────────────────────────────────────────────────
function extractCodeBlocks(text) {
  const blocks = [];
  let idx = 0;
  const stripped = text.replace(/```[\s\S]*?```/g, (match) => {
    const placeholder = `__CODE_BLOCK_${idx++}__`;
    blocks.push({ placeholder, code: match });
    return placeholder;
  });
  return { stripped, blocks };
}

function restoreCodeBlocks(text, blocks) {
  let result = text;
  for (const { placeholder, code } of blocks) {
    result = result.replace(placeholder, code);
  }
  return result;
}

// ── Single-message compressor ─────────────────────────────────────────────────
async function compressMessage(message) {
  const { content, type } = message;
  if (!content || content.length < 120) return { ...message, compressed: false };

  const { stripped, blocks } = extractCodeBlocks(content);
  const proseOnly = stripped.replace(/__CODE_BLOCK_\d+__/g, "").trim();
  if (!proseOnly) return { ...message, compressed: false };

  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      { action: "compressMessage", type, content: stripped },
      (response) => {
        if (chrome.runtime.lastError || !response?.ok || !response?.compressed) {
          resolve({ ...message, compressed: false });
          return;
        }
        const compressedContent = restoreCodeBlocks(response.compressed, blocks);
        resolve({ ...message, content: compressedContent, compressed: true });
      }
    );
  });
}

// ── Conversation compressor ───────────────────────────────────────────────────
async function compressConversation(messages) {
  const userMessages = messages.filter((m) => m.type === "user").slice(-5);
  const assistantMessages = messages.filter((m) => m.type === "assistant").slice(-5);

  const keptUserSet = new Set(userMessages.map((m) => m.timestamp + m.content.slice(0, 40)));
  const keptAssistantSet = new Set(assistantMessages.map((m) => m.timestamp + m.content.slice(0, 40)));

  const kept = messages.filter((m) => {
    const key = m.timestamp + m.content.slice(0, 40);
    return m.type === "user" ? keptUserSet.has(key) : keptAssistantSet.has(key);
  });

  return await Promise.all(kept.map((msg) => compressMessage(msg)));
}

// ── Capsule ───────────────────────────────────────────────────────────────────
const Capsule = {
  build(messages, url) {
    const title = this._inferTitle(messages, url);
    return {
      id: `conv_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      title, url, messages,
      savedAt: new Date().toISOString(),
      source: "claude",
      version: 1,
    };
  },
  _inferTitle(messages, url) {
    const firstUser = messages.find((m) => m.type === "user");
    if (firstUser && firstUser.content.length > 0) {
      return firstUser.content.substring(0, 60).replace(/\n/g, " ").trim() +
        (firstUser.content.length > 60 ? "…" : "");
    }
    try {
      const u = new URL(url);
      const parts = u.pathname.split("/").filter(Boolean);
      return parts[parts.length - 1] || "Untitled Conversation";
    } catch { return "Untitled Conversation"; }
  },
};

// ── Storage ───────────────────────────────────────────────────────────────────
const STORAGE_KEY = "claude_conversations";
const MAX_CONVERSATIONS = 50;

function storageGetAll() {
  return new Promise((resolve) => {
    chrome.storage.local.get([STORAGE_KEY], (result) => {
      if (chrome.runtime.lastError) { resolve([]); return; }
      resolve(result[STORAGE_KEY] || []);
    });
  });
}

async function storageSave(conversation) {
  const all = await storageGetAll();
  const last = all[all.length - 1];
  if (last && last.url === conversation.url && last.messages.length === conversation.messages.length) {
    all[all.length - 1] = { ...conversation, id: last.id, savedAt: last.savedAt };
  } else {
    all.push(conversation);
  }
  const trimmed = all.slice(-MAX_CONVERSATIONS);
  return new Promise((resolve) => {
    chrome.storage.local.set({ [STORAGE_KEY]: trimmed }, () => resolve());
  });
}

// ── Scraper ───────────────────────────────────────────────────────────────────
function scrapeMessages() {
  const messages = [];
  const now = new Date().toISOString();

  document.querySelectorAll('[data-testid="user-message"], .font-claude-response')
    .forEach((el) => {
      const isUser = el.matches('[data-testid="user-message"]');
      const type = isUser ? "user" : "assistant";

      if (isUser) {
        const content = el.innerText?.trim();
        if (content) messages.push({ type, content, format: "text", timestamp: now });
      } else {
        const parts = [];
        el.querySelectorAll('p, li, h1, h2, h3, pre.code-block__code, [role="group"] pre.code-block__code')
          .forEach((child) => {
            if (child.tagName === "PRE" && child.classList.contains("code-block__code")) {
              const code = child.querySelector("code");
              const lang = child.closest('[role="group"]')?.querySelector(".text-text-500")?.innerText?.trim() || "";
              const c = code?.innerText?.trim() || child.innerText?.trim();
              if (c) parts.push(`\`\`\`${lang}\n${c}\n\`\`\``);
            } else {
              const text = child.innerText?.trim();
              if (text) parts.push(text);
            }
          });
        if (parts.length) messages.push({ type, content: parts.join("\n\n"), format: "text", timestamp: now });
      }
    });

  return messages;
}

// ── Debounced save ────────────────────────────────────────────────────────────
let _debounceTimer = null;

async function scheduleConversationSave() {
  clearTimeout(_debounceTimer);
  _debounceTimer = setTimeout(async () => {
    const rawMessages = scrapeMessages();
    if (!rawMessages.length) return;
    let messages;
    try { messages = await compressConversation(rawMessages); }
    catch { messages = rawMessages; }
    const capsule = Capsule.build(messages, window.location.href);
    try { await storageSave(capsule); }
    catch (err) { console.error("[ContextClaw] save failed:", err); }
  }, 1500);
}

// ── Format context ────────────────────────────────────────────────────────────
function formatContextBlock(conversation) {
  if (!conversation?.messages?.length) return null;
  const lines = [
    `[CONTEXT HANDOFF — Do NOT reply to this message]`,
    ``,
    `The following is the full context of a conversation I was having on Claude.`,
    `Please read and remember this context. Do not respond to it.`,
    `I will send my next message separately to continue the conversation.`,
    ``,
    `--- Conversation: "${conversation.title || "Untitled"}" ---`,
    `Saved: ${new Date(conversation.savedAt).toLocaleString()}`,
    ``,
  ];
  for (const msg of conversation.messages) {
    lines.push(`${msg.type === "user" ? "User" : "Claude"}: ${msg.content}`, "");
  }
  lines.push(
    `--- End of context ---`,
    ``,
    `(Please acknowledge you have read the above context by saying "Got it — context received." ` +
    `Then wait for my next message.)`
  );
  return lines.join("\n");
}


// ── Send to AI ────────────────────────────────────────────────────────────────
async function sendToAI(target) {
  const all = await storageGetAll();
  if (!all.length) { showToast("⚠️ No saved conversations. Click Refresh in the popup first."); return; }

  const conversation = all.slice().reverse().find(c => c.url === window.location.href) || all[all.length - 1];
  const ctx = formatContextBlock(conversation);
  if (!ctx) { showToast("No messages to send."); return; }

  chrome.runtime.sendMessage({ action: "openAIWithContext", target, context: ctx }, (res) => {
    const names = { claude: "Claude", gemini: "Gemini", chatgpt: "ChatGPT", deepseek: "DeepSeek" };
    showToast(res?.ok ? `↗ Opening ${names[target]}…` : "Failed to open tab.");
  });
}

// ── Toast ─────────────────────────────────────────────────────────────────────
function showToast(msg) {
  document.getElementById("cc-toast")?.remove();
  const t = document.createElement("div");
  t.id = "cc-toast";
  t.textContent = msg;
  Object.assign(t.style, {
    position: "fixed", bottom: "90px", left: "50%",
    transform: "translateX(-50%) translateY(6px)",
    background: "#18181b", color: "#fafafa",
    fontFamily: "system-ui, sans-serif", fontSize: "13px", fontWeight: "500",
    padding: "8px 16px", borderRadius: "999px",
    border: "1px solid #3f3f46", boxShadow: "0 4px 20px rgba(0,0,0,0.4)",
    zIndex: "2147483647", pointerEvents: "none", opacity: "0",
    transition: "opacity 0.2s, transform 0.2s", whiteSpace: "nowrap",
  });
  document.body.appendChild(t);
  requestAnimationFrame(() => { t.style.opacity = "1"; t.style.transform = "translateX(-50%) translateY(0)"; });
  setTimeout(() => { t.style.opacity = "0"; setTimeout(() => t.remove(), 250); }, 2800);
}

// ═══════════════════════════════════════════════════════════════════════════════
// ── BUTTON INJECTION ──────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════

const CC_BTN_ID = "cc-ask-ai-btn";
const CC_PANEL_ID = "cc-ask-ai-panel";

const AI_OPTIONS = [
  {
    id: "gemini", label: "Gemini",
    color: "#4285F4", bg: "rgba(66,133,244,0.12)",
    svg: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 2C9.5 7.5 6.5 9.5 2 12c4.5 2.5 7.5 4.5 10 10 2.5-5.5 5.5-7.5 10-10-4.5-2.5-7.5-4.5-10-10z" fill="#4285F4"/>
    </svg>`,
  },
  {
    id: "chatgpt", label: "ChatGPT",
    color: "#10a37f", bg: "rgba(16,163,127,0.12)",
    svg: `<svg width="14" height="14" viewBox="0 0 24 24" fill="#10a37f"><circle cx="12" cy="12" r="10"/><path d="M8 12h8M12 8v8" stroke="white" stroke-width="2" stroke-linecap="round"/></svg>`,
  },
  {
    id: "deepseek", label: "DeepSeek",
    color: "#1A6BFF", bg: "rgba(26,107,255,0.12)",
    svg: `<svg width="14" height="14" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#1A6BFF"/><circle cx="12" cy="12" r="5" fill="white"/><circle cx="12" cy="12" r="2.5" fill="#1A6BFF"/></svg>`,
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
      border: 1px solid hsl(var(--border-300) / 0.45) !important;
      border-radius: 8px !important;
      color: hsl(var(--text-400)) !important;
      cursor: pointer !important;
      font-family: inherit !important;
      font-size: 12px !important;
      font-weight: 600 !important;
      transition: background 0.15s, border-color 0.15s, color 0.15s !important;
      flex-shrink: 0 !important;
      white-space: nowrap !important;
      outline: none !important;
      box-shadow: none !important;
    }
    #cc-ask-ai-btn:hover {
      background: hsl(var(--bg-200)) !important;
      border-color: hsl(var(--border-200)) !important;
      color: hsl(var(--text-200)) !important;
    }
    #cc-ask-ai-btn.active {
      background: hsl(var(--bg-200)) !important;
      border-color: hsl(var(--border-200)) !important;
      color: hsl(var(--text-100)) !important;
    }

    #cc-ask-ai-panel {
      position: fixed !important;
      background: hsl(var(--bg-000)) !important;
      border: 1px solid hsl(var(--border-300) / 0.5) !important;
      border-radius: 14px !important;
      padding: 8px !important;
      box-shadow: 0 8px 32px rgba(0,0,0,0.14), 0 0 0 1px rgba(0,0,0,0.03) !important;
      z-index: 2147483647 !important;
      display: none !important;
      flex-direction: column !important;
      gap: 3px !important;
      min-width: 205px !important;
      font-family: inherit !important;
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
      color: hsl(var(--text-500)) !important;
      text-transform: uppercase !important;
      letter-spacing: 0.8px !important;
      padding: 3px 8px 8px !important;
      border-bottom: 1px solid hsl(var(--border-300) / 0.35) !important;
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
      font-family: inherit !important;
      transition: background 0.12s, transform 0.1s !important;
      text-align: left !important;
    }
    .cc-ai-opt:hover { background: hsl(var(--bg-100)) !important; transform: translateX(2px) !important; }
    .cc-ai-opt:active { transform: scale(0.97) !important; }
    .cc-ai-ico {
      width: 28px !important; height: 28px !important;
      border-radius: 8px !important;
      display: flex !important; align-items: center !important; justify-content: center !important;
      flex-shrink: 0 !important;
    }
    .cc-ai-lbl { font-size: 13px !important; font-weight: 600 !important; color: hsl(var(--text-100)) !important; display:block !important; }
    .cc-ai-sub { font-size: 10px !important; color: hsl(var(--text-500)) !important; display:block !important; margin-top:1px !important; }
    .cc-arr { margin-left: auto !important; color: hsl(var(--text-500)) !important; flex-shrink: 0 !important; }
  `;
  document.head.appendChild(s);
}

// ── Find exact injection point from real Claude DOM ───────────────────────────
// Claude toolbar structure:
//   <div class="relative flex gap-2 w-full items-center">          ← toolbar row
//     <div class="relative flex-1 flex items-center shrink ...">   ← left side
//       <div>                                                       ← wraps + button
//         <button aria-label="Add files, connectors, and more">    ← the + btn
//       <div class="flex flex-row items-center min-w-0 gap-1">     ← chip slot (inject here)
//     <div>                                                         ← model selector
//     <div>                                                         ← voice btn
function findSlot() {
  // 1. Anchor on the + button — most stable identifier
  const plusBtn = document.querySelector('button[aria-label="Add files, connectors, and more"]');
  if (!plusBtn) return null;

  // 2. Its grandparent is the flex-1 container. Find the chip slot inside it.
  const flexContainer = plusBtn.closest('.relative.flex-1') || plusBtn.parentElement?.parentElement;
  if (!flexContainer) return null;

  // 3. The chip slot is a flex row inside that container (after the + button wrapper)
  const chipSlot = flexContainer.querySelector('.flex.flex-row.items-center.min-w-0.gap-1');
  if (chipSlot) return chipSlot;

  // 4. Fallback: insert right after the + button's wrapper div
  const plusWrapper = plusBtn.parentElement;
  return plusWrapper?.parentElement || null;
}

function buildPanel() {
  const panel = document.createElement("div");
  panel.id = CC_PANEL_ID;

  const hdr = document.createElement("div");
  hdr.className = "cc-panel-hdr";
  hdr.textContent = "Send context to";
  panel.appendChild(hdr);

  for (const ai of AI_OPTIONS) {
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
      e.preventDefault(); // prevent input blur
      closePanel();
      sendToAI(ai.id);
    });
    panel.appendChild(opt);
  }

  document.body.appendChild(panel);
  return panel;
}

let _panel = null;
let _panelOpen = false;

function openPanel(btn) {
  if (!_panel) _panel = buildPanel();
  const r = btn.getBoundingClientRect();
  const panelH = 185;
  if (r.top > panelH + 10) {
    _panel.style.bottom = `${window.innerHeight - r.top + 8}px`;
    _panel.style.top = "auto";
  } else {
    _panel.style.top = `${r.bottom + 8}px`;
    _panel.style.bottom = "auto";
  }
  _panel.style.left = `${Math.min(r.left, window.innerWidth - 215)}px`;
  _panel.classList.add("cc-open");
  btn.classList.add("active");
  _panelOpen = true;
}

function closePanel() {
  _panel?.classList.remove("cc-open");
  document.getElementById(CC_BTN_ID)?.classList.remove("active");
  _panelOpen = false;
}

function injectButton() {
  if (document.getElementById(CC_BTN_ID)) return;

  ensureStyles();

  const slot = findSlot();
  if (!slot) return;

  const btn = document.createElement("button");
  btn.id = CC_BTN_ID;
  btn.type = "button";
  btn.title = "Send conversation context to another AI";
  btn.innerHTML = `
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
      <line x1="22" y1="2" x2="11" y2="13"/>
      <polygon points="22 2 15 22 11 13 2 9 22 2"/>
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

  // Insert into chip slot
  slot.appendChild(btn);
}

// ── Message listener ──────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.action === "scrapeNow") { scheduleConversationSave(); sendResponse({ ok: true }); }
  if (message.action === "ping") { sendResponse({ ok: true, url: window.location.href }); }
  return false;
});

// ── MutationObserver ──────────────────────────────────────────────────────────
let _observer = null;

function startObserver() {
  if (_observer) return;
  _observer = new MutationObserver((mutations) => {
    if (mutations.some((m) => m.addedNodes.length > 0 || m.type === "characterData")) {
      scheduleConversationSave();
      if (!document.getElementById(CC_BTN_ID)) setTimeout(injectButton, 300);
    }
  });
  _observer.observe(document.body, { childList: true, subtree: true, characterData: true });
}

// ── Init ──────────────────────────────────────────────────────────────────────
function isConversationPage() {
  return (
    /\/chat\/|\/c\/|\/conversation/.test(window.location.pathname) ||
    /\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/.test(window.location.pathname)
  );
}

let _injectAttempts = 0;
function retryInject() {
  if (document.getElementById(CC_BTN_ID)) return;
  if (_injectAttempts++ > 30) return;
  injectButton();
  if (!document.getElementById(CC_BTN_ID)) setTimeout(retryInject, 400);
}

// ── Pending context injection (receive context from other AIs) ────────────────
function checkAndInjectPendingContext() {
  try {
    chrome.storage.session.get(["pending_context_inject"], (result) => {
      const pending = result["pending_context_inject"];
      if (!pending) return;
      if (pending.target !== "claude" || Date.now() - pending.ts > 60000) return;
      chrome.storage.session.remove(["pending_context_inject"]);

      const context = pending.context;
      let attempts = 0;
      const maxAttempts = 20;

      const poll = setInterval(() => {
        attempts++;
        const el = document.querySelector('div[data-testid="chat-input"][contenteditable="true"]');
        if (el) {
          clearInterval(poll);
          el.focus();
          document.execCommand("selectAll", false, null);
          document.execCommand("delete", false, null);
          document.execCommand("insertText", false, context);
          el.dispatchEvent(new Event("input", { bubbles: true }));
          // Show success banner
          showToast("✓ Context injected — review and send!");
        } else if (attempts >= maxAttempts) {
          clearInterval(poll);
          showToast("⚠️ Could not find Claude input field.");
        }
      }, 500);
    });
  } catch (e) {
    // chrome.storage.session may not be available in all contexts — silently fail
  }
}

function init() {
  checkAndInjectPendingContext();
  if (!isConversationPage()) {
    let last = window.location.href;
    const poll = setInterval(() => {
      if (window.location.href !== last) {
        last = window.location.href;
        if (isConversationPage()) { clearInterval(poll); startObserver(); scheduleConversationSave(); _injectAttempts = 0; retryInject(); }
      }
    }, 800);
    return;
  }
  startObserver();
  scheduleConversationSave();
  _injectAttempts = 0;
  retryInject();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}

// SPA nav
let _lastHref = window.location.href;
const _navObserver = new MutationObserver(() => {
  if (window.location.href !== _lastHref) {
    _lastHref = window.location.href;
    if (_observer) { _observer.disconnect(); _observer = null; }
    document.getElementById(CC_BTN_ID)?.remove();
    document.getElementById(CC_PANEL_ID)?.remove();
    _panel = null; _panelOpen = false;
    init();
  }
});
_navObserver.observe(document.documentElement, { childList: true, subtree: false });

window.__contextClaw = { scrapeNow: scheduleConversationSave, scrapeMessages };