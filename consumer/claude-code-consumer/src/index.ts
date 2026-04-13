import { ClaudeConsumer } from './consumer';
import { ClaudeExecutor } from './executor';
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
    workspaceAllowedRoots: process.env.WORKSPACE_ALLOWED_ROOTS || '',
    queueGroup: process.env.QUEUE_GROUP || 'claude-consumers',
  };
}

/**
 * CLI 模式：直接执行任务
 */
async function runCliMode(task: string, workspaceDir: string): Promise<void> {
  const executor = new ClaudeExecutor(workspaceDir);

  try {
    executor.start();
    executor.send(task);

    for await (const msg of executor.stream()) {
      // 处理 assistant 消息
      if (msg.type === 'assistant') {
        const assistantMsg = msg as { message?: { content?: Array<{ type: string; text?: string }> } };
        if (assistantMsg.message?.content) {
          for (const block of assistantMsg.message.content) {
            if (block.type === 'text' && block.text) {
              process.stdout.write(block.text);
            }
          }
        }
      }
      // 处理 result 消息
      else if (msg.type === 'result') {
        const resultMsg = msg as { result?: string; is_error?: boolean };
        if (resultMsg.is_error) {
          console.error('\n[Error]', resultMsg.result);
        }
        break;
      }
      // 处理 error 消息
      else if (msg.type === 'error') {
        const errorMsg = msg as { error?: { message: string } };
        console.error('\n[Error]', errorMsg.error?.message);
      }
    }

    console.log('');
  } catch (e) {
    console.error('[CLI] Error:', e);
    throw e;
  } finally {
    executor.kill();
  }
}

/**
 * 主函数
 */
async function main(): Promise<void> {
  const config = loadConfig();

  // CLI 模式检测
  if (process.env.CLI_MODE === 'true' && process.env.TASK) {
    await runCliMode(process.env.TASK, config.workspaceDir);
    return;
  }

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
