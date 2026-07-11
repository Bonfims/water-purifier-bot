// ═══════════════════════════════════════════════════════════════════
// Redis Session Store Adapter — Production session persistence
// ═══════════════════════════════════════════════════════════════════

import type { SessionStore } from "../../core/ports";
import type { BotSession } from "../../core/entities";

const KEY_PREFIX = "schedulebot:session:";

function key(conversationId: string): string {
  return `${KEY_PREFIX}${conversationId}`;
}

export async function createRedisSessionStore(
  redisUrl: string
): Promise<SessionStore> {
  const Redis = (await import("ioredis")).default;
  const redis = new Redis(redisUrl, { lazyConnect: true });

  redis.on("error", (err) => {
    console.error("[redis] connection error:", err.message);
  });

  return {
    async connect() {
      await redis.connect();
      console.log("[session] using redis store");
    },
    async get(conversationId: string) {
      const raw = await redis.get(key(conversationId));
      if (!raw) return null;
      try {
        return JSON.parse(raw) as BotSession;
      } catch {
        return null;
      }
    },
    async set(
      conversationId: string,
      session: BotSession,
      ttlSeconds: number
    ) {
      await redis.setex(key(conversationId), ttlSeconds, JSON.stringify(session));
    },
    async del(conversationId: string) {
      await redis.del(key(conversationId));
    },
  };
}
