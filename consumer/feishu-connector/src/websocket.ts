import * as Lark from "@larksuiteoapi/node-sdk";
import type { FeishuConnectorConfig } from "./types.js";

export interface WebSocketClientOptions {
  config: FeishuConnectorConfig;
  onMessage: (event: unknown) => Promise<void>;
  onError?: (error: Error) => void;
  onConnected?: () => void;
  onDisconnected?: () => void;
  logger?: typeof console.log;
}

export interface WebSocketClient {
  start: () => Promise<void>;
  stop: () => void;
  isConnected: () => boolean;
}

/**
 * Create a Feishu WebSocket client with automatic reconnection
 *
 * Features:
 * - Exponential backoff reconnection (max 30s interval)
 * - Graceful shutdown support
 * - Event dispatcher for message handling
 */
export function createWebSocketClient(
  options: WebSocketClientOptions,
): WebSocketClient {
  const { config, onMessage, onError, onConnected, onDisconnected, logger } =
    options;
  const log = logger ?? console.log;

  let wsClient: Lark.WSClient | null = null;
  let eventDispatcher: Lark.EventDispatcher | null = null;
  let isRunning = false;
  let reconnectAttempts = 0;
  const maxReconnectInterval = 30_000;
  const baseReconnectInterval = 1_000;

  function getReconnectDelay(): number {
    const delay = Math.min(
      baseReconnectInterval * Math.pow(2, reconnectAttempts),
      maxReconnectInterval,
    );
    return delay;
  }

  async function connect(): Promise<void> {
    if (!isRunning) return;

    try {
      // Create event dispatcher
      eventDispatcher = new Lark.EventDispatcher({});

      // Register message handler
      eventDispatcher.register({
        "im.message.receive_v1": async (data) => {
          try {
            await onMessage(data);
          } catch (err) {
            log("[feishu-connector] Error handling message:", err);
          }
        },
      });

      // Create WebSocket client
      wsClient = new Lark.WSClient({
        appId: config.appId,
        appSecret: config.appSecret,
        loggerLevel: Lark.LoggerLevel.info,
      });

      // Start connection
      wsClient.start({ eventDispatcher });

      reconnectAttempts = 0;
      log("[feishu-connector] WebSocket connected");
      onConnected?.();

      // Wait for disconnect and attempt reconnection
      await new Promise<void>((resolve) => {
        const checkInterval = setInterval(() => {
          if (!isRunning) {
            clearInterval(checkInterval);
            resolve();
          }
        }, 1000);
      });
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      log("[feishu-connector] WebSocket error:", error.message);
      onError?.(error);

      if (isRunning) {
        const delay = getReconnectDelay();
        log(
          `[feishu-connector] Reconnecting in ${delay}ms (attempt ${reconnectAttempts + 1})`,
        );
        reconnectAttempts++;
        onDisconnected?.();

        await new Promise((resolve) => setTimeout(resolve, delay));
        return connect();
      }
    }
  }

  return {
    start: async () => {
      isRunning = true;
      log("[feishu-connector] Starting WebSocket client...");
      await connect();
    },

    stop: () => {
      log("[feishu-connector] Stopping WebSocket client...");
      isRunning = false;
      if (wsClient) {
        // WSClient doesn't have explicit close, but setting isRunning false
        // will prevent reconnection
        wsClient = null;
        eventDispatcher = null;
      }
      onDisconnected?.();
    },

    isConnected: () => {
      return wsClient !== null && isRunning;
    },
  };
}
