const express = require("express");
const axios = require("axios");
const app = express();

app.use(express.json());

const VERIFY_TOKEN = "meu_token_webhook";
const token = "EAAKOELSWQlIBOzFR8elJodfFKdjH29Uy1n3ZATZBn59mdP6cflz8O8ON29tGgyQ05HXhbcnbbIiwEl38Kzpq4RHrLyGieo3wtxpqg8VgtivcwyhOXRO6Sso4DH2uchKGAWvbP0VRnZCfwmZBhlZBgrqrOZC0lC4O8FQNNwGnbtWHXQkBmnD4IFXOccNTzcNCeMsh8ZD"; // seu token válido aqui
const phone_number_id = "572870979253681";

function montarMenuPrincipal() {
  return (
    "\uD83D\uDCCB *Menu Principal - EAC Porci\u00facula* \uD83D\uDCCB\n\n" +
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
    console.error("\u274C Erro ao enviar resposta:", JSON.stringify(error.response?.data || error, null, 2));
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

    const saudacoes = ["oi", "ol\u00e1", "bom dia", "boa tarde", "boa noite"];
    if (saudacoes.some(saud => textoRecebido.includes(saud))) {
      await enviarMensagem(numero, "\uD83D\uDC4B Seja bem-vindo(a) ao EAC Porci\u00facula!\n\n" + montarMenuPrincipal());
      return res.sendStatus(200);
    }

    if (textoRecebido === "1") {
      await enviarMensagem(numero, `\uD83D\uDCDD *Formul\u00e1rio de Inscri\u00e7\u00e3o para Encontristas*

Se voc\u00ea deseja participar pela primeira vez do nosso encontro, preencha o formul\u00e1rio abaixo com aten\u00e7\u00e3o. \uD83D\uDE4F

\uD83D\uDC49 https://docs.google.com/forms/d/e/1FAIpQLScrESiqWcBsnqMXGwiOOojIeU6ryhuWwZkL1kMr0QIeosgg5w/viewform?usp=preview

Estamos te esperando com alegria! \uD83D\uDE04`);
    } else if (textoRecebido === "2") {
      await enviarMensagem(numero, `\uD83D\uDCDD *Formul\u00e1rio de Inscri\u00e7\u00e3o para Encontreiros*

Se voc\u00ea j\u00e1 participou do EAC e quer servir nesta miss\u00e3o, esse \u00e9 o seu lugar. \uD83D\uDCAA

Preencha o formul\u00e1rio abaixo:
\uD83D\uDC49 https://forms.gle/VzqYTs9yvnACiCew6

Qualquer d\u00favida, fale com a gente:
\uD83D\uDCF2 https://wa.me/5521981845675`);
    } else if (textoRecebido === "3") {
      await enviarMensagem(numero, `\uD83D\uDCF8 *Instagram Oficial do EAC Porci\u00facula*

Siga a gente no Instagram e acompanhe:
\u2728 Bastidores dos encontros
\u2728 Fotos, reels e mensagens
\u2728 Atualiza\u00e7\u00f5es e convites especiais

\uD83D\uDC49 https://www.instagram.com/eacporciunculadesantana/`);
    } else if (textoRecebido === "4") {
      await enviarMensagem(numero, `\uD83D\uDCEC *Fale com a gente por e-mail!*

D\u00favidas, sugest\u00f5es ou pedidos de ora\u00e7\u00e3o?
Entre em contato com a nossa equipe:

\u2709\uFE0F eacporciunculadesantana@gmail.com`);
    } else if (textoRecebido === "5") {
      await enviarMensagem(numero, `\uD83D\uDCF1 *WhatsApp da Secretaria Paroquial*

Fale diretamente com a equipe da Par\u00f3quia Porci\u00facula para:
- Informa\u00e7\u00f5es gerais
- Atendimentos e hor\u00e1rios
- Solicita\u00e7\u00f5es pastorais

\uD83D\uDC49 https://wa.me/552123422186`);
    } else if (textoRecebido === "6") {
      await enviarMensagem(numero, `\uD83D\uDCC5 *Eventos do EAC*

Em breve voc\u00ea poder\u00e1 consultar aqui os pr\u00f3ximos eventos, atividades e datas importantes! Fique de olho! \uD83D\uDC40`);
    } else if (textoRecebido === "7") {
      await enviarMensagem(numero, `\uD83C\uDFB5 *Playlist Oficial do EAC no Spotify*

Reviva os momentos marcantes dos encontros com as m\u00fasicas que tocam o cora\u00e7\u00e3o. \uD83D\uDC9B

\uD83D\uDC49 https://open.spotify.com/playlist/0JquaFjl5u9GrvSgML4S0R`);
    } else if (textoRecebido === "8") {
      await enviarMensagem(numero, `\uD83D\uDCAC *Falar com um Encontreiro*

Est\u00e1 com alguma d\u00favida ou precisa conversar com algu\u00e9m da equipe? Estamos aqui por voc\u00ea! \uD83D\uDE4F

\uD83D\uDCF2 https://wa.me/5521981845675`);
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
  console.log(`\uD83D\uDE80 Servidor rodando na porta ${PORT}`);
});
