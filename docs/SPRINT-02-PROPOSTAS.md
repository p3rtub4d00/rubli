# Sprint 02 — Propostas

## Objetivo
Permitir que um prestador encontre uma demanda disponível, informe seu preço e envie uma proposta. O cliente pode comparar as propostas e aceitar uma delas.

## Regras implementadas
- Uma proposta pertence a uma única demanda e a um único prestador.
- O valor da proposta deve ser maior que zero.
- O prestador não pode manter duas propostas pendentes para a mesma demanda.
- A demanda passa de `open` para `negotiating` quando recebe a primeira proposta.
- Somente o solicitante da demanda pode aceitar uma proposta.
- Ao aceitar uma proposta, as demais propostas pendentes daquela demanda são recusadas.
- A demanda passa para `accepted` após o aceite.
- Nesta fase, a persistência continua local no app e em memória na API.

## Endpoints

### GET `/api/v1/proposals`
Lista todas as propostas.

### GET `/api/v1/proposals?demandId=...`
Lista somente as propostas de uma demanda.

### POST `/api/v1/proposals`
Cria uma proposta.

Exemplo:
```json
{
  "demandId": "dem_123",
  "providerId": "usr_456",
  "amount": 150,
  "message": "Consigo realizar hoje à tarde."
}
```

### POST `/api/v1/proposals/:id/accept`
Aceita uma proposta e encerra as demais pendentes da demanda.

Exemplo:
```json
{
  "requesterId": "usr_123"
}
```

## Próxima evolução
1. Chat entre solicitante e prestador.
2. Negociação com contrapropostas.
3. Notificações locais.
4. Geolocalização e raio de atendimento.
5. Persistência remota quando a conta MongoDB da marca estiver pronta.
