const express = require("express");
const axios = require("axios");
const app = express();

app.use(express.json());

const VERIFY_TOKEN = "meu_token_webhook";
const token = "EAAKOELSWQlIBOyUZCxsd4vZAHbFbjPKOYgEoCJPp6ZAvktaFKoAQzpwGsVV7uzZCwC89GdT6YYeEUbYxhlZADnxFthPmfKKkH8ZCDQFxydb9JwcfZArGhHWm2v0c7SSUuSpqWZAx84s3MPLrnU1iTo7pzXUEiOoNw16PsSwFkCtTPvssMAy8ZBMD4WVOD4x1Ju5MduxLxC9YrSj9gdtRxPQWgCS9bGR0ZD";
const phone_number_id = "572870979253681";
const makeWebhookMenu1 = "https://hook.us2.make.com/4avmjbxepfl59g3d7jbl8ovylik4mcm8";
const makeWebhookMenu6 = "https://hook.us2.make.com/la3lng90eob57s6gg6yg12s8rlmqy3eh";

function montarMenuPrincipal() {
  return (
    "\ud83d\udccb *Menu Principal - EAC Porci\u00facula* \ud83d\udccb\n\n" +
    "1. Formul\u00e1rio de Inscri\u00e7\u00e3o para Encontristas\n" +
    "2. Formul\u00e1rio de Inscri\u00e7\u00e3o para Encontreiros\n" +
    "3. Instagram do EAC\n" +
    "4. E-mail de contato\n" +
    "5. WhatsApp da Par\u00f3quia\n" +
    "6. Eventos do EAC\n" +
    "7. Playlist no Spotify\n" +
    "8. Falar com um Encontreiro\n\n" +
    "Digite o n\u00famero correspondente \u00e0 op\u00e7\u00e3o desejada. \ud83d\udc47"
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
    console.error("\u274c Erro ao enviar resposta:", error?.response?.data || error);
  }
}

app.get("/", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("\u2705 Webhook verificado com sucesso!");
    res.status(200).send(challenge);
  } else {
    console.log("\u274c Falha na verifica\u00e7\u00e3o do webhook");
    res.sendStatus(403);
  }
});

app.post("/", async (req, res) => {
  const body = req.body;

  if (body.object) {
    const mensagem = body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];

    if (!mensagem || !mensagem.text || !mensagem.from) {
      console.log("\u26a0\ufe0f Evento ignorado (sem mensagem de texto)");
      return res.sendStatus(200);
    }

    const textoRecebido = mensagem.text.body.toLowerCase().trim();
    const numero = mensagem.from;
    const nome = body.entry?.[0]?.changes?.[0]?.value?.contacts?.[0]?.profile?.name || "Amigo(a)";

    console.log(`\ud83d\udce9 Mensagem recebida de ${numero}: "${textoRecebido}"`);

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
        console.error("\u274c Erro ao consultar Make (menu 1):", erro?.response?.data || erro);
        await enviarMensagem(numero, "Desculpe, n\u00e3o consegui acessar o formul\u00e1rio agora. Tente novamente em breve. \ud83d\ude4f");
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
        await enviarMensagem(numero, `📅 *Próximos eventos do EAC:*

${texto}

Se quiser participar, envie um e-mail para eacporciunculadesantana@gmail.com 📬`);
      } catch (erro) {
        console.error("\u274c Erro ao consultar Make (menu 6):", erro?.response?.data || erro);
        await enviarMensagem(numero, "Desculpe, n\u00e3o consegui consultar os eventos agora. Tente novamente em breve. 🙏");
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
  console.log(`\ud83d\ude80 Servidor rodando na porta ${PORT}`);
});






