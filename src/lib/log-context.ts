import { AsyncLocalStorage } from "node:async_hooks";

export interface LogContext {
  requestId?: string;
  workerRunId?: string;
}

const storage = new AsyncLocalStorage<LogContext>();

/** The active request/worker-run correlation id(s), if any. */
export function getLogContext(): LogContext | undefined {
  return storage.getStore();
}

/**
 * Sets the log context for the remainder of the current async execution
 * chain (no callback wrapper needed) — used by requireAuth, which can't
 * wrap the rest of each route handler's logic in a callback.
 */
export function setLogContext(context: LogContext): void {
  storage.enterWith(context);
}

/** Runs fn with a fresh log context — used to scope one worker tick's logs. */
export function runWithLogContext<T>(context: LogContext, fn: () => T): T {
  return storage.run(context, fn);
}
