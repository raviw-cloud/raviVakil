type LogContext = Record<string, unknown>;

function fmt(level: string, msg: string, ctx?: LogContext): string {
  const base = `[${new Date().toISOString()}] [${level}] ${msg}`;
  return ctx && Object.keys(ctx).length ? `${base} ${JSON.stringify(ctx)}` : base;
}

export const logger = {
  info: (msg: string, ctx?: LogContext) => console.log(fmt('INFO', msg, ctx)),
  warn: (msg: string, ctx?: LogContext) => console.warn(fmt('WARN', msg, ctx)),
  error: (msg: string, ctx?: LogContext) => console.error(fmt('ERROR', msg, ctx)),
  debug: (msg: string, ctx?: LogContext) => {
    if (process.env.NODE_ENV !== 'production') console.log(fmt('DEBUG', msg, ctx));
  }
};
