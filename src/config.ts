import dotenv from "dotenv";

dotenv.config();

export interface HoneypotConfig {
  port: number;
  bindAddress: string;
  databaseUrl: string;
  logLevel: "debug" | "info" | "warn" | "error";
  logToFile: boolean;
  logPath: string;
  fakeVersion: string;
  fakeGatewayToken: string;
  alertWebhookUrl?: string;
  geoipDatabasePath?: string;
}

function getEnvString(key: string, defaultValue: string): string {
  return process.env[key] ?? defaultValue;
}

function getEnvNumber(key: string, defaultValue: number): number {
  const value = process.env[key];
  if (value === undefined) return defaultValue;
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

function getEnvBoolean(key: string, defaultValue: boolean): boolean {
  const value = process.env[key];
  if (value === undefined) return defaultValue;
  return value.toLowerCase() === "true" || value === "1";
}

export function loadConfig(): HoneypotConfig {
  return {
    port: getEnvNumber("PORT", 18789),
    bindAddress: getEnvString("BIND_ADDRESS", "0.0.0.0"),
    databaseUrl: getEnvString("DATABASE_URL", "file:./honeypot.db"),
    logLevel: getEnvString("LOG_LEVEL", "info") as HoneypotConfig["logLevel"],
    logToFile: getEnvBoolean("LOG_TO_FILE", true),
    logPath: getEnvString("LOG_PATH", "./logs"),
    fakeVersion: getEnvString("FAKE_VERSION", "2026.2.1"),
    fakeGatewayToken: getEnvString(
      "FAKE_GATEWAY_TOKEN",
      "honeypot-token-change-me"
    ),
    alertWebhookUrl: process.env.ALERT_WEBHOOK_URL,
    geoipDatabasePath: process.env.GEOIP_DATABASE_PATH,
  };
}

export const config = loadConfig();
