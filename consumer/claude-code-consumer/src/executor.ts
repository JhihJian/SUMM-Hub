import { spawn, ChildProcess } from 'child_process';
import { createInterface } from 'readline';
import type { SDKMessage } from './utils/types';

/**
 * Claude 子进程管理器
 * 负责启动、通信、终止 Claude Code 子进程
 */
export class ClaudeExecutor {
  private process: ChildProcess | null = null;
  private cwd: string;
  private sessionId: string | null = null;

  constructor(cwd: string) {
    this.cwd = cwd;
  }

  /**
   * 启动 Claude 子进程
   * @param resume 可选的 Session ID 用于恢复对话
   */
  start(resume?: string): void {
    if (this.process) {
      throw new Error('Claude process already running');
    }

    const args = ['--print', '--verbose', '--output-format', 'stream-json', '--dangerously-skip-permissions'];

    if (resume) {
      args.push('--resume', resume);
    }

    this.process = spawn('claude', args, {
      cwd: this.cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    this.process.on('error', (err) => {
      console.error('[Executor] Claude process error:', err);
    });

    this.process.stderr?.on('data', (data) => {
      const stderr = data.toString();
      // 只打印非 JSON 的 stderr（真正的错误）
      if (!stderr.startsWith('{')) {
        console.error('[Executor] Claude stderr:', stderr);
      }
    });
  }

  /**
   * 发送消息到 Claude stdin
   */
  send(message: string): void {
    if (!this.process?.stdin) {
      throw new Error('Claude process not running');
    }

    const payload = JSON.stringify({
      type: 'user_message',
      content: message,
    });

    this.process.stdin.write(payload + '\n');
    this.process.stdin.end(); // 关闭 stdin，通知 claude 输入结束
  }

  /**
   * 流式读取 Claude 输出
   */
  async *stream(): AsyncIterable<SDKMessage> {
    if (!this.process?.stdout) {
      throw new Error('Claude process not running');
    }

    const rl = createInterface({
      input: this.process.stdout,
      crlfDelay: Infinity,
    });

    for await (const line of rl) {
      if (!line.trim()) continue;

      try {
        const msg = JSON.parse(line) as SDKMessage;

        // 提取 session ID
        if (msg.type === 'message_start' && 'message' in msg) {
          this.sessionId = msg.message.id;
        }

        yield msg;

        // 消息结束时停止
        if (msg.type === 'message_stop') {
          break;
        }
      } catch (e) {
        console.error('Failed to parse Claude output:', line, e);
      }
    }
  }

  /**
   * 获取当前 Session ID
   */
  getSessionId(): string | null {
    return this.sessionId;
  }

  /**
   * 终止 Claude 子进程
   */
  kill(): void {
    if (this.process) {
      this.process.kill('SIGTERM');
      this.process = null;
    }
  }

  /**
   * 检查进程是否运行中
   */
  isRunning(): boolean {
    return this.process !== null && !this.process.killed;
  }
}
