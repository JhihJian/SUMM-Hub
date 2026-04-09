#!/usr/bin/env node
import { connect, NatsConnection, Subscription } from 'nats';
import { spawn } from 'child_process';

interface Config {
  natsUrl: string;
  subject: string;
  command: string;
  queueGroup?: string;
}

function loadConfig(): Config {
  const subject = process.env.SUBJECT;
  const command = process.env.COMMAND;

  if (!subject) {
    console.error('[Error] SUBJECT environment variable is required');
    process.exit(1);
  }

  if (!command) {
    console.error('[Error] COMMAND environment variable is required');
    process.exit(1);
  }

  return {
    natsUrl: process.env.NATS_URL || 'nats://localhost:4222',
    subject,
    command,
    queueGroup: process.env.QUEUE_GROUP,
  };
}

async function main(): Promise<void> {
  const config = loadConfig();

  console.log('[script-consumer] Starting...');
  console.log(`[script-consumer] NATS: ${config.natsUrl}`);
  console.log(`[script-consumer] Subject: ${config.subject}`);
  console.log(`[script-consumer] Command: ${config.command}`);
  if (config.queueGroup) {
    console.log(`[script-consumer] Queue Group: ${config.queueGroup}`);
  }

  let nc: NatsConnection;
  let sub: Subscription;

  try {
    nc = await connect({ servers: config.natsUrl });
    console.log('[script-consumer] Connected to NATS');

    const subOpts = config.queueGroup ? { queue: config.queueGroup } : {};
    sub = nc.subscribe(config.subject, subOpts);
    console.log(`[script-consumer] Subscribed to ${config.subject}`);

    // 优雅退出
    const shutdown = async (signal: string) => {
      console.log(`\n[script-consumer] Received ${signal}, shutting down...`);
      await nc.close();
      process.exit(0);
    };
    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));

    // 处理消息
    for await (const msg of sub) {
      const messageData = new TextDecoder().decode(msg.data);
      console.log(`[script-consumer] Received message (${messageData.length} bytes)`);

      try {
        await executeCommand(config.command, messageData);
        // ACK - 空响应
        msg.respond();
      } catch (e) {
        const errorMsg = e instanceof Error ? e.message : 'Unknown error';
        console.error(`[script-consumer] Command failed: ${errorMsg}`);
        // NAK - 返回错误信息
        msg.respond(new TextEncoder().encode(JSON.stringify({
          error: true,
          message: errorMsg,
        })));
      }
    }
  } catch (e) {
    console.error('[script-consumer] Fatal error:', e);
    process.exit(1);
  }
}

function executeCommand(command: string, input: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, [], {
      shell: true,
      stdio: ['pipe', 'inherit', 'inherit'],
    });

    // 将消息体写入 stdin
    proc.stdin.write(input);
    proc.stdin.end();

    proc.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Command exited with code ${code}`));
      }
    });

    proc.on('error', (e) => {
      reject(e);
    });
  });
}

main().catch((e) => {
  console.error('[script-consumer] Unhandled error:', e);
  process.exit(1);
});
