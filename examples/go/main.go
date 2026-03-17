// SUMM-Hub Go Consumer 示例
//
// 用法:
//
//	CONSUMER_ID=0 CONSUMER_TOTAL=1 go run .
//
// 环境变量:
//
//	NATS_URL        - NATS 服务器地址 (默认: nats://localhost:4222)
//	CONSUMER_ID     - 本 Consumer 的 ID (0, 1, 2, ...)
//	CONSUMER_TOTAL  - Consumer 总数
package main

import (
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"hash/fnv"
	"log"
	"os"
	"os/signal"
	"strconv"
	"syscall"
	"time"

	"github.com/nats-io/nats.go"
)

// Config Consumer 配置
type Config struct {
	NATSURL       string
	ConsumerID    int
	ConsumerTotal int
	QueueGroup    string
}

// Consumer 消费者实例
type Consumer struct {
	config   *Config
	nc       *nats.Conn
	js       nats.JetStreamContext
	sessions map[string]*Session
}

// Session 会话数据
type Session struct {
	ID        string
	Context   map[string]interface{}
	CreatedAt time.Time
}

// Message 消息格式
type Message struct {
	ID        string                 `json:"id"`
	Session   string                 `json:"session,omitempty"`
	Content   interface{}            `json:"content"`
	Context   map[string]interface{} `json:"context,omitempty"`
	CreatedAt string                 `json:"created_at"`
}

// Response 响应格式
type Response struct {
	ID        string      `json:"id"`
	Session   string      `json:"session"`
	Content   interface{} `json:"content"`
	CreatedAt string      `json:"created_at"`
}

// ErrorMessage 错误消息格式
type ErrorMessage struct {
	ID        string `json:"id"`
	Session   string `json:"session"`
	Code      string `json:"code"`
	Message   string `json:"message"`
	CreatedAt string `json:"created_at"`
}

func main() {
	// 加载配置
	config := loadConfig()

	// 创建 Consumer
	consumer, err := NewConsumer(config)
	if err != nil {
		log.Fatalf("创建 Consumer 失败: %v", err)
	}
	defer consumer.Close()

	// 启动订阅
	if err := consumer.Start(); err != nil {
		log.Fatalf("启动订阅失败: %v", err)
	}

	log.Printf("Consumer #%d 已启动 (总数: %d)", config.ConsumerID, config.ConsumerTotal)
	log.Println("按 Ctrl+C 退出")

	// 等待信号
	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
	<-sigCh

	log.Println("正在关闭...")
}

// loadConfig 从环境变量加载配置
func loadConfig() *Config {
	config := &Config{
		NATSURL:    getEnv("NATS_URL", "nats://localhost:4222"),
		QueueGroup: getEnv("QUEUE_GROUP", "ai-consumer-group"),
	}

	id, err := strconv.Atoi(getEnv("CONSUMER_ID", "0"))
	if err != nil {
		log.Fatalf("无效的 CONSUMER_ID: %v", err)
	}
	config.ConsumerID = id

	total, err := strconv.Atoi(getEnv("CONSUMER_TOTAL", "1"))
	if err != nil {
		log.Fatalf("无效的 CONSUMER_TOTAL: %v", err)
	}
	config.ConsumerTotal = total

	return config
}

func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

// NewConsumer 创建新的 Consumer
func NewConsumer(config *Config) (*Consumer, error) {
	// 连接 NATS
	nc, err := nats.Connect(config.NATSURL)
	if err != nil {
		return nil, fmt.Errorf("连接 NATS 失败: %w", err)
	}

	// 获取 JetStream 上下文
	js, err := nc.JetStream()
	if err != nil {
		nc.Close()
		return nil, fmt.Errorf("获取 JetStream 上下文失败: %w", err)
	}

	return &Consumer{
		config:   config,
		nc:       nc,
		js:       js,
		sessions: make(map[string]*Session),
	}, nil
}

// Close 关闭连接
func (c *Consumer) Close() {
	if c.nc != nil {
		c.nc.Close()
	}
}

// Start 启动订阅
func (c *Consumer) Start() error {
	// Queue Group 订阅
	sub, err := c.js.QueueSubscribe(
		"summ.ai.input",
		c.config.QueueGroup,
		c.handleMessage,
		nats.Durable("ai-consumer"),
		nats.ManualAck(),
		nats.AckWait(30*time.Second),
		nats.MaxDeliver(3),
	)
	if err != nil {
		return fmt.Errorf("订阅失败: %w", err)
	}

	log.Printf("已订阅: summ.ai.input (Queue Group: %s)", c.config.QueueGroup)

	// 保持订阅活跃
	go func() {
		<-sub.Closed()
		log.Println("订阅已关闭")
	}()

	return nil
}

// handleMessage 处理消息
func (c *Consumer) handleMessage(msg *nats.Msg) {
	sessionID := msg.Header.Get("Session-Id")

	log.Printf("收到消息 (Session: %s)", sessionID)

	// 1. 无 Session → 处理首次消息
	if sessionID == "" {
		c.processFirstMessage(msg)
		msg.Ack()
		return
	}

	// 2. 有 Session → 检查归属
	if !c.ownsSession(sessionID) {
		log.Printf("Session %s 不属于本 Consumer，NAK", sessionID)
		msg.Nak(nats.AckWait(100 * time.Millisecond))
		return
	}

	// 3. 检查 Session 数据
	if !c.hasSessionData(sessionID) {
		log.Printf("Session %s 数据不存在，发布错误", sessionID)
		c.publishError(msg, "session_not_found", "会话已失效，请重新开始")
		msg.Ack()
		return
	}

	// 4. 处理后续消息
	c.processMessage(msg, sessionID)
	msg.Ack()
}

// ownsSession 检查 Session 是否属于本 Consumer
func (c *Consumer) ownsSession(sessionID string) bool {
	h := fnv.New32a()
	h.Write([]byte(sessionID))
	target := int(h.Sum32()) % c.config.ConsumerTotal
	return target == c.config.ConsumerID
}

// hasSessionData 检查是否有所属 Session 的数据
func (c *Consumer) hasSessionData(sessionID string) bool {
	_, exists := c.sessions[sessionID]
	return exists
}

// processFirstMessage 处理首次消息（无 Session）
func (c *Consumer) processFirstMessage(msg *nats.Msg) {
	// 解析消息
	var payload Message
	if err := json.Unmarshal(msg.Data, &payload); err != nil {
		log.Printf("解析消息失败: %v", err)
		c.publishError(msg, "invalid_request", "消息格式错误")
		return
	}

	// 生成 Session ID
	sessionID := generateSessionID()

	// 存储 Session
	c.sessions[sessionID] = &Session{
		ID:        sessionID,
		Context:   payload.Context,
		CreatedAt: time.Now(),
	}

	log.Printf("创建新 Session: %s", sessionID)

	// 处理业务逻辑（这里只是示例）
	result := c.handleBusinessLogic(payload.Content)

	// 发布响应
	response := Response{
		ID:        generateUUID(),
		Session:   sessionID,
		Content:   result,
		CreatedAt: time.Now().Format(time.RFC3339),
	}

	c.publishResponse(response)
}

// processMessage 处理后续消息（有 Session）
func (c *Consumer) processMessage(msg *nats.Msg, sessionID string) {
	// 解析消息
	var payload Message
	if err := json.Unmarshal(msg.Data, &payload); err != nil {
		log.Printf("解析消息失败: %v", err)
		c.publishError(msg, "invalid_request", "消息格式错误")
		return
	}

	session := c.sessions[sessionID]
	log.Printf("处理 Session %s 的消息", sessionID)

	// 处理业务逻辑（这里只是示例）
	result := c.handleBusinessLogicWithContext(payload.Content, session)

	// 发布响应
	response := Response{
		ID:        generateUUID(),
		Session:   sessionID,
		Content:   result,
		CreatedAt: time.Now().Format(time.RFC3339),
	}

	c.publishResponse(response)
}

// handleBusinessLogic 处理业务逻辑（示例）
func (c *Consumer) handleBusinessLogic(content interface{}) interface{} {
	return map[string]interface{}{
		"message": fmt.Sprintf("处理结果: %v", content),
		"processed_by": fmt.Sprintf("consumer-%d", c.config.ConsumerID),
	}
}

// handleBusinessLogicWithContext 处理带上下文的业务逻辑（示例）
func (c *Consumer) handleBusinessLogicWithContext(content interface{}, session *Session) interface{} {
	return map[string]interface{}{
		"message": fmt.Sprintf("处理结果: %v", content),
		"session_context": session.Context,
		"processed_by": fmt.Sprintf("consumer-%d", c.config.ConsumerID),
	}
}

// publishResponse 发布响应
func (c *Consumer) publishResponse(response Response) {
	data, err := json.Marshal(response)
	if err != nil {
		log.Printf("序列化响应失败: %v", err)
		return
	}

	msg := nats.NewMsg("summ.ai.output")
	msg.Data = data
	msg.Header.Set("Session-Id", response.Session)
	msg.Header.Set("Source", fmt.Sprintf("consumer-%d", c.config.ConsumerID))

	if _, err := c.js.PublishMsg(msg); err != nil {
		log.Printf("发布响应失败: %v", err)
		return
	}

	log.Printf("已发布响应到 summ.ai.output (Session: %s)", response.Session)
}

// publishError 发布错误消息
func (c *Consumer) publishError(msg *nats.Msg, code, message string) {
	sessionID := msg.Header.Get("Session-Id")

	errorMsg := ErrorMessage{
		ID:        generateUUID(),
		Session:   sessionID,
		Code:      code,
		Message:   message,
		CreatedAt: time.Now().Format(time.RFC3339),
	}

	data, err := json.Marshal(errorMsg)
	if err != nil {
		log.Printf("序列化错误消息失败: %v", err)
		return
	}

	if _, err := c.js.Publish("summ.ai.error", data); err != nil {
		log.Printf("发布错误消息失败: %v", err)
		return
	}

	log.Printf("已发布错误到 summ.ai.error (Code: %s)", code)
}

// generateSessionID 生成 Session ID
func generateSessionID() string {
	b := make([]byte, 16)
	rand.Read(b)
	return "sess_" + base64.RawURLEncoding.EncodeToString(b)[:21]
}

// generateUUID 生成 UUID
func generateUUID() string {
	b := make([]byte, 16)
	rand.Read(b)
	return fmt.Sprintf("%x-%x-%x-%x-%x", b[0:4], b[4:6], b[6:8], b[8:10], b[10:16])
}
