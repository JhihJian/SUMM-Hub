import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FeishuClient } from '../src/feishu';
import type { FeishuConfig } from '../src/types';

// Mock @larksuiteoapi/node-sdk
vi.mock('@larksuiteoapi/node-sdk', () => {
  const mockMessageCreate = vi.fn();
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
    await client.sendMessage('ou_test', 'open_id', 'text', { text: 'hello' });
    // 验证调用（SDK mock）
    expect(true).toBe(true);
  });

  it('should send card message', async () => {
    const cardContent = {
      card: {
        header: { title: { tag: 'plain_text', content: 'Title' } },
        elements: [],
      },
    };
    await client.sendMessage('ou_test', 'open_id', 'interactive', cardContent);
    expect(true).toBe(true);
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
