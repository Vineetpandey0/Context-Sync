// injectors/gemini.js
// Runs on gemini.google.com — picks up pending context and injects it into Gemini's input

const PENDING_INJECT_KEY = "pending_context_inject";

async function getPendingContext() {
  return new Promise((resolve) => {
    chrome.storage.session.get([PENDING_INJECT_KEY], (result) => {
      const pending = result[PENDING_INJECT_KEY];
      if (!pending) { resolve(null); return; }
      // Only use if it's fresh (within 30 seconds) and targeting gemini
      if (pending.target !== "gemini" || Date.now() - pending.ts > 30000) {
        resolve(null);
        return;
      }
      // Clear after reading
      chrome.storage.session.remove([PENDING_INJECT_KEY], () => resolve(pending.context));
    });
  });
}

function injectIntoGemini(context) {
  // Gemini uses a rich text editor (div[contenteditable])
  // Multiple selectors to try as Gemini's DOM changes often
  const selectors = [
    "rich-textarea div[contenteditable='true']",
    "div[contenteditable='true'][data-placeholder]",
    ".ql-editor[contenteditable='true']",
    "div[contenteditable='true']",
  ];

  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (el) {
      el.focus();

      // Clear existing content
      el.innerHTML = "";

      // Use execCommand for contenteditable (most reliable cross-browser)
      document.execCommand("selectAll", false, null);
      document.execCommand("delete", false, null);
      document.execCommand("insertText", false, context);

      // Also dispatch input event for React/Angular frameworks
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new InputEvent("input", { bubbles: true, data: context }));

      showInjectionBanner("gemini");
      return true;
    }
  }
  return false;
}

function showInjectionBanner(target) {
  const banner = document.createElement("div");
  Object.assign(banner.style, {
    position: "fixed",
    top: "16px",
    left: "50%",
    transform: "translateX(-50%) translateY(-8px)",
    background: "#18181b",
    color: "#fafafa",
    fontFamily: "'Inter', system-ui, sans-serif",
    fontSize: "13px",
    fontWeight: "500",
    padding: "10px 20px",
    borderRadius: "999px",
    border: "1px solid #3f3f46",
    boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
    zIndex: "999999",
    display: "flex",
    alignItems: "center",
    gap: "8px",
    opacity: "0",
    transition: "opacity 0.2s, transform 0.2s",
    whiteSpace: "nowrap",
  });

  banner.innerHTML = `
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
    Claude context injected — review and send!
  `;

  document.body.appendChild(banner);
  requestAnimationFrame(() => {
    banner.style.opacity = "1";
    banner.style.transform = "translateX(-50%) translateY(0)";
  });

  setTimeout(() => {
    banner.style.opacity = "0";
    banner.style.transform = "translateX(-50%) translateY(-8px)";
    setTimeout(() => banner.remove(), 300);
  }, 4000);
}

// Retry injection with polling (Gemini is a SPA and input may not exist immediately)
async function tryInject() {
  const context = await getPendingContext();
  if (!context) return;

  let attempts = 0;
  const maxAttempts = 30;

  const poll = setInterval(() => {
    attempts++;
    const success = injectIntoGemini(context);
    if (success || attempts >= maxAttempts) {
      clearInterval(poll);
      if (!success) console.warn("[ContextClaw] Gemini: Could not find input after", maxAttempts, "attempts");
    }
  }, 500);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", tryInject);
} else {
  tryInject();
}