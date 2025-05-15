const express = require("express");
const axios = require("axios");
const app = express();

app.use(express.json());

const VERIFY_TOKEN = "meu_token_webhook";
const token = "EAAKOELSWQlIBO9mQ4gZACs65hjMiIypQwilzpaIXEhLIvOjatL53mRIZBwMDb1oK0AZCB8vFnWG6RWVrNrDJKrUwKTripzSuuVm1z2zx1E29MxNK3BP8DsCn7lgcqXGzpfmvKRyK7R1YAy2FGDsO695hHmBZBh5lBEkpXMeWuk2uMMpol9F0czTrZCgXZCBUYnsyw4eslufG6KTPUGPApNyUMZD";
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

    const textoRecebido = mensagem.text.body.toLowerCase().trim();
    const numero = mensagem.from;
    const nome = body.entry?.[0]?.changes?.[0]?.value?.contacts?.[0]?.profile?.name || "Amigo(a)";

    console.log(`📩 Mensagem recebida de ${numero}: "${textoRecebido}"`);

    if (textoRecebido === "1") {
      await enviarMensagem(
        numero,
        `📝 *Formulário de Inscrição para Encontristas*

Seja bem-vindo(a)! Este é o seu primeiro passo para viver um dos momentos mais marcantes do EAC Porciúncula. ✨

Clique aqui para se inscrever:
👉 https://forms.gle/3H2uhX4gj3YG8qJZ9

Dúvidas? Fale direto com nossa equipe:
📲 https://wa.me/5521981845675`
      );
    } else if (textoRecebido === "2") {
      await enviarMensagem(
        numero,
        `📝 *Formulário de Inscrição para Encontreiros*

Se você já participou do EAC e quer servir nesta missão, esse é o seu lugar. 🙌

Preencha o formulário abaixo:
👉 [COLE AQUI O LINK DO FORMULÁRIO DE ENCONTREIROS]

Qualquer dúvida, fale conosco:
📲 https://wa.me/5521981845675`
      );
    } else if (textoRecebido === "3") {
      await enviarMensagem(
        numero,
        `📸 *Instagram do EAC Porciúncula*

Nos siga e acompanhe as novidades, fotos e reflexões:
👉 https://www.instagram.com/eacporciuncula/`
      );
    } else if (textoRecebido === "4") {
      await enviarMensagem(
        numero,
        `📬 *E-mail de contato do EAC Porciúncula*

Fale com a gente para dúvidas, sugestões ou apoio:
✉️ eacporciunculadesantana@gmail.com`
      );
    } else if (textoRecebido === "5") {
      await enviarMensagem(
        numero,
        `📱 *WhatsApp da Paróquia Porciúncula*

Fale diretamente com a secretaria paroquial:
👉 https://wa.me/552123422186`
      );
    } else if (textoRecebido === "6") {
      try {
        console.log("🔁 Enviando requisição ao Make...");

        const resposta = await axios.post(makeWebhookURL, {
          comando: "eventos",
          nome,
          numero
        });

        console.log("✅ Resposta do Make recebida:", resposta.data);

        const texto = resposta.data.mensagem || resposta.data;
        await enviarMensagem(
          numero,
          `📅 *Próximos eventos do EAC:*\n\n${texto}\n\nSe quiser participar, envie um e-mail para eacporciunculadesantana@gmail.com 📬`
        );
      } catch (erro) {
        console.error("❌ Erro ao consultar Make:", erro?.response?.data || erro);
        await enviarMensagem(
          numero,
          "Desculpe, não consegui consultar os eventos agora. Tente novamente em breve. 🙏"
        );
      }
    } else if (textoRecebido === "7") {
      await enviarMensagem(
        numero,
        `🎵 *Playlist do EAC no Spotify*

Ouça as músicas que marcaram nossos encontros:
👉 [INSIRA O LINK DA PLAYLIST]`
      );
    } else if (textoRecebido === "8") {
      await enviarMensagem(
        numero,
        `💬 *Falar com um Encontreiro*

Quer conversar com alguém da nossa equipe? É só mandar uma mensagem:
📲 https://wa.me/5521981845675`
      );
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







