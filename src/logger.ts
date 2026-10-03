type Level = "debug" | "info" | "warn" | "error"
type Meta = Record<string, unknown>

function emit(level: Level, msg: string, meta?: Meta): void {
  const line = `${new Date().toISOString()} ${level.toUpperCase()} ${msg}`
  const out = meta ? `${line} ${JSON.stringify(meta)}` : line
  if (level === "error" || level === "warn") console.error(out)
  else console.log(out)
}

export const log = {
  debug: (msg: string, meta?: Meta) => emit("debug", msg, meta),
  info: (msg: string, meta?: Meta) => emit("info", msg, meta),
  warn: (msg: string, meta?: Meta) => emit("warn", msg, meta),
  error: (msg: string, meta?: Meta) => emit("error", msg, meta),
}
