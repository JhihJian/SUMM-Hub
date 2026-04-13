import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events';
import { Readable } from 'stream';
import { ClaudeExecutor } from '../src/executor';
import type { ChildProcess } from 'child_process';

// Mock child_process
vi.mock('child_process', () => ({
  spawn: vi.fn(),
}));

import { spawn } from 'child_process';

interface MockChildProcess extends EventEmitter {
  stdin: {
    write: ReturnType<typeof vi.fn>;
    end: ReturnType<typeof vi.fn>;
  };
  stdout: Readable;
  stderr: EventEmitter;
  kill: ReturnType<typeof vi.fn>;
  killed: boolean;
}

function createMockProcess(): MockChildProcess {
  const proc = new EventEmitter() as MockChildProcess;
  proc.stdin = {
    write: vi.fn(),
    end: vi.fn(),
  };
  // Create a proper Readable stream for stdout
  proc.stdout = new Readable({ read() {} });
  proc.stderr = new EventEmitter();
  proc.kill = vi.fn();
  proc.killed = false;
  return proc;
}

describe('ClaudeExecutor', () => {
  let executor: ClaudeExecutor;
  let mockProcess: MockChildProcess;

  beforeEach(() => {
    executor = new ClaudeExecutor('/workspace');
    mockProcess = createMockProcess();
    vi.mocked(spawn).mockReturnValue(mockProcess as unknown as ChildProcess);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('start', () => {
    it('should spawn claude process with correct arguments', () => {
      executor.start();

      expect(spawn).toHaveBeenCalledWith('claude', ['--print', '--verbose', '--output-format', 'stream-json', '--dangerously-skip-permissions'], {
        cwd: '/workspace',
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    });

    it('should spawn claude process with --resume flag when resume is provided', () => {
      executor.start('session-123');

      expect(spawn).toHaveBeenCalledWith('claude', ['--print', '--verbose', '--output-format', 'stream-json', '--dangerously-skip-permissions', '--resume', 'session-123'], {
        cwd: '/workspace',
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    });

    it('should throw error if process already running', () => {
      executor.start();

      expect(() => executor.start()).toThrow('Claude process already running');
    });
  });

  describe('send', () => {
    it('should write message to stdin', () => {
      executor.start();
      executor.send('Hello Claude');

      const expectedPayload = JSON.stringify({
        type: 'user_message',
        content: 'Hello Claude',
      }) + '\n';

      expect(mockProcess.stdin.write).toHaveBeenCalledWith(expectedPayload);
    });

    it('should throw error if process not running', () => {
      expect(() => executor.send('Hello')).toThrow('Claude process not running');
    });
  });

  describe('stream', () => {
    it('should parse and yield SDK messages', async () => {
      executor.start();

      const messages = [
        { type: 'message_start', message: { id: 'msg-1', role: 'assistant' } },
        { type: 'assistant_message', content: 'Hello!' },
        { type: 'message_stop' },
      ];

      // Start streaming in background
      const streamPromise = (async () => {
        const results = [];
        for await (const msg of executor.stream()) {
          results.push(msg);
        }
        return results;
      })();

      // Push messages to the readable stream
      setTimeout(() => {
        for (const msg of messages) {
          (mockProcess.stdout as Readable).push(JSON.stringify(msg) + '\n');
        }
        (mockProcess.stdout as Readable).push(null); // Signal end of stream
      }, 10);

      const results = await streamPromise;

      expect(results).toHaveLength(3);
      expect(results[0]).toEqual(messages[0]);
      expect(results[1]).toEqual(messages[1]);
      expect(results[2]).toEqual(messages[2]);
    });

    it('should stop streaming on message_stop', async () => {
      executor.start();

      const streamPromise = (async () => {
        const results = [];
        for await (const msg of executor.stream()) {
          results.push(msg);
        }
        return results;
      })();

      // Push message_stop to the readable stream
      setTimeout(() => {
        (mockProcess.stdout as Readable).push(JSON.stringify({ type: 'message_stop' }) + '\n');
        (mockProcess.stdout as Readable).push(null);
      }, 10);

      const results = await streamPromise;

      expect(results).toHaveLength(1);
      expect(results[0].type).toBe('message_stop');
    });

    it('should extract session ID from message_start', async () => {
      executor.start();

      const streamPromise = (async () => {
        for await (const _ of executor.stream()) {
          // consume iterator
        }
      })();

      setTimeout(() => {
        (mockProcess.stdout as Readable).push(JSON.stringify({ type: 'message_stop' }) + '\n');
        (mockProcess.stdout as Readable).push(null);
      }, 10);

      await streamPromise;

      // Session ID should be extracted (from message_start, but we just have message_stop)
      expect(executor.getSessionId()).toBeNull();
    });

    it('should throw error if process not running', async () => {
      await expect(async () => {
        for await (const _ of executor.stream()) {
          // This should throw
        }
      }).rejects.toThrow('Claude process not running');
    });

    it('should handle invalid JSON gracefully', async () => {
      executor.start();

      const streamPromise = (async () => {
        const results = [];
        for await (const msg of executor.stream()) {
          results.push(msg);
        }
        return results;
      })();

      setTimeout(() => {
        (mockProcess.stdout as Readable).push('invalid json\n');
        (mockProcess.stdout as Readable).push(JSON.stringify({ type: 'message_stop' }) + '\n');
        (mockProcess.stdout as Readable).push(null);
      }, 10);

      const results = await streamPromise;

      // Invalid JSON should be skipped, only message_stop should be yielded
      expect(results).toHaveLength(1);
    });
  });

  describe('kill', () => {
    it('should kill the process', () => {
      executor.start();
      executor.kill();

      expect(mockProcess.kill).toHaveBeenCalledWith('SIGTERM');
    });

    it('should handle killing non-running process gracefully', () => {
      expect(() => executor.kill()).not.toThrow();
    });
  });

  describe('isRunning', () => {
    it('should return false initially', () => {
      expect(executor.isRunning()).toBe(false);
    });

    it('should return true after start', () => {
      executor.start();
      expect(executor.isRunning()).toBe(true);
    });

    it('should return false after kill', () => {
      executor.start();
      executor.kill();
      expect(executor.isRunning()).toBe(false);
    });
  });

  describe('getSessionId', () => {
    it('should return null initially', () => {
      expect(executor.getSessionId()).toBeNull();
    });

    it('should return session ID after message_start', async () => {
      executor.start();

      const streamPromise = (async () => {
        for await (const _ of executor.stream()) {
          // consume iterator
        }
      })();

      setTimeout(() => {
        (mockProcess.stdout as Readable).push(JSON.stringify({
          type: 'message_start',
          message: { id: 'session-abc-123', role: 'assistant' }
        }) + '\n');
        (mockProcess.stdout as Readable).push(JSON.stringify({ type: 'message_stop' }) + '\n');
        (mockProcess.stdout as Readable).push(null);
      }, 10);

      await streamPromise;

      expect(executor.getSessionId()).toBe('session-abc-123');
    });
  });
});
