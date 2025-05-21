const express = require("express"); const axios = require("axios"); const { google } = require("googleapis"); const cron = require("node-cron");

const app = express(); app.use(express.json());

const VERIFY_TOKEN = "meu_token_webhook"; const token = "EAAK"; // seu token válido aqui const phone_number_id = "572870979253681";

function montarMenuPrincipal() { return ( "📋 Menu Principal - EAC Porciúncula 📋\n\n" + "1. Formulário de Inscrição para Encontristas\n" + "2. Formulário de Inscrição para Encontreiros\n" + "3. Instagram do EAC\n" + "4. E-mail de contato\n" + "5. WhatsApp da Paróquia\n" + "6. Eventos do EAC\n" + "7. Playlist no Spotify\n" + "8. Falar com um Encontreiro\n\n" + "Digite o número correspondente à opção desejada. 👇" ); }

async function enviarMensagem(numero, mensagem) { try { await axios.post( https://graph.facebook.com/v19.0/${phone_number_id}/messages, { messaging_product: "whatsapp", to: numero, text: { body: mensagem }, }, { headers: { Authorization: Bearer ${token}, "Content-Type": "application/json", }, } ); console.log("✅ Mensagem enviada com sucesso para:", numero); } catch (error) { console.error("❌ Erro ao enviar mensagem:", JSON.stringify(error.response?.data || error, null, 2)); } }

// ROTA DE PING app.get("/ping", (req, res) => { console.log("⏱️ Ping recebido para manter a instância ativa."); res.status(200).send("pong"); });

app.head("/ping", (req, res) => { console.log("⏱️ HEAD recebido para manter a instância ativa."); res.sendStatus(200); });

// CRON JOBS cron.schedule("50 08 * * *", () => { console.log("🔁 Reativando contatos com status pendente..."); reativarContatosPendentes(); });

cron.schedule("00 09 * * *", () => { console.log("⏰ Executando verificação de eventos para lembrete às 09:00..."); verificarEventosParaLembrete(); });

// WEBHOOK app.get("/webhook", (req, res) => { const mode = req.query["hub.mode"]; const token = req.query["hub.verify_token"]; const challenge = req.query["hub.challenge"]; if (mode === "subscribe" && token === VERIFY_TOKEN) { res.status(200).send(challenge); } else { res.sendStatus(403); } });

app.post("/webhook", async (req, res) => { const body = req.body; if (body.object) { const mensagem = body.entry?.[0]?.changes?.[0]?.value?.messages?.[0]; if (!mensagem || !mensagem.text || !mensagem.from) return res.sendStatus(200);

const textoRecebido = mensagem.text.body.toLowerCase().trim();
const numero = mensagem.from;

if (["oi", "olá", "bom dia", "boa tarde", "boa noite"].some(s => textoRecebido.includes(s))) {
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

} else { res.sendStatus(404); } });

const PORT = process.env.PORT || 3000; app.listen(PORT, () => { console.log(🚀 Servidor rodando na porta ${PORT}); });

reativarContatosPendentes();
verificarEventosParaLembrete();