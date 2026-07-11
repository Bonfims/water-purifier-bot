// ═══════════════════════════════════════════════════════════════════
// Executor — Envia replies e tags de volta pro nutalk-dev
// ═══════════════════════════════════════════════════════════════════
//
// O nutalk-dev só chama o webhook do bot mas NÃO lê a resposta.
// Quem está do outro lado (bot) precisa chamar as APIs da plataforma:
//   POST /api/v1/conversations/send-message   → envia reply
//   POST /api/v1/conversations/:id/tags/batch → aplica tags

import { config } from "./config";

const BASE = config.nutalkApiUrl;

export interface ExecutorPayload {
  contactId: string;
  conversationId?: string;
  channel?: string;
  actions: Array<{
    type: string;
    text?: string;
    interactive?: any;
  }>;
  setTags?: string[];
  removeTags?: string[];
}

export async function executeActions(payload: ExecutorPayload) {
  const { contactId, conversationId, channel, actions, setTags, removeTags } = payload;
  const results: any[] = [];
  const convId = conversationId || contactId;

  // 1. Envia todas as replies PRIMEIRO
  for (const action of actions) {
    if (action.type !== "reply") continue;
    try {
      const body: any = {
        contactId,
        text: action.text || "",
        sender: "bot",
      };
      if (action.interactive) {
        body.interactive = action.interactive;
      }

      const res = await fetch(`${BASE}/api/v1/conversations/send-message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      results.push({ type: "reply", status: res.status });
    } catch (err: any) {
      console.error("[executor] reply failed:", err.message);
      results.push({ type: "reply", status: "error", error: err.message });
    }
  }

  // 2. Pausa pra garantir que o usuário leia as mensagens antes do roteamento
  const hasReplies = actions.some((a) => a.type === "reply");
  const hasTags =
    (setTags && setTags.length > 0) || (removeTags && removeTags.length > 0);

  if (hasReplies && hasTags) {
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }

  // 3. Aplica tags (transferência pra humano)
  if (setTags && setTags.length > 0) {
    try {
      const res = await fetch(
        `${BASE}/api/v1/conversations/${convId}/tags/batch`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ attach: setTags }),
        }
      );
      results.push({ type: "setTags", tags: setTags, status: res.status });
    } catch (err: any) {
      console.error("[executor] setTags failed:", err.message);
      results.push({
        type: "setTags",
        tags: setTags,
        status: "error",
        error: err.message,
      });
    }
  }

  // 4. Remove tags
  if (removeTags && removeTags.length > 0) {
    for (const tag of removeTags) {
      try {
        const res = await fetch(
          `${BASE}/api/v1/conversations/${convId}/tags/${tag}`,
          { method: "DELETE" }
        );
        results.push({ type: "removeTag", tag, status: res.status });
      } catch (err: any) {
        console.error("[executor] removeTag failed:", err.message);
        results.push({
          type: "removeTag",
          tag,
          status: "error",
          error: err.message,
        });
      }
    }

    // Wake up default nutalk-bot when removing specialty tag (return to main bot)
    const removedSpecialty = removeTags.find((t) => t.startsWith("specialty:"));
    if (removedSpecialty && config.nutalkBotUrl) {
      try {
        const wakeRes = await fetch(config.nutalkBotUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: "__START__",
            contact_phone: contactId,
            contact_name: "",
            channel: channel || "whatsapp",
            conversation_id: convId,
          }),
        });
        results.push({
          type: "wake_default_bot",
          url: config.nutalkBotUrl,
          status: wakeRes.status,
        });
        console.log(
          `[executor] Woke default bot: ${config.nutalkBotUrl} status=${wakeRes.status}`
        );
      } catch (err: any) {
        console.error("[executor] wake default bot failed:", err.message);
        results.push({
          type: "wake_default_bot",
          url: config.nutalkBotUrl,
          status: "error",
          error: err.message,
        });
      }
    }
  }

  return results;
}
