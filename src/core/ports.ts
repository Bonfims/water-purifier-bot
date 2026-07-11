// ═══════════════════════════════════════════════════════════════════
// Ports — Storage abstractions (hexagonal architecture)
// ═══════════════════════════════════════════════════════════════════

import type { Customer, Equipment, Appointment, BotSession } from "./entities";

/** Session storage (ephemeral — TTL-based) */
export interface SessionStore {
  connect(): Promise<void>;
  get(conversationId: string): Promise<BotSession | null>;
  set(conversationId: string, session: BotSession, ttlSeconds: number): Promise<void>;
  del(conversationId: string): Promise<void>;
}

/** Persistent storage for customers, equipment, appointments */
export interface DataStore {
  connect(): Promise<void>;

  // Customers
  getCustomer(phone: string): Promise<Customer | null>;
  createCustomer(customer: Customer): Promise<Customer>;
  updateCustomer(phone: string, data: Partial<Customer>): Promise<Customer>;

  // Equipment
  getEquipment(id: string): Promise<Equipment | null>;
  listEquipmentByCustomer(customerId: string): Promise<Equipment[]>;
  createEquipment(equipment: Equipment): Promise<Equipment>;
  updateEquipment(id: string, data: Partial<Equipment>): Promise<Equipment>;

  // Appointments
  getAppointment(id: string): Promise<Appointment | null>;
  listAppointmentsByCustomer(customerId: string): Promise<Appointment[]>;
  listAppointmentsByDate(date: string): Promise<Appointment[]>;
  listAppointmentsByDateRange(from: string, to: string): Promise<Appointment[]>;
  createAppointment(appointment: Appointment): Promise<Appointment>;
  updateAppointment(id: string, data: Partial<Appointment>): Promise<Appointment>;
  getAppointmentsForTimeSlot(date: string, timeSlot: string): Promise<Appointment[]>;
}
