/**
 * Logger Tests (SSRK-174, SSRK-180, SSRK-181)
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Logger, createLogger, LogLevel, LogEvent, LogComponent } from '../../shared/src/logger.js';

describe('Logger', () => {
  describe('Log Schema (SSRK-174)', () => {
    it('should include required fields', () => {
      const output = { log: vi.fn() };
      const logger = createLogger({ output, level: LogLevel.DEBUG });

      logger.info('test.event', 'Test message');

      expect(output.log).toHaveBeenCalled();
      const logJson = output.log.mock.calls[0][0];
      const entry = JSON.parse(logJson);

      expect(entry.ts).toBeDefined();
      expect(entry.level).toBe('info');
      expect(entry.component).toBeDefined();
      expect(entry.event).toBe('test.event');
      expect(entry.message).toBe('Test message');
    });

    it('should include stream_id when set', () => {
      const output = { log: vi.fn() };
      const logger = createLogger({ output, streamId: 'conn-123', level: LogLevel.DEBUG });

      logger.info('test.event', 'Test message');

      const entry = JSON.parse(output.log.mock.calls[0][0]);
      expect(entry.stream_id).toBe('conn-123');
    });

    it('should include details when provided', () => {
      const output = { log: vi.fn() };
      const logger = createLogger({ output, level: LogLevel.DEBUG });

      logger.info('test.event', 'Test message', { context: 'value' });

      const entry = JSON.parse(output.log.mock.calls[0][0]);
      expect(entry.details.context).toBe('value');
    });
  });

  describe('Log Levels (SSRK-181)', () => {
    it('should respect minimum log level', () => {
      const output = { log: vi.fn(), warn: vi.fn(), error: vi.fn() };
      const logger = createLogger({ output, level: LogLevel.WARN });

      logger.debug('test', 'Debug message');
      logger.info('test', 'Info message');
      logger.warn('test', 'Warn message');
      logger.error('test', 'Error message');

      expect(output.log).not.toHaveBeenCalled();
      expect(output.warn).toHaveBeenCalledTimes(1);
      expect(output.error).toHaveBeenCalledTimes(1);
    });

    it('should allow changing log level', () => {
      const output = { log: vi.fn() };
      const logger = createLogger({ output, level: LogLevel.ERROR });

      logger.info('test', 'Should not log');
      expect(output.log).not.toHaveBeenCalled();

      logger.setLevel(LogLevel.INFO);
      logger.info('test', 'Should log');
      expect(output.log).toHaveBeenCalled();
    });

    it('should support all log levels', () => {
      const output = { 
        log: vi.fn(), 
        debug: vi.fn(),
        warn: vi.fn(), 
        error: vi.fn() 
      };
      const logger = createLogger({ output, level: LogLevel.DEBUG });

      logger.debug('test', 'Debug');
      logger.info('test', 'Info');
      logger.warn('test', 'Warn');
      logger.error('test', 'Error');

      expect(output.debug).toHaveBeenCalled();
      expect(output.log).toHaveBeenCalled();
      expect(output.warn).toHaveBeenCalled();
      expect(output.error).toHaveBeenCalled();
    });
  });

  describe('Sanitization (SSRK-180)', () => {
    it('should redact sensitive fields', () => {
      const output = { log: vi.fn() };
      const logger = createLogger({ output, level: LogLevel.DEBUG });

      logger.info('test', 'Test', {
        password: 'secret123',
        token: 'abc123',
        api_key: 'key123',
        normal: 'visible',
      });

      const entry = JSON.parse(output.log.mock.calls[0][0]);
      expect(entry.details.password).toBe('[REDACTED]');
      expect(entry.details.token).toBe('[REDACTED]');
      expect(entry.details.api_key).toBe('[REDACTED]');
      expect(entry.details.normal).toBe('visible');
    });

    it('should truncate long strings', () => {
      const output = { log: vi.fn() };
      const logger = createLogger({ output, level: LogLevel.DEBUG });

      const longString = 'x'.repeat(1000);
      logger.info('test', 'Test', { data: longString });

      const entry = JSON.parse(output.log.mock.calls[0][0]);
      expect(entry.details.data.length).toBeLessThan(600);
      expect(entry.details.data).toContain('[truncated]');
    });
  });

  describe('Child Logger', () => {
    it('should create child with inherited settings', () => {
      const output = { log: vi.fn() };
      const parent = createLogger({ output, component: 'parent', level: LogLevel.DEBUG });

      const child = parent.child({ streamId: 'child-stream' });
      child.info('test', 'Child message');

      const entry = JSON.parse(output.log.mock.calls[0][0]);
      expect(entry.component).toBe('parent');
      expect(entry.stream_id).toBe('child-stream');
    });

    it('should merge context', () => {
      const output = { log: vi.fn() };
      const parent = createLogger({ 
        output, 
        level: LogLevel.DEBUG,
        context: { parent_key: 'parent_value' } 
      });

      const child = parent.child({ context: { child_key: 'child_value' } });
      child.info('test', 'Test');

      const entry = JSON.parse(output.log.mock.calls[0][0]);
      expect(entry.parent_key).toBe('parent_value');
      expect(entry.child_key).toBe('child_value');
    });
  });

  describe('Enable/Disable', () => {
    it('should not log when disabled', () => {
      const output = { log: vi.fn() };
      const logger = createLogger({ output, enabled: false, level: LogLevel.DEBUG });

      logger.info('test', 'Should not log');

      expect(output.log).not.toHaveBeenCalled();
    });

    it('should allow enabling/disabling', () => {
      const output = { log: vi.fn() };
      const logger = createLogger({ output, enabled: true, level: LogLevel.DEBUG });

      logger.info('test', 'Should log');
      expect(output.log).toHaveBeenCalledTimes(1);

      logger.setEnabled(false);
      logger.info('test', 'Should not log');
      expect(output.log).toHaveBeenCalledTimes(1);

      logger.setEnabled(true);
      logger.info('test', 'Should log again');
      expect(output.log).toHaveBeenCalledTimes(2);
    });
  });

  describe('Log Events', () => {
    it('should define standard events', () => {
      expect(LogEvent.STREAM_CONNECT).toBe('stream.connect');
      expect(LogEvent.STREAM_OPEN).toBe('stream.open');
      expect(LogEvent.STREAM_CLOSE).toBe('stream.close');
      expect(LogEvent.CLIENT_CONNECTING).toBe('client.connecting');
      expect(LogEvent.RESUME_ATTEMPT).toBe('resume.attempt');
      expect(LogEvent.PARSE_ERROR).toBe('parse.error');
    });
  });

  describe('Log Components', () => {
    it('should define standard components', () => {
      expect(LogComponent.SERVER).toBe('server');
      expect(LogComponent.CLIENT).toBe('client');
      expect(LogComponent.STREAM).toBe('stream');
      expect(LogComponent.RESUME).toBe('resume');
    });
  });
});
