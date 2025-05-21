const express = require("express");
const axios = require("axios");
const { google } = require("googleapis");
const cron = require("node-cron");

const app = express();
app.use(express.json());

const VERIFY_TOKEN = "meu_token_webhook";
const token = process.env.TOKEN_WHATSAPP;
const phone_number_id = "572870979253681";

function montarMenuPrincipal() {
  return (
    "\uD83D\uDCCB *Menu Principal - EAC Porci\u00fancula* \uD83D\uDCCB\n\n" +
    "1. Formul\u00e1rio de Inscri\u00e7\u00e3o para Encontristas\n" +
    "2. Formul\u00e1rio de Inscri\u00e7\u00e3o para Encontreiros\n" +
    "3. Instagram do EAC\n" +
    "4. E-mail de contato\n" +
    "5. WhatsApp da Par\u00f3quia\n" +
    "6. Eventos do EAC\n" +
    "7. Playlist no Spotify\n" +
    "8. Falar com um Encontreiro\n\n" +
    "Digite o n\u00famero correspondente \u00e0 op\u00e7\u00e3o desejada. \uD83D\uDC47"
  );
}

async function enviarMensagem(numero, mensagem) {
  try {
    await axios.post(
      `https://graph.facebook.com/v19.0/${phone_number_id}/messages`,
      {
        messaging_product: "whatsapp",
        to: numero,
        text: { body: mensagem },
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      }
    );
    console.log("\u2705 Mensagem enviada com sucesso para:", numero);
  } catch (error) {
    console.error("\u274C Erro ao enviar mensagem:", JSON.stringify(error.response?.data || error, null, 2));
  }
}

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

    console.log("\uD83D\uDD04 Contatos com status 'Pendente' atualizados para 'Ativo'.");
  } catch (error) {
    console.error("Erro ao atualizar contatos:", error);
  }
}

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
    const amanha = new Date(hoje);
    amanha.setDate(hoje.getDate() + 1);
    const mensagens = [];

    for (const row of rows) {
      const valorData = row[6];
      if (!valorData) continue;

      let dataEvento;
      if (/^\d{2}\/\d{2}\/\d{4}$/.test(valorData)) {
        const [dia, mes, ano] = valorData.split("/");
        dataEvento = new Date(`${ano}-${mes}-${dia}`);
      } else {
        dataEvento = new Date(valorData);
      }

      if (!isNaN(dataEvento.getTime()) && dataEvento.toDateString() === amanha.toDateString()) {
        const titulo = row[1] || "(Sem t\u00edtulo)";
        mensagens.push(`\uD83D\uDCE2 *Lembrete*: Amanh\u00e3 teremos *${titulo}* no EAC. Esperamos voc\u00ea com alegria! \uD83D\uDE4C`);
      }
    }

    const planilhas = [
      "1BXitZrMOxFasCJAqkxVVdkYPOLLUDEMQ2bIx5mrP8Y8",
      "1M5vsAANmeYk1pAgYjFfa3ycbnyWMGYb90pKZuR9zNo4"
    ];

    for (const spreadsheetId of planilhas) {
      const rangeFila = "fila_envio!F2:G";
      const fila = await sheets.spreadsheets.values.get({ spreadsheetId, range: rangeFila });
      const contatos = fila.data.values || [];

      const numeros = contatos
        .map(([numero, status], idx) => ({ numero, status, idx }))
        .filter(c => c.status === "Ativo");

      console.log("\uD83D\uDCE8 Contatos ativos:", numeros.length);
      const updates = contatos.map(([numero, status]) => [status]);

      for (const contato of numeros) {
        const saudacao = "\uD83C\uDF1E Bom dia! Aqui \u00e9 o EAC Porci\u00fancula trazendo uma mensagem especial para voc\u00ea:";
        for (const mensagem of mensagens) {
          await enviarMensagem(contato.numero, saudacao);
          await enviarMensagem(contato.numero, mensagem);
          updates[contato.idx] = ["Pendente"];
        }
      }

      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: "fila_envio!G2:G",
        valueInputOption: "RAW",
        resource: { values: updates },
      });
    }
  } catch (erro) {
    console.error("Erro ao verificar eventos:", erro);
  }
}

// CRON
cron.schedule("50 08 * * *", () => {
  console.log("\uD83D\uDD01 Reativando contatos com status pendente...");
  reativarContatosPendentes();
});

cron.schedule("00 09 * * *", () => {
  console.log("\u23F0 Executando verifica\u00e7\u00e3o de eventos para lembrete \u00e0s 09:00...");
  verificarEventosParaLembrete();
});
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
});

reativarContatosPendentes();
verificarEventosParaLembrete();
