import dotenv from "dotenv";
dotenv.config();

export const config = Object.freeze({
  port: parseInt(process.env.PORT || "3000", 10),
  redisUrl: process.env.REDIS_URL || "",
  apiToken: process.env.API_TOKEN || "",
  nutalkApiUrl: process.env.NUTALK_API_URL || "http://localhost:3001",
  nutalkBotUrl: process.env.NUTALK_BOT_URL || "",
  llmApiKey: process.env.LLM_API_KEY || "",
  llmModel: process.env.LLM_MODEL || "openai/gpt-4o-mini",
  databaseUrl: process.env.DATABASE_URL || "",
  adminPhones: (process.env.ADMIN_PHONES || "")
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean),
});
