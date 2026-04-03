const STORAGE_KEY = "claude_conversations";

document.addEventListener("DOMContentLoaded", init);

function init() {
  bindUI();
  loadAndRender();
}

function bindUI() {
  // Export all
  document.getElementById("export-btn").addEventListener("click", exportAllHandler);

  // ── Refresh (scrape active Claude tab) ──────────────────────────────────
  document.getElementById("scrape-btn").addEventListener("click", () => {
    setRefreshLoading(true);

    chrome.runtime.sendMessage({ action: "scrapeActiveTab" }, (response) => {
      setTimeout(() => {
        loadAndRender();
        setRefreshLoading(false);
        showToast(response?.ok ? "✓ Conversation refreshed" : "⚠️ Could not scrape tab");
      }, 2000);
    });
  });

  // ── Clear all ────────────────────────────────────────────────────────────
  document.getElementById("clear-all-btn").addEventListener("click", () => {
    chrome.storage.local.set({ [STORAGE_KEY]: [] }, () => {
      _allConversations = [];
      loadAndRender();
      showToast("🗑️ All conversations cleared");
    });
  });

  // ── Search ───────────────────────────────────────────────────────────────
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

// ── Refresh button loading state ─────────────────────────────────────────────
function setRefreshLoading(loading) {
  const btn = document.getElementById("scrape-btn");
  const label = btn.querySelector(".btn-label");
  const iconWrap = btn.querySelector(".btn-icon");

  if (loading) {
    btn.disabled = true;
    btn.style.opacity = "0.7";
    btn.style.cursor = "not-allowed";
    if (iconWrap) iconWrap.innerHTML = `<span class="spinner"></span>`;
    if (label) label.textContent = "Refreshing…";
  } else {
    btn.disabled = false;
    btn.style.opacity = "";
    btn.style.cursor = "";
    if (iconWrap) iconWrap.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24"
        fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M4 4v5h16V4M4 12v5h16v-5M4 20v-5h16v5" />
      </svg>`;
    if (label) label.textContent = "Refresh";
  }
}

function loadAndRender() {
  chrome.storage.local.get([STORAGE_KEY], (res) => {
    const conversations = res[STORAGE_KEY] || [];
    renderConversations(conversations);
  });
}

/* =========================
   SEARCH / FILTER
========================= */
let _allConversations = [];

function filterConversations(query) {
  if (!query) {
    renderConversations(_allConversations);
    return;
  }
  const q = query.toLowerCase();
  const filtered = _allConversations.filter(
    (c) =>
      (c.title || "").toLowerCase().includes(q) ||
      c.messages.some((m) => m.content?.toLowerCase().includes(q))
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
  updateStats(isFiltered ? _allConversations : conversations);

  if (!conversations.length) {
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

  /* ── HEADER ── */
  const header = document.createElement("div");
  header.className = "conv-header";

  const meta = document.createElement("div");
  meta.className = "conv-meta";
  meta.innerHTML = `
    <div class="conv-title">${escapeHTML(conv.title || "Untitled")}</div>
    <div class="conv-date">${formatDate(conv.savedAt)}</div>
  `;

  const badges = document.createElement("div");
  badges.className = "conv-badges";
  badges.innerHTML = `<span class="badge badge-msgs">${conv.messages.length} msgs</span>`;

  /* ── EXPORT BUTTON ── */
  const exportBtn = document.createElement("button");
  exportBtn.className = "btn-icon-only";
  exportBtn.title = "Export this conversation";
  exportBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M12 3v12"/><path d="m7 10 5 5 5-5"/>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
  </svg>`;
  exportBtn.style.color = "var(--text-3)";
  exportBtn.onclick = (e) => {
    e.stopPropagation();
    exportConversation(conv);
  };

  /* ── DELETE BUTTON ── */
  const deleteBtn = document.createElement("button");
  deleteBtn.className = "btn-icon-only delete-btn";
  deleteBtn.title = "Delete this conversation";
  deleteBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <polyline points="3 6 5 6 21 6"/>
    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
    <path d="M10 11v6"/><path d="M14 11v6"/>
    <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
  </svg>`;
  deleteBtn.onclick = (e) => {
    e.stopPropagation();
    deleteConversation(conv.id, card);
  };

  header.appendChild(meta);
  header.appendChild(badges);
  header.appendChild(exportBtn);
  header.appendChild(deleteBtn);

  /* ── TOGGLE ── */
  const toggle = document.createElement("button");
  toggle.className = "conv-toggle";
  toggle.innerHTML = `<span class="arrow">▶</span> View messages`;

  /* ── MESSAGES PANEL ── */
  const panel = document.createElement("div");
  panel.className = "messages-panel";

  conv.messages.forEach((msg) => {
    const bubble = document.createElement("div");
    bubble.className = `msg-bubble ${msg.type}`;
    bubble.innerHTML = `
      <div class="msg-label">${msg.type}</div>
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
      // Animate card out
      cardEl.style.transition = "opacity 0.18s, transform 0.18s";
      cardEl.style.opacity = "0";
      cardEl.style.transform = "translateX(8px)";
      setTimeout(() => {
        cardEl.remove();
        _allConversations = updated;
        updateStats(updated);

        const list = document.getElementById("conversations-list");
        if (!list.querySelector(".conv-card")) {
          document.getElementById("empty-state").style.display = "flex";
        }
      }, 180);

      showToast("🗑️ Conversation deleted");
    });
  });
}

/* =========================
   EXPORT FUNCTIONS
========================= */

function exportConversation(conv) {
  const blob = new Blob([JSON.stringify(conv, null, 2)], {
    type: "application/json",
  });
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
    if (!conversations.length) {
      showToast("Nothing to export");
      return;
    }
    exportConversation({ title: "all_conversations", data: conversations });
  });
}

/* =========================
   TOAST
========================= */

function showToast(msg, duration = 2200) {
  const toast = document.getElementById("toast");
  toast.textContent = msg;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), duration);
}

/* =========================
   UTILS
========================= */

function updateStats(conversations) {
  const countEl = document.getElementById("conv-count");
  countEl.textContent = `${conversations.length} conversation${conversations.length !== 1 ? "s" : ""}`;
}

function formatDate(dateStr) {
  try {
    return new Date(dateStr).toLocaleString();
  } catch {
    return "Unknown date";
  }
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