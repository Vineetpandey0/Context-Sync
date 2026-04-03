// lib/compressor.js — Lightweight conversation compressor/summarizer

const Compressor = {
  /**
   * Compresses a message array into a tighter form, trimming long content
   * so we don't blow the 5MB chrome.storage.local quota.
   * @param {Array<{type: string, content: string, timestamp: string}>} messages
   * @param {number} maxPerMessage  Max chars to keep per message (default 2000)
   * @returns {Array}
   */
  compress(messages, maxPerMessage = 2000) {
    return messages.map((msg) => ({
      type: msg.type,
      content:
        msg.content.length > maxPerMessage
          ? msg.content.substring(0, maxPerMessage) + "…"
          : msg.content,
      timestamp: msg.timestamp,
    }));
  },

  /**
   * Estimates the byte size of the conversations array.
   * @param {Array} conversations
   * @returns {number} approximate bytes
   */
  estimateSize(conversations) {
    return JSON.stringify(conversations).length;
  },
};

if (typeof module !== "undefined") {
  module.exports = Compressor;
}
