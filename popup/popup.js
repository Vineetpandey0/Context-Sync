const STORAGE_KEY = "claude_conversations";

document.addEventListener("DOMContentLoaded", init);

function init() {
  bindUI();
  loadAndRender();
}

function bindUI() {
  document.getElementById("export-btn").addEventListener("click", exportAllHandler);
}

function loadAndRender() {
  chrome.storage.local.get([STORAGE_KEY], (res) => {
    const conversations = res[STORAGE_KEY] || [];

    console.log("[POPUP] Loaded:", conversations);

    renderConversations(conversations);
    updateStats(conversations);
  });
}

/* =========================
   RENDERING
========================= */

function renderConversations(conversations) {
  const list = document.getElementById("conversations-list");
  const empty = document.getElementById("empty-state");

  list.innerHTML = "";

  if (!conversations.length) {
    empty.style.display = "flex";
    return;
  }

  empty.style.display = "none";

  conversations
    .sort((a, b) => new Date(b.savedAt) - new Date(a.savedAt))
    .forEach((conv) => {
      const card = createConversationCard(conv);
      list.appendChild(card);
    });
}

function createConversationCard(conv) {
  const card = document.createElement("div");
  card.className = "conv-card";

  /* HEADER */
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

  /* EXPORT BUTTON */
  const exportBtn = document.createElement("button");
  exportBtn.className = "btn-icon-only";
  exportBtn.title = "Export this conversation";
  exportBtn.innerHTML = "📤";

  exportBtn.onclick = (e) => {
    e.stopPropagation();
    exportConversation(conv);
  };

  header.appendChild(meta);
  header.appendChild(badges);
  header.appendChild(exportBtn);

  /* TOGGLE */
  const toggle = document.createElement("button");
  toggle.className = "conv-toggle";
  toggle.innerHTML = `<span class="arrow">▶</span> View messages`;

  /* PANEL */
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
   EXPORT FUNCTIONS
========================= */

function exportConversation(conv) {
  const blob = new Blob(
    [JSON.stringify(conv, null, 2)],
    { type: "application/json" }
  );

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

    if (!conversations.length) return;

    conversations.forEach((conv, index) => {
      setTimeout(() => exportConversation(conv), index * 200);
    });
  });
}

/* =========================
   UTILS
========================= */

function updateStats(conversations) {
  const countEl = document.getElementById("conv-count");
  countEl.textContent = `${conversations.length} conversations`;
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