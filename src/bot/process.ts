// ═══════════════════════════════════════════════════════════════════
// Bot Process — Stateless processMessage (the interface contract)
// ═══════════════════════════════════════════════════════════════════

import type { BotSession, ProcessResult, ReplyItem } from "../core/entities";
import type { DataStore } from "../core/ports";
import { CustomerService, SchedulingService, formatDateBR } from "../core/services";
import { createNLUEngine, QUICK_PATTERNS, type NLUEngine } from "./nlu";
import type { LLMClient } from "../adapters/llm/openrouter";
import {
  txt,
  WELCOME,
  WELCOME_RETRY,
  customerMainMenu,
  adminMainMenu,
  equipmentList,
  equipmentSelection,
  dateSelection,
  timeSlotSelection,
  appointmentSummary,
  appointmentConfirmed,
  appointmentsList,
  adminAppointmentsList,
  NEW_EQUIPMENT_MODEL,
  NEW_EQUIPMENT_SERIAL,
  GLOBAL_HELP,
  FALLBACK_RETRY,
  ESCALATION,
  GOODBYE,
} from "./messages";

// ═══════════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════════

const MAX_TRIES = 3;
const SESSION_TTL = 3600; // 1 hour

// ═══════════════════════════════════════════════════════════════════
// Intents Definition
// ═══════════════════════════════════════════════════════════════════

const INTENTS = [
  { name: "saudacao", synonyms: ["oi", "ola", "olá", "bom dia", "boa tarde", "boa noite", "hey", "eae", "iae", "iniciar", "comecar", "começar"] },
  { name: "voltar", synonyms: ["menu", "inicio", "início", "voltar", "home", "principal", "↩"] },
  { name: "cancelar", synonyms: ["cancelar", "cancela", "desmarcar", "desmarca"] },
  { name: "encerrar", synonyms: ["sair", "encerrar", "tchau", "fim", "finalizar", "adeus", "xau"] },
  { name: "atendente", synonyms: ["atendente", "consultor", "humano", "falar com atendente", "falar com humano", "falar com consultor", "falar com alguem", "pessoa", "gente", "operador", "especialista", "transferir", "humana"] },
  { name: "agendar", synonyms: ["agendar", "marcar", "nova manutencao", "manutencao", "manutenção", "manutencão", "marcar manutencao", "marcar visita", "agendar manutencao", "agendar manutenção", "1", "quero agendar", "agendamento"] },
  { name: "ver_equipamentos", synonyms: ["meus equipamentos", "meus purificadores", "ver equipamentos", "aparelhos", "purificadores", "equipamentos", "2", "meus aparelhos", "quais equipamentos", "quais purificadores"] },
  { name: "ver_agendamentos", synonyms: ["meus agendamentos", "ver agendamentos", "consultas", "marcados", "marcadas", "minhas manutencoes", "3", "minhas manutenções", "agendamentos"] },
  { name: "sim", synonyms: ["sim", "s", "yes", "confirmo", "confirmar", "ok", "quero", "claro", "bora", "vamos", "pode ser", "✅", "confirmado"] },
  { name: "nao", synonyms: ["nao", "não", "n", "no", "❌", "agora nao", "agora não", "depois", "obrigado"] },
  { name: "ajuda", synonyms: ["ajuda", "help", "comandos", "o que voce faz", "o que vc faz", "como funciona", "duvida", "dúvida", "?"] },
  { name: "admin_menu", synonyms: ["admin", "painel", "administrativo", "gestao", "gestão", "administrador"] },
  { name: "remarcar", synonyms: ["remarcar", "reagendar", "mudar horario", "mudar data", "trocar data", "trocar horário", "trocar horario", "alterar data", "alterar horario"] },
  { name: "admin_agenda_hoje", synonyms: ["hoje", "agenda hoje", "agendamentos hoje", "dia de hoje"] },
  { name: "admin_agenda_amanha", synonyms: ["amanha", "amanhã", "agenda amanha", "agenda amanhã", "agendamentos amanha"] },
  { name: "admin_buscar_cliente", synonyms: ["buscar cliente", "procurar cliente", "achar cliente", "cliente", "buscar"] },
  { name: "menu_cliente", synonyms: ["menu cliente", "cliente", "voltar cliente", "area cliente"] },
  { name: "admin_cancelar", synonyms: ["admin cancelar", "cancelar admin", "cancelar agendamento admin"] },
  { name: "confirmar", synonyms: ["confirmar", "confirmar agendamento", "confirmo agendamento"] },
  { name: "cancelar_agendamento", synonyms: ["cancelar agendamento", "cancelar marcacao", "desmarcar agendamento", "cancelar manutencao"] },
  { name: "equipamento_info", synonyms: ["info equipamento", "detalhes equipamento", "sobre equipamento"] },
  { name: "sair_demo", synonyms: ["sair da demo", "sair demo", "encerrar demo", "voltar pro bot", "voltar para o bot", "bot principal", "bot padrao", "menu principal", "voltar menu principal"] },
];

// ═══════════════════════════════════════════════════════════════════
// Quick Intent Detection (regex, before NLU)
// ═══════════════════════════════════════════════════════════════════

function quickDetect(text: string): string | null {
  const lower = text.toLowerCase().trim();
  for (const [pattern, intent] of QUICK_PATTERNS) {
    if (pattern.test(lower)) return intent;
  }
  // Button ID matches
  if (/^(eq_|date_|slot_|model_)/.test(lower)) return lower; // passthrough
  return null;
}

// ═══════════════════════════════════════════════════════════════════
// Global intents lookup
// ═══════════════════════════════════════════════════════════════════

const GLOBALS: Record<string, string> = {
  "cancelar": "cancelar",
  "cancela": "cancelar",
  "voltar": "voltar",
  "menu": "voltar",
  "inicio": "voltar",
  "início": "voltar",
  "home": "voltar",
  "principal": "voltar",
  "sair": "encerrar",
  "encerrar": "encerrar",
  "tchau": "encerrar",
  "fim": "encerrar",
  "finalizar": "encerrar",
  "adeus": "encerrar",
  "atendente": "atendente",
  "consultor": "atendente",
  "humano": "atendente",
  "falar com atendente": "atendente",
  "falar com consultor": "atendente",
  "falar com humano": "atendente",
  "quero falar com atendente": "atendente",
  "oi": "saudacao",
  "ola": "saudacao",
  "olá": "saudacao",
  "bom dia": "saudacao",
  "boa tarde": "saudacao",
  "boa noite": "saudacao",
  "ajuda": "ajuda",
  "help": "ajuda",
  // Exit demo — volta pro bot principal (nutalk-bot)
  "sair da demo": "sair_demo",
  "sair demo": "sair_demo",
  "sair da demonstracao": "sair_demo",
  "sair demonstracao": "sair_demo",
  "encerrar demo": "sair_demo",
  "encerrar demonstracao": "sair_demo",
  "voltar para o bot": "sair_demo",
  "voltar pro bot": "sair_demo",
  "bot principal": "sair_demo",
  "bot padrao": "sair_demo",
  "bot padrão": "sair_demo",
  "voltar menu principal": "sair_demo",
  "menu principal": "sair_demo",
};

// ═══════════════════════════════════════════════════════════════════
// Default session
// ═══════════════════════════════════════════════════════════════════

export function defaultSession(contact?: { id: string; name?: string; phone?: string }): BotSession {
  return {
    state: "start",
    tries: 0,
    entities: {},
    contact: contact || { id: "", name: "", phone: "" },
  };
}

// ═══════════════════════════════════════════════════════════════════
// Session normalization
// ═══════════════════════════════════════════════════════════════════

function ensure(session: BotSession | null | undefined, contact?: { id: string; name?: string; phone?: string }): BotSession {
  if (!session) return defaultSession(contact);
  if (!session.entities) session.entities = {};
  if (session.tries === undefined) session.tries = 0;
  if (!session.contact) session.contact = contact || { id: "", name: "", phone: "" };
  if (!session.state) session.state = "start";
  return session;
}

// ═══════════════════════════════════════════════════════════════════
// RETRY_STATES — states where retry counting applies
// ═══════════════════════════════════════════════════════════════════

const RETRY_STATES = new Set([
  "main_menu",
  "admin_menu",
  "customer_menu",
  "select_equipment",
  "select_date",
  "select_time",
  "confirm_appointment",
  "new_equipment_model",
  "new_equipment_serial",
]);

// ═══════════════════════════════════════════════════════════════════
// State → Entity mapping
// ═══════════════════════════════════════════════════════════════════

const STATE_ENTITIES: Record<string, string> = {
  "identify": "_phone",
  "new_equipment_model": "_model",
  "new_equipment_serial": "_serial",
  "select_date": "_date",
  "select_time": "_time",
  "human_name": "_humanName",
  "human_reason": "_humanReason",
  "remarcar_select_appointment": "_appointmentId",
  "remarcar_select_date": "_newDate",
  "remarcar_select_time": "_newTime",
  "admin_buscar_cliente_input": "_searchPhone",
};

// ═══════════════════════════════════════════════════════════════════
// Main processMessage
// ═══════════════════════════════════════════════════════════════════

export function createBot(
  store: DataStore,
  adminPhones: string[],
  llm?: LLMClient
) {
  const nlu = createNLUEngine(llm);
  const customerService = new CustomerService(store, adminPhones);
  const schedulingService = new SchedulingService(store);

  async function processMessage(
    session: BotSession | null | undefined,
    text: string
  ): Promise<ProcessResult> {
    const msg = (text || "").trim();

    if (!msg) {
      return {
        replies: [],
        newSession: session || null,
        setTags: [],
        removeTags: [],
      };
    }

    // __START__ signal — auto-identify if contact phone is already known
    if (msg === "__START__") {
      const contactPhone = (session?.contact?.id || "").replace(/\D/g, "");
      if (contactPhone.length >= 10) {
        const contactName = session?.contact?.name || "";
        const customer = await customerService.findOrCreate(contactPhone, contactName || undefined);
        const isAdmin = customer.isAdmin || adminPhones.includes(contactPhone);
        const contact = { id: contactPhone, name: customer.name, phone: contactPhone };
        if (isAdmin) {
          return {
            replies: [txt(`👋 Ola, ${customer.name}!`), ...adminMainMenu(customer.name)],
            newSession: { state: "admin_menu", tries: 0, entities: { _phone: contactPhone }, contact },
            setTags: [], removeTags: [],
          };
        }
        return {
          replies: customerMainMenu(customer.name),
          newSession: { state: "customer_menu", tries: 0, entities: { _phone: contactPhone }, contact },
          setTags: [], removeTags: [],
        };
      }
      return {
        replies: [WELCOME],
        newSession: { state: "identify", tries: 0, entities: {}, contact: session?.contact || { id: "", name: "", phone: "" } },
        setTags: [],
        removeTags: [],
      };
    }

    const s = ensure(session, session?.contact);
    const currentState = s.state || "start";
    const lowerMsg = msg.toLowerCase().trim();

    // ═══════════════════════════════════════════════════════════
    // Step 0: Global intents (work from any state)
    // ═══════════════════════════════════════════════════════════
    const globalIntent = GLOBALS[lowerMsg];

    if (globalIntent === "voltar" || globalIntent === "cancelar") {
      const contact = s.contact;
      const customer = contact.id ? await store.getCustomer(contact.id) : null;
      const isAdmin = customer?.isAdmin || adminPhones.includes(contact.id);

      if (isAdmin) {
        return {
          replies: [txt("Voltando ao painel..."), ...adminMainMenu(customer?.name || contact.name || "Admin")],
          newSession: { state: "admin_menu", tries: 0, entities: {}, contact },
          setTags: [], removeTags: [],
        };
      }
      return {
        replies: [txt("Voltando ao menu..."), ...customerMainMenu(customer?.name || contact.name || "Cliente")],
        newSession: { state: "customer_menu", tries: 0, entities: {}, contact },
        setTags: [], removeTags: [],
      };
    }

    if (globalIntent === "encerrar") {
      return {
        replies: [GOODBYE],
        newSession: null,
        setTags: [], removeTags: [],
      };
    }

    if (globalIntent === "sair_demo") {
      return {
        replies: [
          txt("🔙 Voce esta saindo da demonstracao de purificadores e voltando para o *assistente principal da Nutalk*.\n\nO bot principal pode te ajudar com outras demonstracoes, informacoes sobre a plataforma ou te conectar com um consultor humano."),
          txt("Ate logo! 👋"),
        ],
        newSession: null,
        setTags: [],
        removeTags: ["specialty:water"],
      };
    }

    if (globalIntent === "atendente") {
      return {
        replies: [txt("👋 Claro! Vou te conectar com um atendente. Primeiro, qual o seu nome?")],
        newSession: { state: "human_name", tries: 0, entities: {}, contact: s.contact },
        setTags: [], removeTags: [],
      };
    }

    if (globalIntent === "saudacao") {
      const contact = s.contact;
      const phone = s.entities._phone || contact.id?.replace(/\D/g, "") || "";
      const customer = contact.id ? await store.getCustomer(contact.id) : null;
      if (customer?.isAdmin || adminPhones.includes(contact.id)) {
        return {
          replies: [txt(`👋 Olá, ${customer?.name || contact.name}! Bem-vindo de volta.`), ...adminMainMenu(customer?.name || "")],
          newSession: { state: "admin_menu", tries: 0, entities: { _phone: phone }, contact },
          setTags: [], removeTags: [],
        };
      }
      return {
        replies: customerMainMenu(customer?.name || contact.name || "Cliente"),
        newSession: { state: "customer_menu", tries: 0, entities: { _phone: phone }, contact },
        setTags: [], removeTags: [],
      };
    }

    if (globalIntent === "ajuda") {
      return {
        replies: [GLOBAL_HELP],
        newSession: { ...s, tries: 0 },
        setTags: [], removeTags: [],
      };
    }

    // ═══════════════════════════════════════════════════════════
    // Step 1: Quick intent detection (regex, button IDs)
    // ═══════════════════════════════════════════════════════════
    const quickIntent = quickDetect(msg);
    const buttonMatch = msg.match(/^(eq_|date_|slot_|model_)/);
    const resolvedQuickIntent = buttonMatch ? msg : quickIntent;

    // ═══════════════════════════════════════════════════════════
    // Step 2: State machine
    // ═══════════════════════════════════════════════════════════

    // --- START: Initial identification ---
    if (currentState === "start" || currentState === "identify") {
      return handleIdentify(s, msg);
    }

    // --- CUSTOMER MENU ---
    if (currentState === "customer_menu") {
      return handleCustomerMenu(s, msg, resolvedQuickIntent);
    }

    // --- ADMIN MENU ---
    if (currentState === "admin_menu") {
      return handleAdminMenu(s, msg, resolvedQuickIntent);
    }

    // --- SELECT EQUIPMENT ---
    if (currentState === "select_equipment") {
      return handleSelectEquipment(s, msg);
    }

    // --- NEW EQUIPMENT MODEL ---
    if (currentState === "new_equipment_model") {
      return handleNewEquipmentModel(s, msg);
    }

    // --- NEW EQUIPMENT SERIAL ---
    if (currentState === "new_equipment_serial") {
      return handleNewEquipmentSerial(s, msg);
    }

    // --- SELECT DATE ---
    if (currentState === "select_date") {
      return handleSelectDate(s, msg);
    }

    // --- SELECT TIME ---
    if (currentState === "select_time") {
      return handleSelectTime(s, msg);
    }

    // --- CONFIRM APPOINTMENT ---
    if (currentState === "confirm_appointment") {
      return handleConfirmAppointment(s, msg);
    }

    // --- HUMAN INTAKE ---
    if (currentState === "human_name") {
      return {
        replies: [txt(`Prazer, ${msg}! Me conta brevemente o que você precisa?`)],
        newSession: { state: "human_reason", tries: 0, entities: { ...s.entities, _humanName: msg }, contact: s.contact },
        setTags: [], removeTags: [],
      };
    }

    if (currentState === "human_reason") {
      return {
        replies: [
          txt(`✅ Obrigado! Um atendente humano vai assumir a conversa agora.\n\nEle já pode ver todo o seu histórico — fique à vontade. ⚡`),
        ],
        newSession: null,
        setTags: ["bot:atendente"],
        removeTags: [],
      };
    }

    // --- REMARCAR flows ---
    if (currentState === "remarcar_select_appointment") {
      return handleRemarcarSelectAppointment(s, msg);
    }
    if (currentState === "remarcar_select_date") {
      return handleRemarcarSelectDate(s, msg);
    }
    if (currentState === "remarcar_select_time") {
      return handleRemarcarSelectTime(s, msg);
    }

    // --- ADMIN BUSCAR CLIENTE ---
    if (currentState === "admin_buscar_cliente_input") {
      return handleAdminBuscarCliente(s, msg);
    }

    // --- VIEW APPOINTMENTS (from customer menu) ---
    if (currentState === "view_appointments") {
      return handleViewAppointments(s, msg);
    }

    // --- VIEW EQUIPMENT (from customer menu) ---
    if (currentState === "view_equipment") {
      return handleViewEquipment(s, msg);
    }

    // --- FALLBACK / RETRY ---
    if (RETRY_STATES.has(currentState)) {
      return handleRetry(s, msg, currentState);
    }

    // --- CATCH-ALL ---
    const contact = s.contact;
    const customer = contact.id ? await store.getCustomer(contact.id) : null;
    const isAdmin = customer?.isAdmin || adminPhones.includes(contact.id);
    const name = customer?.name || contact.name || "Cliente";

    if (isAdmin) {
      return {
        replies: [txt("Voltando ao painel administrativo..."), ...adminMainMenu(name)],
        newSession: { state: "admin_menu", tries: 0, entities: {}, contact },
        setTags: [], removeTags: [],
      };
    }
    return {
      replies: customerMainMenu(name),
      newSession: { state: "customer_menu", tries: 0, entities: {}, contact },
      setTags: [], removeTags: [],
    };
  }

  // ═══════════════════════════════════════════════════════════════
  // Handler: Identify (phone number entry)
  // ═══════════════════════════════════════════════════════════════
  async function handleIdentify(s: BotSession, msg: string): Promise<ProcessResult> {
    // Auto-identify: nutalk-dev already sends contact_phone in the webhook payload
    const contactPhone = s.contact?.id?.replace(/\D/g, "") || "";
    const contactName = s.contact?.name || "";

    // If contact already has a valid phone, skip identification
    if (contactPhone.length >= 10) {
      return autoIdentify(s, contactPhone, contactName);
    }

    // Extract phone number from message text
    const phoneMatch = msg.replace(/\D/g, "");
    let phone = s.entities._phone || "";

    if (phoneMatch.length >= 10 && phoneMatch.length <= 11) {
      phone = phoneMatch;
    } else if (!phone) {
      // Try to extract from message
      const digits = msg.replace(/\D/g, "");
      if (digits.length >= 10) {
        phone = digits;
      }
    }

    if (!phone || phone.length < 10) {
      return {
        replies: [
          txt("📱 Por favor, informe seu *número de telefone com DDD* para identificação.\n\nExemplo: _11999999999_"),
        ],
        newSession: { state: "identify", tries: (s.tries || 0) + 1, entities: { _phone: phone }, contact: s.contact },
        setTags: [], removeTags: [],
      };
    }

    return autoIdentify(s, phone, contactName);
  }

  async function autoIdentify(s: BotSession, phone: string, contactName: string): Promise<ProcessResult> {
    const customer = await customerService.findOrCreate(phone, contactName || undefined);
    const isAdmin = customer.isAdmin || adminPhones.includes(phone);
    const updatedContact = { id: phone, name: customer.name, phone };

    if (isAdmin) {
      return {
        replies: [txt(`🔐 Acesso admin autorizado!`), ...adminMainMenu(customer.name)],
        newSession: { state: "admin_menu", tries: 0, entities: { _phone: phone }, contact: updatedContact },
        setTags: [], removeTags: [],
      };
    }

    return {
      replies: customerMainMenu(customer.name),
      newSession: { state: "customer_menu", tries: 0, entities: { _phone: phone }, contact: updatedContact },
      setTags: [], removeTags: [],
    };
  }

  // ═══════════════════════════════════════════════════════════════
  // Handler: Customer Menu
  // ═══════════════════════════════════════════════════════════════
  async function handleCustomerMenu(
    s: BotSession,
    msg: string,
    quickIntent: string | null
  ): Promise<ProcessResult> {
    const intent = quickIntent || (await nlu.infer([msg], INTENTS)).intent?.name;
    const phone = s.entities._phone || s.contact.id;
    const customer = phone ? await store.getCustomer(phone) : null;
    const contact = s.contact;

    switch (intent) {
      case "agendar":
        return startScheduleFlow(s, phone);
      case "ver_equipamentos":
      case "equipamento_info": {
        const equip = phone ? await store.listEquipmentByCustomer(phone) : [];
        return {
          replies: [
            ...equipmentList(equip),
            txt("Digite *menu* para voltar ou *agendar* para marcar uma manutenção."),
          ],
          newSession: { state: "view_equipment", tries: 0, entities: s.entities, contact },
          setTags: [], removeTags: [],
        };
      }
      case "ver_agendamentos": {
        const apps = phone ? await schedulingService.getCustomerUpcomingAppointments(phone) : [];
        const withModels = await Promise.all(
          apps.map(async (a) => {
            const eq = await store.getEquipment(a.equipmentId);
            return { ...a, equipmentModel: eq?.model };
          })
        );
        return {
          replies: [
            ...appointmentsList(withModels),
            txt("Para *cancelar* um agendamento, digite o número da lista.\nDigite *menu* para voltar."),
          ],
          newSession: { state: "view_appointments", tries: 0, entities: s.entities, contact },
          setTags: [], removeTags: [],
        };
      }
      case "atendente":
        return {
          replies: [txt("👋 Claro! Qual o seu nome?")],
          newSession: { state: "human_name", tries: 0, entities: {}, contact },
          setTags: [], removeTags: [],
        };
      case "sair_demo":
        return {
          replies: [
            txt("🔙 Voce esta saindo da demonstracao de purificadores e voltando para o *assistente principal da Nutalk*.\n\nO bot principal pode te ajudar com outras demonstracoes, informacoes sobre a plataforma ou te conectar com um consultor humano."),
            txt("Ate logo! 👋"),
          ],
          newSession: null,
          setTags: [],
          removeTags: ["specialty:water"],
        };
      case "admin_menu": {
        const isAdmin = customer?.isAdmin || adminPhones.includes(phone);
        if (isAdmin) {
          return {
            replies: [txt("🔐 Acessando painel admin..."), ...adminMainMenu(customer?.name || "")],
            newSession: { state: "admin_menu", tries: 0, entities: s.entities, contact },
            setTags: [], removeTags: [],
          };
        }
        return {
          replies: [txt("⛔ Acesso restrito. Você não é administrador."), ...customerMainMenu(customer?.name || "Cliente")],
          newSession: { ...s, tries: 0 },
          setTags: [], removeTags: [],
        };
      }
      default: {
        const nextTries = (s.tries || 0) + 1;
        if (nextTries >= MAX_TRIES) {
          return {
            replies: [ESCALATION],
            newSession: null,
            setTags: ["bot:atendente"],
            removeTags: [],
          };
        }
        return {
          replies: [FALLBACK_RETRY(nextTries, MAX_TRIES), ...customerMainMenu(customer?.name || contact.name || "Cliente")],
          newSession: { ...s, state: "customer_menu", tries: nextTries },
          setTags: [], removeTags: [],
        };
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // Handler: Admin Menu
  // ═══════════════════════════════════════════════════════════════
  async function handleAdminMenu(
    s: BotSession,
    msg: string,
    quickIntent: string | null
  ): Promise<ProcessResult> {
    const intent = quickIntent || (await nlu.infer([msg], INTENTS)).intent?.name;
    const contact = s.contact;

    switch (intent) {
      case "admin_agenda_hoje": {
        const apps = await schedulingService.getTodayAppointments();
        const withModels = await enrichAppointments(apps);
        return {
          replies: [
            ...adminAppointmentsList(withModels, "Agendamentos de Hoje"),
            txt("Digite *menu* para voltar."),
          ],
          newSession: { ...s, state: "admin_menu", tries: 0 },
          setTags: [], removeTags: [],
        };
      }
      case "admin_agenda_amanha": {
        const apps = await schedulingService.getTomorrowAppointments();
        const withModels = await enrichAppointments(apps);
        return {
          replies: [
            ...adminAppointmentsList(withModels, "Agendamentos de Amanhã"),
            txt("Digite *menu* para voltar."),
          ],
          newSession: { ...s, state: "admin_menu", tries: 0 },
          setTags: [], removeTags: [],
        };
      }
      case "admin_remarcar":
      case "remarcar":
        return {
          replies: [txt("✏️ Informe o *ID do agendamento* que deseja remarcar.\n\nVocê encontra o ID na lista de agendamentos do cliente.")],
          newSession: { state: "remarcar_select_appointment", tries: 0, entities: {}, contact },
          setTags: [], removeTags: [],
        };
      case "admin_cancelar":
        return {
          replies: [txt("❌ Informe o *ID do agendamento* que deseja cancelar:")],
          newSession: { state: "remarcar_select_appointment", tries: 0, entities: { _cancelMode: "true" }, contact },
          setTags: [], removeTags: [],
        };
      case "admin_buscar_cliente":
        return {
          replies: [txt("🔍 Informe o *telefone* do cliente que deseja buscar:")],
          newSession: { state: "admin_buscar_cliente_input", tries: 0, entities: {}, contact },
          setTags: [], removeTags: [],
        };
      case "menu_cliente":
        return {
          replies: customerMainMenu(contact.name || "Cliente"),
          newSession: { state: "customer_menu", tries: 0, entities: {}, contact },
          setTags: [], removeTags: [],
        };
      case "agendar":
        return startScheduleFlow(s, contact.id);
      case "atendente":
        return {
          replies: [txt("👋 Claro! Qual o seu nome?")],
          newSession: { state: "human_name", tries: 0, entities: {}, contact },
          setTags: [], removeTags: [],
        };
      case "sair_demo":
        return {
          replies: [
            txt("🔙 Saindo da demonstracao e voltando para o *assistente principal da Nutalk*."),
            txt("Ate logo! 👋"),
          ],
          newSession: null,
          setTags: [],
          removeTags: ["specialty:water"],
        };
      default: {
        const nextTries = (s.tries || 0) + 1;
        if (nextTries >= MAX_TRIES) {
          return {
            replies: [ESCALATION],
            newSession: null,
            setTags: ["bot:atendente"],
            removeTags: [],
          };
        }
        return {
          replies: [FALLBACK_RETRY(nextTries, MAX_TRIES), ...adminMainMenu(contact.name || "Admin")],
          newSession: { ...s, state: "admin_menu", tries: nextTries },
          setTags: [], removeTags: [],
        };
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // Flow: Start Scheduling
  // ═══════════════════════════════════════════════════════════════
  async function startScheduleFlow(s: BotSession, phone: string): Promise<ProcessResult> {
    const equip = await store.listEquipmentByCustomer(phone);
    if (equip.length === 0) {
      return {
        replies: [
          txt("🔧 Você ainda não tem purificadores cadastrados. Vamos cadastrar um agora!"),
          NEW_EQUIPMENT_MODEL,
        ],
        newSession: { state: "new_equipment_model", tries: 0, entities: {}, contact: s.contact },
        setTags: [], removeTags: [],
      };
    }
    return {
      replies: [equipmentSelection(equip)],
      newSession: { state: "select_equipment", tries: 0, entities: {}, contact: s.contact },
      setTags: [], removeTags: [],
    };
  }

  // ═══════════════════════════════════════════════════════════════
  // Handler: Select Equipment
  // ═══════════════════════════════════════════════════════════════
  async function handleSelectEquipment(s: BotSession, msg: string): Promise<ProcessResult> {
    if (msg === "eq_new") {
      return {
        replies: [NEW_EQUIPMENT_MODEL],
        newSession: { state: "new_equipment_model", tries: 0, entities: {}, contact: s.contact },
        setTags: [], removeTags: [],
      };
    }

    const eqIdMatch = msg.match(/eq_(.+)/);
    if (eqIdMatch) {
      const eqId = eqIdMatch[1];
      const eq = await store.getEquipment(eqId);
      if (!eq) {
        return {
          replies: [txt("Equipamento não encontrado. Tente novamente.")],
          newSession: { ...s, tries: (s.tries || 0) + 1 },
          setTags: [], removeTags: [],
        };
      }
      return {
        replies: [dateSelection()],
        newSession: { state: "select_date", tries: 0, entities: { _equipmentId: eqId, _equipmentModel: eq.model }, contact: s.contact },
        setTags: [], removeTags: [],
      };
    }

    return {
      replies: [txt("Por favor, selecione um equipamento da lista.")],
      newSession: { ...s, tries: (s.tries || 0) + 1 },
      setTags: [], removeTags: [],
    };
  }

  // ═══════════════════════════════════════════════════════════════
  // Handler: New Equipment Model
  // ═══════════════════════════════════════════════════════════════
  async function handleNewEquipmentModel(s: BotSession, msg: string): Promise<ProcessResult> {
    const modelMatch = msg.match(/model_(.+)/);
    let model = modelMatch ? modelMatch[1] : msg;

    // Normalize model name
    const validModels = ["IbbL FR600", "IbbL FR800", "Soft Slim", "Soft Slim Plus", "IbbL Flex", "IbbL Compact"];
    const found = validModels.find((m) => m.toLowerCase() === model.toLowerCase());

    if (found) {
      return {
        replies: [NEW_EQUIPMENT_SERIAL],
        newSession: { state: "new_equipment_serial", tries: 0, entities: { ...s.entities, _model: found }, contact: s.contact },
        setTags: [], removeTags: [],
      };
    }

    return {
      replies: [txt("Modelo não reconhecido. Por favor, selecione um dos modelos disponíveis:"), NEW_EQUIPMENT_MODEL],
      newSession: { ...s, tries: (s.tries || 0) + 1 },
      setTags: [], removeTags: [],
    };
  }

  // ═══════════════════════════════════════════════════════════════
  // Handler: New Equipment Serial
  // ═══════════════════════════════════════════════════════════════
  async function handleNewEquipmentSerial(s: BotSession, msg: string): Promise<ProcessResult> {
    const model = s.entities._model || "Desconhecido";
    const phone = s.entities._phone || s.contact.id;
    const serialNumber = msg.trim();

    if (serialNumber.length < 3) {
      return {
        replies: [txt("Número de série muito curto. Por favor, informe o número completo.")],
        newSession: { ...s, tries: (s.tries || 0) + 1 },
        setTags: [], removeTags: [],
      };
    }

    const eq = await customerService.registerEquipment(phone, model, serialNumber);

    return {
      replies: [
        txt(`✅ Purificador *${model}* (Série: ${serialNumber}) cadastrado com sucesso!`),
        dateSelection(),
      ],
      newSession: {
        state: "select_date",
        tries: 0,
        entities: { _equipmentId: eq.id, _equipmentModel: eq.model, _phone: phone },
        contact: s.contact,
      },
      setTags: [], removeTags: [],
    };
  }

  // ═══════════════════════════════════════════════════════════════
  // Handler: Select Date
  // ═══════════════════════════════════════════════════════════════
  async function handleSelectDate(s: BotSession, msg: string): Promise<ProcessResult> {
    const dateMatch = msg.match(/date_(.+)/);
    let date: string;

    if (dateMatch) {
      date = dateMatch[1];
    } else {
      // Try to parse as a date
      const parsed = msg.match(/(\d{4}-\d{2}-\d{2})/);
      if (parsed) {
        date = parsed[1];
      } else {
        const brDate = msg.match(/(\d{2})\/(\d{2})(?:\/(\d{4}))?/);
        if (brDate) {
          const yyyy = brDate[3] || String(new Date().getFullYear());
          date = `${yyyy}-${brDate[2]}-${brDate[1]}`;
        } else {
          return {
            replies: [txt("Data inválida. Use o formato AAAA-MM-DD ou selecione uma das opções."), dateSelection()],
            newSession: { ...s, tries: (s.tries || 0) + 1 },
            setTags: [], removeTags: [],
          };
        }
      }
    }

    // Validate date is not in the past
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const selected = new Date(date + "T00:00:00");
    if (selected < today) {
      return {
        replies: [txt("Não é possível agendar para uma data passada. Por favor, escolha uma data futura."), dateSelection()],
        newSession: { ...s, tries: (s.tries || 0) + 1 },
        setTags: [], removeTags: [],
      };
    }

    const available = await schedulingService.getAvailableSlots(date);
    if (available.length === 0) {
      return {
        replies: [txt("😔 Todos os horários para esta data estão preenchidos. Por favor, escolha outra data."), dateSelection()],
        newSession: { ...s, tries: (s.tries || 0) + 1 },
        setTags: [], removeTags: [],
      };
    }

    return {
      replies: [timeSlotSelection(available)],
      newSession: { state: "select_time", tries: 0, entities: { ...s.entities, _date: date }, contact: s.contact },
      setTags: [], removeTags: [],
    };
  }

  // ═══════════════════════════════════════════════════════════════
  // Handler: Select Time
  // ═══════════════════════════════════════════════════════════════
  async function handleSelectTime(s: BotSession, msg: string): Promise<ProcessResult> {
    const slotMatch = msg.match(/slot_(.+)/);
    let timeSlot: string;

    if (slotMatch) {
      timeSlot = slotMatch[1];
    } else {
      // Try to parse as time
      const timeMatch = msg.match(/(\d{1,2}):?(\d{2})?/);
      if (timeMatch) {
        timeSlot = `${String(parseInt(timeMatch[1])).padStart(2, "0")}:00`;
      } else {
        return {
          replies: [txt("Horário inválido. Selecione um dos horários disponíveis.")],
          newSession: { ...s, tries: (s.tries || 0) + 1 },
          setTags: [], removeTags: [],
        };
      }
    }

    const date = s.entities._date || "";
    const equipmentModel = s.entities._equipmentModel || "Purificador";

    return {
      replies: appointmentSummary(equipmentModel, date, timeSlot),
      newSession: {
        state: "confirm_appointment",
        tries: 0,
        entities: { ...s.entities, _time: timeSlot },
        contact: s.contact,
      },
      setTags: [], removeTags: [],
    };
  }

  // ═══════════════════════════════════════════════════════════════
  // Handler: Confirm Appointment
  // ═══════════════════════════════════════════════════════════════
  async function handleConfirmAppointment(s: BotSession, msg: string): Promise<ProcessResult> {
    const lower = msg.toLowerCase().trim();
    const isConfirm =
      lower === "confirmar" ||
      lower === "sim" ||
      lower === "s" ||
      lower === "yes" ||
      lower === "ok" ||
      lower.includes("confirmar");

    const isCancel =
      lower === "cancelar_agendamento" ||
      lower === "cancelar" ||
      lower === "nao" ||
      lower === "não" ||
      lower === "n" ||
      lower === "no";

    const phone = s.entities._phone || s.contact.id;
    const equipmentId = s.entities._equipmentId || "";
    const date = s.entities._date || "";
    const timeSlot = s.entities._time || "";
    const equipmentModel = s.entities._equipmentModel || "Purificador";

    if (isConfirm) {
      const result = await schedulingService.schedule(phone, equipmentId, date, timeSlot);
      if (!result.success) {
        return {
          replies: [txt(`❌ ${result.error}`)],
          newSession: { state: "customer_menu", tries: 0, entities: {}, contact: s.contact },
          setTags: [], removeTags: [],
        };
      }

      return {
        replies: [
          ...appointmentConfirmed(equipmentModel, date, timeSlot),
          ...customerMainMenu(s.contact.name || "Cliente"),
        ],
        newSession: {
          state: "customer_menu",
          tries: 0,
          entities: { _phone: phone },
          contact: s.contact,
        },
        setTags: [], removeTags: [],
      };
    }

    if (isCancel) {
      return {
        replies: [txt("Agendamento cancelado. Sem problemas!"), ...customerMainMenu(s.contact.name || "Cliente")],
        newSession: { state: "customer_menu", tries: 0, entities: { _phone: phone }, contact: s.contact },
        setTags: [], removeTags: [],
      };
    }

    return {
      replies: [txt("Por favor, confirme ou cancele o agendamento.")],
      newSession: { ...s, tries: (s.tries || 0) + 1 },
      setTags: [], removeTags: [],
    };
  }

  // ═══════════════════════════════════════════════════════════════
  // Handler: Remarcar — Select Appointment
  // ═══════════════════════════════════════════════════════════════
  async function handleRemarcarSelectAppointment(s: BotSession, msg: string): Promise<ProcessResult> {
    const isCancelMode = s.entities._cancelMode === "true";
    const appId = msg.trim();

    if (isCancelMode) {
      const app = await store.getAppointment(appId);
      if (!app) {
        return {
          replies: [txt("❌ Agendamento não encontrado. Verifique o ID e tente novamente.")],
          newSession: { ...s, tries: (s.tries || 0) + 1 },
          setTags: [], removeTags: [],
        };
      }

      await schedulingService.cancel(appId, app.customerId);
      return {
        replies: [
          txt(`❌ Agendamento ${appId.slice(0, 8)}... cancelado com sucesso.`),
          ...adminMainMenu(s.contact.name || "Admin"),
        ],
        newSession: { state: "admin_menu", tries: 0, entities: {}, contact: s.contact },
        setTags: [], removeTags: [],
      };
    }

    // Remarcar mode
    const app = await store.getAppointment(appId);
    if (!app) {
      return {
        replies: [txt("❌ Agendamento não encontrado. Verifique o ID e tente novamente.")],
        newSession: { ...s, tries: (s.tries || 0) + 1 },
        setTags: [], removeTags: [],
      };
    }

    return {
      replies: [
        txt(`📋 Remarcando: ${formatDateBR(app.date)} às ${app.timeSlot}\n\nSelecione a nova data:`),
        dateSelection(),
      ],
      newSession: {
        state: "remarcar_select_date",
        tries: 0,
        entities: { _appointmentId: appId },
        contact: s.contact,
      },
      setTags: [], removeTags: [],
    };
  }

  // ═══════════════════════════════════════════════════════════════
  // Handler: Remarcar — Select Date
  // ═══════════════════════════════════════════════════════════════
  async function handleRemarcarSelectDate(s: BotSession, msg: string): Promise<ProcessResult> {
    const dateMatch = msg.match(/date_(.+)/);
    const date = dateMatch ? dateMatch[1] : msg.trim();

    const available = await schedulingService.getAvailableSlots(date);
    if (available.length === 0) {
      return {
        replies: [txt("😔 Sem horários disponíveis para esta data. Escolha outra."), dateSelection()],
        newSession: { ...s, tries: (s.tries || 0) + 1 },
        setTags: [], removeTags: [],
      };
    }

    return {
      replies: [timeSlotSelection(available)],
      newSession: {
        state: "remarcar_select_time",
        tries: 0,
        entities: { ...s.entities, _newDate: date },
        contact: s.contact,
      },
      setTags: [], removeTags: [],
    };
  }

  // ═══════════════════════════════════════════════════════════════
  // Handler: Remarcar — Select Time & Execute
  // ═══════════════════════════════════════════════════════════════
  async function handleRemarcarSelectTime(s: BotSession, msg: string): Promise<ProcessResult> {
    const slotMatch = msg.match(/slot_(.+)/);
    const timeSlot = slotMatch ? slotMatch[1] : msg.trim();
    const appId = s.entities._appointmentId || "";
    const newDate = s.entities._newDate || "";

    const result = await schedulingService.reschedule(appId, newDate, timeSlot);
    if (!result.success) {
      return {
        replies: [txt(`❌ ${result.error}`)],
        newSession: { state: "admin_menu", tries: 0, entities: {}, contact: s.contact },
        setTags: [], removeTags: [],
      };
    }

    return {
      replies: [
        txt(`✅ Agendamento remarcado para *${formatDateBR(newDate)}* às *${timeSlot}*!`),
        ...adminMainMenu(s.contact.name || "Admin"),
      ],
      newSession: { state: "admin_menu", tries: 0, entities: {}, contact: s.contact },
      setTags: [], removeTags: [],
    };
  }

  // ═══════════════════════════════════════════════════════════════
  // Handler: Admin Buscar Cliente
  // ═══════════════════════════════════════════════════════════════
  async function handleAdminBuscarCliente(s: BotSession, msg: string): Promise<ProcessResult> {
    const phone = msg.replace(/\D/g, "");
    const customer = await store.getCustomer(phone);

    if (!customer) {
      return {
        replies: [txt("🔍 Cliente não encontrado. Verifique o telefone e tente novamente.")],
        newSession: { ...s, tries: (s.tries || 0) + 1 },
        setTags: [], removeTags: [],
      };
    }

    const equip = await store.listEquipmentByCustomer(phone);
    const apps = await schedulingService.getCustomerUpcomingAppointments(phone);
    const withModels = await enrichAppointments(apps);

    const equipLines = equip.length > 0
      ? equip.map((e) => `  💧 ${e.model} (Série: ${e.serialNumber})`).join("\n")
      : "  Nenhum equipamento";

    return {
      replies: [
        txt(
          `🔍 *Cliente Encontrado*\n\n` +
            `👤 Nome: ${customer.name}\n` +
            `📱 Telefone: ${phone}\n` +
            `📍 Endereço: ${customer.address || "Não informado"}\n\n` +
            `*Equipamentos:*\n${equipLines}`
        ),
        ...appointmentsList(withModels, "📋 *Agendamentos do Cliente*"),
        txt("Digite *menu* para voltar ao painel admin."),
      ],
      newSession: { state: "admin_menu", tries: 0, entities: {}, contact: s.contact },
      setTags: [], removeTags: [],
    };
  }

  // ═══════════════════════════════════════════════════════════════
  // Handler: View Appointments (from customer flow)
  // ═══════════════════════════════════════════════════════════════
  async function handleViewAppointments(s: BotSession, msg: string): Promise<ProcessResult> {
    const phone = s.entities._phone || s.contact.id;
    const customer = phone ? await store.getCustomer(phone) : null;
    const contact = s.contact;

    // Check if user wants to cancel a specific appointment
    if (msg === "cancelar" || msg.startsWith("cancelar")) {
      return {
        replies: [txt("Informe o *número* do agendamento que deseja cancelar (ex: 1, 2, 3).")],
        newSession: { ...s, state: "view_appointments", tries: 0 },
        setTags: [], removeTags: [],
      };
    }

    // Check if it's a number (selecting an appointment to cancel)
    const numMatch = msg.match(/^(\d+)$/);
    if (numMatch) {
      const index = parseInt(numMatch[1]) - 1;
      const apps = phone ? await schedulingService.getCustomerUpcomingAppointments(phone) : [];
      if (index >= 0 && index < apps.length) {
        const app = apps[index];
        await schedulingService.cancel(app.id, phone);
        return {
          replies: [
            txt(`❌ Agendamento de ${formatDateBR(app.date)} às ${app.timeSlot} cancelado.`),
            ...customerMainMenu(customer?.name || contact.name || "Cliente"),
          ],
          newSession: { state: "customer_menu", tries: 0, entities: { _phone: phone }, contact },
          setTags: [], removeTags: [],
        };
      }
      return {
        replies: [txt("Número inválido. Tente novamente.")],
        newSession: { ...s, tries: (s.tries || 0) + 1 },
        setTags: [], removeTags: [],
      };
    }

    // Default: go back to menu
    return {
      replies: customerMainMenu(customer?.name || contact.name || "Cliente"),
      newSession: { state: "customer_menu", tries: 0, entities: { _phone: phone }, contact },
      setTags: [], removeTags: [],
    };
  }

  // ═══════════════════════════════════════════════════════════════
  // Handler: View Equipment (from customer flow)
  // ═══════════════════════════════════════════════════════════════
  async function handleViewEquipment(s: BotSession, msg: string): Promise<ProcessResult> {
    const phone = s.entities._phone || s.contact.id;
    const contact = s.contact;
    const customer = phone ? await store.getCustomer(phone) : null;

    // Default: go back to menu
    return {
      replies: customerMainMenu(customer?.name || contact.name || "Cliente"),
      newSession: { state: "customer_menu", tries: 0, entities: { _phone: phone }, contact },
      setTags: [], removeTags: [],
    };
  }

  // ═══════════════════════════════════════════════════════════════
  // Handler: Retry / Fallback
  // ═══════════════════════════════════════════════════════════════
  async function handleRetry(
    s: BotSession,
    msg: string,
    state: string
  ): Promise<ProcessResult> {
    // Try NLU
    const nluResult = await nlu.infer([msg], INTENTS);
    if (nluResult.intent && nluResult.confidence > 0.5) {
      // Re-dispatch to appropriate handler
      const contact = s.contact;
      const phone = contact.id;

      if (nluResult.intent.name === "voltar" || nluResult.intent.name === "cancelar") {
        const customer = phone ? await store.getCustomer(phone) : null;
        const isAdmin = customer?.isAdmin || adminPhones.includes(phone);
        if (isAdmin) {
          return {
            replies: [txt("Voltando..."), ...adminMainMenu(customer?.name || "Admin")],
            newSession: { state: "admin_menu", tries: 0, entities: {}, contact },
            setTags: [], removeTags: [],
          };
        }
        return {
          replies: customerMainMenu(customer?.name || contact.name || "Cliente"),
          newSession: { state: "customer_menu", tries: 0, entities: {}, contact },
          setTags: [], removeTags: [],
        };
      }
    }

    const nextTries = (s.tries || 0) + 1;
    if (nextTries >= MAX_TRIES) {
      return {
        replies: [ESCALATION],
        newSession: null,
        setTags: ["bot:atendente"],
        removeTags: [],
      };
    }

    return {
      replies: [FALLBACK_RETRY(nextTries, MAX_TRIES)],
      newSession: { ...s, tries: nextTries },
      setTags: [], removeTags: [],
    };
  }

  // ═══════════════════════════════════════════════════════════════
  // Helper: Enrich appointments with equipment models
  // ═══════════════════════════════════════════════════════════════
  async function enrichAppointments(apps: { id: string; customerId: string; equipmentId: string; date: string; timeSlot: string; status: string }[]) {
    return Promise.all(
      apps.map(async (a) => {
        const eq = await store.getEquipment(a.equipmentId);
        return { ...a, equipmentModel: eq?.model };
      })
    );
  }

  return { processMessage, store, customerService, schedulingService };
}
