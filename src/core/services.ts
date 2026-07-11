// ═══════════════════════════════════════════════════════════════════
// Domain Services — Pure business logic (no I/O)
// ═══════════════════════════════════════════════════════════════════

import type { DataStore } from "./ports";
import type { Customer, Equipment, Appointment } from "./entities";
import { TIME_SLOTS } from "./entities";

// ═══════════════════════════════════════════════════════════════════
// Scheduling Service
// ═══════════════════════════════════════════════════════════════════

export class SchedulingService {
  constructor(private store: DataStore) {}

  /** Get available time slots for a given date */
  async getAvailableSlots(date: string): Promise<string[]> {
    const allSlots = [...TIME_SLOTS];
    const taken: string[] = [];

    for (const slot of allSlots) {
      const apps = await this.store.getAppointmentsForTimeSlot(date, slot);
      // Allow up to 2 appointments per slot (2 technicians)
      const active = apps.filter(
        (a) => a.status !== "cancelled"
      );
      if (active.length >= 2) {
        taken.push(slot);
      }
    }

    return allSlots.filter((s) => !taken.includes(s));
  }

  /** Check if a customer already has an appointment on a given date */
  async hasAppointmentOnDate(
    customerId: string,
    date: string
  ): Promise<Appointment | null> {
    const apps = await this.store.listAppointmentsByCustomer(customerId);
    return (
      apps.find(
        (a) => a.date === date && a.status !== "cancelled"
      ) || null
    );
  }

  /** Schedule a new appointment */
  async schedule(
    customerId: string,
    equipmentId: string,
    date: string,
    timeSlot: string,
    notes: string = ""
  ): Promise<{ success: boolean; appointment?: Appointment; error?: string }> {
    // Validate time slot
    if (!TIME_SLOTS.includes(timeSlot as any)) {
      return { success: false, error: "Horário inválido." };
    }

    // Validate equipment belongs to customer
    const equipment = await this.store.getEquipment(equipmentId);
    if (!equipment || equipment.customerId !== customerId) {
      return {
        success: false,
        error: "Equipamento não encontrado para este cliente.",
      };
    }

    // Check duplicate
    const existing = await this.hasAppointmentOnDate(customerId, date);
    if (existing) {
      return {
        success: false,
        error: `Você já possui um agendamento para ${date} às ${existing.timeSlot}. Cancele ou remarque primeiro.`,
      };
    }

    // Check availability
    const available = await this.getAvailableSlots(date);
    if (!available.includes(timeSlot)) {
      return {
        success: false,
        error: `O horário ${timeSlot} não está disponível para ${date}. Horários disponíveis: ${available.join(", ")}`,
      };
    }

    const appointment: Appointment = {
      id: crypto.randomUUID(),
      customerId,
      equipmentId,
      date,
      timeSlot,
      status: "scheduled",
      notes,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const created = await this.store.createAppointment(appointment);
    return { success: true, appointment: created };
  }

  /** Confirm an existing appointment */
  async confirm(
    appointmentId: string,
    customerId: string
  ): Promise<{ success: boolean; error?: string }> {
    const app = await this.store.getAppointment(appointmentId);
    if (!app) {
      return { success: false, error: "Agendamento não encontrado." };
    }
    if (app.customerId !== customerId) {
      return {
        success: false,
        error: "Este agendamento não pertence a você.",
      };
    }
    if (app.status === "cancelled") {
      return {
        success: false,
        error: "Este agendamento já foi cancelado.",
      };
    }
    await this.store.updateAppointment(appointmentId, {
      status: "confirmed",
      updatedAt: new Date(),
    });
    return { success: true };
  }

  /** Cancel an appointment */
  async cancel(
    appointmentId: string,
    customerId: string
  ): Promise<{ success: boolean; error?: string }> {
    const app = await this.store.getAppointment(appointmentId);
    if (!app) {
      return { success: false, error: "Agendamento não encontrado." };
    }
    if (app.customerId !== customerId) {
      return {
        success: false,
        error: "Este agendamento não pertence a você.",
      };
    }
    if (app.status === "completed") {
      return {
        success: false,
        error: "Não é possível cancelar um agendamento já concluído.",
      };
    }
    await this.store.updateAppointment(appointmentId, {
      status: "cancelled",
      updatedAt: new Date(),
    });
    return { success: true };
  }

  /** Reschedule an appointment (admin action) */
  async reschedule(
    appointmentId: string,
    newDate: string,
    newTimeSlot: string
  ): Promise<{ success: boolean; appointment?: Appointment; error?: string }> {
    const app = await this.store.getAppointment(appointmentId);
    if (!app) {
      return { success: false, error: "Agendamento não encontrado." };
    }
    if (app.status === "completed" || app.status === "cancelled") {
      return {
        success: false,
        error: "Só é possível remarcar agendamentos ativos.",
      };
    }

    if (!TIME_SLOTS.includes(newTimeSlot as any)) {
      return { success: false, error: "Horário inválido." };
    }

    const available = await this.getAvailableSlots(newDate);
    if (!available.includes(newTimeSlot)) {
      return {
        success: false,
        error: `Horário ${newTimeSlot} indisponível para ${newDate}.`,
      };
    }

    const updated = await this.store.updateAppointment(appointmentId, {
      date: newDate,
      timeSlot: newTimeSlot,
      updatedAt: new Date(),
    });

    return { success: true, appointment: updated };
  }

  /** List today's appointments */
  async getTodayAppointments(): Promise<Appointment[]> {
    const today = formatDate(new Date());
    return this.store.listAppointmentsByDate(today);
  }

  /** List tomorrow's appointments */
  async getTomorrowAppointments(): Promise<Appointment[]> {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return this.store.listAppointmentsByDate(formatDate(tomorrow));
  }

  /** List all upcoming appointments for a customer */
  async getCustomerUpcomingAppointments(
    customerId: string
  ): Promise<Appointment[]> {
    const all = await this.store.listAppointmentsByCustomer(customerId);
    const today = formatDate(new Date());
    return all
      .filter(
        (a) =>
          a.date >= today &&
          a.status !== "cancelled" &&
          a.status !== "completed"
      )
      .sort((a, b) => a.date.localeCompare(b.date));
  }
}

// ═══════════════════════════════════════════════════════════════════
// Customer Service
// ═══════════════════════════════════════════════════════════════════

export class CustomerService {
  constructor(
    private store: DataStore,
    private adminPhones: string[]
  ) {}

  /** Find or register a customer */
  async findOrCreate(
    phone: string,
    name?: string
  ): Promise<Customer> {
    let customer = await this.store.getCustomer(phone);
    if (customer) {
      if (name && customer.name !== name) {
        customer = await this.store.updateCustomer(phone, { name });
      }
      return customer;
    }

    const isAdmin = this.adminPhones.includes(phone);
    const newCustomer: Customer = {
      id: phone,
      name: name || `Cliente ${phone.slice(-4)}`,
      isAdmin,
      address: "",
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    return this.store.createCustomer(newCustomer);
  }

  /** Check if a phone number is an admin */
  isAdminPhone(phone: string): boolean {
    return this.adminPhones.includes(phone);
  }

  /** Get customer's equipment list */
  async getCustomerEquipment(customerId: string): Promise<Equipment[]> {
    return this.store.listEquipmentByCustomer(customerId);
  }

  /** Register new equipment for a customer */
  async registerEquipment(
    customerId: string,
    model: string,
    serialNumber: string,
    installDate?: Date,
    notes?: string
  ): Promise<Equipment> {
    const equipment: Equipment = {
      id: crypto.randomUUID(),
      customerId,
      model,
      serialNumber,
      installDate: installDate || new Date(),
      lastMaintenance: null,
      nextMaintenance: null,
      notes: notes || "",
      createdAt: new Date(),
    };

    return this.store.createEquipment(equipment);
  }

  /** List all customers (admin) */
  async listAll(): Promise<Customer[]> {
    // DataStore doesn't have listAll, we work with what we have
    // For now, return empty — admin features work through direct phone lookup
    return [];
  }
}

// ═══════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════

export function formatDate(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export function formatDateBR(dateStr: string): string {
  const [y, m, d] = dateStr.split("-");
  return `${d}/${m}/${y}`;
}

export function dateOptions(): {
  hoje: { key: string; label: string };
  amanha: { key: string; label: string };
  depois: { key: string; label: string };
} {
  const dias = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
  const fmt = (d: Date) => {
    const ds = dias[d.getDay()];
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    return {
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${dd}`,
      label: `${ds} (${dd}/${mm})`,
    };
  };
  const hoje = new Date();
  const amanha = new Date(hoje);
  amanha.setDate(amanha.getDate() + 1);
  const depois = new Date(hoje);
  depois.setDate(depois.getDate() + 2);
  return { hoje: fmt(hoje), amanha: fmt(amanha), depois: fmt(depois) };
}

export function generateNextDates(count: number): { key: string; label: string }[] {
  const dias = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
  const result: { key: string; label: string }[] = [];
  const base = new Date();
  // Skip today, start from tomorrow
  base.setDate(base.getDate() + 1);

  for (let i = 0; i < count; i++) {
    const d = new Date(base);
    d.setDate(d.getDate() + i);
    const ds = dias[d.getDay()];
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const yyyy = d.getFullYear();
    result.push({
      key: `${yyyy}-${String(d.getMonth() + 1).padStart(2, "0")}-${dd}`,
      label: `${ds} (${dd}/${mm})`,
    });
  }
  return result;
}
