function toBool(v) {
  return String(v || "").trim().toLowerCase() === "true";
}
function toNum(v, d) {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}
function toStr(v, d = "") {
  return (v == null ? d : String(v)).trim();
}

const cfg = {
  // WhatsApp Cloud API
  WHATSAPP_TOKEN: toStr(process.env.WHATSAPP_TOKEN || process.env.TOKEN_WHATSAPP),
  WHATSAPP_PHONE_NUMBER_ID: toStr(process.env.WHATSAPP_PHONE_NUMBER_ID),
  WHATSAPP_BUSINESS_ID: toStr(process.env.WHATSAPP_BUSINESS_ID),
  GRAPH_API_VERSION: toStr(process.env.GRAPH_API_VERSION, "v20.0"),

  // Templates
  WHATSAPP_TEMPLATE_LANG: toStr(process.env.WHATSAPP_TEMPLATE_LANG, "pt_BR"),
  WHATSAPP_TEMPLATE_ANIV_LANG: toStr(process.env.WHATSAPP_TEMPLATE_ANIV_LANG),
  WHATSAPP_TEMPLATE_ANIV_NAME: toStr(process.env.WHATSAPP_TEMPLATE_ANIV_NAME, "eac_comunicado_aniversario"),

  // Segurança
  CHAVE_DISPARO: toStr(process.env.CHAVE_DISPARO),
  VERIFY_TOKEN: toStr(process.env.VERIFY_TOKEN),

  // Execução
  DRY_RUN: toBool(process.env.DRY_RUN),
  ENABLE_CRON: process.env.ENABLE_CRON == null ? true : !toBool(process.env.ENABLE_CRON) ? true : false,
  TZ: toStr(process.env.TZ, "America/Sao_Paulo"),

  // Throttling/Retry
  THROTTLE_CONCURRENCY: toNum(process.env.THROTTLE_CONCURRENCY, 2),
  THROTTLE_DELAY_MS: toNum(process.env.THROTTLE_DELAY_MS, 150),
  RETRY_MAX: toNum(process.env.RETRY_MAX, 2),
  RETRY_BASE_MS: toNum(process.env.RETRY_BASE_MS, 500),

  // Sheets
  SHEETS_READ_ONLY: toBool(process.env.SHEETS_READ_ONLY),

  // Logs/Debug
  LOG_JSON: toBool(process.env.LOG_JSON),
  DEBUG_ENDPOINTS: toBool(process.env.DEBUG_ENDPOINTS),
};

module.exports = cfg;

