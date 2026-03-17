import { ClaudeConsumer } from './consumer';
import type { ConsumerConfig } from './utils/types';

/**
 * 从环境变量读取配置
 */
function loadConfig(): ConsumerConfig {
  return {
    natsUrl: process.env.NATS_URL || 'nats://localhost:4222',
    consumerId: parseInt(process.env.CONSUMER_ID || '0', 10),
    consumerTotal: parseInt(process.env.CONSUMER_TOTAL || '1', 10),
    sessionTtlMs: parseInt(process.env.SESSION_TTL_MS || '3600000', 10),
    entityType: process.env.ENTITY_TYPE || 'ai',
    workspaceDir: process.env.WORKSPACE_DIR || process.cwd(),
  };
}

/**
 * 主函数
 */
async function main(): Promise<void> {
  const config = loadConfig();
  const consumer = new ClaudeConsumer(config);

  console.log('[Consumer] Starting Claude Code Consumer...');
  console.log(`[Consumer] Config:`, {
    natsUrl: config.natsUrl,
    consumerId: config.consumerId,
    consumerTotal: config.consumerTotal,
    sessionTtlMs: config.sessionTtlMs,
    entityType: config.entityType,
    workspaceDir: config.workspaceDir,
  });

  // 优雅退出处理
  const shutdown = async (signal: string) => {
    console.log(`\n[Consumer] Received ${signal}, shutting down...`);
    await consumer.close();
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  try {
    // 连接 NATS
    await consumer.connect();

    // 开始订阅
    console.log('[Consumer] Starting message loop...');
    await consumer.subscribe();
  } catch (e) {
    console.error('[Consumer] Fatal error:', e);
    await consumer.close();
    process.exit(1);
  }
}

// 启动
main().catch((e) => {
  console.error('[Consumer] Unhandled error:', e);
  process.exit(1);
});
