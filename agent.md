# Agent Implementation Guide — Claude Context Preserver Phase 2

## CRITICAL RULES — READ BEFORE WRITING ANY CODE

1. **Never touch working logic.** The scraper, compressor, capsule, storage, popup, and background message handlers are complete and tested. Only add new code; do not refactor existing code.
2. **Read each file fully before editing.** Use search to find exact existing function names so you don't duplicate them.
3. **Test selector specificity.** Every DOM selector must be specific enough to not match unintended elements, but broad enough to survive minor DOM changes.
4. **Use `mousedown` not `click` for panel options.** Prevents input blur from stealing focus before the action fires.
5. **Always wrap DOM queries in null checks.** Never assume an element exists.
6. **Panel z-index must be `2147483647`** (max) on all platforms.
7. **Copy the FULL shared UI block** into each injector file — do not import/require.

---

## Step 1 — Update `content.js` (Claude.ai)

### 1a. Add pending context receiver
After the existing `init()` function definition (but before the `DOMContentLoaded` listener), add a new function `checkAndInjectPendingContext()`.

This function:
1. Calls `chrome.storage.session.get(["pending_context_inject"])` 
2. Checks: `pending.target === "claude"` AND `Date.now() - pending.ts < 60000`
3. Clears the key with `chrome.storage.session.remove`
4. Finds Claude's input: `document.querySelector('div[data-testid="chat-input"][contenteditable="true"]')`
5. If not found, retries every 500ms up to 20 times
6. When found: focuses the element, then uses `document.execCommand("insertText", false, context)`
7. Dispatches `new Event("input", { bubbles: true })`
8. Shows the success banner (same as injectors use)

### 1b. Call `checkAndInjectPendingContext()` in `init()`
Add at the top of `init()`, before `startObserver()`:
```js
checkAndInjectPendingContext();
```

### 1c. Update `sendToAI()` — add "claude" as a valid target in background.js
In `background.js`, add to `AI_URLS`:
```js
claude: "https://claude.ai/new",
```

### 1d. No other changes to content.js

---

## Step 2 — Update `injectors/gemini.js`

### Full file structure after edit:
```
[BLOCK A] — Existing pending context receiver (DO NOT CHANGE)
[BLOCK B] — NEW: Shared scraper for Gemini DOM  
[BLOCK C] — NEW: Shared "Ask Another AI" button + panel UI
[BLOCK D] — NEW: retryInject() + MutationObserver to keep button alive
[BLOCK E] — Existing tryInject() entry point (DO NOT CHANGE — rename conflict: rename existing tryInject to tryInjectContext)
[BLOCK F] — Existing init call (update to call both tryInjectContext and retryInjectButton)
```

### BLOCK B — Gemini scraper
```js
function scrapeCurrentConversation() {
  const messages = [];
  const now = new Date().toISOString();

  // Try multiple selector strategies
  const userEls = document.querySelectorAll(
    "user-query-content, .query-text, [data-test-id='user-query']"
  );
  const assistantEls = document.querySelectorAll(
    "model-response .markdown, .model-response-text, message-content .markdown"
  );

  // Interleave by DOM order
  const allEls = document.querySelectorAll(
    "user-query, model-response, chat-message, .conversation-container > *"
  );

  if (allEls.length === 0) {
    // Fallback: grab all text blocks
    document.querySelectorAll("[data-message-author], [role='listitem']").forEach(el => {
      const text = el.innerText?.trim();
      if (text) messages.push({ type: "unknown", content: text, timestamp: now });
    });
    return messages;
  }

  allEls.forEach(el => {
    const tag = el.tagName?.toLowerCase();
    const isUser = tag === "user-query" || el.classList.contains("user-query");
    const type = isUser ? "user" : "assistant";
    const content = el.innerText?.trim();
    if (content && content.length > 0) {
      messages.push({ type, content, format: "text", timestamp: now });
    }
  });

  return messages;
}
```

### BLOCK C — Shared UI (Gemini version)

AI targets for Gemini = Claude, ChatGPT, DeepSeek (NOT Gemini itself)

```js
const CC_AI_OPTIONS = [
  { id: "claude",   label: "Claude",   color: "#d97706", bg: "rgba(217,119,6,0.12)",   svg: "..." },
  { id: "chatgpt",  label: "ChatGPT",  color: "#10a37f", bg: "rgba(16,163,127,0.12)",  svg: "..." },
  { id: "deepseek", label: "DeepSeek", color: "#1A6BFF", bg: "rgba(26,107,255,0.12)",  svg: "..." },
];
```

The panel also has a Download row:
```js
// Download option
const dlBtn = document.createElement("button");
dlBtn.className = "cc-ai-opt";
dlBtn.innerHTML = `
  <span class="cc-ai-ico" style="background:rgba(255,255,255,0.06)">
    <svg ...download icon.../>
  </span>
  <span>
    <span class="cc-ai-lbl">Download chat</span>
    <span class="cc-ai-sub">Save as JSON</span>
  </span>
`;
dlBtn.addEventListener("mousedown", (e) => {
  e.preventDefault();
  closePanel();
  downloadCurrentChat();
});
panel.appendChild(dlBtn);
```

### BLOCK C — `downloadCurrentChat()` function
```js
function downloadCurrentChat() {
  const messages = scrapeCurrentConversation();
  if (!messages.length) {
    showBanner("No conversation found to download.", true);
    return;
  }
  const title = messages.find(m => m.type === "user")?.content?.slice(0, 60) || "conversation";
  const data = {
    id: `scraped_${Date.now()}`,
    title,
    url: window.location.href,
    messages,
    savedAt: new Date().toISOString(),
    source: "gemini", // or "chatgpt" / "deepseek" depending on file
    version: 1,
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${title.replace(/[^\w\d]+/g, "_").slice(0, 50)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
```

### BLOCK C — `sendFromThisPage(target)` function
```js
function sendFromThisPage(target) {
  const messages = scrapeCurrentConversation();
  if (!messages.length) {
    showBanner("No conversation found on this page.", true);
    return;
  }

  const title = messages.find(m => m.type === "user")?.content?.slice(0, 60) || "Untitled";
  const lines = [
    `[Context from Gemini conversation: "${title}"]`,  // change per file
    `[Scraped: ${new Date().toLocaleString()}]`,
    "",
  ];
  for (const msg of messages) {
    lines.push(`${msg.type === "user" ? "User" : "Gemini"}: ${msg.content}`, "");  // change per file
  }
  lines.push("---", "I'm continuing this conversation. What are your thoughts?");

  const context = lines.join("\n");
  const AI_URLS = {
    claude:   "https://claude.ai/new",
    chatgpt:  "https://chatgpt.com/",
    deepseek: "https://chat.deepseek.com/",
    gemini:   "https://gemini.google.com/app",
  };

  chrome.storage.session.set({
    pending_context_inject: { target, context, ts: Date.now() }
  }, () => {
    window.open(AI_URLS[target], "_blank");
  });
}
```

### BLOCK C — Inject button into Gemini toolbar
```js
function findGeminiSlot() {
  // The leading-actions-wrapper contains the upload button
  // We inject our button right after the uploader-button-container
  const wrapper = document.querySelector(".leading-actions-wrapper");
  if (!wrapper) return null;
  return wrapper;
}

function injectGeminiButton() {
  if (document.getElementById("cc-ask-ai-btn")) return;
  ensureStyles();  // injects CSS
  const slot = findGeminiSlot();
  if (!slot) return;

  const btn = createAskAIButton();  // shared builder
  // Insert before toolbox-drawer (after uploader)
  const toolbox = slot.querySelector("toolbox-drawer");
  if (toolbox) {
    slot.insertBefore(btn, toolbox);
  } else {
    slot.appendChild(btn);
  }
}
```

### BLOCK D — Keep button alive
```js
let _geminiObserver = null;
function watchForButtonRemoval() {
  if (_geminiObserver) return;
  _geminiObserver = new MutationObserver(() => {
    if (!document.getElementById("cc-ask-ai-btn")) {
      setTimeout(injectGeminiButton, 300);
    }
  });
  _geminiObserver.observe(document.body, { childList: true, subtree: true });
}

let _injectAttempts = 0;
function retryInjectButton() {
  if (document.getElementById("cc-ask-ai-btn")) return;
  if (_injectAttempts++ > 30) return;
  injectGeminiButton();
  if (!document.getElementById("cc-ask-ai-btn")) setTimeout(retryInjectButton, 500);
}
```

---

## Step 3 — Update `injectors/chatgpt.js`

Same structure as Gemini. Differences:

### ChatGPT scraper
```js
function scrapeCurrentConversation() {
  const messages = [];
  const now = new Date().toISOString();

  document.querySelectorAll("[data-message-author-role]").forEach(el => {
    const role = el.getAttribute("data-message-author-role");
    const type = role === "user" ? "user" : "assistant";
    // Content lives in .whitespace-pre-wrap or the direct text
    const contentEl = el.querySelector(".whitespace-pre-wrap, .markdown, [data-message-content]");
    const content = (contentEl || el).innerText?.trim();
    if (content) messages.push({ type, content, format: "text", timestamp: now });
  });

  return messages;
}
```

### ChatGPT toolbar injection
```js
function findChatGPTSlot() {
  // The leading area: div with [grid-area:leading] or the span wrapping the + button
  const plusBtn = document.querySelector('button[data-testid="composer-plus-btn"]');
  if (!plusBtn) return null;
  // Return the span wrapper of the plus button — we append a sibling after it
  return plusBtn.closest("span") || plusBtn.parentElement;
}

function injectChatGPTButton() {
  if (document.getElementById("cc-ask-ai-btn")) return;
  ensureStyles();
  const slot = findChatGPTSlot();
  if (!slot) return;

  const btn = createAskAIButton();
  // Insert as a sibling after the slot (after the + button's span)
  slot.parentElement?.insertBefore(btn, slot.nextSibling) || slot.parentElement?.appendChild(btn);
}
```

### ChatGPT AI targets = Claude, Gemini, DeepSeek

### ChatGPT context label: `"ChatGPT"` for assistant role in formatted block

---

## Step 4 — Update `injectors/deepseek.js`

### DeepSeek scraper
```js
function scrapeCurrentConversation() {
  const messages = [];
  const now = new Date().toISOString();

  // DeepSeek uses class-based structure
  // User messages: look for elements with user chat bubble classes
  // Assistant: look for .ds-markdown or similar
  
  const allMessages = document.querySelectorAll(
    ".fbb737a4, .f9bf7997, [class*='user-message'], [class*='assistant-message'], .ds-markdown"
  );

  if (!allMessages.length) {
    // Broader fallback
    document.querySelectorAll("article, [role='listitem'], .message").forEach(el => {
      const text = el.innerText?.trim();
      if (text) messages.push({ type: "unknown", content: text, timestamp: now });
    });
    return messages;
  }

  allMessages.forEach(el => {
    // Determine role by position or class
    const isUser = el.classList.contains("fbb737a4") || 
                   el.closest("[class*='user']") !== null ||
                   el.querySelector("textarea") !== null;
    const type = isUser ? "user" : "assistant";
    const content = el.innerText?.trim();
    if (content) messages.push({ type, content, format: "text", timestamp: now });
  });

  return messages;
}
```

### DeepSeek toolbar injection
```js
function findDeepSeekSlot() {
  // The toolbar with DeepThink + Search buttons is .ec4f5d61
  // We prepend our button before the DeepThink toggle
  return document.querySelector(".ec4f5d61");
}

function injectDeepSeekButton() {
  if (document.getElementById("cc-ask-ai-btn")) return;
  ensureStyles();
  const slot = findDeepSeekSlot();
  if (!slot) return;

  const btn = createAskAIButton();
  slot.insertBefore(btn, slot.firstChild);
}
```

### DeepSeek AI targets = Claude, Gemini, ChatGPT

### DeepSeek context label: `"DeepSeek"` for assistant role

---

## Step 5 — Shared CSS / `ensureStyles()` and `createAskAIButton()`

Each injector file contains its OWN copy of these two functions. They are identical across all files EXCEPT the CSS may have platform-specific tweaks.

### `ensureStyles()` — injects a `<style id="cc-styles">` tag into `document.head`

The CSS must include:
- `#cc-ask-ai-btn` — the trigger button
- `#cc-ask-ai-panel` — the floating panel
- `.cc-panel-hdr` — panel header text
- `.cc-ai-opt` — each AI option row
- `.cc-ai-ico` — the icon circle
- `.cc-ai-lbl` / `.cc-ai-sub` — label text
- `.cc-arr` — the right arrow
- `@keyframes cc-pop` — panel open animation

Use only hardcoded colors (not CSS vars) in injectors for non-Claude pages:
```css
#cc-ask-ai-btn {
  background: transparent;
  border: 1px solid rgba(255,255,255,0.15);
  color: rgba(255,255,255,0.65);
  /* ... rest of styles ... */
}
```
For light-mode platforms (ChatGPT light, Gemini light), use `rgba(0,0,0,0.1)` for borders.
Since we can't know the theme reliably, use the panel with hardcoded dark `#18181b` background — it always looks right.

### `createAskAIButton()` — returns a `<button>` DOM element
```js
function createAskAIButton() {
  const btn = document.createElement("button");
  btn.id = "cc-ask-ai-btn";
  btn.type = "button";
  btn.title = "Send this conversation to another AI";
  btn.innerHTML = `
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
      <line x1="22" y1="2" x2="11" y2="13"/>
      <polygon points="22 2 15 22 11 13 2 9 22 2"/>
    </svg>
    Ask AI
  `;
  // Attach toggle logic
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    _panelOpen ? closePanel() : openPanel(btn);
  });
  document.addEventListener("click", (e) => {
    if (_panelOpen && !_panel?.contains(e.target) && e.target !== btn) closePanel();
  });
  return btn;
}
```

---

## Step 6 — `showBanner()` — consistent success/error notification

Used across all injectors:
```js
function showBanner(msg, isError = false) {
  document.getElementById("cc-banner")?.remove();
  const b = document.createElement("div");
  b.id = "cc-banner";
  Object.assign(b.style, {
    position: "fixed", top: "16px", left: "50%",
    transform: "translateX(-50%) translateY(-8px)",
    background: "#18181b", color: "#fafafa",
    fontFamily: "system-ui, sans-serif", fontSize: "13px", fontWeight: "500",
    padding: "10px 20px", borderRadius: "999px",
    border: `1px solid ${isError ? "#f43f5e" : "#3f3f46"}`,
    boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
    zIndex: "2147483647", display: "flex", alignItems: "center", gap: "8px",
    opacity: "0", transition: "opacity 0.2s, transform 0.2s", whiteSpace: "nowrap",
  });
  b.innerHTML = isError
    ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f43f5e" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>${msg}`
    : `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>${msg}`;
  document.body.appendChild(b);
  requestAnimationFrame(() => { b.style.opacity = "1"; b.style.transform = "translateX(-50%) translateY(0)"; });
  setTimeout(() => { b.style.opacity = "0"; setTimeout(() => b.remove(), 300); }, 3500);
}
```

---

## Implementation Order

1. `background.js` — add `claude` to `AI_URLS` (1 line change)
2. `content.js` — add `checkAndInjectPendingContext()` + call it in `init()`
3. `injectors/gemini.js` — full rewrite with both blocks (context receiver + send UI)
4. `injectors/chatgpt.js` — full rewrite with both blocks
5. `injectors/deepseek.js` — full rewrite with both blocks
6. `manifest.json` — verify (no changes needed, already has all permissions)

---

## Verification Checklist

After writing each file, verify:
- [ ] Existing pending context injection still works (open Claude tab → click Gemini → context appears)
- [ ] New "Ask AI" button visible in toolbar immediately on page load
- [ ] Button survives page re-renders (test by sending a message and checking button still exists)
- [ ] Panel opens above button (not below, which would be off-screen)
- [ ] Each AI option opens correct URL in new tab
- [ ] Context appears in target AI's input field within 15 seconds of tab opening
- [ ] Download button saves valid JSON with messages array
- [ ] No console errors on any platform
- [ ] Panel closes on outside click
- [ ] Panel closes after selecting an option

---

## Common Pitfalls

1. **`chrome.storage.session` unavailable in some contexts** — wrap in try/catch, fall back to `chrome.storage.local` with a short TTL key
2. **Gemini uses Angular** — DOM updates are async, button may disappear after route changes — MutationObserver is essential
3. **ChatGPT uses ProseMirror** — `insertText` execCommand is the only reliable injection method; setting `.innerHTML` directly breaks React's state
4. **DeepSeek uses a `<textarea>`** — must use native setter trick for React: `Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set.call(el, text)` then dispatch `input` event
5. **`mousedown` vs `click`** — use `mousedown` + `e.preventDefault()` on panel options to prevent input losing focus
6. **ID collision** — all files use the same `cc-ask-ai-btn` and `cc-ask-ai-panel` IDs. This is fine because each runs on a different domain. Do NOT change these IDs.
7. **Panel positioning** — always calculate position after the button is in the DOM, not before