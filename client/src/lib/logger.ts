/**
 * Client-side logging utility
 * Mirrors server logging for consistency
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

function getTimestamp(): string {
  const now = new Date();
  return now.toISOString().split('T')[1].split('Z')[0];
}

function formatLog(level: LogLevel, message: string, data?: Record<string, any>): void {
  const timestamp = getTimestamp();
  const prefix = `[${timestamp}] [${level.toUpperCase()}]`;

  if (data && Object.keys(data).length > 0) {
    console.log(`${prefix} ${message}`, data);
  } else {
    console.log(`${prefix} ${message}`);
  }
}

export const logger = {
  debug: (message: string, data?: Record<string, any>) => formatLog('debug', message, data),
  info: (message: string, data?: Record<string, any>) => formatLog('info', message, data),
  warn: (message: string, data?: Record<string, any>) => formatLog('warn', message, data),
  error: (message: string, data?: Record<string, any>) => formatLog('error', message, data),
};
