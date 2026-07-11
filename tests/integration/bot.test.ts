// ═══════════════════════════════════════════════════════════════════
// Bot Integration Tests — Full conversation flows
// ═══════════════════════════════════════════════════════════════════

import { describe, expect, test, beforeEach } from "bun:test";
import { createBot, defaultSession } from "../../src/bot/process";
import { createMemoryDataStore } from "../../src/adapters/storage/memory";
import { createNoopLLMClient } from "../../src/adapters/llm/openrouter";
import type { DataStore } from "../../src/core/ports";
import type { BotSession } from "../../src/core/entities";

const ADMIN_PHONES = ["11988888888"];

function setupBot() {
  const store = createMemoryDataStore();
  const llm = createNoopLLMClient();
  const { processMessage } = createBot(store, ADMIN_PHONES, llm);
  return { processMessage, store };
}

// Helper: extract reply text from process result
function replyText(result: { replies: any[] }): string {
  return result.replies
    .map((r) => (typeof r === "string" ? r : r.text))
    .join(" ");
}

// Helper: find an interactive reply
function findInteractive(result: { replies: any[] }): any {
  return result.replies.find(
    (r) => typeof r !== "string" && r.interactive
  );
}

// Helper: process a sequence of messages
async function converse(
  processMessage: Function,
  messages: string[],
  initialSession?: BotSession | null
) {
  let session = initialSession || null;
  const results: any[] = [];
  for (const msg of messages) {
    const result = await processMessage(session, msg);
    results.push(result);
    session = result.newSession;
  }
  return { results, finalSession: session };
}

describe("Bot — Identification & Authentication", () => {
  test("__START__ sends welcome asking for phone", async () => {
    const { processMessage } = setupBot();
    const result = await processMessage(null, "__START__");

    expect(result.newSession?.state).toBe("identify");
    const text = replyText(result);
    expect(text).toMatch(/bem.vindo|telefone|DDD/i);
  });

  test("valid phone number creates customer and shows menu", async () => {
    const { processMessage } = setupBot();
    const result = await processMessage(null, "11999999999");

    expect(result.newSession?.state).toBe("customer_menu");
    expect(result.newSession?.entities._phone).toBe("11999999999");
    const text = replyText(result);
    expect(text).toMatch(/menu|agendar|equipamentos/i);
  });

  test("admin phone routes to admin menu", async () => {
    const { processMessage } = setupBot();
    const result = await processMessage(null, "11988888888");

    expect(result.newSession?.state).toBe("admin_menu");
    const text = replyText(result);
    expect(text).toMatch(/admin|painel/i);
  });

  test("invalid (short) phone asks again", async () => {
    const { processMessage } = setupBot();
    const result = await processMessage(null, "123");

    expect(result.newSession?.state).toBe("identify");
    const text = replyText(result);
    expect(text).toMatch(/telefone|DDD/i);
  });
});

describe("Bot — Customer Menu Navigation", () => {
  async function loginAsCustomer(processMessage: Function) {
    const result = await processMessage(null, "11999999999");
    return result.newSession!;
  }

  test("'menu' from customer menu stays in customer menu", async () => {
    const { processMessage } = setupBot();
    const session = await loginAsCustomer(processMessage);

    const result = await processMessage(session, "menu");
    expect(result.newSession?.state).toBe("customer_menu");
  });

  test("'agendar' without equipment triggers new equipment flow", async () => {
    const { processMessage, store } = setupBot();
    const session = await loginAsCustomer(processMessage);

    const result = await processMessage(session, "agendar");
    expect(result.newSession?.state).toBe("new_equipment_model");
    const text = replyText(result);
    expect(text).toMatch(/modelo|purificador/i);
  });

  test("'atendente' starts human intake flow", async () => {
    const { processMessage } = setupBot();
    const session = await loginAsCustomer(processMessage);

    const result = await processMessage(session, "atendente");
    expect(result.newSession?.state).toBe("human_name");
    const text = replyText(result);
    expect(text).toMatch(/nome/i);
  });

  test("'sair' ends the conversation", async () => {
    const { processMessage } = setupBot();
    const session = await loginAsCustomer(processMessage);

    const result = await processMessage(session, "sair");
    expect(result.newSession).toBeNull();
    const text = replyText(result);
    expect(text).toMatch(/encerrado|obrigado|até/i);
  });

  test("greeting returns to customer menu", async () => {
    const { processMessage } = setupBot();
    const session = await loginAsCustomer(processMessage);

    const result = await processMessage(session, "oi");
    expect(result.newSession?.state).toBe("customer_menu");
  });
});

describe("Bot — Full Scheduling Flow", () => {
  async function loginAsCustomer(processMessage: Function) {
    const result = await processMessage(null, "11999999999");
    return result.newSession!;
  }

  test("complete scheduling flow: new equipment → date → time → confirm", async () => {
    const { processMessage, store } = setupBot();

    // 1. Login
    let session = await loginAsCustomer(processMessage);

    // 2. Start scheduling — no equipment yet, so goes to new equipment
    let result = await processMessage(session, "agendar");
    expect(result.newSession?.state).toBe("new_equipment_model");
    session = result.newSession!;

    // 3. Select model
    result = await processMessage(session, "model_Soft Slim");
    expect(result.newSession?.state).toBe("new_equipment_serial");
    session = result.newSession!;
    expect(session.entities._model).toBe("Soft Slim");

    // 4. Enter serial number
    result = await processMessage(session, "SS-2024-99999");
    expect(result.newSession?.state).toBe("select_date");
    session = result.newSession!;
    expect(session.entities._equipmentId).toBeTruthy();

    // 5. Select date (tomorrow)
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const yyyy = tomorrow.getFullYear();
    const mm = String(tomorrow.getMonth() + 1).padStart(2, "0");
    const dd = String(tomorrow.getDate()).padStart(2, "0");
    const dateKey = `${yyyy}-${mm}-${dd}`;

    result = await processMessage(session, `date_${dateKey}`);
    expect(result.newSession?.state).toBe("select_time");
    session = result.newSession!;
    expect(session.entities._date).toBe(dateKey);

    // 6. Select time slot
    result = await processMessage(session, "slot_10:00");
    expect(result.newSession?.state).toBe("confirm_appointment");
    session = result.newSession!;
    expect(session.entities._time).toBe("10:00");

    // 7. Confirm
    const summaryText = replyText(result);
    expect(summaryText).toMatch(/confirmar/i);
    expect(summaryText).toMatch(/Soft Slim/i);

    result = await processMessage(session, "confirmar");
    expect(result.newSession?.state).toBe("customer_menu");
    const confirmText = replyText(result);
    expect(confirmText).toMatch(/confirmado|sucesso/i);

    // Verify appointment exists in store
    const equipment = await store.listEquipmentByCustomer("11999999999");
    expect(equipment.length).toBe(1);

    const apps = await store.listAppointmentsByCustomer("11999999999");
    expect(apps.length).toBe(1);
    expect(apps[0].status).toBe("scheduled");
    expect(apps[0].timeSlot).toBe("10:00");
  });

  test("scheduling with existing equipment: select → date → time → confirm", async () => {
    const { processMessage, store } = setupBot();

    // Pre-create equipment
    await store.createCustomer({
      id: "11999999999",
      name: "Maria",
      isAdmin: false,
      address: "Rua A",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await store.createEquipment({
      id: "existing-eq-1",
      customerId: "11999999999",
      model: "IbbL FR600",
      serialNumber: "FR-001",
      installDate: new Date("2024-01-01"),
      lastMaintenance: null,
      nextMaintenance: null,
      notes: "",
      createdAt: new Date(),
    });

    // Login
    let result = await processMessage(null, "11999999999");
    let session = result.newSession!;

    // Start scheduling — should go to equipment selection
    result = await processMessage(session, "agendar");
    expect(result.newSession?.state).toBe("select_equipment");
    session = result.newSession!;

    // Select equipment
    result = await processMessage(session, "eq_existing-eq-1");
    expect(result.newSession?.state).toBe("select_date");
    session = result.newSession!;

    // Select date
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const yyyy = tomorrow.getFullYear();
    const mm = String(tomorrow.getMonth() + 1).padStart(2, "0");
    const dd = String(tomorrow.getDate()).padStart(2, "0");
    const dateKey = `${yyyy}-${mm}-${dd}`;

    result = await processMessage(session, `date_${dateKey}`);
    session = result.newSession!;

    // Select time
    result = await processMessage(session, "slot_14:00");
    session = result.newSession!;

    // Confirm
    result = await processMessage(session, "sim");
    expect(result.newSession?.state).toBe("customer_menu");

    const apps = await store.listAppointmentsByCustomer("11999999999");
    expect(apps.length).toBe(1);
    expect(apps[0].equipmentId).toBe("existing-eq-1");
    expect(apps[0].timeSlot).toBe("14:00");
  });
});

describe("Bot — Admin Features", () => {
  async function loginAsAdmin(processMessage: Function) {
    const result = await processMessage(null, "11988888888");
    return result.newSession!;
  }

  test("admin sees admin menu after login", async () => {
    const { processMessage } = setupBot();
    const session = await loginAsAdmin(processMessage);

    expect(session.state).toBe("admin_menu");
  });

  test("admin can switch to customer menu", async () => {
    const { processMessage } = setupBot();
    let session = await loginAsAdmin(processMessage);

    const result = await processMessage(session, "menu_cliente");
    expect(result.newSession?.state).toBe("customer_menu");
  });

  test("admin can view today's appointments (empty)", async () => {
    const { processMessage } = setupBot();
    let session = await loginAsAdmin(processMessage);

    const result = await processMessage(session, "admin_agenda_hoje");
    const text = replyText(result);
    expect(text).toMatch(/nenhum|agendamento/i);
  });

  test("admin can view today's appointments (with data)", async () => {
    const { processMessage, store } = setupBot();

    // Setup: create customer + equipment + appointment for today
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, "0");
    const dd = String(today.getDate()).padStart(2, "0");
    const todayStr = `${yyyy}-${mm}-${dd}`;

    await store.createCustomer({
      id: "11999999999",
      name: "Maria",
      isAdmin: false,
      address: "Rua A",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await store.createEquipment({
      id: "eq-today",
      customerId: "11999999999",
      model: "Soft Slim",
      serialNumber: "SS-001",
      installDate: new Date(),
      lastMaintenance: null,
      nextMaintenance: null,
      notes: "",
      createdAt: new Date(),
    });
    await store.createAppointment({
      id: "app-today-1",
      customerId: "11999999999",
      equipmentId: "eq-today",
      date: todayStr,
      timeSlot: "10:00",
      status: "scheduled",
      notes: "",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    let session = await loginAsAdmin(processMessage);

    const result = await processMessage(session, "admin_agenda_hoje");
    const text = replyText(result);
    expect(text).toMatch(/soft slim|10:00/i);
  });

  test("admin can search for a customer", async () => {
    const { processMessage, store } = setupBot();

    await store.createCustomer({
      id: "11977777777",
      name: "João",
      isAdmin: false,
      address: "Rua B",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    let session = await loginAsAdmin(processMessage);

    // Navigate to search
    let result = await processMessage(session, "admin_buscar_cliente");
    expect(result.newSession?.state).toBe("admin_buscar_cliente_input");
    session = result.newSession!;

    // Search
    result = await processMessage(session, "11977777777");
    expect(result.newSession?.state).toBe("admin_menu");
    const text = replyText(result);
    expect(text).toMatch(/João/i);
    expect(text).toMatch(/11977777777/);
  });

  test("admin can reschedule an appointment", async () => {
    const { processMessage, store } = setupBot();

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const yyyy = tomorrow.getFullYear();
    const mm = String(tomorrow.getMonth() + 1).padStart(2, "0");
    const dd = String(tomorrow.getDate()).padStart(2, "0");
    const tomorrowStr = `${yyyy}-${mm}-${dd}`;

    const dayAfter = new Date(tomorrow);
    dayAfter.setDate(dayAfter.getDate() + 1);
    const ddyyyy = dayAfter.getFullYear();
    const ddmm = String(dayAfter.getMonth() + 1).padStart(2, "0");
    const dddd = String(dayAfter.getDate()).padStart(2, "0");
    const dayAfterStr = `${ddyyyy}-${ddmm}-${dddd}`;

    await store.createCustomer({
      id: "11999999999",
      name: "Maria",
      isAdmin: false,
      address: "Rua A",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await store.createEquipment({
      id: "eq-1",
      customerId: "11999999999",
      model: "IbbL FR600",
      serialNumber: "FR-001",
      installDate: new Date(),
      lastMaintenance: null,
      nextMaintenance: null,
      notes: "",
      createdAt: new Date(),
    });
    await store.createAppointment({
      id: "app-reschedule",
      customerId: "11999999999",
      equipmentId: "eq-1",
      date: tomorrowStr,
      timeSlot: "08:00",
      status: "scheduled",
      notes: "",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    let session = await loginAsAdmin(processMessage);

    // Start reschedule
    let result = await processMessage(session, "admin_remarcar");
    expect(result.newSession?.state).toBe("remarcar_select_appointment");
    session = result.newSession!;

    // Select appointment
    result = await processMessage(session, "app-reschedule");
    expect(result.newSession?.state).toBe("remarcar_select_date");
    session = result.newSession!;

    // Select new date
    result = await processMessage(session, `date_${dayAfterStr}`);
    expect(result.newSession?.state).toBe("remarcar_select_time");
    session = result.newSession!;

    // Select new time
    result = await processMessage(session, "slot_16:00");
    expect(result.newSession?.state).toBe("admin_menu");

    // Verify
    const app = await store.getAppointment("app-reschedule");
    expect(app?.date).toBe(dayAfterStr);
    expect(app?.timeSlot).toBe("16:00");
  });
});

describe("Bot — Human Intake Flow", () => {
  test("full human intake: name → reason → transfer", async () => {
    const { processMessage } = setupBot();
    const result = await processMessage(null, "11999999999");
    let session = result.newSession!;

    // Request human
    let r = await processMessage(session, "atendente");
    expect(r.newSession?.state).toBe("human_name");
    session = r.newSession!;

    // Give name
    r = await processMessage(session, "Maria Silva");
    expect(r.newSession?.state).toBe("human_reason");
    session = r.newSession!;

    // Give reason
    r = await processMessage(session, "Preciso de ajuda com meu purificador");
    expect(r.newSession).toBeNull(); // Ends session
    expect(r.setTags).toContain("bot:atendente");
  });
});

describe("Bot — Retry & Fallback", () => {
  async function loginAsCustomer(processMessage: Function) {
    const result = await processMessage(null, "11999999999");
    return result.newSession!;
  }

  test("unknown message in customer menu increments tries", async () => {
    const { processMessage } = setupBot();
    let session = await loginAsCustomer(processMessage);

    const result = await processMessage(session, "xyz nonsense text");
    expect(result.newSession?.tries).toBeGreaterThanOrEqual(1);
    const text = replyText(result);
    expect(text).toMatch(/entendi|tentativa/i);
  });

  test("3 retries in customer menu triggers escalation", async () => {
    const { processMessage } = setupBot();
    let session = await loginAsCustomer(processMessage);

    // Try 1
    let r = await processMessage(session, "blargh1");
    session = r.newSession!;
    expect(session.tries).toBe(1);

    // Try 2
    r = await processMessage(session, "blargh2");
    session = r.newSession!;
    expect(session.tries).toBe(2);

    // Try 3 — escalation
    r = await processMessage(session, "blargh3");
    expect(r.newSession).toBeNull();
    expect(r.setTags).toContain("bot:atendente");
    const text = replyText(r);
    expect(text).toMatch(/tentei|humano|atendente/i);
  });
});

describe("Bot — Edge Cases", () => {
  test("empty message returns empty replies", async () => {
    const { processMessage } = setupBot();
    const result = await processMessage(null, "");
    expect(result.replies.length).toBe(0);
  });

  test("whitespace message returns empty replies", async () => {
    const { processMessage } = setupBot();
    const result = await processMessage(null, "   ");
    expect(result.replies.length).toBe(0);
  });

  test("session with undefined/null state defaults to start", async () => {
    const { processMessage } = setupBot();
    const result = await processMessage({ state: "", tries: 0, entities: {}, contact: { id: "" } }, "oi");
    expect(result.newSession).toBeDefined();
  });

  test("cancel appointment from view appointments", async () => {
    const { processMessage, store } = setupBot();

    // Setup
    await store.createCustomer({
      id: "11999999999",
      name: "Maria",
      isAdmin: false,
      address: "Rua A",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await store.createEquipment({
      id: "eq-1",
      customerId: "11999999999",
      model: "Soft Slim",
      serialNumber: "SS-001",
      installDate: new Date(),
      lastMaintenance: null,
      nextMaintenance: null,
      notes: "",
      createdAt: new Date(),
    });

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const yyyy = tomorrow.getFullYear();
    const mm = String(tomorrow.getMonth() + 1).padStart(2, "0");
    const dd = String(tomorrow.getDate()).padStart(2, "0");
    const tomorrowStr = `${yyyy}-${mm}-${dd}`;

    await store.createAppointment({
      id: "app-to-cancel",
      customerId: "11999999999",
      equipmentId: "eq-1",
      date: tomorrowStr,
      timeSlot: "10:00",
      status: "scheduled",
      notes: "",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Login and view appointments
    let result = await processMessage(null, "11999999999");
    let session = result.newSession!;

    result = await processMessage(session, "ver_agendamentos");
    expect(result.newSession?.state).toBe("view_appointments");
    session = result.newSession!;

    // Cancel by index (1)
    result = await processMessage(session, "1");
    expect(result.newSession?.state).toBe("customer_menu");

    const app = await store.getAppointment("app-to-cancel");
    expect(app?.status).toBe("cancelled");
  });
});

describe("Bot — Message Format", () => {
  test("replies include interactive messages with buttons", async () => {
    const { processMessage } = setupBot();
    const result = await processMessage(null, "11999999999");

    const interactive = findInteractive(result);
    expect(interactive).toBeDefined();
    expect(interactive.interactive).toBeDefined();
  });
});
