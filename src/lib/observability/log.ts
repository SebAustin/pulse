/**
 * Structured logger for Pulse.
 *
 * Outputs JSON to stdout (picked up by Vercel/CloudWatch).
 * Rule: never log sensitive data (tokens, credentials).
 * NFR-05.1: capture eventId, momentId, errorType, ddbHttpStatus on failures.
 */

type LogLevel = "debug" | "info" | "warn" | "error";

interface LogRecord {
  level: LogLevel;
  msg: string;
  eventId?: string;
  momentId?: string;
  errorType?: string;
  ddbHttpStatus?: number;
  [key: string]: unknown;
}

function emit(level: LogLevel, msg: string, meta: Omit<LogRecord, "level" | "msg"> = {}): void {
  const record: LogRecord = { level, msg, ...meta, ts: Date.now() };
  // In production we emit JSON; in test/dev keep it readable.
  if (process.env.NODE_ENV === "test") {
    if (level === "error") console.error("[pulse]", msg, meta);
    return;
  }
  console.log(JSON.stringify(record));
}

export const log = {
  debug: (msg: string, meta?: Omit<LogRecord, "level" | "msg">) =>
    emit("debug", msg, meta),
  info: (msg: string, meta?: Omit<LogRecord, "level" | "msg">) =>
    emit("info", msg, meta),
  warn: (msg: string, meta?: Omit<LogRecord, "level" | "msg">) =>
    emit("warn", msg, meta),
  error: (msg: string, meta?: Omit<LogRecord, "level" | "msg">) =>
    emit("error", msg, meta),
};
