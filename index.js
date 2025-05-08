const express = require('express');
const axios = require('axios');
const app = express();

app.use(express.json());

// 🔐 Token real de 60 dias gerado via Graph API Explorer
const WHATSAPP_TOKEN = 'EAAKOELSWQlIBOwI88YQBK47aHrymPuIyslcdYmRHrDR1EVdZAlieWtZBK4AqhZBczXyd0bRi3s4HZBPQ0jzAHlfnblEv9PtlOwVNum0PNfmsaJLGzR5jdskoKA2ZCg3Jc9CCGgsNBXpDCbOwEC70GKGZA9602BRMmRWHVAWT7JQHdlx8zCWQLVgWZCR';

// 🔑 Token de verificação configurado no painel da Meta
const VERIFY_TOKEN = 'meu_token_webhook';

// GET para verificação do Webhook pela Meta
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('✅ Webhook verificado com sucesso!');
    res.status(200).send(challenge);
  } else {
    console.log('❌ Verificação do Webhook falhou');
    res.sendStatus(403);
  }
});

// POST para receber mensagens e responder automaticamente
app.post('/webhook', async (req, res) => {
  console.log('📩 Evento recebido:', JSON.stringify(req.body, null, 2));

  const entry = req.body.entry?.[0];
  const changes = entry?.changes?.[0];
  const message = changes?.value?.messages?.[0];
  const phone_number_id = changes?.value?.metadata?.phone_number_id;

  if (message && phone_number_id) {
    const from = message.from;
    const texto = message.text?.body || '(mensagem não textual)';

    console.log(`👤 De: ${from}`);
    console.log(`💬 Mensagem: ${texto}`);

    // Mensagem de resposta
    const data = {
      messaging_product: 'whatsapp',
      to: from,
      type: 'text',
      text: {
        body: `Olá, Christian! Recebemos sua mensagem: "${texto}" 👋`
      }
    };

    try {
      const response = await axios.post(
        `https://graph.facebook.com/v19.0/${phone_number_id}/messages`,
        data,
        {
          headers: {
            Authorization: `Bearer ${WHATSAPP_TOKEN}`,
            'Content-Type': 'application/json'
          }
        }
      );
      console.log('✅ Resposta enviada com sucesso:', response.data);
    } catch (err) {
      console.error('❌ Erro ao enviar resposta:', err.response?.data || err.message);
    }
  }

  res.sendStatus(200);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
});

