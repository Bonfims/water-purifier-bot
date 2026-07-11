# 💧 Water Purifier Bot

Bot de agendamento de manutenção de purificadores de água — integrado ao ecossistema [Nutalk](https://github.com/nelsonlopesj/nutalk-dev).

Construído com **Bun** + **TypeScript**, arquitetura **hexagonal/clean**, operação **stateless**, e camada de **NLU multi-estágio** com fallback para **LLM (OpenRouter)**.

## Funcionalidades

- 📱 Identificação por telefone (auto-cadastro)
- 🔐 Painel admin (ver/remarcar/cancelar agendamentos, buscar clientes)
- 👤 Área do cliente (agendar, ver equipamentos, ver agendamentos)
- 🔧 Cadastro de purificadores (modelo + número de série)
- 📅 Agendamento com seleção de data e horário
- ✅ Confirmação de agendamento
- 💬 Transferência para atendente humano (`bot:atendente`)
- 🤖 Fallback LLM via OpenRouter quando NLU não resolve

## Arquitetura

```
src/
├── core/           # Domínio puro (zero dependências)
│   ├── entities.ts   # Customer, Equipment, Appointment, BotSession
│   ├── ports.ts      # SessionStore, DataStore (interfaces)
│   └── services.ts   # SchedulingService, CustomerService
├── adapters/       # Implementações concretas
│   ├── storage/
│   │   ├── memory.ts   # In-memory (dev / zero deps)
│   │   ├── postgres.ts # Postgres (produção)
│   │   └── redis.ts    # Redis (sessões em produção)
│   └── llm/
│       └── openrouter.ts  # Fallback LLM
├── bot/            # Motor do bot (stateless)
│   ├── nlu.ts        # NLU 4 camadas + regex rápido
│   ├── messages.ts   # Templates WhatsApp (botões, listas)
│   └── process.ts    # processMessage() — a interface
├── server.ts       # HTTP API (Bun.serve)
└── config.ts       # Config via env vars
```

## Modos de operação

```bash
# DEV — tudo em memória, zero dependências externas
bun run dev

# PROD — com Postgres + Redis
DATABASE_URL=postgres://... REDIS_URL=redis://... bun run start
```

## Quickstart

```bash
cp .env.example .env
# Edite ADMIN_PHONES (phones admin, separados por vírgula)
# Opcional: DATABASE_URL, REDIS_URL, LLM_API_KEY

bun install
bun run dev     # http://localhost:3000
```

### CLI Interativo

```bash
bun run cli     # Simula conversa WhatsApp no terminal
```

Comandos do CLI: `/help`, `/state`, `/reset`, `/clear`, `/phone <numero>`, `/raw`, `/quit`

## API — Interface com nutalk-dev

Mesmo contrato do [nutalk-bot](https://github.com/Bonfims/nutalk-bot):

| Método | Rota | Descrição |
|--------|------|-----------|
| `POST` | `/api/conversations/:id/messages` | Envia mensagem → retorna `{ actions }` |
| `GET` | `/api/conversations/:id` | Estado da sessão |
| `DELETE` | `/api/conversations/:id` | Remove sessão |
| `POST` | `/api/webhook` | Webhook nutalk-dev (2 formatos) |
| `GET` | `/api/health` | Health check |

### Formato da mensagem

```json
// Request
{ "text": "agendar", "contact": { "id": "11999999999", "name": "Maria" } }

// Response
{
  "actions": [
    {
      "type": "reply",
      "text": "📅 Para qual dia?",
      "interactive": {
        "body": "Escolha o dia:",
        "buttons": [
          { "id": "date_2026-07-12", "title": "Sáb (12/07)" }
        ]
      }
    }
  ]
}
```

## NLU — Pipeline de classificação

1. **Regex rápido** — 18 padrões pré-compilados (oi, menu, cancelar, agendar...)
2. **Exact match** — `"cancelar"` → cancelar (confidence 1.0)
3. **Contains match** — `"quero agendar manutenção"` contém `"agendar"`
4. **Token overlap (Jaccard)** — similaridade de tokens ≥ 0.4
5. **Fuzzy (Levenshtein)** — tolerância a typos (`"agendat"` ≈ `"agendar"`)
6. **LLM Fallback** — OpenRouter classifica se tudo falhar

## Testes

```bash
bun test              # 67 testes (3 suites)
bun test:unit         # NLU + serviços
bun test:integration  # Fluxos completos
```

## Variáveis de ambiente

| Var | Padrão | Descrição |
|-----|--------|-----------|
| `PORT` | `3000` | Porta do servidor |
| `ADMIN_PHONES` | — | Telefones admin (separados por vírgula) |
| `DATABASE_URL` | — | Postgres URL (vazio = in-memory) |
| `REDIS_URL` | — | Redis URL (vazio = in-memory) |
| `LLM_API_KEY` | — | OpenRouter API key (vazio = sem LLM) |
| `LLM_MODEL` | `openai/gpt-4o-mini` | Modelo OpenRouter |
| `API_TOKEN` | — | Bearer token para autenticação |
| `NUTALK_API_URL` | `http://localhost:3001` | URL da API do nutalk-dev |

## Licença

MIT
