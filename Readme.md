# Claude Context Preserver

> Never lose a Claude conversation again. Save, compress, and port your AI context across sessions, accounts, and different AI models.

**Version:** v1.1 &nbsp;|&nbsp; **Platform:** Chrome &nbsp;|&nbsp; **Storage:** Local only (no cloud)

---

## Table of Contents

- [Overview](#overview)
- [The Problem](#the-problem)
- [Features](#features)
- [Architecture](#architecture)
- [Installation](#installation)
- [Usage](#usage)
- [Gemini API Setup](#gemini-api-setup)
- [Exporting & Porting Context](#exporting--porting-context)
- [Compression Pipeline](#compression-pipeline)
- [Configuration Reference](#configuration-reference)
- [Roadmap](#roadmap)
- [Contributing](#contributing)
- [FAQ](#faq)

---

## Overview

**Claude Context Preserver** is a Chrome extension that silently watches your Claude.ai conversations and automatically saves every message as you chat — no manual action needed.

```
Your Claude Chat  ──▶  Context Preserver  ──▶  Portable Capsule
                                                      │
                              New Claude Session  ◀───┘
                         (or GPT / Gemini / Mistral)
```

No cloud servers. No sign-up. Everything runs locally in your browser.

---

## The Problem

You've spent hours on a deep technical session with Claude — debugging an auth flow, designing a database schema, making architectural decisions, writing hundreds of lines of code collaboratively.

Then you hit your usage limit. Or you switch accounts. Or you want to continue on a different model.

**Everything is gone.** The context, the decisions, the nuance. You're back to square one.

Claude Context Preserver was built to solve exactly this.

---

## Features

| Feature | Status |
|---|---|
| Auto-scrape conversations via MutationObserver | ✅ Live |
| Local storage (up to 50 conversations) | ✅ Live |
| Search across saved conversations | ✅ Live |
| Export individual conversation as JSON | ✅ Live |
| Export all conversations as one JSON | ✅ Live |
| Delete individual conversations | ✅ Live |
| AI-powered compression (Gemini 2.5 Flash) | ✅ Optional |
| Port context to ChatGPT / Gemini / Mistral | ✅ Via JSON export |
| SPA navigation detection (no page reload needed) | ✅ Live |
| Rolling 10-session context window | 🔧 In Progress |
| One-click context injection button on claude.ai | 🗺️ Roadmap |

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                  Chrome Extension                    │
│                                                     │
│  ┌─────────────┐    ┌──────────────┐    ┌────────┐  │
│  │Content      │    │Background    │    │Popup   │  │
│  │Script       │───▶│Service Worker│◀───│UI      │  │
│  │(scraper +   │    │(orchestrator)│    │(mgmt)  │  │
│  │ injector)   │    └──────┬───────┘    └────────┘  │
│  └─────────────┘           │                        │
│                            ▼                        │
│                   ┌────────────────┐                │
│                   │Compression     │                │
│                   │Pipeline        │                │
│                   │(Gemini 2.5)    │                │
│                   └───────┬────────┘                │
│                           │                         │
│              ┌────────────┴──────────┐              │
│              ▼                       ▼              │
│     chrome.storage.local         (IndexedDB         │
│     (index + 50 convs)            coming soon)      │
└─────────────────────────────────────────────────────┘
```

### Components

**`content.js`**
Runs on every `claude.ai` page. Sets up a `MutationObserver` that watches the conversation DOM for changes. When a new message appears, it triggers a debounced save (1.5s delay to avoid saving mid-stream). Scrapes both user messages (`[data-testid="user-message"]`) and assistant responses (`.font-claude-response`), preserving code blocks in proper markdown format.

**`background.js`**
The service worker acting as an orchestrator. Holds the Gemini API key (so it never touches the content script) and handles compression requests. When `content.js` wants to compress a message, it sends a message to `background.js`, which calls Gemini 2.5 Flash and returns the result.

**`popup.js` / `popup.html` / `popup.css`**
The extension popup UI. Lists all saved conversations, lets you search/filter, expand to view messages, delete individually, export to JSON, or clear everything.

---

## Installation

The extension is not yet on the Chrome Web Store. Install it via Developer Mode.

### Step 1 — Download

```bash
git clone https://github.com/yourusername/claude-context-preserver.git
cd claude-context-preserver
```

### Step 2 — Open Chrome Extensions

Navigate to `chrome://extensions` in your browser.

### Step 3 — Enable Developer Mode

Toggle **Developer Mode** on in the top-right corner.

### Step 4 — Load Unpacked

Click **"Load unpacked"** and select the folder containing `manifest.json`.

### Step 5 — Verify

The 🦞 lobster icon should appear in your Chrome toolbar. If it's hidden, click the puzzle piece icon and pin it.

---

## Usage

### Basic Usage (No API Key Required)

The extension works out of the box without any API key. It saves your raw conversations without AI compression.

**1. Open a Claude conversation**

Navigate to [claude.ai](https://claude.ai) and start or open an existing conversation. The extension starts watching automatically.

**2. Chat normally**

The extension silently captures every message in the background. No action required.

**3. Force-save manually**

Click the 🦞 icon in your toolbar and hit **Refresh** to immediately save the current conversation.

**4. Browse saved conversations**

The popup shows all saved conversations sorted by most recent. Each card shows:
- Conversation title (inferred from your first message)
- Date and time saved
- Message count
- Expandable message view

**5. Search conversations**

Use the search bar in the popup to find any conversation by title or message content.

**6. Delete conversations**

Click the 🗑️ trash icon on any card to remove it, or hit **Clear All** to wipe everything.

---

## Gemini API Setup

> **Compression is optional.** The extension saves full, uncompressed conversations without it. Compression is useful when you're hitting context-window limits when pasting into a new AI.

### Why Gemini?

Gemini 2.5 Flash is used for its speed and generous free tier. The compression runs in the background service worker, so your API key never touches the content script or the page.

> **Note:** A purely local compression pipeline requiring zero API key is actively in development.

### Step 1 — Get a free Gemini API key

1. Go to [Google AI Studio](https://aistudio.google.com/app/apikey)
2. Sign in with your Google account
3. Click **"Create API Key"**
4. Copy the key

### Step 2 — Add the key to `background.js`

Find this line near the top:

```javascript
const GEMINI_API_KEY = ""; // keep as is for now
```

Replace it with your key:

```javascript
const GEMINI_API_KEY = "AIzaSy...yourkey...";
```

### Step 3 — Reload the extension

Go to `chrome://extensions` → find Claude Context Preserver → click the refresh icon (↺).

### What compression does

When a Gemini API key is present, each message above 120 characters is processed as follows:

- **Code blocks** are extracted first and **never touched** — your code is always preserved 100%
- **User messages** are compressed to preserve intent (removes filler, keeps the actual question)
- **Assistant messages** are compressed technically and losslessly (keeps facts, removes verbose openers like "Certainly!")
- **Short messages** (< 120 chars) are skipped entirely

> **Privacy note:** Message content is sent to Google's Gemini API during compression. If your conversations contain sensitive information, either disable compression (leave the key blank) or wait for the upcoming local pipeline.

---

## Exporting & Porting Context

### Export a single conversation

1. Open the extension popup
2. Find the conversation you want to export
3. Click the **download** (↓) icon on the card
4. A `.json` file downloads to your computer

### Export all conversations

Click **"Export All"** in the footer to download everything as one JSON file.

### The JSON Capsule Format

```json
{
  "id": "conv_1712345678_a3f2k",
  "title": "Building a React auth system with JWT...",
  "url": "https://claude.ai/chat/...",
  "savedAt": "2026-04-03T10:22:00.000Z",
  "version": 1,
  "messages": [
    {
      "type": "user",
      "content": "How do I implement refresh token rotation?",
      "format": "text",
      "timestamp": "2026-04-03T10:00:00.000Z",
      "compressed": false
    },
    {
      "type": "assistant",
      "content": "Refresh token rotation works by...\n\n```javascript\nconst rotate = async (token) => { ... }\n```",
      "format": "text",
      "timestamp": "2026-04-03T10:00:00.000Z",
      "compressed": true
    }
  ]
}
```

### Injecting context into a new AI session

#### Option A — Manual paste

1. Open your exported `.json` file in any text editor
2. Copy the content
3. Start a new chat in any AI (Claude, ChatGPT, Gemini, Mistral, etc.)
4. Paste this as your first message:

```
Here is the full context of a previous conversation I had with an AI assistant.
Please read it carefully and then continue helping me as if you were already
familiar with everything we discussed.

[paste the JSON here]

Now, continuing from where we left off: [your next question]
```

#### Option B — Structured handoff prompt (recommended for large exports)

```
You are continuing a previous AI conversation. Below is the full conversation
context in JSON format. The "user" fields are my messages, "assistant" fields
are the AI's responses. Code blocks are preserved exactly.

After reading the context, acknowledge you understand the project and its state,
then I'll ask my next question.

CONTEXT:
[paste JSON here]
```

### Compatibility

| AI | Context Window | Works with export? |
|---|---|---|
| Claude 3.5 Sonnet | 200k tokens | ✅ Excellent |
| GPT-4o | 128k tokens | ✅ Great |
| Gemini 1.5 Pro | 1M tokens | ✅ Best for large exports |
| Mistral Large | 128k tokens | ✅ Good |
| Llama 3 (local) | 8k–128k tokens | ⚠️ Use compression first |

---

## Compression Pipeline

> **Status:** Actively being improved. Current pipeline uses Gemini 2.5 Flash. A local, zero-API-key pipeline is in development.

### How it works

```
Raw Conversation
      │
      ▼
1. CODE BLOCK EXTRACTION
   All ``` blocks extracted with placeholders.
   Code is NEVER sent to any compression model.
   Restored verbatim after compression.
      │
      ▼
2. MESSAGE FILTERING
   Keep last 5 user messages.
   Keep last 5 assistant messages.
   Maintain original interleaved order.
      │
      ▼
3. PER-MESSAGE COMPRESSION (via Gemini 2.5 Flash)
   Skip messages < 120 characters.
   User messages: compress preserving intent.
   Assistant messages: compress losslessly (technical).
   Parallel processing via Promise.all.
      │
      ▼
4. CODE BLOCK RESTORATION
   Placeholders replaced with original code.
   Output stored in chrome.storage.local.
```

### Planned improvements

- TF-IDF sentence scoring — keep only semantically dense sentences from assistant explanations
- Type tagging — tag each message as `question`, `code`, `explanation`, `decision` for structured compression
- Rolling window manager — 10-session window with tiered compression (full → summary → decisions-only)
- Local compression — browser-based NLP pipeline, zero API key, zero data leaving your machine
- Token counter — real-time estimate of compressed capsule size vs. target AI's context window

---

## Configuration Reference

### File Structure

```
claude-context-preserver/
├── manifest.json          ← MV3 Chrome Extension config
├── background.js          ← Service worker: Gemini API calls, message routing
├── content.js             ← DOM scraper, compression caller, storage writer
├── popup/
│   ├── popup.html         ← Extension popup markup
│   ├── popup.js           ← Popup logic: render, search, delete, export
│   └── popup.css          ← Dark theme UI styles
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── README.md
```

### Key Constants

| File | Constant | Default | Description |
|---|---|---|---|
| `content.js` | `MAX_CONVERSATIONS` | `50` | Max conversations stored locally |
| `content.js` | `DEBOUNCE_MS` | `1500` | Delay (ms) before saving after DOM change |
| `background.js` | `GEMINI_API_KEY` | `""` | Your Gemini API key for compression |
| `content.js` | `compressConversation` | last 5+5 | Messages to keep before compressing |

---

## Roadmap

### v1.2 — Coming Soon
- One-click **"Inject Context"** floating button directly on claude.ai
- Storage size indicator in popup stats bar
- Visual compression ratio stats (e.g. "48k → 6k tokens, 87% reduction")

### v1.3
- IndexedDB upgrade for projects with 100+ conversations
- Session fingerprinting to detect and deduplicate identical sessions
- Tag-based organization (group conversations by project)

### v1.4
- Local compression pipeline (no API key needed)
- Firefox support
- Cross-device sync via optional encrypted cloud backup

### v2.0
- Full "Context Capsule" standard — a universal format readable by Claude, GPT, Gemini, and local models
- Direct "Continue in ChatGPT" / "Continue in Gemini" buttons

---

## Contributing

Pull requests are welcome.

```bash
# 1. Fork and clone
git checkout -b feature/my-feature

# 2. Make your changes and test by loading unpacked in Chrome

# 3. Commit and push
git commit -m 'Add: my feature'
git push origin feature/my-feature

# 4. Open a Pull Request
```

### Areas where help is especially needed

- **Compression heuristics** — Better sentence scoring for explanation messages
- **DOM selector resilience** — Claude.ai's DOM changes occasionally; hardening the selectors
- **Firefox port** — The extension uses MV3 APIs; a Firefox MV2 port would help many users
- **Local NLP** — A browser-native compression pipeline with no external API calls

---

## FAQ

**Does this send my conversations to any server?**

Only if you add a Gemini API key. Without it, everything stays 100% local in your browser's `chrome.storage.local`. With the key, message text is sent to Google's Gemini API for compression only.

**What happens when Claude changes its DOM structure?**

The scraper targets `[data-testid="user-message"]` and `.font-claude-response`. If Claude updates these, the scraper may break temporarily. A fallback selector config in settings is planned.

**How much storage does this use?**

Chrome's `chrome.storage.local` allows 5MB by default. 50 compressed conversations sit comfortably under 1MB in most cases.

**Can I use this with Claude's Projects feature?**

Yes. The extension detects any conversation page URL pattern including UUIDs.

**My Refresh button isn't working. What do I do?**

Make sure you're on a `claude.ai/chat/...` page (not the home page). The content script only activates on conversation URLs.

---

## License

MIT License — see [LICENSE](./LICENSE) for details.