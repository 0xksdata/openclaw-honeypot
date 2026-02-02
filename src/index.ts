// OpenClaw Honeypot - Main Entry Point
// For security research purposes only

import { config } from "./config.js";
import { logger, logStartup } from "./logging/logger.js";
import { connectDatabase, disconnectDatabase } from "./database/client.js";
import { createGatewayServer } from "./gateway/server.js";

async function main(): Promise<void> {
  // Log startup banner
  console.log(`
  ╔═══════════════════════════════════════════════════════════════╗
  ║                                                               ║
  ║                    🦞 OPENCLAW HONEYPOT 🦞                    ║
  ║                                                               ║
  ║                     EXFOLIATE! EXFOLIATE!                     ║
  ║                                                               ║
  ║     For authorized security research purposes only.           ║
  ║     All traffic is logged for analysis.                       ║
  ║                                                               ║
  ╚═══════════════════════════════════════════════════════════════╝
  `);

  logStartup();

  // Connect to database
  try {
    await connectDatabase();
    logger.info("Database connected");
  } catch (error) {
    logger.error("Failed to connect to database:", error);
    logger.info("Run 'npx prisma db push' to initialize the database");
    process.exit(1);
  }

  // Create and start the gateway server
  const server = await createGatewayServer();

  server.listen(config.port, config.bindAddress, () => {
    logger.info(
      `🦞 OpenClaw Honeypot listening on ${config.bindAddress}:${config.port}`
    );
    logger.info(`   Fake version: ${config.fakeVersion}`);
    logger.info(`   Control UI: http://localhost:${config.port}/`);
    logger.info(`   WebSocket: ws://localhost:${config.port}/`);
    logger.info(`   Health: http://localhost:${config.port}/health`);
    logger.info("");
    logger.info("📡 Waiting for connections...");
  });

  // Graceful shutdown
  const shutdown = async (signal: string): Promise<void> => {
    logger.info(`Received ${signal}, shutting down gracefully...`);

    server.close(async () => {
      logger.info("HTTP server closed");
      await disconnectDatabase();
      logger.info("Database disconnected");
      process.exit(0);
    });

    // Force exit after 10 seconds
    setTimeout(() => {
      logger.warn("Forced shutdown after timeout");
      process.exit(1);
    }, 10000);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  // Handle uncaught errors
  process.on("uncaughtException", (error) => {
    logger.error("Uncaught exception:", error);
    process.exit(1);
  });

  process.on("unhandledRejection", (reason) => {
    logger.error("Unhandled rejection:", reason);
  });
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
