const express = require("express");
const axios = require("axios");
const { google } = require("googleapis");
const cron = require("node-cron");

const app = express();
app.use(express.json());

const VERIFY_TOKEN = "meu_token_webhook";
const token = "EAAKOELSWQlIBO7rlAd5DN3uQZAnK8sCDvIVRVrdq2UxKiSeLdZBmcPgjPFhLG5CH9NZCActpPvm5X3ZArEM1WkGrYEcDKUywo89FQbyRk9lfGBv1jrUAooidyX7isp7ALbEZB6xAHwOMaZC1xDXkTZAywZCQ9kH3a5LcZCW2Vj5PC4eQD94R5RKGKSND9"; // seu token válido aqui
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

      if (!isNaN(dataEvento.getTime()) && dataEvento.toDateString() === amanha.toDateString()) {
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

// Ping para manter o Render ativo
app.get("/ping", (req, res) => {
  console.log("⏱️ Ping recebido para manter a instância ativa.");
  res.status(200).send("pong");
});

app.head("/ping", (req, res) => {
  console.log("⏱️ HEAD recebido para manter a instância ativa.");
  res.sendStatus(200);
});

// CRON
cron.schedule("50 08 * * *", () => {
  console.log("🔁 Reativando contatos com status pendente...");
  reativarContatosPendentes();
});

cron.schedule("00 09 * * *", () => {
  console.log("⏰ Executando verificação de eventos para lembrete às 09:00...");
  verificarEventosParaLembrete();
});

// Webhook verificação
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

// Webhook de mensagens
app.post("/webhook", async (req, res) => {
  const body = req.body;
  if (body.object) {
    const mensagem = body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    if (!mensagem || !mensagem.text || !mensagem.from) return res.sendStatus(200);

    const textoRecebido = mensagem.text.body.toLowerCase().trim();
    const numero = mensagem.from;

    if ([ "oi", "olá", "bom dia", "boa tarde", "boa noite" ].some(s => textoRecebido.includes(s))) {
      await enviarMensagem(numero, "👋 Seja bem-vindo(a) ao EAC Porciúncula!\n\n" + montarMenuPrincipal());
      return res.sendStatus(200);
    }

    const respostas = {
  "1": "📝 *Inscrição de Encontristas*\n\nSe você quer participar como *adolescente encontrista* no nosso próximo EAC, preencha este formulário com atenção:\n👉 https://docs.google.com/forms/d/e/1FAIpQLScrESiqWcBsnqMXGwiOOojIeU6ryhuWwZkL1kMr0QIeosgg5w/viewform?usp=preview",

  "2": "📝 *Inscrição de Encontreiros*\n\nVocê deseja servir nessa missão linda como *encontreiro*? Preencha aqui para fazer parte da equipe:\n👉 https://forms.gle/VzqYTs9yvnACiCew6",

  "3": "📸 *Nosso Instagram Oficial*\n\nFique por dentro de tudo que acontece no EAC Porciúncula. Curta, compartilhe e acompanhe nossos eventos:\n👉 https://www.instagram.com/eacporciuncula/",

  "4": "📬 *Fale conosco por e-mail*\n\nDúvidas, sugestões ou parcerias? Escreva para a gente:\n✉️ eacporciunculadesantana@gmail.com",

  "5": "📱 *WhatsApp da Paróquia*\n\nQuer falar direto com a secretaria da paróquia? Acesse:\n👉 https://wa.me/552123422186",

  "6": "📅 *Eventos do EAC*\n\nEm breve vamos compartilhar aqui os próximos eventos incríveis que estão por vir. Fique ligado!",

  "7": "🎵 *Nossa Playlist no Spotify*\n\nMúsicas que marcaram nossos encontros e nos inspiram todos os dias:\n👉 https://open.spotify.com/playlist/0JquaFjl5u9GrvSgML4S0R",

  "8": "💬 *Falar com um Encontreiro*\n\nSe quiser tirar dúvidas com alguém da equipe, pode chamar aqui:\n👉 https://wa.me/5521981845675"
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