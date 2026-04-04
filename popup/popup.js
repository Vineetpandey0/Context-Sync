const STORAGE_KEY = "claude_conversations";

// ── AI source label config ─────────────────────────────────────────────────────
const AI_META = {
  claude:   { label: "Claude",   cls: "claude" },
  gemini:   { label: "Gemini",   cls: "gemini" },
  chatgpt:  { label: "ChatGPT",  cls: "chatgpt" },
  deepseek: { label: "DeepSeek", cls: "deepseek" },
};

// ── AI site hostnames — used to detect "current" conversation ─────────────────
const AI_HOSTS = {
  "claude.ai":          "claude",
  "gemini.google.com":  "gemini",
  "chatgpt.com":        "chatgpt",
  "chat.deepseek.com":  "deepseek",
};

document.addEventListener("DOMContentLoaded", init);

function init() {
  bindUI();

  // First scrape the currently active AI tab (if any), then render
  // This makes the popup always show the LIVE conversation from the current page
  chrome.runtime.sendMessage({ action: "scrapeActiveTab" }, () => {
    // Ignore errors — unsupported tabs just skip scraping gracefully
    if (chrome.runtime.lastError) { /* not a supported page */ }
    loadAndRender();
  });
}

function bindUI() {
  document.getElementById("export-btn").addEventListener("click", exportAllHandler);

  document.getElementById("clear-all-btn").addEventListener("click", () => {
    chrome.storage.local.set({ [STORAGE_KEY]: [] }, () => {
      loadAndRender();
      showToast("Cleared all conversations");
    });
  });

  const searchInput = document.getElementById("search-input");
  const clearSearch = document.getElementById("clear-search");

  searchInput.addEventListener("input", () => {
    const q = searchInput.value.trim();
    clearSearch.classList.toggle("visible", q.length > 0);
    filterConversations(q);
  });

  clearSearch.addEventListener("click", () => {
    searchInput.value = "";
    clearSearch.classList.remove("visible");
    filterConversations("");
  });
}

// ── Load & filter: only show current-tab convo + exported ones ────────────────
function loadAndRender() {
  chrome.storage.local.get([STORAGE_KEY], (res) => {
    const all = res[STORAGE_KEY] || [];

    // Get the active tab URL to detect which AI is currently open
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const activeUrl = tabs[0]?.url || "";
      const activeHost = getHostKey(activeUrl);

      // Keep a conversation if:
      //  1. It matches the current active AI tab's host (current session)
      //  2. Or it has source = a different AI (meaning it was exported from another AI)
      //  3. Or it was explicitly tagged as exported
      const relevant = all.filter((c) => {
        const src = c.source || detectSource(c.url);
        // Always show if it's from the current active AI
        if (activeHost && src === activeHost) return true;
        // Always show if it has a source (was exported/scraped from an AI)
        if (src) return true;
        // Show Claude conversations (default — content.js always sets source)
        return true;
      });

      renderConversations(relevant);
      updateStats(relevant);
    });
  });
}

// Derive AI source key from a URL
function detectSource(url) {
  if (!url) return null;
  try {
    const host = new URL(url).hostname;
    return AI_HOSTS[host] || null;
  } catch { return null; }
}

// Return the AI source key for the currently active tab
function getHostKey(url) {
  return detectSource(url);
}

/* =========================
   SEARCH / FILTER
========================= */
let _allConversations = [];

function filterConversations(query) {
  if (!query) { renderConversations(_allConversations); return; }
  const q = query.toLowerCase();
  const filtered = _allConversations.filter(
    (c) =>
      (c.title || "").toLowerCase().includes(q) ||
      c.messages?.some((m) => m.content?.toLowerCase().includes(q))
  );
  renderConversations(filtered, true);
}

/* =========================
   RENDERING
========================= */

function renderConversations(conversations, isFiltered = false) {
  if (!isFiltered) _allConversations = conversations;

  const list = document.getElementById("conversations-list");
  const empty = document.getElementById("empty-state");

  list.innerHTML = "";

  if (!conversations.length) {
    list.appendChild(empty);
    empty.style.display = "flex";
    return;
  }

  empty.style.display = "none";

  conversations
    .slice()
    .sort((a, b) => new Date(b.savedAt) - new Date(a.savedAt))
    .forEach((conv) => {
      const card = createConversationCard(conv);
      list.appendChild(card);
    });
}

function createConversationCard(conv) {
  const card = document.createElement("div");
  card.className = "conv-card";

  // Resolve AI source
  const src = conv.source || detectSource(conv.url) || "unknown";
  const aiMeta = AI_META[src] || { label: src.charAt(0).toUpperCase() + src.slice(1), cls: "unknown" };

  /* ── HEADER ── */
  const header = document.createElement("div");
  header.className = "conv-header";

  const meta = document.createElement("div");
  meta.className = "conv-meta";

  const topRow = document.createElement("div");
  topRow.className = "conv-top-row";

  const titleEl = document.createElement("div");
  titleEl.className = "conv-title";
  titleEl.textContent = conv.title || "Untitled";
  titleEl.title = conv.title || "Untitled";

  // AI source badge
  const badge = document.createElement("span");
  badge.className = `ai-badge ${aiMeta.cls}`;
  badge.textContent = aiMeta.label;

  topRow.appendChild(titleEl);
  topRow.appendChild(badge);

  const dateEl = document.createElement("div");
  dateEl.className = "conv-date";
  dateEl.textContent = formatDate(conv.savedAt);

  meta.appendChild(topRow);
  meta.appendChild(dateEl);

  /* ── ACTION BUTTONS ── */
  const actions = document.createElement("div");
  actions.className = "card-actions";

  const exportBtn = document.createElement("button");
  exportBtn.className = "btn-icon-only";
  exportBtn.title = "Download as JSON";
  exportBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M12 3v12"/><path d="m7 10 5 5 5-5"/>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
  </svg>`;
  exportBtn.onclick = (e) => { e.stopPropagation(); exportConversation(conv); };

  const deleteBtn = document.createElement("button");
  deleteBtn.className = "btn-icon-only delete-btn";
  deleteBtn.title = "Delete";
  deleteBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <polyline points="3 6 5 6 21 6"/>
    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
    <path d="M10 11v6"/><path d="M14 11v6"/>
  </svg>`;
  deleteBtn.onclick = (e) => { e.stopPropagation(); deleteConversation(conv.id, card); };

  actions.appendChild(exportBtn);
  actions.appendChild(deleteBtn);

  header.appendChild(meta);
  header.appendChild(actions);

  /* ── TOGGLE ── */
  const msgCount = conv.messages?.length || 0;
  const toggle = document.createElement("button");
  toggle.className = "conv-toggle";
  toggle.innerHTML = `<span class="arrow">▶</span> ${msgCount} message${msgCount !== 1 ? "s" : ""}`;

  /* ── MESSAGES PANEL ── */
  const panel = document.createElement("div");
  panel.className = "messages-panel";

  (conv.messages || []).forEach((msg) => {
    const bubble = document.createElement("div");
    bubble.className = `msg-bubble ${msg.type}`;
    bubble.innerHTML = `
      <div class="msg-label">${msg.type === "user" ? "You" : aiMeta.label}</div>
      <div>${escapeHTML(msg.content)}</div>
    `;
    panel.appendChild(bubble);
  });

  toggle.addEventListener("click", () => {
    panel.classList.toggle("open");
    toggle.classList.toggle("open");
  });

  card.appendChild(header);
  card.appendChild(toggle);
  card.appendChild(panel);

  return card;
}

/* =========================
   DELETE
========================= */

function deleteConversation(id, cardEl) {
  chrome.storage.local.get([STORAGE_KEY], (res) => {
    const conversations = res[STORAGE_KEY] || [];
    const updated = conversations.filter((c) => c.id !== id);

    chrome.storage.local.set({ [STORAGE_KEY]: updated }, () => {
      cardEl.style.transition = "opacity 0.15s, transform 0.15s";
      cardEl.style.opacity = "0";
      cardEl.style.transform = "translateX(6px)";
      setTimeout(() => {
        cardEl.remove();
        _allConversations = updated;
        updateStats(updated);
        const list = document.getElementById("conversations-list");
        if (!list.querySelector(".conv-card")) {
          const empty = document.getElementById("empty-state");
          empty.style.display = "flex";
          list.appendChild(empty);
        }
      }, 150);
      showToast("Conversation deleted");
    });
  });
}

/* =========================
   EXPORT
========================= */

function exportConversation(conv) {
  const blob = new Blob([JSON.stringify(conv, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${sanitize(conv.title || "conversation")}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function exportAllHandler() {
  chrome.storage.local.get([STORAGE_KEY], (res) => {
    const conversations = res[STORAGE_KEY] || [];
    if (!conversations.length) { showToast("Nothing to export"); return; }
    exportConversation({ title: "all_conversations", data: conversations });
  });
}

/* =========================
   UTILS
========================= */

function updateStats(conversations) {
  document.getElementById("conv-count").textContent =
    `${conversations.length} conversation${conversations.length !== 1 ? "s" : ""}`;
}

function showToast(msg, duration = 2000) {
  const toast = document.getElementById("toast");
  toast.textContent = msg;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), duration);
}

function formatDate(dateStr) {
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) +
      " · " + d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  } catch { return ""; }
}

function sanitize(str) {
  return str.replace(/[^\w\d]+/g, "_").slice(0, 50);
}

function escapeHTML(str) {
  if (!str) return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}