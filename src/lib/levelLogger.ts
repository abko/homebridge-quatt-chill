/** Graduated log levels, modelled on ebaauw's homebridge-lib. */
export enum LogLevel {
  Off = 0,
  Info = 1,
  Debug = 2,
  Verbose = 3,
}

/** Structural subset of Homebridge's `Logging` (and of the CLI console shim). */
export interface LogSink {
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
}

/**
 * Wraps a log sink with graduated levels.
 * `warn`/`error` always pass through; `info`/`debug`/`vdebug` are gated by `level`.
 */
export class LevelLogger {
  constructor(
    private readonly log: LogSink,
    public level: LogLevel = LogLevel.Info,
  ) {}

  setLevel(level: LogLevel): void {
    this.level = level;
  }

  info(message: string, ...args: unknown[]): void {
    if (this.level >= LogLevel.Info) {
      this.log.info(message, ...args);
    }
  }

  warn(message: string, ...args: unknown[]): void {
    this.log.warn(message, ...args);
  }

  error(message: string, ...args: unknown[]): void {
    this.log.error(message, ...args);
  }

  /** Level 2: lifecycle and state-change detail. */
  debug(message: string, ...args: unknown[]): void {
    if (this.level >= LogLevel.Debug) {
      this.log.info(`[debug] ${message}`, ...args);
    }
  }

  /** Level 3: raw HTTP traces. Useful for the reverse-engineered cloud client. */
  vdebug(message: string, ...args: unknown[]): void {
    if (this.level >= LogLevel.Verbose) {
      this.log.info(`[vdebug] ${message}`, ...args);
    }
  }
}
