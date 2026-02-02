// Gateway Method Handlers
// Returns high-fidelity fake responses mimicking real OpenClaw

import { v4 as uuidv4 } from "uuid";
import { config } from "../config.js";
import {
  type RequestFrame,
  type ResponseFrame,
  createSuccessResponse,
  createErrorResponse,
  ErrorCodes,
} from "./protocol.js";

export type MethodHandler = (
  request: RequestFrame,
  context: HandlerContext
) => ResponseFrame | Promise<ResponseFrame>;

export interface HandlerContext {
  connId: string;
  clientId?: string;
  ipAddress: string;
}

// Registry of method handlers
const handlers: Map<string, MethodHandler> = new Map();

// Register a handler
export function registerHandler(method: string, handler: MethodHandler): void {
  handlers.set(method, handler);
}

// Handle a request
export async function handleRequest(
  request: RequestFrame,
  context: HandlerContext
): Promise<ResponseFrame> {
  const handler = handlers.get(request.method);
  if (!handler) {
    return createErrorResponse(
      request.id,
      ErrorCodes.METHOD_NOT_FOUND,
      `Method not found: ${request.method}`
    );
  }
  try {
    return await handler(request, context);
  } catch (error) {
    return createErrorResponse(
      request.id,
      ErrorCodes.INTERNAL_ERROR,
      "Internal server error"
    );
  }
}

// ============ HEALTH & STATUS ============

registerHandler("health", (req) => {
  return createSuccessResponse(req.id, {
    ok: true,
    version: config.fakeVersion,
    uptime: Math.floor(process.uptime()),
    memory: {
      heapUsed: process.memoryUsage().heapUsed,
      heapTotal: process.memoryUsage().heapTotal,
    },
  });
});

registerHandler("status", (req) => {
  return createSuccessResponse(req.id, {
    gateway: {
      version: config.fakeVersion,
      uptime: Math.floor(process.uptime()),
      connections: 1,
    },
    channels: {
      whatsapp: { connected: true },
      telegram: { connected: true },
      discord: { connected: false },
      slack: { connected: true },
      signal: { connected: false },
    },
  });
});

// ============ CHANNELS ============

registerHandler("channels.status", (req) => {
  return createSuccessResponse(req.id, {
    channels: [
      {
        id: "whatsapp",
        type: "whatsapp",
        status: "connected",
        account: {
          phone: "+1234567890",
          name: "OpenClaw Bot",
          pushName: "OpenClaw",
        },
        lastActivity: new Date().toISOString(),
      },
      {
        id: "telegram",
        type: "telegram",
        status: "connected",
        account: {
          botId: "7123456789",
          username: "openclaw_bot",
          firstName: "OpenClaw",
        },
        lastActivity: new Date().toISOString(),
      },
      {
        id: "discord",
        type: "discord",
        status: "disconnected",
        account: null,
      },
      {
        id: "slack",
        type: "slack",
        status: "connected",
        account: {
          teamId: "T0123456789",
          teamName: "OpenClaw Workspace",
          botId: "B0123456789",
        },
        lastActivity: new Date().toISOString(),
      },
      {
        id: "signal",
        type: "signal",
        status: "disconnected",
        account: null,
      },
      {
        id: "imessage",
        type: "imessage",
        status: "disconnected",
        account: null,
      },
    ],
  });
});

registerHandler("channels.logout", (req) => {
  return createSuccessResponse(req.id, { ok: true });
});

// ============ SESSIONS ============

registerHandler("sessions.list", (req) => {
  return createSuccessResponse(req.id, {
    sessions: [
      {
        key: "main",
        agentId: "main",
        createdAt: new Date(Date.now() - 86400000).toISOString(),
        lastActivityAt: new Date().toISOString(),
        messageCount: 42,
        tokenCount: 15000,
      },
      {
        key: "whatsapp:+1234567890",
        agentId: "main",
        createdAt: new Date(Date.now() - 3600000).toISOString(),
        lastActivityAt: new Date().toISOString(),
        messageCount: 12,
        tokenCount: 4500,
      },
    ],
  });
});

registerHandler("sessions.preview", (req) => {
  const params = req.params as { sessionKey?: string } | undefined;
  return createSuccessResponse(req.id, {
    sessionKey: params?.sessionKey || "main",
    messages: [
      {
        role: "user",
        content: "Hello, OpenClaw!",
        timestamp: new Date(Date.now() - 60000).toISOString(),
      },
      {
        role: "assistant",
        content: "Hello! I'm your personal AI assistant. How can I help you today?",
        timestamp: new Date(Date.now() - 55000).toISOString(),
      },
    ],
  });
});

registerHandler("sessions.reset", (req) => {
  return createSuccessResponse(req.id, { ok: true, cleared: true });
});

registerHandler("sessions.delete", (req) => {
  return createSuccessResponse(req.id, { ok: true, deleted: true });
});

registerHandler("sessions.compact", (req) => {
  return createSuccessResponse(req.id, { ok: true, compacted: true });
});

registerHandler("sessions.patch", (req) => {
  return createSuccessResponse(req.id, { ok: true });
});

// ============ AGENTS ============

registerHandler("agents.list", (req) => {
  return createSuccessResponse(req.id, {
    agents: [
      {
        id: "main",
        name: "OpenClaw",
        emoji: "🦞",
        description: "Your personal AI assistant",
        isDefault: true,
        model: "claude-opus-4-5-20251101",
        systemPrompt: "You are OpenClaw, a helpful personal AI assistant.",
        createdAt: new Date(Date.now() - 86400000 * 30).toISOString(),
      },
    ],
    defaultAgentId: "main",
  });
});

registerHandler("agent.identity.get", (req) => {
  const params = req.params as { agentId?: string } | undefined;
  return createSuccessResponse(req.id, {
    agentId: params?.agentId || "main",
    name: "OpenClaw",
    emoji: "🦞",
    avatar: "🦞",
    theme: "space lobster",
  });
});

// ============ MODELS ============

registerHandler("models.list", (req) => {
  return createSuccessResponse(req.id, {
    models: [
      {
        id: "claude-opus-4-5-20251101",
        provider: "anthropic",
        name: "Claude Opus 4.5",
        contextWindow: 200000,
        maxOutputTokens: 32000,
        supportsVision: true,
        supportsTools: true,
      },
      {
        id: "claude-sonnet-4-20250514",
        provider: "anthropic",
        name: "Claude Sonnet 4",
        contextWindow: 200000,
        maxOutputTokens: 16000,
        supportsVision: true,
        supportsTools: true,
      },
      {
        id: "gpt-4o",
        provider: "openai",
        name: "GPT-4o",
        contextWindow: 128000,
        maxOutputTokens: 16384,
        supportsVision: true,
        supportsTools: true,
      },
    ],
    defaultModelId: "claude-opus-4-5-20251101",
  });
});

// ============ CONFIG ============

registerHandler("config.get", (req) => {
  return createSuccessResponse(req.id, {
    config: {
      gateway: {
        port: 18789,
        auth: { mode: "token" },
        controlUi: { enabled: true },
      },
      agents: {
        main: {
          name: "OpenClaw",
          emoji: "🦞",
          model: "claude-opus-4-5-20251101",
        },
      },
      channels: {
        whatsapp: { enabled: true },
        telegram: { enabled: true },
        discord: { enabled: false },
        slack: { enabled: true },
      },
    },
  });
});

registerHandler("config.set", (req) => {
  return createSuccessResponse(req.id, { ok: true });
});

registerHandler("config.apply", (req) => {
  return createSuccessResponse(req.id, { ok: true, restarting: false });
});

registerHandler("config.patch", (req) => {
  return createSuccessResponse(req.id, { ok: true });
});

registerHandler("config.schema", (req) => {
  return createSuccessResponse(req.id, {
    schema: {
      type: "object",
      properties: {
        gateway: { type: "object" },
        agents: { type: "object" },
        channels: { type: "object" },
      },
    },
  });
});

// ============ CHAT ============

registerHandler("chat.history", (req) => {
  const params = req.params as { sessionKey?: string; limit?: number } | undefined;
  return createSuccessResponse(req.id, {
    sessionKey: params?.sessionKey || "main",
    messages: [
      {
        id: uuidv4(),
        role: "user",
        content: "What's the weather like?",
        timestamp: new Date(Date.now() - 120000).toISOString(),
      },
      {
        id: uuidv4(),
        role: "assistant",
        content: "I don't have real-time weather data, but I can help you find weather information for your location. What city are you interested in?",
        timestamp: new Date(Date.now() - 115000).toISOString(),
      },
    ],
    hasMore: false,
  });
});

registerHandler("chat.send", (req) => {
  const runId = uuidv4();
  return createSuccessResponse(req.id, {
    runId,
    status: "accepted",
    queuePosition: 0,
  });
});

registerHandler("chat.abort", (req) => {
  return createSuccessResponse(req.id, { ok: true, aborted: true });
});

// ============ NODES ============

registerHandler("node.list", (req) => {
  return createSuccessResponse(req.id, {
    nodes: [
      {
        id: "local",
        name: "Local Node",
        type: "local",
        status: "connected",
        capabilities: ["execute", "file-read", "file-write", "browser"],
        lastSeen: new Date().toISOString(),
      },
    ],
  });
});

registerHandler("node.describe", (req) => {
  return createSuccessResponse(req.id, {
    node: {
      id: "local",
      name: "Local Node",
      type: "local",
      status: "connected",
      capabilities: ["execute", "file-read", "file-write", "browser"],
      tools: [],
    },
  });
});

registerHandler("node.invoke", (req) => {
  const invokeId = uuidv4();
  return createSuccessResponse(req.id, {
    invokeId,
    status: "queued",
  });
});

registerHandler("node.invoke.result", (req) => {
  return createSuccessResponse(req.id, {
    result: null,
    status: "pending",
  });
});

registerHandler("node.event", (req) => {
  return createSuccessResponse(req.id, { ok: true });
});

registerHandler("node.pair.request", (req) => {
  return createSuccessResponse(req.id, {
    pairingCode: "ABC123",
    expiresAt: new Date(Date.now() + 300000).toISOString(),
  });
});

registerHandler("node.pair.list", (req) => {
  return createSuccessResponse(req.id, { requests: [] });
});

registerHandler("node.pair.approve", (req) => {
  return createSuccessResponse(req.id, { ok: true });
});

registerHandler("node.pair.reject", (req) => {
  return createSuccessResponse(req.id, { ok: true });
});

registerHandler("node.pair.verify", (req) => {
  return createSuccessResponse(req.id, { verified: true });
});

registerHandler("node.rename", (req) => {
  return createSuccessResponse(req.id, { ok: true });
});

// ============ CRON ============

registerHandler("cron.list", (req) => {
  return createSuccessResponse(req.id, {
    jobs: [
      {
        id: "daily-summary",
        name: "Daily Summary",
        schedule: "0 9 * * *",
        enabled: true,
        lastRun: new Date(Date.now() - 86400000).toISOString(),
        nextRun: new Date(Date.now() + 43200000).toISOString(),
      },
    ],
  });
});

registerHandler("cron.status", (req) => {
  return createSuccessResponse(req.id, {
    running: true,
    jobCount: 1,
    nextJob: {
      id: "daily-summary",
      runAt: new Date(Date.now() + 43200000).toISOString(),
    },
  });
});

registerHandler("cron.add", (req) => {
  return createSuccessResponse(req.id, { id: uuidv4(), ok: true });
});

registerHandler("cron.update", (req) => {
  return createSuccessResponse(req.id, { ok: true });
});

registerHandler("cron.remove", (req) => {
  return createSuccessResponse(req.id, { ok: true });
});

registerHandler("cron.run", (req) => {
  return createSuccessResponse(req.id, { runId: uuidv4(), status: "started" });
});

registerHandler("cron.runs", (req) => {
  return createSuccessResponse(req.id, { runs: [] });
});

// ============ SKILLS ============

registerHandler("skills.status", (req) => {
  return createSuccessResponse(req.id, {
    installed: ["web-search", "calculator", "code-interpreter"],
    available: ["image-gen", "voice-clone", "translation"],
  });
});

registerHandler("skills.bins", (req) => {
  return createSuccessResponse(req.id, {
    bins: [
      { name: "web-search", version: "1.0.0", path: "/skills/web-search" },
      { name: "calculator", version: "1.0.0", path: "/skills/calculator" },
    ],
  });
});

registerHandler("skills.install", (req) => {
  return createSuccessResponse(req.id, { ok: true, installed: true });
});

registerHandler("skills.update", (req) => {
  return createSuccessResponse(req.id, { ok: true, updated: true });
});

// ============ DEVICES ============

registerHandler("device.pair.list", (req) => {
  return createSuccessResponse(req.id, { devices: [] });
});

registerHandler("device.pair.approve", (req) => {
  return createSuccessResponse(req.id, { ok: true });
});

registerHandler("device.pair.reject", (req) => {
  return createSuccessResponse(req.id, { ok: true });
});

registerHandler("device.token.rotate", (req) => {
  return createSuccessResponse(req.id, {
    token: uuidv4(),
    expiresAt: new Date(Date.now() + 86400000 * 30).toISOString(),
  });
});

registerHandler("device.token.revoke", (req) => {
  return createSuccessResponse(req.id, { ok: true });
});

// ============ MISC ============

registerHandler("logs.tail", (req) => {
  return createSuccessResponse(req.id, {
    logs: [
      {
        level: "info",
        message: "Gateway started",
        timestamp: new Date(Date.now() - 3600000).toISOString(),
      },
      {
        level: "info",
        message: "WhatsApp channel connected",
        timestamp: new Date(Date.now() - 3500000).toISOString(),
      },
    ],
  });
});

registerHandler("usage.status", (req) => {
  return createSuccessResponse(req.id, {
    tokens: {
      input: 150000,
      output: 45000,
      total: 195000,
    },
    cost: {
      usd: 12.5,
      period: "month",
    },
  });
});

registerHandler("usage.cost", (req) => {
  return createSuccessResponse(req.id, {
    cost: { usd: 12.5, period: "month" },
  });
});

registerHandler("tts.status", (req) => {
  return createSuccessResponse(req.id, {
    enabled: false,
    provider: null,
  });
});

registerHandler("tts.providers", (req) => {
  return createSuccessResponse(req.id, {
    providers: ["edge-tts", "openai-tts", "elevenlabs"],
  });
});

registerHandler("wizard.start", (req) => {
  return createSuccessResponse(req.id, {
    sessionId: uuidv4(),
    step: { type: "welcome", title: "Welcome to OpenClaw Setup" },
  });
});

registerHandler("wizard.next", (req) => {
  return createSuccessResponse(req.id, {
    step: { type: "complete", title: "Setup Complete" },
    done: true,
  });
});

registerHandler("wizard.cancel", (req) => {
  return createSuccessResponse(req.id, { ok: true });
});

registerHandler("wizard.status", (req) => {
  return createSuccessResponse(req.id, { active: false });
});

registerHandler("talk.mode", (req) => {
  return createSuccessResponse(req.id, { mode: "text", voiceEnabled: false });
});

registerHandler("voicewake.get", (req) => {
  return createSuccessResponse(req.id, { triggers: ["hey openclaw", "ok claw"] });
});

registerHandler("voicewake.set", (req) => {
  return createSuccessResponse(req.id, { ok: true });
});

registerHandler("last-heartbeat", (req) => {
  return createSuccessResponse(req.id, {
    timestamp: new Date().toISOString(),
    healthy: true,
  });
});

registerHandler("set-heartbeats", (req) => {
  return createSuccessResponse(req.id, { ok: true });
});

registerHandler("wake", (req) => {
  return createSuccessResponse(req.id, { ok: true, woken: true });
});

registerHandler("update.run", (req) => {
  return createSuccessResponse(req.id, {
    updateAvailable: false,
    currentVersion: config.fakeVersion,
  });
});

registerHandler("system-presence", (req) => {
  return createSuccessResponse(req.id, { presence: [] });
});

registerHandler("system-event", (req) => {
  return createSuccessResponse(req.id, { ok: true });
});

registerHandler("send", (req) => {
  return createSuccessResponse(req.id, { sent: true, messageId: uuidv4() });
});

registerHandler("agent", (req) => {
  return createSuccessResponse(req.id, { runId: uuidv4(), status: "started" });
});

registerHandler("agent.wait", (req) => {
  return createSuccessResponse(req.id, { completed: true, result: null });
});

registerHandler("browser.request", (req) => {
  return createSuccessResponse(req.id, { requestId: uuidv4(), status: "queued" });
});

registerHandler("exec.approvals.get", (req) => {
  return createSuccessResponse(req.id, { approvals: {} });
});

registerHandler("exec.approvals.set", (req) => {
  return createSuccessResponse(req.id, { ok: true });
});
