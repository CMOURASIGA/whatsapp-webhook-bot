const express = require("express");
const axios = require("axios");
const { google } = require("googleapis");
const cron = require("node-cron");

const app = express();
app.use(express.json());

const VERIFY_TOKEN = "meu_token_webhook";
const token = "EAAKOELSWQlIBO7rlAd5DN3uQZAnK8sCDvIVRVrdq2UxKiSeLdZBmcPgjPFhLG5CH9NZCActpPvm5X3ZArEM1WkGrYEcDKUywo89FQbyRk9lfGBv1jrUAooidyX7isp7ALbEZB6xAHwOMaZC1xDXkTZAywZCQ9kH3a5LcZCW2Vj5PC4eQD94R5RKGKSND9";
const phone_number_id = "572870979253681";

function montarMenuPrincipal() {
  return (
    "📋 *Menu Principal - EAC Porciúncula* 📋\n\n" +
    "1. Formulário de Inscrição para Encontristas\n" +
    "2. Formulário de Inscrição para Encontreiros\n" +
    "3. Instagram do EAC\n" +
    "4. E-mail de contato\n" +
    "5. WhatsApp da Paróquia\n" +
    "6. Eventos do EAC\n" +
    "7. Playlist no Spotify\n" +
    "8. Falar com um Encontreiro\n\n" +
    "Digite o número correspondente à opção desejada. 👇"
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
    console.log("✅ Mensagem enviada com sucesso para:", numero);
  } catch (error) {
    console.error("❌ Erro ao enviar mensagem:", JSON.stringify(error.response?.data || error, null, 2));
  }
}

// RECEBE MENSAGENS DO WHATSAPP E RESPONDE COM O MENU
app.post("/webhook", (req, res) => {
  const body = req.body;
  console.log("📥 Webhook recebido:", JSON.stringify(body, null, 2));

  if (
    body.object &&
    body.entry &&
    body.entry[0].changes &&
    body.entry[0].changes[0].value.messages &&
    body.entry[0].changes[0].value.messages[0]
  ) {
    const mensagem = body.entry[0].changes[0].value.messages[0];
    const numero = mensagem.from;
    const textoRecebido = mensagem.text?.body?.toLowerCase() || "";

    console.log(`📨 Mensagem recebida de ${numero}: ${textoRecebido}`);

    if (textoRecebido === "oi" || textoRecebido.includes("menu")) {
      const menu = montarMenuPrincipal();
      enviarMensagem(numero, menu);
    }
  }

  res.sendStatus(200);
});

// VERIFICAÇÃO DO TOKEN DO WEBHOOK
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("✅ Webhook verificado com sucesso.");
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

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

      const dataValida = !isNaN(dataEvento.getTime());
      console.log("📆 Verificando data:", valorData, "->", dataEvento.toDateString());

      if (!dataValida) {
        console.log(`⚠️ Data inválida detectada: ${valorData}`);
        continue;
      }

      if (dataEvento.toDateString() === amanha.toDateString()) {
        const titulo = row[1] || "(Sem título)";
        mensagens.push(`📢 *Lembrete*: Amanhã teremos *${titulo}* no EAC. Esperamos você com alegria! 🙌`);
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

      console.log("📨 Contatos ativos:", numeros.length);
      const updates = contatos.map(([numero, status]) => [status]);

      for (const contato of numeros) {
        const saudacao = "🌞 Bom dia! Aqui é o EAC Porciúncula trazendo uma mensagem especial para você:";
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

// Rota de teste
app.get("/ping", (req, res) => {
  console.log("⏱️ Ping recebido para manter a instância ativa.");
  res.status(200).send("pong");
});

app.head("/ping", (req, res) => {
  console.log("⏱️ HEAD recebido para manter a instância ativa.");
  res.sendStatus(200);
});

// Agendamentos
cron.schedule("50 08 * * *", () => {
  console.log("🔁 Reativando contatos com status pendente...");
  reativarContatosPendentes();
});

cron.schedule("00 09 * * *", () => {
  console.log("⏰ Executando verificação de eventos para lembrete às 09:00...");
  verificarEventosParaLembrete();
});

// Execução imediata
reativarContatosPendentes();
verificarEventosParaLembrete();

// Inicialização
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
});