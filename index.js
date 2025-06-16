const express = require("express");
const axios = require("axios");
const { google } = require("googleapis");
const cron = require("node-cron");

const app = express();
app.use(express.json());

const VERIFY_TOKEN = "meu_token_webhook";
const token = process.env.TOKEN_WHATSAPP;
const phone_number_id = "572870979253681";

// Função para montar o menu principal
function montarMenuPrincipal() {
  return (
    "📋 *Menu Principal - EAC Porciúncula* 📋\n\n" +
    "1 - 1️⃣ Formulário de Inscrição para Encontristas\n" +
    "2 - 2️⃣ Formulário de Inscrição para Encontreiros\n" +
    "3 - 📸 Instagram do EAC\n" +
    "4 - 📬 E-mail de contato\n" +
    "5 - 📱 WhatsApp da Paróquia\n" +
    "6 - 📅 Eventos do EAC\n" +
    "7 - 🎵 Playlist no Spotify\n" +
    //"8 - 💬 Falar com um Encontreiro\n" +
    "9 - 💡 Mensagem do Dia\n" +
    "10 - 📖 Versículo do Dia\n\n" +
    "Digite o número correspondente à opção desejada. 👇"
  );
}

// Enviar mensagem para número via WhatsApp Cloud API
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
    console.error("❌ Erro ao enviar mensagem:", JSON.stringify(error.response?.data || error, null, 2));
  }
}


// Função para envio de template de lembrete de evento
async function enviarTemplateLembreteEvento(numero, eventoNome, dataEvento) {
  try {
    // Validação dos parâmetros obrigatórios
    if (!numero || !eventoNome || !dataEvento) {
      console.error(`❌ Parâmetros inválidos. Dados recebidos: numero=${numero}, eventoNome=${eventoNome}, dataEvento=${dataEvento}`);
      return;
    }

    // Log antes do envio
    console.log(`📨 Preparando envio para: ${numero}`);
    console.log(`📅 Evento: ${eventoNome} | Data: ${dataEvento}`);
    console.log(`Debug: Parâmetros do template - eventoNome: ${eventoNome}, dataEvento: ${dataEvento}`);
    console.log(`Debug: Objeto template completo: ${JSON.stringify({
          name: "eac_lembrete_v1", // <-- NOME DO TEMPLATE ATUALIZADO AQUI
          language: { code: "pt_BR" },
          components: [
            {
              type: "body",
              parameters: [
                { type: "text", text: eventoNome },                             // Mapeia para {{evento_nome}}
                { type: "text", text: "15/06/2025" },                           // Mapeia para {{prazo_resposta}}
                { type: "text", text: dataEvento },                             // Mapeia para {{data_evento}}
                { type: "text", text: "09:00 às 18:00" }                       // Mapeia para {{hora_evento}}
              ]
            }
          ]
        }, null, 2)}`);

    await axios.post(
      `https://graph.facebook.com/v19.0/${phone_number_id}/messages`,
      {
        messaging_product: "whatsapp",
        to: numero,
        type: "template",
        template: {
          name: "eac_lembrete_v1", // <-- NOME DO TEMPLATE ATUALIZADO AQUI
          language: { code: "pt_BR" },
          components: [
            {
              type: "body",
              parameters: [
                { type: "text", text: eventoNome },
                { type: "text", text: "15/06/2025" },
                { type: "text", text: dataEvento },
                { type: "text", text: "09:00" }
              ]
            }
          ]
        }
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        }
      }
     );

    console.log(`✅ Template enviado com sucesso para: ${numero}`);
  } catch (error) {
    console.error(`❌ Erro ao enviar template para o número ${numero}:`, JSON.stringify(error.response?.data || error, null, 2));
  }
}



// Atualiza contatos pendentes para ativo
async function reativarContatosPendentes() {
  try {
    const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });
    const client = await auth.getClient();
    const sheets = google.sheets({ version: "v4", auth: client });

    const atualizarPendentes = async (spreadsheetId) => {
      const range = "fila_envio!G2:G";
      const getRes = await sheets.spreadsheets.values.get({ spreadsheetId, range });
      const values = getRes.data.values || [];
      const updates = values.map((row) => row[0] === "Pendente" ? ["Ativo"] : [row[0]]);

      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range,
        valueInputOption: "RAW",
        resource: { values: updates },
      });
    };

    await atualizarPendentes("1BXitZrMOxFasCJAqkxVVdkYPOLLUDEMQ2bIx5mrP8Y8");
    await atualizarPendentes("1M5vsAANmeYk1pAgYjFfa3ycbnyWMGYb90pKZuR9zNo4");

    console.log("🔄 Contatos com status 'Pendente' atualizados para 'Ativo'.");
  } catch (error) {
    console.error("Erro ao atualizar contatos:", error);
  }
}

// Verificação e resposta automática a saudações
function ehSaudacao(texto) {
  const saudacoes = ["oi", "olá", "ola", "bom dia", "boa tarde", "boa noite", "menu"];
  return saudacoes.some(s => texto.includes(s));
}

// Verifica eventos da aba 'comunicados' para enviar lembrete
async function verificarEventosParaLembrete() {
  try {
    const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });

    const sheets = google.sheets({ version: "v4", auth: await auth.getClient() });
    const spreadsheetIdEventos = "1BXitZrMOxFasCJAqkxVVdkYPOLLUDEMQ2bIx5mrP8Y8";
    const rangeEventos = "comunicados!A2:G";
    const response = await sheets.spreadsheets.values.get({ spreadsheetId: spreadsheetIdEventos, range: rangeEventos });
    const rows = response.data.values;
    if (!rows) return;

    /*const hoje = new Date();
    const amanha = new Date(hoje);
    seteDiasDepois.setDate(hoje.getDate() + 7);
    const eventosDaSemana = [];

    for (const row of rows) {
      const valorData = row[6];
      if (!valorData) continue;

      let dataEvento;
      if (/^\d{2}\/\d{2}\/\d{4}$/.test(valorData)) {
        const [dia, mes, ano] = valorData.split("/");
        dataEvento = new Date(`${ano}-${mes}-${dia}`);
      } else {
        dataEvento = new Date(valorData);
      }

      if (!isNaN(dataEvento.getTime()) && dataEvento.toDateString() === amanha.toDateString()) {
        const titulo = row[1] || "(Sem título)";
        mensagens.push(`📢 *Lembrete*: Amanhã teremos *${titulo}* no EAC. Esperamos você com alegria! 🙌`);
      }
    }*/

    const hoje = new Date();
    const seteDiasDepois = new Date(hoje);
    seteDiasDepois.setDate(hoje.getDate() + 7);

    const eventosDaSemana = [];

    for (const row of rows) {
      const valorData = row[6]; // Coluna G da planilha
      if (!valorData) continue;

      let dataEvento;
      if (/^\d{2}\/\d{2}\/\d{4}$/.test(valorData)) { 
        const [dia, mes, ano] = valorData.split("/");
        dataEvento = new Date(`${ano}-${mes}-${dia}`);
      } else {
        dataEvento = new Date(valorData);
      }

      if (!isNaN(dataEvento.getTime()) && dataEvento >= hoje && dataEvento <= seteDiasDepois) {
        const titulo = row[1] || "(Sem título)";
        const dataFormatada = `${dataEvento.getDate().toString().padStart(2, '0')}/${(dataEvento.getMonth() + 1).toString().padStart(2, '0')}`;
        /*eventosDaSemana.push(`🔔 ${dataFormatada} - ${titulo}`)*/
        eventosDaSemana.push({
          nome: titulo,
          data: dataFormatada
        });
      }
    }

    const planilhas = [
      "1BXitZrMOxFasCJAqkxVVdkYPOLLUDEMQ2bIx5mrP8Y8",
      "1M5vsAANmeYk1pAgYjFfa3ycbnyWMGYb90pKZuR9zNo4"
    ];

    for (const spreadsheetId of planilhas) {
      const rangeFila = "fila_envio!F2:G";
      const fila = await sheets.spreadsheets.values.get({ spreadsheetId, range: rangeFila });
      const contatos = fila.data.values || [];

      const numeros = contatos
        .map(([numero, status], idx) => ({ numero, status, idx }))
        .filter(c => c.status === "Ativo");

      console.log("📨 Contatos ativos:", numeros.length);
      const updates = contatos.map(([numero, status]) => [status]);

      /*for (const contato of numeros) {
        const saudacao = "🌞 Bom dia! Aqui é o EAC Porciúncula trazendo uma mensagem especial para você:";
        for (const mensagem of mensagens) {
          await enviarMensagem(contato.numero, saudacao);
          await enviarMensagem(contato.numero, mensagem);
          updates[contato.idx] = ["Pendente"];
        }
      }
      for (const contato of numeros) {
        const saudacao = "🌞 Bom dia! Aqui é o EAC Porciúncula trazendo uma mensagem especial para você:";
  
        // Envia apenas UMA vez a saudação
        await enviarMensagem(contato.numero, saudacao);

        // Envia TODAS as mensagens de evento (uma vez cada)
        for (const mensagem of mensagens) {
        await enviarMensagem(contato.numero, mensagem);
        }

        // Atualiza o status para Pendente apenas uma vez no final
        updates[contato.idx] = ["Pendente"];
      }*/
      if (eventosDaSemana.length > 0) {
        const saudacao = "🌞 Bom dia! Aqui é o EAC Porciúncula trazendo um resumo dos próximos eventos:\n";
        const cabecalho = `📅 *Agenda da Semana (${hoje.toLocaleDateString()} a ${seteDiasDepois.toLocaleDateString()})*\n\n`;
        const corpo = eventosDaSemana.join("\n");
        const rodape = "\n👉 Se tiver dúvida, fale com a gente!";

        const mensagemFinal = `${saudacao}${cabecalho}${corpo}${rodape}`;

      for (const contato of numeros) {
        for (const evento of eventosDaSemana) {
          await enviarTemplateLembreteEvento(contato.numero, evento.nome, evento.data);
        }
        updates[contato.idx] = ["Pendente"];
      }


      } else {
        console.log("Nenhum evento na próxima semana.");
      }

      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: "fila_envio!G2:G",
        valueInputOption: "RAW",
        resource: { values: updates },
      });
    }
  } catch (erro) {
    console.error("Erro ao verificar eventos:", erro);
  }
}

// Webhook principal
app.post("/webhook", async (req, res) => {
  const body = req.body;
  if (body.object) {
    const mensagem = body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    if (!mensagem || !mensagem.text || !mensagem.from) return res.sendStatus(200);

    const textoRecebido = mensagem.text.body.toLowerCase().trim();
    const numero = mensagem.from;

    if (ehSaudacao(textoRecebido)) {
    await enviarMensagem(numero, "👋 Seja bem-vindo(a) ao EAC Porciúncula!\n\n" + montarMenuPrincipal());
    return res.sendStatus(200);
  }

    const respostas = {
      "1": "📝 *Inscrição de Encontristas*\n\nSe você quer participar como *adolescente encontrista* no nosso próximo EAC, preencha este formulário com atenção:\n👉 https://docs.google.com/forms/d/e/1FAIpQLScrESiqWcBsnqMXGwiOOojIeU6ryhuWwZkL1kMr0QIeosgg5w/viewform?usp=preview",
      "2": "📝 *Inscrição de Encontreiros*\n\nVocê deseja servir nessa missão linda como *encontreiro*? Preencha aqui para fazer parte da equipe:\n👉 https://forms.gle/VzqYTs9yvnACiCew6",
      "3": "📸 *Nosso Instagram Oficial*\n\nFique por dentro de tudo que acontece no EAC Porciúncula. Curta, compartilhe e acompanhe nossos eventos:\n👉 https://www.instagram.com/eacporciuncula/",
      "4": "📬 *Fale conosco por e-mail*\n\nDúvidas, sugestões ou parcerias? Escreva para a gente:\n✉️ eacporciunculadesantana@gmail.com",
      "5": "📱 *WhatsApp da Paróquia*\n\nQuer falar direto com a secretaria da paróquia? Acesse:\n👉 https://wa.me/5521981140278",
      "6": "", // será tratado abaixo
      "7": "🎵 *Nossa Playlist no Spotify*\n\nMúsicas que marcaram nossos encontros e nos inspiram todos os dias:\n👉 https://open.spotify.com/playlist/0JquaFjl5u9GrvSgML4S0R",
      //"8": "💬 *Grupo para Tirar Dúvidas*\n\nSe quiser conversar com alguém da equipe, tirar dúvidas ou interagir com outros participantes, entre no nosso grupo de WhatsApp:\n👉 https://chat.whatsapp.com/HBwZfZqZPjtAYUs3m4f6xg",
    };

    if (textoRecebido === "6") {
      const saudacao = "📅 *Agenda de Eventos do EAC - Mês Atual*";
      try {
        const resposta = await axios.get(process.env.URL_APP_SCRIPT_EVENTOS);
        const { status, links } = resposta.data;

        if (status === "SEM_EVENTOS") {
          await enviarMensagem(numero, "⚠️ Ainda não há eventos cadastrados para este mês.");
        } else if (links) {
          const imagens = Array.isArray(links) ? links : [links];
          await enviarMensagem(numero, saudacao);
          for (const link of imagens) {
            await axios.post(
              `https://graph.facebook.com/v19.0/${phone_number_id}/messages`,
              {
                messaging_product: "whatsapp",
                to: numero,
                type: "image",
                image: { link },
              },
              {
                headers: {
                  Authorization: `Bearer ${token}`,
                  "Content-Type": "application/json",
                },
              }
            );
          }
        } else {
          await enviarMensagem(numero, "⚠️ Ocorreu um erro ao buscar os eventos.");
        }
      } catch (erro) {
        console.error("Erro ao buscar eventos do mês:", erro);
        await enviarMensagem(numero, "❌ Não conseguimos carregar a agenda agora. Tente novamente mais tarde.");
      }

      return res.sendStatus(200);
    }

    if (textoRecebido === "9") {
      try {
        const mensagemMotivacional = await gerarMensagemOpenAI("Envie uma mensagem motivacional curta e inspiradora para adolescentes, em português.");
        await enviarMensagem(numero, `💡 *Mensagem do Dia*\n\n${mensagemMotivacional}`);
      } catch (erro) {
        console.error("Erro ao gerar mensagem do dia:", erro);
        await enviarMensagem(numero, "❌ Erro ao gerar a mensagem do dia.");
      }
      return res.sendStatus(200);
    }

    if (textoRecebido === "10") {
      try {
        const versiculo = await gerarMensagemOpenAI("Envie um versículo bíblico inspirador e curto, com referência, para jovens em português.");
        await enviarMensagem(numero, `📖 *Versículo do Dia*\n\n${versiculo}`);
      } catch (erro) {
        console.error("Erro ao gerar versículo do dia:", erro);
        await enviarMensagem(numero, "❌ Erro ao gerar o versículo do dia.");
      }
      return res.sendStatus(200);
    }

    if (respostas[textoRecebido]) {
      await enviarMensagem(numero, respostas[textoRecebido]);
    } else {
      await enviarMensagem(numero, `❓ *Ops! Opção inválida.*\n\n${montarMenuPrincipal()}`);
    }

    res.sendStatus(200);
  } else {
    res.sendStatus(404);
  }
});

// Função para gerar mensagens com OpenAI
async function gerarMensagemOpenAI(prompt) {
  const apiKey = process.env.OPENAI_API_KEY;
  const resposta = await axios.post(
    "https://api.openai.com/v1/chat/completions",
    {
      model: "gpt-3.5-turbo",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.8,
      max_tokens: 150,
    },
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
    }
  );

  return resposta.data.choices[0].message.content.trim();
}

// Endpoint para disparo manual

// Função para disparar eventos da semana SEM usar template (texto normal)

async function dispararEventosSemTemplate() {
  try {
    const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });
    const client = await auth.getClient();
    const sheets = google.sheets({ version: "v4", auth: client });

    const spreadsheetIdEventos = "1BXitZrMOxFasCJAqkxVVdkYPOLLUDEMQ2bIx5mrP8Y8";
    const rangeEventos = "comunicados!A2:G";
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: spreadsheetIdEventos,
      range: rangeEventos,
    });

    const rows = response.data.values;
    if (!rows) {
      console.log("Nenhum evento encontrado na planilha.");
      return;
    }

    const hoje = new Date();
    const seteDiasDepois = new Date();
    seteDiasDepois.setDate(hoje.getDate() + 7);

    const eventosDaSemana = rows
      .map(row => {
        const titulo = row[1] || "(Sem título)";
        const dataTexto = row[6];
        if (!dataTexto) return null;

        let dataEvento;
        if (/^\d{2}\/\d{2}\/\d{4}$/.test(dataTexto)) {
          const [dia, mes, ano] = dataTexto.split("/");
          dataEvento = new Date(`${ano}-${mes}-${dia}`);
        } else {
          dataEvento = new Date(dataTexto);
        }



        if (!isNaN(dataEvento.getTime()) && dataEvento >= hoje && dataEvento <= seteDiasDepois) {
          return `📅 *${titulo}* - ${dataTexto}`;
        }
        return null;
      })
      .filter(e => e);

    if (eventosDaSemana.length === 0) {
      console.log("Nenhum evento nos próximos 7 dias.");
      return;
    }

    const mensagemFinal = `📢 *Próximos Eventos do EAC:*

${eventosDaSemana.join("\n")}

🟠 Se tiver dúvidas, fale com a gente!`;

    const planilhas = [
      "1BXitZrMOxFasCJAqkxVVdkYPOLLUDEMQ2bIx5mrP8Y8",
      "1M5vsAANmeYk1pAgYjFfa3ycbnyWMGYb90pKZuR9zNo4"
    ];

    for (const spreadsheetId of planilhas) {
      const rangeFila = "fila_envio!F2:G";
      const filaResponse = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: rangeFila,
      });

      const contatos = filaResponse.data.values || [];
      const numerosAtivos = contatos
        .map(([numero, status]) => ({ numero, status }))
        .filter(c => c.status === "Ativo");

      console.log(`📨 Encontrados ${numerosAtivos.length} contatos ativos na planilha ${spreadsheetId}`);

      for (const contato of numerosAtivos) {
        await enviarMensagem(contato.numero, mensagemFinal);
      }
    }

    console.log("✅ Disparo de eventos sem template concluído.");
  } catch (error) {
    console.error("❌ Erro ao disparar eventos sem template:", error);
  }
}








app.get("/disparo", async (req, res) => {
  const chave = req.query.chave;
  const tipo = req.query.tipo;
  const chaveCorreta = process.env.CHAVE_DISPARO;

  if (chave !== chaveCorreta) {
    return res.status(401).send("❌ Acesso não autorizado.");
  }

  try {
    if (tipo === "boasvindas") {
      console.log("🚀 Disparando boas-vindas para todos os contatos ativos...");
      await dispararBoasVindasParaAtivos();
      return res.status(200).send("✅ Boas-vindas enviadas com sucesso.");
    }

    if (tipo === "eventos") {
      console.log("🚀 Disparando eventos da semana (sem template)...");
      await dispararEventosSemTemplate();
      return res.status(200).send("✅ Eventos da semana enviados com sucesso.");
    }

    console.log("📢 Tipo de disparo inválido ou não informado.");
    res.status(400).send("❌ Tipo de disparo inválido. Use tipo=boasvindas ou tipo=eventos.");
  } catch (erro) {
    console.error("❌ Erro no disparo manual:", erro);
    res.status(500).send("❌ Erro ao processar o disparo.");
  }
});


// CRON Jobs
cron.schedule("50 08 * * *", () => {
  console.log("🔁 Reativando contatos com status pendente...");
  reativarContatosPendentes();
});

cron.schedule("00 09 * * *", () => {
  console.log("⏰ Executando verificação de eventos para lembrete às 09:00...");
  verificarEventosParaLembrete();
});

// Execução inicial
//reativarContatosPendentes();
//verificarEventosParaLembrete();


// Função para envio do template de boas-vindas (primeiro contato)
async function enviarTemplateBoasVindas(numero) {
  try {
    console.log(`📨 Enviando template de boas-vindas para: ${numero}`);

    await axios.post(
      `https://graph.facebook.com/v19.0/${phone_number_id}/messages`,
      {
        messaging_product: "whatsapp",
        to: numero,
        type: "template",
        template: {
          name: "eac_boasvindas_v1",
          language: { code: "pt_BR" }
        }
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        }
      }
    );

    console.log(`✅ Template de boas-vindas enviado com sucesso para: ${numero}`);
  } catch (error) {
    console.error(`❌ Erro ao enviar boas-vindas para ${numero}:`, JSON.stringify(error.response?.data || error, null, 2));
  }
}

// Função para disparar boas-vindas para todos os contatos ativos nas duas planilhas
async function dispararBoasVindasParaAtivos() {
  try {
    const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });
    const client = await auth.getClient();
    const sheets = google.sheets({ version: "v4", auth: client });

    const planilhas = [
      "1BXitZrMOxFasCJAqkxVVdkYPOLLUDEMQ2bIx5mrP8Y8",
      "1M5vsAANmeYk1pAgYjFfa3ycbnyWMGYb90pKZuR9zNo4"
    ];

    for (const spreadsheetId of planilhas) {
      const rangeFila = "fila_envio!F2:G";
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: rangeFila,
      });

      const contatos = response.data.values || [];

      const numerosAtivos = contatos
        .map(([numero, status]) => ({ numero, status }))
        .filter(c => c.status === "Ativo");

      console.log(`📨 Encontrados ${numerosAtivos.length} contatos ativos na planilha ${spreadsheetId}`);

      for (const contato of numerosAtivos) {
        await enviarTemplateBoasVindas(contato.numero);
      }
    }

    console.log("✅ Disparo de boas-vindas concluído.");
  } catch (error) {
    console.error("❌ Erro ao disparar boas-vindas para contatos ativos:", error);
  }
}

// Atualizando o endpoint /disparo para incluir o tipo boasvindas

// Função para disparar eventos da semana SEM usar template (texto normal)
async function dispararEventosSemTemplate() {
  try {
    const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });
    const client = await auth.getClient();
    const sheets = google.sheets({ version: "v4", auth: client });

    // Consulta de eventos apenas na planilha dos Encontristas
    const spreadsheetIdEventos = "1BXitZrMOxFasCJAqkxVVdkYPOLLUDEMQ2bIx5mrP8Y8";
    const rangeEventos = "comunicados!A2:G";
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: spreadsheetIdEventos,
      range: rangeEventos,
    });

    const rows = response.data.values;
    if (!rows) {
      console.log("Nenhum evento encontrado na planilha de comunicados.");
      return;
    }

    const hoje = new Date();
    const seteDiasDepois = new Date();
    seteDiasDepois.setDate(hoje.getDate() + 7);

    const eventosDaSemana = rows
      .map(row => {
        const titulo = row[1] || "(Sem título)";
        const dataTexto = row[6];
        if (!dataTexto) return null;

        let dataEvento;
        if (/^\d{2}\/\d{2}\/\d{4}$/.test(dataTexto)) {
          const [dia, mes, ano] = dataTexto.split("/");
          dataEvento = new Date(`${ano}-${mes}-${dia}`);
        } else {
          dataEvento = new Date(dataTexto);
        }

        if (!isNaN(dataEvento.getTime()) && dataEvento >= hoje && dataEvento <= seteDiasDepois) {
          return `📅 *${titulo}* - ${dataTexto}`;
        }
        return null;
      })
      .filter(e => e);

    if (eventosDaSemana.length === 0) {
      console.log("Nenhum evento nos próximos 7 dias.");
      return;
    }

    const mensagemFinal = `📢 *Próximos Eventos do EAC:*\n\n${eventosDaSemana.join("\\n")}\n\n🟠 Se tiver dúvidas, fale com a gente!`;

    // Agora busca os contatos nas DUAS planilhas
    const planilhas = [
      "1BXitZrMOxFasCJAqkxVVdkYPOLLUDEMQ2bIx5mrP8Y8", // Encontristas
      "1M5vsAANmeYk1pAgYjFfa3ycbnyWMGYb90pKZuR9zNo4"  // Encontreiros
    ];

    for (const spreadsheetId of planilhas) {
      const rangeFila = "fila_envio!F2:G";
      const filaResponse = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: rangeFila,
      });

      const contatos = filaResponse.data.values || [];
      const numerosAtivos = contatos
        .map(([numero, status]) => ({ numero, status }))
        .filter(c => c.status === "Ativo");

      console.log(`📨 Encontrados ${numerosAtivos.length} contatos ativos na planilha ${spreadsheetId}`);

      for (const contato of numerosAtivos) {
        await enviarMensagem(contato.numero, mensagemFinal);
      }
    }

    console.log("✅ Disparo de eventos sem template concluído.");
  } catch (error) {
    console.error("❌ Erro ao disparar eventos sem template:", error);
  }
}


app.get("/disparo", async (req, res) => {
  const chave = req.query.chave;
  const tipo = req.query.tipo;
  const chaveCorreta = process.env.CHAVE_DISPARO;

  if (chave !== chaveCorreta) {
    return res.status(401).send("❌ Acesso não autorizado.");
  }

  try {
    if (tipo === "boasvindas") {
      console.log("🚀 Disparando boas-vindas para todos os contatos ativos...");
      await dispararBoasVindasParaAtivos();
      return res.status(200).send("✅ Boas-vindas enviadas com sucesso.");
    }

    if (tipo === "eventos") {
      console.log("🚀 Disparando eventos da semana (sem template)...");
      await dispararEventosSemTemplate();
      return res.status(200).send("✅ Eventos da semana enviados com sucesso.");
    }

    console.log("📢 Tipo de disparo inválido ou não informado.");
    res.status(400).send("❌ Tipo de disparo inválido. Use tipo=boasvindas ou tipo=eventos.");
  } catch (erro) {
    console.error("❌ Erro no disparo manual:", erro);
    res.status(500).send("❌ Erro ao processar o disparo.");
  }
});


// CRON Jobs
cron.schedule("50 08 * * *", () => {
  console.log("🔁 Reativando contatos com status pendente...");
  reativarContatosPendentes();
});

cron.schedule("00 09 * * *", () => {
  console.log("⏰ Executando verificação de eventos para lembrete às 09:00...");
  verificarEventosParaLembrete();
});

// Execução inicial
//reativarContatosPendentes();
//verificarEventosParaLembrete();


// Função para envio do template de boas-vindas (primeiro contato)
async function enviarTemplateBoasVindas(numero) {
  try {
    console.log(`📨 Enviando template de boas-vindas para: ${numero}`);

    await axios.post(
      `https://graph.facebook.com/v19.0/${phone_number_id}/messages`,
      {
        messaging_product: "whatsapp",
        to: numero,
        type: "template",
        template: {
          name: "eac_boasvindas_v1",
          language: { code: "pt_BR" }
        }
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        }
      }
    );

    console.log(`✅ Template de boas-vindas enviado com sucesso para: ${numero}`);
  } catch (error) {
    console.error(`❌ Erro ao enviar boas-vindas para ${numero}:`, JSON.stringify(error.response?.data || error, null, 2));
  }
}

// Função para disparar boas-vindas para todos os contatos ativos nas duas planilhas
async function dispararBoasVindasParaAtivos() {
  try {
    const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });
    const client = await auth.getClient();
    const sheets = google.sheets({ version: "v4", auth: client });

    const planilhas = [
      "1BXitZrMOxFasCJAqkxVVdkYPOLLUDEMQ2bIx5mrP8Y8", // Encontristas
      "1M5vsAANmeYk1pAgYjFfa3ycbnyWMGYb90pKZuR9zNo4"  // Encontreiros
    ];

    const numerosUnicos = new Set();

    for (const spreadsheetId of planilhas) {
      const rangeFila = "fila_envio!F2:G";
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: rangeFila,
      });

      const contatos = response.data.values || [];

      contatos.forEach(([numero, status]) => {
        if (status === "Ativo") {
          numerosUnicos.add(numero);
        }
      });
    }

    console.log(`📨 Total de contatos únicos para disparo: ${numerosUnicos.size}`);

    for (const numero of numerosUnicos) {
      console.log(`📨 Enviando template de boas-vindas para: ${numero}`);
      await enviarTemplateBoasVindas(numero);
    }

    console.log("✅ Disparo de boas-vindas concluído.");

  } catch (error) {
    console.error("❌ Erro ao disparar boas-vindas para contatos ativos:", error);
  }
}

/*async function dispararBoasVindasParaAtivos() {
  try {
    const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });
    const client = await auth.getClient();
    const sheets = google.sheets({ version: "v4", auth: client });

    const planilhas = [
      "1BXitZrMOxFasCJAqkxVVdkYPOLLUDEMQ2bIx5mrP8Y8",
      "1M5vsAANmeYk1pAgYjFfa3ycbnyWMGYb90pKZuR9zNo4"
    ];

    for (const spreadsheetId of planilhas) {
      const rangeFila = "fila_envio!F2:G";
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: rangeFila,
      });

      const contatos = response.data.values || [];

      const numerosAtivos = contatos
        .map(([numero, status]) => ({ numero, status }))
        .filter(c => c.status === "Ativo");

      console.log(`📨 Encontrados ${numerosAtivos.length} contatos ativos na planilha ${spreadsheetId}`);

      for (const contato of numerosAtivos) {
        await enviarTemplateBoasVindas(contato.numero);
      }
    }

    console.log("✅ Disparo de boas-vindas concluído.");
  } catch (error) {
    console.error("❌ Erro ao disparar boas-vindas para contatos ativos:", error);
  }
}*/

// Atualizando o endpoint /disparo para incluir o tipo boasvindas

app.get("/dispararConfirmacaoParticipacao", async (req, res) => {
  const chave = req.query.chave;
  const chaveCorreta = process.env.CHAVE_DISPARO;

  if (chave !== chaveCorreta) {
    return res.status(401).send("❌ Acesso não autorizado.");
  }

  try {
    const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });
    const client = await auth.getClient();
    const sheets = google.sheets({ version: "v4", auth: client });

    const spreadsheetId = "1I988yRvGYfjhoqmFvdQbjO9qWzTB4T6yv0dDBxQ-oEg";
    const aba = "Inscricoes_Prioritarias";
    const range = `${aba}!A2:W76`;  // Linhas 2 a 73, até a coluna W

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range,
    });

    const rows = response.data.values || [];

    console.log(`🔎 Total de registros carregados da aba ${aba}: ${rows.length}`);

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const numeroWhatsApp = row[6];  // Coluna G = índice 6
      const statusEnvio = row[22];    // Coluna W = índice 22

      if (!numeroWhatsApp || statusEnvio === "Enviado") {
        console.log(`⏭️ Pulando linha ${i + 2}: número vazio ou já enviado.`);
        continue;
      }

      console.log(`📨 Enviando template de confirmação para: ${numeroWhatsApp}`);

      try {
        await axios.post(
          `https://graph.facebook.com/v19.0/${phone_number_id}/messages`,
          {
            messaging_product: "whatsapp",
            to: numeroWhatsApp,
            type: "template",
            template: {
              name: "eac_confirmar_participacao_v1",
              language: { code: "pt_BR" },
            },
          },
          {
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
          }
        );

        // Atualizar status na coluna W (linha correta)
        const updateRange = `${aba}!W${i + 2}`;
        await sheets.spreadsheets.values.update({
          spreadsheetId,
          range: updateRange,
          valueInputOption: "RAW",
          resource: { values: [["Enviado"]] },
        });

        console.log(`✅ Mensagem enviada e status marcado na linha ${i + 2}`);

      } catch (erroEnvio) {
        console.error(`❌ Erro ao enviar para ${numeroWhatsApp}:`, JSON.stringify(erroEnvio.response?.data || erroEnvio, null, 2));
      }
    }

    res.status(200).send("✅ Disparo de confirmação de participação concluído.");
  } catch (error) {
    console.error("❌ Erro geral ao processar o disparo:", error);
    res.status(500).send("❌ Erro interno no envio.");
  }
});



// Inicialização do servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
});

