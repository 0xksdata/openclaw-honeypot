import winston from "winston";
import path from "path";
import fs from "fs";
import { config } from "../config.js";

// Ensure log directory exists
if (config.logToFile) {
  if (!fs.existsSync(config.logPath)) {
    fs.mkdirSync(config.logPath, { recursive: true });
  }
}

// Custom format for console
const consoleFormat = winston.format.combine(
  winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
  winston.format.colorize(),
  winston.format.printf(({ level, message, timestamp, ...meta }) => {
    const metaStr = Object.keys(meta).length ? JSON.stringify(meta) : "";
    return `${timestamp} [${level}]: ${message} ${metaStr}`;
  })
);

// Custom format for files
const fileFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.json()
);

// Create transports
const transports: winston.transport[] = [
  new winston.transports.Console({
    format: consoleFormat,
  }),
];

if (config.logToFile) {
  // Main log file
  transports.push(
    new winston.transports.File({
      filename: path.join(config.logPath, "honeypot.log"),
      format: fileFormat,
      maxsize: 10 * 1024 * 1024, // 10MB
      maxFiles: 5,
    })
  );

  // Error log file
  transports.push(
    new winston.transports.File({
      filename: path.join(config.logPath, "error.log"),
      level: "error",
      format: fileFormat,
      maxsize: 10 * 1024 * 1024,
      maxFiles: 3,
    })
  );

  // Suspicious activity log
  transports.push(
    new winston.transports.File({
      filename: path.join(config.logPath, "suspicious.log"),
      level: "warn",
      format: fileFormat,
      maxsize: 10 * 1024 * 1024,
      maxFiles: 5,
    })
  );
}

export const logger = winston.createLogger({
  level: config.logLevel,
  transports,
});

// Traffic logger for detailed request/response logging
export const trafficLogger = winston.createLogger({
  level: "info",
  format: fileFormat,
  transports: config.logToFile
    ? [
        new winston.transports.File({
          filename: path.join(config.logPath, "traffic.log"),
          maxsize: 50 * 1024 * 1024, // 50MB
          maxFiles: 10,
        }),
      ]
    : [new winston.transports.Console({ format: consoleFormat })],
});

// Log startup info
export function logStartup(): void {
  logger.info("OpenClaw Honeypot starting", {
    version: "1.0.0",
    port: config.port,
    fakeVersion: config.fakeVersion,
    logLevel: config.logLevel,
  });
}
