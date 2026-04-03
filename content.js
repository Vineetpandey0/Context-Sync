// content.js — DOM Scraper for Claude.ai
// Watches the page for conversation updates, compresses, and saves them via chrome.storage.


// compressor.js — Gemini 2.5 Flash message compressor
// Pure logic only — NO API key, NO fetch calls.
// All Gemini calls are delegated to background.js via chrome.runtime.sendMessage,
// so the API key never touches this file.

// ── Code-block extraction ─────────────────────────────────────────────────────
// Extracts fenced code blocks before compression so they're never touched.
// Returns { stripped: string, blocks: Array<{placeholder, code}> }
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
/**
 * Compress a single message by asking background.js to call Gemini.
 * Code blocks are extracted here, sent as placeholders, restored after.
 *
 * @param {{ type: "user"|"assistant", content: string, format: string, timestamp: string }} message
 * @returns {Promise<{ ...message, compressed: boolean }>}
 */
async function compressMessage(message) {
  const { content, type } = message;

  // Skip very short messages — not worth a round-trip
  if (!content || content.length < 120) {
    return { ...message, compressed: false };
  }

  const { stripped, blocks } = extractCodeBlocks(content);

  // If there's no prose left after extracting code blocks, skip
  const proseOnly = stripped.replace(/__CODE_BLOCK_\d+__/g, "").trim();
  if (!proseOnly) return { ...message, compressed: false };

  // Ask background.js to call Gemini (key lives only there)
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      { action: "compressMessage", type, content: stripped },
      (response) => {
        if (chrome.runtime.lastError || !response?.ok || !response?.compressed) {
          console.warn("[ContextClaw] compressMessage failed:", chrome.runtime.lastError?.message);
          resolve({ ...message, compressed: false });
          return;
        }
        const compressedContent = restoreCodeBlocks(response.compressed, blocks);
        resolve({ ...message, content: compressedContent, compressed: true });
      }
    );
  });
}

// ── Conversation-level compressor ─────────────────────────────────────────────
/**
 * Compress a full conversation's messages.
 * Rules:
 *   1. Keep only the last 5 user + last 5 assistant messages (interleaved order preserved).
 *   2. Compress each kept message (code blocks untouched).
 *
 * @param {Array<{ type: string, content: string, format: string, timestamp: string }>} messages
 * @returns {Promise<Array<{ type: string, content: string, format: string, timestamp: string, compressed: boolean }>>}
 */
async function compressConversation(messages) {
  // Keep last 5 of each type while preserving interleaved DOM order
  const userMessages    = messages.filter((m) => m.type === "user").slice(-5);
  const assistantMessages = messages.filter((m) => m.type === "assistant").slice(-5);

  const keptUserSet      = new Set(userMessages.map((m) => m.timestamp + m.content.slice(0, 40)));
  const keptAssistantSet = new Set(assistantMessages.map((m) => m.timestamp + m.content.slice(0, 40)));

  const kept = messages.filter((m) => {
    const key = m.timestamp + m.content.slice(0, 40);
    return m.type === "user" ? keptUserSet.has(key) : keptAssistantSet.has(key);
  });

  // Compress all kept messages in parallel
  const compressed = await Promise.all(kept.map((msg) => compressMessage(msg)));
  return compressed;
}





// ── Capsule ───────────────────────────────────────────────────────────────────
const Capsule = {
  build(messages, url) {
    const title = this._inferTitle(messages, url);
    return {
      id: `conv_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      title,
      url,
      messages,
      savedAt: new Date().toISOString(),
      version: 1,
    };
  },
  _inferTitle(messages, url) {
    const firstUser = messages.find((m) => m.type === "user");
    if (firstUser && firstUser.content.length > 0) {
      return (
        firstUser.content.substring(0, 60).replace(/\n/g, " ").trim() +
        (firstUser.content.length > 60 ? "…" : "")
      );
    }
    try {
      const u = new URL(url);
      const parts = u.pathname.split("/").filter(Boolean);
      return parts[parts.length - 1] || "Untitled Conversation";
    } catch {
      return "Untitled Conversation";
    }
  },
};

// ── Storage ───────────────────────────────────────────────────────────────────
const STORAGE_KEY = "claude_conversations";
const MAX_CONVERSATIONS = 50;

function storageGetAll() {
  return new Promise((resolve) => {
    chrome.storage.local.get([STORAGE_KEY], (result) => {
      if (chrome.runtime.lastError) {
        console.warn("[ContextClaw] read error:", chrome.runtime.lastError.message);
        resolve([]);
        return;
      }
      resolve(result[STORAGE_KEY] || []);
    });
  });
}

async function storageSave(conversation) {
  const all = await storageGetAll();

  // De-duplicate: update last entry if same URL + same message count
  const last = all[all.length - 1];
  if (
    last &&
    last.url === conversation.url &&
    last.messages.length === conversation.messages.length
  ) {
    all[all.length - 1] = { ...conversation, id: last.id, savedAt: last.savedAt };
  } else {
    all.push(conversation);
  }

  const trimmed = all.slice(-MAX_CONVERSATIONS);

  return new Promise((resolve) => {
    chrome.storage.local.set({ [STORAGE_KEY]: trimmed }, () => {
      if (chrome.runtime.lastError) {
        console.warn("[ContextClaw] write error:", chrome.runtime.lastError.message);
      }
      resolve();
    });
  });
}

// ── Scraper ───────────────────────────────────────────────────────────────────
/**
 * Scrape all visible messages from the Claude.ai conversation DOM.
 *
 * User messages:    <div data-testid="user-message"> … </div>
 * Assistant turns:  .font-claude-response
 */
function scrapeMessages() {
  const messages = [];
  const now = new Date().toISOString();

  const allElements = document.querySelectorAll(
    '[data-testid="user-message"], .font-claude-response'
  );

  allElements.forEach((el) => {
    const isUser = el.matches('[data-testid="user-message"]');
    const type = isUser ? "user" : "assistant";

    if (isUser) {
      const content = el.innerText?.trim();
      if (content) {
        messages.push({ type, content, format: "text", timestamp: now });
      }
    } else {
      const parts = [];
      el.querySelectorAll(
        'p, li, h1, h2, h3, pre.code-block__code, [role="group"] pre.code-block__code'
      ).forEach((child) => {
        if (
          child.tagName === "PRE" &&
          child.classList.contains("code-block__code")
        ) {
          const code = child.querySelector("code");
          const lang =
            child
              .closest('[role="group"]')
              ?.querySelector(".text-text-500")
              ?.innerText?.trim() || "";
          const content = code?.innerText?.trim() || child.innerText?.trim();
          if (content) parts.push(`\`\`\`${lang}\n${content}\n\`\`\``);
        } else {
          const text = child.innerText?.trim();
          if (text) parts.push(text);
        }
      });

      if (parts.length) {
        messages.push({
          type,
          content: parts.join("\n\n"),
          format: "text",
          timestamp: now,
        });
      }
    }
  });

  return messages;
}

// ── Debounced save ────────────────────────────────────────────────────────────
let _debounceTimer = null;
const DEBOUNCE_MS = 1500;

async function scheduleConversationSave() {
  clearTimeout(_debounceTimer);
  _debounceTimer = setTimeout(async () => {
    const rawMessages = scrapeMessages();
    if (rawMessages.length === 0) return;

    // ── Compress before saving ────────────────────────────────────────────────
    let messages;
    try {
      messages = await compressConversation(rawMessages);
      
    } catch (err) {
      console.warn("[ContextClaw] Compression pipeline failed, using raw:", err);
      messages = rawMessages;
    }

    const capsule = Capsule.build(messages, window.location.href);

    try {
      await storageSave(capsule);
      
    } catch (err) {
      console.error("[ContextClaw] ❌ Failed to save:", err);
    }
  }, DEBOUNCE_MS);
}

// ── Message listener (from popup / background) ────────────────────────────────
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.action === "scrapeNow") {
    scheduleConversationSave();
    sendResponse({ ok: true });
  }
  if (message.action === "ping") {
    sendResponse({ ok: true, url: window.location.href });
  }
  return false;
});

// ── MutationObserver ──────────────────────────────────────────────────────────
let _observer = null;

function startObserver() {
  if (_observer) return;

  _observer = new MutationObserver((mutations) => {
    const relevant = mutations.some(
      (m) => m.addedNodes.length > 0 || m.type === "characterData"
    );
    if (relevant) scheduleConversationSave();
  });

  _observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
  });

}

// ── Init ──────────────────────────────────────────────────────────────────────
function isConversationPage() {
  return (
    /\/chat\/|\/c\/|\/conversation/.test(window.location.pathname) ||
    /\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/.test(
      window.location.pathname
    )
  );
}

function init() {
  if (!isConversationPage()) {
    let lastUrl = window.location.href;
    const urlPoller = setInterval(() => {
      if (window.location.href !== lastUrl) {
        lastUrl = window.location.href;
        if (isConversationPage()) {
          clearInterval(urlPoller);
          startObserver();
          scheduleConversationSave();
        }
      }
    }, 800);
    return;
  }
  startObserver();
  scheduleConversationSave();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}

// SPA navigation detection
let _lastHref = window.location.href;
const _navObserver = new MutationObserver(() => {
  if (window.location.href !== _lastHref) {
    _lastHref = window.location.href;
    if (_observer) {
      _observer.disconnect();
      _observer = null;
    }
    init();
  }
});

_navObserver.observe(document.documentElement, {
  childList: true,
  subtree: false,
});

// DevTools hook
window.__contextClaw = {
  scrapeNow: scheduleConversationSave,
  scrapeMessages,
};