// content.js — DOM Scraper for Claude.ai
// Watches the page for conversation updates and saves them via background.js

// ─── Inline the lib modules here (web-accessible-resources can't be require()'d
//     directly in Manifest V3 content scripts unless injected, so we inline them)

// ── Compressor ──────────────────────────────────────────────────────────────
const Compressor = {
  compress(messages, maxPerMessage = 2000) {
    return messages.map((msg) => ({
      type: msg.type,
      content:
        msg.content.length > maxPerMessage
          ? msg.content.substring(0, maxPerMessage) + "…"
          : msg.content,
      timestamp: msg.timestamp,
    }));
  },
};

// ── Capsule ──────────────────────────────────────────────────────────────────
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
      return firstUser.content
        .substring(0, 60)
        .replace(/\n/g, " ")
        .trim() + (firstUser.content.length > 60 ? "…" : "");
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

// ── Storage (via chrome.storage.local) ───────────────────────────────────────
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

// ─── Scraper ─────────────────────────────────────────────────────────────────

/**
 * Scrape all visible messages from the Claude.ai conversation DOM.
 * Claude.ai uses a rich React SPA — selectors target semantic roles and
 * data attributes that are stable across minor UI updates.
 *
 * User messages:    <div data-testid="user-message"> … </div>
 * Assistant turns:  <div data-testid="assistant-message"> … </div>
 *
 * Fallback: any element with role="presentation" or role="row" inside a
 * scrollable conversation container.
 */
function scrapeMessages() {
  const messages = [];
  const now = new Date().toISOString();

  // Get all top-level message containers in DOM order
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
      // For assistant messages, walk through child elements to capture text + code blocks in order
      const parts = [];

      el.querySelectorAll('p, li, h1, h2, h3, pre.code-block__code, [role="group"] pre.code-block__code').forEach((child) => {
        if (child.tagName === 'PRE' && child.classList.contains('code-block__code')) {
          const code = child.querySelector('code');
          const lang = child.closest('[role="group"]')?.querySelector('.text-text-500')?.innerText?.trim() || '';
          const content = code?.innerText?.trim() || child.innerText?.trim();
          if (content) parts.push(`\`\`\`${lang}\n${content}\n\`\`\``);
        } else {
          const text = child.innerText?.trim();
          if (text) parts.push(text);
        }
      });

      if (parts.length) {
        messages.push({ type, content: parts.join('\n\n'), format: "text", timestamp: now });
      }
    }
  });

  return messages;
}

// ─── Debounced save ────────────────────────────────────────────────────────

let _debounceTimer = null;
const DEBOUNCE_MS = 1500; // wait 1.5 s after last DOM change before saving

function scheduleConversationSave() {
  clearTimeout(_debounceTimer);
  _debounceTimer = setTimeout(async () => {
    const messages = scrapeMessages();
    if (messages.length === 0) return;

    const compressed = Compressor.compress(messages);
    const capsule = Capsule.build(compressed, window.location.href);

    try {
      await storageSave(capsule);
      console.log(
        `[ContextClaw] ✅ Saved conversation "${capsule.title}" (${messages.length} messages)`
      );
    } catch (err) {
      console.error("[ContextClaw] ❌ Failed to save:", err);
    }
  }, DEBOUNCE_MS);
}

// ─── Respond to manual scrape requests from popup ─────────────────────────

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.action === "scrapeNow") {
    scheduleConversationSave();
    sendResponse({ ok: true });
  }
  if (message.action === "ping") {
    sendResponse({ ok: true, url: window.location.href });
  }
  return false; // no async response needed here
});

// ─── MutationObserver ────────────────────────────────────────────────────────

let _observer = null;

function startObserver() {
  if (_observer) return;

  _observer = new MutationObserver((mutations) => {
    // Only react to meaningful changes (added nodes with text content)
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

  console.log("[ContextClaw] 👁️ Observer started on", window.location.href);
}

// ─── Init ─────────────────────────────────────────────────────────────────────

// Only run on actual conversation pages (not the home / new chat page)
function isConversationPage() {
  return /\/chat\/|\/c\/|\/conversation/.test(window.location.pathname) ||
    // Claude.ai sometimes uses the path /<uuid>
    /\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/.test(
      window.location.pathname
    );
}

function init() {
  if (!isConversationPage()) {
    // Still watch for URL changes via a lightweight poll (SPA navigation)
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

// Run after the DOM is interactive
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}

// Also handle SPA navigation (claude.ai pushes history changes)
let _lastHref = window.location.href;
const _navObserver = new MutationObserver(() => {
  if (window.location.href !== _lastHref) {
    _lastHref = window.location.href;
    console.log("[ContextClaw] 🔄 Navigation detected:", _lastHref);
    // Re-init on navigation
    if (_observer) {
      _observer.disconnect();
      _observer = null;
    }
    init();
  }
});

_navObserver.observe(document.documentElement, { childList: true, subtree: false });

// Expose manual trigger for DevTools debugging
window.__contextClaw = {
  scrapeNow: scheduleConversationSave,
  scrapeMessages,
};