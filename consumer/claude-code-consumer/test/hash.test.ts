import { describe, it, expect } from 'vitest';
import { fnv1aHash, ownsSession } from '../src/utils/hash';

describe('fnv1aHash', () => {
  it('should return consistent hash for the same input', () => {
    const input = 'test-session-id';
    const hash1 = fnv1aHash(input);
    const hash2 = fnv1aHash(input);

    expect(hash1).toBe(hash2);
    expect(typeof hash1).toBe('number');
  });

  it('should return different hashes for different inputs', () => {
    const hash1 = fnv1aHash('session-1');
    const hash2 = fnv1aHash('session-2');

    expect(hash1).not.toBe(hash2);
  });

  it('should return unsigned 32-bit integer', () => {
    const hash = fnv1aHash('any-string');

    expect(hash).toBeGreaterThanOrEqual(0);
    expect(hash).toBeLessThanOrEqual(4294967295); // 2^32 - 1
  });

  it('should handle empty string', () => {
    const hash = fnv1aHash('');

    expect(typeof hash).toBe('number');
    expect(hash).toBeGreaterThanOrEqual(0);
  });

  it('should handle unicode characters', () => {
    const hash = fnv1aHash('会话-测试');

    expect(typeof hash).toBe('number');
    expect(hash).toBeGreaterThanOrEqual(0);
  });
});

describe('ownsSession', () => {
  it('should distribute sessions across consumers', () => {
    const sessionId = 'test-session';
    const totalConsumers = 3;

    // Find which consumer owns this session
    let ownerCount = 0;
    for (let consumerId = 0; consumerId < totalConsumers; consumerId++) {
      if (ownsSession(sessionId, consumerId, totalConsumers)) {
        ownerCount++;
      }
    }

    // Exactly one consumer should own the session
    expect(ownerCount).toBe(1);
  });

  it('should always return exactly one owner among all consumers', () => {
    const sessionIds = ['session-1', 'session-2', 'session-3', 'session-4', 'session-5'];
    const totalConsumers = 4;

    for (const sessionId of sessionIds) {
      let ownerCount = 0;
      for (let consumerId = 0; consumerId < totalConsumers; consumerId++) {
        if (ownsSession(sessionId, consumerId, totalConsumers)) {
          ownerCount++;
        }
      }
      expect(ownerCount).toBe(1);
    }
  });

  it('should return consistent results for the same inputs', () => {
    const sessionId = 'consistent-session';
    const consumerId = 1;
    const total = 3;

    const result1 = ownsSession(sessionId, consumerId, total);
    const result2 = ownsSession(sessionId, consumerId, total);

    expect(result1).toBe(result2);
  });

  it('should handle single consumer case', () => {
    const sessionId = 'any-session';
    const result = ownsSession(sessionId, 0, 1);

    // Single consumer (id=0) should own all sessions
    expect(result).toBe(true);
  });

  it('should distribute sessions roughly evenly', () => {
    const totalConsumers = 3;
    const sessionCount = 300;
    const distribution: number[] = new Array(totalConsumers).fill(0);

    for (let i = 0; i < sessionCount; i++) {
      const sessionId = `session-${i}`;
      for (let consumerId = 0; consumerId < totalConsumers; consumerId++) {
        if (ownsSession(sessionId, consumerId, totalConsumers)) {
          distribution[consumerId]++;
          break;
        }
      }
    }

    // Each consumer should get roughly 1/3 of sessions
    const expectedPerConsumer = sessionCount / totalConsumers;
    const tolerance = expectedPerConsumer * 0.2; // 20% tolerance

    for (const count of distribution) {
      expect(count).toBeGreaterThan(expectedPerConsumer - tolerance);
      expect(count).toBeLessThan(expectedPerConsumer + tolerance);
    }
  });
});
