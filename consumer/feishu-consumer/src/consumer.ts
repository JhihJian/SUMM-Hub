import { connect, NatsConnection, Subscription, Msg } from 'nats';
import { FeishuClient } from './feishu';
import type { FeishuConfig, NotifyMessage, FeishuMessageType } from './types';

/**
 * NATS → 飞书 Consumer
 * 订阅 summ.notify.event，转发消息到飞书
 */
export class FeishuConsumer {
  private nc: NatsConnection | null = null;
  private feishu: FeishuClient;
  private config: FeishuConfig;
  private sub: Subscription | null = null;

  constructor(config: FeishuConfig) {
    this.config = config;
    this.feishu = new FeishuClient(config.appId, config.appSecret);
  }

  /**
   * 连接 NATS 服务器
   */
  async connect(): Promise<void> {
    this.nc = await connect({
      servers: this.config.natsUrl,
      name: 'feishu-consumer',
    });
    console.log(`[Consumer] Connected to ${this.config.natsUrl}`);
  }

  /**
   * 订阅 summ.notify.event
   */
  async subscribe(): Promise<void> {
    if (!this.nc) {
      throw new Error('Not connected to NATS');
    }

    this.sub = this.nc.subscribe('summ.notify.event');
    console.log('[Consumer] Subscribed to summ.notify.event');

    for await (const msg of this.sub) {
      await this.handleMessage(msg);
    }
  }

  /**
   * 处理单条消息
   */
  private async handleMessage(msg: Msg): Promise<void> {
    let notify: NotifyMessage;

    try {
      notify = JSON.parse(new TextDecoder().decode(msg.data)) as NotifyMessage;
    } catch (e) {
      console.error('[Consumer] Failed to parse message:', e);
      return;
    }

    const msgType = FeishuConsumer.determineMessageType(notify.content);
    const content = FeishuConsumer.formatContent(notify.content, msgType);

    try {
      await this.feishu.sendMessage(
        this.config.receiverId,
        this.config.receiverType,
        msgType,
        content
      );
      console.log(`[Feishu] Message sent to ${this.config.receiverId}: ${msgType}`);
    } catch (e) {
      console.error('[Feishu] Failed to send message:', e);
    }
  }

  /**
   * 判断消息类型
   */
  static determineMessageType(content: NotifyMessage['content']): FeishuMessageType {
    if (typeof content === 'string') {
      return 'text';
    }
    if (typeof content === 'object' && content !== null && 'card' in content) {
      return 'interactive';
    }
    return 'text';
  }

  /**
   * 格式化消息内容
   */
  static formatContent(content: NotifyMessage['content'], msgType: FeishuMessageType): object {
    if (msgType === 'text') {
      return { text: typeof content === 'string' ? content : JSON.stringify(content) };
    }
    return content as object;
  }

  /**
   * 关闭连接
   */
  async close(): Promise<void> {
    if (this.nc) {
      await this.nc.close();
      console.log('[Consumer] Connection closed');
    }
  }
}
