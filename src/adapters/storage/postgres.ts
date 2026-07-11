// ═══════════════════════════════════════════════════════════════════
// Postgres Data Store Adapter — Production persistence
// ═══════════════════════════════════════════════════════════════════

import type { DataStore } from "../core/ports";
import type { Customer, Equipment, Appointment } from "../core/entities";

interface PostgresPool {
  query: (sql: string, params?: any[]) => Promise<{ rows: any[] }>;
}

function createPool(databaseUrl: string): PostgresPool {
  // Dynamic import — only loads postgres when used
  const sql = databaseUrl;

  return {
    async query(queryStr: string, params?: any[]) {
      // Use Bun's native SQL or fallback to postgres.js
      try {
        // @ts-ignore — Bun native
        if (typeof Bun !== "undefined" && (Bun as any).sql) {
          const result = await (Bun as any).sql(queryStr, params);
          return { rows: result };
        }
      } catch {}

      // Fallback to postgres.js
      const postgres = await import("postgres");
      const client = postgres.default(sql);
      try {
        const result = await client.unsafe(queryStr, params as any[]);
        return { rows: result };
      } finally {
        await client.end();
      }
    },
  };
}

export async function createPostgresDataStore(
  databaseUrl: string
): Promise<DataStore> {
  const pool = createPool(databaseUrl);

  // Auto-migrate on connect
  async function migrate() {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS customers (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        is_admin BOOLEAN DEFAULT FALSE,
        address TEXT DEFAULT '',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS equipment (
        id TEXT PRIMARY KEY,
        customer_id TEXT NOT NULL REFERENCES customers(id),
        model TEXT NOT NULL,
        serial_number TEXT NOT NULL,
        install_date TIMESTAMPTZ DEFAULT NOW(),
        last_maintenance TIMESTAMPTZ,
        next_maintenance TIMESTAMPTZ,
        notes TEXT DEFAULT '',
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS appointments (
        id TEXT PRIMARY KEY,
        customer_id TEXT NOT NULL REFERENCES customers(id),
        equipment_id TEXT NOT NULL REFERENCES equipment(id),
        date TEXT NOT NULL,
        time_slot TEXT NOT NULL,
        status TEXT DEFAULT 'scheduled',
        notes TEXT DEFAULT '',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_appointments_date ON appointments(date)
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_appointments_customer ON appointments(customer_id)
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_appointments_date_slot ON appointments(date, time_slot)
    `);
  }

  function rowToCustomer(row: any): Customer {
    return {
      id: row.id,
      name: row.name,
      isAdmin: row.is_admin,
      address: row.address || "",
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  function rowToEquipment(row: any): Equipment {
    return {
      id: row.id,
      customerId: row.customer_id,
      model: row.model,
      serialNumber: row.serial_number,
      installDate: new Date(row.install_date),
      lastMaintenance: row.last_maintenance
        ? new Date(row.last_maintenance)
        : null,
      nextMaintenance: row.next_maintenance
        ? new Date(row.next_maintenance)
        : null,
      notes: row.notes || "",
      createdAt: new Date(row.created_at),
    };
  }

  function rowToAppointment(row: any): Appointment {
    return {
      id: row.id,
      customerId: row.customer_id,
      equipmentId: row.equipment_id,
      date: row.date,
      timeSlot: row.time_slot,
      status: row.status,
      notes: row.notes || "",
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  return {
    async connect() {
      console.log("[data] using postgres store");
      await migrate();
      console.log("[data] migrations complete");
    },

    // Customers
    async getCustomer(phone: string) {
      const { rows } = await pool.query(
        "SELECT * FROM customers WHERE id = $1",
        [phone]
      );
      return rows[0] ? rowToCustomer(rows[0]) : null;
    },
    async createCustomer(customer: Customer) {
      const { rows } = await pool.query(
        `INSERT INTO customers (id, name, is_admin, address, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [
          customer.id,
          customer.name,
          customer.isAdmin,
          customer.address,
          customer.createdAt,
          customer.updatedAt,
        ]
      );
      return rowToCustomer(rows[0]);
    },
    async updateCustomer(phone: string, data: Partial<Customer>) {
      const sets: string[] = [];
      const params: any[] = [phone];
      let idx = 2;
      if (data.name !== undefined) {
        sets.push(`name = $${idx++}`);
        params.push(data.name);
      }
      if (data.isAdmin !== undefined) {
        sets.push(`is_admin = $${idx++}`);
        params.push(data.isAdmin);
      }
      if (data.address !== undefined) {
        sets.push(`address = $${idx++}`);
        params.push(data.address);
      }
      sets.push(`updated_at = NOW()`);
      const { rows } = await pool.query(
        `UPDATE customers SET ${sets.join(", ")} WHERE id = $1 RETURNING *`,
        params
      );
      return rowToCustomer(rows[0]);
    },

    // Equipment
    async getEquipment(id: string) {
      const { rows } = await pool.query(
        "SELECT * FROM equipment WHERE id = $1",
        [id]
      );
      return rows[0] ? rowToEquipment(rows[0]) : null;
    },
    async listEquipmentByCustomer(customerId: string) {
      const { rows } = await pool.query(
        "SELECT * FROM equipment WHERE customer_id = $1 ORDER BY created_at",
        [customerId]
      );
      return rows.map(rowToEquipment);
    },
    async createEquipment(eq: Equipment) {
      const { rows } = await pool.query(
        `INSERT INTO equipment (id, customer_id, model, serial_number, install_date, last_maintenance, next_maintenance, notes, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
        [
          eq.id,
          eq.customerId,
          eq.model,
          eq.serialNumber,
          eq.installDate,
          eq.lastMaintenance,
          eq.nextMaintenance,
          eq.notes,
          eq.createdAt,
        ]
      );
      return rowToEquipment(rows[0]);
    },
    async updateEquipment(id: string, data: Partial<Equipment>) {
      const sets: string[] = [];
      const params: any[] = [id];
      let idx = 2;
      if (data.model !== undefined) {
        sets.push(`model = $${idx++}`);
        params.push(data.model);
      }
      if (data.lastMaintenance !== undefined) {
        sets.push(`last_maintenance = $${idx++}`);
        params.push(data.lastMaintenance);
      }
      if (data.nextMaintenance !== undefined) {
        sets.push(`next_maintenance = $${idx++}`);
        params.push(data.nextMaintenance);
      }
      if (data.notes !== undefined) {
        sets.push(`notes = $${idx++}`);
        params.push(data.notes);
      }
      if (sets.length === 0) return (await this.getEquipment(id))!;
      const { rows } = await pool.query(
        `UPDATE equipment SET ${sets.join(", ")} WHERE id = $1 RETURNING *`,
        params
      );
      return rowToEquipment(rows[0]);
    },

    // Appointments
    async getAppointment(id: string) {
      const { rows } = await pool.query(
        "SELECT * FROM appointments WHERE id = $1",
        [id]
      );
      return rows[0] ? rowToAppointment(rows[0]) : null;
    },
    async listAppointmentsByCustomer(customerId: string) {
      const { rows } = await pool.query(
        "SELECT * FROM appointments WHERE customer_id = $1 ORDER BY date DESC, time_slot",
        [customerId]
      );
      return rows.map(rowToAppointment);
    },
    async listAppointmentsByDate(date: string) {
      const { rows } = await pool.query(
        "SELECT * FROM appointments WHERE date = $1 ORDER BY time_slot",
        [date]
      );
      return rows.map(rowToAppointment);
    },
    async listAppointmentsByDateRange(from: string, to: string) {
      const { rows } = await pool.query(
        "SELECT * FROM appointments WHERE date >= $1 AND date <= $2 ORDER BY date, time_slot",
        [from, to]
      );
      return rows.map(rowToAppointment);
    },
    async createAppointment(app: Appointment) {
      const { rows } = await pool.query(
        `INSERT INTO appointments (id, customer_id, equipment_id, date, time_slot, status, notes, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
        [
          app.id,
          app.customerId,
          app.equipmentId,
          app.date,
          app.timeSlot,
          app.status,
          app.notes,
          app.createdAt,
          app.updatedAt,
        ]
      );
      return rowToAppointment(rows[0]);
    },
    async updateAppointment(id: string, data: Partial<Appointment>) {
      const sets: string[] = [];
      const params: any[] = [id];
      let idx = 2;
      if (data.date !== undefined) {
        sets.push(`date = $${idx++}`);
        params.push(data.date);
      }
      if (data.timeSlot !== undefined) {
        sets.push(`time_slot = $${idx++}`);
        params.push(data.timeSlot);
      }
      if (data.status !== undefined) {
        sets.push(`status = $${idx++}`);
        params.push(data.status);
      }
      if (data.notes !== undefined) {
        sets.push(`notes = $${idx++}`);
        params.push(data.notes);
      }
      sets.push(`updated_at = NOW()`);
      const { rows } = await pool.query(
        `UPDATE appointments SET ${sets.join(", ")} WHERE id = $1 RETURNING *`,
        params
      );
      return rowToAppointment(rows[0]);
    },
    async getAppointmentsForTimeSlot(date: string, timeSlot: string) {
      const { rows } = await pool.query(
        "SELECT * FROM appointments WHERE date = $1 AND time_slot = $2 AND status != 'cancelled'",
        [date, timeSlot]
      );
      return rows.map(rowToAppointment);
    },
  };
}
