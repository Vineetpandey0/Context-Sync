// popup.js — Popup logic for ContextClaw

// ── Helpers ──────────────────────────────────────────────────────────────────

function showToast(msg, durationMs = 2500) {
  const toast = document.getElementById("toast");
  toast.textContent = msg;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), durationMs);
}

function formatDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function estimateSize(conversations) {
  const bytes = new TextEncoder().encode(JSON.stringify(conversations)).length;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

// ── State ────────────────────────────────────────────────────────────────────

let _allConversations = [];
let _searchQuery = "";

// ── Render ────────────────────────────────────────────────────────────────────

function renderConversations(conversations) {
  const listDiv = document.getElementById("conversations-list");
  const emptyState = document.getElementById("empty-state");

  // Update stats
  document.getElementById("conv-count").textContent =
    `${conversations.length} conversation${conversations.length !== 1 ? "s" : ""}`;
  document.getElementById("storage-size").textContent =
    conversations.length ? estimateSize(conversations) : "";

  // Filter by search
  const filtered = _searchQuery
    ? conversations.filter(
        (c) =>
          (c.title || "").toLowerCase().includes(_searchQuery) ||
          (c.url || "").toLowerCase().includes(_searchQuery) ||
          c.messages.some((m) =>
            m.content.toLowerCase().includes(_searchQuery)
          )
      )
    : conversations;

  // Clear cards (keep empty state)
  [...listDiv.querySelectorAll(".conv-card")].forEach((el) => el.remove());

  if (filtered.length === 0) {
    emptyState.style.display = "flex";
    if (_searchQuery) {
      emptyState.querySelector(".empty-title").textContent = "No results";
      emptyState.querySelector(".empty-hint").textContent =
        `No conversations match "${_searchQuery}"`;
    } else {
      emptyState.querySelector(".empty-title").textContent =
        "No conversations saved yet";
      emptyState.querySelector(".empty-hint").innerHTML =
        "Open a Claude conversation and click <strong>Capture</strong>";
    }
    return;
  }

  emptyState.style.display = "none";

  // Render newest first
  [...filtered].reverse().forEach((conv) => {
    const card = buildCard(conv);
    listDiv.appendChild(card);
  });
}

function buildCard(conv) {
  const card = document.createElement("div");
  card.className = "conv-card";
  card.dataset.id = conv.id;

  // Header
  const header = document.createElement("div");
  header.className = "conv-header";

  const meta = document.createElement("div");
  meta.className = "conv-meta";

  const title = document.createElement("div");
  title.className = "conv-title";
  title.textContent = conv.title || "Untitled Conversation";
  title.title = conv.title || "";

  const date = document.createElement("div");
  date.className = "conv-date";
  date.textContent = formatDate(conv.savedAt);

  meta.appendChild(title);
  meta.appendChild(date);

  const badges = document.createElement("div");
  badges.className = "conv-badges";

  const msgBadge = document.createElement("span");
  msgBadge.className = "badge badge-msgs";
  msgBadge.textContent = `${conv.messages.length} msg${conv.messages.length !== 1 ? "s" : ""}`;
  badges.appendChild(msgBadge);

  // Delete button
  const delBtn = document.createElement("button");
  delBtn.className = "btn-icon-only";
  delBtn.title = "Delete this conversation";
  delBtn.textContent = "🗑️";
  delBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    deleteConversation(conv.id);
  });
  badges.appendChild(delBtn);

  header.appendChild(meta);
  header.appendChild(badges);
  card.appendChild(header);

  // Toggle button
  const toggle = document.createElement("button");
  toggle.className = "conv-toggle";
  toggle.innerHTML = `<span class="arrow">▶</span> View ${conv.messages.length} messages`;
  card.appendChild(toggle);

  // Messages panel
  const panel = document.createElement("div");
  panel.className = "messages-panel";
  conv.messages.forEach((msg) => {
    const bubble = document.createElement("div");
    bubble.className = `msg-bubble ${msg.type}`;

    const label = document.createElement("div");
    label.className = "msg-label";
    label.textContent = msg.type === "user" ? "You" : "Claude";
    bubble.appendChild(label);

    const text = document.createElement("div");
    text.textContent =
      msg.content.length > 300
        ? msg.content.substring(0, 300) + "…"
        : msg.content;
    bubble.appendChild(text);

    panel.appendChild(bubble);
  });
  card.appendChild(panel);

  toggle.addEventListener("click", () => {
    const isOpen = panel.classList.toggle("open");
    toggle.classList.toggle("open", isOpen);
    toggle.innerHTML = `<span class="arrow">▶</span> ${isOpen ? "Hide" : "View"} ${conv.messages.length} messages`;
  });

  return card;
}

// ── Data actions ──────────────────────────────────────────────────────────────

function loadConversations() {
  chrome.runtime.sendMessage({ action: "getConversations" }, (response) => {
    if (chrome.runtime.lastError) {
      showToast("⚠️ Failed to load conversations");
      return;
    }
    _allConversations = response.conversations || [];
    renderConversations(_allConversations);
  });
}

function deleteConversation(id) {
  chrome.runtime.sendMessage({ action: "deleteConversation", id }, (response) => {
    if (chrome.runtime.lastError || !response?.success) {
      showToast("⚠️ Delete failed");
      return;
    }
    _allConversations = _allConversations.filter((c) => c.id !== id);
    renderConversations(_allConversations);
    showToast("🗑️ Conversation deleted");
  });
}

function clearAll() {
  const count = _allConversations.length;
  if (count === 0) return;
  if (!confirm(`Delete all ${count} saved conversation${count !== 1 ? "s" : ""}?`)) return;

  chrome.runtime.sendMessage({ action: "clearConversations" }, (response) => {
    if (chrome.runtime.lastError || !response?.success) {
      showToast("⚠️ Clear failed");
      return;
    }
    _allConversations = [];
    renderConversations([]);
    showToast("✅ All conversations cleared");
  });
}

function exportConversations() {
  if (_allConversations.length === 0) {
    showToast("Nothing to export!");
    return;
  }
  const json = JSON.stringify(_allConversations, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `contextclaw_export_${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast("📤 Export started!");
}

function scrapeActiveTab() {
  const btn = document.getElementById("scrape-btn");
  btn.disabled = true;
  btn.innerHTML = `<span class="spinner"></span> Capturing…`;

  chrome.runtime.sendMessage({ action: "scrapeActiveTab" }, (response) => {
    btn.disabled = false;
    btn.innerHTML = `<span class="btn-icon">⚡</span> Capture`;

    if (chrome.runtime.lastError) {
      showToast("⚠️ " + chrome.runtime.lastError.message);
      return;
    }
    if (!response?.ok) {
      showToast("⚠️ " + (response?.error || "Could not capture"));
      return;
    }

    // Reload list after a short delay to let storage settle
    setTimeout(loadConversations, 800);
    showToast("⚡ Capturing conversation…");
  });
}

// ── Search ────────────────────────────────────────────────────────────────────

function handleSearch(e) {
  _searchQuery = e.target.value.trim().toLowerCase();
  const clearBtn = document.getElementById("clear-search");
  clearBtn.classList.toggle("visible", _searchQuery.length > 0);
  renderConversations(_allConversations);
}

// ── Init ──────────────────────────────────────────────────────────────────────

document.addEventListener("DOMContentLoaded", () => {
  loadConversations();

  document.getElementById("scrape-btn").addEventListener("click", scrapeActiveTab);
  document.getElementById("clear-all-btn").addEventListener("click", clearAll);
  document.getElementById("export-btn").addEventListener("click", exportConversations);
  document.getElementById("search-input").addEventListener("input", handleSearch);

  document.getElementById("clear-search").addEventListener("click", () => {
    document.getElementById("search-input").value = "";
    _searchQuery = "";
    document.getElementById("clear-search").classList.remove("visible");
    renderConversations(_allConversations);
  });
});