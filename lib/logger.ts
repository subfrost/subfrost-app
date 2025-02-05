interface LoggerOptions {
  level?: string;
  format?: string;
}

export const LEVELS: Record<string, number> = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

const COLORS: Record<string, string> = {
  error: "#FF6B6B",
  warn: "#FFD93D",
  info: "#4ECDC4",
  debug: "#95A5A6",
};

export class Logger {
  private namespace: string;
  private level: string;

  constructor(namespace: string, options: LoggerOptions = {}) {
    this.namespace = namespace;
    this.level = options.level || "info";
  }

  private shouldLog(level: string): boolean {
    return LEVELS[level] <= LEVELS[this.level];
  }

  private formatMessage(level: string, message: any, ...args: any[]): void {
    const timestamp = new Date().toISOString();
    const namespaceStyling = `
	      background: ${COLORS[level]}; 
	      color: white; 
	      padding: 2px 6px; 
	      border-radius: 3px;
	    `;

    (console as any)[level](
      `%c${this.namespace}%c ${timestamp} %c${level}%c`,
      namespaceStyling,
      "color: #666",
      `color: ${COLORS[level]}; font-weight: bold`,
      "color: inherit",
      message,
      ...args
    );
  }

  error(message: any, ...args: any[]): void {
    if (this.shouldLog("error")) {
      this.formatMessage("error", message, ...args);
    }
  }

  warn(message: any, ...args: any[]): void {
    if (this.shouldLog("warn")) {
      this.formatMessage("warn", message, ...args);
    }
  }

  info(message: any, ...args: any[]): void {
    if (this.shouldLog("info")) {
      this.formatMessage("info", message, ...args);
    }
  }

  debug(message: any, ...args: any[]): void {
    if (this.shouldLog("debug")) {
      this.formatMessage("debug", message, ...args);
    }
  }
}

const loggers: { [key: string]: Logger } = {};

export function getLogger(namespace: string, options?: LoggerOptions): Logger {
  if (!loggers[namespace]) {
    loggers[namespace] = new Logger(namespace, options);
  }
  return loggers[namespace];
}
