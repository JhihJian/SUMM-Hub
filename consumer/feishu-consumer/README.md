# Feishu Consumer

SUMM-Hub Consumer，订阅 NATS 消息并转发到飞书私聊。

## 快速开始

### 1. 配置飞书应用

1. 访问 [飞书开放平台](https://open.feishu.cn/)
2. 创建企业自建应用
3. 开通权限：`im:message:send_as_bot`, `im:message`
4. 获取 App ID 和 App Secret

### 2. 获取接收者 ID

在飞书中打开目标用户 → 个人资料 → 更多 → 复制 open_id

### 3. 启动

```bash
npm install
npm run build

export FEISHU_APP_ID=cli_xxx
export FEISHU_APP_SECRET=xxx
export FEISHU_RECEIVER_ID=ou_xxx

npm start
```

## 环境变量

| 变量名 | 必填 | 默认值 | 说明 |
|-------|------|-------|------|
| `NATS_URL` | 否 | `nats://localhost:4222` | NATS 服务器地址 |
| `FEISHU_APP_ID` | 是 | - | 飞书应用 App ID |
| `FEISHU_APP_SECRET` | 是 | - | 飞书应用 App Secret |
| `FEISHU_RECEIVER_ID` | 是 | - | 接收者 ID |
| `FEISHU_RECEIVER_TYPE` | 否 | `open_id` | 接收者类型 |

## 消息格式

### 文本消息

```json
{
  "id": "uuid",
  "content": "这是文本消息"
}
```

### 卡片消息

```json
{
  "id": "uuid",
  "content": {
    "card": {
      "header": { "title": { "tag": "plain_text", "content": "标题" } },
      "elements": [{ "tag": "div", "text": { "tag": "plain_text", "content": "内容" } }]
    }
  }
}
```

## 测试

```bash
npm test
```
