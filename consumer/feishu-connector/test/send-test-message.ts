/**
 * Integration Test: Send Test Message to NATS
 *
 * Usage:
 *   1. Start NATS: docker compose up -d nats
 *   2. Start connector: npm run dev
 *   3. Run this script: npx ts-node test/send-test-message.ts
 */

import { connect, type NatsConnection } from "nats";

const NATS_URL = process.env.NATS_URL || "nats://localhost:4222";

interface TestMessage {
  id: string;
  session_id: string;
  content: { text: string };
  context: {
    source: "feishu";
    chat_id: string;
    message_id: string;
    chat_type: "p2p" | "group";
    sender_open_id?: string;
    reply_to: string;
  };
  timestamp: number;
}

async function main(): Promise<void> {
  console.log(`[test] Connecting to NATS: ${NATS_URL}`);

  let nc: NatsConnection;
  try {
    nc = await connect({ servers: NATS_URL });
    console.log("[test] Connected to NATS");
  } catch (err) {
    console.error("[test] Failed to connect to NATS:", err);
    process.exit(1);
  }

  // Create test message
  const testMessage: TestMessage = {
    id: `test-${Date.now()}`,
    session_id: "test-session-123",
    content: { text: "Hello from integration test" },
    context: {
      source: "feishu",
      chat_id: "oc_test_chat",
      message_id: "om_test_msg",
      chat_type: "p2p",
      sender_open_id: "ou_test_user",
      reply_to: "om_test_msg",
    },
    timestamp: Date.now(),
  };

  // Subscribe to output first
  const sub = nc.subscribe("summ.ai.output");
  const outputPromise = (async () => {
    const messages: unknown[] = [];
    for await (const msg of sub) {
      const output = JSON.parse(new TextDecoder().decode(msg.data));
      messages.push(output);
      console.log("[test] Received output:", output.type, output.session_id);
      if (output.type === "done") break;
    }
    return messages;
  })();

  // Publish test message
  const encoded = new TextEncoder().encode(JSON.stringify(testMessage));
  nc.publish("summ.ai.input", encoded);
  console.log("[test] Sent message:", testMessage.id);
  console.log("[test] Session ID:", testMessage.session_id);

  // Wait for responses with timeout
  const timeout = setTimeout(() => {
    console.log("[test] Timeout waiting for response (10s)");
    sub.unsubscribe();
  }, 10000);

  try {
    const messages = await outputPromise;
    clearTimeout(timeout);

    console.log("\n[test] Test Results:");
    console.log(`  - Messages received: ${messages.length}`);

    if (messages.length > 0) {
      console.log("  ✓ Message flow working");
    } else {
      console.log("  ✗ No messages received (is claude-code-consumer running?)");
    }
  } catch {
    clearTimeout(timeout);
    console.log("[test] No response received");
  }

  await nc.close();
  console.log("[test] Done");
}

main().catch((err) => {
  console.error("[test] Error:", err);
  process.exit(1);
});
