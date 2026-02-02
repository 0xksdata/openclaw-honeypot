// Main Gateway Server
// HTTP server with WebSocket upgrade support

import express, { type Request, type Response, type NextFunction } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer } from "ws";
import path from "path";
import { fileURLToPath } from "url";
import { v4 as uuidv4 } from "uuid";
import { config } from "../config.js";
import { logger, trafficLogger } from "../logging/logger.js";
import { setupWebSocket, getConnectedClientCount } from "./websocket.js";
import {
  createConnection,
  logRequest,
  updateAttackerSession,
} from "../database/queries.js";
import { analyzeAndLogSuspicious } from "../logging/analyzer.js";
import { setupChannelRoutes } from "../channels/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(__dirname, "../../web");

export async function createGatewayServer(): Promise<Server> {
  const app = express();

  // Trust proxy for X-Forwarded-For
  app.set("trust proxy", true);

  // Raw body parser for logging
  app.use(express.raw({ type: "*/*", limit: "10mb" }));

  // Request logging middleware
  app.use(async (req: Request, res: Response, next: NextFunction) => {
    const startTime = Date.now();
    const requestId = uuidv4();
    const ipAddress = getClientIp(req);
    const body = req.body instanceof Buffer ? req.body.toString() : "";

    // Create connection record for HTTP
    let connectionId: string;
    try {
      const conn = await createConnection({
        ipAddress,
        userAgent: req.headers["user-agent"],
        connectionType: "http",
      });
      connectionId = conn.id;
    } catch {
      connectionId = requestId;
    }

    // Attach to request for later use
    (req as RequestWithContext).connectionId = connectionId;
    (req as RequestWithContext).startTime = startTime;

    // Update attacker session
    await updateAttackerSession(ipAddress, { incrementRequests: true });

    // Analyze request for suspicious content
    const payloadToAnalyze = `${req.path} ${JSON.stringify(req.query)} ${body}`;
    await analyzeAndLogSuspicious({
      payload: payloadToAnalyze,
      ipAddress,
      userAgent: req.headers["user-agent"],
      requestPath: req.path,
      requestMethod: req.method,
      connectionId,
    });

    // Log traffic
    trafficLogger.info("HTTP Request", {
      requestId,
      method: req.method,
      path: req.path,
      query: req.query,
      headers: req.headers,
      body: body.slice(0, 5000),
      ip: ipAddress,
    });

    // Capture response
    const originalSend = res.send.bind(res);
    let responseBody: string = "";
    res.send = function (body: unknown): Response {
      responseBody =
        typeof body === "string"
          ? body
          : body instanceof Buffer
            ? body.toString()
            : JSON.stringify(body);
      return originalSend(body);
    };

    res.on("finish", async () => {
      const processingMs = Date.now() - startTime;

      // Log to database
      try {
        await logRequest({
          connectionId,
          method: req.method,
          path: req.path,
          queryString: Object.keys(req.query).length
            ? JSON.stringify(req.query)
            : undefined,
          headers: req.headers as Record<string, string | string[] | undefined>,
          body: body.slice(0, 10000),
          bodySize: body.length,
          responseCode: res.statusCode,
          responseBody: responseBody.slice(0, 5000),
          processingMs,
        });
      } catch (error) {
        logger.error("Failed to log request:", error);
      }

      // Log traffic response
      trafficLogger.info("HTTP Response", {
        requestId,
        statusCode: res.statusCode,
        processingMs,
        responseSize: responseBody.length,
      });
    });

    next();
  });

  // Health endpoint
  app.get("/health", (_req: Request, res: Response) => {
    res.json({
      ok: true,
      version: config.fakeVersion,
      uptime: Math.floor(process.uptime()),
      connections: getConnectedClientCount(),
    });
  });

  // API status endpoint
  app.get("/api/status", (_req: Request, res: Response) => {
    res.json({
      gateway: {
        version: config.fakeVersion,
        uptime: Math.floor(process.uptime()),
        connections: getConnectedClientCount(),
      },
      channels: {
        whatsapp: { status: "connected" },
        telegram: { status: "connected" },
        discord: { status: "disconnected" },
        slack: { status: "connected" },
      },
    });
  });

  // Setup channel webhook routes
  setupChannelRoutes(app);

  // Serve static files for Control UI
  app.use("/assets", express.static(path.join(webRoot, "assets")));
  app.use("/styles", express.static(path.join(webRoot, "styles")));
  app.use("/js", express.static(path.join(webRoot, "js")));

  // Favicon
  app.get("/favicon.ico", (_req: Request, res: Response) => {
    res.status(204).end();
  });

  app.get("/favicon.svg", (_req: Request, res: Response) => {
    res.type("image/svg+xml").send(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
        <text y=".9em" font-size="90">🦞</text>
      </svg>
    `);
  });

  // Control UI routes
  app.get("/", serveControlUi);
  app.get("/ui", serveControlUi);
  app.get("/ui/*", serveControlUi);
  app.get("/control", serveControlUi);
  app.get("/chat", serveControlUi);

  // Catch-all for SPA routing (serve index.html)
  app.get("*", (req: Request, res: Response) => {
    // Don't serve HTML for obvious API routes
    if (
      req.path.startsWith("/api/") ||
      req.path.startsWith("/webhook/") ||
      req.path.startsWith("/bot")
    ) {
      res.status(404).json({ error: "Not Found" });
      return;
    }
    serveControlUi(req, res);
  });

  // Create HTTP server
  const server = createServer(app);

  // Create WebSocket server
  const wss = new WebSocketServer({
    server,
    path: undefined, // Accept WebSocket on any path
  });

  // Setup WebSocket handlers
  setupWebSocket(wss);

  return server;
}

function serveControlUi(_req: Request, res: Response): void {
  const indexPath = path.join(webRoot, "index.html");
  res.sendFile(indexPath, (err) => {
    if (err) {
      // If file doesn't exist, send a basic response
      res.type("html").send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>OpenClaw Control</title>
          <style>
            body {
              font-family: system-ui, sans-serif;
              background: #1a1a1a;
              color: #fff;
              display: flex;
              justify-content: center;
              align-items: center;
              min-height: 100vh;
              margin: 0;
            }
            .container {
              text-align: center;
              padding: 2rem;
            }
            h1 {
              font-size: 4rem;
              margin-bottom: 0;
            }
            p {
              color: #e74c3c;
              font-size: 1.2rem;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>🦞</h1>
            <h2>OpenClaw Control</h2>
            <p>EXFOLIATE! EXFOLIATE!</p>
            <p style="color: #888; margin-top: 2rem;">Gateway v${config.fakeVersion}</p>
          </div>
        </body>
        </html>
      `);
    }
  });
}

function getClientIp(req: Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (forwarded) {
    const ips = Array.isArray(forwarded) ? forwarded[0] : forwarded;
    return ips.split(",")[0].trim();
  }
  const realIp = req.headers["x-real-ip"];
  if (realIp) {
    return Array.isArray(realIp) ? realIp[0] : realIp;
  }
  return req.ip ?? req.socket?.remoteAddress ?? "unknown";
}

interface RequestWithContext extends Request {
  connectionId?: string;
  startTime?: number;
}
