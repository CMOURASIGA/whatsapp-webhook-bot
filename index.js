const express = require("express");
const axios = require("axios");
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
    console.error("❌ Erro ao enviar resposta:", JSON.stringify(error.response?.data || error, null, 2));
  }
}

app.post("/webhook", async (req, res) => {
  const body = req.body;

  if (body.object) {
    const mensagem = body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];

    if (!mensagem || !mensagem.text || !mensagem.from) {
      return res.sendStatus(200);
    }

    const textoRecebido = mensagem.text.body.toLowerCase().trim();
    const numero = mensagem.from;

    const saudacoes = ["oi", "olá", "bom dia", "boa tarde", "boa noite"];
    if (saudacoes.some(saud => textoRecebido.includes(saud))) {
      await enviarMensagem(numero, "👋 Seja bem-vindo(a) ao EAC Porciúncula!\n\n" + montarMenuPrincipal());
      return res.sendStatus(200);
    }

    if (textoRecebido === "1") {
      await enviarMensagem(numero, `📝 *Formulário de Inscrição para Encontristas*

Se você deseja participar pela primeira vez do nosso encontro, preencha o formulário abaixo com atenção. 🙏

👉 https://docs.google.com/forms/d/e/1FAIpQLScrESiqWcBsnqMXGwiOOojIeU6ryhuWwZkL1kMr0QIeosgg5w/viewform?usp=preview

Estamos te esperando com alegria! 😄`);
    } else if (textoRecebido === "2") {
      await enviarMensagem(numero, `📝 *Formulário de Inscrição para Encontreiros*

Se você já participou do EAC e quer servir nesta missão, esse é o seu lugar. 💪

Preencha o formulário abaixo:
👉 https://forms.gle/VzqYTs9yvnACiCew6

Qualquer dúvida, fale com a gente:
📲 https://wa.me/5521981845675`);
    } else if (textoRecebido === "3") {
      await enviarMensagem(numero, `📸 *Instagram Oficial do EAC Porciúncula*

Siga a gente no Instagram e acompanhe:
✨ Bastidores dos encontros
✨ Fotos, reels e mensagens
✨ Atualizações e convites especiais

👉 https://www.instagram.com/eacporciuncula/`);
    } else if (textoRecebido === "4") {
      await enviarMensagem(numero, `📬 *Fale com a gente por e-mail!*

Dúvidas, sugestões ou pedidos de oração?
Entre em contato com a nossa equipe:

✉️ eacporciunculadesantana@gmail.com`);
    } else if (textoRecebido === "5") {
      await enviarMensagem(numero, `📱 *WhatsApp da Secretaria Paroquial*

Fale diretamente com a equipe da Paróquia Porciúncula para:
- Informações gerais
- Atendimentos e horários
- Solicitações pastorais

👉 https://wa.me/552123422186`);
    } else if (textoRecebido === "6") {
      await enviarMensagem(numero, `📅 *Eventos do EAC*

Em breve você poderá consultar aqui os próximos eventos, atividades e datas importantes! Fique de olho! 👀`);
    } else if (textoRecebido === "7") {
      await enviarMensagem(numero, `🎵 *Playlist Oficial do EAC no Spotify*

Reviva os momentos marcantes dos encontros com as músicas que tocam o coração. 💛

👉 https://open.spotify.com/playlist/0JquaFjl5u9GrvSgML4S0R`);
    } else if (textoRecebido === "8") {
      await enviarMensagem(numero, `💬 *Falar com um Encontreiro*

Está com alguma dúvida ou precisa conversar com alguém da equipe? Estamos aqui por você! 🙏

📲 https://wa.me/5521981845675`);
    } else {
      await enviarMensagem(numero, `❓ *Ops! Essa opção não existe em nosso menu.*

Confira abaixo as opções disponíveis e escolha uma delas para continuar:`);
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
