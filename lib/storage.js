// lib/storage.js — Storage helpers for Claude Context Preserver

const STORAGE_KEY = "claude_conversations";
const MAX_CONVERSATIONS = 50; // cap to avoid blowing up storage quota

const Storage = {
  /**
   * Load all stored conversations.
   * @returns {Promise<Array>}
   */
  getAll() {
    return new Promise((resolve) => {
      chrome.storage.local.get([STORAGE_KEY], (result) => {
        if (chrome.runtime.lastError) {
          console.error("[ContextClaw] storage.getAll error:", chrome.runtime.lastError);
          resolve([]);
          return;
        }
        resolve(result[STORAGE_KEY] || []);
      });
    });
  },

  /**
   * Save a new conversation snapshot, avoiding near-duplicates.
   * @param {Object} conversation  { id, title, url, messages, savedAt }
   * @returns {Promise<void>}
   */
  async save(conversation) {
    const all = await this.getAll();

    // De-duplicate: if the last saved conversation has the same message count
    // and the same URL, just update it instead of appending a new entry.
    const last = all[all.length - 1];
    if (
      last &&
      last.url === conversation.url &&
      last.messages.length === conversation.messages.length
    ) {
      // Update the existing entry in place
      all[all.length - 1] = { ...conversation, id: last.id };
    } else {
      all.push(conversation);
    }

    // Trim oldest if over limit
    const trimmed = all.slice(-MAX_CONVERSATIONS);

    return new Promise((resolve) => {
      chrome.storage.local.set({ [STORAGE_KEY]: trimmed }, () => {
        if (chrome.runtime.lastError) {
          console.error("[ContextClaw] storage.save error:", chrome.runtime.lastError);
        }
        resolve();
      });
    });
  },

  /**
   * Delete a conversation by id.
   * @param {string} id
   */
  async deleteById(id) {
    const all = await this.getAll();
    const filtered = all.filter((c) => c.id !== id);
    return new Promise((resolve) => {
      chrome.storage.local.set({ [STORAGE_KEY]: filtered }, resolve);
    });
  },

  /**
   * Clear everything.
   */
  clear() {
    return new Promise((resolve) => {
      chrome.storage.local.set({ [STORAGE_KEY]: [] }, resolve);
    });
  },
};

// Export for use in content.js / popup.js via importScripts or direct script tag
if (typeof module !== "undefined") {
  module.exports = Storage;
}
