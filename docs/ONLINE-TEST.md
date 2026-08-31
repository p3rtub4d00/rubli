# Rubli — teste online inicial

## Arquitetura desta etapa

- `apps/mobile`: aplicativo Expo/React Native.
- `apps/api`: API Fastify.
- Render: hospeda a API pública.
- Persistência: memória do processo enquanto o MongoDB não estiver configurado.

## Render

O arquivo `render.yaml` define um Web Service chamado `rubli-api`.

Depois do primeiro deploy, a URL esperada terá o formato:

`https://rubli-api-<identificador>.onrender.com`

## Health check

`GET /health`

Deve responder com `ok: true` e informar `persistence: "memory"` enquanto `MONGODB_URI` não estiver configurado.

## Importante

Nesta etapa a API pública já pode ser usada para testes de servidor, mas os dados ainda não são permanentes: um restart/redeploy do processo limpa o armazenamento em memória.

A próxima etapa é conectar o aplicativo mobile à URL da API e migrar o armazenamento compartilhado para a API. MongoDB será conectado depois, sem alterar o contrato das rotas.
