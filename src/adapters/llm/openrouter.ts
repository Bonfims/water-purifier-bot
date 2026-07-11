// ═══════════════════════════════════════════════════════════════════
// LLM Fallback Adapter — OpenRouter for when NLU can't match
// ═══════════════════════════════════════════════════════════════════

export interface LLMClient {
  classify(
    message: string,
    context: string
  ): Promise<{ intent: string; entities: Record<string, string> }>;
}

export function createOpenRouterClient(
  apiKey: string,
  model: string = "openai/gpt-4o-mini"
): LLMClient {
  return {
    async classify(message: string, context: string) {
      try {
        const response = await fetch(
          "https://openrouter.ai/api/v1/chat/completions",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${apiKey}`,
              "HTTP-Referer": "http://localhost:3000",
              "X-Title": "ScheduleBot",
            },
            body: JSON.stringify({
              model,
              messages: [
                {
                  role: "system",
                  content: `Você é um classificador de intenções para um bot de agendamento de manutenção de purificadores de água.
                  ${context}

                  Responda APENAS com JSON no formato: {"intent": "<intent>", "entities": {"key": "value"}}

                  Intenções disponíveis: agendar, ver_agendamentos, ver_equipamentos, cancelar, remarcar, confirmar, menu, ajuda, atendente, saudacao, sim, nao, equipamento_info, admin_menu.

                  Entidades que você pode extrair: data (YYYY-MM-DD), horario (HH:00), equipamento_id, equipamento_modelo, agendamento_id, nome_cliente.`,
                },
                {
                  role: "user",
                  content: message,
                },
              ],
              temperature: 0.1,
              max_tokens: 200,
            }),
          }
        );

        if (!response.ok) {
          return { intent: "", entities: {} };
        }

        const data = (await response.json()) as any;
        const content = data?.choices?.[0]?.message?.content || "";
        // Extract JSON from response
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (!jsonMatch) return { intent: "", entities: {} };

        const parsed = JSON.parse(jsonMatch[0]);
        return {
          intent: parsed.intent || "",
          entities: parsed.entities || {},
        };
      } catch (err) {
        console.error("[llm] openrouter error:", (err as Error).message);
        return { intent: "", entities: {} };
      }
    },
  };
}

/** Create a no-op LLM client (when no API key is configured) */
export function createNoopLLMClient(): LLMClient {
  return {
    async classify() {
      return { intent: "", entities: {} };
    },
  };
}
