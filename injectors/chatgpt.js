// injectors/chatgpt.js
// Runs on chatgpt.com — picks up pending context and injects it into ChatGPT's input

const PENDING_INJECT_KEY = "pending_context_inject";

async function getPendingContext() {
  return new Promise((resolve) => {
    chrome.storage.session.get([PENDING_INJECT_KEY], (result) => {
      const pending = result[PENDING_INJECT_KEY];
      if (!pending) { resolve(null); return; }
      if (pending.target !== "chatgpt" || Date.now() - pending.ts > 30000) {
        resolve(null);
        return;
      }
      chrome.storage.session.remove([PENDING_INJECT_KEY], () => resolve(pending.context));
    });
  });
}

function injectIntoChatGPT(context) {
  // ChatGPT uses a contenteditable div (ProseMirror)
  const selectors = [
    "#prompt-textarea",
    "div[contenteditable='true'][data-id='root']",
    "div.ProseMirror[contenteditable='true']",
    "div[contenteditable='true']",
    "textarea[data-id]",
    "textarea",
  ];

  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (!el) continue;

    el.focus();

    if (el.tagName === "TEXTAREA") {
      // Native input value setter for React
      const nativeSetter = Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype,
        "value"
      )?.set;
      if (nativeSetter) {
        nativeSetter.call(el, context);
        el.dispatchEvent(new Event("input", { bubbles: true }));
      } else {
        el.value = context;
        el.dispatchEvent(new Event("input", { bubbles: true }));
      }
    } else {
      // contenteditable (ProseMirror)
      el.innerHTML = "";
      document.execCommand("selectAll", false, null);
      document.execCommand("delete", false, null);
      document.execCommand("insertText", false, context);
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new InputEvent("input", { bubbles: true, data: context }));
    }

    showInjectionBanner();
    return true;
  }

  return false;
}

function showInjectionBanner() {
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

async function tryInject() {
  const context = await getPendingContext();
  if (!context) return;

  let attempts = 0;
  const maxAttempts = 30;

  const poll = setInterval(() => {
    attempts++;
    const success = injectIntoChatGPT(context);
    if (success || attempts >= maxAttempts) {
      clearInterval(poll);
    }
  }, 500);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", tryInject);
} else {
  tryInject();
}