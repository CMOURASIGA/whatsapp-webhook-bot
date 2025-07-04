/**
 * ================================================================
 * SISTEMA EAC PORCIÚNCULA - WHATSAPP BOT
 * ================================================================
 * 
 * Bot automatizado para gerenciamento de comunicação via WhatsApp
 * Funcionalidades:
 * - Menu interativo com opções de inscrição
 * - Disparo de eventos e comunicados
 * - Integração com Google Sheets
 * - Sistema de templates WhatsApp Business
 * - Agendamento de mensagens via CRON
 * 
 * Autor: Sistema EAC
 * Versão: 2.0
 * Data: 2025
 * ================================================================
 */

// ================================================================
// IMPORTAÇÕES E CONFIGURAÇÕES INICIAIS
// ================================================================

const express = require("express");
const axios = require("axios");
const { google } = require("googleapis");
const cron = require("node-cron");

const app = express();
app.use(express.json());

// ================================================================
// CONSTANTES E CONFIGURAÇÕES
// ================================================================

const CONFIG = {
  VERIFY_TOKEN: "meu_token_webhook",
  TOKEN_WHATSAPP: process.env.TOKEN_WHATSAPP,
  PHONE_NUMBER_ID: "572870979253681",
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  GOOGLE_CREDENTIALS: process.env.GOOGLE_CREDENTIALS,
  CHAVE_DISPARO: process.env.CHAVE_DISPARO,
  URL_APP_SCRIPT_EVENTOS: process.env.URL_APP_SCRIPT_EVENTOS,
  
  // IDs das Planilhas
  PLANILHAS: {
    ENCONTRISTAS: "1BXitZrMOxFasCJAqkxVVdkYPOLLUDEMQ2bIx5mrP8Y8",
    ENCONTREIROS: "1M5vsAANmeYk1pAgYjFfa3ycbnyWMGYb90pKZuR9zNo4",
    CADASTRO_OFICIAL: "1I988yRvGYfjhoqmFvdQbjO9qWzTB4T6yv0dDBxQ-oEg"
  },
  
  // Templates WhatsApp
  TEMPLATES: {
    BOAS_VINDAS: "eac_boasvindas_v1",
    LEMBRETE_EVENTO: "eac_lembrete_v1",
    CONFIRMACAO_PARTICIPACAO: "eac_confirmar_participacao_v1",
    AGRADECIMENTO_INSCRICAO: "eac_agradecimento_inscricao_v1",
    COMUNICADO_GERAL: "eac_comunicado_geral_v2"
  },
  
  // Configurações de tempo
  CRON_REATIVACAO: "50 08 * * *",  // 08:50 diariamente
  CRON_EVENTOS: "00 09 * * *",     // 09:00 diariamente
  
  PORT: process.env.PORT || 3000
};

// ================================================================
// UTILITÁRIOS E HELPERS
// ================================================================

/**
 * Verifica se o texto recebido é uma saudação
 * @param {string} texto - Texto a ser verificado
 * @returns {boolean} - True se for saudação
 */
function ehSaudacao(texto) {
  const saudacoes = ["oi", "olá", "ola", "bom dia", "boa tarde", "boa noite", "menu"];
  return saudacoes.some(s => texto.toLowerCase().includes(s));
}

/**
 * Formata data para o padrão brasileiro
 * @param {Date} data - Data a ser formatada
 * @returns {string} - Data formatada DD/MM/YYYY
 */
function formatarData(data) {
  return `${data.getDate().toString().padStart(2, '0')}/${(data.getMonth() + 1).toString().padStart(2, '0')}/${data.getFullYear()}`;
}

/**
 * Log padronizado para o sistema
 * @param {string} tipo - Tipo do log (SUCCESS, ERROR, INFO)
 * @param {string} mensagem - Mensagem do log
 * @param {any} dados - Dados adicionais (opcional)
 */
function log(tipo, mensagem, dados = null) {
  const timestamp = new Date().toISOString();
  const emoji = {
    SUCCESS: '✅',
    ERROR: '❌',
    INFO: '📝',
    WARNING: '⚠️'
  };
  
  console.log(`${emoji[tipo]} [${timestamp}] ${mensagem}`);
  if (dados) {
    console.log(JSON.stringify(dados, null, 2));
  }
}

// ================================================================
// SISTEMA DE MENUS INTERATIVOS
// ================================================================

/**
 * Monta o menu principal interativo com botões e listas
 * @returns {Object} - Objeto do menu interativo para WhatsApp
 */
function montarMenuPrincipalInterativo() {
  return {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    type: "interactive",
    interactive: {
      type: "list",
      header: {
        type: "text",
        text: "📋 Menu Principal - EAC Porciúncula"
      },
      body: {
        text: "Como posso te ajudar hoje? Escolha uma das opções:\n\nToque no botão abaixo para ver as opções."
      },
      footer: {
        text: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
      },
      action: {
        button: "Ver opções",
        sections: [
          {
            title: "📝 Inscrições",
            rows: [
              {
                id: "1",
                title: "Formulário Encontristas",
                description: "Inscrição para adolescentes"
              },
              {
                id: "2", 
                title: "Formulário Encontreiros",
                description: "Inscrição para equipe"
              }
            ]
          },
          {
            title: "📱 Contatos e Redes",
            rows: [
              {
                id: "3",
                title: "Instagram do EAC",
                description: "Nosso perfil oficial"
              },
              {
                id: "4",
                title: "E-mail de contato",
                description: "Fale conosco por e-mail"
              },
              {
                id: "5",
                title: "WhatsApp da Paróquia",
                description: "Contato direto"
              }
            ]
          },
          {
            title: "📅 Eventos e Conteúdo",
            rows: [
              {
                id: "6",
                title: "Eventos do EAC",
                description: "Agenda de eventos"
              },
              {
                id: "7",
                title: "Playlist no Spotify",
                description: "Nossas músicas"
              },
              {
                id: "9",
                title: "Mensagem do Dia",
                description: "Inspiração diária"
              },
              {
                id: "10",
                title: "Versículo do Dia",
                description: "Palavra de Deus"
              }
            ]
          }
        ]
      }
    }
  };
}

/**
 * Monta o menu principal em formato texto (fallback)
 * @returns {string} - Menu em formato texto
 */
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
    "9 - 💡 Mensagem do Dia\n" +
    "10 - 📖 Versículo do Dia\n\n" +
    "Digite o número correspondente à opção desejada. 👇"
  );
}

// ================================================================
// SISTEMA DE ENVIO DE MENSAGENS
// ================================================================

/**
 * Envia mensagem de texto simples via WhatsApp Business API
 * @param {string} numero - Número do destinatário
 * @param {string} mensagem - Mensagem a ser enviada
 */
async function enviarMensagem(numero, mensagem) {
  try {
    const response = await axios.post(
      `https://graph.facebook.com/v19.0/${CONFIG.PHONE_NUMBER_ID}/messages`,
      {
        messaging_product: "whatsapp",
        to: numero,
        text: { body: mensagem },
      },
      {
        headers: {
          Authorization: `Bearer ${CONFIG.TOKEN_WHATSAPP}`,
          "Content-Type": "application/json",
        },
      }
    );
    
    log('SUCCESS', `Mensagem enviada para: ${numero}`);
    return response.data;
  } catch (error) {
    log('ERROR', `Erro ao enviar mensagem para ${numero}`, error.response?.data || error.message);
    throw error;
  }
}

/**
 * Envia mensagem interativa (menu, botões, listas) via WhatsApp Business API
 * @param {string} numero - Número do destinatário
 * @param {Object} mensagemInterativa - Objeto da mensagem interativa
 */
async function enviarMensagemInterativa(numero, mensagemInterativa) {
  try {
    const payload = {
      ...mensagemInterativa,
      to: numero
    };
    
    const response = await axios.post(
      `https://graph.facebook.com/v19.0/${CONFIG.PHONE_NUMBER_ID}/messages`,
      payload,
      {
        headers: {
          Authorization: `Bearer ${CONFIG.TOKEN_WHATSAPP}`,
          "Content-Type": "application/json",
        },
      }
    );
    
    log('SUCCESS', `Mensagem interativa enviada para: ${numero}`);
    return response.data;
  } catch (error) {
    log('ERROR', `Erro ao enviar mensagem interativa para ${numero}`, error.response?.data);
    
    // Fallback para mensagem de texto
    log('INFO', `Tentando fallback para mensagem de texto...`);
    await enviarMensagem(numero, "👋 Seja bem-vindo(a) ao EAC Porciúncula!\n\n" + montarMenuPrincipal());
  }
}

/**
 * Envia imagem via WhatsApp Business API
 * @param {string} numero - Número do destinatário
 * @param {string} linkImagem - URL da imagem
 */
async function enviarImagem(numero, linkImagem) {
  try {
    const response = await axios.post(
      `https://graph.facebook.com/v19.0/${CONFIG.PHONE_NUMBER_ID}/messages`,
      {
        messaging_product: "whatsapp",
        to: numero,
        type: "image",
        image: { link: linkImagem },
      },
      {
        headers: {
          Authorization: `Bearer ${CONFIG.TOKEN_WHATSAPP}`,
          "Content-Type": "application/json",
        },
      }
    );
    
    log('SUCCESS', `Imagem enviada para: ${numero}`);
    return response.data;
  } catch (error) {
    log('ERROR', `Erro ao enviar imagem para ${numero}`, error.response?.data || error.message);
    throw error;
  }
}

// ================================================================
// SISTEMA DE TEMPLATES WHATSAPP
// ================================================================

/**
 * Envia template de boas-vindas
 * @param {string} numero - Número do destinatário
 */
async function enviarTemplateBoasVindas(numero) {
  try {
    const response = await axios.post(
      `https://graph.facebook.com/v19.0/${CONFIG.PHONE_NUMBER_ID}/messages`,
      {
        messaging_product: "whatsapp",
        to: numero,
        type: "template",
        template: {
          name: CONFIG.TEMPLATES.BOAS_VINDAS,
          language: { code: "pt_BR" }
        }
      },
      {
        headers: {
          Authorization: `Bearer ${CONFIG.TOKEN_WHATSAPP}`,
          "Content-Type": "application/json"
        }
      }
    );

    log('SUCCESS', `Template boas-vindas enviado para: ${numero}`);
    return response.data;
  } catch (error) {
    log('ERROR', `Erro ao enviar boas-vindas para ${numero}`, error.response?.data || error.message);
    throw error;
  }
}

/**
 * Envia template de lembrete de evento
 * @param {string} numero - Número do destinatário
 * @param {string} eventoNome - Nome do evento
 * @param {string} dataEvento - Data do evento
 */
async function enviarTemplateLembreteEvento(numero, eventoNome, dataEvento) {
  try {
    // Validação dos parâmetros
    if (!numero || !eventoNome || !dataEvento) {
      log('ERROR', `Parâmetros inválidos para lembrete de evento`, { numero, eventoNome, dataEvento });
      return;
    }

    const response = await axios.post(
      `https://graph.facebook.com/v19.0/${CONFIG.PHONE_NUMBER_ID}/messages`,
      {
        messaging_product: "whatsapp",
        to: numero,
        type: "template",
        template: {
          name: CONFIG.TEMPLATES.LEMBRETE_EVENTO,
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
          Authorization: `Bearer ${CONFIG.TOKEN_WHATSAPP}`,
          "Content-Type": "application/json"
        }
      }
    );

    log('SUCCESS', `Template lembrete evento enviado para: ${numero}`);
    return response.data;
  } catch (error) {
    log('ERROR', `Erro ao enviar template lembrete para ${numero}`, error.response?.data || error.message);
    throw error;
  }
}

/**
 * Envia template de agradecimento de inscrição
 * @param {string} numero - Número do destinatário
 */
async function enviarTemplateAgradecimentoInscricao(numero) {
  try {
    const response = await axios.post(
      `https://graph.facebook.com/v19.0/${CONFIG.PHONE_NUMBER_ID}/messages`,
      {
        messaging_product: "whatsapp",
        to: numero,
        type: "template",
        template: {
          name: CONFIG.TEMPLATES.AGRADECIMENTO_INSCRICAO,
          language: { code: "pt_BR" }
        }
      },
      {
        headers: {
          Authorization: `Bearer ${CONFIG.TOKEN_WHATSAPP}`,
          "Content-Type": "application/json"
        }
      }
    );

    log('SUCCESS', `Template agradecimento enviado para: ${numero}`);
    return response.data;
  } catch (error) {
    log('ERROR', `Erro ao enviar agradecimento para ${numero}`, error.response?.data || error.message);
    throw error;
  }
}

// ================================================================
// SISTEMA DE INTEGRAÇÃO COM GOOGLE SHEETS
// ================================================================

/**
 * Inicializa cliente Google Sheets
 * @returns {Object} - Cliente Google Sheets autenticado
 */
async function inicializarGoogleSheets() {
  try {
    const credentials = JSON.parse(CONFIG.GOOGLE_CREDENTIALS);
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });
    
    const client = await auth.getClient();
    return google.sheets({ version: "v4", auth: client });
  } catch (error) {
    log('ERROR', 'Erro ao inicializar Google Sheets', error.message);
    throw error;
  }
}

/**
 * Atualiza contatos com status pendente para ativo
 * Executa diariamente às 08:50 via CRON
 */
async function reativarContatosPendentes() {
  try {
    const sheets = await inicializarGoogleSheets();
    
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

    // Atualizar nas duas planilhas
    await atualizarPendentes(CONFIG.PLANILHAS.ENCONTRISTAS);
    await atualizarPendentes(CONFIG.PLANILHAS.ENCONTREIROS);

    log('SUCCESS', 'Contatos com status "Pendente" atualizados para "Ativo"');
  } catch (error) {
    log('ERROR', 'Erro ao atualizar contatos pendentes', error.message);
  }
}

/**
 * Busca eventos da planilha para envio de lembretes
 * @returns {Array} - Lista de eventos encontrados
 */
async function buscarEventosParaLembrete() {
  try {
    const sheets = await inicializarGoogleSheets();
    const spreadsheetId = CONFIG.PLANILHAS.ENCONTRISTAS;
    const range = "comunicados!A2:G";
    
    const response = await sheets.spreadsheets.values.get({ spreadsheetId, range });
    const rows = response.data.values || [];
    
    if (!rows.length) {
      log('INFO', 'Nenhum evento encontrado na planilha');
      return [];
    }

    const hoje = new Date();
    const sessenta_dias = new Date(hoje);
    sessenta_dias.setDate(hoje.getDate() + 60);

    const eventos = [];

    for (const row of rows) {
      const valorData = row[6]; // Coluna G
      if (!valorData) continue;

      let dataEvento;
      if (/^\d{2}\/\d{2}\/\d{4}$/.test(valorData)) { 
        const [dia, mes, ano] = valorData.split("/");
        dataEvento = new Date(`${ano}-${mes}-${dia}`);
      } else {
        dataEvento = new Date(valorData);
      }

      if (!isNaN(dataEvento.getTime()) && dataEvento >= hoje && dataEvento <= sessenta_dias) {
        const titulo = row[1] || "(Sem título)";
        const dataFormatada = `${dataEvento.getDate().toString().padStart(2, '0')}/${(dataEvento.getMonth() + 1).toString().padStart(2, '0')}`;
        
        eventos.push({
          nome: titulo,
          data: dataFormatada,
          dataCompleta: dataEvento
        });
      }
    }

    log('INFO', `Encontrados ${eventos.length} eventos nos próximos 60 dias`);
    return eventos;
  } catch (error) {
    log('ERROR', 'Erro ao buscar eventos', error.message);
    return [];
  }
}

// ================================================================
// SISTEMA DE IA E CONTEÚDO DINÂMICO
// ================================================================

/**
 * Gera conteúdo dinâmico usando OpenAI
 * @param {string} prompt - Prompt para geração de conteúdo
 * @returns {string} - Conteúdo gerado
 */
async function gerarConteudoIA(prompt) {
  try {
    const response = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: "gpt-3.5-turbo",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.8,
        max_tokens: 150,
      },
      {
        headers: {
          Authorization: `Bearer ${CONFIG.OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    return response.data.choices[0].message.content.trim();
  } catch (error) {
    log('ERROR', 'Erro ao gerar conteúdo IA', error.response?.data || error.message);
    throw error;
  }
}

// ================================================================
// SISTEMA DE PROCESSAMENTO DE MENSAGENS
// ================================================================

/**
 * Processa mensagens recebidas via webhook
 * @param {Object} mensagem - Objeto da mensagem recebida
 * @returns {string} - ID da opção selecionada
 */
function processarMensagemRecebida(mensagem) {
  if (!mensagem || !mensagem.from) return null;

  let textoRecebido = "";

  // Verificar tipo de mensagem
  if (mensagem.text) {
    textoRecebido = mensagem.text.body.toLowerCase().trim();
  } else if (mensagem.interactive) {
    // Mensagem interativa (resposta de lista ou botão)
    if (mensagem.interactive.type === "list_reply") {
      textoRecebido = mensagem.interactive.list_reply.id;
    } else if (mensagem.interactive.type === "button_reply") {
      textoRecebido = mensagem.interactive.button_reply.id;
    }
  }

  return textoRecebido;
}

/**
 * Mapeamento de respostas para cada opção do menu
 */
const RESPOSTAS_MENU = {
  "1": "📝 *Inscrição de Encontristas*\n\nSe você quer participar como *adolescente encontrista* no nosso próximo EAC, preencha este formulário com atenção:\n👉 https://docs.google.com/forms/d/e/1FAIpQLScrESiqWcBsnqMXGwiOOojIeU6ryhuWwZkL1kMr0QIeosgg5w/viewform?usp=preview",
  "2": "📝 *Inscrição de Encontreiros*\n\nVocê deseja servir nessa missão linda como *encontreiro*? Preencha aqui para fazer parte da equipe:\n👉 https://forms.gle/VzqYTs9yvnACiCew6",
  "3": "📸 *Nosso Instagram Oficial*\n\nFique por dentro de tudo que acontece no EAC Porciúncula. Curta, compartilhe e acompanhe nossos eventos:\n👉 https://www.instagram.com/eacporciuncula/",
  "4": "📬 *Fale conosco por e-mail*\n\nDúvidas, sugestões ou parcerias? Escreva para a gente:\n✉️ eacporciunculadesantana@gmail.com",
  "5": "📱 *WhatsApp da Paróquia*\n\nQuer falar direto com a secretaria da paróquia? Acesse:\n👉 https://wa.me/5521981140278",
  "7": "🎵 *Nossa Playlist no Spotify*\n\nMúsicas que marcaram nossos encontros e nos inspiram todos os dias:\n👉 https://open.spotify.com/playlist/0JquaFjl5u9GrvSgML4S0R"
};

// ================================================================
// SISTEMA DE DISPAROS EM MASSA
// ================================================================

/**
 * Dispara boas-vindas para todos os contatos ativos
 */
async function dispararBoasVindasParaAtivos() {
  try {
    const sheets = await inicializarGoogleSheets();
    const planilhas = [CONFIG.PLANILHAS.ENCONTRISTAS, CONFIG.PLANILHAS.ENCONTREIROS];
    const numerosUnicos = new Set();

    // Coleta números únicos das duas planilhas
    for (const spreadsheetId of planilhas) {
      const range = "fila_envio!F2:G";
      const response = await sheets.spreadsheets.values.get({ spreadsheetId, range });
      const contatos = response.data.values || [];

      contatos.forEach(([numero, status]) => {
        if (status === "Ativo") {
          numerosUnicos.add(numero);
        }
      });
    }

    log('INFO', `Total de contatos únicos para disparo: ${numerosUnicos.size}`);

    // Envia boas-vindas para cada número único
    for (const numero of numerosUnicos) {
      try {
        await enviarTemplateBoasVindas(numero);
        log('SUCCESS', `Boas-vindas enviada para: ${numero}`);
      } catch (error) {
        log('ERROR', `Erro ao enviar boas-vindas para ${numero}`, error.message);
      }
    }

    log('SUCCESS', 'Disparo de boas-vindas concluído');
  } catch (error) {
    log('ERROR', 'Erro ao disparar boas-vindas', error.message);
  }
}

// ================================================================
// SISTEMA DE AGENDAMENTO (CRON JOBS)
// ================================================================

/**
 * Configura todos os agendamentos do sistema
 */
function configurarAgendamentos() {
  // Reativação de contatos pendentes - 08:50 diariamente
  cron.schedule(CONFIG.CRON_REATIVACAO, () => {
    log('INFO', 'Executando reativação de contatos pendentes...');
    reativarContatosPendentes();
  });

  // Verificação de eventos - 09:00 diariamente
  cron.schedule(CONFIG.CRON_EVENTOS, () => {
    log('INFO', 'Executando verificação de eventos...');
    // Implementar lógica de verificação de eventos
  });

  log('SUCCESS', 'Agendamentos configurados com sucesso');
}

// ================================================================
// WEBHOOK PRINCIPAL - RECEBIMENTO DE MENSAGENS
// ================================================================

/**
 * Endpoint principal para recebimento de mensagens via webhook
 */
app.post("/webhook", async (req, res) => {
  try {
    const body = req.body;
    
    if (!body.object) {
      return res.sendStatus(404);
    }

    const mensagem = body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    if (!mensagem || !mensagem.from) {
      return res.sendStatus(200);
    }

    const numero = mensagem.from;
    const textoRecebido = processarMensagemRecebida(mensagem);

    if (!textoRecebido) {
      return res.sendStatus(200);
    }

    // Verificar se é saudação para enviar menu interativo
    if (ehSaudacao(textoRecebido)) {
      const menuInterativo = montarMenuPrincipalInterativo();
      await enviarMensagemInterativa(numero, menuInterativo);
      return res.sendStatus(200);
    }

    // Processar opções do menu
    await processarOpcaoMenu(numero, textoRecebido);
    
    res.sendStatus(200);
  } catch (error) {
    log('ERROR', 'Erro no webhook principal', error.message);
    res.sendStatus(500);
  }
});

/**
 * Processa a opção selecionada pelo usuário
 * @param {string} numero - Número do usuário
 * @param {string} opcao - Opção selecionada
 */
async function processarOpcaoMenu(numero, opcao) {
  try {
    // Opções com respostas diretas
    if (RESPOSTAS_MENU[opcao]) {
      await enviarMensagem(numero, RESPOSTAS_MENU[opcao]);
      return;
    }

    // Opções especiais
    switch (opcao) {
      case "6": // Eventos do EAC
        await processarEventosDoMes(numero);

        break;
      case "9": // Mensagem do Dia
        const mensagemMotivacional = await gerarConteudoIA("Envie uma mensagem motivacional curta e inspiradora para adolescentes, em português.");
        await enviarMensagem(numero, `💡 *Mensagem do Dia*\n\n${mensagemMotivacional}`);
        break;
      case "10": // Versículo do Dia
        const versiculo = await gerarConteudoIA("Envie um versículo bíblico inspirador e curto, com referência, para jovens em português.");
        await enviarMensagem(numero, `📖 *Versículo do Dia*\n\n${versiculo}`);
        break;
      default:
        // Se não reconhecer a opção, enviar menu interativo novamente
        const menuInterativo = montarMenuPrincipalInterativo();
        await enviarMensagemInterativa(numero, menuInterativo);
        break;
    }
  } catch (error) {
    log("ERROR", `Erro ao processar opção de menu para ${numero}: ${opcao}`, error.message);
    await enviarMensagem(numero, "❌ Ocorreu um erro ao processar sua solicitação. Por favor, tente novamente.");
  }
}

/**
 * Processa a opção de eventos do mês
 * @param {string} numero - Número do usuário
 */
async function processarEventosDoMes(numero) {
  try {
    const eventos = await buscarEventosParaLembrete();
    if (eventos.length > 0) {
      let mensagemEventos = "📅 *Agenda de Eventos do EAC - Próximos 60 Dias*\n\n";
      eventos.forEach(evento => {
        mensagemEventos += `*${evento.nome}* - ${evento.data}\n`;
      });
      mensagemEventos += "\n👉 Fique ligado(a) para mais informações!";
      await enviarMensagem(numero, mensagemEventos);
    } else {
      await enviarMensagem(numero, "⚠️ Ainda não há eventos cadastrados para os próximos 60 dias.");
    }
  } catch (error) {
    log("ERROR", `Erro ao processar eventos do mês para ${numero}`, error.message);
    await enviarMensagem(numero, "❌ Não conseguimos carregar a agenda agora. Tente novamente mais tarde.");
  }
}

// ================================================================
// INICIALIZAÇÃO DO SERVIDOR
// ================================================================

app.listen(CONFIG.PORT, () => {
  log("INFO", `🚀 Servidor rodando na porta ${CONFIG.PORT}`);
  configurarAgendamentos();
});


