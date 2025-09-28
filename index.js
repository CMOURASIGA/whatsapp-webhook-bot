// ================================================================
// IMPORTAÇÕES E CONFIGURAÇÕES INICIAIS
// ================================================================
const express = require("express");
const axios = require("axios");
const { google } = require("googleapis");
const cron = require("node-cron");

const app = express();
app.use(express.json());

// ---------------------- .ENV SUGERIDO ----------------------
// PORT=3000
// VERIFY_TOKEN=seu_token_meta
// TOKEN_WHATSAPP=EAAB...
// WHATSAPP_PHONE_NUMBER_ID=572870979253681
// OPENAI_API_KEY=sk-...
// GOOGLE_CREDENTIALS={"type":"service_account",...}
// CHAVE_DISPARO=chave_super_secreta
// TELEFONE_CONTATO_HUMANO=55219xxxxxxx
// URL_APP_SCRIPT_EVENTOS=https://script.googleusercontent.com/...
// SPREADSHEET_ID_EVENTOS=1BXitZrMOxFasCJAqkxVVdkYPOLLUDEMQ2bIx5mrP8Y8
// SHEET_CADASTRO_ID=13QUYrH1iRV1TwyVQhtCHjXy77XxB9Eu7R_wsCZIJDwk
// SHEET_CADASTRO_TAB=Cadastro_Oficial
// SHEET_ENCONTREIROS_ID=1M5vsAANmeYk1pAgYjFfa3ycbnyWMGYb90pKZuR9zNo4
// SHEET_EVENTOS_ID=1BXitZrMOxFasCJAqkxVVdkYPOLLUDEMQ2bIx5mrP8Y8
// SHEET_ACESSOS_ID=160SnALnu-7g6_1EUCh9mf6vLuh1-BY1mowFceTfgnyk
// TEMPLATE_LEMBRETE=eac_lembrete_v1
// TEMPLATE_BOASVINDAS=eac_boasvindas_v1
// TEMPLATE_CONFIRMACAO=eac_confirmar_participacao_v1
// TEMPLATE_AGRADECIMENTO=eac_agradecimento_inscricao_v1
// TEMPLATE_COMUNICADO=eac_comunicado_geral_v2
// TEMPLATE_PRAZO_RESPOSTA_PADRAO=
// TEMPLATE_HORA_EVENTO_PADRAO=09:00
// ------------------------------------------------------------

const VERIFY_TOKEN = process.env.VERIFY_TOKEN || "meu_token_webhook";
const token = process.env.TOKEN_WHATSAPP;
const phone_number_id = process.env.WHATSAPP_PHONE_NUMBER_ID || "572870979253681";
const TELEFONE_CONTATO_HUMANO = process.env.TELEFONE_CONTATO_HUMANO || "";
const URL_APP_SCRIPT_EVENTOS = process.env.URL_APP_SCRIPT_EVENTOS || "";
const SPREADSHEET_ID_EVENTOS = process.env.SPREADSHEET_ID_EVENTOS || process.env.SHEET_EVENTOS_ID || "1BXitZrMOxFasCJAqkxVVdkYPOLLUDEMQ2bIx5mrP8Y8";
const SHEET_CADASTRO_ID = process.env.SHEET_CADASTRO_ID || "13QUYrH1iRV1TwyVQhtCHjXy77XxB9Eu7R_wsCZIJDwk";
const SHEET_CADASTRO_TAB_ENV = process.env.SHEET_CADASTRO_TAB || ""; // pode ser "Cadastro_Oficial" ou "Cadastro Oficial"
const SHEET_ENCONTREIROS_ID = process.env.SHEET_ENCONTREIROS_ID || "1M5vsAANmeYk1pAgYjFfa3ycbnyWMGYb90pKZuR9zNo4";
const SHEET_ACESSOS_ID = process.env.SHEET_ACESSOS_ID || "160SnALnu-7g6_1EUCh9mf6vLuh1-BY1mowFceTfgnyk";
const CHAVE_DISPARO = process.env.CHAVE_DISPARO || "EACP2024";

const TEMPLATE_LEMBRETE = process.env.TEMPLATE_LEMBRETE || "eac_lembrete_v1";
const TEMPLATE_BOASVINDAS = process.env.TEMPLATE_BOASVINDAS || "eac_boasvindas_v1";
const TEMPLATE_CONFIRMACAO = process.env.TEMPLATE_CONFIRMACAO || "eac_confirmar_participacao_v1";
const TEMPLATE_AGRADECIMENTO = process.env.TEMPLATE_AGRADECIMENTO || "eac_agradecimento_inscricao_v1";
const TEMPLATE_COMUNICADO = process.env.TEMPLATE_COMUNICADO || "eac_comunicado_geral_v2";
const TEMPLATE_PRAZO_RESPOSTA_PADRAO = process.env.TEMPLATE_PRAZO_RESPOSTA_PADRAO || "";
const TEMPLATE_HORA_EVENTO_PADRAO = process.env.TEMPLATE_HORA_EVENTO_PADRAO || "09:00";

// ================================================================
// HELPERS
// ================================================================
function getRandomMessage(messages) {
  if (Array.isArray(messages)) {
    return messages[Math.floor(Math.random() * messages.length)];
  }
  return messages;
}

// Normaliza string (remove acentos) e coloca em minúsculo
function norm(s = "") {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

// Saudação unificada
function ehSaudacao(textoRaw) {
  const texto = norm(textoRaw || "");
  const saudacoes = ["oi", "ola", "olá", "bom dia", "boa tarde", "boa noite", "e ai", "eai", "opa", "menu"];
  return saudacoes.some(s => texto.includes(s));
}

// Valida número de WhatsApp (bem simples: só dígitos, 11 a 15)
function numeroValido(telefone) {
  if (!telefone) return false;
  const digitos = (telefone + "").replace(/\D/g, "");
  return /^\d{11,15}$/.test(digitos);
}

// Resolve dinamicamente a aba do Cadastro Oficial
async function descobrirAbaCadastro(sheets, spreadsheetId) {
  const preferidas = SHEET_CADASTRO_TAB_ENV ? [SHEET_CADASTRO_TAB_ENV] : ["Cadastro_Oficial", "Cadastro Oficial"];
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const abas = new Set((meta.data.sheets || []).map(s => s.properties?.title));
  const escolhida = preferidas.find(n => abas.has(n));
  if (!escolhida) throw new Error("Aba de Cadastro Oficial não encontrada. Abas existentes: " + [...abas].join(", "));
  return escolhida;
}

// ================================================================
// SISTEMA DE MENUS INTERATIVOS
// ================================================================
function montarMenuPrincipalInterativo() {
  const footerTime = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
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
      footer: { text: footerTime },
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

// Fallback em texto
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
    "9 - 💡 Mensagem do Dia\n" +
    "10 - 📖 Versículo do Dia\n\n" +
    "Digite o número correspondente à opção desejada. 👇"
  );
}

// ================================================================
// SISTEMA DE ENVIO DE MENSAGENS (Texto e Interativo)
// ================================================================
async function enviarMensagem(numero, mensagem) {
  try {
    if (!numeroValido(numero)) {
      console.warn("⚠️ Número inválido, pulando envio:", numero);
      return;
    }
    await axios.post(
      `https://graph.facebook.com/v19.0/${phone_number_id}/messages`,
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

async function enviarMensagemInterativa(numero, mensagemInterativa) {
  try {
    if (!numeroValido(numero)) {
      console.warn("⚠️ Número inválido, pulando envio interativo:", numero);
      return;
    }

    const payload = { ...mensagemInterativa, to: numero };
    await axios.post(
      `https://graph.facebook.com/v19.0/${phone_number_id}/messages`,
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

// ================================================================
// ENVIO DE TEMPLATES WHATSAPP BUSINESS
// ================================================================
async function enviarTemplateLembreteEvento(numero, eventoNome, dataEvento, prazoRespostaOpt, horaEventoOpt) {
  try {
    if (!numeroValido(numero)) {
      console.warn("⚠️ Número inválido no lembrete:", numero);
      return;
    }

    if (!eventoNome || !dataEvento) {
      console.error(`❌ Parâmetros inválidos no lembrete. numero=${numero}, eventoNome=${eventoNome}, dataEvento=${dataEvento}`);
      return;
    }

    const prazoResposta = prazoRespostaOpt ?? TEMPLATE_PRAZO_RESPOSTA_PADRAO;
    const horaEvento = horaEventoOpt ?? TEMPLATE_HORA_EVENTO_PADRAO;

    console.log(`📨 Enviando lembrete (${TEMPLATE_LEMBRETE}) para: ${numero} | ${eventoNome} em ${dataEvento} ${horaEvento}`);

    await axios.post(
      `https://graph.facebook.com/v19.0/${phone_number_id}/messages`,
      {
        messaging_product: "whatsapp",
        to: numero,
        type: "template",
        template: {
          name: TEMPLATE_LEMBRETE,
          language: { code: "pt_BR" },
          components: [
            {
              type: "body",
              parameters: [
                { type: "text", text: eventoNome },           // {{evento_nome}}
                { type: "text", text: prazoResposta },         // {{prazo_resposta}} (se vazio, o Meta ignora se template permitir)
                { type: "text", text: dataEvento },            // {{data_evento}}
                { type: "text", text: horaEvento }             // {{hora_evento}}
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

    console.log(`✅ Template de lembrete enviado com sucesso para: ${numero}`);
  } catch (error) {
    console.error(`❌ Erro ao enviar template de lembrete para ${numero}:`, JSON.stringify(error.response?.data || error, null, 2));
  }
}

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

    await atualizarPendentes(SHEET_EVENTOS_ID);
    await atualizarPendentes(SHEET_ENCONTREIROS_ID);

    console.log("🔄 Contatos com status 'Pendente' atualizados para 'Ativo'.");
  } catch (error) {
    console.error("Erro ao atualizar contatos:", error);
  }
}

// ================================================================
// LÓGICA DE VERIFICAÇÃO DE EVENTOS PARA DISPAROS (7 dias)
// ================================================================
async function verificarEventosParaLembrete() {
  try {
    const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });

    const sheets = google.sheets({ version: "v4", auth: await auth.getClient() });
    const spreadsheetIdEventos = SPREADSHEET_ID_EVENTOS;
    const rangeEventos = "comunicados!A2:G";
    const response = await sheets.spreadsheets.values.get({ spreadsheetId: spreadsheetIdEventos, range: rangeEventos });
    const rows = response.data.values;
    if (!rows) return;

    const hoje = new Date();
    hoje.setHours(0,0,0,0);
    const limite = new Date(hoje);
    limite.setDate(hoje.getDate() + 7);

    const eventosProximos = [];

    for (const row of rows) {
      const valorData = row[6]; // Coluna G
      if (!valorData) continue;

      let dataEvento;
      if (/^\d{2}\/\d{2}\/\d{4}$/.test((valorData+"").trim())) {
        const [dia, mes, ano] = valorData.split("/");
        dataEvento = new Date(`${ano}-${mes}-${dia}`);
      } else {
        dataEvento = new Date(valorData);
      }

      if (!isNaN(dataEvento.getTime()) && dataEvento >= hoje && dataEvento <= limite) {
        const titulo = row[1] || "(Sem título)";
        const dataFormatada = `${dataEvento.getDate().toString().padStart(2, '0')}/${(dataEvento.getMonth() + 1).toString().padStart(2, '0')}/${dataEvento.getFullYear()}`;
        eventosProximos.push({ nome: titulo, data: dataFormatada });
      }
    }

    const planilhas = [SHEET_EVENTOS_ID, SHEET_ENCONTREIROS_ID];

    for (const spreadsheetId of planilhas) {
      const rangeFila = "Fila_Envio!F2:H";
      const fila = await sheets.spreadsheets.values.get({ spreadsheetId, range: rangeFila });
      const contatos = fila.data.values || [];

      const registros = contatos.map((row, idx) => ({ numero: row[0], status: row[2], idx }));
      const ativos = registros.filter(c => c.status === "Ativo" && numeroValido(c.numero));

      console.log("📨 Contatos ativos:", ativos.length);
      const updates = contatos.map(r => [r?.[2] ?? ""]); // manter H original

      if (eventosProximos.length > 0) {
        for (const contato of ativos) {
          for (const evento of eventosProximos) {
            await enviarTemplateLembreteEvento(contato.numero, evento.nome, evento.data);
          }
          // marca como Enviado
          updates[contato.idx] = ["Enviado"];
        }
      } else {
        console.log("Nenhum evento nos próximos 7 dias.");
      }

      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: "Fila_Envio!H2:H",
        valueInputOption: "RAW",
        resource: { values: updates },
      });
    }
  } catch (erro) {
    console.error("Erro ao verificar eventos:", erro);
  }
}

// ================================================================
// WEBHOOK VERIFICAÇÃO (GET) E PRINCIPAL (POST)
// ================================================================

// Verificação do webhook (Meta)
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const tokenVerify = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode && tokenVerify && mode === "subscribe" && tokenVerify === VERIFY_TOKEN) {
    console.log("✅ Webhook verificado");
    return res.status(200).send(challenge);
  }
  console.warn("❌ Verificação de webhook falhou");
  return res.sendStatus(403);
});

// Recebimento de mensagens do WhatsApp
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

    if (textoRecebido === "6") {
      const saudacao = "📅 *Agenda de Eventos do EAC - Mês Atual*";
      try {
        if (!URL_APP_SCRIPT_EVENTOS) throw new Error("URL_APP_SCRIPT_EVENTOS não configurada.");
        const resposta = await axios.get(URL_APP_SCRIPT_EVENTOS);
        const { status, links } = resposta.data;

        if (status === "SEM_EVENTOS") {
          await enviarMensagem(numero, "⚠️ Ainda não há eventos cadastrados para este mês.");
        } else if (links) {
          const imagens = Array.isArray(links) ? links : [links];
          await enviarMensagem(numero, saudacao);
          for (const link of imagens) {
            await axios.post(
              `https://graph.facebook.com/v19.0/${phone_number_id}/messages`,
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

// ================================================================
// INTEGRAÇÃO COM OPENAI - GERAÇÃO DE CONTEÚDO (mantido)
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

// ================================================================
// DISPARO DE EVENTOS SEM TEMPLATE (7 dias)
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

    const spreadsheetIdEventos = SPREADSHEET_ID_EVENTOS;
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
    const limite = new Date(hoje);
    limite.setDate(hoje.getDate() + 7);

    const eventosDaSemana = rows
      .map((row) => {
        const titulo = row[1] || "(Sem título)";
        const dataTexto = row[6];
        if (!dataTexto || String(dataTexto).trim() === '') return null;

        let dataEvento;
        if (/^\d{2}\/\d{2}\/\d{4}$/.test(String(dataTexto).trim())) {
          const [dia, mes, ano] = String(dataTexto).trim().split("/");
          dataEvento = new Date(`${ano}-${mes}-${dia}`);
        } else {
          dataEvento = new Date(String(dataTexto).trim());
        }

        if (!isNaN(dataEvento.getTime()) && dataEvento >= hoje && dataEvento <= limite) {
          return `📅 *${titulo}* - ${String(dataTexto).trim()}`;
        }
        return null;
      })
      .filter(Boolean);

    if (eventosDaSemana.length === 0) {
      console.log("Nenhum evento nos próximos 7 dias.");
      return;
    }

    const mensagemFinal = `📢 *Próximos Eventos do EAC:*\n\n${eventosDaSemana.join("\n")}\n\n🟠 Se tiver dúvidas, fale com a gente!`;

    const numerosJaEnviados = new Set();

    // Encontreiros
    const planilhaEncontreirosId = SHEET_ENCONTREIROS_ID;
    const rangeFilaEncontreiros = "Fila_Envio!F2:H";
    const filaEncontreirosResponse = await sheets.spreadsheets.values.get({
      spreadsheetId: planilhaEncontreirosId,
      range: rangeFilaEncontreiros,
    });
    const contatosEncontreiros = filaEncontreirosResponse.data.values || [];
    for (let i = 0; i < contatosEncontreiros.length; i++) {
      const numero = contatosEncontreiros[i][0];
      const statusEnvio = contatosEncontreiros[i][2]; // H

      if (!numeroValido(numero) || statusEnvio === "Enviado" || numerosJaEnviados.has(numero)) continue;

      try {
        await enviarMensagem(numero, mensagemFinal);
        numerosJaEnviados.add(numero);
        const updateRange = `Fila_Envio!H${i + 2}`;
        await sheets.spreadsheets.values.update({
          spreadsheetId: planilhaEncontreirosId,
          range: updateRange,
          valueInputOption: "RAW",
          resource: { values: [["Enviado"]] },
        });
      } catch (erroEnvio) {
        console.error(`❌ Erro ao enviar evento para ${numero} (Encontreiros):`, erroEnvio.message);
        const updateRange = `Fila_Envio!H${i + 2}`;
        await sheets.spreadsheets.values.update({
          spreadsheetId: planilhaEncontreirosId,
          range: updateRange,
          valueInputOption: "RAW",
          resource: { values: [["Erro"]] },
        });
      }
    }

    // Cadastro_Oficial
    const planilhaCadastroOficialId = SHEET_CADASTRO_ID;
    const abaCadastroOficial = await descobrirAbaCadastro(sheets, planilhaCadastroOficialId);
    const rangeCadastroOficial = `${abaCadastroOficial}!G2:U`; // G tel, U status
    const cadastroOficialResponse = await sheets.spreadsheets.values.get({
      spreadsheetId: planilhaCadastroOficialId,
      range: rangeCadastroOficial,
    });
    const contatosCadastroOficial = cadastroOficialResponse.data.values || [];
    for (let i = 0; i < contatosCadastroOficial.length; i++) {
      const numero = contatosCadastroOficial[i][0]; // G
      const statusEnvio = contatosCadastroOficial[i][14]; // U

      if (!numeroValido(numero) || statusEnvio === "Enviado" || numerosJaEnviados.has(numero)) continue;

      try {
        await enviarMensagem(numero, mensagemFinal);
        numerosJaEnviados.add(numero);

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

// ================================================================
// ENDPOINT MANUAL DE DISPAROS (via URL)
// ================================================================
app.get("/disparo", async (req, res) => {
  const chave = req.query.chave;
  const tipo = req.query.tipo;
  if (chave !== CHAVE_DISPARO) {
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
      console.log("🚀 Disparando comunicado geral para contatos da planilha...");
      await dispararComunicadoGeralFila();
      return res.status(200).send("✅ Comunicado geral enviado com sucesso.");
    }

    console.log("📢 Tipo de disparo inválido ou não informado.");
    res.status(400).send("❌ Tipo de disparo inválido. Use tipo=boasvindas, tipo=eventos, tipo=agradecimento_inscricao ou tipo=comunicado_geral.");
  } catch (erro) {
    console.error("❌ Erro no disparo manual:", erro);
    res.status(500).send("❌ Erro ao processar o disparo.");
  }
});

// ================================================================
// AGENDAMENTO AUTOMÁTICO VIA CRON (timezone)
// ================================================================
cron.schedule("50 08 * * *", () => {
  console.log("🔁 Reativando contatos com status pendente...");
  reativarContatosPendentes();
}, { timezone: "America/Sao_Paulo" });

cron.schedule("00 09 * * *", () => {
  console.log("⏰ Executando verificação de eventos para lembrete às 09:00...");
  verificarEventosParaLembrete();
}, { timezone: "America/Sao_Paulo" });

// ================================================================
// TEMPLATES ESPECÍFICOS
// ================================================================
async function enviarTemplateBoasVindas(numero) {
  try {
    if (!numeroValido(numero)) return;
    console.log(`📨 Enviando template de boas-vindas (${TEMPLATE_BOASVINDAS}) para: ${numero}`);

    await axios.post(
      `https://graph.facebook.com/v19.0/${phone_number_id}/messages`,
      {
        messaging_product: "whatsapp",
        to: numero,
        type: "template",
        template: {
          name: TEMPLATE_BOASVINDAS,
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

    console.log(`✅ Template de boas-vindas enviado com sucesso para: ${numero}`);
  } catch (error) {
    console.error(`❌ Erro ao enviar boas-vindas para ${numero}:`, JSON.stringify(error.response?.data || error, null, 2));
  }
}

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
      SHEET_EVENTOS_ID, // Encontristas original
      SHEET_ENCONTREIROS_ID  // Encontreiros
    ];

    const numerosUnicos = new Set();

    for (const spreadsheetId of planilhas) {
      const rangeFila = "Fila_Envio!F2:H";
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: rangeFila,
      });

      const contatos = response.data.values || [];
      contatos.forEach(([numero, _g, status]) => {
        if (status === "Ativo" && numeroValido(numero)) {
          numerosUnicos.add(numero);
        }
      });
    }

    console.log(`📨 Total de contatos únicos para disparo: ${numerosUnicos.size}`);

    for (const numero of numerosUnicos) {
      await enviarTemplateBoasVindas(numero);
    }

    console.log("✅ Disparo de boas-vindas concluído.");

  } catch (error) {
    console.error("❌ Erro ao disparar boas-vindas para contatos ativos:", error);
  }
}

app.get("/dispararConfirmacaoParticipacao", async (req, res) => {
  const chave = req.query.chave;
  if (chave !== CHAVE_DISPARO) {
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
    const range = `${aba}!A2:W76`;

    const response = await sheets.spreadsheets.values.get({ spreadsheetId, range });
    const rows = response.data.values || [];
    console.log(`🔎 Total de registros carregados da aba ${aba}: ${rows.length}`);

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const numeroWhatsApp = row[6];  // G
      const statusEnvio = row[22];    // W

      if (!numeroValido(numeroWhatsApp) || statusEnvio === "Enviado") {
        console.log(`⏭️ Pulando linha ${i + 2}: número inválido/vazio ou já enviado.`);
        continue;
      }

      try {
        await axios.post(
          `https://graph.facebook.com/v19.0/${phone_number_id}/messages`,
          {
            messaging_product: "whatsapp",
            to: numeroWhatsApp,
            type: "template",
            template: {
              name: TEMPLATE_CONFIRMACAO,
              language: { code: "pt_BR" },
            },
          },
          {
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
          }
        );

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
        const updateRange = `${aba}!W${i + 2}`;
        await sheets.spreadsheets.values.update({
          spreadsheetId,
          range: updateRange,
          valueInputOption: "RAW",
          resource: { values: [["Erro"]] },
        });
      }
    }

    res.status(200).send("✅ Disparo de confirmação de participação concluído.");
  } catch (error) {
    console.error("❌ Erro geral ao processar o disparo:", error);
    res.status(500).send("❌ Erro interno no envio.");
  }
});

// ================================================================
// PAINEL WEB (apenas memória)
// ================================================================
const disparosDisponiveis = [
  { nome: "Enviar Agradecimento de Inscrição", tipo: "agradecimento_inscricao", endpoint: "/disparo?chave=" + CHAVE_DISPARO + "&tipo=agradecimento_inscricao", descricao: "Dispara o template de agradecimento para os inscritos não selecionados" },
  { nome: "Enviar Boas-Vindas", tipo: "boasvindas", endpoint: "/disparo?chave=" + CHAVE_DISPARO + "&tipo=boasvindas", descricao: "Dispara o template de boas-vindas para contatos ativos" },
  { nome: "Enviar Eventos da Semana", tipo: "eventos", endpoint: "/disparo?chave=" + CHAVE_DISPARO + "&tipo=eventos", descricao: "Envia resumo dos eventos próximos da planilha" },
  { nome: "Enviar Confirmação de Participação", tipo: "confirmacao", endpoint: "/dispararConfirmacaoParticipacao?chave=" + CHAVE_DISPARO, descricao: "Dispara o template de confirmação para os prioritários" },
  { nome: "Enviar Comunicado Geral", tipo: "comunicado_geral", endpoint: "/disparo?chave=" + CHAVE_DISPARO + "&tipo=comunicado_geral", descricao: "Dispara um comunicado via template para números da aba Fila_Envio / Cadastro" }
];

let statusLogs = [];

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
          fetch(endpoint)
            .then(response => response.text())
            .then(msg => alert(msg))
            .catch(err => alert('Erro: ' + err));
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

// ================================================================
// AGRADECIMENTO INSCRIÇÃO / NÃO INCLUÍDOS
// ================================================================
async function enviarTemplateAgradecimentoInscricao(numero) {
  try {
    if (!numeroValido(numero)) return;

    await axios.post(
      `https://graph.facebook.com/v19.0/${phone_number_id}/messages`,
      {
        messaging_product: "whatsapp",
        to: numero,
        type: "template",
        template: {
          name: TEMPLATE_AGRADECIMENTO,
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
    statusLogs.push({ tipo: 'agradecimento_inscricao', resultado: '✅ Agradecimento enviado', horario: new Date() });
  } catch (error) {
    console.error(`❌ Erro ao enviar agradecimento para ${numero}:`, JSON.stringify(error.response?.data || error, null, 2));
    statusLogs.push({ tipo: 'agradecimento_inscricao', resultado: '❌ Erro no envio', horario: new Date() });
  }
}

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

    const response = await sheets.spreadsheets.values.get({ spreadsheetId, range });
    const contatos = response.data.values || [];

    let totalEncontrados = 0;
    let totalEnviados = 0;

    for (const [index, linha] of contatos.entries()) {
      const numero = linha[0];    // G
      const statusU = linha[14];  // U

      if (String(statusU || "").toLowerCase() === "nao_incluido" && numeroValido(numero)) {
        totalEncontrados++;
        try {
          await enviarTemplateAgradecimentoInscricao(numero);
          totalEnviados++;
        } catch (_) {}
      }
    }

    console.log(`📊 Resultado final: ${totalEncontrados} contatos 'nao_incluido'. ${totalEnviados} mensagens enviadas.`);
  } catch (error) {
    console.error("❌ Erro ao disparar agradecimento:", error);
  }
}

// ================================================================
// COMUNICADO GERAL (Cadastro + Encontreiros) com aba dinâmica
// ================================================================
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

    // CADASTRO OFICIAL
    const planilhaCadastroId = SHEET_CADASTRO_ID;
    const abaCadastro = await descobrirAbaCadastro(sheets, planilhaCadastroId);
    const rangeCadastro = `${abaCadastro}!G2:U`; // G telefone, U status

    const resCadastro = await sheets.spreadsheets.values.get({
      spreadsheetId: planilhaCadastroId,
      range: rangeCadastro,
    });

    const rowsCadastro = resCadastro.data.values || [];
    console.log(`📄 [${abaCadastro}] Registros: ${rowsCadastro.length} (ID ${planilhaCadastroId})`);

    for (let i = 0; i < rowsCadastro.length; i++) {
      const numero = rowsCadastro[i][0];
      const status = rowsCadastro[i][14];

      if (!numeroValido(numero) || status === "Enviado" || numerosJaEnviados.has(numero)) {
        continue;
      }

      try {
        await axios.post(
          `https://graph.facebook.com/v19.0/${phone_number_id}/messages`,
          {
            messaging_product: "whatsapp",
            to: numero,
            type: "template",
            template: {
              name: TEMPLATE_COMUNICADO,
              language: { code: "pt_BR" }
            }
          },
          { headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } }
        );

        numerosJaEnviados.add(numero);

        const updateRange = `${abaCadastro}!U${i + 2}`;
        await sheets.spreadsheets.values.update({
          spreadsheetId: planilhaCadastroId,
          range: updateRange,
          valueInputOption: "RAW",
          resource: { values: [["Enviado"]] },
        });
      } catch (erroEnvio) {
        console.error(`❌ [Cadastro] Erro ao enviar para ${numero}:`, erroEnvio.message);
        const updateRange = `${abaCadastro}!U${i + 2}`;
        await sheets.spreadsheets.values.update({
          spreadsheetId: planilhaCadastroId,
          range: updateRange,
          valueInputOption: "RAW",
          resource: { values: [["Erro"]] },
        });
      }
    }

    // ENCONTREIROS
    const planilhaEncontreirosId = SHEET_ENCONTREIROS_ID;
    const rangeEncontreiros = "Fila_Envio!F2:H";

    const resEncontreiros = await sheets.spreadsheets.values.get({
      spreadsheetId: planilhaEncontreirosId,
      range: rangeEncontreiros,
    });

    const rowsEncontreiros = resEncontreiros.data.values || [];
    console.log(`📄 [Encontreiros] Registros: ${rowsEncontreiros.length}`);

    for (let i = 0; i < rowsEncontreiros.length; i++) {
      const numero = rowsEncontreiros[i][0];
      const status = rowsEncontreiros[i][2];

      if (!numeroValido(numero) || status === "Enviado" || numerosJaEnviados.has(numero)) {
        continue;
      }

      try {
        await axios.post(
          `https://graph.facebook.com/v19.0/${phone_number_id}/messages`,
          {
            messaging_product: "whatsapp",
            to: numero,
            type: "template",
            template: {
              name: TEMPLATE_COMUNICADO,
              language: { code: "pt_BR" }
            }
          },
          { headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } }
        );

        numerosJaEnviados.add(numero);

        const updateRange = `Fila_Envio!H${i + 2}`;
        await sheets.spreadsheets.values.update({
          spreadsheetId: planilhaEncontreirosId,
          range: updateRange,
          valueInputOption: "RAW",
          resource: { values: [["Enviado"]] },
        });
      } catch (erroEnvio) {
        console.error(`❌ [Encontreiros] Erro ao enviar para ${numero}:`, erroEnvio.message);
        const updateRange = `Fila_Envio!H${i + 2}`;
        await sheets.spreadsheets.values.update({
          spreadsheetId: planilhaEncontreirosId,
          range: updateRange,
          valueInputOption: "RAW",
          resource: { values: [["Erro"]] },
        });
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

  // Persistência simples em planilha
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
      spreadsheetId: SHEET_ACESSOS_ID,
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

// ================================================================
// INICIALIZAÇÃO DO SERVIDOR
// ================================================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
});
