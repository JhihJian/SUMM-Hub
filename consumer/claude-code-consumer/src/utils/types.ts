/**
 * 来自 NATS 的输入消息
 */
export interface InputMessage {
  /** 消息内容 */
  content: string;
  /** Session ID（可选，用于连续对话） */
  session_id?: string;
  /** 工作空间路径（仅新 session 生效，已有 session 忽略） */
  workspace?: string;
  /** 消息 ID */
  message_id?: string;
  /** 时间戳 */
  timestamp?: number;
}

/**
 * 输出到 NATS 的消息
 */
export interface OutputMessage {
  /** Session ID */
  session_id: string;
  /** 消息 ID */
  message_id: string;
  /** 消息类型 */
  type: 'content' | 'error' | 'done';
  /** 内容 */
  content?: string;
  /** 错误码（仅 error 类型） */
  error_code?: string;
  /** 错误信息（仅 error 类型） */
  error_message?: string;
  /** 时间戳 */
  timestamp: number;
}

/**
 * Session 状态
 */
export interface Session {
  /** Session ID */
  id: string;
  /** Claude 子进程 */
  process?: ReturnType<typeof import('child_process').spawn>;
  /** 创建时间 */
  createdAt: number;
  /** 最后活动时间 */
  lastActivityAt: number;
  /** 工作目录 */
  cwd: string;
}

/**
 * Claude SDK 输出消息类型
 */
export type SDKMessage =
  | { type: 'system'; subtype?: string; cwd?: string; session_id?: string }
  | { type: 'assistant'; message?: { content?: Array<{ type: string; text?: string }> } }
  | { type: 'result'; subtype?: string; result?: string; is_error?: boolean }
  | { type: 'user_message'; content: string }
  | { type: 'assistant_message'; content: string }
  | { type: 'content_block_start'; index: number }
  | { type: 'content_block_delta'; index: number; delta: { type: string; text?: string } }
  | { type: 'content_block_stop'; index: number }
  | { type: 'message_start'; message: { id: string; role: string } }
  | { type: 'message_delta'; delta: { stop_reason?: string } }
  | { type: 'message_stop' }
  | { type: 'error'; error: { type: string; message: string } };

/**
 * Consumer 配置
 */
export interface ConsumerConfig {
  /** NATS 服务器地址 */
  natsUrl: string;
  /** 当前实例 ID */
  consumerId: number;
  /** 总实例数 */
  consumerTotal: number;
  /** Session 过期时间 (ms) */
  sessionTtlMs: number;
  /** 实体类型（用于构建 NATS 主题，如 "summ.{entityType}.input"） */
  entityType: string;
  /** Claude 运行时工作目录（用于会话的默认工作目录） */
  workspaceDir: string;
  /** 允许的工作空间根目录白名单（逗号分隔，为空则不限制） */
  workspaceAllowedRoots: string;
  /** Queue Group 名称（用于负载均衡） */
  queueGroup: string;
}
