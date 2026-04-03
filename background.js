// background.js — Service worker for Claude Context Preserver

const STORAGE_KEY = "claude_conversations";

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.action) {

    case "getConversations": {
      chrome.storage.local.get([STORAGE_KEY], (result) => {
        if (chrome.runtime.lastError) {
          sendResponse({ conversations: [], error: chrome.runtime.lastError.message });
          return;
        }
        sendResponse({ conversations: result[STORAGE_KEY] || [] });
      });
      return true; // async
    }

    case "deleteConversation": {
      chrome.storage.local.get([STORAGE_KEY], (result) => {
        if (chrome.runtime.lastError) {
          sendResponse({ success: false, error: chrome.runtime.lastError.message });
          return;
        }
        const all = result[STORAGE_KEY] || [];
        const filtered = all.filter((c) => c.id !== message.id);
        chrome.storage.local.set({ [STORAGE_KEY]: filtered }, () => {
          sendResponse({ success: true });
        });
      });
      return true;
    }

    case "clearConversations": {
      chrome.storage.local.set({ [STORAGE_KEY]: [] }, () => {
        if (chrome.runtime.lastError) {
          sendResponse({ success: false, error: chrome.runtime.lastError.message });
          return;
        }
        sendResponse({ success: true });
      });
      return true;
    }

    case "scrapeActiveTab": {
      // Ask the content script on the active Claude tab to scrape now
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const tab = tabs[0];
        if (!tab || !tab.url || !tab.url.includes("claude.ai")) {
          sendResponse({ ok: false, error: "No active Claude tab found" });
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

    default:
      break;
  }
});