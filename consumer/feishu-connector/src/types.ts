import type { NatsConnection } from "nats";

/**
 * Feishu Connector 配置
 */
export interface FeishuConnectorConfig {
  /** Feishu 应用 App ID */
  appId: string;
  /** Feishu 应用 App Secret */
  appSecret: string;
  /** NATS 服务器地址 */
  natsUrl: string;
  /** Session ID 前缀 (默认: #) */
  triggerPrefix: string;
  /** AI 输入消息 Subject (发送给 AI) */
  inputSubject: string;
  /** AI 输出消息 Subject (AI 响应) */
  outputSubject: string;
  /** Bot open_id (用于群聊 @mention 检测) */
  botOpenId?: string;
  /** 日志级别 */
  logLevel?: "debug" | "info" | "warn" | "error";
}

/**
 * NATS 输入消息 (发送给 AI)
 * 遵循 SUMM-Hub 协议
 */
export interface InputMessage {
  /** 消息 ID */
  id: string;
  /** Session ID (用于连续对话) */
  session_id: string;
  /** 消息内容 */
  content: { text: string };
  /** 上下文信息 */
  context: {
    source: "feishu";
    chat_id: string;
    message_id: string;
    chat_type: "p2p" | "group";
    sender_open_id?: string;
    reply_to?: string;
  };
  /** 时间戳 */
  timestamp: number;
}

/**
 * NATS 输出消息 (AI 响应)
 * 遵循 SUMM-Hub 协议
 */
export interface OutputMessage {
  /** Session ID */
  session_id: string;
  /** 消息 ID */
  message_id: string;
  /** 消息类型 */
  type: "content" | "error" | "done";
  /** 内容 */
  content?: string;
  /** 错误码 (仅 error 类型) */
  error_code?: string;
  /** 错误信息 (仅 error 类型) */
  error_message?: string;
  /** 时间戳 */
  timestamp: number;
}

/**
 * 内部解析后的消息结构
 */
export interface ParsedMessage {
  /** Session ID (从消息内容或 chat_id 提取) */
  sessionId: string;
  /** 清理后的消息内容 (移除了 session 前缀和 @mention) */
  content: string;
  /** 原始消息 ID */
  messageId: string;
  /** 聊天 ID */
  chatId: string;
  /** 聊天类型 */
  chatType: "p2p" | "group";
  /** 发送者 open_id */
  senderOpenId?: string;
  /** 是否应该处理此消息 (group chat 需要 @bot) */
  shouldProcess: boolean;
}

/**
 * 飞书 WebSocket 消息事件
 */
export interface FeishuMessageEvent {
  sender: {
    sender_id: {
      open_id?: string;
      user_id?: string;
      union_id?: string;
    };
    sender_type?: string;
    tenant_key?: string;
  };
  message: {
    message_id: string;
    root_id?: string;
    parent_id?: string;
    chat_id: string;
    chat_type: "p2p" | "group" | "private";
    create_time?: string;
    message_type: string;
    content: string;
    mentions?: Array<{
      key: string;
      id: {
        open_id?: string;
        user_id?: string;
        union_id?: string;
      };
      name: string;
      tenant_key?: string;
    }>;
  };
}

/**
 * FeishuConnector 依赖注入接口
 */
export interface FeishuConnectorDeps {
  config: FeishuConnectorConfig;
  nc: NatsConnection;
}
