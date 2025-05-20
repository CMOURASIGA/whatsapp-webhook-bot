const express = require("express");
const axios = require("axios");
const { google } = require("googleapis");
const cron = require("node-cron");

const app = express();
app.use(express.json());

const VERIFY_TOKEN = "meu_token_webhook";
const token = "EA.."; // seu token válido aqui
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

async function verificarEventosParaLembrete() {
  try {
    const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
    });

    const sheets = google.sheets({ version: "v4", auth: await auth.getClient() });

    const spreadsheetId = "1BXitZrMOxFasCJAqkxVVdkYPOLLUDEMQ2bIx5mrP8Y8";
    const rangeEventos = "comunicados!A2:G";

    const response = await sheets.spreadsheets.values.get({ spreadsheetId, range: rangeEventos });
    const rows = response.data.values;
    if (!rows) return;

    const hoje = new Date();
    const amanha = new Date(hoje);
    amanha.setDate(hoje.getDate() + 1);
    const msgUsuarios = [];

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
        const titulo = row[1] || "(Sem título)"; // coluna B
        msgUsuarios.push(`📢 *Lembrete*: Amanhã teremos *${titulo}* no EAC. Esperamos você com alegria! 🙌`);
      }
    }

    const numeros = ["5521981845675"];
    console.log("📅 Eventos encontrados:", msgUsuarios.length);

    for (const numero of numeros) {
      for (const mensagem of msgUsuarios) {
        console.log(`📤 Enviando mensagem: ${mensagem} para ${numero}`);
        await enviarMensagem(numero, mensagem);
      }
    }
  } catch (erro) {
    console.error("Erro ao verificar eventos:", erro);
  }
}

// Ping diário para manter o Render ativo
app.get("/ping", (req, res) => {
  console.log("⏱️ Ping recebido para manter a instância ativa.");
  res.status(200).send("pong");
});

cron.schedule("20 11 * * *", () => {
  console.log("⏰ Executando verificação de eventos para lembrete às 11:20...");
  verificarEventosParaLembrete();
});

app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

app.post("/webhook", async (req, res) => {
  const body = req.body;
  if (body.object) {
    const mensagem = body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    if (!mensagem || !mensagem.text || !mensagem.from) return res.sendStatus(200);

    const textoRecebido = mensagem.text.body.toLowerCase().trim();
    const numero = mensagem.from;

    if (["oi", "olá", "bom dia", "boa tarde", "boa noite"].some(s => textoRecebido.includes(s))) {
      await enviarMensagem(numero, "👋 Seja bem-vindo(a) ao EAC Porciúncula!\n\n" + montarMenuPrincipal());
      return res.sendStatus(200);
    }

    const respostas = {
      "1": "📝 *Encontristas*\nhttps://docs.google.com/forms/d/e/1FAIpQLScrESiqWcBsnqMXGwiOOojIeU6ryhuWwZkL1kMr0QIeosgg5w/viewform?usp=preview",
      "2": "📝 *Encontreiros*\nhttps://forms.gle/VzqYTs9yvnACiCew6",
      "3": "📸 Instagram\nhttps://www.instagram.com/eacporciuncula/",
      "4": "📬 E-mail\n✉️ eacporciunculadesantana@gmail.com",
      "5": "📱 WhatsApp da Paróquia\nhttps://wa.me/552123422186",
      "6": "📅 Eventos em breve estarão disponíveis.",
      "7": "🎵 Spotify\nhttps://open.spotify.com/playlist/0JquaFjl5u9GrvSgML4S0R",
      "8": "💬 Encontreiro\nhttps://wa.me/5521981845675"
    };

    if (respostas[textoRecebido]) {
      await enviarMensagem(numero, respostas[textoRecebido]);
    } else {
      await enviarMensagem(numero, `❓ *Ops! Opção inválida.*\n\n${montarMenuPrincipal()}`);
    }
    res.sendStatus(200);
  } else {
    res.sendStatus(404);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
});

verificarEventosParaLembrete();
