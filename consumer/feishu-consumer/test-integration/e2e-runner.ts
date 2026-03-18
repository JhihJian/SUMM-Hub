import { connect, NatsConnection } from 'nats';

const NATS_URL = process.env.NATS_URL || 'nats://localhost:4222';
const TIMEOUT_MS = parseInt(process.env.E2E_TIMEOUT_MS || '10000', 10);

interface AckMessage {
  messageId: string;
  originalId: string;
  msgType: string;
  timestamp: number;
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function connectWithRetry(url: string, maxRetries: number): Promise<NatsConnection> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await connect({ servers: url, name: 'e2e-runner' });
    } catch (e) {
      if (i === maxRetries - 1) throw e;
      console.log(`[E2E] Connection attempt ${i + 1} failed, retrying...`);
      await sleep(1000);
    }
  }
  throw new Error('Failed to connect');
}

async function runE2E(): Promise<void> {
  console.log('[E2E] Starting E2E test...');
  console.log(`[E2E] NATS URL: ${NATS_URL}`);

  const nc = await connectWithRetry(NATS_URL, 10);
  console.log('[E2E] Connected to NATS');

  try {
    // 订阅确认消息
    const ackSub = nc.subscribe('test.e2e.ack');
    console.log('[E2E] Subscribed to test.e2e.ack');

    // 发布测试消息
    const testMessage = {
      id: `e2e-${Date.now()}`,
      content: `E2E 测试消息 - ${new Date().toISOString()}`,
    };

    nc.publish('summ.notify.event', new TextEncoder().encode(JSON.stringify(testMessage)));
    console.log('[E2E] Published test message:', testMessage.id);

    // 等待确认
    const timeout = setTimeout(() => {
      console.error('[E2E] FAILED - Timeout waiting for ack');
      process.exit(1);
    }, TIMEOUT_MS);

    for await (const msg of ackSub) {
      clearTimeout(timeout);
      const ack = JSON.parse(new TextDecoder().decode(msg.data)) as AckMessage;
      console.log('[E2E] Received ack:', ack);

      if (ack.originalId === testMessage.id && ack.messageId) {
        console.log('[E2E] PASSED - Message sent successfully');
        console.log(`[E2E]   Message ID: ${ack.messageId}`);
        console.log(`[E2E]   Type: ${ack.msgType}`);
        break;
      } else {
        console.error('[E2E] FAILED - Invalid ack');
        process.exit(1);
      }
    }

  } catch (e) {
    console.error('[E2E] Test failed:', e);
    process.exit(1);
  } finally {
    await nc.close();
  }
}

runE2E().catch((e) => {
  console.error('[E2E] Unhandled error:', e);
  process.exit(1);
});
