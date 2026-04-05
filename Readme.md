# 🦞 Context Sync


![Chrome Extension](https://img.shields.io/badge/Platform-Chrome%20Extension-blue)
![Manifest V3](https://img.shields.io/badge/Manifest-V3-green)
![License](https://img.shields.io/badge/License-MIT-yellow)
![Status](https://img.shields.io/badge/Status-Active-success)
![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen)
![Version](https://img.shields.io/badge/Version-2.0.0-purple)

> **Never lose a conversation again.** Save, compress, and port your AI context across sessions, accounts, and *any* AI platform — Claude, ChatGPT, Gemini, or DeepSeek.

```
   ██████╗ ██████╗ ███╗   ██╗████████╗███████╗██╗  ██╗████████╗
  ██╔════╝██╔═══██╗████╗  ██║╚══██╔══╝██╔════╝╚██╗██╔╝╚══██╔══╝
  ██║     ██║   ██║██╔██╗ ██║   ██║   █████╗   ╚███╔╝    ██║   
  ██║     ██║   ██║██║╚██╗██║   ██║   ██╔══╝   ██╔██╗    ██║   
  ╚██████╗╚██████╔╝██║ ╚████║   ██║   ███████╗██╔╝ ██╗   ██║   
   ╚═════╝ ╚═════╝ ╚═╝  ╚═══╝   ╚═╝   ╚══════╝╚═╝  ╚═╝   ╚═╝  
   
  ██████╗ ██████╗ ███████╗███████╗███████╗██████╗ ██╗   ██╗███████╗██████╗ 
  ██╔══██╗██╔══██╗██╔════╝██╔════╝██╔════╝██╔══██╗██║   ██║██╔════╝██╔══██╗
  ██████╔╝██████╔╝█████╗  ███████╗█████╗  ██████╔╝██║   ██║█████╗  ██████╔╝
  ██╔═══╝ ██╔══██╗██╔══╝  ╚════██║██╔══╝  ██╔══██╗╚██╗ ██╔╝██╔══╝  ██╔══██╗
  ██║     ██║  ██║███████╗███████║███████╗██║  ██║ ╚████╔╝ ███████╗██║  ██║
  ╚═╝     ╚═╝  ╚═╝╚══════╝╚══════╝╚══════╝╚═╝  ╚═╝  ╚═══╝  ╚══════╝╚═╝  ╚═╝
```

---

## 📋 Table of Contents

1. [The Problem](#-the-problem)
2. [The Solution](#-the-solution)
3. [What's New in v2.0](#-whats-new-in-v20)
4. [Features](#-features)
5. [Preview](#-preview)
6. [Architecture](#-architecture)
7. [Installation](#-installation)
8. [How to Use](#-how-to-use)
9. [Setting Up Gemini API for Compression](#-setting-up-gemini-api-for-compression)
10. [Exporting & Porting Context to Other AIs](#-exporting--porting-context-to-other-ais)
11. [One-Click Cross-Platform Injection](#-one-click-cross-platform-injection)
12. [Compression Pipeline](#-compression-pipeline)
13. [File Structure](#-file-structure)
14. [Roadmap](#-roadmap)
15. [Contributing](#-contributing)
16. [License](#-license)

---

## 😤 The Problem

You've spent **2 hours** on a deep technical session with Claude. You've:

- Debugged a gnarly auth flow
- Designed a full database schema together
- Made 12 architectural decisions
- Written 400 lines of code collaboratively

Then — **BAM.** You hit your usage limit. Or your account gets switched. Or you want to continue on ChatGPT or Gemini because Claude is down.

**Everything is gone.** The context, the decisions, the nuance. You have to start from scratch and re-explain everything to a fresh AI that has no idea what you've been building.

This is the problem Context Sync was built to solve.

---

## 💡 The Solution

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                                                                              │
│  Claude / ChatGPT / Gemini / DeepSeek  ──▶  🦞 Context Sync  ──▶  Capsule  │
│                                                                              │
│  Capsule  ──▶  One click  ──▶  Any AI (auto-injected & auto-submitted)      │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

**Context Sync** is a Chrome extension that:

1. **Silently watches** your conversations on Claude, ChatGPT, Gemini, and DeepSeek using DOM observers
2. **Automatically saves** every message as you chat — no manual action needed
3. **Compresses** the conversation intelligently (optional, via Gemini API) to fit into tight context windows
4. **Injects a native Export button** into every supported AI's toolbar — one click opens the target AI and auto-sends the context
5. **Exports** your saved context as a portable JSON capsule
6. **Shows all conversations in a unified popup** with colour-coded source badges

No cloud servers. No sign-up. Everything runs locally in your browser.

---

## 🆕 What's New in v2.0

Version 2.0 is a major release that expands Context Sync from a Claude-only scraper into a **full cross-platform AI context bridge**.

### 🔁 Cross-Platform Context Injection Pipeline
Every supported AI now has a native **Export** button injected directly into its toolbar. Clicking it opens a context-send panel where you can beam the current conversation to any other AI in one click — the target tab opens and the context is **auto-injected and auto-submitted**, no copy-pasting needed.

| Source AI | Can send to |
|---|---|
| Claude | ChatGPT · Gemini · DeepSeek |
| ChatGPT | Claude · Gemini · DeepSeek |
| Gemini | Claude · ChatGPT · DeepSeek |
| DeepSeek | Claude · ChatGPT · Gemini |

### 🤖 Multi-AI Conversation Scraping
The extension now scrapes and saves conversations from all four platforms (Claude, ChatGPT, Gemini, DeepSeek) directly into the unified `chrome.storage.local`. Open the popup from any AI tab and you'll see the live conversation instantly.

### 🏷️ Source-Agent Labels & Colour Badges
Every conversation card in the popup now shows a colour-coded badge identifying which AI the conversation came from — Claude (amber), ChatGPT (green), Gemini (blue), DeepSeek (indigo). Message bubbles also label responses with the correct AI name.

### ⚡ Auto-Submit on Injection
When context is injected into a target AI, Context Sync **automatically clicks the Send button** (with multiple fallback strategies per platform). The conversation continues instantly — no extra keystroke required.

### 🎨 Modernised Grayscale Popup UI
The popup has been redesigned with a professional grayscale theme, Inter font, smooth micro-animations, and a cleaner layout. The old Refresh button has been removed — the popup now auto-scrapes the active tab when it opens.

### 📥 Download Chat from Any AI
Every AI's Export panel now includes a **"Download chat"** option that saves the scraped conversation as a JSON file directly from within the page — no need to open the popup.

---

## ✨ Features

| Feature | Status |
|---|---|
| 🔄 Auto-scrape Claude conversations via MutationObserver | ✅ Live |
| 🤖 Auto-scrape ChatGPT, Gemini & DeepSeek conversations | ✅ Live (v2.0) |
| 💾 Unified local storage across all AIs (up to 50 convos) | ✅ Live |
| 🏷️ Source-agent colour badges (Claude / ChatGPT / Gemini / DeepSeek) | ✅ Live (v2.0) |
| 🔍 Search across all saved conversations | ✅ Live |
| 📤 Export individual conversation as JSON | ✅ Live |
| 📦 Export ALL conversations as one JSON | ✅ Live |
| 🗑️ Delete individual conversations | ✅ Live |
| 🧠 AI-powered compression (Gemini 2.5 Flash) | ✅ Optional |
| 💉 Native Export button injected into Claude toolbar | ✅ Live (v2.0) |
| 💉 Native Export button injected into ChatGPT toolbar | ✅ Live (v2.0) |
| 💉 Native Export button injected into Gemini toolbar | ✅ Live (v2.0) |
| 💉 Native Export button injected into DeepSeek toolbar | ✅ Live (v2.0) |
| ⚡ Auto-submit context on injection (all 4 platforms) | ✅ Live (v2.0) |
| 📥 Download chat as JSON from within the AI page | ✅ Live (v2.0) |
| 🖥️ SPA navigation detection (no page reload needed) | ✅ Live |
| 🎨 Modernised grayscale popup UI with Inter font | ✅ Live (v2.0) |
| 📋 Rolling 10-session context window | 🔧 In Progress |
| 🧮 Local NLP compression (no API key) | 🗺️ Roadmap |
| 📥 View & manage downloads inside the extension | 🗺️ Roadmap |

---

## 🖼️ Preview

### Extension Popup
![Extension Preview](assets/Preview.png)

### Conversation Cards with Source Badges
![Conversation](assets/Conversation.png)

### Exporting a Conversation
![Export Per Conversation](assets/ExportPerConversation.png)

---

## 🏗️ Architecture

```
┌───────────────────────────────────────────────────────────────────────┐
│                         Chrome Extension (MV3)                        │
│                                                                       │
│  ┌──────────────────┐    ┌──────────────────┐    ┌────────────────┐   │
│  │  Content Scripts  │    │  Background       │    │  Popup UI      │   │
│  │                  │    │  Service Worker   │    │                │   │
│  │  content.js      │───▶│  (orchestrator)   │◀───│  popup.html    │   │
│  │  (claude.ai)     │    │                  │    │  popup.js      │   │
│  │                  │    │  • Gemini API     │    │  popup.css     │   │
│  │  injectors/      │    │  • Message router │    │                │   │
│  │  ├ chatgpt.js    │    │  • scrapeActiveTab│    └────────────────┘   │
│  │  ├ gemini.js     │    └────────┬─────────┘                         │
│  │  └ deepseek.js   │             │                                   │
│  └──────────────────┘             ▼                                   │
│                          ┌─────────────────┐                          │
│                          │  Compression     │                          │
│                          │  Pipeline        │                          │
│                          │  (Gemini 2.5)    │                          │
│                          └────────┬────────┘                          │
│                                   │                                   │
│                    ┌──────────────┴──────────────┐                    │
│                    ▼                             ▼                    │
│          chrome.storage.local              (IndexedDB                 │
│          (unified index, 50 convos)         coming soon)              │
└───────────────────────────────────────────────────────────────────────┘
```

### How it works under the hood

**`content.js`** — Runs on every `claude.ai` page. Sets up a `MutationObserver` that watches the conversation DOM for changes. When a new message appears, it triggers a debounced save (1.5 s delay to avoid saving mid-stream). Scrapes both user messages (`[data-testid="user-message"]`) and assistant responses (`.font-claude-response`), preserving code blocks in proper markdown format. Saves directly to `chrome.storage.local`.

**`injectors/chatgpt.js`** — Runs on `chatgpt.com`. Scrapes conversations via `[data-message-author-role]` elements. Injects a native **Export** button into the ChatGPT composer toolbar. Handles context injection into ChatGPT's ProseMirror editor with `execCommand` and React synthetic event firing. Reads pending context from `chrome.storage.local`.

**`injectors/gemini.js`** — Runs on `gemini.google.com`. Scrapes conversations from Angular's `user-query-content` and `model-response` custom elements. Injects an Export button near the toolbox drawer. Handles injection into the Quill editor by setting `innerHTML` and firing the full Angular event chain, then auto-submits. Triple-fires the injection check (0 ms, 1.5 s, 3 s) to survive Angular's delayed hydration.

**`injectors/deepseek.js`** — Runs on `chat.deepseek.com`. Scrapes and saves DeepSeek conversations. Injects the Export button styled to match DeepSeek's native design system. Handles context injection and auto-submit.

**`background.js`** — The service worker acting as the orchestrator. Holds the Gemini API key securely (never exposed to content scripts). Handles compression requests via Gemini 2.5 Flash. Also listens for `scrapeActiveTab` messages from the popup and routes `scrapeNow` to the correct injector content script.

**`popup.js` + `popup.html` + `popup.css`** — The extension popup UI. On open, it auto-scrapes the currently active AI tab so you always see the latest conversation. Lists all saved conversations with source-agent badges, allows search/filter, expand to read messages, per-conversation JSON export, and full clear. The unified storage means conversations from all four AIs appear in one place.

---

## 🚀 Installation

Since this extension is not yet on the Chrome Web Store, install it in **Developer Mode**:

### Step 1 — Download the extension files

Clone or download this repository:

```bash
git clone https://github.com/Vineetpandey0/Claude-Context-Preserver.git
cd Claude-Context-Preserver
```

### Step 2 — Open Chrome Extensions

Go to `chrome://extensions` in your browser.

### Step 3 — Enable Developer Mode

Toggle **Developer Mode** on (top right corner).

### Step 4 — Load the extension

Click **"Load unpacked"** and select the folder containing `manifest.json`.

### Step 5 — Verify installation

You should see the 🦞 lobster icon appear in your Chrome toolbar. If it's hidden, click the puzzle piece icon and pin it.

---

## 🛠️ How to Use

### Basic Usage (No API Key Required)

The extension works **out of the box** without any API key. It will save your raw conversations without AI compression.

#### 1. Open any supported AI conversation

Navigate to [claude.ai](https://claude.ai), [chatgpt.com](https://chatgpt.com), [gemini.google.com](https://gemini.google.com), or [chat.deepseek.com](https://chat.deepseek.com). The extension starts watching automatically.

#### 2. Chat normally

Just use the AI as you normally would. The extension silently captures every message in the background.

#### 3. Click the popup to view conversations

Click the 🦞 icon in your toolbar. The popup will auto-scrape the active tab and display all your saved conversations, sorted by most recent, with source badges showing which AI each one came from.

#### 4. Browse your saved conversations

Each card shows:
- Conversation title (inferred from your first message)
- **Colour-coded source badge** (Claude · ChatGPT · Gemini · DeepSeek)
- Date and time saved
- Message count
- Expand/collapse to read messages (with AI name labels on each bubble)

#### 5. Search conversations

Use the search bar in the popup to find any conversation by title or message content, across all AIs.

#### 6. Delete conversations

Click the 🗑️ trash icon on any card to remove it. Or hit **Clear All** to wipe everything.

---

## 🔑 Setting Up Gemini API for Compression

> **Compression is optional.** The extension saves full, uncompressed conversations without it. But if you're hitting context-window limits when pasting into a new AI, compression helps significantly.

### Why Gemini for compression?

We use **Gemini 2.5 Flash** for its speed and generous free tier. The compression runs in the background service worker, meaning your API key never touches the content script or the page.

> **Note:** We're actively working on a purely local compression pipeline that requires zero API key. Stay tuned.

### Step 1 — Get a free Gemini API key

1. Go to [Google AI Studio](https://aistudio.google.com/app/apikey)
2. Sign in with your Google account
3. Click **"Create API Key"**
4. Copy the key

### Step 2 — Add the key to background.js

Open `background.js` in any text editor and find this line near the top:

```javascript
const GEMINI_API_KEY = ""; // keep as is for now
```

Replace it with your key:

```javascript
const GEMINI_API_KEY = "AIzaSy...yourkey..."; 
```

### Step 3 — Reload the extension

Go to `chrome://extensions` → find Context Sync → click the **refresh** (↺) icon.

### What compression does

When a Gemini API key is present, each message above 120 characters is sent to Gemini 2.5 Flash with this logic:

- **Code blocks** are extracted first and **never touched** — your code is always preserved 100%
- **User messages** are compressed to preserve intent (removes filler, keeps the actual question)
- **Assistant messages** are compressed technically and losslessly (keeps facts, removes verbose openers like "Certainly!")
- **Short messages** (< 120 chars) are skipped — not worth a network round-trip

> **Privacy note:** Message content is sent to Google's Gemini API during compression. If your conversations contain sensitive information, either disable compression (leave the key blank) or self-host a local model in the future.

---

## 📤 Exporting & Porting Context to Other AIs

This is the killer feature. **You are no longer locked into any single AI.**

### Export a conversation from the popup

1. Open the extension popup
2. Find the conversation you want to export
3. Click the **download** (↓) icon on the card
4. A `.json` file downloads to your computer

![Export Per Conversation](assets/ExportPerConversation.png)

### Export all conversations

Click **"Export All"** in the footer to download everything as one JSON file.

### Save options

![Save Options JSON](assets/SaveOptionsJSON.png)

### The JSON Capsule Format

Every exported conversation follows this schema:

```json
{
  "id": "conv_1712345678_a3f2k",
  "title": "Building a React auth system with JWT...",
  "url": "https://claude.ai/chat/...",
  "savedAt": "2026-04-03T10:22:00.000Z",
  "source": "claude",
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

The `source` field identifies the origin AI (`claude`, `chatgpt`, `gemini`, or `deepseek`) and drives the badge colour in the popup.

### How to inject this into a new AI session (manual method)

#### Option A — Manual paste (works everywhere)

1. Open your exported `.json` file in any text editor
2. Copy the content
3. Start a new chat in any AI (Claude, ChatGPT, Gemini, DeepSeek, etc.)
4. Paste this as your first message:

```
Here is the full context of a previous conversation I had with an AI assistant. 
Please read it carefully and then continue helping me as if you were already 
familiar with everything we discussed.

[paste the JSON here]

Now, continuing from where we left off: [your next question]
```

#### Option B — Use a structured prompt (recommended for large exports)

```
You are continuing a previous AI conversation. Below is the full conversation 
context in JSON format. The "user" fields are my messages, "assistant" fields 
are the AI's responses. Code blocks are preserved exactly.

After reading the context, acknowledge you understand the project and its state, 
then I'll ask my next question.

CONTEXT:
[paste JSON here]
```

#### Which AIs work best for context injection?

| AI | Context Window | Works with export? |
|---|---|---|
| Claude 3.5 Sonnet | 200k tokens | ✅ Excellent |
| GPT-4o | 128k tokens | ✅ Great |
| Gemini 1.5 Pro | 1M tokens | ✅ Best for large exports |
| DeepSeek V3 | 128k tokens | ✅ Good |
| Mistral Large | 128k tokens | ✅ Good |
| Llama 3 (local) | 8k–128k tokens | ⚠️ Use compression first |

---

## 💉 One-Click Cross-Platform Injection

> This is the headline feature of v2.0.

Every supported AI now has a native **Export** button injected directly into its toolbar. No need to open the popup, copy JSON, or paste anything manually.

### How it works

1. Open any conversation on Claude, ChatGPT, Gemini, or DeepSeek
2. Click the **Export** button in the toolbar (injected by the extension)
3. A panel slides open showing all other supported AIs
4. Click the target AI — e.g. **"Gemini"**
5. A new tab opens at `gemini.google.com`
6. The extension **auto-injects** the conversation context into the input field
7. The **Send button is automatically clicked** — the AI receives and reads the context immediately

```
Your conversation on ChatGPT
        │
        ▼ click Export → click Gemini
        │
        ▼ new tab opens at gemini.google.com
        │
        ▼ context auto-typed into Quill editor
        │
        ▼ Send button auto-clicked
        │
        ▼ Gemini reads the full context and responds
```

### Panel also includes "Download chat"

Within the Export panel on each AI page, there is also a **Download chat** option that saves the current page's conversation as a JSON file — without needing to open the popup at all.

### Injection reliability by platform

| Platform | Injection method | Auto-submit |
|---|---|---|
| Claude | `chrome.storage.local` pending key | ✅ Yes |
| ChatGPT | ProseMirror `execCommand + insertText` | ✅ Yes |
| Gemini | Quill `innerHTML` + Angular event chain | ✅ Yes |
| DeepSeek | Native textarea / contenteditable | ✅ Yes |

Each injector uses multiple fallback selectors and a MutationObserver to survive SPA navigations and framework re-renders.

---

## ⚙️ Compression Pipeline

> **Status:** Actively being improved. The current pipeline uses Gemini 2.5 Flash. A local, zero-API-key pipeline is in development.

### Current approach

```
Raw Conversation
      │
      ▼
1. CODE BLOCK EXTRACTION
   - All ``` blocks extracted with placeholders
   - Code is NEVER sent to any compression model
   - Restored verbatim after compression

      │
      ▼
2. MESSAGE FILTERING
   - Keep last 5 user messages
   - Keep last 5 assistant messages
   - Maintain original interleaved order

      │
      ▼
3. PER-MESSAGE COMPRESSION (via Gemini 2.5 Flash)
   - Skip messages < 120 characters
   - User messages: compress preserving intent
   - Assistant messages: compress losslessly (technical)
   - Parallel processing (Promise.all)

      │
      ▼
4. CODE BLOCK RESTORATION
   - Placeholders replaced with original code
   - Output stored in chrome.storage.local
```

### Planned improvements

- [ ] **TF-IDF sentence scoring** — Keep only semantically dense sentences from assistant explanations
- [ ] **Type tagging** — Tag each message as `question`, `code`, `explanation`, `decision` for structured compression
- [ ] **Rolling window manager** — 10-session window with tiered compression (full → summary → decisions-only)
- [ ] **Local NLP compression** — Browser-native pipeline: TF-IDF + sentence scoring + stopword removal, zero API calls, zero data leaving your machine
- [ ] **Token counter** — Real-time estimate of compressed capsule size vs. target AI's context window

---

## 📁 File Structure

```
claude-context-preserver/
├── manifest.json               ← MV3 Chrome Extension config (v1.2.0)
├── background.js               ← Service worker: Gemini API, message routing, scrapeActiveTab
├── content.js                  ← Claude DOM scraper, compression caller, storage writer
├── injectors/
│   ├── chatgpt.js              ← ChatGPT scraper + Export button + context injector
│   ├── gemini.js               ← Gemini scraper + Export button + Quill injector
│   └── deepseek.js             ← DeepSeek scraper + Export button + context injector
├── popup/
│   ├── popup.html              ← Extension popup markup (grayscale theme)
│   ├── popup.js                ← Popup logic: render, source badges, search, delete, export
│   └── popup.css               ← Dark grayscale UI styles with Inter font
├── assets/
│   ├── Preview.png
│   ├── Conversation.png
│   ├── ExportPerConversation.png
│   └── SaveOptionsJSON.png
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── README.md
```

### Key constants you may want to change

| File | Constant | Default | Description |
|---|---|---|---|
| `content.js` | `MAX_CONVERSATIONS` | `50` | How many conversations to store locally |
| `content.js` | `DEBOUNCE_MS` | `1500` | Milliseconds to wait before saving after DOM change |
| `background.js` | `GEMINI_API_KEY` | `""` | Your Gemini API key for compression |
| `content.js` | `compressConversation` | last 5+5 | How many messages to keep before compressing |

### Host permissions granted

| Host | Purpose |
|---|---|
| `https://claude.ai/*` | Scraping Claude conversations |
| `https://generativelanguage.googleapis.com/*` | Gemini compression API calls |
| `https://gemini.google.com/*` | Scraping + injecting into Gemini |
| `https://chatgpt.com/*` | Scraping + injecting into ChatGPT |
| `https://chat.deepseek.com/*` | Scraping + injecting into DeepSeek |

---

## 🗺️ Roadmap

### v2.1 — Coming Soon
- [ ] Storage size indicator in popup stats bar
- [ ] Visual compression ratio stats (e.g. "48k → 6k tokens, 87% reduction")
- [ ] Session fingerprinting to detect and deduplicate identical sessions
- [ ] Fallback selector config exposed in settings (for when AI sites update their DOM)

### v2.2
- [ ] IndexedDB upgrade for projects with 100+ conversations
- [ ] Tag-based organisation (group conversations by project across AIs)
- [ ] Per-conversation compression toggle in the popup

### v2.3 — 🔧 Work in Progress
- [ ] **Local NLP compression** — A fully browser-native compression pipeline with zero API calls. Uses TF-IDF scoring, stopword removal, and sentence-level importance ranking to shrink conversations without sending a single byte outside your machine. No Gemini key, no latency, no privacy trade-off.
- [ ] **Downloads manager inside the extension** — View, rename, re-download, and delete your exported JSON capsules directly from the popup, without digging through your system's Downloads folder.
- [ ] **Rolling 10-session context window** — Automatic tiered compression: full transcript for recent sessions, summaries for older ones, decisions-only for the oldest.

### v3.0 — Future Vision
- [ ] Full "Context Capsule" standard — a universal format readable by Claude, GPT, Gemini, local models, and future LLMs
- [ ] Cross-device sync via optional encrypted cloud backup
- [ ] Direct **"Continue in ChatGPT"** / **"Continue in Gemini"** floating buttons on the claude.ai page itself
- [ ] Firefox support (MV2 port)
- [ ] Context analytics dashboard — visualise how your conversations evolve across AIs

---

## 🤝 Contributing

Pull requests are welcome! Here's how to get started:

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Make your changes
4. Test by loading the unpacked extension in Chrome
5. Commit: `git commit -m 'Add: my feature'`
6. Push: `git push origin feature/my-feature`
7. Open a Pull Request

### Areas we especially need help with

- **Compression heuristics** — Better sentence scoring for explanation messages
- **DOM selector resilience** — All four AI sites update their DOM occasionally; hardening selectors and adding fallbacks is ongoing work
- **Firefox port** — The extension uses MV3 APIs; a Firefox MV2/MV3 port would help many users
- **Local NLP** — A browser-native compression pipeline with no external API calls
- **New AI platforms** — Perplexity, Mistral, Grok, or any other major AI chat interface

---

## 📄 License

MIT License — see [LICENSE](./LICENSE) for details.

---

## 💬 FAQ

**Q: Does this send my conversations to any server?**  
A: Only if you add a Gemini API key. Without it, everything stays 100% local in your browser's `chrome.storage.local`. With the key, message text is sent to Google's Gemini API for compression only. The cross-platform injection pipeline uses `chrome.storage.local` as a local relay — no network calls are made to any external server.

**Q: What happens when an AI site changes its DOM structure?**  
A: Each injector has multiple fallback selectors. If a site updates, one or more selectors may stop working until we push a fix. If you notice a scraper or injector breaking, please open an issue with the AI platform and a brief description of what happened.

**Q: How much storage does this use?**  
A: Chrome's `chrome.storage.local` allows 5 MB by default. 50 compressed conversations from all four AIs combined sit comfortably under 2 MB in most cases.

**Q: Can I use this with Claude's Projects feature?**  
A: Yes. The extension detects any conversation page URL pattern including project UUIDs.

**Q: The Export button doesn't appear in the ChatGPT / Gemini / DeepSeek toolbar.**  
A: These sites use framework-heavy UIs that can mount slowly. The injectors retry up to 30 times (every 500 ms) and watch for DOM changes via MutationObserver. If the button still doesn't appear, try refreshing the page. If it consistently fails, the host site may have updated its DOM — please open an issue.

**Q: Context was injected but the AI didn't auto-submit.**  
A: Some targets disable the Send button until the input field is fully hydrated. The injectors wait up to 4 seconds (20 × 200 ms) for the button to become enabled. If the wait fails, a banner message will appear asking you to press Send manually.

**Q: I want to send context to Mistral / Perplexity / another AI — can I?**  
A: Not yet natively, but you can always use the manual JSON export from the popup and paste it into any AI using the prompt templates in the [Exporting & Porting](#-exporting--porting-context-to-other-ais) section.

---

<div align="center">

Built with 🦞 and frustration by developers who kept hitting AI context limits.

**Stop losing context. Start preserving it.**

</div>
