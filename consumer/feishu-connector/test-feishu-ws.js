/**
 * 飞书 WebSocket 长连接测试脚本
 *
 * 用法:
 *   1. 设置环境变量:
 *      export FEISHU_APP_ID=cli_xxx
 *      export FEISHU_APP_SECRET=xxx
 *
 *   2. 运行测试:
 *      node test-feishu-ws.js
 *
 *   3. 在飞书中给机器人发送消息，观察是否有事件输出
 */

const Lark = require("@larksuiteoapi/node-sdk");

const appId = process.env.FEISHU_APP_ID;
const appSecret = process.env.FEISHU_APP_SECRET;

if (!appId || !appSecret) {
  console.error("请设置环境变量 FEISHU_APP_ID 和 FEISHU_APP_SECRET");
  process.exit(1);
}

console.log("========================================");
console.log(" 飞书 WebSocket 长连接测试");
console.log("========================================");
console.log(`App ID: ${appId}`);
console.log("");

async function main() {
  // 创建事件分发器
  const eventDispatcher = new Lark.EventDispatcher({});

  // 注册消息事件处理器
  eventDispatcher.register({
    "im.message.receive_v1": async (data) => {
      console.log("\n🎉 收到消息事件!");
      console.log("=".repeat(50));
      console.log(JSON.stringify(data, null, 2));
      console.log("=".repeat(50));
    },
  });

  // 创建 WebSocket 客户端
  const wsClient = new Lark.WSClient({
    appId,
    appSecret,
    loggerLevel: Lark.LoggerLevel.info,
  });

  // 启动连接
  console.log("正在连接 WebSocket...");
  wsClient.start({ eventDispatcher });

  console.log("");
  console.log("✅ WebSocket 已启动");
  console.log("请在飞书中发送消息给机器人...");
  console.log("按 Ctrl+C 退出\n");

  // 保持运行
  process.on("SIGINT", () => {
    console.log("\n退出测试...");
    process.exit(0);
  });
}

main().catch((err) => {
  console.error("错误:", err);
  process.exit(1);
});
