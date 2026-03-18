import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FeishuClient } from '../src/feishu';
import type { FeishuConfig } from '../src/types';

// Mock @larksuiteoapi/node-sdk
vi.mock('@larksuiteoapi/node-sdk', () => {
  const mockMessageCreate = vi.fn().mockResolvedValue({
    data: { message_id: 'test_message_id_123' },
  });
  return {
    Client: vi.fn().mockImplementation(() => ({
      im: {
        v1: {
          message: {
            create: mockMessageCreate,
          },
        },
      },
    })),
    Domain: {
      Feishu: 'https://open.feishu.cn',
    },
  };
});

describe('FeishuClient', () => {
  let client: FeishuClient;
  const config: FeishuConfig = {
    natsUrl: 'nats://localhost:4222',
    appId: 'test_app_id',
    appSecret: 'test_secret',
    receiverId: 'ou_test',
    receiverType: 'open_id',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    client = new FeishuClient(config.appId, config.appSecret);
  });

  it('should create client with config', () => {
    expect(client).toBeDefined();
  });

  it('should send text message', async () => {
    const result = await client.sendMessage('ou_test', 'open_id', 'text', { text: 'hello' });
    expect(result.messageId).toBe('test_message_id_123');
  });

  it('should send card message', async () => {
    const cardContent = {
      card: {
        header: { title: { tag: 'plain_text', content: 'Title' } },
        elements: [],
      },
    };
    const result = await client.sendMessage('ou_test', 'open_id', 'interactive', cardContent);
    expect(result.messageId).toBe('test_message_id_123');
  });

  it('should build markdown card', () => {
    const card = FeishuClient.buildMarkdownCard('# Hello\n\nThis is **bold**');
    expect(card).toEqual({
      schema: '2.0',
      config: { wide_screen_mode: true },
      body: {
        elements: [{ tag: 'markdown', content: '# Hello\n\nThis is **bold**' }],
      },
    });
  });
});
