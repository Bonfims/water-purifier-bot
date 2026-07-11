// ═══════════════════════════════════════════════════════════════════
// In-Memory Storage Adapter — Zero dependencies, fully functional
// ═══════════════════════════════════════════════════════════════════

import type { DataStore, SessionStore } from "../core/ports";
import type {
  Customer,
  Equipment,
  Appointment,
  BotSession,
} from "../core/entities";

// ═══════════════════════════════════════════════════════════════════
// In-Memory Session Store
// ═══════════════════════════════════════════════════════════════════

export function createMemorySessionStore(): SessionStore {
  const store = new Map<string, BotSession>();
  const timers = new Map<string, Timer>();

  return {
    async connect() {
      console.log("[session] using in-memory store");
    },
    async get(conversationId: string) {
      return store.get(conversationId) || null;
    },
    async set(conversationId: string, session: BotSession, ttlSeconds: number) {
      store.set(conversationId, session);
      if (timers.has(conversationId)) {
        clearTimeout(timers.get(conversationId));
      }
      timers.set(
        conversationId,
        setTimeout(() => store.delete(conversationId), ttlSeconds * 1000)
      );
    },
    async del(conversationId: string) {
      store.delete(conversationId);
      if (timers.has(conversationId)) {
        clearTimeout(timers.get(conversationId));
        timers.delete(conversationId);
      }
    },
  };
}

// ═══════════════════════════════════════════════════════════════════
// In-Memory Data Store
// ═══════════════════════════════════════════════════════════════════

export function createMemoryDataStore(): DataStore {
  const customers = new Map<string, Customer>();
  const equipment = new Map<string, Equipment>();
  const appointments = new Map<string, Appointment>();

  return {
    async connect() {
      console.log("[data] using in-memory store");
    },

    // Customers
    async getCustomer(phone: string) {
      return customers.get(phone) || null;
    },
    async createCustomer(customer: Customer) {
      customers.set(customer.id, customer);
      return customer;
    },
    async updateCustomer(phone: string, data: Partial<Customer>) {
      const existing = customers.get(phone);
      if (!existing) throw new Error(`Customer ${phone} not found`);
      const updated = { ...existing, ...data, updatedAt: new Date() };
      customers.set(phone, updated);
      return updated;
    },

    // Equipment
    async getEquipment(id: string) {
      return equipment.get(id) || null;
    },
    async listEquipmentByCustomer(customerId: string) {
      return [...equipment.values()].filter((e) => e.customerId === customerId);
    },
    async createEquipment(eq: Equipment) {
      equipment.set(eq.id, eq);
      return eq;
    },
    async updateEquipment(id: string, data: Partial<Equipment>) {
      const existing = equipment.get(id);
      if (!existing) throw new Error(`Equipment ${id} not found`);
      const updated = { ...existing, ...data };
      equipment.set(id, updated);
      return updated;
    },

    // Appointments
    async getAppointment(id: string) {
      return appointments.get(id) || null;
    },
    async listAppointmentsByCustomer(customerId: string) {
      return [...appointments.values()]
        .filter((a) => a.customerId === customerId)
        .sort((a, b) => b.date.localeCompare(a.date));
    },
    async listAppointmentsByDate(date: string) {
      return [...appointments.values()]
        .filter((a) => a.date === date)
        .sort((a, b) => a.timeSlot.localeCompare(b.timeSlot));
    },
    async listAppointmentsByDateRange(from: string, to: string) {
      return [...appointments.values()]
        .filter((a) => a.date >= from && a.date <= to)
        .sort((a, b) => a.date.localeCompare(b.date));
    },
    async createAppointment(app: Appointment) {
      appointments.set(app.id, app);
      return app;
    },
    async updateAppointment(id: string, data: Partial<Appointment>) {
      const existing = appointments.get(id);
      if (!existing) throw new Error(`Appointment ${id} not found`);
      const updated = { ...existing, ...data };
      appointments.set(id, updated);
      return updated;
    },
    async getAppointmentsForTimeSlot(date: string, timeSlot: string) {
      return [...appointments.values()].filter(
        (a) => a.date === date && a.timeSlot === timeSlot
      );
    },
  };
}
