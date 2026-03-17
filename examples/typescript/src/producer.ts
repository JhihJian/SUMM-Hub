/**
 * SUMM-Hub TypeScript Producer 示例
 *
 * 用法:
 *   npm run start
 *
 * 环境变量:
 *   NATS_URL - NATS 服务器地址 (默认: nats://localhost:4222)
 */

import {
  connect,
  StringCodec,
  headers,
  JetStreamClient,
  NatsConnection,
  Subscription,
  Msg,
  JwtAuthenticator,
} from 'nats';
import { v4 as uuidv4 } from 'uuid';

// 配置
interface Config {
  natsUrl: string;
}

// 消息格式
interface Message {
  id: string;
  session?: string;
  content: unknown;
  context?: Record<string, unknown>;
  created_at: string;
}

// 响应格式
interface Response {
  id: string;
  session: string;
  content: unknown;
  created_at: string;
}

// 错误消息格式
interface ErrorMessage {
  id: string;
  session: string;
  code: string;
  message: string;
  created_at: string;
}

// Producer 类
class Producer {
  private nc: NatsConnection | null = null;
  private js: JetStreamClient | null = null;
  private sc = StringCodec();
  private subscriptions: Subscription[] = [];
  private currentSession: string | null = null;

  /**
   * 连接到 NATS
   */
  async connect(url: string): Promise<void> {
    this.nc = await connect({
      servers: url,
    });

    this.js = this.nc.jetstream();
    console.log(`已连接到 NATS: ${url}`);
  }

  /**
   * 关闭连接
   */
  async close(): Promise<void> {
    // 取消所有订阅
    for (const sub of this.subscriptions) {
      sub.unsubscribe();
    }
    this.subscriptions = [];

    if (this.nc) {
      await this.nc.close();
      this.nc = null;
      this.js = null;
    }
    console.log('连接已关闭');
  }

  /**
   * 发送消息
   */
  async sendMessage(content: unknown, sessionId?: string): Promise<string> {
    if (!this.js) {
      throw new Error('未连接到 NATS');
    }

    const payload: Message = {
      id: uuidv4(),
      session: sessionId,
      content,
      created_at: new Date().toISOString(),
    };

    const hdrs = headers();
    hdrs.set('Source', 'typescript-producer');
    if (sessionId) {
      hdrs.set('Session-Id', sessionId);
    }

    const data = JSON.stringify(payload);

    await this.js.publish('summ.ai.input', this.sc.encode(data), {
      headers: hdrs,
      msgId: payload.id,
    });

    console.log(`消息已发送: ${payload.id}${sessionId ? ` (Session: ${sessionId})` : ' (首次消息)'}`);

    return payload.id;
  }

  /**
   * 发送首次消息（无 Session）
   */
  async sendFirstMessage(content: unknown, context?: Record<string, unknown>): Promise<string> {
    if (!this.js) {
      throw new Error('未连接到 NATS');
    }

    const payload: Message = {
      id: uuidv4(),
      content,
      context: context || { source: 'typescript-producer' },
      created_at: new Date().toISOString(),
    };

    const hdrs = headers();
    hdrs.set('Source', 'typescript-producer');
    // 首次消息不设置 Session-Id

    const data = JSON.stringify(payload);

    await this.js.publish('summ.ai.input', this.sc.encode(data), {
      headers: hdrs,
      msgId: payload.id,
    });

    console.log(`首次消息已发送: ${payload.id}`);
    return payload.id;
  }

  /**
   * 发送后续消息（有 Session）
   */
  async sendFollowUpMessage(sessionId: string, content: unknown): Promise<string> {
    this.currentSession = sessionId;
    return this.sendMessage(content, sessionId);
  }

  /**
   * 订阅响应
   */
  async subscribeToResponses(handler: (response: Response) => void): Promise<Subscription> {
    if (!this.nc) {
      throw new Error('未连接到 NATS');
    }

    const sub = this.nc.subscribe('summ.ai.output');
    this.subscriptions.push(sub);

    (async () => {
      for await (const msg of sub) {
        try {
          const response = this.parseMessage<Response>(msg);
          console.log(`收到响应 (Session: ${response.session})`);
          handler(response);

          // 更新当前 Session
          if (!this.currentSession) {
            this.currentSession = response.session;
            console.log(`获取到 Session: ${response.session}`);
          }
        } catch (err) {
          console.error('解析响应失败:', err);
        }
      }
    })();

    return sub;
  }

  /**
   * 订阅错误
   */
  async subscribeToErrors(handler: (error: ErrorMessage) => void): Promise<Subscription> {
    if (!this.nc) {
      throw new Error('未连接到 NATS');
    }

    const sub = this.nc.subscribe('summ.ai.error');
    this.subscriptions.push(sub);

    (async () => {
      for await (const msg of sub) {
        try {
          const error = this.parseMessage<ErrorMessage>(msg);
          console.log(`收到错误 [${error.code}]: ${error.message} (Session: ${error.session})`);
          handler(error);

          // 如果是 session_not_found，清除当前 Session
          if (error.code === 'session_not_found' && error.session === this.currentSession) {
            this.currentSession = null;
            console.log('Session 已失效，需要重新开始');
          }
        } catch (err) {
          console.error('解析错误消息失败:', err);
        }
      }
    })();

    return sub;
  }

  /**
   * 获取当前 Session
   */
  getCurrentSession(): string | null {
    return this.currentSession;
  }

  /**
   * 清除当前 Session
   */
  clearSession(): void {
    this.currentSession = null;
    console.log('Session 已清除');
  }

  /**
   * 解析消息
   */
  private parseMessage<T>(msg: Msg): T {
    const data = this.sc.decode(msg.data);
    return JSON.parse(data) as T;
  }
}

// 主函数
async function main() {
  const config: Config = {
    natsUrl: process.env.NATS_URL || 'nats://localhost:4222',
  };

  const producer = new Producer();

  try {
    // 连接
    await producer.connect(config.natsUrl);

    // 订阅响应
    await producer.subscribeToResponses((response) => {
      console.log('响应内容:', JSON.stringify(response.content, null, 2));
    });

    // 订阅错误
    await producer.subscribeToErrors((error) => {
      console.error('错误:', error.message);
    });

    // 等待订阅生效
    await new Promise((resolve) => setTimeout(resolve, 500));

    // 发送首次消息
    console.log('\n=== 发送首次消息 ===');
    await producer.sendFirstMessage({
      text: '你好，这是一条测试消息',
    }, {
      source: 'cli',
      user_id: 'user-001',
    });

    // 等待响应
    console.log('\n等待响应...');
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // 如果有 Session，发送后续消息
    const session = producer.getCurrentSession();
    if (session) {
      console.log('\n=== 发送后续消息 ===');
      await producer.sendFollowUpMessage(session, {
        text: '这是后续消息',
      });

      // 等待响应
      console.log('\n等待响应...');
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    // 演示结束
    console.log('\n演示完成，按 Ctrl+C 退出');

    // 保持运行
    await new Promise<void>((resolve) => {
      process.on('SIGINT', () => {
        console.log('\n收到退出信号');
        resolve();
      });
    });

  } catch (err) {
    console.error('错误:', err);
    process.exit(1);
  } finally {
    await producer.close();
  }
}

// 运行
main().catch(console.error);
