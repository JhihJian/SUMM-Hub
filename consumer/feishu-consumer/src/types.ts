/**
 * Feishu Consumer 配置
 */
export interface FeishuConfig {
  /** NATS 服务器地址 */
  natsUrl: string;
  /** 飞书应用 App ID */
  appId: string;
  /** 飞书应用 App Secret */
  appSecret: string;
  /** 接收者 ID */
  receiverId: string;
  /** 接收者类型 */
  receiverType: 'open_id' | 'user_id' | 'union_id' | 'email' | 'chat_id';
}

/**
 * NATS 通知消息
 */
export interface NotifyMessage {
  /** 消息 ID */
  id: string;
  /** 消息内容：字符串或卡片对象 */
  content: string | CardContent;
  /** 上下文信息 */
  context?: Record<string, unknown>;
  /** 创建时间 */
  created_at?: string;
}

/**
 * 飞书卡片内容
 */
export interface CardContent {
  card: {
    header?: {
      title: { tag: string; content: string };
      template?: string;
    };
    elements: Array<{ tag: string; [key: string]: unknown }>;
  };
}

/**
 * 飞书消息类型
 */
export type FeishuMessageType = 'text' | 'interactive';
