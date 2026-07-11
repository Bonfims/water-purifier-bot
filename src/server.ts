// ═══════════════════════════════════════════════════════════════════
// HTTP Server — Nutalk Bot Interface
// ═══════════════════════════════════════════════════════════════════
//
// Compatible with nutalk-dev webhook integration.
// Same interface contract as nutalk-bot:
//   POST /api/conversations/:id/messages
//   GET /api/conversations/:id
//   DELETE /api/conversations/:id
//   POST /api/webhook
//   GET /api/health

import { config } from "./config";
import { createBot, defaultSession } from "./bot/process";
import { createMemorySessionStore } from "./adapters/storage/memory";
import { createMemoryDataStore } from "./adapters/storage/memory";
import { createRedisSessionStore } from "./adapters/storage/redis";
import { createPostgresDataStore } from "./adapters/storage/postgres";
import {
  createOpenRouterClient,
  createNoopLLMClient,
} from "./adapters/llm/openrouter";
import { executeActions } from "./executor";
import type { SessionStore } from "./core/ports";
import type { DataStore } from "./core/ports";
import type { BotSession } from "./core/entities";

// ═══════════════════════════════════════════════════════════════════
// Bootstrap Storage
// ═══════════════════════════════════════════════════════════════════

let sessionStore: SessionStore;
let dataStore: DataStore;

async function initStores() {
  // Session store
  if (config.redisUrl) {
    sessionStore = await createRedisSessionStore(config.redisUrl);
  } else {
    sessionStore = createMemorySessionStore();
  }
  await sessionStore.connect();

  // Data store
  if (config.databaseUrl) {
    dataStore = await createPostgresDataStore(config.databaseUrl);
  } else {
    dataStore = createMemoryDataStore();
  }
  await dataStore.connect();

  // Seed some demo data if in-memory
  if (!config.databaseUrl) {
    await seedDemoData(dataStore);
  }
}

async function seedDemoData(store: DataStore) {
  // Seed a demo customer
  const phone = "11999999999";
  const existing = await store.getCustomer(phone);
  if (!existing) {
    await store.createCustomer({
      id: phone,
      name: "Maria Silva",
      isAdmin: false,
      address: "Rua das Flores, 123",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await store.createEquipment({
      id: crypto.randomUUID(),
      customerId: phone,
      model: "Soft Slim",
      serialNumber: "SS-2024-00123",
      installDate: new Date("2024-01-15"),
      lastMaintenance: new Date("2024-07-15"),
      nextMaintenance: new Date("2025-01-15"),
      notes: "",
      createdAt: new Date(),
    });
  }

  // Seed an admin
  const adminPhone = config.adminPhones[0] || "11988888888";
  const adminExists = await store.getCustomer(adminPhone);
  if (!adminExists) {
    await store.createCustomer({
      id: adminPhone,
      name: "Admin Técnico",
      isAdmin: true,
      address: "Rua Central, 456",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }
}

// ═══════════════════════════════════════════════════════════════════
// Bootstrap LLM
// ═══════════════════════════════════════════════════════════════════

function initLLM() {
  if (config.llmApiKey) {
    return createOpenRouterClient(config.llmApiKey, config.llmModel);
  }
  return createNoopLLMClient();
}

// ═══════════════════════════════════════════════════════════════════
// Auth middleware
// ═══════════════════════════════════════════════════════════════════

function auth(req: Request): boolean {
  if (!config.apiToken) return true;
  const header = req.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  return token === config.apiToken;
}

// ═══════════════════════════════════════════════════════════════════
// JSON helpers
// ═══════════════════════════════════════════════════════════════════

function json(data: any, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// ═══════════════════════════════════════════════════════════════════
// Main Server
// ═══════════════════════════════════════════════════════════════════

async function main() {
  await initStores();
  const llm = initLLM();
  const { processMessage } = createBot(dataStore, config.adminPhones, llm);
  const TTL = 3600;

  async function processConversation(
    conversationId: string,
    text: string,
    contact?: { id: string; name?: string; phone?: string }
  ) {
    let session = await sessionStore.get(conversationId);
    if (!session) {
      session = defaultSession(contact || { id: conversationId });
    }

    const result = await processMessage(session, text);

    if (result.newSession === null) {
      await sessionStore.del(conversationId);
    } else {
      if (!result.newSession.contact?.id && contact?.id) {
        result.newSession.contact = contact;
      }
      await sessionStore.set(conversationId, result.newSession, TTL);
    }

    // Build reply actions
    const actions = result.replies.map((item) => {
      if (typeof item === "string") return { type: "reply", text: item };
      return {
        type: "reply",
        text: item.text,
        interactive: item.interactive,
      };
    });

    return { actions, setTags: result.setTags, removeTags: result.removeTags };
  }

  // ═══════════════════════════════════════════════════════════════
  // Bun HTTP Server
  // ═══════════════════════════════════════════════════════════════

  const server = Bun.serve({
    port: config.port,
    async fetch(req: Request): Promise<Response> {
      const url = new URL(req.url);
      const path = url.pathname;
      const method = req.method;

      // CORS
      if (method === "OPTIONS") {
        return new Response(null, {
          status: 204,
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, Authorization",
          },
        });
      }

      // Health check (no auth)
      if (method === "GET" && path === "/api/health") {
        return json({ status: "ok", uptime: process.uptime() });
      }

      // Auth check for other routes
      if (!auth(req)) {
        return json({ error: "unauthorized" }, 401);
      }

      try {
        // POST /api/conversations/:id/messages
        const msgMatch = path.match(
          /^\/api\/conversations\/([^/]+)\/messages$/
        );
        if (method === "POST" && msgMatch) {
          const conversationId = msgMatch[1];
          const body = (await req.json().catch(() => ({}))) as any;
          const { text, contact } = body;

          const { actions, setTags, removeTags } = await processConversation(
            conversationId,
            text || "",
            contact
          );

          return json({ actions, _setTags: setTags, _removeTags: removeTags });
        }

        // GET /api/conversations/:id
        const getMatch = path.match(/^\/api\/conversations\/([^/]+)$/);
        if (method === "GET" && getMatch) {
          const session = await sessionStore.get(getMatch[1]);
          if (!session) return json({ error: "not found" }, 404);
          return json(session);
        }

        // DELETE /api/conversations/:id
        if (method === "DELETE" && getMatch) {
          await sessionStore.del(getMatch[1]);
          return json({ ok: true });
        }

        // POST /api/webhook — nutalk-dev integration
        if (
          method === "POST" &&
          (path === "/api/webhook" || path === "/api/webhooks/nutalk")
        ) {
          const body = (await req.json().catch(() => ({}))) as any;
          let contactId: string, text: string, contact: any;
          let conversationId: string | undefined;

          if (body.message?.text) {
            // Format 1: queue-level triggerOutgoingWebhook
            contactId = body.contactId;
            text = body.message.text;
            contact = { id: body.contactId };
          } else if (body.text && body.contact_phone) {
            // Format 2: WhatsApp via outbound worker
            contactId = body.contact_phone;
            text = body.text;
            conversationId = body.conversation_id;
            contact = {
              id: body.contact_phone,
              name: body.contact_name,
              phone: body.contact_phone,
            };
          } else {
            return json({ error: "unknown payload format" }, 400);
          }

          const { actions, setTags, removeTags } = await processConversation(
            contactId,
            text,
            contact
          );

          // Envia replies de volta via API do nutalk-dev (send-message + tags)
          const execResults = await executeActions({
            contactId,
            conversationId,
            channel: body.channel || "whatsapp",
            actions,
            setTags,
            removeTags,
          });

          console.log("[webhook]", {
            contactId,
            conversationId,
            text: text?.slice(0, 50),
            replies: actions.length,
            setTags,
            removeTags,
            execResults,
          });

          return json({ actions, setTags, removeTags, execResults });
        }

        // POST /api/webhooks/schedulebot (custom endpoint for direct testing)
        if (method === "POST" && path === "/api/webhooks/schedulebot") {
          const body = (await req.json().catch(() => ({}))) as any;
          const contactId = body.contactId || body.contact_phone || "test";
          const conversationId = body.conversation_id;
          const text = body.message?.text || body.text || "";
          const contact = body.contact || {
            id: contactId,
            name: body.contact_name || "Test",
          };

          const { actions, setTags, removeTags } = await processConversation(
            contactId,
            text,
            contact
          );

          const execResults = await executeActions({
            contactId,
            conversationId,
            channel: body.channel || "whatsapp",
            actions,
            setTags,
            removeTags,
          });

          console.log("[schedulebot-webhook]", {
            contactId,
            text: text?.slice(0, 50),
            replies: actions.length,
            execResults,
          });

          return json({ actions, setTags, removeTags, execResults });
        }

        return json({ error: "not found" }, 404);
      } catch (err) {
        console.error("[server] error:", (err as Error).message);
        return json({ actions: [] });
      }
    },
  });

  console.log(`[schedulebot] http://localhost:${server.port}`);
  console.log(`[schedulebot] health: http://localhost:${server.port}/api/health`);
  if (config.apiToken) console.log("[schedulebot] auth enabled");
  if (config.llmApiKey) console.log("[schedulebot] LLM fallback enabled");
  if (config.databaseUrl) console.log("[schedulebot] Postgres storage");
  else console.log("[schedulebot] In-memory storage");
  console.log(`[schedulebot] Admin phones: ${config.adminPhones.join(", ") || "none"}`);
}

main().catch((err) => {
  console.error("[schedulebot] failed to start:", err.message);
  process.exit(1);
});
