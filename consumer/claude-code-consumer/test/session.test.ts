import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { SessionManager } from '../src/session';

describe('SessionManager', () => {
  let manager: SessionManager;

  beforeEach(() => {
    manager = new SessionManager(3600000); // 1 hour TTL
  });

  afterEach(() => {
    manager.stopCleanup();
  });

  describe('create', () => {
    it('should create a new session', () => {
      const session = manager.create('session-1', '/workspace');

      expect(session.id).toBe('session-1');
      expect(session.cwd).toBe('/workspace');
      expect(session.createdAt).toBeDefined();
      expect(session.lastActivityAt).toBeDefined();
    });

    it('should track created sessions', () => {
      manager.create('session-1', '/workspace');

      expect(manager.size()).toBe(1);
      expect(manager.has('session-1')).toBe(true);
    });

    it('should allow overwriting existing session', () => {
      manager.create('session-1', '/workspace1');
      manager.create('session-1', '/workspace2');

      const session = manager.get('session-1');
      expect(session?.cwd).toBe('/workspace2');
    });
  });

  describe('get', () => {
    it('should return undefined for non-existent session', () => {
      const session = manager.get('non-existent');

      expect(session).toBeUndefined();
    });

    it('should return existing session', () => {
      manager.create('session-1', '/workspace');

      const session = manager.get('session-1');

      expect(session).toBeDefined();
      expect(session?.id).toBe('session-1');
    });

    it('should update lastActivityAt on access', async () => {
      manager.create('session-1', '/workspace');
      const originalSession = manager.get('session-1');
      const originalActivity = originalSession!.lastActivityAt;

      // Wait a bit
      await new Promise(resolve => setTimeout(resolve, 10));

      manager.get('session-1');
      const updatedSession = manager.get('session-1');

      expect(updatedSession!.lastActivityAt).toBeGreaterThan(originalActivity);
    });
  });

  describe('delete', () => {
    it('should delete existing session', () => {
      manager.create('session-1', '/workspace');
      manager.delete('session-1');

      expect(manager.has('session-1')).toBe(false);
      expect(manager.size()).toBe(0);
    });

    it('should handle deleting non-existent session gracefully', () => {
      expect(() => manager.delete('non-existent')).not.toThrow();
    });
  });

  describe('has', () => {
    it('should return true for existing session', () => {
      manager.create('session-1', '/workspace');

      expect(manager.has('session-1')).toBe(true);
    });

    it('should return false for non-existent session', () => {
      expect(manager.has('non-existent')).toBe(false);
    });
  });

  describe('size', () => {
    it('should return correct count', () => {
      expect(manager.size()).toBe(0);

      manager.create('session-1', '/workspace');
      expect(manager.size()).toBe(1);

      manager.create('session-2', '/workspace');
      expect(manager.size()).toBe(2);

      manager.delete('session-1');
      expect(manager.size()).toBe(1);
    });
  });

  describe('getAllIds', () => {
    it('should return all session IDs', () => {
      manager.create('session-1', '/workspace');
      manager.create('session-2', '/workspace');
      manager.create('session-3', '/workspace');

      const ids = manager.getAllIds();

      expect(ids).toContain('session-1');
      expect(ids).toContain('session-2');
      expect(ids).toContain('session-3');
      expect(ids.length).toBe(3);
    });

    it('should return empty array when no sessions', () => {
      const ids = manager.getAllIds();

      expect(ids).toEqual([]);
    });
  });

  describe('TTL expiration', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should cleanup expired sessions', () => {
      const shortTtlManager = new SessionManager(1000); // 1 second TTL

      shortTtlManager.create('session-1', '/workspace');

      // Session should exist
      expect(shortTtlManager.has('session-1')).toBe(true);

      // Advance time past TTL
      vi.advanceTimersByTime(1500);

      // Trigger cleanup
      shortTtlManager.cleanup();

      // Session should be expired
      expect(shortTtlManager.has('session-1')).toBe(false);

      shortTtlManager.stopCleanup();
    });

    it('should keep active sessions after cleanup', () => {
      const shortTtlManager = new SessionManager(1000);

      shortTtlManager.create('session-1', '/workspace');

      // Advance time 500ms (within TTL)
      vi.advanceTimersByTime(500);

      // Access the session to update lastActivityAt
      shortTtlManager.get('session-1');

      // Advance another 500ms (total 1000ms, but activity was at 500ms)
      vi.advanceTimersByTime(500);

      // Trigger cleanup
      shortTtlManager.cleanup();

      // Session should still exist (activity was 500ms ago, TTL is 1000ms)
      expect(shortTtlManager.has('session-1')).toBe(true);

      shortTtlManager.stopCleanup();
    });
  });

  describe('cleanup scheduler', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should start and stop cleanup interval', () => {
      manager.startCleanup();

      // Cleanup should be scheduled
      expect(manager['cleanupInterval']).not.toBeNull();

      manager.stopCleanup();

      // Cleanup should be stopped
      expect(manager['cleanupInterval']).toBeNull();
    });

    it('should not start duplicate cleanup intervals', () => {
      manager.startCleanup();
      const interval1 = manager['cleanupInterval'];

      manager.startCleanup(); // Should be no-op
      const interval2 = manager['cleanupInterval'];

      expect(interval1).toBe(interval2);

      manager.stopCleanup();
    });
  });
});
