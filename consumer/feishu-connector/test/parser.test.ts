import { describe, it, expect } from "vitest";
import { parseMessage, extractTextFromContent } from "../src/parser.js";
import type { FeishuMessageEvent } from "../src/types.js";

function createTestEvent(params: {
  chatType: "p2p" | "group";
  text: string;
  mentions?: FeishuMessageEvent["message"]["mentions"];
  chatId?: string;
  messageId?: string;
  senderOpenId?: string;
}): FeishuMessageEvent {
  return {
    sender: {
      sender_id: {
        open_id: params.senderOpenId ?? "ou_sender",
        user_id: "u_sender",
      },
    },
    message: {
      message_id: params.messageId ?? "om_test",
      chat_id: params.chatId ?? "oc_test",
      chat_type: params.chatType,
      message_type: "text",
      content: JSON.stringify({ text: params.text }),
      mentions: params.mentions,
    },
  };
}

describe("extractTextFromContent", () => {
  it("extracts text from JSON content", () => {
    const content = JSON.stringify({ text: "hello world" });
    expect(extractTextFromContent(content)).toBe("hello world");
  });

  it("returns empty string for invalid JSON", () => {
    expect(extractTextFromContent("not json")).toBe("");
  });

  it("returns empty string for missing text field", () => {
    expect(extractTextFromContent(JSON.stringify({}))).toBe("");
  });
});

describe("parseMessage", () => {
  const botOpenId = "ou_bot";

  describe("private chat (p2p)", () => {
    it("processes message without @bot mention", () => {
      const event = createTestEvent({
        chatType: "p2p",
        text: "hello",
      });

      const result = parseMessage(event, botOpenId, "#");

      expect(result).not.toBeNull();
      expect(result?.shouldProcess).toBe(true);
      expect(result?.content).toBe("hello");
      expect(result?.sessionId).toBe("oc_test"); // Uses chat_id as session
    });

    it("extracts session_id from #session-xxx prefix", () => {
      const event = createTestEvent({
        chatType: "p2p",
        text: "#session-abc hello world",
      });

      const result = parseMessage(event, botOpenId, "#");

      expect(result).not.toBeNull();
      expect(result?.sessionId).toBe("abc");
      expect(result?.content).toBe("hello world");
    });

    it("uses chat_id as session when no prefix", () => {
      const event = createTestEvent({
        chatType: "p2p",
        text: "no prefix here",
        chatId: "oc_chat123",
      });

      const result = parseMessage(event, botOpenId, "#");

      expect(result?.sessionId).toBe("oc_chat123");
    });
  });

  describe("group chat", () => {
    it("skips message without @bot mention", () => {
      const event = createTestEvent({
        chatType: "group",
        text: "hello everyone",
        mentions: [], // No mentions
      });

      const result = parseMessage(event, botOpenId, "#");

      expect(result).toBeNull();
    });

    it("processes message with @bot mention", () => {
      const event = createTestEvent({
        chatType: "group",
        text: "@_user_1 hello",
        mentions: [
          {
            key: "@_user_1",
            id: { open_id: botOpenId },
            name: "Bot",
          },
        ],
      });

      const result = parseMessage(event, botOpenId, "#");

      expect(result).not.toBeNull();
      expect(result?.shouldProcess).toBe(true);
      expect(result?.content).toBe("hello"); // @mention removed
    });

    it("extracts session_id from #session-xxx prefix in group", () => {
      const event = createTestEvent({
        chatType: "group",
        text: "@_user_1 #session-xyz task for you",
        mentions: [
          {
            key: "@_user_1",
            id: { open_id: botOpenId },
            name: "Bot",
          },
        ],
      });

      const result = parseMessage(event, botOpenId, "#");

      expect(result).not.toBeNull();
      expect(result?.sessionId).toBe("xyz");
      expect(result?.content).toBe("task for you");
    });
  });

  describe("session prefix patterns", () => {
    it("handles #session- prefix with spaces", () => {
      const event = createTestEvent({
        chatType: "p2p",
        text: "#session-my-session-123  content here  ",
      });

      const result = parseMessage(event, botOpenId, "#");

      expect(result?.sessionId).toBe("my-session-123");
      expect(result?.content).toBe("content here");
    });

    it("handles custom prefix", () => {
      const event = createTestEvent({
        chatType: "p2p",
        text: "$session-custom custom prefix",
      });

      const result = parseMessage(event, botOpenId, "$");

      expect(result?.sessionId).toBe("custom");
      expect(result?.content).toBe("custom prefix");
    });

    it("extracts only first session prefix", () => {
      const event = createTestEvent({
        chatType: "p2p",
        text: "#session-first #session-second text",
      });

      const result = parseMessage(event, botOpenId, "#");

      expect(result?.sessionId).toBe("first");
      expect(result?.content).toBe("#session-second text");
    });
  });

  describe("mention cleanup", () => {
    it("removes all @mention placeholders", () => {
      const event = createTestEvent({
        chatType: "group",
        text: "@_user_1 @_user_2  message with mentions  ",
        mentions: [
          { key: "@_user_1", id: { open_id: botOpenId }, name: "Bot" },
          { key: "@_user_2", id: { open_id: "ou_other" }, name: "Other" },
        ],
      });

      const result = parseMessage(event, botOpenId, "#");

      expect(result?.content).toBe("message with mentions");
    });
  });
});
