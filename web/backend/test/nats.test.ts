import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { NatsService } from '../src/services/nats'

const NATS_URL = process.env.NATS_URL || 'nats://localhost:4222'

describe('NatsService', () => {
  let service: NatsService

  beforeAll(async () => {
    service = new NatsService({ url: NATS_URL })
  })

  afterAll(async () => {
    if (service) {
      await service.disconnect()
    }
  })

  describe('connection', () => {
    it('connects to NATS server', async () => {
      await service.connect()
      expect(service.isConnected()).toBe(true)
    })

    it('disconnects from NATS server', async () => {
      await service.connect()
      expect(service.isConnected()).toBe(true)
      await service.disconnect()
      expect(service.isConnected()).toBe(false)
    })
  })

  describe('publishing', () => {
    it('publishes input message to summ.ai.input', async () => {
      await service.connect()
      // Should not throw
      await expect(
        service.publishInput('sess_test', 'Hello world')
      ).resolves.not.toThrow()
    })

    it('generates unique message IDs', async () => {
      await service.connect()
      const id1 = service.generateMessageId()
      const id2 = service.generateMessageId()
      expect(id1).not.toBe(id2)
      expect(id1).toMatch(/^\d+-/)
    })
  })

  describe('subscription', () => {
    it('subscribes to summ.ai.output', async () => {
      await service.connect()
      const messages: any[] = []

      await service.subscribeOutput((msg) => {
        messages.push(msg)
      })

      // Subscription should be active (no throw)
      expect(service.isSubscribed()).toBe(true)
    })
  })
})
