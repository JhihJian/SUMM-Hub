import { connect, type NatsConnection, type Subscription } from "nats";
import { v4 as uuidv4 } from "uuid";
import type {
  FeishuConnectorConfig,
  FeishuMessageEvent,
  InputMessage,
  OutputMessage,
} from "./types.js";
import { parseMessage } from "./parser.js";
import { createWebSocketClient, type WebSocketClient } from "./websocket.js";
import { FeishuResponder } from "./responder.js";

export interface FeishuConnectorOptions {
  config: FeishuConnectorConfig;
  botOpenId?: string;
  logger?: typeof console.log;
}

/**
 * FeishuConnector - Main connector class
 *
 * Integrates:
 * - NATS connection for message bus
 * - WebSocket client for Feishu events
 * - Message parser for content extraction
 * - Responder for Feishu API replies
 */
export class FeishuConnector {
  private config: FeishuConnectorConfig;
  private botOpenId: string;
  private log: typeof console.log;

  private nc: NatsConnection | null = null;
  private wsClient: WebSocketClient | null = null;
  private responder: FeishuResponder | null = null;
  private outputSubscription: Subscription | null = null;

  // Track message contexts for reply routing
  // Maps: message_id -> { chat_id, reply_to_message_id }
  private messageContexts = new Map<
    string,
    { chatId: string; replyTo: string }
  >();

  constructor(options: FeishuConnectorOptions) {
    this.config = options.config;
    this.botOpenId = options.botOpenId ?? "";
    this.log = options.logger ?? console.log;
  }

  /**
   * Start the connector
   */
  async start(): Promise<void> {
    this.log("[feishu-connector] Starting...");

    // Connect to NATS
    this.nc = await connect({ servers: this.config.natsUrl });
    this.log(`[feishu-connector] Connected to NATS: ${this.config.natsUrl}`);

    // Create responder
    this.responder = new FeishuResponder({
      appId: this.config.appId,
      appSecret: this.config.appSecret,
      logger: this.log,
    });

    // Subscribe to AI output messages
    this.outputSubscription = this.nc.subscribe("summ.ai.output", {
      queue: "feishu-connector",
    });
    this.startOutputHandler();

    // Create and start WebSocket client
    this.wsClient = createWebSocketClient({
      config: this.config,
      onMessage: this.handleFeishuMessage.bind(this),
      onError: (err) => {
        this.log("[feishu-connector] WebSocket error:", err.message);
      },
      onConnected: () => {
        this.log("[feishu-connector] WebSocket connected");
      },
      onDisconnected: () => {
        this.log("[feishu-connector] WebSocket disconnected");
      },
      logger: this.log,
    });

    await this.wsClient.start();
  }

  /**
   * Stop the connector
   */
  async stop(): Promise<void> {
    this.log("[feishu-connector] Stopping...");

    if (this.wsClient) {
      this.wsClient.stop();
      this.wsClient = null;
    }

    if (this.outputSubscription) {
      this.outputSubscription.unsubscribe();
      this.outputSubscription = null;
    }

    if (this.nc) {
      await this.nc.close();
      this.nc = null;
    }

    this.log("[feishu-connector] Stopped");
  }

  /**
   * Handle incoming Feishu message from WebSocket
   */
  private async handleFeishuMessage(data: unknown): Promise<void> {
    try {
      const event = data as FeishuMessageEvent;
      const parsed = parseMessage(
        event,
        this.botOpenId,
        this.config.triggerPrefix,
      );

      if (!parsed || !parsed.shouldProcess) {
        return;
      }

      // Store context for reply routing
      this.messageContexts.set(parsed.messageId, {
        chatId: parsed.chatId,
        replyTo: parsed.messageId,
      });

      // Create NATS input message
      const inputMessage: InputMessage = {
        id: uuidv4(),
        session_id: parsed.sessionId,
        content: { text: parsed.content },
        context: {
          source: "feishu",
          chat_id: parsed.chatId,
          message_id: parsed.messageId,
          chat_type: parsed.chatType,
          sender_open_id: parsed.senderOpenId,
          reply_to: parsed.messageId,
        },
        timestamp: Date.now(),
      };

      // Publish to NATS
      this.nc?.publish("summ.ai.input", this.encodeMessage(inputMessage));

      this.log(
        `[feishu-connector] Published message to NATS: session=${parsed.sessionId}, content="${parsed.content.slice(0, 50)}..."`,
      );
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.log("[feishu-connector] Error handling Feishu message:", error.message);
    }
  }

  /**
   * Start handling AI output messages from NATS
   */
  private startOutputHandler(): void {
    const subscription = this.outputSubscription;
    if (!subscription) return;

    (async () => {
      for await (const msg of subscription) {
        if (!msg) continue;
        try {
          const output = this.decodeMessage(msg.data) as OutputMessage;

          // Find the context for this session
          // The output message should contain the original message_id in context
          const context = this.extractReplyContext(output);

          if (!context) {
            this.log(
              `[feishu-connector] No context found for session ${output.session_id}`,
            );
            continue;
          }

          // Send reply via Feishu API
          await this.responder?.handleOutputMessage(output, context);

          // Cleanup context on done
          if (output.type === "done") {
            this.messageContexts.delete(context.replyTo);
          }
        } catch (err) {
          const error = err instanceof Error ? err : new Error(String(err));
          this.log("[feishu-connector] Error handling output message:", error.message);
        }
      }
    })();
  }

  /**
   * Extract reply context from output message
   */
  private extractReplyContext(
    output: OutputMessage,
  ): { replyTo: string } | null {
    // The session_id should map to a message context
    // For now, we use the session_id as the lookup key
    // This assumes session_id is stored when we have it
    for (const [messageId, context] of this.messageContexts.entries()) {
      // Check if this message was published with this session
      // In practice, we'd need to track session_id -> message_id mapping
      if (this.messageContexts.has(output.session_id)) {
        return this.messageContexts.get(output.session_id) ?? null;
      }
    }

    // Fallback: assume session_id is the original message_id for direct sessions
    const directContext = this.messageContexts.get(output.session_id);
    if (directContext) {
      return directContext;
    }

    return null;
  }

  /**
   * Encode message for NATS
   */
  private encodeMessage(msg: object): Uint8Array {
    return new TextEncoder().encode(JSON.stringify(msg));
  }

  /**
   * Decode message from NATS
   */
  private decodeMessage(data: Uint8Array): unknown {
    return JSON.parse(new TextDecoder().decode(data));
  }
}
