// ═══════════════════════════════════════════════════════════════════
// Domain Entities — Water Purifier Maintenance Scheduling
// ═══════════════════════════════════════════════════════════════════

/** A registered customer */
export interface Customer {
  id: string; // phone number (PK)
  name: string;
  isAdmin: boolean;
  address: string;
  createdAt: Date;
  updatedAt: Date;
}

/** A water purifier equipment registered to a customer */
export interface Equipment {
  id: string; // uuid
  customerId: string;
  model: string; // e.g. "IbbL FR600", "Soft Slim"
  serialNumber: string;
  installDate: Date;
  lastMaintenance: Date | null;
  nextMaintenance: Date | null;
  notes: string;
  createdAt: Date;
}

/** A maintenance appointment */
export interface Appointment {
  id: string; // uuid
  customerId: string;
  equipmentId: string;
  date: string; // YYYY-MM-DD
  timeSlot: string; // e.g. "08:00", "10:00", "14:00"
  status: "scheduled" | "confirmed" | "in_progress" | "completed" | "cancelled";
  notes: string;
  createdAt: Date;
  updatedAt: Date;
}

/** Time slots available for appointments */
export const TIME_SLOTS = [
  "08:00",
  "09:00",
  "10:00",
  "11:00",
  "14:00",
  "15:00",
  "16:00",
  "17:00",
] as const;

export type TimeSlot = (typeof TIME_SLOTS)[number];

/** Models of water purifiers we support */
export const PURIFIER_MODELS = [
  "IbbL FR600",
  "IbbL FR800",
  "Soft Slim",
  "Soft Slim Plus",
  "IbbL Flex",
  "IbbL Compact",
] as const;

/** Session state (stateless — passed to processMessage, returned as newSession) */
export interface BotSession {
  state: string;
  tries: number;
  entities: Record<string, string>;
  contact: {
    id: string; // phone
    name?: string;
    phone?: string;
  };
}

/** The result of processing a message */
export interface ProcessResult {
  replies: ReplyItem[];
  newSession: BotSession | null;
  setTags: string[];
  removeTags: string[];
}

/** A reply item — either plain text or interactive message */
export type ReplyItem =
  | string
  | { text: string; interactive?: InteractiveMessage };

/** Interactive message (WhatsApp buttons or list) */
export interface InteractiveMessage {
  type?: "button" | "list";
  header?: { type: "text"; text: string };
  body: string;
  footer?: string;
  buttons?: ButtonItem[];
}

export interface ButtonItem {
  id: string;
  title: string;
}

/** Date options helper */
export interface DateOption {
  key: string;
  label: string;
}
