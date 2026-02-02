// OpenClaw Gateway Protocol Types
// Based on analysis of the real OpenClaw protocol

import { v4 as uuidv4 } from "uuid";
import { config } from "../config.js";

// Protocol version
export const PROTOCOL_VERSION = 1;

// Frame Types
export interface RequestFrame {
  type: "req";
  id: string;
  method: string;
  params?: unknown;
}

export interface ResponseFrame {
  type: "res";
  id: string;
  ok: boolean;
  payload?: unknown;
  error?: ErrorShape;
}

export interface EventFrame {
  type: "event";
  event: string;
  payload?: unknown;
  seq?: number;
}

export interface ErrorShape {
  code: string;
  message: string;
  details?: unknown;
  retryable?: boolean;
  retryAfterMs?: number;
}

export type GatewayFrame = RequestFrame | ResponseFrame | EventFrame;

// Connect handshake
export interface ConnectParams {
  minProtocol: number;
  maxProtocol: number;
  client: {
    id: string;
    displayName?: string;
    version: string;
    platform: string;
    deviceFamily?: string;
    modelIdentifier?: string;
    mode: string;
    instanceId?: string;
  };
  caps?: string[];
  commands?: string[];
  permissions?: Record<string, boolean>;
  pathEnv?: string;
  role?: string;
  scopes?: string[];
  device?: {
    id: string;
    publicKey: string;
    signature: string;
    signedAt: number;
    nonce?: string;
  };
  auth?: {
    token?: string;
    password?: string;
  };
  locale?: string;
  userAgent?: string;
}

export interface HelloOk {
  type: "hello-ok";
  protocol: number;
  server: {
    version: string;
    commit?: string;
    host?: string;
    connId: string;
  };
  features: {
    methods: string[];
    events: string[];
  };
  snapshot: Snapshot;
  canvasHostUrl?: string;
  auth?: {
    deviceToken: string;
    role: string;
    scopes: string[];
    issuedAtMs?: number;
  };
  policy: {
    maxPayload: number;
    maxBufferedBytes: number;
    tickIntervalMs: number;
  };
}

export interface Snapshot {
  presence: PresenceEntry[];
  channels: Record<string, unknown>;
}

export interface PresenceEntry {
  connId: string;
  clientId: string;
  displayName?: string;
  version: string;
  platform: string;
  mode: string;
}

// Gateway Methods
export const GATEWAY_METHODS = [
  "health",
  "status",
  "logs.tail",
  "channels.status",
  "channels.logout",
  "usage.status",
  "usage.cost",
  "tts.status",
  "tts.providers",
  "config.get",
  "config.set",
  "config.apply",
  "config.patch",
  "config.schema",
  "exec.approvals.get",
  "exec.approvals.set",
  "wizard.start",
  "wizard.next",
  "wizard.cancel",
  "wizard.status",
  "talk.mode",
  "models.list",
  "agents.list",
  "skills.status",
  "skills.bins",
  "skills.install",
  "skills.update",
  "update.run",
  "voicewake.get",
  "voicewake.set",
  "sessions.list",
  "sessions.preview",
  "sessions.patch",
  "sessions.reset",
  "sessions.delete",
  "sessions.compact",
  "last-heartbeat",
  "set-heartbeats",
  "wake",
  "node.pair.request",
  "node.pair.list",
  "node.pair.approve",
  "node.pair.reject",
  "node.pair.verify",
  "device.pair.list",
  "device.pair.approve",
  "device.pair.reject",
  "device.token.rotate",
  "device.token.revoke",
  "node.rename",
  "node.list",
  "node.describe",
  "node.invoke",
  "node.invoke.result",
  "node.event",
  "cron.list",
  "cron.status",
  "cron.add",
  "cron.update",
  "cron.remove",
  "cron.run",
  "cron.runs",
  "system-presence",
  "system-event",
  "send",
  "agent",
  "agent.identity.get",
  "agent.wait",
  "browser.request",
  "chat.history",
  "chat.abort",
  "chat.send",
];

export const GATEWAY_EVENTS = [
  "connect.challenge",
  "agent",
  "chat",
  "presence",
  "tick",
  "talk.mode",
  "shutdown",
  "health",
  "heartbeat",
  "cron",
  "node.pair.requested",
  "node.pair.resolved",
  "node.invoke.request",
  "device.pair.requested",
  "device.pair.resolved",
  "voicewake.changed",
  "exec.approval.requested",
  "exec.approval.resolved",
];

// Generate fake Hello-OK response
export function generateHelloOk(connId: string): HelloOk {
  return {
    type: "hello-ok",
    protocol: PROTOCOL_VERSION,
    server: {
      version: config.fakeVersion,
      commit: "abc123def",
      host: "openclaw-gateway",
      connId,
    },
    features: {
      methods: GATEWAY_METHODS,
      events: GATEWAY_EVENTS,
    },
    snapshot: {
      presence: [],
      channels: {},
    },
    policy: {
      maxPayload: 512 * 1024, // 512KB
      maxBufferedBytes: 1.5 * 1024 * 1024, // 1.5MB
      tickIntervalMs: 30000, // 30 seconds
    },
  };
}

// Generate tick event
export function generateTickEvent(seq: number): EventFrame {
  return {
    type: "event",
    event: "tick",
    payload: {
      ts: Date.now(),
    },
    seq,
  };
}

// Generate presence event
export function generatePresenceEvent(
  presence: PresenceEntry[],
  seq: number
): EventFrame {
  return {
    type: "event",
    event: "presence",
    payload: { presence },
    seq,
  };
}

// Error codes
export const ErrorCodes = {
  INVALID_REQUEST: "invalid_request",
  UNAUTHORIZED: "unauthorized",
  NOT_FOUND: "not_found",
  METHOD_NOT_FOUND: "method_not_found",
  INTERNAL_ERROR: "internal_error",
  RATE_LIMITED: "rate_limited",
} as const;

export function createErrorResponse(
  id: string,
  code: string,
  message: string
): ResponseFrame {
  return {
    type: "res",
    id,
    ok: false,
    error: {
      code,
      message,
    },
  };
}

export function createSuccessResponse(
  id: string,
  payload?: unknown
): ResponseFrame {
  return {
    type: "res",
    id,
    ok: true,
    payload,
  };
}

// Parse and validate frames
export function parseFrame(data: string): GatewayFrame | null {
  try {
    const parsed = JSON.parse(data);
    if (typeof parsed !== "object" || parsed === null) return null;
    if (!("type" in parsed)) return null;
    return parsed as GatewayFrame;
  } catch {
    return null;
  }
}

export function isRequestFrame(frame: GatewayFrame): frame is RequestFrame {
  return frame.type === "req";
}

export function isResponseFrame(frame: GatewayFrame): frame is ResponseFrame {
  return frame.type === "res";
}

export function isEventFrame(frame: GatewayFrame): frame is EventFrame {
  return frame.type === "event";
}
