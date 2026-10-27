import type { Response } from "express";
import type { Pool, PoolClient } from "pg";
import { randomUUID } from "node:crypto";

type Change = { userId: string; topic: string; source: string };
export class Realtime {
  private clients = new Set<{
    userId: string;
    admin: boolean;
    response: Response;
  }>();
  private source = randomUUID();
  private listener?: PoolClient;
  private closing = false;
  constructor(private pool: Pool | null) {}
  async init() {
    if (!this.pool || this.closing) return;
    try {
      const listener = await this.pool.connect();
      this.listener = listener;
      listener.on("notification", (message) => {
        if (message.payload) {
          const change = JSON.parse(message.payload) as Change;
          if (change.source !== this.source) this.deliver(change);
        }
      });
      listener.on("error", () => {
        listener.release(true);
        if (this.listener === listener) this.listener = undefined;
        if (!this.closing) setTimeout(() => void this.init(), 3000).unref();
      });
      await listener.query("LISTEN civicflow_changes");
    } catch (error) {
      console.error("Realtime database listener unavailable", error);
      if (!this.closing) setTimeout(() => void this.init(), 5000).unref();
    }
  }
  subscribe(userId: string, admin: boolean, response: Response) {
    if (
      this.clients.size >= 2048 ||
      [...this.clients].filter((client) => client.userId === userId).length >= 8
    ) {
      response
        .status(429)
        .json({ message: "Too many live connections. Close unused app tabs." });
      return;
    }
    response.set({
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    response.flushHeaders();
    response.write(`data: ${JSON.stringify({ topic: "connected" })}\n\n`);
    const client = { userId, admin, response };
    this.clients.add(client);
    const heartbeat = setInterval(
      () => response.write(": heartbeat\n\n"),
      15000,
    );
    // Re-authenticate periodically instead of leaving an expired JWT connected forever.
    const expiry = setTimeout(() => response.end(), 15 * 60 * 1000);
    response.on("close", () => {
      clearInterval(heartbeat);
      clearTimeout(expiry);
      this.clients.delete(client);
    });
  }
  private deliver(change: Change) {
    for (const client of this.clients) {
      if (client.userId === change.userId || client.admin) {
        if (client.response.writableLength > 65536) client.response.end();
        else
          client.response.write(
            `data: ${JSON.stringify({ topic: change.topic })}\n\n`,
          );
      }
    }
  }
  async publish(userId: string, topic: string) {
    const change = { userId, topic, source: this.source };
    this.deliver(change);
    if (this.pool) {
      try {
        await this.pool.query("SELECT pg_notify('civicflow_changes',$1)", [
          JSON.stringify(change),
        ]);
      } catch (error) {
        console.error("Cross-instance notification failed", error);
      }
    }
  }
  async close() {
    this.closing = true;
    for (const c of this.clients) c.response.end();
    this.listener?.release(true);
  }
}
