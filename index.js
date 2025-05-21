const express = require("express");
const axios = require("axios");
const { google } = require("googleapis");
const cron = require("node-cron");

const app = express();
app.use(express.json());

const VERIFY_TOKEN = "meu_token_webhook";
const token = process.env.TOKEN_WHATSAPP;
const phone_number_id = "572870979253681";

function montarMenuPrincipal() {
  return (
    "\uD83D\uDCCB *Menu Principal - EAC Porci\u00fancula* \uD83D\uDCCB\n\n" +
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
    console.error("\u274C Erro ao enviar mensagem:", JSON.stringify(error.response?.data || error, null, 2));
  }
}

app.post("/webhook", async (req, res) => {
  const body = req.body;
  if (body.object) {
    const mensagem = body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    if (!mensagem || !mensagem.text || !mensagem.from) return res.sendStatus(200);

    const textoRecebido = mensagem.text.body.toLowerCase().trim();
    const numero = mensagem.from;

    if (["oi", "ol\u00e1", "bom dia", "boa tarde", "boa noite"].some(s => textoRecebido.includes(s))) {
      await enviarMensagem(numero, "\uD83D\uDC4B Seja bem-vindo(a) ao EAC Porci\u00fancula!\n\n" + montarMenuPrincipal());
      return res.sendStatus(200);
    }

    if (textoRecebido === "6") {
      const saudacao = "\uD83D\uDCC5 *Agenda de Eventos do EAC - M\u00eas Atual*";

      try {
        const resposta = await axios.get("https://script.google.com/macros/s/AKfycbyKiRCN2ynBvdkWqvNY-WjaNQ1_xriYRI-fh0QuX_Dd2fBZqRBCdyl1RizBbU4_mnOrbA/exec");
        const { status, links } = resposta.data;

        if (status === "SEM_EVENTOS") {
          await enviarMensagem(numero, "\u26A0\uFE0F Ainda n\u00e3o h\u00e1 eventos cadastrados para este m\u00eas.");
        } else if (Array.isArray(links)) {
          await enviarMensagem(numero, saudacao);
          for (const link of links) {
            await axios.post(
              `https://graph.facebook.com/v19.0/${phone_number_id}/messages`,
              {
                messaging_product: "whatsapp",
                to: numero,
                type: "image",
                image: { link }
              },
              {
                headers: {
                  Authorization: `Bearer ${token}`,
                  "Content-Type": "application/json"
                }
              }
            );
          }
        } else {
          await enviarMensagem(numero, "\u26A0\uFE0F Ocorreu um erro ao buscar os eventos.");
        }
      } catch (erro) {
        console.error("Erro ao buscar eventos do m\u00eas:", erro);
        await enviarMensagem(numero, "\u274C N\u00e3o conseguimos carregar a agenda agora. Tente novamente mais tarde.");
      }

      return res.sendStatus(200);
    }

    const respostas = {
      "1": "\uD83D\uDCDD *Inscri\u00e7\u00e3o de Encontristas*\n\nSe voc\u00ea quer participar como *adolescente encontrista* no nosso pr\u00f3ximo EAC, preencha este formul\u00e1rio com aten\u00e7\u00e3o:\n\uD83D\uDC49 https://docs.google.com/forms/d/e/1FAIpQLScrESiqWcBsnqMXGwiOOojIeU6ryhuWwZkL1kMr0QIeosgg5w/viewform?usp=preview",
      "2": "\uD83D\uDCDD *Inscri\u00e7\u00e3o de Encontreiros*\n\nVoc\u00ea deseja servir nessa miss\u00e3o linda como *encontreiro*? Preencha aqui para fazer parte da equipe:\n\uD83D\uDC49 https://forms.gle/VzqYTs9yvnACiCew6",
      "3": "\uD83D\uDCF8 *Nosso Instagram Oficial*\n\nFique por dentro de tudo que acontece no EAC Porci\u00fancula. Curta, compartilhe e acompanhe nossos eventos:\n\uD83D\uDC49 https://www.instagram.com/eacporciuncula/",
      "4": "\uD83D\uDCEC *Fale conosco por e-mail*\n\nD\u00favidas, sugest\u00f5es ou parcerias? Escreva para a gente:\n\u2709\uFE0F eacporciunculadesantana@gmail.com",
      "5": "\uD83D\uDCF1 *WhatsApp da Par\u00f3quia*\n\nQuer falar direto com a secretaria da par\u00f3quia? Acesse:\n\uD83D\uDC49 https://wa.me/552123422186",
      "7": "\uD83C\uDFB5 *Nossa Playlist no Spotify*\n\nM\u00fasicas que marcaram nossos encontros e nos inspiram todos os dias:\n\uD83D\uDC49 https://open.spotify.com/playlist/0JquaFjl5u9GrvSgML4S0R",
      "8": "\uD83D\uDCAC *Falar com um Encontreiro*\n\nSe quiser tirar d\u00favidas com algu\u00e9m da equipe, pode chamar aqui:\n\uD83D\uDC49 https://wa.me/5521981845675"
    };

    if (respostas[textoRecebido]) {
      await enviarMensagem(numero, respostas[textoRecebido]);
    } else {
      await enviarMensagem(numero, `\u2753 *Ops! Op\u00e7\u00e3o inv\u00e1lida.*\n\n${montarMenuPrincipal()}`);
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

reativarContatosPendentes();
verificarEventosParaLembrete();