import { FeishuConnector } from "./connector.js";
import type { FeishuConnectorConfig } from "./types.js";

/**
 * Environment configuration
 */
function getConfig(): FeishuConnectorConfig {
  const required = ["FEISHU_APP_ID", "FEISHU_APP_SECRET"];

  for (const key of required) {
    if (!process.env[key]) {
      throw new Error(`Missing required environment variable: ${key}`);
    }
  }

  return {
    appId: process.env.FEISHU_APP_ID!,
    appSecret: process.env.FEISHU_APP_SECRET!,
    natsUrl: process.env.NATS_URL || "nats://localhost:4222",
    triggerPrefix: process.env.TRIGGER_PREFIX || "#",
  };
}

/**
 * Main entry point
 */
async function main() {
  const config = getConfig();

  console.log("[feishu-connector] Starting...");
  console.log(`[feishu-connector] NATS URL: ${config.natsUrl}`);
  console.log(`[feishu-connector] Trigger prefix: ${config.triggerPrefix}`);

  // Create connector
  const connector = new FeishuConnector({
    config,
  });

  // Handle graceful shutdown
  const shutdown = async () => {
    console.log("[feishu-connector] Shutting down...");
    await connector.stop();
    console.log("[feishu-connector] Shutdown complete");
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  // Start connector (blocks until stopped)
  await connector.start();
}

main().catch((err) => {
  console.error("[feishu-connector] Fatal error:", err);
  process.exit(1);
});
