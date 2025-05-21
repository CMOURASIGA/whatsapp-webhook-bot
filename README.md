
# 🤖 Bot de WhatsApp - EAC Porciúncula de Sant'Ana

Este projeto é um bot inteligente para WhatsApp baseado na API do WhatsApp Cloud e publicado via Render. Ele foi desenvolvido para automatizar o atendimento e a comunicação do grupo EAC (Encontro de Adolescentes com Cristo), facilitando o envio de informações, lembretes de eventos e interações motivacionais com os participantes.

---

## 🚀 Funcionalidades Implementadas

### 🔹 1. Resposta automática com menu principal
- Exibe um menu sempre que o usuário envia mensagens como `oi`, `olá`, `bom dia`, `menu`, etc.
- Menu com ícones e emojis para facilitar leitura e atrair atenção.

### 🔹 2. Opções do menu numeradas (1 a 10)
Cada número representa uma funcionalidade específica:
| Opção | Descrição | Link / Ação |
|-------|-----------|-------------|
| 1️⃣ | Formulário de inscrição para Encontristas | [Google Forms](https://docs.google.com/forms/d/e/1FAIpQLScrESiqWcBsnqMXGwiOOojIeU6ryhuWwZkL1kMr0QIeosgg5w/viewform?usp=preview) |
| 2️⃣ | Formulário para Encontreiros | [Google Forms](https://forms.gle/VzqYTs9yvnACiCew6) |
| 📸 | Instagram oficial do EAC | [Instagram](https://instagram.com/eacporciuncula) |
| 📬 | E-mail de contato | `eacporciunculadesantana@gmail.com` |
| 📱 | WhatsApp da paróquia | [wa.me/552123422186](https://wa.me/552123422186) |
| 📅 | Agenda de eventos mensal | Busca imagem gerada no Google Slides com os eventos do mês |
| 🎵 | Playlist no Spotify | [Spotify](https://open.spotify.com/playlist/0JquaFjl5u9GrvSgML4S0R) |
| 💬 | Grupo de dúvidas do WhatsApp | [Grupo](https://chat.whatsapp.com/Ls0dE394bED4fp7AEQLKyu) |
| 💡 | Mensagem motivacional do dia | Gerada via OpenAI GPT |
| 📖 | Versículo litúrgico do dia | Gerado via OpenAI GPT |

---

## 🧠 Integrações

- **📦 Render**: Hospedagem gratuita e deploy automático do bot.
- **📨 WhatsApp Cloud API**: Envio e recepção de mensagens.
- **📊 Google Sheets API**: Leitura de base de eventos e contatos.
- **📈 Google Slides API**: Geração de imagens da agenda do mês.
- **🧠 OpenAI GPT**: Geração de mensagens e versículos motivacionais.
- **🔐 Variáveis de ambiente**: Token do WhatsApp, API Key da OpenAI, chaves da planilha, chave de disparo segura etc.

---

## ⏱️ CRON Jobs automatizados

- `08:50` → Reativa todos os contatos com status "pendente".
- `09:00` → Verifica eventos do dia seguinte e envia lembretes personalizados para os contatos ativos.

---

## 🛠 Como usar / disparar manualmente

Você pode acessar a rota de disparo via browser:

```
GET /disparo?chave=SUA_CHAVE
```

A chave segura (`CHAVE_DISPARO`) é definida por variável de ambiente.

---

## 📁 Estrutura de arquivos e pastas

```
├── index.js             # Lógica principal do bot
├── .env                 # Variáveis de ambiente sensíveis
├── package.json         # Dependências do Node
└── README.md            # Documentação do projeto
```

---

## 📌 Requisitos

- Conta no [Meta for Developers](https://developers.facebook.com/)
- Conta no [Google Cloud Console](https://console.cloud.google.com/)
- Conta no [OpenAI](https://platform.openai.com/)
- Projeto criado no [Render.com](https://render.com/) com `node` e `PORT`

---

## ✨ Melhorias futuras

- Painel administrativo para gerenciamento de conteúdo
- Armazenamento de histórico de mensagens
- Dashboard de interações no Looker Studio
- Interface web para configuração dos textos do menu

---

## 🙌 Contribuição

Este projeto foi desenvolvido e mantido por voluntários da comunidade EAC Porciúncula. Sugestões, melhorias ou colaborações são sempre bem-vindas.

---

## 🧑‍💻 Desenvolvido por

Christian Moura dos Santos – @christianmoura  
Projeto voluntário para o EAC Porciúncula de Sant’Ana
