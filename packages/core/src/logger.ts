type Level = 'info' | 'warn' | 'error';
type Context = Record<string, unknown>;

export interface Logger {
  info(message: string, context?: Context): void;
  warn(message: string, context?: Context): void;
  error(message: string, context?: Context): void;
}

/** A deliberately tiny logger: one readable line per event, with optional context. */
export function createLogger(component: string): Logger {
  const write = (level: Level, message: string, context?: Context) => {
    const suffix = context ? ` ${JSON.stringify(context)}` : '';
    console[level](`${new Date().toISOString()} ${level.toUpperCase()} [${component}] ${message}${suffix}`);
  };

  return {
    info: (message, context) => write('info', message, context),
    warn: (message, context) => write('warn', message, context),
    error: (message, context) => write('error', message, context),
  };
}

export function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
