// background.js — DEBUG VERSION

const STORAGE_KEY = "claude_conversations";

const GEMINI_API_KEY = "AIzaSyC8eLv-AxJ7kpylPuD8ckDD0g8L9yDlRzM"; // keep as is for now
const GEMINI_API_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";

// ── Gemini call with logs ───────────────────────────────────────
async function callGemini(systemPrompt, userPrompt) {

  if (!GEMINI_API_KEY) {
    console.warn("[BG] ❌ No API key set");
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

  // console.log("[BG] 📥 Response status:", res.status);

  if (!res.ok) {
    const errText = await res.text();
    console.error("[BG] ❌ Gemini API error:", errText);
    throw new Error(errText);
  }

  const data = await res.json();

  // console.log("[BG] 📦 Gemini raw response:", data);

  const text =
    data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || null;

  // console.log("[BG] ✅ Extracted text:", text);

  return text;
}

// ── Message listener ────────────────────────────────────────────
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // // console.log("[BG] 📩 Message received:", message);

  switch (message.action) {
    case "compressMessage": {
      const { type, content } = message;

        // console.log("[BG] ⚙️ compressMessage triggered");
        // console.log("[BG] type:", type);
        // console.log("[BG] content length:", content?.length);

      const systemPrompt =
        type === "assistant"
          ? "Compress assistant message (technical, lossless)."
          : "Compress user message (preserve intent).";

      const userPrompt = content;

      callGemini(systemPrompt, userPrompt)
        .then((compressed) => {
          // console.log("[BG] ✅ Compression success:", compressed);

          sendResponse({
            ok: true,
            compressed: compressed || content, // fallback
          });
        })
        .catch((err) => {
          // console.error("[BG] ❌ Compression failed:", err.message);

          sendResponse({
            ok: false,
            compressed: null,
            error: err.message,
          });
        });

      return true; // IMPORTANT
    }

    case "scrapeActiveTab": {
      // console.log("[BG] 🔍 scrapeActiveTab triggered");

      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const tab = tabs[0];

        // console.log("[BG] Active tab:", tab);

        if (!tab || !tab.url || !tab.url.includes("claude.ai")) {
          // console.warn("[BG] ❌ No valid Claude tab");

          sendResponse({ ok: false, error: "No Claude tab" });
          return;
        }

        chrome.tabs.sendMessage(tab.id, { action: "scrapeNow" }, (response) => {
          if (chrome.runtime.lastError) {
            // console.error("[BG] ❌ sendMessage error:", chrome.runtime.lastError.message);

            sendResponse({
              ok: false,
              error: chrome.runtime.lastError.message,
            });
            return;
          }

          console.log("[BG] ✅ scrapeNow response:", response);

          sendResponse({ ok: true, response });
        });
      });

      return true;
    }

    default:
      // console.warn("[BG] ⚠️ Unknown action:", message.action);
      break;
  }
});