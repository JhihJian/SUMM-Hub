import { ClaudeExecutor } from './executor';
import type { Session } from './utils/types';

/**
 * Session 管理器
 * 负责管理 Session 的创建、获取、删除和过期清理
 */
export class SessionManager {
  private sessions: Map<string, Session> = new Map();
  private ttlMs: number;
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;

  constructor(ttlMs: number = 3600000) {
    this.ttlMs = ttlMs;
  }

  /**
   * 创建新 Session
   * @param sessionId Session ID
   * @param cwd 工作目录
   * @returns 创建的 Session
   */
  create(sessionId: string, cwd: string): Session {
    const now = Date.now();

    const session: Session = {
      id: sessionId,
      createdAt: now,
      lastActivityAt: now,
      cwd,
    };

    this.sessions.set(sessionId, session);
    console.log(`[Session] Created: ${sessionId}`);

    return session;
  }

  /**
   * 获取已存在的 Session
   * @param sessionId Session ID
   * @returns Session 或 undefined
   */
  get(sessionId: string): Session | undefined {
    const session = this.sessions.get(sessionId);

    if (session) {
      // 更新最后活动时间
      session.lastActivityAt = Date.now();
    }

    return session;
  }

  /**
   * 删除 Session
   * @param sessionId Session ID
   */
  delete(sessionId: string): void {
    const session = this.sessions.get(sessionId);

    if (session) {
      // 终止关联的进程
      if (session.process) {
        session.process.kill();
      }

      this.sessions.delete(sessionId);
      console.log(`[Session] Deleted: ${sessionId}`);
    }
  }

  /**
   * 检查 Session 是否存在
   */
  has(sessionId: string): boolean {
    return this.sessions.has(sessionId);
  }

  /**
   * 更新 Session 的进程引用
   */
  setProcess(sessionId: string, executor: ClaudeExecutor): void {
    const session = this.sessions.get(sessionId);

    if (session) {
      session.lastActivityAt = Date.now();
    }
  }

  /**
   * 启动定期清理任务
   */
  startCleanup(): void {
    if (this.cleanupInterval) {
      return;
    }

    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 60000); // 每分钟清理一次

    console.log('[Session] Cleanup scheduler started');
  }

  /**
   * 停止定期清理任务
   */
  stopCleanup(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
      console.log('[Session] Cleanup scheduler stopped');
    }
  }

  /**
   * 清理过期 Session
   */
  cleanup(): void {
    const now = Date.now();
    const expired: string[] = [];

    for (const [id, session] of this.sessions) {
      if (now - session.lastActivityAt > this.ttlMs) {
        expired.push(id);
      }
    }

    for (const id of expired) {
      this.delete(id);
    }

    if (expired.length > 0) {
      console.log(`[Session] Cleaned up ${expired.length} expired sessions`);
    }
  }

  /**
   * 获取当前 Session 数量
   */
  size(): number {
    return this.sessions.size;
  }

  /**
   * 获取所有 Session ID
   */
  getAllIds(): string[] {
    return Array.from(this.sessions.keys());
  }
}
