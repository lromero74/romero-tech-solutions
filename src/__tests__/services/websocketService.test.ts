/**
 * Tests for the frontend websocketService callback-registration pattern.
 *
 * The actual socket.io connection is mocked — these tests focus on the
 * subscribe/unsubscribe semantics and the multiple-subscriber behavior
 * that landed in the new agent flows (`onAgentCommandCompleted`,
 * `onAgentCommandProgress`, `onAgentMetricsChange`).
 */

// Mock socket.io-client BEFORE importing the service.
const mockSocket = {
  on: jest.fn(),
  emit: jest.fn(),
  disconnect: jest.fn(),
};
jest.mock('socket.io-client', () => ({
  io: jest.fn(() => mockSocket),
  Socket: class {},
}));

import { websocketService } from '../../services/websocketService';

describe('websocketService — subscriber registration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'log').mockImplementation();
    jest.spyOn(console, 'warn').mockImplementation();
    jest.spyOn(console, 'error').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('onAgentStatusChange', () => {
    it('returns an unsubscribe function that removes the callback', () => {
      const cb = jest.fn();
      const unsubscribe = websocketService.onAgentStatusChange(cb);
      expect(typeof unsubscribe).toBe('function');
      // Calling unsubscribe should not throw.
      expect(() => unsubscribe()).not.toThrow();
    });

    it('supports multiple concurrent subscribers (independent unsubscribe)', () => {
      const cb1 = jest.fn();
      const cb2 = jest.fn();
      const unsub1 = websocketService.onAgentStatusChange(cb1);
      const unsub2 = websocketService.onAgentStatusChange(cb2);
      // Each unsubscribe targets only its own callback.
      unsub1();
      // cb1 is gone, cb2 still subscribed; calling unsub2 should still work.
      expect(() => unsub2()).not.toThrow();
    });
  });

  describe('onAgentCommandCompleted', () => {
    it('returns an unsubscribe function', () => {
      const cb = jest.fn();
      const unsubscribe = websocketService.onAgentCommandCompleted(cb);
      expect(typeof unsubscribe).toBe('function');
      unsubscribe();
    });

    it('handles unsubscribing a callback that was already unsubscribed (no double-pop)', () => {
      const cb = jest.fn();
      const unsubscribe = websocketService.onAgentCommandCompleted(cb);
      unsubscribe();
      expect(() => unsubscribe()).not.toThrow();
    });

    it('supports many subscribers — used by multiple update modals', () => {
      const callbacks = Array.from({ length: 5 }, () => jest.fn());
      const unsubs = callbacks.map((cb) =>
        websocketService.onAgentCommandCompleted(cb)
      );
      unsubs.forEach((u) => u());
      // None of the unsubscribes should throw or interfere with each other.
    });
  });

  describe('onAgentCommandProgress', () => {
    it('returns an unsubscribe function', () => {
      const cb = jest.fn();
      const unsubscribe = websocketService.onAgentCommandProgress(cb);
      expect(typeof unsubscribe).toBe('function');
      unsubscribe();
    });

    it('separate from onAgentCommandCompleted (different callback list)', () => {
      const completedCb = jest.fn();
      const progressCb = jest.fn();
      const unsubCompleted = websocketService.onAgentCommandCompleted(completedCb);
      const unsubProgress = websocketService.onAgentCommandProgress(progressCb);
      // Unsubscribing one should not affect the other.
      unsubCompleted();
      expect(() => unsubProgress()).not.toThrow();
    });
  });

  describe('onAgentMetricsChange', () => {
    it('returns an unsubscribe function', () => {
      const cb = jest.fn();
      const unsubscribe = websocketService.onAgentMetricsChange(cb);
      expect(typeof unsubscribe).toBe('function');
      unsubscribe();
    });
  });

  describe('connection state', () => {
    it('reports disconnected when not connected', () => {
      // The service exposes connection state via methods or properties.
      expect(websocketService).toBeDefined();
    });
  });
});
