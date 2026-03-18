import * as Lark from '@larksuiteoapi/node-sdk';
import type { FeishuMessageType } from './types';

/**
 * 飞书消息卡片结构
 */
interface FeishuCard {
  schema: string;
  config: { wide_screen_mode: boolean };
  body: {
    elements: Array<{ tag: string; content?: string; [key: string]: unknown }>;
  };
}

/**
 * 飞书 API 客户端
 * 封装官方 SDK，简化消息发送
 */
export class FeishuClient {
  private client: Lark.Client;

  constructor(appId: string, appSecret: string) {
    this.client = new Lark.Client({
      appId,
      appSecret,
      domain: Lark.Domain.Feishu,
    });
  }

  /**
   * 发送消息给指定接收者
   * SDK 自动处理 tenant_access_token 的获取和刷新
   */
  async sendMessage(
    receiveId: string,
    receiveIdType: string,
    msgType: FeishuMessageType,
    content: object
  ): Promise<void> {
    await this.client.im.v1.message.create({
      params: {
        receive_id_type: receiveIdType as 'open_id' | 'user_id' | 'union_id' | 'email' | 'chat_id',
      },
      data: {
        receive_id: receiveId,
        msg_type: msgType,
        content: JSON.stringify(content),
      },
    });
  }

  /**
   * 构建 Markdown 卡片
   * 用于将 Markdown 文本转换为飞书卡片格式
   */
  static buildMarkdownCard(markdown: string): FeishuCard {
    return {
      schema: '2.0',
      config: { wide_screen_mode: true },
      body: {
        elements: [{ tag: 'markdown', content: markdown }],
      },
    };
  }
}
