import * as Lark from "@larksuiteoapi/node-sdk";
import type { OutputMessage } from "./types.js";

export interface ResponderOptions {
  appId: string;
  appSecret: string;
  logger?: typeof console.log;
}

/**
 * Feishu API Responder
 * Handles replying to messages via Feishu API
 */
export class FeishuResponder {
  private client: Lark.Client;
  private log: typeof console.log;

  constructor(options: ResponderOptions) {
    this.client = new Lark.Client({
      appId: options.appId,
      appSecret: options.appSecret,
      domain: Lark.Domain.Feishu,
    });
    this.log = options.logger ?? console.log;
  }

  /**
   * Reply to a message with AI response content
   *
   * @param messageId - The original message ID to reply to
   * @param content - The response content (markdown supported)
   * @returns The reply message ID
   */
  async replyToMessage(
    messageId: string,
    content: string,
  ): Promise<string> {
    try {
      // Use post message type with markdown content
      const postContent = this.buildPostContent(content);

      const response = await this.client.im.v1.message.reply({
        path: {
          message_id: messageId,
        },
        data: {
          content: JSON.stringify(postContent),
          msg_type: "post",
        },
      });

      const replyId = response.data?.message_id ?? "";
      this.log(`[feishu-connector] Replied to message ${messageId}: ${replyId}`);
      return replyId;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.log(`[feishu-connector] Failed to reply to message ${messageId}:`, error.message);
      throw error;
    }
  }

  /**
   * Handle output message from NATS
   *
   * @param message - The output message from AI
   * @param context - Context containing the original message ID to reply to
   */
  async handleOutputMessage(
    message: OutputMessage,
    context: { replyTo: string },
  ): Promise<string> {
    if (message.type === "done") {
      this.log(`[feishu-connector] Session ${message.session_id} completed`);
      return "";
    }

    if (message.type === "error") {
      const errorContent = `❌ **Error**\n\n${message.error_message ?? "Unknown error"}`;
      return this.replyToMessage(context.replyTo, errorContent);
    }

    // Content type
    if (message.content) {
      return this.replyToMessage(context.replyTo, message.content);
    }

    return "";
  }

  /**
   * Build Feishu post content from markdown text
   */
  private buildPostContent(text: string): object {
    return {
      zh_cn: {
        title: "",
        content: [[{ tag: "text", text }]],
      },
    };
  }
}
