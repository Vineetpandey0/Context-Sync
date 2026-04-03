// lib/capsule.js — Builds a "Context Capsule" from scraped messages

const Capsule = {
  /**
   * Builds a structured capsule object from raw messages.
   * @param {Array<{type, content, timestamp}>} messages
   * @param {string} url  Current page URL
   * @returns {Object}  Conversation capsule ready for storage
   */
  build(messages, url) {
    const title = Capsule._inferTitle(messages, url);
    return {
      id: `conv_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      title,
      url,
      messages,
      savedAt: new Date().toISOString(),
      version: 1,
    };
  },

  /**
   * Try to get a meaningful title from the first user message or the URL.
   */
  _inferTitle(messages, url) {
    const firstUser = messages.find((m) => m.type === "user");
    if (firstUser && firstUser.content.length > 0) {
      return firstUser.content.substring(0, 60).replace(/\n/g, " ").trim() + (firstUser.content.length > 60 ? "…" : "");
    }
    // Fall back to the path segment (e.g. the conversation UUID from claude.ai)
    try {
      const u = new URL(url);
      const parts = u.pathname.split("/").filter(Boolean);
      return parts[parts.length - 1] || "Untitled Conversation";
    } catch {
      return "Untitled Conversation";
    }
  },
};

if (typeof module !== "undefined") {
  module.exports = Capsule;
}
