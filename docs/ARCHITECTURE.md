# Rubli — arquitetura atual

## Estratégia
O Rubli é uma plataforma mobile-first com API central, painel administrativo web e domínio compartilhado.

### Camadas
- **Mobile:** Expo + React Native + TypeScript.
- **API:** Node.js + Fastify + TypeScript.
- **Banco:** MongoDB quando `MONGODB_URI` está configurado; modo em memória apenas para desenvolvimento.
- **Compartilhado:** `@rubli/shared` concentra tipos, geolocalização, categorias e regras compartilhadas.
- **Realtime:** WebSocket autenticado.
- **Push:** notificações segmentadas pelo backend.
- **Autenticação:** access token de curta duração + refresh token rotativo.

## Organização do mobile
A aplicação continua sendo um único app, mas as experiências são separadas internamente:
- `features/customer`
- `features/provider`
- `features/demand`
- `features/negotiation`
- `features/profile`
- `features/service`
- `features/shared`

Componentes e serviços comuns permanecem em `core` e `shared`.

## Modalidades profissionais
Novas contas profissionais usam:
- `services` — prestadores de serviços;
- `courier` — entregas/motoboy;
- `freight` — fretes e mudanças.

Registros legados são tratados por compatibilidade de leitura.

## Matching
A elegibilidade de oportunidade é decidida no backend e considera:
1. conta profissional;
2. demanda aberta;
3. categoria/área compatível;
4. disponibilidade;
5. acesso/assinatura quando aplicável;
6. localização;
7. raio de atendimento;
8. suspensão administrativa.

Feed, realtime e push devem reutilizar a mesma regra de matching.

## Privacidade do endereço
Antes da contratação, prestadores recebem somente localização aproximada.
Rua, número, complemento, referência e coordenadas exatas não devem ser expostos para prestadores não contratados.

Após confirmação bilateral, o prestador aceito pode acessar o endereço operacional completo.

## Negociação e execução
Fluxo principal:
1. demanda;
2. proposta;
3. contraproposta;
4. confirmação bilateral;
5. agendamento opcional;
6. prestador a caminho;
7. prestador chegou;
8. serviço iniciado;
9. solicitação de conclusão;
10. confirmação do cliente;
11. avaliação.

Há fluxos adicionais para cancelamento e disputa após contratação.

## Solicitação direta
Uma demanda pode possuir `targetProviderId`.
Nesse caso somente o prestador selecionado deve receber a oportunidade.

## Regras de engenharia
- backend é a fonte de verdade para autorização;
- identidade do usuário vem do token, não de `userId` enviado pelo mobile;
- alterações de estado devem validar transição e participante;
- dados sensíveis não devem aparecer em logs;
- regras centrais não devem ser duplicadas no mobile;
- mudanças devem manter compatibilidade com registros legados quando possível.
