// Channel Webhook Router
// Handles webhooks for WhatsApp, Telegram, Discord, Slack, Signal, etc.

import type { Express, Request, Response } from "express";
import { v4 as uuidv4 } from "uuid";
import { logger } from "../logging/logger.js";
import { logChannelInteraction, updateAttackerSession } from "../database/queries.js";
import { analyzeAndLogSuspicious } from "../logging/analyzer.js";

function getClientIp(req: Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (forwarded) {
    const ips = Array.isArray(forwarded) ? forwarded[0] : forwarded;
    return ips.split(",")[0].trim();
  }
  return req.ip ?? req.socket?.remoteAddress ?? "unknown";
}

function parseBody(req: Request): unknown {
  if (req.body instanceof Buffer) {
    try {
      return JSON.parse(req.body.toString());
    } catch {
      return { raw: req.body.toString() };
    }
  }
  return req.body;
}

async function handleChannelWebhook(
  req: Request,
  res: Response,
  channel: string
): Promise<void> {
  const ipAddress = getClientIp(req);
  const payload = parseBody(req);
  const bodyStr =
    req.body instanceof Buffer ? req.body.toString() : JSON.stringify(req.body);

  logger.info(`${channel} webhook received from ${ipAddress}`, {
    path: req.path,
    method: req.method,
  });

  // Analyze for suspicious content
  await analyzeAndLogSuspicious({
    payload: bodyStr,
    ipAddress,
    userAgent: req.headers["user-agent"],
    requestPath: req.path,
    requestMethod: req.method,
  });

  // Extract message info if possible
  let senderId: string | undefined;
  let messageText: string | undefined;

  try {
    const data = payload as Record<string, unknown>;

    // WhatsApp (Baileys style)
    if (channel === "whatsapp") {
      const message = data.message as Record<string, unknown> | undefined;
      senderId = (data.key as Record<string, unknown>)?.remoteJid as string;
      messageText =
        (message?.conversation as string) ||
        (message?.extendedTextMessage as Record<string, unknown>)?.text as string;
    }

    // Telegram
    if (channel === "telegram") {
      const message = data.message as Record<string, unknown> | undefined;
      const from = message?.from as Record<string, unknown> | undefined;
      senderId = from?.id?.toString();
      messageText = message?.text as string;
    }

    // Discord
    if (channel === "discord") {
      const user = data.user as Record<string, unknown> | undefined;
      senderId = user?.id as string;
      messageText = (data.data as Record<string, unknown>)?.content as string;
    }

    // Slack
    if (channel === "slack") {
      const event = data.event as Record<string, unknown> | undefined;
      senderId = event?.user as string;
      messageText = event?.text as string;
    }

    // Signal
    if (channel === "signal") {
      senderId = data.source as string;
      messageText = (data.dataMessage as Record<string, unknown>)?.message as string;
    }
  } catch {
    // Extraction failed, that's fine
  }

  // Log to database
  try {
    await logChannelInteraction({
      channel,
      endpoint: req.path,
      httpMethod: req.method,
      headers: req.headers as Record<string, string | string[] | undefined>,
      payload,
      senderId,
      messageText,
      ipAddress,
      responseCode: 200,
      responseBody: JSON.stringify({ ok: true }),
    });
  } catch (error) {
    logger.error(`Failed to log ${channel} interaction:`, error);
  }

  // Update attacker session
  await updateAttackerSession(ipAddress, { incrementRequests: true });
}

export function setupChannelRoutes(app: Express): void {
  // ============ WHATSAPP ============
  app.post("/webhook/whatsapp", async (req: Request, res: Response) => {
    await handleChannelWebhook(req, res, "whatsapp");
    res.json({ ok: true, received: true });
  });

  app.post("/webhook/whatsapp/send", async (req: Request, res: Response) => {
    await handleChannelWebhook(req, res, "whatsapp");
    res.json({
      ok: true,
      messageId: uuidv4(),
      status: "sent",
    });
  });

  // ============ TELEGRAM ============
  // Telegram Bot API style endpoints
  app.post("/bot:token/webhook", async (req: Request, res: Response) => {
    await handleChannelWebhook(req, res, "telegram");
    res.json({ ok: true });
  });

  app.post("/bot:token/setWebhook", async (req: Request, res: Response) => {
    await handleChannelWebhook(req, res, "telegram");
    res.json({
      ok: true,
      result: true,
      description: "Webhook is set",
    });
  });

  app.all("/bot:token/getMe", async (req: Request, res: Response) => {
    await handleChannelWebhook(req, res, "telegram");
    res.json({
      ok: true,
      result: {
        id: 7123456789,
        is_bot: true,
        first_name: "OpenClaw",
        username: "openclaw_bot",
        can_join_groups: true,
        can_read_all_group_messages: false,
        supports_inline_queries: false,
      },
    });
  });

  app.post("/bot:token/sendMessage", async (req: Request, res: Response) => {
    await handleChannelWebhook(req, res, "telegram");
    res.json({
      ok: true,
      result: {
        message_id: Math.floor(Math.random() * 1000000),
        from: {
          id: 7123456789,
          is_bot: true,
          first_name: "OpenClaw",
          username: "openclaw_bot",
        },
        chat: {
          id: 123456789,
          type: "private",
        },
        date: Math.floor(Date.now() / 1000),
        text: "Message sent",
      },
    });
  });

  app.all("/bot:token/*", async (req: Request, res: Response) => {
    await handleChannelWebhook(req, res, "telegram");
    res.json({ ok: true, result: {} });
  });

  // ============ DISCORD ============
  app.post("/webhook/discord", async (req: Request, res: Response) => {
    await handleChannelWebhook(req, res, "discord");
    res.json({ type: 1 }); // PONG response for Discord interactions
  });

  app.post("/api/webhooks/:id/:token", async (req: Request, res: Response) => {
    await handleChannelWebhook(req, res, "discord");
    res.status(204).end();
  });

  app.post("/interactions", async (req: Request, res: Response) => {
    await handleChannelWebhook(req, res, "discord");
    const payload = parseBody(req) as Record<string, unknown>;

    // Handle Discord verification
    if (payload.type === 1) {
      res.json({ type: 1 });
      return;
    }

    // Generic interaction response
    res.json({
      type: 4,
      data: {
        content: "Message received by OpenClaw",
      },
    });
  });

  // ============ SLACK ============
  app.post("/webhook/slack", async (req: Request, res: Response) => {
    await handleChannelWebhook(req, res, "slack");
    const payload = parseBody(req) as Record<string, unknown>;

    // Handle Slack URL verification
    if (payload.type === "url_verification") {
      res.send(payload.challenge);
      return;
    }

    res.json({ ok: true });
  });

  app.post("/slack/events", async (req: Request, res: Response) => {
    await handleChannelWebhook(req, res, "slack");
    const payload = parseBody(req) as Record<string, unknown>;

    if (payload.type === "url_verification") {
      res.send(payload.challenge);
      return;
    }

    res.status(200).end();
  });

  app.post("/slack/commands", async (req: Request, res: Response) => {
    await handleChannelWebhook(req, res, "slack");
    res.json({
      response_type: "ephemeral",
      text: "Command received",
    });
  });

  app.post("/slack/interactive", async (req: Request, res: Response) => {
    await handleChannelWebhook(req, res, "slack");
    res.status(200).end();
  });

  // ============ SIGNAL ============
  app.post("/webhook/signal", async (req: Request, res: Response) => {
    await handleChannelWebhook(req, res, "signal");
    res.json({ ok: true });
  });

  app.post("/v1/send", async (req: Request, res: Response) => {
    await handleChannelWebhook(req, res, "signal");
    res.json({
      timestamp: Date.now(),
    });
  });

  // ============ GENERIC / CUSTOM ============
  app.post("/webhook/:channel", async (req: Request, res: Response) => {
    const channel = req.params.channel;
    await handleChannelWebhook(req, res, channel);
    res.json({ ok: true, channel });
  });

  // ============ HOOKS (OpenClaw style) ============
  app.post("/hooks/wake", async (req: Request, res: Response) => {
    await handleChannelWebhook(req, res, "hooks");
    res.json({ ok: true, mode: "now" });
  });

  app.post("/hooks/agent", async (req: Request, res: Response) => {
    await handleChannelWebhook(req, res, "hooks");
    res.json({ ok: true, runId: uuidv4() });
  });

  app.post("/hooks/*", async (req: Request, res: Response) => {
    await handleChannelWebhook(req, res, "hooks");
    res.json({ ok: true });
  });

  logger.info("Channel webhook routes configured");
}
