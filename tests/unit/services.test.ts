// ═══════════════════════════════════════════════════════════════════
// Domain Services Unit Tests
// ═══════════════════════════════════════════════════════════════════

import { describe, expect, test, beforeEach } from "bun:test";
import { CustomerService, SchedulingService, formatDate, formatDateBR, dateOptions } from "../../src/core/services";
import { createMemoryDataStore } from "../../src/adapters/storage/memory";
import type { DataStore } from "../../src/core/ports";

describe("CustomerService", () => {
  let store: DataStore;
  let service: CustomerService;

  beforeEach(() => {
    store = createMemoryDataStore();
    service = new CustomerService(store, ["11988888888"]);
  });

  test("findOrCreate creates a new customer", async () => {
    const customer = await service.findOrCreate("11999999999", "Maria");
    expect(customer.id).toBe("11999999999");
    expect(customer.name).toBe("Maria");
    expect(customer.isAdmin).toBe(false);
  });

  test("findOrCreate returns existing customer", async () => {
    await store.createCustomer({
      id: "11999999999",
      name: "João",
      isAdmin: false,
      address: "Rua A",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const customer = await service.findOrCreate("11999999999");
    expect(customer.name).toBe("João");
  });

  test("findOrCreate updates name if different", async () => {
    await store.createCustomer({
      id: "11999999999",
      name: "João",
      isAdmin: false,
      address: "",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const customer = await service.findOrCreate("11999999999", "João Silva");
    expect(customer.name).toBe("João Silva");
  });

  test("isAdminPhone checks admin list", () => {
    expect(service.isAdminPhone("11988888888")).toBe(true);
    expect(service.isAdminPhone("11999999999")).toBe(false);
  });

  test("admins are automatically flagged on creation", async () => {
    const customer = await service.findOrCreate("11988888888", "Admin");
    expect(customer.isAdmin).toBe(true);
  });

  test("registerEquipment creates equipment for customer", async () => {
    await service.findOrCreate("11999999999", "Maria");
    const eq = await service.registerEquipment(
      "11999999999",
      "Soft Slim",
      "SS-2024-001",
      new Date("2024-06-01"),
      "Instalado na cozinha"
    );

    expect(eq.customerId).toBe("11999999999");
    expect(eq.model).toBe("Soft Slim");
    expect(eq.serialNumber).toBe("SS-2024-001");
    expect(eq.notes).toBe("Instalado na cozinha");
  });

  test("getCustomerEquipment returns equipment list", async () => {
    await service.findOrCreate("11999999999", "Maria");
    await service.registerEquipment("11999999999", "Soft Slim", "SS-001");
    await service.registerEquipment("11999999999", "IbbL FR600", "FR-002");

    const equip = await service.getCustomerEquipment("11999999999");
    expect(equip.length).toBe(2);
  });
});

describe("SchedulingService", () => {
  let store: DataStore;
  let service: SchedulingService;

  beforeEach(() => {
    store = createMemoryDataStore();
    service = new SchedulingService(store);
  });

  async function setupCustomerAndEquipment() {
    const phone = "11999999999";
    await store.createCustomer({
      id: phone,
      name: "Maria",
      isAdmin: false,
      address: "Rua A, 123",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const eq = await store.createEquipment({
      id: "eq-001",
      customerId: phone,
      model: "Soft Slim",
      serialNumber: "SS-001",
      installDate: new Date("2024-01-01"),
      lastMaintenance: null,
      nextMaintenance: null,
      notes: "",
      createdAt: new Date(),
    });

    return { phone, equipmentId: eq.id };
  }

  test("getAvailableSlots returns all slots when nothing is booked", async () => {
    const today = formatDate(new Date());
    const slots = await service.getAvailableSlots(today);
    expect(slots.length).toBe(8); // All TIME_SLOTS
  });

  test("schedule creates an appointment successfully", async () => {
    const { phone, equipmentId } = await setupCustomerAndEquipment();
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const date = formatDate(tomorrow);

    const result = await service.schedule(phone, equipmentId, date, "10:00");
    expect(result.success).toBe(true);
    expect(result.appointment).toBeDefined();
    expect(result.appointment?.status).toBe("scheduled");
    expect(result.appointment?.timeSlot).toBe("10:00");
  });

  test("schedule rejects invalid time slot", async () => {
    const { phone, equipmentId } = await setupCustomerAndEquipment();
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const date = formatDate(tomorrow);

    const result = await service.schedule(phone, equipmentId, date, "13:00");
    expect(result.success).toBe(false);
    expect(result.error).toContain("Horário inválido");
  });

  test("schedule rejects equipment not belonging to customer", async () => {
    const { phone } = await setupCustomerAndEquipment();
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);

    const result = await service.schedule(phone, "non-existent", formatDate(tomorrow), "10:00");
    expect(result.success).toBe(false);
  });

  test("confirm sets status to confirmed", async () => {
    const { phone, equipmentId } = await setupCustomerAndEquipment();
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const date = formatDate(tomorrow);

    const schedule = await service.schedule(phone, equipmentId, date, "14:00");
    expect(schedule.success).toBe(true);

    const result = await service.confirm(schedule.appointment!.id, phone);
    expect(result.success).toBe(true);

    const app = await store.getAppointment(schedule.appointment!.id);
    expect(app?.status).toBe("confirmed");
  });

  test("cancel sets status to cancelled", async () => {
    const { phone, equipmentId } = await setupCustomerAndEquipment();
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const date = formatDate(tomorrow);

    const schedule = await service.schedule(phone, equipmentId, date, "16:00");
    expect(schedule.success).toBe(true);

    const result = await service.cancel(schedule.appointment!.id, phone);
    expect(result.success).toBe(true);

    const app = await store.getAppointment(schedule.appointment!.id);
    expect(app?.status).toBe("cancelled");
  });

  test("cancel rejects wrong customer", async () => {
    const { phone, equipmentId } = await setupCustomerAndEquipment();
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const date = formatDate(tomorrow);

    const schedule = await service.schedule(phone, equipmentId, date, "16:00");
    const result = await service.cancel(schedule.appointment!.id, "11900000000");
    expect(result.success).toBe(false);
  });

  test("reschedule changes date and time", async () => {
    const { phone, equipmentId } = await setupCustomerAndEquipment();
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dayAfter = new Date(tomorrow);
    dayAfter.setDate(dayAfter.getDate() + 1);

    const schedule = await service.schedule(phone, equipmentId, formatDate(tomorrow), "09:00");
    expect(schedule.success).toBe(true);

    const result = await service.reschedule(
      schedule.appointment!.id,
      formatDate(dayAfter),
      "15:00"
    );
    expect(result.success).toBe(true);
    expect(result.appointment?.date).toBe(formatDate(dayAfter));
    expect(result.appointment?.timeSlot).toBe("15:00");
  });

  test("getCustomerUpcomingAppointments returns only future", async () => {
    const { phone, equipmentId } = await setupCustomerAndEquipment();
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);

    await store.createAppointment({
      id: "past-1",
      customerId: phone,
      equipmentId,
      date: formatDate(yesterday),
      timeSlot: "10:00",
      status: "completed",
      notes: "",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const schedule = await service.schedule(phone, equipmentId, formatDate(tomorrow), "11:00");
    expect(schedule.success).toBe(true);

    const upcoming = await service.getCustomerUpcomingAppointments(phone);
    expect(upcoming.length).toBe(1);
    expect(upcoming[0].date).toBe(formatDate(tomorrow));
  });
});

describe("Date Helpers", () => {
  test("formatDate returns YYYY-MM-DD", () => {
    const d = new Date("2024-06-15T12:00:00");
    expect(formatDate(d)).toBe("2024-06-15");
  });

  test("formatDateBR converts to DD/MM/YYYY", () => {
    expect(formatDateBR("2024-06-15")).toBe("15/06/2024");
  });

  test("dateOptions returns today, tomorrow, day after", () => {
    const opts = dateOptions();
    expect(opts.hoje).toBeDefined();
    expect(opts.amanha).toBeDefined();
    expect(opts.depois).toBeDefined();
    expect(opts.hoje.key).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
