# Rubli — arquitetura inicial

## Estratégia
O Rubli será construído como uma plataforma mobile-first, com API central e painel administrativo web.

### Camadas
- **Mobile:** Expo + React Native + TypeScript, preparado para Android e iOS.
- **API:** Node.js + Fastify + TypeScript.
- **Persistência atual:** armazenamento local no dispositivo e memória em desenvolvimento.
- **Persistência futura:** MongoDB, conectado somente quando a conta oficial da marca estiver preparada.
- **Compartilhado:** `@rubli/shared` concentra tipos e regras de domínio usados por app e API.

## Local-first
A experiência deve continuar útil quando a internet estiver indisponível. Demandas criadas no aplicativo são gravadas localmente. No futuro, uma fila de sincronização enviará as operações pendentes para a API quando a conexão voltar.

### Regra de sincronização futura
1. Criar operação local com `id` e timestamp.
2. Marcar como `pending_sync`.
3. Detectar conectividade.
4. Enviar para a API com `operationId` idempotente.
5. Confirmar no servidor.
6. Marcar como sincronizada.
7. Resolver conflitos por regra de domínio, nunca por sobrescrita silenciosa.

## Domínio inicial
O mesmo motor de demandas atende quatro tipos:

- Serviço: pequenos reparos, limpeza, montagem, pintura e construção.
- Compra: alguém compra um produto solicitado pelo cliente.
- Entrega: retirada e entrega de pequenos volumes.
- Frete: transporte de móveis, mudanças e cargas.

Uma demanda pode ter preço fixo, preço negociável ou valor em aberto.

## Segurança planejada
Autenticação real, verificação de telefone, identidade de prestadores, trilha de auditoria, avaliações e pagamentos intermediados serão implementados antes de produção. A versão local não deve ser tratada como ambiente de produção.
