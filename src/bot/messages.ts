// ═══════════════════════════════════════════════════════════════════
// WhatsApp Message Templates — Buttons, Lists, and Text helpers
// ═══════════════════════════════════════════════════════════════════

import type { InteractiveMessage, ReplyItem, ButtonItem } from "../core/entities";
import { dateOptions, generateNextDates, TIME_SLOTS } from "../core/services";

// ═══════════════════════════════════════════════════════════════════
// Message builders
// ═══════════════════════════════════════════════════════════════════

export function txt(text: string): ReplyItem {
  return text;
}

export function btnMessage(
  text: string,
  body: string,
  buttons: ButtonItem[]
): ReplyItem {
  return { text, interactive: { body, buttons } };
}

export function listMessage(
  text: string,
  body: string,
  header: string,
  footer: string,
  buttons: ButtonItem[]
): ReplyItem {
  return {
    text,
    interactive: {
      type: "list",
      header: { type: "text", text: header },
      body,
      footer,
      buttons,
    },
  };
}

// ═══════════════════════════════════════════════════════════════════
// Welcome & Identification
// ═══════════════════════════════════════════════════════════════════

export const WELCOME = txt(
  "💧 *Bem-vindo ao ScheduleBot!*\n\n" +
    "Assistente de agendamento de manutenção de purificadores de água.\n\n" +
    "Para começar, digite o número do seu cadastro (telefone com DDD):\n" +
    "Exemplo: _11999999999_"
);

export const WELCOME_RETRY = btnMessage(
  "👋 Olá! Como posso ajudar?\n\n1 - Agendar manutenção\n2 - Ver meus equipamentos\n3 - Ver agendamentos\n4 - Falar com atendente",
  "Escolha uma opção:",
  [
    { id: "agendar", title: "📅 Agendar Manutenção" },
    { id: "ver_equipamentos", title: "🔧 Meus Equipamentos" },
    { id: "ver_agendamentos", title: "📋 Meus Agendamentos" },
  ]
);

// ═══════════════════════════════════════════════════════════════════
// Customer Main Menu
// ═══════════════════════════════════════════════════════════════════

export function customerMainMenu(name: string): ReplyItem[] {
  return [
    txt(`👋 Olá, *${name}*! Como posso ajudar?`),
    listMessage(
      "Escolha uma opção:\n1 - Agendar Manutenção\n2 - Meus Equipamentos\n3 - Meus Agendamentos\n4 - Falar com Atendente\n5 - Sair da Demonstração",
      "Menu Principal",
      "ScheduleBot 💧",
      "Opções",
      [
        { id: "agendar", title: "📅 Agendar Manutenção" },
        { id: "ver_equipamentos", title: "🔧 Meus Equipamentos" },
        { id: "ver_agendamentos", title: "📋 Meus Agendamentos" },
        { id: "atendente", title: "💬 Falar com Atendente" },
        { id: "sair_demo", title: "🔙 Sair da Demonstração" },
      ]
    ),
  ];
}

// ═══════════════════════════════════════════════════════════════════
// Admin Menu
// ═══════════════════════════════════════════════════════════════════

export function adminMainMenu(name: string): ReplyItem[] {
  return [
    txt(`🔐 *Painel Admin* — Olá, ${name}!`),
    listMessage(
      "Escolha uma opção administrativa:",
      "Painel Administrativo",
      "Admin 💧",
      "Opções",
      [
        { id: "admin_agenda_hoje", title: "📅 Agendamentos de Hoje" },
        { id: "admin_agenda_amanha", title: "📆 Agendamentos de Amanhã" },
        { id: "admin_remarcar", title: "✏️ Remarcar Agendamento" },
        { id: "admin_cancelar", title: "❌ Cancelar Agendamento" },
        { id: "admin_buscar_cliente", title: "🔍 Buscar Cliente" },
        { id: "menu_cliente", title: "👤 Menu Cliente" },
        { id: "sair_demo", title: "🔙 Sair da Demonstração" },
      ]
    ),
  ];
}

// ═══════════════════════════════════════════════════════════════════
// Equipment List
// ═══════════════════════════════════════════════════════════════════

export function equipmentList(
  equipment: { id: string; model: string; serialNumber: string; lastMaintenance: Date | null; nextMaintenance: Date | null }[]
): ReplyItem[] {
  if (equipment.length === 0) {
    return [
      txt("🔧 Você ainda não possui equipamentos cadastrados."),
      btnMessage("", "O que deseja fazer?", [
        { id: "agendar", title: "📅 Agendar Manutenção" },
        { id: "voltar", title: "↩ Menu" },
      ]),
    ];
  }

  const lines = equipment.map((eq, i) => {
    const last = eq.lastMaintenance
      ? new Date(eq.lastMaintenance).toLocaleDateString("pt-BR")
      : "Nunca";
    const next = eq.nextMaintenance
      ? new Date(eq.nextMaintenance).toLocaleDateString("pt-BR")
      : "—";
    return `*${i + 1}. ${eq.model}*\n   🔢 Série: ${eq.serialNumber}\n   📅 Última manutenção: ${last}\n   📆 Próxima: ${next}`;
  });

  return [
    txt(`🔧 *Seus Purificadores*\n\n${lines.join("\n\n")}`),
    btnMessage("", "O que deseja fazer?", [
      { id: "agendar", title: "📅 Agendar Manutenção" },
      { id: "voltar", title: "↩ Menu" },
    ]),
  ];
}

// ═══════════════════════════════════════════════════════════════════
// Equipment Selection for Scheduling
// ═══════════════════════════════════════════════════════════════════

export function equipmentSelection(
  equipment: { id: string; model: string }[]
): ReplyItem {
  const buttons = equipment.slice(0, 10).map((eq) => ({
    id: `eq_${eq.id}`,
    title: `💧 ${eq.model}`,
  }));
  buttons.push({ id: "eq_new", title: "➕ Novo Equipamento" });

  return listMessage(
    "Selecione o purificador para agendar a manutenção:",
    "Qual purificador será feita a manutenção?",
    "Selecionar Equipamento",
    "Opções",
    buttons
  );
}

// ═══════════════════════════════════════════════════════════════════
// Date Selection
// ═══════════════════════════════════════════════════════════════════

export function dateSelection(): ReplyItem {
  const d = dateOptions();
  // WhatsApp: max 3 buttons → use list message for 4+ items
  return listMessage(
    "📅 Para qual dia você quer agendar?",
    "Escolha o dia da manutenção:",
    "Datas Disponíveis",
    "Opções",
    [
      { id: `date_${d.hoje.key}`, title: `Hoje (${d.hoje.label})` },
      { id: `date_${d.amanha.key}`, title: `Amanhã (${d.amanha.label})` },
      { id: `date_${d.depois.key}`, title: d.depois.label },
      { id: "date_other", title: "📅 Outra data..." },
    ]
  );
}

export function dateSelectionExtended(): ReplyItem {
  const dates = generateNextDates(6);
  const buttons = dates.map((d) => ({
    id: `date_${d.key}`,
    title: d.label,
  }));
  return btnMessage(
    "📅 Selecione uma data para o agendamento:",
    "Escolha o dia:",
    buttons.slice(0, 3) // WhatsApp max 3 buttons
  );
}

// ═══════════════════════════════════════════════════════════════════
// Time Slot Selection
// ═══════════════════════════════════════════════════════════════════

export function timeSlotSelection(
  availableSlots: string[]
): ReplyItem {
  const slotLabels: Record<string, string> = {
    "08:00": "08:00 ☀️",
    "09:00": "09:00",
    "10:00": "10:00",
    "11:00": "11:00",
    "14:00": "14:00",
    "15:00": "15:00",
    "16:00": "16:00",
    "17:00": "17:00 🌅",
  };

  const buttons = availableSlots.slice(0, 10).map((slot) => ({
    id: `slot_${slot}`,
    title: slotLabels[slot] || slot,
  }));

  if (buttons.length === 0) {
    return txt(
      "😔 Todos os horários para este dia estão preenchidos. Por favor, escolha outra data."
    );
  }

  return listMessage(
    "🕐 Selecione o horário desejado:",
    "Escolha o horário da manutenção:",
    "Horários Disponíveis",
    "Opções",
    buttons
  );
}

// ═══════════════════════════════════════════════════════════════════
// Summary & Confirmation
// ═══════════════════════════════════════════════════════════════════

export function appointmentSummary(
  equipment: string,
  date: string,
  timeSlot: string
): ReplyItem[] {
  const [y, m, d] = date.split("-");
  return [
    txt(
      `📋 *Confirmar Agendamento*\n\n` +
        `💧 Purificador: ${equipment}\n` +
        `📅 Data: ${d}/${m}/${y}\n` +
        `🕐 Horário: ${timeSlot}\n\n` +
        `A manutenção leva em média 40 minutos. Um técnico irá até o endereço cadastrado.`
    ),
    btnMessage("", "Confirma o agendamento?", [
      { id: "confirmar", title: "✅ Confirmar" },
      { id: "cancelar_agendamento", title: "❌ Cancelar" },
    ]),
  ];
}

export function appointmentConfirmed(
  equipment: string,
  date: string,
  timeSlot: string
): ReplyItem[] {
  const [y, m, d] = date.split("-");
  return [
    txt(
      `✅ *Agendamento Confirmado!*\n\n` +
        `💧 ${equipment}\n` +
        `📅 ${d}/${m}/${y} às ${timeSlot}\n\n` +
        `📌 *Importante:*\n` +
        `• O técnico chegará no horário marcado\n` +
        `• Tenha o purificador acessível\n` +
        `• Em caso de imprevistos, cancele ou remarque com até 2h de antecedência\n\n` +
        `Você receberá um lembrete um dia antes. Obrigado! 💧`
    ),
    txt("O que mais deseja fazer?"),
  ];
}

// ═══════════════════════════════════════════════════════════════════
// Appointments List
// ═══════════════════════════════════════════════════════════════════

export function appointmentsList(
  appointments: {
    id: string;
    date: string;
    timeSlot: string;
    status: string;
    equipmentModel?: string;
  }[],
  title: string = "📋 *Seus Agendamentos*"
): ReplyItem[] {
  if (appointments.length === 0) {
    return [
      txt("📋 Você não possui agendamentos ativos no momento."),
      btnMessage("", "O que deseja fazer?", [
        { id: "agendar", title: "📅 Agendar Manutenção" },
        { id: "voltar", title: "↩ Menu" },
      ]),
    ];
  }

  const statusEmoji: Record<string, string> = {
    scheduled: "⏳",
    confirmed: "✅",
    in_progress: "🔧",
    completed: "✔️",
    cancelled: "❌",
  };

  const statusLabel: Record<string, string> = {
    scheduled: "Agendado",
    confirmed: "Confirmado",
    in_progress: "Em andamento",
    completed: "Concluído",
    cancelled: "Cancelado",
  };

  const lines = appointments.map((app, i) => {
    const [y, m, d] = app.date.split("-");
    const emoji = statusEmoji[app.status] || "📌";
    const status = statusLabel[app.status] || app.status;
    const eq = app.equipmentModel ? ` | ${app.equipmentModel}` : "";
    return `${i + 1}. ${emoji} ${d}/${m}/${y} às ${app.timeSlot}${eq}\n   _${status}_`;
  });

  return [
    txt(`${title}\n\n${lines.join("\n\n")}`),
    txt("Para *cancelar* um agendamento, digite o número correspondente (ex: 1, 2)."),
    btnMessage("", "Ou escolha uma ação:", [
      { id: "agendar", title: "📅 Novo Agendamento" },
      { id: "voltar", title: "↩ Voltar ao Menu" },
      { id: "atendente", title: "💬 Falar com Atendente" },
    ]),
  ];
}

// ═══════════════════════════════════════════════════════════════════
// Admin: Today's/Tomorrow's Appointments
// ═══════════════════════════════════════════════════════════════════

export function adminAppointmentsList(
  appointments: {
    id: string;
    customerId: string;
    date: string;
    timeSlot: string;
    status: string;
    equipmentModel?: string;
  }[],
  title: string
): ReplyItem[] {
  if (appointments.length === 0) {
    return [
      txt(`📅 *${title}*\n\nNenhum agendamento encontrado.`),
    ];
  }

  const statusEmoji: Record<string, string> = {
    scheduled: "⏳",
    confirmed: "✅",
    in_progress: "🔧",
    completed: "✔️",
    cancelled: "❌",
  };

  const lines = appointments.map((app) => {
    const emoji = statusEmoji[app.status] || "📌";
    const eq = app.equipmentModel ? ` — ${app.equipmentModel}` : "";
    return `${emoji} *${app.timeSlot}* — ${app.customerId.slice(-4)}${eq}`;
  });

  return [txt(`📅 *${title}*\n\n${lines.join("\n")}`)];
}

// ═══════════════════════════════════════════════════════════════════
// New Equipment Registration
// ═══════════════════════════════════════════════════════════════════

export const NEW_EQUIPMENT_MODEL = listMessage(
  "Selecione o modelo do purificador:",
  "Qual o modelo do seu purificador?",
  "Modelos",
  "Opções",
  [
    { id: "model_IbbL FR600", title: "IbbL FR600" },
    { id: "model_IbbL FR800", title: "IbbL FR800" },
    { id: "model_Soft Slim", title: "Soft Slim" },
    { id: "model_Soft Slim Plus", title: "Soft Slim Plus" },
    { id: "model_IbbL Flex", title: "IbbL Flex" },
    { id: "model_IbbL Compact", title: "IbbL Compact" },
  ]
);

export const NEW_EQUIPMENT_SERIAL = txt(
  "🔢 Por favor, informe o *número de série* do purificador.\n\n" +
    "Ele geralmente fica na etiqueta lateral ou traseira do aparelho."
);

// ═══════════════════════════════════════════════════════════════════
// Global / Help / Fallback
// ═══════════════════════════════════════════════════════════════════

export const GLOBAL_HELP = txt(
  "💧 *ScheduleBot — Ajuda*\n\n" +
    "*Comandos disponíveis:*\n" +
    "• `menu` — Voltar ao menu principal\n" +
    "• `agendar` — Agendar manutenção\n" +
    "• `equipamentos` — Ver purificadores\n" +
    "• `agendamentos` — Ver agendamentos\n" +
    "• `cancelar` — Cancelar agendamento\n" +
    "• `atendente` — Falar com atendente\n" +
    "• `sair` — Encerrar conversa\n\n" +
    "_Digite uma opção ou use os botões abaixo._"
);

export const FALLBACK_RETRY = (tries: number, max: number): ReplyItem =>
  txt(`🤔 Não entendi. Tentativa ${tries}/${max}.\n\nDigite *menu* para ver as opções ou *ajuda* para ver os comandos disponíveis.`);

export const ESCALATION = txt(
  "😅 Tentei te entender algumas vezes, mas não consegui. Vou chamar um atendente humano para te ajudar!"
);

export const GOODBYE = txt(
  "Atendimento encerrado. Obrigado por usar o ScheduleBot! 💧\n\nPrecisando, é só chamar. Até mais! 👋"
);
