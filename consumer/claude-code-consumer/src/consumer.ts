import { connect, NatsConnection, JetStreamClient, JetStreamPullSubscription, JsMsg, AckPolicy } from 'nats';
import { ClaudeExecutor } from './executor';
import { SessionManager } from './session';
import { ownsSession } from './utils/hash';
import type { InputMessage, OutputMessage, ConsumerConfig, SDKMessage } from './utils/types';

/**
 * 构建 NATS 主题名称
 */
function buildSubject(entityType: string, suffix: string): string {
  return `summ.${entityType}.${suffix}`;
}

/**
 * NATS Consumer
 * 订阅消息，调用 Claude Code，流式输出结果
 */
export class ClaudeConsumer {
  private nc: NatsConnection | null = null;
  private js: JetStreamClient | null = null;
  private sub: JetStreamPullSubscription | null = null;
  private config: ConsumerConfig;
  private sessionManager: SessionManager;
  private inputSubject: string;
  private outputSubject: string;
  private logSubject: string;
  private streamName: string;
  private consumerName: string;

  constructor(config: ConsumerConfig) {
    this.config = config;
    this.sessionManager = new SessionManager(config.sessionTtlMs);
    this.inputSubject = buildSubject(config.entityType, 'input');
    this.outputSubject = buildSubject(config.entityType, 'output');
    this.logSubject = buildSubject(config.entityType, 'log');
    // Stream and consumer names based on entity type
    this.streamName = `${config.entityType.toUpperCase()}_INPUT`;
    this.consumerName = `${config.entityType}-consumer-${config.consumerId}`;
  }

  /**
   * 连接 NATS 服务器
   */
  async connect(): Promise<void> {
    this.nc = await connect({
      servers: this.config.natsUrl,
      name: `claude-consumer-${this.config.consumerId}`,
    });
    this.js = this.nc.jetstream();

    console.log(`[NATS] Connected to ${this.config.natsUrl}`);
  }

  /**
   * 订阅输入主题 - 使用 JetStream Pull Consumer
   */
  async subscribe(): Promise<void> {
    if (!this.js) {
      throw new Error('Not connected to NATS JetStream');
    }

    // Pull from JetStream consumer
    const opts = {
      stream: this.streamName,
      config: {
        durable_name: this.consumerName,
        filter_subject: this.inputSubject,
        ack_policy: AckPolicy.Explicit,
        max_deliver: 3,
        ack_wait: 30000000000, // 30 seconds in nanoseconds
      },
    };

    this.sub = await this.js.pullSubscribe(this.inputSubject, opts);

    console.log(`[NATS] Pull subscribed to ${this.inputSubject} (stream: ${this.streamName}, consumer: ${this.consumerName})`);

    // 启动 Session 清理
    this.sessionManager.startCleanup();

    // Pull messages in a loop
    const pullInterval = setInterval(() => {
      this.sub?.pull({ batch: 10, expires: 5000 });
    }, 1000);

    // 处理消息
    try {
      for await (const msg of this.sub) {
        await this.handleMessage(msg);
      }
    } finally {
      clearInterval(pullInterval);
    }
  }

  /**
   * 处理消息
   */
  private async handleMessage(msg: JsMsg): Promise<void> {
    let input: InputMessage;

    try {
      input = JSON.parse(new TextDecoder().decode(msg.data)) as InputMessage;
    } catch (e) {
      console.error('[Consumer] Failed to parse message:', e);
      // 解析错误时，需要发送 ACK 避免重复投递，同时发布错误
      msg.ack();
      this.publishError('unknown', 'PARSE_ERROR', 'Invalid JSON');
      return;
    }

    // 生成或使用现有 Session ID
    const sessionId = input.session_id || this.generateSessionId();

    // 检查是否由当前 Consumer 处理
    if (!ownsSession(sessionId, this.config.consumerId, this.config.consumerTotal)) {
      console.log(`[Consumer] Session ${sessionId} not owned by this consumer, skipping`);
      // ACK - 让 NATS 重新投递给其他 Consumer
      msg.ack();
      return;
    }

    console.log(`[Consumer] Processing message for session: ${sessionId}`);

    try {
      await this.processMessage(sessionId, input);
      // ACK the message after successful processing
      msg.ack();
      console.log(`[Consumer] Message processed and ACKed for session: ${sessionId}`);
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : 'Unknown error';
      console.error(`[Consumer] Error processing message:`, errorMessage);
      this.publishError(sessionId, 'PROCESS_ERROR', errorMessage);
      // NAK - will be redelivered
      msg.nak();
    }
  }

  /**
   * 处理消息并流式输出
   */
  private async processMessage(
    sessionId: string,
    input: InputMessage
  ): Promise<void> {
    // 获取或创建 Session
    let session = this.sessionManager.get(sessionId);

    if (!session) {
      // 使用配置的工作目录，支持外部挂载
      const workspaceDir = this.config.workspaceDir || process.cwd();
      session = this.sessionManager.create(sessionId, workspaceDir);
    }

    // 创建 Executor
    const executor = new ClaudeExecutor(session.cwd);

    try {
      // 启动 Claude
      executor.start();

      // 发送消息
      executor.send(input.content);

      // 流式处理响应
      for await (const sdkMsg of executor.stream()) {
        // 发布所有原始消息到 log subject（过程记录）
        this.publishLog(sessionId, sdkMsg);

        const output = this.toOutputMessage(sessionId, sdkMsg);

        // 跳过 null 输出（不需要转发的消息）
        if (!output) continue;

        this.publishOutput(output);

        // 收到 done 或 result 时结束
        if (output.type === 'done' || sdkMsg.type === 'result') {
          break;
        }
      }
    } finally {
      executor.kill();
    }
  }

  /**
   * 转换 SDK 消息为输出消息
   */
  private toOutputMessage(sessionId: string, sdkMsg: SDKMessage): OutputMessage | null {
    const base: OutputMessage = {
      session_id: sessionId,
      message_id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      timestamp: Date.now(),
      type: 'content',
    };

    // 处理 assistant 消息（新格式）
    if (sdkMsg.type === 'assistant') {
      const assistantMsg = sdkMsg as { message?: { content?: Array<{ type: string; text?: string }> } };
      if (assistantMsg.message?.content) {
        for (const block of assistantMsg.message.content) {
          if (block.type === 'text' && block.text) {
            return { ...base, type: 'content', content: block.text };
          }
        }
      }
      return null; // 没有 text 内容，跳过
    }

    // 处理 result 消息（结束标记）
    if (sdkMsg.type === 'result') {
      const resultMsg = sdkMsg as { result?: string; is_error?: boolean };
      if (resultMsg.is_error) {
        return {
          ...base,
          type: 'error',
          error_code: 'EXECUTION_ERROR',
          error_message: resultMsg.result || 'Unknown error',
        };
      }
      return { ...base, type: 'done' };
    }

    // 处理 error 消息
    if (sdkMsg.type === 'error') {
      const errorMsg = sdkMsg as { error?: { type?: string; message?: string } };
      return {
        ...base,
        type: 'error',
        error_code: errorMsg.error?.type || 'UNKNOWN',
        error_message: errorMsg.error?.message || 'Unknown error',
      };
    }

    // 兼容旧格式
    if (sdkMsg.type === 'assistant_message') {
      const oldMsg = sdkMsg as { content: string };
      return { ...base, type: 'content', content: oldMsg.content };
    }

    if (sdkMsg.type === 'content_block_delta') {
      const deltaMsg = sdkMsg as { delta: { text?: string } };
      if (deltaMsg.delta.text) {
        return { ...base, type: 'content', content: deltaMsg.delta.text };
      }
    }

    // 其他消息类型（system, user_message 等），跳过
    return null;
  }

  /**
   * 发布输出消息到 summ.{entityType}.output
   */
  private publishOutput(output: OutputMessage): void {
    if (!this.nc) {
      console.error('[Consumer] Not connected, cannot publish output');
      return;
    }
    const data = new TextEncoder().encode(JSON.stringify(output));
    this.nc.publish(this.outputSubject, data);
  }

  /**
   * 发布日志消息到 summ.{entityType}.log（记录所有原始消息）
   */
  private publishLog(sessionId: string, sdkMsg: SDKMessage): void {
    if (!this.nc) return;
    const logData = {
      session_id: sessionId,
      timestamp: Date.now(),
      raw: sdkMsg,
    };
    this.nc.publish(this.logSubject, new TextEncoder().encode(JSON.stringify(logData)));
  }

  /**
   * 发布错误消息到 summ.{entityType}.output
   */
  private publishError(
    sessionId: string,
    code: string,
    message: string
  ): void {
    const output: OutputMessage = {
      session_id: sessionId,
      message_id: `${Date.now()}-error`,
      timestamp: Date.now(),
      type: 'error',
      error_code: code,
      error_message: message,
    };
    this.publishOutput(output);
  }

  /**
   * 生成 Session ID
   */
  private generateSessionId(): string {
    return `session-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }

  /**
   * 关闭连接
   */
  async close(): Promise<void> {
    this.sessionManager.stopCleanup();
    this.sessionManager.cleanup();

    if (this.nc) {
      await this.nc.close();
      console.log('[NATS] Connection closed');
    }
  }
}
