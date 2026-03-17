# Subject 设计

本页内容已整合到 [协议规范](./protocol.md#subject-格式)。

---

## 快速参考

### Subject 格式

```
summ.<domain>.<action>
```

### 预定义 Subject

| Subject | 用途 |
|---------|------|
| `summ.ai.input` | AI 输入消息 |
| `summ.ai.output` | AI 输出消息 |
| `summ.ai.error` | AI 错误消息 |
| `summ.notify.event` | 通知事件 |

### 通配符订阅

| 订阅表达式 | 订阅范围 |
|------------|----------|
| `summ.ai.>` | 所有 AI 相关消息 |
| `summ.>` | 全部消息 |

---

详见 [协议规范](./protocol.md#subject-格式)。
