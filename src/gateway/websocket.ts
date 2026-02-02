// WebSocket Handler for OpenClaw Gateway Protocol

import { WebSocket, WebSocketServer } from "ws";
import { v4 as uuidv4 } from "uuid";
import type { IncomingMessage } from "http";
import { config } from "../config.js";
import { logger } from "../logging/logger.js";
import {
  type ConnectParams,
  type RequestFrame,
  type EventFrame,
  generateHelloOk,
  generateTickEvent,
  parseFrame,
  isRequestFrame,
  createErrorResponse,
  ErrorCodes,
  PROTOCOL_VERSION,
} from "./protocol.js";
import { handleRequest, type HandlerContext } from "./handlers.js";
import {
  logWebSocketMessage,
  logAuthAttempt,
  createConnection,
  closeConnection,
  updateAttackerSession,
} from "../database/queries.js";
import { analyzePayload } from "../logging/analyzer.js";

interface ClientState {
  connId: string;
  dbConnectionId: string;
  ipAddress: string;
  authenticated: boolean;
  clientInfo?: ConnectParams["client"];
  auth?: ConnectParams["auth"];
  seq: number;
  tickInterval?: ReturnType<typeof setInterval>;
}

const clients = new Map<WebSocket, ClientState>();

export function setupWebSocket(wss: WebSocketServer): void {
  wss.on("connection", (ws, req) => {
    handleConnection(ws, req);
  });

  wss.on("error", (error) => {
    logger.error("WebSocket server error:", error);
  });
}

async function handleConnection(
  ws: WebSocket,
  req: IncomingMessage
): Promise<void> {
  const connId = uuidv4();
  const ipAddress = getClientIp(req);
  const userAgent = req.headers["user-agent"];

  logger.info(`New WebSocket connection from ${ipAddress}`, { connId });

  // Create database connection record
  let dbConnectionId: string;
  try {
    const conn = await createConnection({
      ipAddress,
      userAgent,
      connectionType: "websocket",
    });
    dbConnectionId = conn.id;
  } catch (error) {
    logger.error("Failed to create connection record:", error);
    dbConnectionId = connId; // fallback
  }

  // Initialize client state (not authenticated yet)
  const state: ClientState = {
    connId,
    dbConnectionId,
    ipAddress,
    authenticated: false,
    seq: 0,
  };
  clients.set(ws, state);

  // Update attacker session
  await updateAttackerSession(ipAddress, { incrementWsMessages: true });

  // Set up message handler
  ws.on("message", async (data) => {
    try {
      await handleMessage(ws, state, data.toString());
    } catch (error) {
      logger.error("Error handling WebSocket message:", error);
    }
  });

  // Set up close handler
  ws.on("close", async () => {
    logger.info(`WebSocket closed: ${connId}`);
    if (state.tickInterval) {
      clearInterval(state.tickInterval);
    }
    clients.delete(ws);
    try {
      await closeConnection(dbConnectionId);
    } catch (error) {
      logger.error("Failed to close connection record:", error);
    }
  });

  // Set up error handler
  ws.on("error", (error) => {
    logger.error(`WebSocket error for ${connId}:`, error);
  });
}

async function handleMessage(
  ws: WebSocket,
  state: ClientState,
  raw: string
): Promise<void> {
  logger.debug(`Received message from ${state.connId}:`, raw.slice(0, 500));

  // Analyze payload for suspicious content
  const analysis = analyzePayload(raw);
  if (analysis.isSuspicious) {
    logger.warn(`Suspicious WebSocket message from ${state.ipAddress}:`, {
      reasons: analysis.reasons,
    });
  }

  // Try to parse as JSON
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    logger.warn(`Invalid JSON from ${state.connId}`);
    // Still log the raw message
    await logWebSocketMessage({
      connectionId: state.dbConnectionId,
      direction: "inbound",
      frameType: "invalid",
      payload: { raw: raw.slice(0, 10000) },
      raw: raw.slice(0, 10000),
      isSuspicious: analysis.isSuspicious,
      suspiciousReasons: analysis.reasons,
    });
    return;
  }

  // Check if this is the initial connect handshake
  if (!state.authenticated) {
    await handleConnect(ws, state, parsed, raw, analysis);
    return;
  }

  // Parse as a frame
  const frame = parseFrame(raw);
  if (!frame) {
    logger.warn(`Invalid frame from ${state.connId}`);
    await logWebSocketMessage({
      connectionId: state.dbConnectionId,
      direction: "inbound",
      frameType: "invalid",
      payload: parsed,
      raw: raw.slice(0, 10000),
      isSuspicious: analysis.isSuspicious,
      suspiciousReasons: analysis.reasons,
    });
    return;
  }

  // Handle request frames
  if (isRequestFrame(frame)) {
    await handleRequestFrame(ws, state, frame, raw, analysis);
  } else {
    // Log other frames
    await logWebSocketMessage({
      connectionId: state.dbConnectionId,
      direction: "inbound",
      frameType: frame.type,
      payload: frame,
      raw: raw.slice(0, 10000),
      isSuspicious: analysis.isSuspicious,
      suspiciousReasons: analysis.reasons,
    });
  }
}

async function handleConnect(
  ws: WebSocket,
  state: ClientState,
  parsed: unknown,
  raw: string,
  analysis: { isSuspicious: boolean; reasons: string[] }
): Promise<void> {
  // Validate connect params structure
  const connectParams = parsed as ConnectParams;

  // Log the connect attempt
  await logWebSocketMessage({
    connectionId: state.dbConnectionId,
    direction: "inbound",
    frameType: "connect",
    payload: connectParams,
    raw: raw.slice(0, 10000),
    isSuspicious: analysis.isSuspicious,
    suspiciousReasons: analysis.reasons,
  });

  // Extract client info
  state.clientInfo = connectParams.client;
  state.auth = connectParams.auth;

  // Log authentication attempt
  const authMethod = connectParams.auth?.password
    ? "password"
    : connectParams.auth?.token
      ? "token"
      : "none";
  const credential = connectParams.auth?.password || connectParams.auth?.token || "";

  await logAuthAttempt({
    connectionId: state.dbConnectionId,
    ipAddress: state.ipAddress,
    method: authMethod as "token" | "password" | "device" | "tailscale",
    credential: hashCredential(credential),
    credentialRaw: credential.slice(0, 100), // Store first 100 chars for research
    success: true, // Honeypot always "accepts"
    clientId: connectParams.client?.id,
    clientVersion: connectParams.client?.version,
    platform: connectParams.client?.platform,
  });

  // Update attacker session
  await updateAttackerSession(state.ipAddress, { incrementAuthAttempts: true });

  // Validate protocol version (but accept anyway for honeypot)
  const minProto = connectParams.minProtocol ?? 1;
  const maxProto = connectParams.maxProtocol ?? 1;
  if (PROTOCOL_VERSION < minProto || PROTOCOL_VERSION > maxProto) {
    logger.warn(`Protocol mismatch from ${state.connId}: ${minProto}-${maxProto}`);
  }

  // Mark as authenticated (honeypot accepts all)
  state.authenticated = true;

  // Generate and send hello-ok response
  const helloOk = generateHelloOk(state.connId);

  // Add auth info if device was provided
  if (connectParams.device) {
    helloOk.auth = {
      deviceToken: uuidv4(),
      role: "admin",
      scopes: ["*"],
      issuedAtMs: Date.now(),
    };
  }

  const response = JSON.stringify(helloOk);
  ws.send(response);

  // Log outbound
  await logWebSocketMessage({
    connectionId: state.dbConnectionId,
    direction: "outbound",
    frameType: "hello-ok",
    payload: helloOk,
    raw: response,
  });

  logger.info(`Client authenticated: ${state.connId}`, {
    clientId: state.clientInfo?.id,
    platform: state.clientInfo?.platform,
    version: state.clientInfo?.version,
  });

  // Start tick interval
  state.tickInterval = setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) {
      const tick = generateTickEvent(state.seq++);
      ws.send(JSON.stringify(tick));
    }
  }, 30000); // 30 seconds
}

async function handleRequestFrame(
  ws: WebSocket,
  state: ClientState,
  frame: RequestFrame,
  raw: string,
  analysis: { isSuspicious: boolean; reasons: string[] }
): Promise<void> {
  // Log inbound request
  await logWebSocketMessage({
    connectionId: state.dbConnectionId,
    direction: "inbound",
    frameType: "req",
    method: frame.method,
    requestId: frame.id,
    payload: frame,
    raw: raw.slice(0, 10000),
    isSuspicious: analysis.isSuspicious,
    suspiciousReasons: analysis.reasons,
  });

  // Handle the request
  const context: HandlerContext = {
    connId: state.connId,
    clientId: state.clientInfo?.id,
    ipAddress: state.ipAddress,
  };

  const response = await handleRequest(frame, context);
  const responseJson = JSON.stringify(response);

  // Send response
  ws.send(responseJson);

  // Log outbound response
  await logWebSocketMessage({
    connectionId: state.dbConnectionId,
    direction: "outbound",
    frameType: "res",
    method: frame.method,
    requestId: frame.id,
    payload: response,
    raw: responseJson,
  });

  logger.debug(`Handled ${frame.method} for ${state.connId}`, {
    requestId: frame.id,
    ok: response.ok,
  });
}

function getClientIp(req: IncomingMessage): string {
  // Check X-Forwarded-For header (for reverse proxies)
  const forwarded = req.headers["x-forwarded-for"];
  if (forwarded) {
    const ips = Array.isArray(forwarded) ? forwarded[0] : forwarded;
    return ips.split(",")[0].trim();
  }

  // Check X-Real-IP header
  const realIp = req.headers["x-real-ip"];
  if (realIp) {
    return Array.isArray(realIp) ? realIp[0] : realIp;
  }

  // Fallback to socket address
  return req.socket?.remoteAddress ?? "unknown";
}

function hashCredential(credential: string): string {
  // Simple hash for storage (not cryptographically secure, just for dedup)
  if (!credential) return "";
  let hash = 0;
  for (let i = 0; i < credential.length; i++) {
    const char = credential.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return `hash_${Math.abs(hash).toString(16)}`;
}

// Broadcast event to all connected clients
export function broadcastEvent(event: EventFrame): void {
  const json = JSON.stringify(event);
  for (const [ws, state] of clients) {
    if (ws.readyState === WebSocket.OPEN && state.authenticated) {
      ws.send(json);
    }
  }
}

// Get connected client count
export function getConnectedClientCount(): number {
  return clients.size;
}
