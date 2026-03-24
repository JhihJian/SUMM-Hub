import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { SessionStore } from '../src/services/sessionStore'

describe('SessionStore', () => {
  let store: SessionStore

  beforeEach(() => {
    store = new SessionStore()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('create and retrieve session', () => {
    it('creates a session with sess_ prefix ID', () => {
      const session = store.create()
      expect(session.id).toMatch(/^sess_/)
      expect(session.createdAt).toBeGreaterThan(0)
      expect(session.updatedAt).toBeGreaterThan(0)
    })

    it('retrieves session by ID', () => {
      const session = store.create()
      const retrieved = store.get(session.id)
      expect(retrieved).toEqual(session)
    })

    it('returns null for unknown session ID', () => {
      const retrieved = store.get('sess_unknown')
      expect(retrieved).toBeNull()
    })
  })

  describe('list sessions', () => {
    it('returns empty array initially', () => {
      expect(store.list()).toEqual([])
    })

    it('lists all sessions sorted by updatedAt desc', async () => {
      const s1 = store.create()
      await new Promise(r => setTimeout(r, 10))
      const s2 = store.create()
      await new Promise(r => setTimeout(r, 10))
      const s3 = store.create()

      const sessions = store.list()
      expect(sessions).toHaveLength(3)
      expect(sessions[0].id).toBe(s3.id) // newest first
      expect(sessions[1].id).toBe(s2.id)
      expect(sessions[2].id).toBe(s1.id)
    })
  })

  describe('touch session', () => {
    it('updates session timestamp', async () => {
      const session = store.create()
      const oldUpdatedAt = session.updatedAt
      await new Promise(r => setTimeout(r, 10))
      store.touch(session.id)
      expect(store.get(session.id)!.updatedAt).toBeGreaterThan(oldUpdatedAt)
    })

    it('reorders session in list after touch', async () => {
      const s1 = store.create()
      await new Promise(r => setTimeout(r, 10))
      const s2 = store.create()

      // Initially s2 is first
      expect(store.list()[0].id).toBe(s2.id)

      // Touch s1 to make it newer
      await new Promise(r => setTimeout(r, 10))
      store.touch(s1.id)

      // Now s1 should be first
      expect(store.list()[0].id).toBe(s1.id)
    })
  })

  describe('messages', () => {
    it('stores messages per session', () => {
      const session = store.create()
      store.addMessage(session.id, { id: '1', role: 'user', content: 'hi' })
      expect(store.getMessages(session.id)).toHaveLength(1)
    })

    it('returns messages in order', () => {
      const session = store.create()
      store.addMessage(session.id, { id: '1', role: 'user', content: 'first' })
      store.addMessage(session.id, { id: '2', role: 'assistant', content: 'second' })
      const messages = store.getMessages(session.id)
      expect(messages[0].id).toBe('1')
      expect(messages[1].id).toBe('2')
    })

    it('returns empty array for unknown session', () => {
      expect(store.getMessages('sess_unknown')).toEqual([])
    })

    it('includes sessionId and timestamp in messages', () => {
      const session = store.create()
      store.addMessage(session.id, { id: '1', role: 'user', content: 'test' })
      const messages = store.getMessages(session.id)
      expect(messages[0].sessionId).toBe(session.id)
      expect(messages[0].timestamp).toBeGreaterThan(0)
    })
  })
})
