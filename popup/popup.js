const STORAGE_KEY = "claude_conversations";

document.addEventListener("DOMContentLoaded", init);

function init() {
  loadAndRender();
}

function loadAndRender() {
  chrome.storage.local.get([STORAGE_KEY], (res) => {
    const conversations = res[STORAGE_KEY] || [];

    renderConversations(conversations);
    updateStats(conversations);
  });
}

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

  const header = document.createElement("div");
  header.className = "conv-header";

  header.innerHTML = `
    <div class="conv-meta">
      <div class="conv-title">${escapeHTML(conv.title || "Untitled")}</div>
      <div class="conv-date">${formatDate(conv.savedAt)}</div>
    </div>
    <div class="conv-badges">
      <span class="badge badge-msgs">${conv.messages.length} msgs</span>
    </div>
  `;

  const toggle = document.createElement("button");
  toggle.className = "conv-toggle";
  toggle.innerHTML = `<span class="arrow">▶</span> View messages`;

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

function escapeHTML(str) {
  return str
    ?.replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}