import { prisma } from "./client.js";

// Connection operations
export async function createConnection(data: {
  ipAddress: string;
  userAgent?: string;
  fingerprint?: string;
  country?: string;
  city?: string;
  asn?: string;
  connectionType: "http" | "websocket";
}) {
  return prisma.connection.create({ data });
}

export async function closeConnection(id: string) {
  return prisma.connection.update({
    where: { id },
    data: { disconnectedAt: new Date() },
  });
}

// Request operations
export async function logRequest(data: {
  connectionId: string;
  method: string;
  path: string;
  queryString?: string;
  headers: Record<string, string | string[] | undefined>;
  body?: string;
  bodySize?: number;
  responseCode?: number;
  responseBody?: string;
  isSuspicious?: boolean;
  suspiciousReasons?: string[];
  processingMs?: number;
}) {
  return prisma.request.create({
    data: {
      connectionId: data.connectionId,
      method: data.method,
      path: data.path,
      queryString: data.queryString,
      headers: JSON.stringify(data.headers),
      body: data.body,
      bodySize: data.bodySize ?? 0,
      responseCode: data.responseCode,
      responseBody: data.responseBody,
      isSuspicious: data.isSuspicious ?? false,
      suspiciousReasons: data.suspiciousReasons
        ? JSON.stringify(data.suspiciousReasons)
        : null,
      processingMs: data.processingMs,
    },
  });
}

// WebSocket message operations
export async function logWebSocketMessage(data: {
  connectionId: string;
  direction: "inbound" | "outbound";
  frameType: string;
  method?: string;
  requestId?: string;
  payload: unknown;
  raw: string;
  isSuspicious?: boolean;
  suspiciousReasons?: string[];
}) {
  const payloadStr = JSON.stringify(data.payload);
  return prisma.webSocketMessage.create({
    data: {
      connectionId: data.connectionId,
      direction: data.direction,
      frameType: data.frameType,
      method: data.method,
      requestId: data.requestId,
      payload: payloadStr,
      raw: data.raw,
      payloadSize: payloadStr.length,
      isSuspicious: data.isSuspicious ?? false,
      suspiciousReasons: data.suspiciousReasons
        ? JSON.stringify(data.suspiciousReasons)
        : null,
    },
  });
}

// Auth attempt operations
export async function logAuthAttempt(data: {
  connectionId: string;
  ipAddress: string;
  method: "token" | "password" | "device" | "tailscale";
  credential: string;
  credentialRaw?: string;
  success: boolean;
  failureReason?: string;
  clientId?: string;
  clientVersion?: string;
  platform?: string;
}) {
  return prisma.authAttempt.create({ data });
}

// Channel interaction operations
export async function logChannelInteraction(data: {
  channel: string;
  endpoint: string;
  httpMethod: string;
  headers: Record<string, string | string[] | undefined>;
  payload: unknown;
  senderId?: string;
  messageText?: string;
  ipAddress: string;
  isSuspicious?: boolean;
  suspiciousReasons?: string[];
  responseCode?: number;
  responseBody?: string;
}) {
  const payloadStr = JSON.stringify(data.payload);
  return prisma.channelInteraction.create({
    data: {
      channel: data.channel,
      endpoint: data.endpoint,
      httpMethod: data.httpMethod,
      headers: JSON.stringify(data.headers),
      payload: payloadStr,
      payloadSize: payloadStr.length,
      senderId: data.senderId,
      messageText: data.messageText,
      ipAddress: data.ipAddress,
      isSuspicious: data.isSuspicious ?? false,
      suspiciousReasons: data.suspiciousReasons
        ? JSON.stringify(data.suspiciousReasons)
        : null,
      responseCode: data.responseCode,
      responseBody: data.responseBody,
    },
  });
}

// Suspicious activity operations
export async function logSuspiciousActivity(data: {
  type: string;
  severity: "low" | "medium" | "high" | "critical";
  description: string;
  payload?: string;
  pattern?: string;
  ipAddress: string;
  userAgent?: string;
  requestPath?: string;
  requestMethod?: string;
  connectionId?: string;
}) {
  return prisma.suspiciousActivity.create({ data });
}

// Attacker session tracking
export async function updateAttackerSession(
  ipAddress: string,
  updates: {
    incrementRequests?: boolean;
    incrementWsMessages?: boolean;
    incrementAuthAttempts?: boolean;
    incrementSuspicious?: boolean;
    isScanner?: boolean;
    isBruteforcer?: boolean;
    isExploiter?: boolean;
  }
) {
  const incrementData: Record<string, number> = {};
  if (updates.incrementRequests) incrementData.requestCount = 1;
  if (updates.incrementWsMessages) incrementData.wsMessageCount = 1;
  if (updates.incrementAuthAttempts) incrementData.authAttemptCount = 1;
  if (updates.incrementSuspicious) incrementData.suspiciousCount = 1;

  return prisma.attackerSession.upsert({
    where: { ipAddress },
    create: {
      ipAddress,
      requestCount: updates.incrementRequests ? 1 : 0,
      wsMessageCount: updates.incrementWsMessages ? 1 : 0,
      authAttemptCount: updates.incrementAuthAttempts ? 1 : 0,
      suspiciousCount: updates.incrementSuspicious ? 1 : 0,
      isScanner: updates.isScanner ?? false,
      isBruteforcer: updates.isBruteforcer ?? false,
      isExploiter: updates.isExploiter ?? false,
    },
    update: {
      lastSeen: new Date(),
      ...(Object.keys(incrementData).length > 0 && {
        requestCount: updates.incrementRequests
          ? { increment: 1 }
          : undefined,
        wsMessageCount: updates.incrementWsMessages
          ? { increment: 1 }
          : undefined,
        authAttemptCount: updates.incrementAuthAttempts
          ? { increment: 1 }
          : undefined,
        suspiciousCount: updates.incrementSuspicious
          ? { increment: 1 }
          : undefined,
      }),
      ...(updates.isScanner !== undefined && { isScanner: updates.isScanner }),
      ...(updates.isBruteforcer !== undefined && {
        isBruteforcer: updates.isBruteforcer,
      }),
      ...(updates.isExploiter !== undefined && {
        isExploiter: updates.isExploiter,
      }),
    },
  });
}

// Analytics queries
export async function getRecentConnections(limit = 100) {
  return prisma.connection.findMany({
    take: limit,
    orderBy: { connectedAt: "desc" },
    include: {
      _count: {
        select: {
          requests: true,
          wsMessages: true,
          authAttempts: true,
        },
      },
    },
  });
}

export async function getSuspiciousActivitySummary() {
  return prisma.suspiciousActivity.groupBy({
    by: ["type", "severity"],
    _count: true,
  });
}

export async function getTopAttackerIPs(limit = 10) {
  return prisma.attackerSession.findMany({
    take: limit,
    orderBy: { suspiciousCount: "desc" },
    where: {
      suspiciousCount: { gt: 0 },
    },
  });
}
