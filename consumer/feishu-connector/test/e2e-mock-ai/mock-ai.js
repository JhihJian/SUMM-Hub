/**
 * Mock AI Consumer for E2E Testing
 *
 * Subscribes to summ.ai.input and responds on summ.ai.output
 */

const { connect } = require("nats");

async function main() {
  const nc = await connect({ servers: process.env.NATS_URL || "nats://localhost:4222" });
  console.log("[mock-ai] Connected to NATS");

  // Subscribe to AI input messages
  const sub = nc.subscribe("summ.ai.input", { queue: "mock-ai" });
  console.log("[mock-ai] Subscribed to summ.ai.input");

  (async () => {
    for await (const msg of sub) {
      try {
        const input = JSON.parse(new TextDecoder().decode(msg.data));
        console.log("[mock-ai] Received:", input.id, input.session_id);

        // Send content response
        const output = {
          session_id: input.session_id,
          message_id: `reply-${Date.now()}`,
          timestamp: Date.now(),
          type: "content",
          content: `Mock AI response for: ${input.content?.text || "empty"}`,
        };

        nc.publish("summ.ai.output", new TextEncoder().encode(JSON.stringify(output)));
        console.log("[mock-ai] Sent response for", input.session_id);

        // Send done signal
        const done = {
          ...output,
          type: "done",
          content: undefined,
        };
        nc.publish("summ.ai.output", new TextEncoder().encode(JSON.stringify(done)));
      } catch (err) {
        console.error("[mock-ai] Error:", err.message);
      }
    }
  })();

  // Keep running
  process.on("SIGTERM", async () => {
    console.log("[mock-ai] Shutting down...");
    await nc.close();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error("[mock-ai] Fatal error:", err);
  process.exit(1);
});
