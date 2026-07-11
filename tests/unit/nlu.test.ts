// ═══════════════════════════════════════════════════════════════════
// NLU Unit Tests — Intent classification & entity extraction
// ═══════════════════════════════════════════════════════════════════

import { describe, expect, test } from "bun:test";
import { createNLUEngine, QUICK_PATTERNS } from "../../src/bot/nlu";

const INTENTS = [
  { name: "saudacao", synonyms: ["oi", "ola", "bom dia", "boa tarde", "boa noite", "hey"] },
  { name: "agendar", synonyms: ["agendar", "marcar", "manutencao", "nova manutencao", "quero agendar"] },
  { name: "ver_equipamentos", synonyms: ["meus equipamentos", "meus purificadores", "ver equipamentos", "aparelhos"] },
  { name: "ver_agendamentos", synonyms: ["meus agendamentos", "ver agendamentos", "minhas manutencoes"] },
  { name: "cancelar", synonyms: ["cancelar", "cancela", "desmarcar", "desmarca"] },
  { name: "atendente", synonyms: ["atendente", "consultor", "humano", "falar com atendente", "falar com alguem"] },
  { name: "sim", synonyms: ["sim", "s", "yes", "confirmo", "confirmar", "ok", "quero"] },
  { name: "nao", synonyms: ["nao", "não", "n", "no", "agora nao"] },
  { name: "voltar", synonyms: ["voltar", "menu", "inicio", "home", "principal"] },
  { name: "ajuda", synonyms: ["ajuda", "help", "comandos"] },
  { name: "remarcar", synonyms: ["remarcar", "reagendar", "mudar horario", "trocar data"] },
];

const nlu = createNLUEngine(); // No LLM — pure NLP layers

describe("NLU Engine", () => {
  // ═══════════════════════════════════════════════════════════════
  // Exact matches
  // ═══════════════════════════════════════════════════════════════
  test("exact match: 'oi' → saudacao", async () => {
    const result = await nlu.infer(["oi"], INTENTS);
    expect(result.intent?.name).toBe("saudacao");
    expect(result.confidence).toBeGreaterThanOrEqual(0.9);
  });

  test("exact match: 'menu' → voltar", async () => {
    const result = await nlu.infer(["menu"], INTENTS);
    expect(result.intent?.name).toBe("voltar");
  });

  test("exact match: 'cancelar' → cancelar", async () => {
    const result = await nlu.infer(["cancelar"], INTENTS);
    expect(result.intent?.name).toBe("cancelar");
  });

  test("exact match: 'atendente' → atendente", async () => {
    const result = await nlu.infer(["atendente"], INTENTS);
    expect(result.intent?.name).toBe("atendente");
  });

  // ═══════════════════════════════════════════════════════════════
  // Contains / partial matches
  // ═══════════════════════════════════════════════════════════════
  test("contains: 'quero agendar uma manutencao' → agendar", async () => {
    const result = await nlu.infer(["quero agendar uma manutencao"], INTENTS);
    expect(result.intent?.name).toBe("agendar");
  });

  test("contains: 'meus purificadores por favor' → ver_equipamentos", async () => {
    const result = await nlu.infer(["meus purificadores por favor"], INTENTS);
    expect(result.intent?.name).toBe("ver_equipamentos");
  });

  test("contains: 'quero ver meus agendamentos' → ver_agendamentos", async () => {
    const result = await nlu.infer(["quero ver meus agendamentos"], INTENTS);
    expect(result.intent?.name).toBe("ver_agendamentos");
  });

  // ═══════════════════════════════════════════════════════════════
  // Variants and synonyms
  // ═══════════════════════════════════════════════════════════════
  test("synonym: 'bom dia' → saudacao", async () => {
    const result = await nlu.infer(["bom dia"], INTENTS);
    expect(result.intent?.name).toBe("saudacao");
  });

  test("synonym: 'falar com atendente' → atendente", async () => {
    const result = await nlu.infer(["falar com atendente"], INTENTS);
    expect(result.intent?.name).toBe("atendente");
  });

  test("synonym: 'quero falar com alguem' → atendente", async () => {
    const result = await nlu.infer(["quero falar com alguem"], INTENTS);
    expect(result.intent?.name).toBe("atendente");
  });

  // ═══════════════════════════════════════════════════════════════
  // Edge cases
  // ═══════════════════════════════════════════════════════════════
  test("empty input returns null intent", async () => {
    const result = await nlu.infer([""], INTENTS);
    expect(result.intent).toBeNull();
  });

  test("whitespace input returns null intent", async () => {
    const result = await nlu.infer(["   "], INTENTS);
    expect(result.intent).toBeNull();
  });

  test("completely unknown text returns null intent", async () => {
    const result = await nlu.infer(["xyzabc123 blargh"], INTENTS);
    expect(result.intent).toBeNull();
    expect(result.confidence).toBe(0);
  });
});

describe("Quick Patterns (regex)", () => {
  test("detects greeting", () => {
    const found = QUICK_PATTERNS.find(([re]) => re.test("Bom dia!"));
    expect(found?.[1]).toBe("saudacao");
  });

  test("detects schedule intent", () => {
    const found = QUICK_PATTERNS.find(([re]) => re.test("quero agendar manutenção"));
    expect(found?.[1]).toBe("agendar");
  });

  test("detects my appointments", () => {
    const found = QUICK_PATTERNS.find(([re]) => re.test("ver meus agendamentos"));
    expect(found?.[1]).toBe("ver_agendamentos");
  });

  test("detects my equipment", () => {
    const found = QUICK_PATTERNS.find(([re]) => re.test("meus purificadores"));
    expect(found?.[1]).toBe("ver_equipamentos");
  });

  test("detects cancel", () => {
    const found = QUICK_PATTERNS.find(([re]) => re.test("cancelar agendamento"));
    expect(found?.[1]).toBe("cancelar");
  });

  test("detects human request", () => {
    const found = QUICK_PATTERNS.find(([re]) => re.test("quero falar com atendente"));
    expect(found?.[1]).toBe("atendente");
  });

  test("detects exit", () => {
    const found = QUICK_PATTERNS.find(([re]) => re.test("tchau"));
    expect(found?.[1]).toBe("encerrar");
  });

  test("detects confirmation", () => {
    const found = QUICK_PATTERNS.find(([re]) => re.test("sim"));
    expect(found?.[1]).toBe("sim");
  });

  test("detects denial", () => {
    const found = QUICK_PATTERNS.find(([re]) => re.test("não"));
    expect(found?.[1]).toBe("nao");
  });

  test("detects help", () => {
    const found = QUICK_PATTERNS.find(([re]) => re.test("ajuda por favor"));
    expect(found?.[1]).toBe("ajuda");
  });
});
