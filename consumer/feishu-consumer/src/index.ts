import { FeishuConsumer } from './consumer';
import type { FeishuConfig } from './types';

/**
 * 从环境变量加载配置
 */
function loadConfig(): FeishuConfig {
  const appId = process.env.FEISHU_APP_ID;
  const appSecret = process.env.FEISHU_APP_SECRET;
  const receiverId = process.env.FEISHU_RECEIVER_ID;

  if (!appId || !appSecret || !receiverId) {
    console.error('[Consumer] Missing required environment variables:');
    console.error('  FEISHU_APP_ID, FEISHU_APP_SECRET, FEISHU_RECEIVER_ID');
    process.exit(1);
  }

  return {
    natsUrl: process.env.NATS_URL || 'nats://localhost:4222',
    appId,
    appSecret,
    receiverId,
    receiverType: (process.env.FEISHU_RECEIVER_TYPE as FeishuConfig['receiverType']) || 'open_id',
  };
}

/**
 * 主函数
 */
async function main(): Promise<void> {
  const config = loadConfig();
  const consumer = new FeishuConsumer(config);

  console.log('[Consumer] Starting Feishu Consumer...');
  console.log('[Consumer] Config:', {
    natsUrl: config.natsUrl,
    receiverId: config.receiverId,
    receiverType: config.receiverType,
  });

  // 优雅退出
  const shutdown = async (signal: string) => {
    console.log(`\n[Consumer] Received ${signal}, shutting down...`);
    await consumer.close();
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  try {
    await consumer.connect();
    await consumer.subscribe();
  } catch (e) {
    console.error('[Consumer] Fatal error:', e);
    await consumer.close();
    process.exit(1);
  }
}

main().catch((e) => {
  console.error('[Consumer] Unhandled error:', e);
  process.exit(1);
});
