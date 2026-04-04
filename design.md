# Claude Context Preserver — Phase 2 Design

## Status: What Is Working (DO NOT TOUCH)
- `content.js` — scraping, compression, storage, SPA nav detection, debounced save
- `background.js` — Gemini compression API calls, `scrapeActiveTab`, `openAIWithContext`
- `popup/popup.js`, `popup/popup.html`, `popup/popup.css` — full popup UI, export, delete, search
- `injectors/gemini.js`, `injectors/chatgpt.js`, `injectors/deepseek.js` — context injection from Claude → other AIs

---

## Phase 2: What Needs To Be Built

### Feature 1 — "Ask Another AI" button on Gemini, ChatGPT, DeepSeek
Each of these AIs needs its own **floating button injected into their input toolbar** that:
- Shows a panel with: Claude, ChatGPT, Gemini, DeepSeek (minus the current AI)
- On click: opens the target AI in a new tab and injects the *current page's conversation* as context
- Also shows a **Download JSON** option in the same panel

Each AI has its own content script (`injectors/gemini.js`, `injectors/chatgpt.js`, `injectors/deepseek.js`) — Phase 1 only handled *receiving* injected context. Phase 2 adds the **send UI** to those same files.

**Injector files must do TWO things after Phase 2:**
1. (existing) On page load, check `chrome.storage.session` for pending context → inject into input if found
2. (new) Always inject the "Ask Another AI" floating button into the toolbar

---

### Feature 2 — Download JSON from the floating button
The floating panel (on all 4 AIs) will have a **Download** row at the bottom:
- Downloads the current conversation from `chrome.storage.local` as a JSON file
- Same format as the popup's export function
- The downloaded file is named `[conversation-title].json`

---

### Feature 3 — Inject Claude from other AIs
When a user is on Gemini/ChatGPT/DeepSeek and clicks "Send to Claude":
- Opens `https://claude.ai` in a new tab
- `content.js` (Claude's injector) already handles receiving pending context from `chrome.storage.session`
- This just needs the button UI on the other AIs to include Claude as a target

**Note:** `content.js` on Claude.ai needs a small addition: on init, also check for pending context from session storage and inject it into Claude's input field (the `[data-testid="chat-input"]` ProseMirror div).

---

## DOM Selectors (confirmed from real HTML)

### Claude.ai input toolbar
- **Input field:** `div[data-testid="chat-input"][contenteditable="true"]` (ProseMirror)
- **Toolbar anchor:** `button[aria-label="Add files, connectors, and more"]`
- **Chip slot (inject button here):** `.flex.flex-row.items-center.min-w-0.gap-1` (sibling of the + button wrapper)
- **Injection method:** Set innerHTML via `document.execCommand("insertText")` on the ProseMirror div

### Gemini input toolbar
- **Input field:** `div.ql-editor[contenteditable="true"][role="textbox"]` (Quill editor)
- **Toolbar anchor:** `button[aria-label="Open upload file menu"]` (the + / add button)
- **Toolbar container:** `.leading-actions-wrapper` (the div containing the upload button)
- **Inject button after:** `.uploader-button-container` — append sibling button inside `.leading-actions-wrapper`
- **Injection method:** `document.execCommand("insertText")` on `.ql-editor`

### ChatGPT input toolbar
- **Input field:** `div#prompt-textarea[contenteditable="true"]` (ProseMirror)
- **Toolbar container:** `div[class*="[grid-area:leading]"]` — the leading div with the + button
- **Leading anchor:** `button[data-testid="composer-plus-btn"]` (the + button, `aria-label="Add files and more"`)
- **Inject button:** Append inside the `[grid-area:leading]` span/div, after the plus button
- **Injection method:** `document.execCommand("insertText")` on `#prompt-textarea`

### DeepSeek input toolbar
- **Input field:** `textarea.ds-scroll-area[placeholder="Message DeepSeek"]`
- **Toolbar container:** `.ec4f5d61` (the div containing DeepThink + Search + upload buttons)
- **Inject button:** Prepend inside `.ec4f5d61` before DeepThink toggle button
- **Injection method:** Native setter + React `input` event on the textarea

---

## File Change Summary

| File | Change Type | What Changes |
|---|---|---|
| `content.js` | **Modify** | Add: check session storage on init, inject context into Claude's ProseMirror input if pending |
| `injectors/gemini.js` | **Modify** | Add: inject "Ask Another AI" button into Gemini toolbar |
| `injectors/chatgpt.js` | **Modify** | Add: inject "Ask Another AI" button into ChatGPT toolbar |
| `injectors/deepseek.js` | **Modify** | Add: inject "Ask Another AI" button into DeepSeek toolbar |
| `background.js` | **No change** | Already handles `openAIWithContext` correctly |
| `manifest.json` | **Modify** | Add `https://claude.ai/*` to host_permissions (already there), verify all injector matches |
| `popup/*` | **No change** | Already works |

---

## Shared UI Component (used in all 4 injectors + content.js)

All 5 files need the same "Ask Another AI" floating button + panel. To avoid duplication, the shared logic will be copy-pasted into each file (no separate lib file, to keep extension simple and avoid `web_accessible_resources` complications).

### Button appearance
- Matches each platform's native button style
- Text: `↗ Ask AI` with a send icon
- On hover: subtle highlight
- On click: opens floating panel above the button

### Panel contents (example for Gemini — excludes Gemini itself)
```
┌─────────────────────────────┐
│  SEND CONTEXT TO            │
├─────────────────────────────┤
│  🔵 Claude    Open & inject │
│  🟢 ChatGPT   Open & inject │
│  🔵 DeepSeek  Open & inject │
├─────────────────────────────┤
│  ⬇ Download this chat       │
└─────────────────────────────┘
```

### AI targets per page
| Current page | Shows these targets |
|---|---|
| claude.ai | Gemini, ChatGPT, DeepSeek |
| gemini.google.com | Claude, ChatGPT, DeepSeek |
| chatgpt.com | Claude, Gemini, DeepSeek |
| chat.deepseek.com | Claude, Gemini, ChatGPT |

---

## Context Scraping on Other AIs

When the user clicks "Send to Claude/Gemini/etc." from a non-Claude page, the injector needs to **scrape the current conversation** from the page DOM before opening the target tab.

### Gemini scrape selectors
- Messages: `message-content`, `.model-response-text`, `user-query-text`, `.query-text`
- Role: user messages in `user-query-content`, assistant in `model-response`

### ChatGPT scrape selectors
- Messages: `[data-message-author-role]` attribute — value is `"user"` or `"assistant"`
- Content: `.whitespace-pre-wrap` inside each message article

### DeepSeek scrape selectors
- User messages: `.fbb737a4` or `[class*="user"]` message containers
- Assistant messages: `.ds-markdown` or `.f9bf7997` response containers
- Fallback: any div with class containing `message` or `chat-message`

---

## Context Format (same as Claude → other AI, just sourced differently)

```
[Context from [AI Name] conversation: "[title]"]
[Scraped: [timestamp]]

User: <message>

[AI Name]: <message>

---
I'm continuing this conversation. What are your thoughts?
```

Title = first 60 chars of first user message, or "Untitled Conversation"

---

## Error Handling Rules

1. If scraping returns 0 messages → show toast "No conversation found on this page"
2. If `chrome.storage.session` pending context is > 60 seconds old → discard, don't inject
3. If injection target input not found after 30 × 500ms polls → show toast "Could not find input field"
4. All injected buttons must survive re-renders (MutationObserver watches for button removal and re-injects)
5. Download fallback: if no conversation in storage, download the live-scraped raw messages as JSON

---

## Styling Rules

- Use each platform's own CSS variables where available, fall back to hardcoded values
- Claude: uses `hsl(var(--bg-200))`, `hsl(var(--border-300))`, `hsl(var(--text-400))`
- Gemini: uses Material Design tokens, fall back to `#1f1f1f` / `#444` / `#e8eaed`
- ChatGPT: uses `var(--token-*)` CSS vars, fall back to `#2f2f2f` / `#555` / `#ececec`
- DeepSeek: uses `var(--dsw-alias-*)` CSS vars, fall back to `#1c1c1c` / `#3a3a3a` / `#ececec`
- Panel always uses dark theme (hardcoded `#18181b`) for consistency across platforms

---

## What NOT To Do

- Do NOT modify popup files
- Do NOT change the Capsule/Storage/Scraper logic in content.js
- Do NOT change the `compressMessage` / `compressConversation` pipeline
- Do NOT add new background.js message handlers (existing ones are sufficient)
- Do NOT use `localStorage` or `sessionStorage` (use `chrome.storage.session` for cross-tab passing)
- Do NOT inject `<script>` tags into pages
- Do NOT break the MutationObserver or SPA nav detection in content.js