const express = require("express");
const axios = require("axios");
const app = express();

app.use(express.json());

const VERIFY_TOKEN = "meu_token_webhook"; // Use o mesmo token no painel da Meta
const token = "EAAKOELSWQlIBOZBuZCrvW9R0W3L06zpfVL6LHx5Vt8oHcB0bzFpYeJ1s7bStw8jrYiAGPRKwPfPrhQ8HSpwvVDPuRoI5u7mkGUiHeJj2YFVUlZCejCV3IpibwCZApOfZBiZBhbZCeOpIZCK3ld8PY174xzROJqGFtvNf1svZBBFHeGE1owNU9emx1D4VqxQ8WIComJNvnzR1yVxxqGAZDZD";
const phone_number_id = "572870979253681";
const makeWebhookMenu1 = "https://hook.us2.make.com/4avmjbxepfl59g3d7jbl8ovylik4mcm8";
const makeWebhookMenu6 = "https://hook.us2.make.com/wmmh2a750u3mbe2xymhvwm6cqt4xknna";

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

// ✅ ROTA GET para verificação do Webhook
app.get("/webhook", (req, res) => {
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

// ✅ ROTA POST para processar mensagens recebidas
app.post("/webhook", async (req, res) => {
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
      try {
        const resposta = await axios.post(makeWebhookMenu1, {
          comando: "formulario_encontristas",
          nome,
          numero
        });
        const texto = resposta.data.mensagem || resposta.data;
        await enviarMensagem(numero, texto);
      } catch (erro) {
        console.error("❌ Erro ao consultar Make (menu 1):", erro?.response?.data || erro);
        await enviarMensagem(numero, "Desculpe, não consegui acessar o formulário agora. Tente novamente em breve. 🙏");
      }
    } else if (textoRecebido === "2") {
      await enviarMensagem(numero, `📝 *Formulário de Inscrição para Encontreiros*

Se você já participou do EAC e quer servir nesta missão, esse é o seu lugar. 🙌

Preencha o formulário abaixo:
👉 [COLE AQUI O LINK DO FORMULÁRIO DE ENCONTREIROS]

Qualquer dúvida, fale conosco:
📲 https://wa.me/5521981845675`);
    } else if (textoRecebido === "3") {
      await enviarMensagem(numero, `📸 *Instagram do EAC Porciúncula*

Nos siga e acompanhe as novidades, fotos e reflexões:
👉 https://www.instagram.com/eacporciuncula/`);
    } else if (textoRecebido === "4") {
      await enviarMensagem(numero, `📬 *E-mail de contato do EAC Porciúncula*

Fale com a gente para dúvidas, sugestões ou apoio:
✉️ eacporciunculadesantana@gmail.com`);
    } else if (textoRecebido === "5") {
      await enviarMensagem(numero, `📱 *WhatsApp da Paróquia Porciúncula*

Fale diretamente com a secretaria paroquial:
👉 https://wa.me/552123422186`);
    } else if (textoRecebido === "6") {
      try {
        const resposta = await axios.post(makeWebhookMenu6, {
          comando: "eventos",
          nome,
          numero
        });
        const texto = resposta.data.mensagem || resposta.data;
        await enviarMensagem(numero, `📅 *Próximos eventos do EAC:*\n\n${texto}\n\nSe quiser participar, envie um e-mail para eacporciunculadesantana@gmail.com 📬`);
      } catch (erro) {
        console.error("❌ Erro ao consultar Make (menu 6):", erro?.response?.data || erro);
        await enviarMensagem(numero, "Desculpe, não consegui consultar os eventos agora. Tente novamente em breve. 🙏");
      }
    } else if (textoRecebido === "7") {
      await enviarMensagem(numero, `🎵 *Playlist do EAC no Spotify*

Ouça as músicas que marcaram nossos encontros:
👉 [INSIRA O LINK DA PLAYLIST]`);
    } else if (textoRecebido === "8") {
      await enviarMensagem(numero, `💬 *Falar com um Encontreiro*

Quer conversar com alguém da nossa equipe? É só mandar uma mensagem:
📲 https://wa.me/5521981845675`);
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







