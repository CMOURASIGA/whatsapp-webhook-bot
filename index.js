const express = require("express");
const axios = require("axios");
const app = express();

app.use(express.json());

const VERIFY_TOKEN = "meu_token_webhook";
const token = "EAAKOELSWQlIBO6pCWplX4JevcjqBHRE2o82RtwZCOUl6J2vMVg1bAZC6BlhpWAsMVevZABcwOZCHv7HM0BvCasGbZADMz64wUAiXjrGpWCrHGafXln4ZA09ZAOEx7KlsrSbK4zaZAecM6V2eXQUlwFsQq9RQrSzDDbbH97u2xUZBLeftwO9hdKJHshxm2ehApa9JZBuJ8SXl9qpotlpkJjCCaWAjsZD";
const phone_number_id = "572870979253681";
const makeWebhookURL = "https://hook.us2.make.com/la3lng90eob57s6gg6yg12s8rlmqy3eh";

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
    console.error("❌ Erro ao enviar resposta:", error?.response?.data || error);
  }
}

// Rota de verificação do webhook
app.get("/", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("✅ Webhook verificado com sucesso!");
    res.status(200).send(challenge);
  } else {
    console.log("❌ Falha na verificação do webhook");
    res.sendStatus(403);
  }
});

// Rota de recebimento de mensagens
app.post("/", async (req, res) => {
  const body = req.body;

  if (body.object) {
    const mensagem = body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];

    if (!mensagem || !mensagem.text || !mensagem.from) {
      console.log("⚠️ Evento ignorado (sem mensagem de texto)");
      return res.sendStatus(200);
    }

    const textoRecebido = mensagem.text.body.toLowerCase();
    const numero = mensagem.from;
    const nome = body.entry?.[0]?.changes?.[0]?.value?.contacts?.[0]?.profile?.name || "Amigo(a)";

    console.log(`📩 Mensagem recebida de ${numero}: "${textoRecebido}"`);

    if (textoRecebido === "6") {
      try {
        console.log("🔁 Enviando requisição ao Make...");

        const resposta = await axios.post(makeWebhookURL, {
          comando: "eventos",
          nome,
          numero  // ✅ Agora enviando o número também!
        });

        console.log("✅ Resposta do Make recebida:", resposta.data);

        const texto = resposta.data.mensagem || resposta.data;
        await enviarMensagem(
          numero,
          `📅 *Próximos eventos do EAC:*

${texto}

Se quiser participar, envie um e-mail para eacporciunculadesantana@gmail.com 📬`
        );
      } catch (erro) {
        console.error("❌ Erro ao consultar Make:", erro?.response?.data || erro);
        await enviarMensagem(
          numero,
          "Desculpe, não consegui consultar os eventos agora. Tente novamente em breve. 🙏"
        );
      }
    } else {
      await enviarMensagem(numero, montarMenuPrincipal());
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







