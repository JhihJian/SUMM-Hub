import { connect, NatsConnection, Subscription, Msg } from 'nats';
import { ClaudeExecutor } from './executor';
import { SessionManager } from './session';
import { ownsSession } from './utils/hash';
import type { InputMessage, OutputMessage, ConsumerConfig, SDKMessage } from './utils/types';

const INPUT_SUBJECT = 'summ.ai.input';
const OUTPUT_SUBJECT = 'summ.ai.output';

/**
 * NATS Consumer
 * 订阅消息，调用 Claude Code，流式输出结果
 */
export class ClaudeConsumer {
  private nc: NatsConnection | null = null;
  private sub: Subscription | null = null;
  private config: ConsumerConfig;
  private sessionManager: SessionManager;

  constructor(config: ConsumerConfig) {
    this.config = config;
    this.sessionManager = new SessionManager(config.sessionTtlMs);
  }

  /**
   * 连接 NATS 服务器
   */
  async connect(): Promise<void> {
    this.nc = await connect({
      servers: this.config.natsUrl,
      name: `claude-consumer-${this.config.consumerId}`,
    });

    console.log(`[NATS] Connected to ${this.config.natsUrl}`);
  }

  /**
   * 订阅输入主题
   */
  async subscribe(): Promise<void> {
    if (!this.nc) {
      throw new Error('Not connected to NATS');
    }

    this.sub = this.nc.subscribe(INPUT_SUBJECT, {
      queue: 'claude-consumers',
    });

    console.log(`[NATS] Subscribed to ${INPUT_SUBJECT}`);

    // 启动 Session 清理
    this.sessionManager.startCleanup();

    // 处理消息
    for await (const msg of this.sub) {
      await this.handleMessage(msg);
    }
  }

  /**
   * 处理消息
   */
  private async handleMessage(msg: Msg): Promise<void> {
    let input: InputMessage;

    try {
      input = JSON.parse(new TextDecoder().decode(msg.data)) as InputMessage;
    } catch (e) {
      console.error('[Consumer] Failed to parse message:', e);
      msg.respond(new TextEncoder().encode(JSON.stringify({
        type: 'error',
        error_code: 'PARSE_ERROR',
        error_message: 'Invalid JSON',
      })));
      return;
    }

    // 生成或使用现有 Session ID
    const sessionId = input.session_id || this.generateSessionId();

    // 检查是否由当前 Consumer 处理
    if (!ownsSession(sessionId, this.config.consumerId, this.config.consumerTotal)) {
      console.log(`[Consumer] Session ${sessionId} not owned by this consumer, skipping`);
      // NAK - 让其他 Consumer 处理
      msg.respond();
      return;
    }

    console.log(`[Consumer] Processing message for session: ${sessionId}`);

    try {
      await this.processMessage(sessionId, input, msg);
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : 'Unknown error';
      console.error(`[Consumer] Error processing message:`, errorMessage);
      this.publishError(msg, sessionId, 'PROCESS_ERROR', errorMessage);
    }
  }

  /**
   * 处理消息并流式输出
   */
  private async processMessage(
    sessionId: string,
    input: InputMessage,
    msg: Msg
  ): Promise<void> {
    // 获取或创建 Session
    let session = this.sessionManager.get(sessionId);

    if (!session) {
      session = this.sessionManager.create(sessionId, process.cwd());
    }

    // 创建 Executor
    const executor = new ClaudeExecutor(session.cwd);

    // 启动 Claude（恢复或新建）
    if (this.sessionManager.has(sessionId)) {
      executor.start(sessionId);
    } else {
      executor.start();
    }

    // 发送消息
    executor.send(input.content);

    // 流式处理响应
    try {
      for await (const sdkMsg of executor.stream()) {
        const output = this.toOutputMessage(sessionId, sdkMsg);
        this.publishOutput(msg, output);

        if (sdkMsg.type === 'message_stop') {
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
  private toOutputMessage(sessionId: string, sdkMsg: SDKMessage): OutputMessage {
    const base: OutputMessage = {
      session_id: sessionId,
      message_id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      timestamp: Date.now(),
      type: 'content',
    };

    if (sdkMsg.type === 'assistant_message') {
      return { ...base, type: 'content', content: sdkMsg.content };
    }

    if (sdkMsg.type === 'content_block_delta' && 'delta' in sdkMsg && sdkMsg.delta.text) {
      return { ...base, type: 'content', content: sdkMsg.delta.text };
    }

    if (sdkMsg.type === 'error') {
      return {
        ...base,
        type: 'error',
        error_code: sdkMsg.error.type,
        error_message: sdkMsg.error.message,
      };
    }

    if (sdkMsg.type === 'message_stop') {
      return { ...base, type: 'done' };
    }

    // 其他消息类型，忽略内容
    return { ...base, type: 'content', content: '' };
  }

  /**
   * 发布输出消息
   */
  private publishOutput(msg: Msg, output: OutputMessage): void {
    const data = new TextEncoder().encode(JSON.stringify(output));
    msg.respond(data);
  }

  /**
   * 发布错误消息
   */
  private publishError(
    msg: Msg,
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

    msg.respond(new TextEncoder().encode(JSON.stringify(output)));
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
