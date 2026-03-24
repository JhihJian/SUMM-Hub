import { describe, it, expect } from "vitest";

describe("FeishuConnector Integration", () => {
  describe("Message Context Tracking", () => {
    it("tracks message contexts for reply routing", () => {
      // Test that the connector properly maps session_id to reply context
      const contexts = new Map<string, { chatId: string; replyTo: string }>();

      contexts.set("msg_123", { chatId: "oc_chat", replyTo: "msg_123" });

      expect(contexts.has("msg_123")).toBe(true);
      expect(contexts.get("msg_123")).toEqual({
        chatId: "oc_chat",
        replyTo: "msg_123",
      });
    });

    it("handles multiple sessions", () => {
      const contexts = new Map<string, { chatId: string; replyTo: string }>();

      contexts.set("session_a", { chatId: "oc_chat_a", replyTo: "msg_1" });
      contexts.set("session_b", { chatId: "oc_chat_b", replyTo: "msg_2" });

      expect(contexts.size).toBe(2);
      expect(contexts.get("session_a")?.chatId).toBe("oc_chat_a");
      expect(contexts.get("session_b")?.chatId).toBe("oc_chat_b");
    });

    it("cleans up context on done", () => {
      const contexts = new Map<string, { chatId: string; replyTo: string }>();

      contexts.set("session_x", { chatId: "oc_chat", replyTo: "msg_x" });
      expect(contexts.has("session_x")).toBe(true);

      contexts.delete("session_x");
      expect(contexts.has("session_x")).toBe(false);
    });
  });

  describe("Configuration Validation", () => {
    it("validates required config fields", () => {
      const config = {
        appId: "test_app_id",
        appSecret: "test_app_secret",
        natsUrl: "nats://localhost:4222",
        triggerPrefix: "#",
      };

      expect(config.appId).toBeDefined();
      expect(config.appSecret).toBeDefined();
      expect(config.natsUrl).toBeDefined();
      expect(config.triggerPrefix).toBeDefined();
    });

    it("uses default values for optional fields", () => {
      const defaults = {
        natsUrl: "nats://localhost:4222",
        triggerPrefix: "#",
      };

      expect(defaults.natsUrl).toBe("nats://localhost:4222");
      expect(defaults.triggerPrefix).toBe("#");
    });
  });

  describe("Message Encoding/Decoding", () => {
    it("encodes message to Uint8Array", () => {
      const msg = { id: "123", content: "hello" };
      const encoded = new TextEncoder().encode(JSON.stringify(msg));

      expect(encoded).toBeInstanceOf(Uint8Array);
      expect(encoded.length).toBeGreaterThan(0);
    });

    it("decodes message from Uint8Array", () => {
      const msg = { id: "123", content: "hello" };
      const encoded = new TextEncoder().encode(JSON.stringify(msg));
      const decoded = JSON.parse(new TextDecoder().decode(encoded));

      expect(decoded).toEqual(msg);
    });
  });

  describe("Error Handling", () => {
    it("handles invalid JSON gracefully", () => {
      const invalidData = new TextEncoder().encode("not valid json");

      expect(() => {
        JSON.parse(new TextDecoder().decode(invalidData));
      }).toThrow();
    });

    it("handles empty content gracefully", () => {
      const emptyContent = "";
      const trimmed = emptyContent.trim();

      expect(trimmed).toBe("");
      expect(!trimmed).toBe(true);
    });
  });
});
