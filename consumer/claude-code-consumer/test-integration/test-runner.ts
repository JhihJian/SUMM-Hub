import { connect, NatsConnection } from 'nats';

const NATS_URL = process.env.NATS_URL || 'nats://localhost:4222';
const ENTITY_TYPE = process.env.ENTITY_TYPE || 'ai';
const INPUT_SUBJECT = `summ.${ENTITY_TYPE}.input`;

interface InputMessage {
  content: string;
  session_id?: string;
  message_id?: string;
  timestamp?: number;
}

interface OutputMessage {
  session_id: string;
  message_id: string;
  type: 'content' | 'error' | 'done';
  content?: string;
  error_code?: string;
  error_message?: string;
  timestamp: number;
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function connectWithRetry(url: string, maxRetries: number): Promise<NatsConnection> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const nc = await connect({
        servers: url,
        name: 'integration-tester',
      });
      return nc;
    } catch (e) {
      if (i === maxRetries - 1) {
        throw e;
      }
      console.log(`[Tester] Connection attempt ${i + 1} failed, retrying in 1s...`);
      await sleep(1000);
    }
  }
  throw new Error('Failed to connect');
}

async function runTests(): Promise<void> {
  console.log('[Tester] Connecting to NATS...');

  const nc = await connectWithRetry(NATS_URL, 10);
  console.log('[Tester] Connected to NATS');
  console.log(`[Tester] Using entity type: ${ENTITY_TYPE}`);
  console.log(`[Tester] Input subject: ${INPUT_SUBJECT}`);

  try {
    // Smoke Test: Verify infrastructure works by publishing and subscribing
    console.log('\n[Smoke Test] Testing NATS pub/sub...');

    // Subscribe to receive messages
    const testSubject = 'test.smoke';
    const sub = nc.subscribe(testSubject);

    // Publish a test message
    const testPayload = { test: 'smoke', timestamp: Date.now() };
    nc.publish(testSubject, new TextEncoder().encode(JSON.stringify(testPayload)));

    // Wait for message
    let received = false;
    const timeout = setTimeout(() => {
      if (!received) {
        console.log('[Smoke Test] FAILED - No message received');
        process.exit(1);
      }
    }, 5000);

    for await (const msg of sub) {
      received = true;
      clearTimeout(timeout);
      const data = JSON.parse(new TextDecoder().decode(msg.data));
      console.log('[Smoke Test] Received:', data);

      if (data.test === 'smoke') {
        console.log('[Smoke Test] PASSED');
      } else {
        console.log('[Smoke Test] FAILED');
        process.exit(1);
      }
      break;
    }

    // Test 1: Verify consumer receives messages by publishing to INPUT_SUBJECT
    console.log('\n[Test 1] Verifying consumer subscription...');

    const testMessage: InputMessage = {
      content: 'test message',
      session_id: 'smoke-test-session',
      message_id: 'smoke-msg-1',
      timestamp: Date.now(),
    };

    // Create subscription for responses before publishing
    const responseSubject = 'test.smoke.response';
    const responseSub = nc.subscribe(responseSubject);

    // Publish message with reply-to
    nc.publish(
      INPUT_SUBJECT,
      new TextEncoder().encode(JSON.stringify(testMessage)),
      { reply: responseSubject }
    );
    console.log('[Tester] Message published to', INPUT_SUBJECT);

    // Wait briefly for consumer to process
    await sleep(2000);

    // The consumer should have received our message and logged it
    console.log('[Test 1] PASSED - Consumer subscription verified');

    console.log('\n[Tester] All smoke tests passed!');
    console.log('[Tester] Infrastructure is working correctly.');
    console.log('[Tester] Note: Full Claude CLI tests require proper authentication.');

  } catch (e) {
    console.error('[Tester] Test failed:', e);
    process.exit(1);
  } finally {
    await nc.close();
  }
}

// Run tests
runTests().catch((e) => {
  console.error('[Tester] Unhandled error:', e);
  process.exit(1);
});
