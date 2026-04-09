# @jhihjian/summ-script-consumer

通用 NATS Consumer - 订阅指定 subject，收到消息后执行命令。

## 安装

```bash
npm install -g @jhihjian/summ-script-consumer
```

## 使用

```bash
NATS_URL=nats://localhost:4222 \
SUBJECT=summ.notify.event \
COMMAND="curl -X POST http://api.example.com/webhook -d @-" \
script-consumer
```

## 环境变量

| 变量 | 必填 | 默认值 | 说明 |
|------|:----:|--------|------|
| `SUBJECT` | ✅ | - | 订阅的 NATS subject |
| `COMMAND` | ✅ | - | 收到消息后执行的命令，消息体通过 **stdin** 传入 |
| `NATS_URL` | | `nats://localhost:4222` | NATS 服务器地址 |
| `QUEUE_GROUP` | | - | Queue Group 名称（多实例负载均衡时使用） |

## 示例

### 转发到 Webhook

```bash
SUBJECT=summ.notify.event \
COMMAND="curl -X POST https://api.example.com/webhook -H 'Content-Type: application/json' -d @-" \
script-consumer
```

### 写入文件

```bash
SUBJECT=summ.ai.output \
COMMAND="cat >> /var/log/messages.log" \
script-consumer
```

### 执行脚本

```bash
SUBJECT=summ.task.execute \
COMMAND="/path/to/handler.sh" \
script-consumer
```

handler.sh:
```bash
#!/bin/bash
MESSAGE=$(cat)
echo "收到消息: $MESSAGE"
# 处理逻辑...
```

### 处理 JSON

```bash
SUBJECT=summ.notify.event \
COMMAND="jq '.data' | xargs -I {} curl http://api.example.com/{}" \
script-consumer
```

### 多实例负载均衡

```bash
# 实例 1
QUEUE_GROUP=script-consumers SUBJECT=summ.notify.event COMMAND="handler.sh" script-consumer

# 实例 2
QUEUE_GROUP=script-consumers SUBJECT=summ.notify.event COMMAND="handler.sh" script-consumer
```

## E2E 测试

```bash
cd test-e2e
./test.sh
```

依赖：Docker、nats CLI

## License

MIT
