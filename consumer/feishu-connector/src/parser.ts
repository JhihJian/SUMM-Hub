import type { FeishuMessageEvent, ParsedMessage } from "./types.js";

/**
 * Extract text content from Feishu message content
 * Feishu text messages have content as JSON: {"text": "actual message"}
 */
export function extractTextFromContent(content: string): string {
  try {
    const parsed = JSON.parse(content) as { text?: string };
    return parsed.text ?? "";
  } catch {
    return "";
  }
}

/**
 * Session prefix pattern: {prefix}session-{sessionId}
 * Example: #session-abc123
 */
const SESSION_PATTERN = /^session-(\S+)/;

/**
 * Parse a Feishu message event into a structured format
 *
 * @param event - The Feishu WebSocket message event
 * @param botOpenId - The bot's open_id for @mention detection
 * @param triggerPrefix - The prefix for session extraction (default: #)
 * @returns ParsedMessage if should process, null if should skip
 */
export function parseMessage(
  event: FeishuMessageEvent,
  botOpenId: string,
  triggerPrefix: string = "#",
): ParsedMessage | null {
  const { message, sender } = event;
  const { chat_id, chat_type, message_id, content, mentions } = message;

  // Extract text from Feishu content
  const rawText = extractTextFromContent(content);
  if (!rawText.trim()) {
    return null;
  }

  const isGroupChat = chat_type === "group";

  // Check for @bot mention in group chats
  if (isGroupChat) {
    const hasBotMention = (mentions ?? []).some(
      (m) => m.id.open_id === botOpenId,
    );
    if (!hasBotMention) {
      return null; // Skip messages without @bot in group chats
    }
  }

  // Extract mention keys for cleanup
  const mentionKeys = (mentions ?? []).map((m) => m.key);

  // Clean content by removing @mention placeholders
  let cleanText = removeMentionPlaceholders(rawText, mentionKeys);

  // Trim after mention removal to handle leading/trailing spaces
  cleanText = cleanText.trim();

  // Extract session_id from prefix
  let sessionId: string;
  const prefixPattern = new RegExp(
    `^${escapeRegex(triggerPrefix)}session-(\\S+)\\s*`,
  );
  const match = cleanText.match(prefixPattern);

  if (match) {
    sessionId = match[1];
    cleanText = cleanText.slice(match[0].length);
  } else {
    // Use chat_id as session_id when no prefix
    sessionId = chat_id;
  }

  // Trim and normalize whitespace
  cleanText = cleanText.replace(/\s+/g, " ").trim();

  return {
    sessionId,
    content: cleanText,
    messageId: message_id,
    chatId: chat_id,
    chatType: chat_type === "group" ? "group" : "p2p",
    senderOpenId: sender.sender_id.open_id,
    shouldProcess: true,
  };
}

/**
 * Remove @mention placeholders from text
 * Feishu uses placeholders like @_user_1 for mentions
 */
function removeMentionPlaceholders(
  text: string,
  mentionKeys: string[],
): string {
  let result = text;
  for (const key of mentionKeys) {
    result = result.replace(
      new RegExp(escapeRegex(key), "g"),
      "",
    );
  }
  return result;
}

/**
 * Escape special regex characters
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
