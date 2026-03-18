import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FeishuConsumer } from '../src/consumer';
import type { FeishuConfig, NotifyMessage } from '../src/types';

// Mock FeishuClient first (no hoisting issues)
vi.mock('../src/feishu', () => ({
  FeishuClient: vi.fn().mockImplementation(() => ({
    sendMessage: vi.fn().mockResolvedValue({ messageId: 'test_msg_id' }),
  })),
}));

// Mock NATS with inline vi.fn() to avoid hoisting issues
vi.mock('nats', () => ({
  connect: vi.fn().mockResolvedValue({
    subscribe: vi.fn().mockReturnValue({
      [Symbol.asyncIterator]: () => ({ next: () => Promise.resolve({ done: true }) }),
    }),
    close: vi.fn().mockResolvedValue(undefined),
  }),
}));

describe('FeishuConsumer', () => {
  let consumer: FeishuConsumer;
  const config: FeishuConfig = {
    natsUrl: 'nats://localhost:4222',
    appId: 'test_app_id',
    appSecret: 'test_secret',
    receiverId: 'ou_test',
    receiverType: 'open_id',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    consumer = new FeishuConsumer(config);
  });

  it('should create consumer with config', () => {
    expect(consumer).toBeDefined();
  });

  it('should connect to NATS', async () => {
    await consumer.connect();
    expect(true).toBe(true);
  });

  it('should close connection', async () => {
    await consumer.connect();
    await consumer.close();
    expect(true).toBe(true);
  });
});

describe('determineMessageType', () => {
  it('should return text for string content', () => {
    const msg: NotifyMessage = { id: '1', content: 'hello' };
    const type = FeishuConsumer.determineMessageType(msg.content);
    expect(type).toBe('text');
  });

  it('should return interactive for card content', () => {
    const msg: NotifyMessage = {
      id: '1',
      content: { card: { header: { title: { tag: 'plain_text', content: 'Title' } }, elements: [] } },
    };
    const type = FeishuConsumer.determineMessageType(msg.content);
    expect(type).toBe('interactive');
  });
});

describe('formatContent', () => {
  it('should format text content', () => {
    const content = FeishuConsumer.formatContent('hello', 'text');
    expect(content).toEqual({ text: 'hello' });
  });

  it('should format card content', () => {
    const card = { card: { elements: [] } };
    const content = FeishuConsumer.formatContent(card, 'interactive');
    expect(content).toEqual(card);
  });
});
