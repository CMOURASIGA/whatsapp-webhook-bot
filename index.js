// index.js recriado a partir do index_webhook original + menu principal interativo e integração Make correta

const express = require("express");
const axios = require("axios");
const app = express();

app.use(express.json());

const token = "EAAS1VZCpxlZBsBO95H1rNWwuzqKYIoJ0sn2ijF90OZCdgtSMHSYlBl6lAEcXgHCXzjU4DIoY3pQdSXVwhDXajcBLcKaCaITIivBSi0UVPZBSrUy7IMzzM6rZBTSnPYSKx0nIzvGMcUZCqlfplPyKa70YfzqcxcSZAKK1btsR8V84s9Ucp43KdZAwsrxL1AZDZD";
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
  } catch (error) {
    console.error("Erro ao enviar resposta:", error?.response?.data || error);
  }
}

app.post("/", async (req, res) => {
  const body = req.body;

  if (body.object) {
    const mensagem = body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    const textoRecebido = mensagem?.text?.body?.toLowerCase() || "";
    const numero = mensagem?.from;
    const nome = body.entry?.[0]?.changes?.[0]?.value?.contacts?.[0]?.profile?.name || "Amigo(a)";

    console.log(`📩 Mensagem recebida de ${numero}: "${textoRecebido}"`);

    if (textoRecebido === "6") {
      try {
        const resposta = await axios.post(makeWebhookURL, {
          comando: "eventos",
          nome
        });

        const texto = resposta.data.mensagem || resposta.data;
        await enviarMensagem(
          numero,
          `📅 *Próximos eventos do EAC:*\n\n${texto}\n\nSe quiser participar, envie um e-mail para eacporciunculadesantana@gmail.com 📬`
        );
      } catch (erro) {
        console.error("Erro ao consultar Make:", erro?.response?.data || erro);
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



