import { connect, NatsConnection, JetStreamClient, Subscription } from 'nats'
import type { NatsInputMessage, NatsOutputMessage, NatsErrorMessage } from '../types'

export interface NatsServiceConfig {
  url: string
}

/**
 * NATS service for publishing to summ.ai.input and subscribing to outputs.
 */
export class NatsService {
  private config: NatsServiceConfig
  private nc: NatsConnection | null = null
  private js: JetStreamClient | null = null
  private subscriptions: Subscription[] = []

  constructor(config: NatsServiceConfig) {
    this.config = config
  }

  /**
   * Connect to NATS server
   */
  async connect(): Promise<void> {
    if (this.nc) return

    this.nc = await connect({
      servers: this.config.url,
    })
    this.js = this.nc.jetstream()
  }

  /**
   * Disconnect from NATS server
   */
  async disconnect(): Promise<void> {
    if (!this.nc) return

    // Unsubscribe all
    for (const sub of this.subscriptions) {
      sub.unsubscribe()
    }
    this.subscriptions = []

    await this.nc.close()
    this.nc = null
    this.js = null
  }

  /**
   * Check if connected to NATS
   */
  isConnected(): boolean {
    return this.nc !== null && !this.nc.isClosed()
  }

  /**
   * Check if subscribed to output subjects
   */
  isSubscribed(): boolean {
    return this.subscriptions.length > 0
  }

  /**
   * Generate a unique message ID
   */
  generateMessageId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
  }

  /**
   * Publish an input message to summ.ai.input via JetStream
   */
  async publishInput(sessionId: string, content: string): Promise<void> {
    if (!this.js) {
      throw new Error('Not connected to NATS')
    }

    const message: NatsInputMessage = {
      id: this.generateMessageId(),
      session_id: sessionId,
      content: { text: content },
      context: { source: 'web' },
      timestamp: Date.now(),
    }

    await this.js.publish('summ.ai.input', JSON.stringify(message))
  }

  /**
   * Subscribe to summ.ai.output for assistant messages
   * Uses regular NATS subscription for real-time delivery
   */
  async subscribeOutput(callback: (msg: NatsOutputMessage) => void): Promise<void> {
    if (!this.nc) {
      throw new Error('Not connected to NATS')
    }

    const sub = this.nc.subscribe('summ.ai.output', {
      callback: (err, msg) => {
        if (err) {
          console.error('NATS subscription error:', err)
          return
        }
        try {
          const data = JSON.parse(new TextDecoder().decode(msg.data)) as NatsOutputMessage
          callback(data)
        } catch (e) {
          console.error('Failed to parse output message:', e)
        }
      },
    })

    this.subscriptions.push(sub)
  }

  /**
   * Subscribe to summ.ai.error for error messages
   * Uses regular NATS subscription for real-time delivery
   */
  async subscribeError(callback: (msg: NatsErrorMessage) => void): Promise<void> {
    if (!this.nc) {
      throw new Error('Not connected to NATS')
    }

    const sub = this.nc.subscribe('summ.ai.error', {
      callback: (err, msg) => {
        if (err) {
          console.error('NATS subscription error:', err)
          return
        }
        try {
          const data = JSON.parse(new TextDecoder().decode(msg.data)) as NatsErrorMessage
          callback(data)
        } catch (e) {
          console.error('Failed to parse error message:', e)
        }
      },
    })

    this.subscriptions.push(sub)
  }
}
