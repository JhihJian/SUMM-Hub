/**
 * E2E Test Runner
 *
 * Publishes test messages and verifies the flow through the system
 */

const { connect } = require("nats");

async function main() {
  const nc = await connect({ servers: process.env.NATS_URL || "nats://localhost:4222" });
  console.log("[e2e-runner] Connected to NATS");

  let testsPassed = 0;
  let testsFailed = 0;

  // Test 1: Verify NATS connection
  console.log("\n[e2e-runner] Test 1: NATS Connection");
  try {
    const info = nc.info;
    console.log("[e2e-runner] Connected to NATS server:", info.server_id);
    testsPassed++;
  } catch (err) {
    console.error("[e2e-runner] Test 1 FAILED:", err.message);
    testsFailed++;
  }

  // Test 2: Publish message to summ.ai.input
  console.log("\n[e2e-runner] Test 2: Publish to summ.ai.input");
  try {
    const testMessage = {
      id: `test-${Date.now()}`,
      session_id: "test-session-123",
      content: { text: "Hello from E2E test" },
      context: {
        source: "feishu",
        chat_id: "oc_test_chat",
        message_id: "om_test_msg",
        chat_type: "p2p",
      },
      timestamp: Date.now(),
    };

    nc.publish("summ.ai.input", new TextEncoder().encode(JSON.stringify(testMessage)));
    console.log("[e2e-runner] Published test message:", testMessage.id);
    testsPassed++;
  } catch (err) {
    console.error("[e2e-runner] Test 2 FAILED:", err.message);
    testsFailed++;
  }

  // Test 3: Subscribe to summ.ai.output
  console.log("\n[e2e-runner] Test 3: Subscribe to summ.ai.output");
  try {
    const sub = nc.subscribe("summ.ai.output", { max: 1 });

    const timeout = setTimeout(() => {
      console.error("[e2e-runner] Test 3 FAILED: Timeout waiting for response");
      testsFailed++;
      sub.unsubscribe();
    }, 10000);

    for await (const msg of sub) {
      clearTimeout(timeout);
      const output = JSON.parse(new TextDecoder().decode(msg.data));
      console.log("[e2e-runner] Received output:", output.type, output.session_id);

      if (output.session_id === "test-session-123") {
        console.log("[e2e-runner] Test 3 PASSED: Received matching response");
        testsPassed++;
      } else {
        console.error("[e2e-runner] Test 3 FAILED: Session ID mismatch");
        testsFailed++;
      }
      break;
    }
  } catch (err) {
    console.error("[e2e-runner] Test 3 FAILED:", err.message);
    testsFailed++;
  }

  // Summary
  console.log("\n" + "=".repeat(50));
  console.log(`[e2e-runner] Tests Passed: ${testsPassed}`);
  console.log(`[e2e-runner] Tests Failed: ${testsFailed}`);
  console.log("=".repeat(50));

  await nc.close();

  if (testsFailed > 0) {
    console.log("[e2e-runner] E2E tests FAILED");
    process.exit(1);
  } else {
    console.log("[e2e-runner] E2E tests PASSED");
    process.exit(0);
  }
}

main().catch((err) => {
  console.error("[e2e-runner] Fatal error:", err);
  process.exit(1);
});
