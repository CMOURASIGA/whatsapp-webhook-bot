// ================================================================
// IMPORTAÇÕES E CONFIGURAÇÕES INICIAIS
// ================================================================
const express = require("express");
const axios = require("axios");
const { google } = require("googleapis");
const cron = require("node-cron");
const sharp = require("sharp");

const app = express();
app.use(express.json());

// Idiomas de template configuráveis (default pt_BR)
const TEMPLATE_LANG = (process.env.WHATSAPP_TEMPLATE_LANG || "pt_BR").trim();
const TEMPLATE_ANIV_LANG = (process.env.WHATSAPP_TEMPLATE_ANIV_LANG || TEMPLATE_LANG).trim();

// Versão da Graph API (configurável). Padrão v20.0 para evitar 404 de versões antigas.
const GRAPH_VERSION = process.env.GRAPH_API_VERSION || "v20.0";
const graphUrl = (path) => `https://graph.facebook.com/${GRAPH_VERSION}/${path}`;

// Throttling/Retry – controla ritmo de envios ao WhatsApp e backoff básico
const THROTTLE_CONCURRENCY = Number(process.env.THROTTLE_CONCURRENCY || 2);
const THROTTLE_DELAY_MS = Number(process.env.THROTTLE_DELAY_MS || 150);
const RETRY_MAX = Number(process.env.RETRY_MAX || 2);
const RETRY_BASE_MS = Number(process.env.RETRY_BASE_MS || 500);

let __wa_inflight = 0;
const __wa_waiting = [];
const delay = (ms) => new Promise(r => setTimeout(r, ms));
async function acquireSlot() {
  return new Promise(resolve => {
    const tryGet = async () => {
      if (__wa_inflight < THROTTLE_CONCURRENCY) {
        __wa_inflight++;
        if (THROTTLE_DELAY_MS > 0) await delay(THROTTLE_DELAY_MS);
        resolve();
      } else {
        __wa_waiting.push(tryGet);
      }
    };
    tryGet();
  });
}
function releaseSlot() {
  __wa_inflight = Math.max(0, __wa_inflight - 1);
  const next = __wa_waiting.shift();
  if (next) next();
}

// Middleware compatível para aceitar Authorization: Bearer <CHAVE_DISPARO>
// em /disparo sem quebrar o uso atual por query string ?chave=
app.use((req, res, next) => {
  try {
    if (req.path === "/disparo") {
      const authHeader = req.headers.authorization || "";
      const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
      if (bearer && !req.query.chave) {
        req.query.chave = bearer; // reaproveita a verificação existente da rota
      }
    }
    // Proteção opcional do painel via Bearer (desativada por padrão)
    if (req.path === "/painel" && String(process.env.PAINEL_REQUIRE_AUTH).toLowerCase() === "true") {
      const authHeader = req.headers.authorization || "";
      const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
      if (!process.env.CHAVE_DISPARO || bearer !== process.env.CHAVE_DISPARO) {
        return res.status(401).send("Acesso não autorizado.");
      }
    }
  } catch (e) {
    // Em caso de erro no middleware, não bloqueia a requisição
  }
  next();
});

const VERIFY_TOKEN = process.env.VERIFY_TOKEN || "";
const token = process.env.WHATSAPP_TOKEN || process.env.TOKEN_WHATSAPP || "";
const phone_number_id = process.env.WHATSAPP_PHONE_NUMBER_ID || "572870979253681";
const TELEFONE_CONTATO_HUMANO = process.env.TELEFONE_CONTATO_HUMANO;

// Healthcheck e verificação do webhook (GET)
app.get("/healthz", (req, res) => res.json({ ok: true }));
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const verifyToken = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  if (mode === "subscribe" && verifyToken && VERIFY_TOKEN && verifyToken === VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

// Rota de diagnóstico do disparo de aniversário (somente com chave)
app.get("/disparo-aniversario-debug", async (req, res) => {
  const chave = req.query.chave;
  const chaveCorreta = process.env.CHAVE_DISPARO;
  if (!chaveCorreta || chave !== chaveCorreta) return res.status(401).json({ ok:false, error:"Acesso não autorizado" });
  try {
    const diag = await diagnosticarAniversario();
    return res.json({ ok:true, tipo:"aniversario", diagnostics: diag });
  } catch (e) {
    return res.status(500).json({ ok:false, error: e?.message || String(e) });
  }
});

// ===== Helpers de diagnóstico (aniversário) =====
async function resolveTemplateAnivLang(templateName) {
  try {
    const envLang = String(process.env.WHATSAPP_TEMPLATE_ANIV_LANG || '').trim();
    if (envLang) return envLang;
    const bizId = (process.env.WHATSAPP_BUSINESS_ID || '').trim();
    const token = (process.env.WHATSAPP_TOKEN || '').trim();
    if (!bizId || !token) return process.env.WHATSAPP_TEMPLATE_LANG || 'pt_BR';
    const url = `https://graph.facebook.com/v20.0/${bizId}/message_templates?name=${encodeURIComponent(templateName)}&limit=1`;
    const { data } = await axios.get(url, { headers: { Authorization: `Bearer ${token}` }, timeout: 15000 });
    return data?.data?.[0]?.language || (process.env.WHATSAPP_TEMPLATE_LANG || 'pt_BR');
  } catch (e) {
    return process.env.WHATSAPP_TEMPLATE_LANG || 'pt_BR';
  }
}

async function diagnosticarAniversario() {
  const SPREADSHEET_ID = "13QUYrH1iRV1TwyVQhtCHjXy77XxB9Eu7R_wsCZIJDwk";
  const SHEET_NAME = "Cadastro Oficial";
  const RANGE_LER = `${SHEET_NAME}!A2:V`;
  const IDX = { NASC: 2, TEL: 6, ST_ANIV: 21 };
  const TZ = "America/Sao_Paulo";

  const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS || '{}');
  const auth = new google.auth.GoogleAuth({ credentials, scopes: ["https://www.googleapis.com/auth/spreadsheets"] });
  const client = await auth.getClient();
  const sheets = google.sheets({ version: "v4", auth: client });
  const resp = await sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: RANGE_LER, valueRenderOption: "FORMATTED_VALUE", dateTimeRenderOption: "FORMATTED_STRING" });
  const rows = resp.data.values || [];

  function parseDate(val) {
    if (val == null || val === "") return null;
    if (typeof val === "number") { const ms = Math.round((val - 25569) * 86400 * 1000); return new Date(ms); }
    const s = String(val).trim();
    const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
    if (m) { let [_, dd, mm, yyyy] = m; dd = +dd; mm = +mm - 1; yyyy = (String(yyyy).length === 2) ? 2000 + +yyyy : +yyyy; return new Date(Date.UTC(yyyy, mm, dd)); }
    const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})$/); if (iso) return new Date(Date.UTC(+iso[1], +iso[2]-1, +iso[3]));
    const d = new Date(s); return isNaN(d) ? null : d;
  }
  function todayUTC() {
    const now = new Date(); const local = new Date(now.toLocaleString("en-US", { timeZone: TZ }));
    return new Date(Date.UTC(local.getFullYear(), local.getMonth(), local.getDate()));
  }
  function isBday(val, refUTC){ const d = parseDate(val); return !!d && d.getUTCMonth()===refUTC.getUTCMonth() && d.getUTCDate()===refUTC.getUTCDate(); }
  function normTel(raw){ if(!raw) return ""; const digits=String(raw).replace(/\D/g,"").replace(/^0+/g,""); return digits.startsWith("55")?digits:`55${digits}`; }

  const hoje = todayUTC();
  const diagnostics = { today: hoje.toISOString().slice(0,10), tz: TZ, rows: rows.length, matchedBirthday: 0, skipped: [] };
  for(let i=0;i<rows.length;i++){
    const r = rows[i]; const nasc = r[IDX.NASC]; const telRaw = r[IDX.TEL]; const st=(r[IDX.ST_ANIV]||'').toString().trim();
    if (st.toLowerCase().startsWith("anivers")) { diagnostics.skipped.push({row:i+2, reason:"status_marcado"}); continue; }
    if (!isBday(nasc, hoje)) { diagnostics.skipped.push({row:i+2, reason:"nao_e_hoje", nasc:String(nasc||'')}); continue; }
    const numero = normTel(telRaw); if (!numero) { diagnostics.skipped.push({row:i+2, reason:"sem_telefone"}); continue; }
    diagnostics.matchedBirthday++;
    if (diagnostics.matchedBirthday>=5) break;
  }
  diagnostics.resolvedLang = await resolveTemplateAnivLang(process.env.WHATSAPP_TEMPLATE_ANIV_NAME || 'eac_comunicado_aniversario');
  return diagnostics;
}

// Rota POST /disparo (compatível): redireciona para GET mantendo chave/tipo
app.post("/disparo", express.json(), (req, res) => {
  try {
    const authHeader = req.headers.authorization || "";
    const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
    const chave = (req.body && req.body.chave) || req.query.chave || bearer || "";
    const tipo = (req.body && req.body.tipo) || req.query.tipo || "";
    if (!chave || !tipo) return res.status(400).send("Parâmetros obrigatórios ausentes.");
    const url = `/disparo?chave=${encodeURIComponent(chave)}&tipo=${encodeURIComponent(tipo)}`;
    return res.redirect(307, url);
  } catch (e) {
    return res.status(500).send("Erro ao processar POST /disparo");
  }
});

// ===== Modo seguro de testes (staging) =====
// DRY_RUN: evita chamadas reais ao WhatsApp; devolve resposta simulada
// ENABLE_CRON=false: desativa agendamento de crons
try {
  const isDryRun = String(process.env.DRY_RUN || "").toLowerCase() === "true" || !token;
  if (isDryRun) {
    axios.interceptors.request.use((config) => {
      const url = String(config?.url || "");
      if (url.includes("graph.facebook.com") && url.includes("/messages")) {
        console.log("[DRY_RUN] Bloqueando envio WhatsApp:", url);
        console.log("[DRY_RUN] Payload:", JSON.stringify(config.data || {}, null, 2));
        return Promise.reject({ __dryRun: true, config });
      }
      return config;
    });
    axios.interceptors.response.use(
      (resp) => resp,
      (err) => {
        if (err && err.__dryRun) {
          // Emula uma resposta de sucesso do WhatsApp
          return Promise.resolve({
            status: 200,
            statusText: "OK",
            data: { messages: [{ id: "dry-run" }] },
            headers: {},
            config: err.config,
          });
        }
        return Promise.reject(err);
      }
    );
    console.log("[DRY_RUN] Ativado (sem envios reais).\n");
  }
} catch (e) {
  console.warn("[DRY_RUN] Interceptor não aplicado:", e?.message || e);
}

// Interceptores para throttling e retry (somente endpoints de /messages da Graph)
axios.interceptors.request.use(async (config) => {
  try {
    const url = String(config?.url || "");
    if (url.includes("graph.facebook.com") && url.includes("/messages")) {
      await acquireSlot();
      config.__wa_queued = true;
      config.__wa_attempt = (config.__wa_attempt || 0) + 1;
    }
  } catch {}
  return config;
});

axios.interceptors.response.use(async (resp) => {
  try { if (resp?.config?.__wa_queued) releaseSlot(); } catch {}
  return resp;
}, async (err) => {
  const cfg = err?.config || {};
  try { if (cfg.__wa_queued) releaseSlot(); } catch {}

  const status = err?.response?.status;
  const url = String(cfg?.url || "");
  const isMessages = url.includes("graph.facebook.com") && url.includes("/messages");
  const attempt = Number(cfg.__wa_attempt || 1);
  const canRetry = isMessages && (status === 429 || (status >= 500 && status < 600)) && attempt <= RETRY_MAX;

  if (canRetry) {
    const backoff = RETRY_BASE_MS * Math.pow(2, attempt - 1);
    console.warn(`[WA-RETRY] status=${status} attempt=${attempt} backoff=${backoff}ms`);
    await delay(backoff);
    cfg.__wa_attempt = attempt + 1;
    return axios(cfg);
  }
  return Promise.reject(err);
});

try {
  if (String(process.env.ENABLE_CRON || "").toLowerCase() === "false") {
    const origSchedule = cron.schedule;
    cron.schedule = (expr, fn, opts) => {
      console.log(`[CRON] Desativado (ENABLE_CRON=false) -> ${expr}`);
      return { start() {}, stop() {}, destroy() {} };
    };
    console.log("[CRON] Todos os agendamentos estão desativados nesta instância.\n");
  }
} catch (e) {
  console.warn("[CRON] Falha ao desativar scheduler:", e?.message || e);
}

// --- INÍCIO DA ADIÇÃO ---
function getRandomMessage(messages) {
  if (Array.isArray(messages)) {
    return messages[Math.floor(Math.random() * messages.length)];
  }
  return messages;
}
// --- FIM DA ADIÇÃO ---

// logo no topo do index.js
try {
  const creds = JSON.parse(process.env.GOOGLE_CREDENTIALS || "{}");
  if (creds.client_email) {
    console.log("[SA] client_email:", creds.client_email);
  } else {
    console.warn("[SA] GOOGLE_CREDENTIALS sem client_email ou variável vazia.");
  }
} catch (e) {
  console.error("[SA] Erro ao ler GOOGLE_CREDENTIALS:", e.message);
}

function getSheetsClientLocal() {
  const creds = JSON.parse(process.env.GOOGLE_CREDENTIALS || "{}");
  if (!creds.client_email || !creds.private_key) {
    throw new Error("GOOGLE_CREDENTIALS inválido no fallback (client_email/private_key ausentes).");
  }
  const jwt = new google.auth.JWT(
    creds.client_email,
    null,
    creds.private_key,
    ["https://www.googleapis.com/auth/spreadsheets"]
  );
  return google.sheets({ version: "v4", auth: jwt });
}

// ================================================================
// NOVO GERADOR DE CALENDÁRIO (SVG -> PNG via sharp)
// Mantém tudo aqui para facilitar rollback do fluxo de eventos
// ================================================================

const CAL_PAGE_W = 960;
const CAL_PAGE_H = 540;
const CAL_MARGIN_X = 24;
const CAL_TITLE_H = 42;
const CAL_HEADER_H = 24;
const CAL_MARGIN_TOP = 20 + CAL_TITLE_H + CAL_HEADER_H + 8;
const CAL_GRID_W = CAL_PAGE_W - CAL_MARGIN_X * 2;
const CAL_GRID_H = CAL_PAGE_H - CAL_MARGIN_TOP - 20;
const CAL_COLS = 7;
const CAL_ROWS = 7; // 1 header + 6 semanas
const CAL_CELL_W = CAL_GRID_W / CAL_COLS;
const CAL_CELL_H = CAL_GRID_H / (CAL_ROWS - 1);
const CAL_MAX_EVENT_LINES = 4;
const CAL_TZ = "America/Sao_Paulo";
const CAL_DOW = ["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"];
const CAL_MONTHS = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

const __cal_cache = new Map(); // key: YYYY-MM -> { buf, expiresAt }

function calKeyFromDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
}

function startOfMonth(d) {
  const dt = new Date(d);
  dt.setDate(1); dt.setHours(0,0,0,0);
  return dt;
}

function endOfMonth(d) {
  const dt = new Date(d.getFullYear(), d.getMonth()+1, 0);
  dt.setHours(23,59,59,999);
  return dt;
}

function parseDateFlexBRorNative(s) {
  const re = /^\d{2}\/\d{2}\/\d{4}$/;
  if (re.test(s)) {
    const [dd, mm, yyyy] = s.split("/");
    const d = new Date(Number(yyyy), Number(mm)-1, Number(dd));
    if (isNaN(d.getTime())) return null;
    d.setHours(0,0,0,0);
    return d;
  }
  const d = new Date(s);
  if (isNaN(d.getTime())) return null;
  d.setHours(0,0,0,0);
  return d;
}

async function readEventosDoMes(reference) {
  const spreadsheetId = process.env.SPREADSHEET_ID_EVENTOS || "1BXitZrMOxFasCJAqkxVVdkYPOLLUDEMQ2bIx5mrP8Y8";
  const range = "comunicados!A2:G"; // B: título (idx 1), G: data (idx 6)
  const sheets = getSheetsClientLocal();
  const ini = startOfMonth(reference);
  const fim = endOfMonth(reference);

  const get = await sheets.spreadsheets.values.get({ spreadsheetId, range });
  const rows = get?.data?.values || [];
  const eventosMap = {}; // day -> [lines]

  for (const row of rows) {
    const titulo = (row[1] || '').toString().trim(); // coluna B
    const dataStr = (row[6] || '').toString().trim(); // coluna G
    if (!titulo || !dataStr) continue;
    const dt = parseDateFlexBRorNative(dataStr);
    if (!dt) continue;
    if (dt >= ini && dt <= fim) {
      const day = dt.getDate();
      const label = `${dt.toLocaleDateString('pt-BR',{ timeZone: CAL_TZ, day:'2-digit', month:'2-digit' })} - ${titulo}`;
      if (!eventosMap[day]) eventosMap[day] = [];
      eventosMap[day].push(label);
    }
  }
  // ordenar por label
  Object.keys(eventosMap).forEach(k => eventosMap[k].sort());
  const hasAny = Object.keys(eventosMap).length > 0;
  return { eventosMap, hasAny };
}

function limitarEventos(lines, max) {
  if (lines.length <= max) return lines;
  const shown = lines.slice(0, max-1);
  const rest = lines.length - (max-1);
  shown.push(`+${rest} mais`);
  return shown;
}

function buildSvgCalendario(reference, eventosMap) {
  const monthName = CAL_MONTHS[reference.getMonth()];
  const title = `Agenda de Eventos – ${monthName} ${reference.getFullYear()}`;
  const first = new Date(reference.getFullYear(), reference.getMonth(), 1);
  const firstDow = first.getDay(); // 0=Dom
  const lastDay = new Date(reference.getFullYear(), reference.getMonth()+1, 0).getDate();

  // Build SVG elements for header days and grid lines
  const headerDays = CAL_DOW.map((name, i) => {
    const x = CAL_MARGIN_X + i * CAL_CELL_W + CAL_CELL_W/2;
    const y = 20 + CAL_TITLE_H + CAL_HEADER_H - 8;
    return `<text x="${x}" y="${y}" text-anchor="middle" font-family="Arial, sans-serif" font-size="12" font-weight="700" fill="#444">${name}</text>`;
  }).join('');

  const gridTop = CAL_MARGIN_TOP;
  const linesH = Array.from({length: (CAL_ROWS-1)+1}, (_,r)=>{
    const y = gridTop + r * CAL_CELL_H;
    return `<line x1="${CAL_MARGIN_X}" y1="${y}" x2="${CAL_MARGIN_X + CAL_GRID_W}" y2="${y}" stroke="#DDD" stroke-width="1" />`;
  }).join('');
  const linesV = Array.from({length: CAL_COLS+1}, (_,c)=>{
    const x = CAL_MARGIN_X + c * CAL_CELL_W;
    return `<line x1="${x}" y1="${gridTop}" x2="${x}" y2="${gridTop + CAL_GRID_H}" stroke="#DDD" stroke-width="1" />`;
  }).join('');

  // Fill days
  let row = 0, col = firstDow;
  const cells = [];
  for (let day=1; day<=lastDay; day++) {
    const x = CAL_MARGIN_X + col * CAL_CELL_W;
    const y = gridTop + row * CAL_CELL_H;
    const dayX = x + CAL_CELL_W - 8;
    const dayY = y + 16;
    const eventos = eventosMap[day] || [];
    const lines = limitarEventos(eventos, CAL_MAX_EVENT_LINES);
    const evText = lines.map((l, idx)=>{
      const ty = y + 30 + idx*14;
      return `<text x="${x+6}" y="${ty}" font-family="Arial, sans-serif" font-size="11" fill="#222">${escapeXml(l)}</text>`;
    }).join('');
    cells.push(
      `<text x="${dayX}" y="${dayY}" text-anchor="end" font-family="Arial, sans-serif" font-size="12" font-weight="700" fill="#222">${day}</text>` +
      evText
    );
    col++; if (col>=CAL_COLS) { col=0; row++; }
  }

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${CAL_PAGE_W}" height="${CAL_PAGE_H}" viewBox="0 0 ${CAL_PAGE_W} ${CAL_PAGE_H}" xmlns="http://www.w3.org/2000/svg">
  <rect x="0" y="0" width="${CAL_PAGE_W}" height="${CAL_PAGE_H}" fill="#FFFFFF" />
  <text x="${CAL_PAGE_W/2}" y="${20 + CAL_TITLE_H - 12}" text-anchor="middle" font-family="Arial, sans-serif" font-size="22" font-weight="700" fill="#111">${escapeXml(title)}</text>
  ${headerDays}
  ${linesH}
  ${linesV}
  ${cells.join('')}
</svg>`;
  return svg;
}

function escapeXml(s="") {
  return s.replace(/[&<>]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[ch]));
}

async function getOrRenderCalendarPng(monthStr) {
  const now = Date.now();
  const cached = __cal_cache.get(monthStr);
  if (cached && cached.expiresAt > now) return cached.buf;

  const [y, m] = monthStr.split('-').map(Number);
  const ref = new Date(y, m-1, 1);
  const { eventosMap, hasAny } = await readEventosDoMes(ref);

  if (!hasAny) {
    // Gera uma imagem simples "Sem eventos" para manter compatibilidade visual
    const svg = `<?xml version="1.0"?><svg width="${CAL_PAGE_W}" height="${CAL_PAGE_H}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#fff"/><text x="50%" y="50%" font-family="Arial, sans-serif" font-size="24" text-anchor="middle" fill="#333">Sem eventos neste mês</text></svg>`;
    const buf = await sharp(Buffer.from(svg)).png().toBuffer();
    __cal_cache.set(monthStr, { buf, expiresAt: now + 60*60*1000 }); // 1h
    return buf;
  }

  const refDate = new Date(y, m-1, 1);
  const svg = buildSvgCalendario(refDate, eventosMap);
  const png = await sharp(Buffer.from(svg)).png().toBuffer();
  __cal_cache.set(monthStr, { buf: png, expiresAt: now + 6*60*60*1000 }); // 6h
  return png;
}

// Rota PNG direta
app.get('/eventos/calendario.png', async (req, res) => {
  try {
    const d = new Date();
    const monthStr = (req.query.month && /\d{4}-\d{2}/.test(req.query.month))
      ? req.query.month
      : `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    const png = await getOrRenderCalendarPng(monthStr);
    res.set('Content-Type','image/png');
    res.set('Cache-Control','public, max-age=3600');
    return res.send(png);
  } catch (e) {
    console.error('[EventosPNG] Erro:', e?.message || e);
    return res.status(500).send('erro');
  }
});

// Rota JSON compatível com contrato antigo
app.get('/eventos/status.json', async (req, res) => {
  try {
    const d = new Date();
    const monthStr = (req.query.month && /\d{4}-\d{2}/.test(req.query.month))
      ? req.query.month
      : `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    const [y, m] = monthStr.split('-').map(Number);
    const ref = new Date(y, m-1, 1);
    const { hasAny } = await readEventosDoMes(ref);
    if (!hasAny) return res.json({ status: 'SEM_EVENTOS' });
    const baseUrl = (process.env.PUBLIC_BASE_URL || '').trim() || `${req.protocol}://${req.get('host')}`;
    const link = `${baseUrl}/eventos/calendario.png?month=${monthStr}`;
    return res.json({ status: 'OK', links: [link] });
  } catch (e) {
    console.error('[EventosJSON] Erro:', e?.message || e);
    return res.json({ status: 'ERRO', erro: e?.message || String(e) });
  }
});

// sender WA mínimo (usado só se você não tiver um global)
async function enviarWhatsAppTemplateLocal(numero, templateName, variaveis = []) {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneNumberId) throw new Error("WHATSAPP_TOKEN/WHATSAPP_PHONE_NUMBER_ID não configurados.");

  const url = `https://graph.facebook.com/v20.0/${phoneNumberId}/messages`;
  const body = {
    messaging_product: "whatsapp",
    to: numero,
    type: "template",
    template: {
      name: templateName,
      language: { code: TEMPLATE_LANG },
      components: variaveis.length
        ? [{ type: "body", parameters: variaveis.map(v => ({ type: "text", text: `${v}` })) }]
        : undefined,
    },
  };

  const resp = await axios.post(url, body, {
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    timeout: 20000,
  });
  return resp?.data?.messages?.[0]?.id;
}



//função de saudação

function ehSaudacao(texto) {
  const saudacoes = ["oi", "olá", "ola", "bom dia", "boa tarde", "boa noite", "e aí", "eai", "opa"];
  return saudacoes.includes(texto.toLowerCase());
}

// Função para montar o menu principal interativo com botões

// ================================================================
// SISTEMA DE MENUS INTERATIVOS
// ================================================================
function montarMenuPrincipalInterativo() {
  return {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    type: "interactive",
    interactive: {
      type: "list",
      header: { type: "text", text: "📋 Menu Principal - EAC Porciúncula" },
      body: {
        text: "Como posso te ajudar hoje? Escolha uma das opções:\n\nToque no botão abaixo para ver as opções."
      },
      footer: { text: "11:22" },
      action: {
        button: "Ver opções",
        sections: [
          {
            title: "📝 Inscrições",
            rows: [
              { id: "1", title: "Formulário Encontristas", description: "Inscrição para adolescentes" },
              { id: "2", title: "Formulário Encontreiros", description: "Inscrição para equipe" }
            ]
          },
          {
            title: "📱 Contatos e Redes",
            rows: [
              { id: "3", title: "Instagram do EAC", description: "Nosso perfil oficial" },
              { id: "4", title: "E-mail de contato", description: "Fale conosco por e-mail" },
              { id: "5", title: "WhatsApp da Paróquia", description: "Contato direto" }
            ]
          },
          {
            title: "📅 Eventos e Conteúdo",
            rows: [
              { id: "6", title: "Eventos do EAC", description: "Agenda de eventos" },
              { id: "7", title: "Playlist no Spotify", description: "Nossas músicas" },
              { id: "9", title: "Mensagem do Dia", description: "Inspiração diária" },
              { id: "10", title: "Versículo do Dia", description: "Palavra de Deus" }
            ]
          }
        ]
      }
    }
  };
}

// Função para montar o menu principal em texto (fallback)
function montarMenuPrincipal() {
  return (
    "📋 *Menu Principal - EAC Porciúncula* 📋\n\n" +
    "1 - 1️⃣ Formulário de Inscrição para Encontristas\n" +
    "2 - 2️⃣ Formulário de Inscrição para Encontreiros\n" +
    "3 - 📸 Instagram do EAC\n" +
    "4 - 📬 E-mail de contato\n" +
    "5 - 📱 WhatsApp da Paróquia\n" +
    "6 - 📅 Eventos do EAC\n" +
    "7 - 🎵 Playlist no Spotify\n" +
    //"8 - 💬 Falar com um Encontreiro\n" +
    "9 - 💡 Mensagem do Dia\n" +
    "10 - 📖 Versículo do Dia\n\n" +
    "Digite o número correspondente à opção desejada. 👇"
  );
}

// Enviar mensagem para número via WhatsApp Cloud API

// ================================================================
// SISTEMA DE ENVIO DE MENSAGENS (Texto e Interativo)
// ================================================================
async function enviarMensagem(numero, mensagem) {
  try {
    await axios.post(
      graphUrl(`${phone_number_id}/messages`),
      {
        messaging_product: "whatsapp",
        to: numero,
        text: { body: mensagem }
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        }
      }
    );
    console.log("✅ Mensagem enviada com sucesso para:", numero);
  } catch (error) {
    console.error("❌ Erro ao enviar mensagem:", JSON.stringify(error.response?.data || error, null, 2));
  }
}

// Enviar mensagem interativa para número via WhatsApp Cloud API
async function enviarMensagemInterativa(numero, mensagemInterativa) {
  try {
    const payload = {
      ...mensagemInterativa,
      to: numero
    };

    await axios.post(
      graphUrl(`${phone_number_id}/messages`),
      payload,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      }
    );
    console.log("✅ Mensagem interativa enviada com sucesso para:", numero);
  } catch (error) {
    console.error("❌ Erro ao enviar mensagem interativa:", JSON.stringify(error.response?.data || error, null, 2));
  }
}

// Função para envio de template de lembrete de evento

// ================================================================
// ENVIO DE TEMPLATES WHATSAPP BUSINESS
// ================================================================
async function enviarTemplateLembreteEvento(numero, eventoNome, dataEvento) {
  try {
    // Validação dos parâmetros obrigatórios
    if (!numero || !eventoNome || !dataEvento) {
      console.error(`❌ Parâmetros inválidos. Dados recebidos: numero=${numero}, eventoNome=${eventoNome}, dataEvento=${dataEvento}`);
      return;
    }

    // Log antes do envio
    console.log(`📨 Preparando envio para: ${numero}`);
    console.log(`📅 Evento: ${eventoNome} | Data: ${dataEvento}`);
    console.log(`Debug: Parâmetros do template - eventoNome: ${eventoNome}, dataEvento: ${dataEvento}`);
    console.log(`Debug: Objeto template completo: ${JSON.stringify({
          name: "eac_lembrete_v1", // <-- NOME DO TEMPLATE ATUALIZADO AQUI
          language: { code: TEMPLATE_LANG },
          components: [
            {
              type: "body",
              parameters: [
                { type: "text", text: eventoNome },                             // Mapeia para {{evento_nome}}
                { type: "text", text: "15/06/2025" },                           // Mapeia para {{prazo_resposta}}
                { type: "text", text: dataEvento },                             // Mapeia para {{data_evento}}
                { type: "text", text: "09:00 às 18:00" }                       // Mapeia para {{hora_evento}}
              ]
            }
          ]
        }, null, 2)}`);

    await axios.post(
      graphUrl(`${phone_number_id}/messages`),
      {
        messaging_product: "whatsapp",
        to: numero,
        type: "template",
        template: {
          name: "eac_lembrete_v1", // <-- NOME DO TEMPLATE ATUALIZADO AQUI
          language: { code: TEMPLATE_LANG },
          components: [
            {
              type: "body",
              parameters: [
                { type: "text", text: eventoNome },
                { type: "text", text: "15/06/2025" },
                { type: "text", text: dataEvento },
                { type: "text", text: "09:00" }
              ]
            }
          ]
        }
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        }
      }
     );

    console.log(`✅ Template enviado com sucesso para: ${numero}`);
  } catch (error) {
    console.error(`❌ Erro ao enviar template para o número ${numero}:`, JSON.stringify(error.response?.data || error, null, 2));
  }
}

// Atualiza contatos pendentes para ativo

// ================================================================
// ATUALIZAÇÃO DE STATUS DOS CONTATOS NA PLANILHA
// ================================================================
async function reativarContatosPendentes() {
  try {
    const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });
    const client = await auth.getClient();
    const sheets = google.sheets({ version: "v4", auth: client });

    const atualizarPendentes = async (spreadsheetId) => {
      const range = "fila_envio!G2:G";
      const getRes = await sheets.spreadsheets.values.get({ spreadsheetId, range });
      const values = getRes.data.values || [];
      const updates = values.map((row) => row[0] === "Pendente" ? ["Ativo"] : [row[0]]);

      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range,
        valueInputOption: "RAW",
        resource: { values: updates },
      });
    };

    await atualizarPendentes("1BXitZrMOxFasCJAqkxVVdkYPOLLUDEMQ2bIx5mrP8Y8");
    await atualizarPendentes("1M5vsAANmeYk1pAgYjFfa3ycbnyWMGYb90pKZuR9zNo4");

    console.log("🔄 Contatos com status 'Pendente' atualizados para 'Ativo'.");
  } catch (error) {
    console.error("Erro ao atualizar contatos:", error);
  }
}

// Verificação e resposta automática a saudações
function ehSaudacao(texto) {
  const saudacoes = ["oi", "olá", "ola", "bom dia", "boa tarde", "boa noite", "menu"];
  return saudacoes.some(s => texto.includes(s));
}

// Verifica eventos da aba 'comunicados' para enviar lembrete

// ================================================================
// LÓGICA DE VERIFICAÇÃO DE EVENTOS PARA DISPAROS
// ================================================================
async function verificarEventosParaLembrete() {
  try {
    const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });

    const sheets = google.sheets({ version: "v4", auth: await auth.getClient() });
    const spreadsheetIdEventos = "1BXitZrMOxFasCJAqkxVVdkYPOLLUDEMQ2bIx5mrP8Y8";
    const rangeEventos = "comunicados!A2:G";
    const response = await sheets.spreadsheets.values.get({ spreadsheetId: spreadsheetIdEventos, range: rangeEventos });
    const rows = response.data.values;
    if (!rows) return;

    const hoje = new Date();
    const seteDiasDepois = new Date(hoje);
    seteDiasDepois.setDate(hoje.getDate() + 60);

    const eventosDaSemana = [];

    for (const row of rows) {
      const valorData = row[6]; // Coluna G da planilha
      if (!valorData) continue;

      let dataEvento;
      if (/^\d{2}\/\d{2}\/\d{4}$/.test(valorData)) { 
        const [dia, mes, ano] = valorData.split("/");
        dataEvento = new Date(`${ano}-${mes}-${dia}`);
      } else {
        dataEvento = new Date(valorData);
      }

      if (!isNaN(dataEvento.getTime()) && dataEvento >= hoje && dataEvento <= seteDiasDepois) {
        const titulo = row[1] || "(Sem título)";
        const dataFormatada = `${dataEvento.getDate().toString().padStart(2, '0')}/${(dataEvento.getMonth() + 1).toString().padStart(2, '0')}`;
        eventosDaSemana.push({
          nome: titulo,
          data: dataFormatada
        });
      }
    }

    const planilhas = [
      "1BXitZrMOxFasCJAqkxVVdkYPOLLUDEMQ2bIx5mrP8Y8",
      "1M5vsAANmeYk1pAgYjFfa3ycbnyWMGYb90pKZuR9zNo4"
    ];

    for (const spreadsheetId of planilhas) {
      const rangeFila = "Fila_Envio!F2:G";
      const fila = await sheets.spreadsheets.values.get({ spreadsheetId, range: rangeFila });
      const contatos = fila.data.values || [];

      const numeros = contatos
        .map(([numero, status], idx) => ({ numero, status, idx }))
        .filter(c => c.status === "Ativo");

      console.log("📨 Contatos ativos:", numeros.length);
      const updates = contatos.map(([numero, status]) => [status]);

      if (eventosDaSemana.length > 0) {
        const saudacao = "🌞 Bom dia! Aqui é o EAC Porciúncula trazendo um resumo dos próximos eventos:\n";
        const cabecalho = `📅 *Agenda da Semana (${hoje.toLocaleDateString()} a ${seteDiasDepois.toLocaleDateString()})*\n\n`;
        const corpo = eventosDaSemana.join("\n");
        const rodape = "\n👉 Se tiver dúvida, fale com a gente!";

        const mensagemFinal = `${saudacao}${cabecalho}${corpo}${rodape}`;

      for (const contato of numeros) {
        for (const evento of eventosDaSemana) {
          await enviarTemplateLembreteEvento(contato.numero, evento.nome, evento.data);
        }
        updates[contato.idx] = ["Pendente"];
      }

      } else {
        console.log("Nenhum evento na próxima semana.");
      }

      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: "fila_envio!G2:G",
        valueInputOption: "RAW",
        resource: { values: updates },
      });
    }
    if (updatesEncontreiros.length) {
      try {
        if (String(process.env.SHEETS_READ_ONLY||"").toLowerCase() === "true") {
          console.log(`[Sheets] READ_ONLY ativo - ${updatesEncontreiros.length} células não serão gravadas (Encontreiros).`);
        } else {
          await sheets.spreadsheets.values.batchUpdate({
            spreadsheetId: planilhaEncontreirosId,
            requestBody: { valueInputOption: "RAW", data: updatesEncontreiros }
          });
          console.log(`[Sheets] Encontreiros batchUpdate: ${updatesEncontreiros.length} células.`);
        }
      } catch (e) {
        console.warn("[Sheets] Falha batchUpdate Encontreiros:", e?.response?.status || e?.message || e);
      }
    }

  } catch (erro) {
    console.error("Erro ao verificar eventos:", erro);
  }
}

// Webhook principal

// ================================================================
// WEBHOOK PRINCIPAL - RECEBIMENTO DE MENSAGENS DO WHATSAPP
// ================================================================
app.post("/webhook", async (req, res) => {
  const body = req.body;
  if (body.object) {
    const mensagem = body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    if (!mensagem || !mensagem.from) return res.sendStatus(200);

    const numero = mensagem.from;
    let textoRecebido = "";
    if (mensagem.text) textoRecebido = mensagem.text.body.toLowerCase().trim();
    else if (mensagem.interactive) {
      if (mensagem.interactive.type === "list_reply") textoRecebido = mensagem.interactive.list_reply.id;
      else if (mensagem.interactive.type === "button_reply") textoRecebido = mensagem.interactive.button_reply.id;
    }

    if (!textoRecebido) return res.sendStatus(200);

    if (ehSaudacao(textoRecebido)) {
      const menu = montarMenuPrincipalInterativo();
      await enviarMensagemInterativa(numero, menu);
      return res.sendStatus(200);
    }

    const respostas = {
      "1": [
        "📝 *Inscrição de Encontristas*\n\nSe você quer participar como *adolescente encontrista* no nosso próximo EAC, preencha este formulário com atenção:\n👉 https://docs.google.com/forms/d/e/1FAIpQLScrESiqWcBsnqMXGwiOOojIeU6ryhuWwZkL1kMr0QIeosgg5w/viewform?usp=preview",
        "🎉 Que legal! Para se inscrever como *adolescente encontrista*, acesse:\n👉 https://docs.google.com/forms/d/e/1FAIpQLScrESiqWcBsnqMXGwiOOojIeU6ryhuWwZkL1kMr0QIeosgg5w/viewform?usp=preview"
      ],
      "2": ["📝 *Inscrição de Encontreiros*\n\nVocê deseja servir nessa missão linda como *encontreiro*? Preencha aqui:\n👉 https://forms.gle/VzqYTs9yvnACiCew6"],
      "3": ["📸 *Nosso Instagram Oficial*\n\n👉 https://www.instagram.com/eacporciuncula/"],
      "4": ["📬 *Fale conosco por e-mail*\n\n✉️ eacporciunculadesantana@gmail.com"],
      "5": ["📱 *WhatsApp da Paróquia*\n\n👉 https://wa.me/5521981140278"],
      "7": ["🎵 *Playlist no Spotify*\n\n👉 https://open.spotify.com/playlist/1TC8C71sbCZM43ghR1giWH?si=zyXIhEfvSWSKG21GTIoazA&pi=FxazNzY4TJWns"]
    };

    if (respostas[textoRecebido]) {
      const mensagemParaEnviar = getRandomMessage(respostas[textoRecebido]);
      await enviarMensagem(numero, mensagemParaEnviar);
      return res.sendStatus(200);
    }

    // ===== NOVO FLUXO (SVG+sharp) para opção "6 - Eventos" =====
    // Mantém bloco legado abaixo para rollback, porém este if consome e retorna antes
    if (textoRecebido === "6") {
      const saudacao = "�Y". *Agenda de Eventos do EAC - MǦs Atual";
      try {
        const baseUrl = (process.env.PUBLIC_BASE_URL || '').trim() || `${req.protocol}://${req.get('host')}`;
        const dNow = new Date();
        const monthStr = `${dNow.getFullYear()}-${String(dNow.getMonth()+1).padStart(2,'0')}`;
        const link = `${baseUrl}/eventos/calendario.png?month=${monthStr}`;

        // Checa status para evitar enviar imagem vazia
        try {
          const st = await axios.get(`${baseUrl}/eventos/status.json?month=${monthStr}`, { timeout: 8000 });
          if (st?.data?.status === 'SEM_EVENTOS') {
            await enviarMensagem(numero, "�s���? Ainda nǜo hǭ eventos cadastrados para este mǦs.");
            return res.sendStatus(200);
          }
        } catch (_) { /* segue */ }

        await enviarMensagem(numero, saudacao);
        await axios.post(
          graphUrl(`${phone_number_id}/messages`),
          {
            messaging_product: "whatsapp",
            to: numero,
            type: "image",
            image: { link },
          },
          { headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } }
        );
      } catch (erro) {
        console.error("[Eventos/6] Erro ao gerar/enviar calendário:", erro?.response?.data || erro?.message || erro);
        await enviarMensagem(numero, "�?O Nǜo conseguimos carregar a agenda agora. Tente novamente mais tarde.");
      }

      return res.sendStatus(200);
    }
    
    // [LEGADO - Apps Script] Bloco abaixo mantido para rollback; fluxo novo retorna antes
    if (textoRecebido === "6") {
      const saudacao = "📅 *Agenda de Eventos do EAC - Mês Atual*";
      try {
        const resposta = await axios.get(process.env.URL_APP_SCRIPT_EVENTOS);
        const { status, links } = resposta.data;

        if (status === "SEM_EVENTOS") {
          await enviarMensagem(numero, "⚠️ Ainda não há eventos cadastrados para este mês.");
        } else if (links) {
          const imagens = Array.isArray(links) ? links : [links];
          await enviarMensagem(numero, saudacao);
          for (const link of imagens) {
            await axios.post(
              graphUrl(`${phone_number_id}/messages`),
              {
                messaging_product: "whatsapp",
                to: numero,
                type: "image",
                image: { link },
              },
              {
                headers: {
                  Authorization: `Bearer ${token}`,
                  "Content-Type": "application/json",
                },
              }
            );
          }
        } else {
          await enviarMensagem(numero, "⚠️ Ocorreu um erro ao buscar os eventos.");
        }
      } catch (erro) {
        console.error("Erro ao buscar eventos do mês:", erro);
        await enviarMensagem(numero, "❌ Não conseguimos carregar a agenda agora. Tente novamente mais tarde.");
      }

      return res.sendStatus(200);
    }

    const fallback = [
      "🤖 Opa! Não entendi bem sua mensagem...",
      "🔎 Posso te ajudar com:\n• Inscrições\n• Eventos\n• Contato com a coordenação"
    ];
    if (TELEFONE_CONTATO_HUMANO) {
      fallback.push(`📌 Para falar com alguém agora: wa.me/${TELEFONE_CONTATO_HUMANO}`);
    } else {
      fallback.push("📌 Envie um e-mail para eacporciunculadesantana@gmail.com com o assunto 'Quero falar com alguém'");
    }
    fallback.push("Enquanto isso, veja o menu novamente 👇");

    await enviarMensagem(numero, fallback.join("\n\n"));
    const menu = montarMenuPrincipalInterativo();
    await enviarMensagemInterativa(numero, menu);
    return res.sendStatus(200);
  }
  res.sendStatus(404);
});

// Função para gerar mensagens com OpenAI

// ================================================================
// INTEGRAÇÃO COM OPENAI - GERAÇÃO DE CONTEÚDO
// ================================================================
async function gerarMensagemOpenAI(prompt) {
  const apiKey = process.env.OPENAI_API_KEY;
  const resposta = await axios.post(
    "https://api.openai.com/v1/chat/completions",
    {
      model: "gpt-3.5-turbo",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.8,
      max_tokens: 150,
    },
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
    }
  );

  return resposta.data.choices[0].message.content.trim();
}

// Função para disparar eventos da semana SEM usar template (texto normal)

// ================================================================
// DISPARO DE EVENTOS SEM TEMPLATE
// ================================================================
async function dispararEventosSemTemplate() {
  try {
    const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    } );
    const client = await auth.getClient();
    const sheets = google.sheets({ version: "v4", auth: client });

    // 1. Busca os eventos (sem alteração aqui)
    const spreadsheetIdEventos = process.env.SPREADSHEET_ID_EVENTOS; // Assumindo que este é o ID da planilha de comunicados
    const rangeEventos = "comunicados!A2:G";
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: spreadsheetIdEventos,
      range: rangeEventos,
    });

    const rows = response.data.values;
    if (!rows) {
      console.log("Nenhum evento encontrado na planilha de comunicados.");
      return;
    }

    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const seteDiasDepois = new Date(hoje);
    seteDiasDepois.setDate(hoje.getDate() + 7); // Ou 30, se você já alterou

    const eventosDaSemana = rows
      .map((row, index) => {
        const titulo = row[1] || "(Sem título)";
        const dataTexto = row[6];
        if (!dataTexto || dataTexto.trim() === '') return null;

        let dataEvento;
        if (/^\d{2}\/\d{2}\/\d{4}$/.test(dataTexto.trim())) {
          const [dia, mes, ano] = dataTexto.trim().split("/");
          dataEvento = new Date(`${ano}-${mes}-${dia}`);
        } else {
          dataEvento = new Date(dataTexto.trim());
        }

        if (!isNaN(dataEvento.getTime()) && dataEvento >= hoje && dataEvento <= seteDiasDepois) {
          return `📅 *${titulo}* - ${dataTexto}`;
        }
        return null;
      })
      .filter(e => e);

    if (eventosDaSemana.length === 0) {
      console.log("Nenhum evento nos próximos 7 dias.");
      return;
    }

    const mensagemFinal = `📢 *Próximos Eventos do EAC:*\n\n${eventosDaSemana.join("\n")}\n\n🟠 Se tiver dúvidas, fale com a gente!`;

    // 2. Lógica de envio para as planilhas de contatos
    // Usaremos um Set para garantir que cada número receba a mensagem apenas uma vez
    const numerosJaEnviados = new Set();

    // Planilha de Encontreiros (permanece a mesma)
    const planilhaEncontreirosId = "1M5vsAANmeYk1pAgYjFfa3ycbnyWMGYb90pKZuR9zNo4";
    console.log(`📂 Acessando planilha de Encontreiros: ${planilhaEncontreirosId}`);
    const rangeFilaEncontreiros = "Fila_Envio!F2:H"; // Colunas F (número) e H (status)
    const filaEncontreirosResponse = await sheets.spreadsheets.values.get({
      spreadsheetId: planilhaEncontreirosId,
      range: rangeFilaEncontreiros,
    });
    const contatosEncontreiros = filaEncontreirosResponse.data.values || [];
    console.log(`🔍 Verificando ${contatosEncontreiros.length} registros na planilha de Encontreiros...`);

    for (let i = 0; i < contatosEncontreiros.length; i++) {
      const numero = contatosEncontreiros[i][0];
      const statusEnvio = contatosEncontreiros[i][2]; // Coluna H

      if (!numero || statusEnvio === "Enviado" || numerosJaEnviados.has(numero)) {
        if (numerosJaEnviados.has(numero)) {
          console.log(`⏭️ Pulando ${numero} (Encontreiros): já processado nesta execução.`);
        } else {
          console.log(`⏭️ Pulando linha ${i + 2} (Encontreiros): já enviado ou sem número.`);
        }
        continue;
      }

      try {
        await enviarMensagem(numero, mensagemFinal);
        console.log(`✅ Evento enviado para ${numero} (Encontreiros)`);
        numerosJaEnviados.add(numero);

        const updateRange = `fila_envio!H${i + 2}`;
        await sheets.spreadsheets.values.update({
          spreadsheetId: planilhaEncontreirosId,
          range: updateRange,
          valueInputOption: "RAW",
          resource: { values: [["Enviado"]] },
        });
      } catch (erroEnvio) {
        console.error(`❌ Erro ao enviar evento para ${numero} (Encontreiros):`, erroEnvio.message);
        const updateRange = `fila_envio!H${i + 2}`;
        await sheets.spreadsheets.values.update({
          spreadsheetId: planilhaEncontreirosId,
          range: updateRange,
          valueInputOption: "RAW",
          resource: { values: [["Erro"]] },
        });
      }
    }

    // NOVA Planilha de Cadastro Oficial (substitui a de Encontristas)
    const planilhaCadastroOficialId = "1I988yRvGYfjhoqmFvdQbjO9qWzTB4T6yv0dDBxQ-oEg";
    const abaCadastroOficial = "Cadastro_Oficial";
    // Coluna G para número (índice 0 do range G2:U)
    // Coluna U para status de envio (índice 14 do range G2:U)
    const rangeCadastroOficial = `${abaCadastroOficial}!G2:U`;

    console.log(`📂 Acessando planilha de Cadastro Oficial: ${planilhaCadastroOficialId}`);
    const cadastroOficialResponse = await sheets.spreadsheets.values.get({
      spreadsheetId: planilhaCadastroOficialId,
      range: rangeCadastroOficial,
    });
    const contatosCadastroOficial = cadastroOficialResponse.data.values || [];
    console.log(`🔍 Verificando ${contatosCadastroOficial.length} registros na planilha de Cadastro Oficial...`);

    for (let i = 0; i < contatosCadastroOficial.length; i++) {
      const numero = contatosCadastroOficial[i][0]; // Coluna G
      const statusEnvio = contatosCadastroOficial[i][14]; // Coluna U

      if (!numero || statusEnvio === "Enviado" || numerosJaEnviados.has(numero)) {
        if (numerosJaEnviados.has(numero)) {
          console.log(`⏭️ Pulando ${numero} (Cadastro Oficial): já processado nesta execução.`);
        } else {
          console.log(`⏭️ Pulando linha ${i + 2} (Cadastro Oficial): já enviado ou sem número.`);
        }
        continue;
      }

      try {
        await enviarMensagem(numero, mensagemFinal);
        console.log(`✅ Evento enviado para ${numero} (Cadastro Oficial)`);
        numerosJaEnviados.add(numero);

        // ATUALIZA O STATUS NA COLUNA U DA PLANILHA DE CADASTRO OFICIAL
        const updateRange = `${abaCadastroOficial}!U${i + 2}`;
        await sheets.spreadsheets.values.update({
          spreadsheetId: planilhaCadastroOficialId,
          range: updateRange,
          valueInputOption: "RAW",
          resource: { values: [["Enviado"]] },
        });
      } catch (erroEnvio) {
        console.error(`❌ Erro ao enviar evento para ${numero} (Cadastro Oficial):`, erroEnvio.message);
        const updateRange = `${abaCadastroOficial}!U${i + 2}`;
        await sheets.spreadsheets.values.update({
          spreadsheetId: planilhaCadastroOficialId,
          range: updateRange,
          valueInputOption: "RAW",
          resource: { values: [["Erro"]] },
        });
      }
    }

    console.log("✅ Disparo de eventos sem template concluído.");
  } catch (error) {
    console.error("❌ Erro ao disparar eventos sem template:", error);
  }
}

// Atualização do endpoint /disparo para incluir comunicado_geral

// ================================================================
// ENDPOINT MANUAL DE DISPAROS (via URL)
// ================================================================
app.get("/disparo", async (req, res) => {
  const chave = req.query.chave;
  const tipo = req.query.tipo;
  const chaveCorreta = process.env.CHAVE_DISPARO;

  if (chave !== chaveCorreta) {
    return res.status(401).send("❌ Acesso não autorizado.");
  }

  try {
    if (tipo === "boasvindas") {
      console.log("🚀 Disparando boas-vindas para todos os contatos ativos...");
      await dispararBoasVindasParaAtivos();
      return res.status(200).send("✅ Boas-vindas enviadas com sucesso.");
    }

    if (tipo === "eventos") {
      console.log("🚀 Disparando eventos da semana (sem template)...");
      await dispararEventosSemTemplate();
      return res.status(200).send("✅ Eventos da semana enviados com sucesso.");
    }

    if (tipo === "agradecimento_inscricao") {
      console.log("🚀 Disparando agradecimento de inscrição...");
      await dispararAgradecimentoInscricaoParaNaoIncluidos();
      return res.status(200).send("✅ Agradecimento enviado com sucesso.");
    }

    if (tipo === "comunicado_geral") {
      console.log("🚀 Disparando comunicado geral para contatos da fila_envio...");
      await dispararComunicadoGeralFila();
      return res.status(200).send("✅ Comunicado geral enviado com sucesso.");
    }

    if (tipo === "aniversario") {
      console.log("🚀 Disparando Felicitações de Aniversário (hoje)…");
      const result = await enviarComunicadoAniversarioHoje({
        getSheetsClient: (typeof getSheetsClient === "function" ? getSheetsClient : getSheetsClientLocal),
        // sendWhatsAppTemplate omitido para usar o sender interno com idioma específico
      });
      return res.json({ ok: true, tipo, ...result });
    }

  
    console.log("📢 Tipo de disparo inválido ou não informado.");
    res.status(400).send("❌ Tipo de disparo inválido. Use tipo=boasvindas ou tipo=eventos.");
  } catch (erro) {
    console.error("❌ Erro no disparo manual:", erro);
    res.status(500).send("❌ Erro ao processar o disparo.");
  }
});

// CRON Jobs

// ================================================================
// AGENDAMENTO AUTOMÁTICO VIA CRON
// ================================================================
cron.schedule("50 08 * * *", () => {
  console.log("🔁 Reativando contatos com status pendente...");
  reativarContatosPendentes();
});


// ================================================================
// AGENDAMENTO AUTOMÁTICO VIA CRON
// ================================================================
cron.schedule("00 09 * * *", () => {
  console.log("⏰ Executando verificação de eventos para lembrete às 09:00...");
  verificarEventosParaLembrete();
});

// Função para envio do template de boas-vindas (primeiro contato)
async function enviarTemplateBoasVindas(numero) {
  try {
    console.log(`📨 Enviando template de boas-vindas para: ${numero}`);

      await axios.post(
        graphUrl(`${phone_number_id}/messages`),
      {
        messaging_product: "whatsapp",
        to: numero,
        type: "template",
        template: {
          name: "eac_boasvindas_v1",
          language: { code: TEMPLATE_LANG }
        }
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        }
      }
    );

    console.log(`✅ Template de boas-vindas enviado com sucesso para: ${numero}`);
  } catch (error) {
    console.error(`❌ Erro ao enviar boas-vindas para ${numero}:`, JSON.stringify(error.response?.data || error, null, 2));
  }
}

// Função para disparar boas-vindas para todos os contatos ativos nas duas planilhas
async function dispararBoasVindasParaAtivos() {
  try {
    const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });
    const client = await auth.getClient();
    const sheets = google.sheets({ version: "v4", auth: client });

    const planilhas = [
      "1BXitZrMOxFasCJAqkxVVdkYPOLLUDEMQ2bIx5mrP8Y8", // Encontristas
      "1M5vsAANmeYk1pAgYjFfa3ycbnyWMGYb90pKZuR9zNo4"  // Encontreiros
    ];

    const numerosUnicos = new Set();

    for (const spreadsheetId of planilhas) {
      const rangeFila = "fila_envio!F2:G";
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: rangeFila,
      });

      const contatos = response.data.values || [];

      contatos.forEach(([numero, status]) => {
        if (status === "Ativo") {
          numerosUnicos.add(numero);
        }
      });
    }

    console.log(`📨 Total de contatos únicos para disparo: ${numerosUnicos.size}`);

    for (const numero of numerosUnicos) {
      console.log(`📨 Enviando template de boas-vindas para: ${numero}`);
      await enviarTemplateBoasVindas(numero);
    }

    console.log("✅ Disparo de boas-vindas concluído.");

  } catch (error) {
    console.error("❌ Erro ao disparar boas-vindas para contatos ativos:", error);
  }
}

app.get("/dispararConfirmacaoParticipacao", async (req, res) => {
  const chave = req.query.chave;
  const chaveCorreta = process.env.CHAVE_DISPARO;

  if (chave !== chaveCorreta) {
    return res.status(401).send("❌ Acesso não autorizado.");
  }

  try {
    const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });
    const client = await auth.getClient();
    const sheets = google.sheets({ version: "v4", auth: client });

    const spreadsheetId = "1I988yRvGYfjhoqmFvdQbjO9qWzTB4T6yv0dDBxQ-oEg";
    const aba = "Inscricoes_Prioritarias";
    const range = `${aba}!A2:W76`;  // Linhas 2 a 73, até a coluna W

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range,
    });

    const rows = response.data.values || [];

    console.log(`🔎 Total de registros carregados da aba ${aba}: ${rows.length}`);

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const numeroWhatsApp = row[6];  // Coluna G = índice 6
      const statusEnvio = row[22];    // Coluna W = índice 22

      if (!numeroWhatsApp || statusEnvio === "Enviado") {
        console.log(`⏭️ Pulando linha ${i + 2}: número vazio ou já enviado.`);
        continue;
      }

      console.log(`📨 Enviando template de confirmação para: ${numeroWhatsApp}`);

      try {
        await axios.post(
          graphUrl(`${phone_number_id}/messages`),
          {
            messaging_product: "whatsapp",
            to: numeroWhatsApp,
            type: "template",
            template: {
              name: "eac_confirmar_participacao_v1",
              language: { code: TEMPLATE_LANG },
            },
          },
          {
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
          }
        );

        // Atualizar status na coluna W (linha correta)
        const updateRange = `${aba}!W${i + 2}`;
        await sheets.spreadsheets.values.update({
          spreadsheetId,
          range: updateRange,
          valueInputOption: "RAW",
          resource: { values: [["Enviado"]] },
        });

        console.log(`✅ Mensagem enviada e status marcado na linha ${i + 2}`);

      } catch (erroEnvio) {
        console.error(`❌ Erro ao enviar para ${numeroWhatsApp}:`, JSON.stringify(erroEnvio.response?.data || erroEnvio, null, 2));
      }
    }

    res.status(200).send("✅ Disparo de confirmação de participação concluído.");
  } catch (error) {
    console.error("❌ Erro geral ao processar o disparo:", error);
    res.status(500).send("❌ Erro interno no envio.");
  }
});

// Painel Web para disparos manuais
const disparosDisponiveis = [
  { nome: "Enviar Agradecimento de Inscrição", tipo: "agradecimento_inscricao", endpoint: "/disparo?chave=" + process.env.CHAVE_DISPARO + "&tipo=agradecimento_inscricao", descricao: "Dispara o template de agradecimento para os inscritos não selecionados" },
  { nome: "Enviar Boas-Vindas", tipo: "boasvindas", endpoint: "/disparo?chave=" + process.env.CHAVE_DISPARO + "&tipo=boasvindas", descricao: "Dispara o template de boas-vindas para contatos ativos" },
  { nome: "Enviar Eventos da Semana", tipo: "eventos", endpoint: "/disparo?chave=" + process.env.CHAVE_DISPARO + "&tipo=eventos", descricao: "Envia resumo dos eventos próximos da planilha" },
  { nome: "Enviar Confirmação de Participação", tipo: "confirmacao", endpoint: "/dispararConfirmacaoParticipacao?chave=" + process.env.CHAVE_DISPARO, descricao: "Dispara o template de confirmação para os prioritários" },
  { nome: "Enviar Comunicado Geral", tipo: "comunicado_geral", endpoint: "/disparo?chave=" + process.env.CHAVE_DISPARO + "&tipo=comunicado_geral", descricao: "Dispara um comunicado via template para números da aba Fila_Envio" }
];

let statusLogs = [];

// Painel Web para disparos manuais com tabela, formulário e logs
app.get("/painel", (req, res) => {
  const listaDisparos = disparosDisponiveis.map(d => `
    <tr>
      <td>${d.nome}</td>
      <td>${d.tipo}</td>
      <td>${d.endpoint}</td>
      <td>${d.descricao}</td>
      <td><button onclick="disparar('${d.tipo}', '${d.endpoint}')">Disparar</button></td>
    </tr>
  `).join('');

  const logsHTML = statusLogs.slice(-10).reverse().map(log => `
    <li>[${new Date(log.horario).toLocaleString()}] ${log.resultado} (${log.tipo})</li>
  `).join('');

  res.send(`
    <html>
    <head>
      <title>Painel de Disparos - EAC</title>
      <style>
        body { font-family: Arial; margin: 20px; }
        table { border-collapse: collapse; width: 100%; margin-bottom: 20px; }
        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
        th { background-color: #f2f2f2; }
        button { padding: 5px 10px; }
      </style>
    </head>
    <body>
      <h2>📢 Painel de Disparos Manuais - EAC</h2>

      <h3>📋 Disparos Disponíveis</h3>
      <table>
        <tr>
          <th>Nome</th>
          <th>Tipo</th>
          <th>Endpoint</th>
          <th>Descrição</th>
          <th>Ação</th>
        </tr>
        ${listaDisparos}
      </table>

      <h3>➕ Adicionar Novo Disparo Manual</h3>
      <form onsubmit="adicionarDisparo(); return false;">
        <label>Nome:</label><br><input type="text" id="nome"><br>
        <label>Tipo:</label><br><input type="text" id="tipo"><br>
        <label>Endpoint:</label><br><input type="text" id="endpoint"><br>
        <label>Descrição:</label><br><input type="text" id="descricao"><br><br>
        <button type="submit">Adicionar Disparo</button>
      </form>

      <h3>📜 Últimos Logs de Disparo</h3>
      <ul>${logsHTML}</ul>

      <script>
        function disparar(tipo, endpoint) {
          try {
            // Abre o endpoint GET em nova aba para evitar timeout do fetch
            window.open(endpoint, '_blank');
          } catch (e) { alert('Erro: ' + e); }
        }

        function adicionarDisparo() {
          const nome = document.getElementById('nome').value;
          const tipo = document.getElementById('tipo').value;
          const endpoint = document.getElementById('endpoint').value;
          const descricao = document.getElementById('descricao').value;

          fetch('/adicionarDisparo', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nome, tipo, endpoint, descricao })
          })
          .then(response => response.text())
          .then(msg => alert(msg))
          .catch(err => alert('Erro: ' + err));
        }
      </script>
    </body>
    </html>
  `);
});

app.post("/adicionarDisparo", express.json(), (req, res) => {
  const { nome, tipo, endpoint, descricao } = req.body;
  if (!nome || !tipo || !endpoint) {
    return res.status(400).send("❌ Preencha todos os campos obrigatórios.");
  }
  disparosDisponiveis.push({ nome, tipo, endpoint, descricao });
  res.send("✅ Novo disparo adicionado com sucesso!");
});

// Função para envio do template de agradecimento de inscrição
async function enviarTemplateAgradecimentoInscricao(numero) {
  try {
    console.log(`📨 Enviando template de agradecimento para: ${numero}`);

    await axios.post(
      graphUrl(`${phone_number_id}/messages`),
      {
        messaging_product: "whatsapp",
        to: numero,
        type: "template",
        template: {
          name: "eac_agradecimento_inscricao_v1",
          language: { code: "pt_BR" }
        }
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        }
      }
    );

    console.log(`✅ Agradecimento enviado com sucesso para: ${numero}`);
    statusLogs.push({ tipo: 'agradecimento_inscricao', resultado: '✅ Agradecimento enviado', horario: new Date() });

  } catch (error) {
    console.error(`❌ Erro ao enviar agradecimento para ${numero}:`, JSON.stringify(error.response?.data || error, null, 2));
    statusLogs.push({ tipo: 'agradecimento_inscricao', resultado: '❌ Erro no envio', horario: new Date() });
  }
}

// Função para envio de agradecimento apenas para não incluídos
async function dispararAgradecimentoInscricaoParaNaoIncluidos() {
  try {
    const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });
    const client = await auth.getClient();
    const sheets = google.sheets({ version: "v4", auth: client });

    const spreadsheetId = "1I988yRvGYfjhoqmFvdQbjO9qWzTB4T6yv0dDBxQ-oEg";
    const range = "Inscricoes_Prioritarias!G2:U";

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range,
    });

    const contatos = response.data.values || [];

    let totalEncontrados = 0;
    let totalEnviados = 0;

    for (const [index, linha] of contatos.entries()) {
      const numero = linha[0];    // Coluna G (índice 0)
      const statusU = linha[14];  // Coluna U (índice 14)

      if (statusU && statusU.toLowerCase() === "nao_incluido") {
        totalEncontrados++;
        console.log(`➡️ Linha ${index + 2} | Número: ${numero} | Status: ${statusU} | Enviando...`);
        try {
          await enviarTemplateAgradecimentoInscricao(numero);
          totalEnviados++;
          console.log(`✅ Mensagem enviada com sucesso para: ${numero}`);
        } catch (erroEnvio) {
          console.error(`❌ Erro ao enviar para ${numero}:`, JSON.stringify(erroEnvio.response?.data || erroEnvio, null, 2));
        }
      }
    }

    console.log(`📊 Resultado final: ${totalEncontrados} contatos encontrados com 'nao_incluido'. ${totalEnviados} mensagens enviadas.`);
  } catch (error) {
    console.error("❌ Erro ao disparar agradecimento:", error);
  }
}

// Função para envio de comunicado geral a partir da aba fila_envio
async function dispararComunicadoGeralFila() {
  try {
    const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });
    const client = await auth.getClient();
    const sheets = google.sheets({ version: "v4", auth: client });

    const numerosJaEnviados = new Set();

    // Primeira planilha: Cadastro Oficial (coluna G, status na U)
    const planilhaCadastroId = "13QUYrH1iRV1TwyVQhtCHjXy77XxB9Eu7R_wsCZIJDwk";
    //1I988yRvGYfjhoqmFvdQbjO9qWzTB4T6yv0dDBxQ-oEg
    //const planilhaCadastroId = "13QUYrH1iRV1TwyVQhtCHjXy77XxB9Eu7R_wsCZIJDwk";
    const rangeCadastro = "Cadastro Oficial!G2:U";
    

    const resCadastro = await sheets.spreadsheets.values.get({
      spreadsheetId: planilhaCadastroId,
      range: rangeCadastro,
    });

    const rowsCadastro = resCadastro.data.values || [];
    console.log(`📄 [Cadastro Oficial] Registros: ${rowsCadastro.length}`);

    const updatesCadastro = [];
    for (let i = 0; i < rowsCadastro.length; i++) {
      const numero = rowsCadastro[i][0];
      const status = rowsCadastro[i][14];

      if (!numero || status === "Enviado" || numerosJaEnviados.has(numero)) {
        console.log(`⏭️ [Cadastro] Pulando linha ${i + 2}`);
        continue;
      }

      try {
        await axios.post(
          graphUrl(`${phone_number_id}/messages`),
          {
            messaging_product: "whatsapp",
            to: numero,
            type: "template",
            template: {
              name: "eac_comunicado_geral_v2",
              language: { code: "pt_BR" }
            }
          },
          {
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json"
            }
          }
        );

        console.log(`✅ [Cadastro] Mensagem enviada para ${numero}`);
        numerosJaEnviados.add(numero);

        const updateRange = `Cadastro Oficial!U${i + 2}`;
        updatesCadastro.push({ range: `Cadastro Oficial!U${i + 2}:U${i + 2}`, values: [["Enviado"]] });
      } catch (erroEnvio) {
        console.error(`❌ [Cadastro] Erro ao enviar para ${numero}:`, erroEnvio.message);
        const updateRange = `Cadastro Oficial!U${i + 2}`;
        updatesCadastro.push({ range: `Cadastro Oficial!U${i + 2}:U${i + 2}`, values: [["Erro"]] });
      }
    }

    // Commit batched updates Cadastro Oficial
    if (updatesCadastro.length) {
      try {
        if (String(process.env.SHEETS_READ_ONLY||"").toLowerCase() === "true") {
          console.log(`[Sheets] READ_ONLY ativo - ${updatesCadastro.length} células não serão gravadas (Cadastro).`);
        } else {
          await sheets.spreadsheets.values.batchUpdate({
            spreadsheetId: planilhaCadastroId,
            requestBody: { valueInputOption: "RAW", data: updatesCadastro }
          });
          console.log(`[Sheets] Cadastro Oficial batchUpdate: ${updatesCadastro.length} células.`);
        }
      } catch (e) {
        console.warn("[Sheets] Falha batchUpdate Cadastro:", e?.response?.status || e?.message || e);
      }
    }

    // Segunda planilha: Encontreiros (coluna F, status na H)
    const planilhaEncontreirosId = "1M5vsAANmeYk1pAgYjFfa3ycbnyWMGYb90pKZuR9zNo4";
    const rangeEncontreiros = "Fila_Envio!F2:H";

    const resEncontreiros = await sheets.spreadsheets.values.get({
      spreadsheetId: planilhaEncontreirosId,
      range: rangeEncontreiros,
    });

    const rowsEncontreiros = resEncontreiros.data.values || [];
    console.log(`📄 [Encontreiros] Registros: ${rowsEncontreiros.length}`);

    const updatesEncontreiros = [];
    for (let i = 0; i < rowsEncontreiros.length; i++) {
      const numero = rowsEncontreiros[i][0];
      const status = rowsEncontreiros[i][2];

      if (!numero || status === "Enviado" || numerosJaEnviados.has(numero)) {
        console.log(`⏭️ [Encontreiros] Pulando linha ${i + 2}`);
        continue;
      }

      try {
        await axios.post(
          graphUrl(`${phone_number_id}/messages`),
          {
            messaging_product: "whatsapp",
            to: numero,
            type: "template",
            template: {
              name: "eac_comunicado_geral_v2",
              language: { code: "pt_BR" }
            }
          },
          {
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json"
            }
          }
        );

        console.log(`✅ [Encontreiros] Mensagem enviada para ${numero}`);
        numerosJaEnviados.add(numero);

        const updateRange = `Fila_Envio!H${i + 2}`;
        updatesEncontreiros.push({ range: `Fila_Envio!H${i + 2}:H${i + 2}`, values: [["Enviado"]] });
      } catch (erroEnvio) {
        console.error(`❌ [Encontreiros] Erro ao enviar para ${numero}:`, erroEnvio.message);
        const updateRange = `Fila_Envio!H${i + 2}`;
        updatesEncontreiros.push({ range: `Fila_Envio!H${i + 2}:H${i + 2}`, values: [["Erro"]] });
      }
    }

    console.log("📢 Disparo geral finalizado para as duas planilhas.");
  } catch (erro) {
    console.error("❌ Erro geral:", erro);
  }
}




// ================================================================
// SISTEMA DE MÉTRICAS E ANALYTICS DO BOT (com integração Sheets)
// ================================================================

let metricas = {
  usuariosUnicos: new Set(),
  totalMensagensRecebidas: 0,
  totalMensagensEnviadas: 0,
  acessosPorOpcao: {},
  acessosPorDia: {},
  primeiroAcesso: {},
  ultimoAcesso: {},
  historico: []
};

// Registra acesso do usuário e salva também na planilha
// Substitua toda a função antiga por essa abaixo
async function registrarAcessoUsuario(numero, opcaoEscolhida = null) {
  const agora = new Date();
  const hoje = agora.toISOString().split('T')[0];
  const horario = agora.toISOString();

  const usuarioExistente = metricas.usuariosUnicos.has(numero);
  metricas.usuariosUnicos.add(numero);

  if (!metricas.primeiroAcesso[numero]) {
    metricas.primeiroAcesso[numero] = horario;
  }
  metricas.ultimoAcesso[numero] = horario;

  if (!metricas.acessosPorDia[hoje]) {
    metricas.acessosPorDia[hoje] = { usuarios: new Set(), total: 0 };
  }
  metricas.acessosPorDia[hoje].usuarios.add(numero);
  metricas.acessosPorDia[hoje].total++;

  if (opcaoEscolhida) {
    if (!metricas.acessosPorOpcao[opcaoEscolhida]) {
      metricas.acessosPorOpcao[opcaoEscolhida] = 0;
    }
    metricas.acessosPorOpcao[opcaoEscolhida]++;
  }

  metricas.historico.push({
    numero,
    horario,
    opcao: opcaoEscolhida,
    primeiroAcesso: !usuarioExistente
  });

  if (metricas.historico.length > 1000) {
    metricas.historico = metricas.historico.slice(-1000);
  }

  console.log(`📊 Acesso registrado: ${numero} - ${opcaoEscolhida || 'Menu'} - ${usuarioExistente ? 'Retorno' : 'Novo usuário'}`);

  // Envia também para a planilha
  try {
    const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });
    const client = await auth.getClient();
    const sheets = google.sheets({ version: "v4", auth: client });

    const data = agora.toLocaleDateString("pt-BR");
    const hora = agora.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    const linha = [[data, hora, numero, opcaoEscolhida || "menu", !usuarioExistente ? "Sim" : "Não"]];

    await sheets.spreadsheets.values.append({
      spreadsheetId: "160SnALnu-7g6_1EUCh9mf6vLuh1-BY1mowFceTfgnyk",
      range: "Acessos_Bot!A:E",
      valueInputOption: "RAW",
      resource: { values: linha },
    });

    console.log(`📥 Planilha atualizada com o acesso: ${numero} - ${opcaoEscolhida}`);
  } catch (erro) {
    console.error("❌ Erro ao salvar acesso na planilha:", erro.message || erro);
  }
}

// ================================================================
// ROTA HTML PARA REDIRECIONAMENTO DE E-MAIL (mailto:)
// ================================================================
app.get("/email-cantina", (req, res) => {
  const mailtoLink = `mailto:eacporciuncula@gmail.com?subject=Quero%20ajudar%20na%20cantina&body=Olá,%20gostaria%20de%20colaborar%20no%20evento%20do%20dia%2027!`;

  res.send(`
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="UTF-8" />
      <meta http-equiv="refresh" content="0; url=${mailtoLink}" />
      <title>Redirecionando para E-mail</title>
    </head>
    <body>
      <p>Você está sendo redirecionado para seu aplicativo de e-mail...</p>
      <p>Se não funcionar automaticamente, <a href="${mailtoLink}">clique aqui para enviar o e-mail</a>.</p>
    </body>
    </html>
  `);
});

///nova função para disparo de mensagem de aniversario.
async function enviarComunicadoAniversarioHoje(opts = {}) {
  // ===== CONFIG =====
  const SPREADSHEET_ID = "13QUYrH1iRV1TwyVQhtCHjXy77XxB9Eu7R_wsCZIJDwk";
  const SHEET_NAME = "Cadastro Oficial";        // com espaço
  const RANGE_LER = `${SHEET_NAME}!A2:V`;       // C=nascimento, G=telefone, V=status
  const IDX = { NASC: 2, TEL: 6, ST_ANIV: 21 }; // A=0 ... V=21
  const COL_STATUS = "V";
  const TEMPLATE_NAME = process.env.WHATSAPP_TEMPLATE_ANIV_NAME || "eac_comunicado_aniversario";
  const LIMITE_DIARIO = Number(process.env.LIMITE_DIARIO_ANIV || 200);
  const TZ = "America/Sao_Paulo";

  // ===== FALLBACKS/DEPS =====
  const ax = (typeof axios !== "undefined") ? axios : require("axios");
  const getSheets = opts.getSheetsClient || (typeof getSheetsClient === "function" ? getSheetsClient : (() => {
    const { google: g } = require("googleapis");
    const creds = JSON.parse(process.env.GOOGLE_CREDENTIALS || "{}");
    const jwt = new g.auth.JWT(creds.client_email, null, creds.private_key, ["https://www.googleapis.com/auth/spreadsheets"]);
    return g.sheets({ version: "v4", auth: jwt });
  }));
  // Auto-detecta idioma do template de aniversário quando não definido por env
  async function __tplDetectLang(templateName) {
    try {
      const bizId = (process.env.WHATSAPP_BUSINESS_ID || '').trim();
      const token = (process.env.WHATSAPP_TOKEN || '').trim();
      if (!bizId || !token) return null;
      const url = `https://graph.facebook.com/v20.0/${bizId}/message_templates?name=${encodeURIComponent(templateName)}&limit=1`;
      const { data } = await ax.get(url, { headers: { Authorization: `Bearer ${token}` }, timeout: 15000 });
      const tpl = data?.data?.[0];
      return tpl?.language || null;
    } catch (e) {
      console.warn('[TPL] Falha ao obter idioma do template:', e?.response?.data || e?.message);
      return null;
    }
  }
  const __tplLangCache = { v: null, t: 0 };
  async function __getResolvedAnivLang(name) {
    const envLang = String(process.env.WHATSAPP_TEMPLATE_ANIV_LANG || '').trim();
    if (envLang) return envLang;
    const now = Date.now();
    if (__tplLangCache.v && now - __tplLangCache.t < 15 * 60 * 1000) return __tplLangCache.v;
    const detected = await __tplDetectLang(name);
    __tplLangCache.v = detected || TEMPLATE_ANIV_LANG || TEMPLATE_LANG;
    __tplLangCache.t = now;
    return __tplLangCache.v;
  }
  const sendWA = opts.sendWhatsAppTemplate || (typeof enviarWhatsAppTemplate === "function"
    ? enviarWhatsAppTemplate
    : async (numero, templateName, variaveis = []) => {
        const token = process.env.WHATSAPP_TOKEN;
        const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
        if (!token || !phoneNumberId) throw new Error("WHATSAPP_TOKEN/WHATSAPP_PHONE_NUMBER_ID não configurados.");
        const url = `https://graph.facebook.com/v20.0/${phoneNumberId}/messages`;
        const body = {
          messaging_product: "whatsapp",
          to: numero,
          type: "template",
          template: {
            name: templateName,
            language: { code: await __getResolvedAnivLang(templateName) },
            components: (variaveis && variaveis.length)
              ? [{ type: "body", parameters: variaveis.map(v => ({ type: "text", text: `${v}` })) }]
              : undefined,
          },
        };
        const resp = await ax.post(url, body, {
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          timeout: 20000,
        });
        return resp?.data?.messages?.[0]?.id;
      }
  );

  // ===== HELPERS =====
  const letterToIdx = L => (String(L).trim().toUpperCase().charCodeAt(0) - 65);
  function normTel(raw) {
    if (!raw) return "";
    const digits = String(raw).replace(/\D/g, "").replace(/^0+/, "");
    return digits.startsWith("55") ? digits : `55${digits}`;
  }
  function hojeUTC() {
    const now = new Date();
    const local = new Date(now.toLocaleString("en-US", { timeZone: TZ }));
    return new Date(Date.UTC(local.getFullYear(), local.getMonth(), local.getDate()));
  }
  function parseDateFromSheet(val) {
    if (val == null || val === "") return null;
    if (val instanceof Date && !isNaN(val)) return val;
    if (typeof val === "number") {
      const ms = Math.round((val - 25569) * 86400 * 1000); // serial Sheets -> ms
      return new Date(ms);
    }
    const s = String(val).trim();
    const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
    if (m) {
      let [_, dd, mm, yyyy] = m;
      dd = parseInt(dd, 10); mm = parseInt(mm, 10) - 1;
      yyyy = String(yyyy).length === 2 ? 2000 + parseInt(yyyy, 10) : parseInt(yyyy, 10);
      return new Date(Date.UTC(yyyy, mm, dd));
    }
    const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (iso) return new Date(Date.UTC(+iso[1], +iso[2]-1, +iso[3]));
    const d = new Date(s);
    return isNaN(d) ? null : d;
  }
  const isBirthdayTodayVal = (sheetVal, refUTC) => {
    const d = parseDateFromSheet(sheetVal);
    return !!d && d.getUTCMonth() === refUTC.getUTCMonth() && d.getUTCDate() === refUTC.getUTCDate();
  };

  // ===== DETECTAR QUANTOS PARÂMETROS O TEMPLATE EXIGE =====
  async function getTemplateParamCount(templateName) {
    try {
      const bizId = process.env.WHATSAPP_BUSINESS_ID;
      const token = process.env.WHATSAPP_TOKEN;
      if (!bizId || !token) return null; // sem business ID, pula a auto-detecção

      const url = `https://graph.facebook.com/v20.0/${bizId}/message_templates?name=${encodeURIComponent(templateName)}&limit=1`;
      const { data } = await ax.get(url, {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 15000,
      });
      const tpl = data?.data?.[0];
      if (!tpl) return null;

      // Procura componente "BODY" e conta marcadores {{1}}, {{2}}...
      const body = (tpl.components || []).find(c => (c.type || "").toUpperCase() === "BODY");
      const text = body?.text || "";
      const matches = Array.from(text.matchAll(/\{\{\s*(\d+)\s*\}\}/g)).map(m => Number(m[1]));
      if (!matches.length) return 0;
      return Math.max(...matches);
    } catch (e) {
      console.log("[TPL] Falha ao detectar parâmetros do template:", e?.response?.data || e?.message);
      return null;
    }
  }

  // Lê configuração manual de colunas/defaults
  const COLS_VAR = (process.env.TEMPLATE_ANIV_COLS || "").split(/[;,]/).map(s => s.trim().toUpperCase()).filter(Boolean);
  const DEFAULTS_VAR = (process.env.TEMPLATE_ANIV_DEFAULTS || "").split(/[;,]/);

  function buildParamsFromRow(r, neededCount) {
    let params = [];
    // se veio mapeamento de colunas, usa na ordem informada
    if (COLS_VAR.length) {
      params = COLS_VAR.map((L, i) => {
        const idx = letterToIdx(L);
        const val = (r[idx] ?? "").toString().trim();
        return val || (DEFAULTS_VAR[i] || "");
      });
    }
    // Ajusta o tamanho para o exigido: corta ou preenche
    if (typeof neededCount === "number") {
      if (params.length > neededCount) params = params.slice(0, neededCount);
      while (params.length < neededCount) {
        const i = params.length;
        params.push(DEFAULTS_VAR[i] || "");
      }
    }
    return params;
  }

  // Descobre quantos params precisa
  const detectedCount = await getTemplateParamCount(TEMPLATE_NAME);
  const neededCount = (detectedCount != null)
    ? detectedCount
    : (COLS_VAR.length || 0); // fallback: usa qtas colunas você mapeou

  // ===== PROCESSO =====
  console.log("[Aniversário] Lendo", SPREADSHEET_ID, RANGE_LER);
  const sheets = getSheets();
  const read = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: RANGE_LER,
    valueRenderOption: "FORMATTED_VALUE",
    dateTimeRenderOption: "FORMATTED_STRING",
  });

  const rows = read.data.values || [];
  if (!rows.length) {
    console.log("⚠️ Cadastro vazio para aniversário.");
    return { enviados: 0, erros: 0 };
  }

  const hoje = hojeUTC();
  let enviados = 0;
  let erros = 0;
  const updates = [];

  for (let i = 0; i < rows.length; i++) {
    if (enviados >= LIMITE_DIARIO) break;

    const r = rows[i];
    const nascVal = r[IDX.NASC];
    const telRaw  = r[IDX.TEL];
    const st      = (r[IDX.ST_ANIV] || "").toString().trim();

    if (st.toLowerCase().startsWith("aniversário enviado -")) continue;
    if (!isBirthdayTodayVal(nascVal, hoje)) continue;

    const numero = normTel(telRaw);
    if (!numero) continue;

    // Monta as variáveis conforme o template
    const paramsText = buildParamsFromRow(r, neededCount);

    try {
      await sendWA(numero, TEMPLATE_NAME, paramsText);
      const row = i + 2;
      updates.push({
        range: `${SHEET_NAME}!${COL_STATUS}${row}:${COL_STATUS}${row}`,
        values: [[`Aniversário Enviado - ${new Date().toLocaleString("pt-BR", { timeZone: TZ }).replace(/:\d{2}$/, "")}`]],
      });
      enviados++;
    } catch (e) {
      console.error("❌ Erro WA aniversário", numero, e?.response?.data || e?.message || e);
      const row = i + 2;
      updates.push({
        range: `${SHEET_NAME}!${COL_STATUS}${row}:${COL_STATUS}${row}`,
        values: [["Erro"]],
      });
      erros++;
    }
  }

  if (updates.length) {
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: { valueInputOption: "RAW", data: updates },
    });
    console.log(`📝 Atualizadas ${updates.length} células em ${COL_STATUS} (aniversário).`);
  } else {
    console.log("ℹ️ Nada para atualizar em V (aniversário).");
  }

  console.log(`✅ Resultado Aniversário: enviados=${enviados}, erros=${erros}`);
  return { enviados, erros };
}


// Inicialização do servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
});
