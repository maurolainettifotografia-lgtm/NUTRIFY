# Nutrify API

Backend independente do aplicativo Nutrify, com FastAPI e MongoDB Atlas.

Este repositório contém somente os arquivos da API necessários à hospedagem. O aplicativo Android é gerado a partir do projeto completo mantido separadamente.

Configuração do servidor: MONGO_URL, DB_NAME=nutrify, APP_TIMEZONE=America/Sao_Paulo e PORT=8000. As credenciais são configuradas no gerenciador de variáveis da hospedagem; nunca no repositório.

Saúde do processo: /health. Verificação da conexão com banco: /ready.

IA opcional: OPENAI_API_KEY e OPENAI_MODEL no servidor. Cadastro e login por e-mail/senha funcionam sem IA.
