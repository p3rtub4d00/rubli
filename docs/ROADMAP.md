# Rubli — roadmap de desenvolvimento

## Fase 1 — MVP local-first
- [x] Estrutura monorepo
- [x] Tipos compartilhados
- [x] Cadastro local de conta com nome, telefone, e-mail e perfil de uso
- [x] Perfil inicial de cliente/prestador
- [x] Criação de demanda local
- [x] Categorias de serviço, compra, entrega e frete
- [x] API inicial de usuários e demandas
- [x] API sem dependência obrigatória de MongoDB
- [ ] Autenticação segura com senha e recuperação de acesso

## Fase 2 — Marketplace de demandas
- [x] Feed básico de demandas disponíveis
- [x] Propostas com valor
- [x] Aceite/rejeição de propostas
- [x] Base de conversas e mensagens no modo local-first
- [x] API de conversas e mensagens
- [x] Tela de chat integrada ao fluxo de propostas
- [x] Central de mensagens com lista de conversas e prévia
- [x] Contraproposta formal com histórico de versões
- [x] Fluxo de serviço: aceite, início e conclusão
- [x] Avaliação mútua de cliente e prestador
- [x] Histórico local de demandas concluídas
- [ ] Status em tempo real

## Fase 3 — Operação local
- [x] Captura de localização atual no aplicativo
- [x] Armazenamento local de latitude/longitude da demanda
- [x] Modelo compartilhado de urgência e raio de atendimento
- [x] Cálculo de distância por coordenadas
- [x] Endpoint API de demandas próximas com filtro de raio e urgência
- [x] Serviço offline de filtro/ordenação por proximidade
- [x] Integrar feed de proximidade à tela principal do app
- [x] Tela para configurar raio de atendimento do prestador
- [x] Modo "Preciso agora" na interface de publicação
- [x] Central de notificações internas no modo local
- [ ] Push para oportunidades de serviço
- [ ] Deep link de notificação para a demanda
- [ ] Preferências de disponibilidade do prestador
- [ ] Fluxo de compras e adiantamento do valor do item
- [ ] Fluxo de entrega
- [ ] Fluxo de frete

## Fase 4 — Confiança e pagamentos
- [ ] Verificação de telefone
- [ ] Verificação de identidade de prestadores
- [x] Estrutura local de avaliações e reputação
- [x] Perfil público com informações do usuário
- [x] Fotos de perfil e portfólio local
- [ ] Pix e intermediador para cobrança da assinatura do prestador
- [ ] Regras de cancelamento e disputas
- [ ] Carteira e repasses do Rubli (fora do MVP; pagamentos dos serviços são diretos entre cliente e prestador)

## Fase 5 — Administração e monetização
- [x] Modelo comercial: mensalidade do prestador e pagamento do serviço direto ao prestador
- [x] Modelo compartilhado de assinatura do prestador
- [x] Política local de período de teste e vencimento
- [ ] Tela de planos e assinatura do prestador
- [ ] Período de teste para novos prestadores
- [ ] Controle de assinatura: ativa, em teste, vencida e suspensa
- [ ] Bloqueio real de novas propostas para prestador com assinatura vencida
- [ ] Cobrança recorrente real da assinatura
- [ ] Painel administrativo
- [ ] Destaques e publicidade local
- [ ] Cupons e programa de indicação
- [ ] Métricas e auditoria

### Modelo comercial definido
- O Rubli cobra mensalidade do prestador de serviço para acesso aos recursos e oportunidades da plataforma.
- O cliente não paga taxa ao Rubli pela contratação.
- O preço do serviço é negociado entre cliente e prestador dentro da plataforma.
- O pagamento do serviço é realizado diretamente pelo cliente ao prestador, fora da custódia do Rubli.
- O Rubli não retém nem repassa o valor do serviço no MVP.

### Modelo de oportunidades para prestadores
- O prestador habilita-se como "Disponível" para receber oportunidades.
- O sistema filtra oportunidades por categoria, raio e disponibilidade.
- Demandas urgentes podem gerar notificação destacada.
- No produto real, o backend enviará push para o aparelho mesmo com o app em segundo plano/fechado.
- Ao tocar na notificação, o prestador deve abrir diretamente a demanda correspondente para decidir se envia proposta.
- O app deve evitar duplicidade de alertas e não deve enviar oportunidade a prestador sem assinatura ativa.

## Fase 6 — Produção
- [ ] Conta oficial da marca
- [ ] MongoDB oficial
- [ ] Ambiente de staging
- [ ] Ambiente de produção
- [ ] Crash reporting e observabilidade
- [ ] Políticas, termos e privacidade
- [ ] Publicação Google Play
- [ ] Publicação App Store
