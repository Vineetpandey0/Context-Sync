// background.js

const STORAGE_KEY = "claude_conversations";
const PENDING_INJECT_KEY = "pending_context_inject";

const GEMINI_API_KEY = ""; // keep as is
const GEMINI_API_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";

// ── Gemini API call ─────────────────────────────────────────────
async function callGemini(systemPrompt, userPrompt) {
  if (!GEMINI_API_KEY) {
    throw new Error("No Gemini API key");
  }

  const res = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: "user", parts: [{ text: userPrompt }] }],
      generationConfig: { temperature: 0.1, maxOutputTokens: 1024 },
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(errText);
  }

  const data = await res.json();
  return data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || null;
}

// ── AI target URLs ──────────────────────────────────────────────
const AI_URLS = {
  claude:   "https://claude.ai/new",
  gemini:   "https://gemini.google.com/app",
  chatgpt:  "https://chatgpt.com/",
  deepseek: "https://chat.deepseek.com/",
};

// ── Message listener ────────────────────────────────────────────
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.action) {

    // ── Compress a single message via Gemini ──────────────────────
    case "compressMessage": {
      const { type, content } = message;

      const systemPrompt =
        type === "assistant"
          ? "Compress assistant message (technical, lossless)."
          : "Compress user message (preserve intent).";

      callGemini(systemPrompt, content)
        .then((compressed) => {
          sendResponse({ ok: true, compressed: compressed || content });
        })
        .catch((err) => {
          sendResponse({ ok: false, compressed: null, error: err.message });
        });

      return true;
    }

    // ── Scrape active Claude tab ──────────────────────────────────
    case "scrapeActiveTab": {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const tab = tabs[0];

        if (!tab || !tab.url || !tab.url.includes("claude.ai")) {
          sendResponse({ ok: false, error: "No Claude tab" });
          return;
        }

        chrome.tabs.sendMessage(tab.id, { action: "scrapeNow" }, (response) => {
          if (chrome.runtime.lastError) {
            sendResponse({ ok: false, error: chrome.runtime.lastError.message });
            return;
          }
          sendResponse({ ok: true, response });
        });
      });

      return true;
    }

    // ── Open target AI with context injected ─────────────────────
    case "openAIWithContext": {
      const { target, context } = message;

      if (!AI_URLS[target]) {
        sendResponse({ ok: false, error: "Unknown AI target" });
        return true;
      }

      // Store the pending context so the injector content script can pick it up
      // Using chrome.storage.local (not .session) for reliable cross-context access in MV3
      chrome.storage.local.set({ [PENDING_INJECT_KEY]: { target, context, ts: Date.now() } }, () => {
        chrome.tabs.create({ url: AI_URLS[target] }, (tab) => {
          sendResponse({ ok: true, tabId: tab.id });
        });
      });

      return true;
    }

    default:
      break;
  }
});