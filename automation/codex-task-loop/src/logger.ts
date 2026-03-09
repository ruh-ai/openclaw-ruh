import { inspect } from "node:util";

import type { LogLevel } from "./config.js";

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

export class Logger {
  constructor(private readonly minLevel: LogLevel) {}

  debug(message: string, context?: unknown): void {
    this.log("debug", message, context);
  }

  info(message: string, context?: unknown): void {
    this.log("info", message, context);
  }

  warn(message: string, context?: unknown): void {
    this.log("warn", message, context);
  }

  error(message: string, context?: unknown): void {
    this.log("error", message, context);
  }

  private log(level: LogLevel, message: string, context?: unknown): void {
    if (LEVEL_ORDER[level] < LEVEL_ORDER[this.minLevel]) {
      return;
    }

    const payload = {
      ts: new Date().toISOString(),
      level,
      message,
      context: context === undefined ? undefined : inspect(context, { depth: 5, breakLength: 120 }),
    };

    console.log(JSON.stringify(payload));
  }
}
