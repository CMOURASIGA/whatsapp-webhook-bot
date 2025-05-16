const express = require("express");
const axios = require("axios");
const app = express();

app.use(express.json());

const VERIFY_TOKEN = "meu_token_webhook"; // o mesmo usado no painel da Meta
const n8nWebhookURL = "https://n8n-eac.onrender.com/webhook/webhook-whatsapp"; // <-- URL do webhook no n8n

// 🔄 Verificação do Webhook da Meta
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("✅ Webhook verificado com sucesso!");
    return res.status(200).send(challenge);
  } else {
    console.log("❌ Falha na verificação do webhook");
    return res.sendStatus(403);
  }
});

// 📩 Recepção de mensagens do WhatsApp
app.post("/webhook", async (req, res) => {
  const body = req.body;

  if (body.object) {
    console.log("📩 Evento recebido da Meta, repassando para o n8n...");

    try {
      const response = await axios.post(n8nWebhookURL, body);
      console.log("✅ Enviado para o n8n com sucesso");
    } catch (error) {
      console.error("❌ Erro ao enviar para o n8n:", error?.response?.data || error);
    }

    return res.sendStatus(200);
  } else {
    return res.sendStatus(404);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Servidor escutando na porta ${PORT}`);
});






