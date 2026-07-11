// ═══════════════════════════════════════════════════════════════════
// NLU Engine — Multi-layer intent classification + entity extraction
// ═══════════════════════════════════════════════════════════════════

import type { LLMClient } from "../adapters/llm/openrouter";

// ═══════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════

export interface IntentDef {
  name: string;
  synonyms: string[];
}

export interface NLUResult {
  intent: IntentDef | null;
  confidence: number;
  entities: Record<string, string>;
}

export interface NLUEngine {
  infer(messages: string[], intents: IntentDef[]): Promise<NLUResult>;
}

// ═══════════════════════════════════════════════════════════════════
// Text normalization
// ═══════════════════════════════════════════════════════════════════

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // remove accents
    .replace(/[^a-z0-9\s]/g, " ") // remove special chars
    .replace(/\s+/g, " ")
    .trim();
}

// ═══════════════════════════════════════════════════════════════════
// Layer 0: Exact match
// ═══════════════════════════════════════════════════════════════════

function exactMatch(text: string, intents: IntentDef[]): NLUResult | null {
  const norm = normalize(text);
  for (const intent of intents) {
    for (const syn of intent.synonyms) {
      if (normalize(syn) === norm) {
        return { intent, confidence: 1.0, entities: {} };
      }
    }
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════════
// Layer 1: Contains match
// ═══════════════════════════════════════════════════════════════════

function containsMatch(text: string, intents: IntentDef[]): NLUResult | null {
  const norm = normalize(text);
  let best: NLUResult | null = null;

  for (const intent of intents) {
    for (const syn of intent.synonyms) {
      const normSyn = normalize(syn);
      if (normSyn.length >= 3 && norm.includes(normSyn)) {
        const confidence = normSyn.length / norm.length;
        if (!best || confidence > best.confidence) {
          best = { intent, confidence, entities: {} };
        }
      }
    }
  }
  return best;
}

// ═══════════════════════════════════════════════════════════════════
// Layer 2: Token overlap (Jaccard)
// ═══════════════════════════════════════════════════════════════════

function jaccardMatch(text: string, intents: IntentDef[]): NLUResult | null {
  const norm = normalize(text);
  const tokens = new Set(norm.split(" ").filter((t) => t.length >= 2));
  if (tokens.size === 0) return null;

  let best: NLUResult | null = null;

  for (const intent of intents) {
    for (const syn of intent.synonyms) {
      const synTokens = new Set(
        normalize(syn)
          .split(" ")
          .filter((t) => t.length >= 2)
      );
      if (synTokens.size === 0) continue;

      const intersection = [...tokens].filter((t) => synTokens.has(t)).length;
      const union = new Set([...tokens, ...synTokens]).size;
      const score = intersection / union;

      if (score > 0.4 && (!best || score > best.confidence)) {
        best = { intent, confidence: score, entities: {} };
      }
    }
  }
  return best;
}

// ═══════════════════════════════════════════════════════════════════
// Layer 3: Levenshtein fuzzy match (tolerant to typos)
// ═══════════════════════════════════════════════════════════════════

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    Array(n + 1).fill(0)
  );
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

function fuzzyMatch(text: string, intents: IntentDef[]): NLUResult | null {
  const norm = normalize(text);
  if (norm.length < 3) return null;

  let best: NLUResult | null = null;

  for (const intent of intents) {
    for (const syn of intent.synonyms) {
      const normSyn = normalize(syn);
      if (normSyn.length < 3) continue;

      const dist = levenshtein(norm, normSyn);
      const maxLen = Math.max(norm.length, normSyn.length);
      const similarity = 1 - dist / maxLen;

      // Short synonyms need higher similarity
      const threshold = normSyn.length <= 5 ? 0.75 : 0.55;

      if (similarity >= threshold && (!best || similarity > best.confidence)) {
        best = { intent, confidence: similarity, entities: {} };
      }
    }
  }
  return best;
}

// ═══════════════════════════════════════════════════════════════════
// Entity Extraction (regex-based)
// ═══════════════════════════════════════════════════════════════════

function extractEntities(text: string): Record<string, string> {
  const entities: Record<string, string> = {};

  // Date patterns: YYYY-MM-DD, DD/MM/YYYY, DD/MM
  const datePatterns = [
    /(\d{4}-\d{2}-\d{2})/,
    /(\d{2}\/\d{2}\/\d{4})/,
    /(\d{2}\/\d{2})/,
  ];
  for (const pat of datePatterns) {
    const m = text.match(pat);
    if (m) {
      let date = m[1];
      if (/^\d{2}\/\d{2}\/\d{4}$/.test(date)) {
        const [dd, mm, yyyy] = date.split("/");
        date = `${yyyy}-${mm}-${dd}`;
      } else if (/^\d{2}\/\d{2}$/.test(date)) {
        const [dd, mm] = date.split("/");
        const yyyy = new Date().getFullYear();
        date = `${yyyy}-${mm}-${dd}`;
      }
      entities._date = date;
      break;
    }
  }

  // Time patterns: HH:00, HHh, HH:00h
  const timeMatch = text.match(/(\d{1,2}):?(\d{2})?\s*h?/);
  if (timeMatch) {
    const hour = parseInt(timeMatch[1]);
    if (hour >= 8 && hour <= 17) {
      entities._time = `${String(hour).padStart(2, "0")}:00`;
    }
  }

  // Phone patterns
  const phoneMatch = text.match(/(\d{10,11})/);
  if (phoneMatch) {
    entities._phone = phoneMatch[1];
  }

  // Equipment model keywords
  const modelKeywords = ["fr600", "fr800", "soft slim", "flex", "compact"];
  for (const kw of modelKeywords) {
    if (normalize(text).includes(kw)) {
      entities._model = kw;
      break;
    }
  }

  // Appointment IDs (UUID pattern)
  const uuidMatch = text.match(
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i
  );
  if (uuidMatch) {
    entities._appointmentId = uuidMatch[0];
  }

  return entities;
}

// ═══════════════════════════════════════════════════════════════════
// Main NLU Engine
// ═══════════════════════════════════════════════════════════════════

export function createNLUEngine(llm?: LLMClient): NLUEngine {
  return {
    async infer(messages: string[], intents: IntentDef[]): Promise<NLUResult> {
      const text = messages.join(" ").trim();
      if (!text) {
        return { intent: null, confidence: 0, entities: {} };
      }

      // Layer 0: Exact match
      const exact = exactMatch(text, intents);
      if (exact && exact.confidence >= 0.9) {
        return { ...exact, entities: extractEntities(text) };
      }

      // Layer 1: Contains match
      const contains = containsMatch(text, intents);
      if (contains && contains.confidence >= 0.5) {
        return { ...contains, entities: extractEntities(text) };
      }

      // Layer 2: Token overlap
      const jaccard = jaccardMatch(text, intents);
      if (jaccard && jaccard.confidence >= 0.45) {
        return { ...jaccard, entities: extractEntities(text) };
      }

      // Layer 3: Fuzzy match
      const fuzzy = fuzzyMatch(text, intents);
      if (fuzzy && fuzzy.confidence >= 0.6) {
        return { ...fuzzy, entities: extractEntities(text) };
      }

      // Layer 4: LLM Fallback
      if (llm) {
        const llmResult = await llm.classify(
          text,
          `Estado atual do contexto: intents disponíveis: ${intents.map((i) => i.name).join(", ")}`
        );
        if (llmResult.intent) {
          const matchedIntent = intents.find(
            (i) =>
              normalize(i.name) === normalize(llmResult.intent)
          );
          if (matchedIntent) {
            return {
              intent: matchedIntent,
              confidence: 0.5,
              entities: { ...extractEntities(text), ...llmResult.entities },
            };
          }
        }
      }

      // Nothing found
      return { intent: null, confidence: 0, entities: extractEntities(text) };
    },
  };
}

// ═══════════════════════════════════════════════════════════════════
// Pre-compiled intent detection regexes (fast path)
// ═══════════════════════════════════════════════════════════════════

export const QUICK_PATTERNS: [RegExp, string][] = [
  // Greetings
  [/\b(oi|ola|olá|bom dia|boa tarde|boa noite|hey|eae|iae)\b/i, "saudacao"],
  // Menu / back
  [/\b(menu|in[ií]cio|voltar|inicio|home)\b/i, "voltar"],
  // Cancel
  [/\b(cancelar|cancela|desmarcar|desmarca)\b/i, "cancelar"],
  // Exit
  [/\b(sair|encerrar|tchau|fim|finalizar|adeus)\b/i, "encerrar"],
  // Human
  [/\b(atendente|consultor|humano|falar com|pessoa|gente)\b/i, "atendente"],
  // Schedule
  [/\b(agendar|marcar|nova manuten[cç][aã]o|manuten[cç][aã]o|marcar visita)\b/i, "agendar"],
  // My appointments
  [/\b(meus agendamentos|ver agendamentos|consultas|marcados|marcadas|minhas manuten[cç][oõ]es)\b/i, "ver_agendamentos"],
  // My equipment
  [/\b(meus equipamentos|meus purificadores|ver equipamentos|aparelhos|purificadores)\b/i, "ver_equipamentos"],
  // Confirm
  [/\b(sim|yes|confirmo|confirmar|ok|quero|claro|bora|vamos|pode ser)\b/i, "sim"],
  // Deny
  [/\b(n[aã]o|no|nop|agora n[aã]o|depois|obrigado)\b/i, "nao"],
  // Help
  [/\b(ajuda|help|comandos|o que (voc[eê] )?faz|como funciona)\b/i, "ajuda"],
  // Admin
  [/\b(admin|painel|administrativo|gest[aã]o)\b/i, "admin_menu"],
  // Reschedule
  [/\b(remarcar|reagendar|mudar hor[aá]rio|mudar data|trocar data|trocar hor[aá]rio)\b/i, "remarcar"],
];
