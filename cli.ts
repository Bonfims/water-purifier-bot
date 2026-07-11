#!/usr/bin/env bun
// ═══════════════════════════════════════════════════════════════════
// CLI Interativo — Simula WhatsApp conectado ao ScheduleBot
// ═══════════════════════════════════════════════════════════════════
//
// Uso:
//   bun run cli                    → http://localhost:3000
//   bun run cli localhost:3001     → http://localhost:3001

import * as readline from "node:readline";

const BASE = process.argv[2] || "http://localhost:3000";
const API = `${BASE}/api/conversations`;

let conversationId: string | null = null;
let contactName = "Você";
let contactPhone = "";
let rawMode = false;

// ═══════════════════════════════════════════════════════════════════
// Terminal formatting
// ═══════════════════════════════════════════════════════════════════

const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const GREEN = "\x1b[32m";
const BLUE = "\x1b[34m";
const CYAN = "\x1b[36m";
const YELLOW = "\x1b[33m";
const RED = "\x1b[31m";
const RESET = "\x1b[0m";

function clear() {
  process.stdout.write("\x1b[2J\x1b[H");
}

function divider(char = "─") {
  console.log(DIM + char.repeat(60) + RESET);
}

// ═══════════════════════════════════════════════════════════════════
// API Helpers
// ═══════════════════════════════════════════════════════════════════

async function api(method: string, path: string, body?: any) {
  const opts: any = { method, headers: { "Content-Type": "application/json" } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${API}${path}`, opts);
  if (!res.ok) {
    const err = await res.text().catch(() => "");
    throw new Error(`${res.status}: ${err || res.statusText}`);
  }
  return res.json();
}

// ═══════════════════════════════════════════════════════════════════
// Display
// ═══════════════════════════════════════════════════════════════════

function displayReply(text: string) {
  const clean = text
    .replace(/\*\*(.+?)\*\*/g, BOLD + "$1" + RESET)
    .replace(/_(.+?)_/g, DIM + "$1" + RESET);
  console.log(`\n${GREEN}🤖 Bot:${RESET} ${clean}`);
}

function displayInteractive(interactive: any) {
  console.log("");
  if (interactive.body) {
    console.log(`  ${BOLD}${interactive.body}${RESET}`);
  }
  if (interactive.type === "list") {
    if (interactive.header) {
      console.log(`  ${CYAN}── ${interactive.header.text} ──${RESET}`);
    }
    if (interactive.buttons) {
      console.log("");
      for (const btn of interactive.buttons) {
        const id = DIM + "[" + btn.id + "]" + RESET;
        console.log(`  ${id}  ${btn.title}`);
      }
      console.log(`\n  ${DIM}(digite o ID ou título)${RESET}`);
    }
  } else {
    if (interactive.buttons) {
      console.log("");
      for (const btn of interactive.buttons) {
        const id = DIM + "[" + btn.id + "]" + RESET;
        console.log(`  ${id}  ${btn.title}`);
      }
      console.log(`  ${DIM}(digite o ID ou título)${RESET}`);
    }
  }
}

function displayActions(actions: any[]) {
  for (const action of actions) {
    if (action.type !== "reply") continue;
    displayReply(action.text);
    if (action.interactive) {
      displayInteractive(action.interactive);
    }
  }
}

// ═══════════════════════════════════════════════════════════════════
// Help
// ═══════════════════════════════════════════════════════════════════

function showHelp() {
  console.log(`\n${YELLOW}${BOLD}📋 Comandos:${RESET}`);
  console.log(`  ${BLUE}/help${RESET}    — Mostra esta ajuda`);
  console.log(`  ${BLUE}/state${RESET}   — Mostra o estado atual da sessão`);
  console.log(`  ${BLUE}/reset${RESET}   — Reinicia a conversa (nova sessão)`);
  console.log(`  ${BLUE}/clear${RESET}   — Limpa a tela`);
  console.log(`  ${BLUE}/phone N${RESET}  — Define telefone (ex: /phone 11999999999)`);
  console.log(`  ${BLUE}/raw${RESET}     — Alterna modo raw (mostra JSON)`);
  console.log(`  ${BLUE}/quit${RESET}    — Sai\n`);
  console.log(`${YELLOW}${BOLD}💡 Dicas:${RESET}`);
  console.log(`  • Telefone admin nos testes: ${BLUE}11988888888${RESET}`);
  console.log(`  • Cliente de teste: ${BLUE}11999999999${RESET} (Maria Silva)`);
  console.log(`  • IDs de botão: digite o texto entre colchetes`);
  console.log(`  • Texto livre: o bot entende menu, agendar, atendente...`);
}

// ═══════════════════════════════════════════════════════════════════
// Process input line
// ═══════════════════════════════════════════════════════════════════

async function handleInput(line: string): Promise<boolean> {
  // Commands
  if (line.startsWith("/")) {
    const [cmd, ...args] = line.split(/\s+/);
    const arg = args.join(" ");

    switch (cmd) {
      case "/quit":
      case "/q":
        return false;

      case "/help":
      case "/h":
        showHelp();
        return true;

      case "/state":
      case "/s":
        try {
          const session = await api("GET", `/${conversationId}`);
          console.log(`\n${YELLOW}Estado:${RESET}`);
          console.log(JSON.stringify(session, null, 2));
        } catch {
          console.log(`${DIM}(sem sessão ativa)${RESET}`);
        }
        return true;

      case "/reset":
      case "/r":
        await api("DELETE", `/${conversationId}`).catch(() => {});
        conversationId = `cli-${Date.now()}`;
        contactName = "Você";
        contactPhone = "";
        console.log(`${YELLOW}🔄 Nova conversa iniciada.${RESET}`);
        return true;

      case "/clear":
      case "/c":
        clear();
        console.log(`${CYAN}${BOLD}💧 ScheduleBot CLI${RESET}`);
        divider();
        return true;

      case "/phone":
      case "/p":
        if (arg) {
          contactPhone = arg.replace(/\D/g, "");
          console.log(`${GREEN}📱 Telefone: ${contactPhone}${RESET}`);
        } else {
          console.log(`${DIM}Uso: /phone 11999999999${RESET}`);
        }
        return true;

      case "/raw":
        rawMode = !rawMode;
        console.log(`${YELLOW}Modo raw: ${rawMode ? "ON" : "OFF"}${RESET}`);
        return true;

      default:
        console.log(`${RED}Comando: ${cmd}${RESET} — /help para ajuda`);
        return true;
    }
  }

  // ── Send message to bot ───────────────────────────────────────
  try {
    // Auto-detect phone number on first message
    const digits = line.replace(/\D/g, "");
    if (!contactPhone && digits.length >= 10 && digits.length <= 11) {
      contactPhone = digits;
    }

    const contact: any = { id: conversationId! };
    if (contactPhone) {
      contact.id = contactPhone;
      contact.phone = contactPhone;
    }
    if (contactName !== "Você") contact.name = contactName;

    const result = await api("POST", `/${conversationId}/messages`, {
      text: line,
      contact,
    });

    if (rawMode) {
      console.log(`\n${DIM}── RAW ──${RESET}`);
      console.log(JSON.stringify(result, null, 2));
      console.log(DIM + "── /RAW ──" + RESET);
    }

    displayActions(result.actions || []);

    // Track contact name from session
    try {
      const session = await api("GET", `/${conversationId}`);
      if (session.contact?.name && session.contact.name !== "Cliente") {
        contactName = session.contact.name;
      }
      // Track what state we're in (subtle hint)
      const state = session.state;
      if (state === "confirm_appointment" || state === "human_name") {
        // Don't show state, it's obvious from the bot's message
      }
    } catch {}

    return true;
  } catch (err: any) {
    console.log(`${RED}❌ ${err.message}${RESET}`);
    return true;
  }
}

// ═══════════════════════════════════════════════════════════════════
// Main
// ═══════════════════════════════════════════════════════════════════

async function main() {
  clear();
  console.log(`${CYAN}${BOLD}💧 ScheduleBot CLI${RESET} ${DIM}— Simulador de conversa${RESET}`);
  console.log(DIM + `API: ${API}` + RESET);
  divider();

  // Health check
  try {
    const health = await fetch(`${BASE}/api/health`).then((r) => r.json());
    console.log(`${GREEN}✅ Servidor online${RESET} ${DIM}(uptime: ${Math.round(health.uptime)}s)${RESET}`);
  } catch {
    console.log(`${RED}❌ Servidor offline em ${BASE}${RESET}`);
    console.log(`${DIM}Inicie com: bun run dev${RESET}`);
    divider();
    // Still run — will show errors on each message
  }

  divider();
  console.log(`${DIM}📱 Informe seu telefone (ex: 11999999999) ou digite /help${RESET}\n`);

  conversationId = `cli-${Date.now()}`;

  // Readline interface
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: "",
  });

  // Show prompt
  const showPrompt = () => {
    const label = contactName || "Você";
    process.stdout.write(`${BLUE}${label}${RESET} > `);
  };
  showPrompt();

  rl.on("line", async (raw) => {
    const line = raw.trim();
    if (!line) {
      showPrompt();
      return;
    }

    const keepGoing = await handleInput(line);
    if (!keepGoing) {
      console.log(`\n${DIM}Até mais! 👋${RESET}`);
      rl.close();
      return;
    }

    console.log("");
    showPrompt();
  });

  rl.on("close", () => {
    console.log(`\n${DIM}Sessão encerrada.${RESET}`);
    process.exit(0);
  });

  // Handle Ctrl+C gracefully
  process.on("SIGINT", () => {
    console.log(`\n${DIM}Até mais! 👋${RESET}`);
    process.exit(0);
  });
}

main().catch((err) => {
  console.error(`${RED}Fatal: ${err.message}${RESET}`);
  process.exit(1);
});
