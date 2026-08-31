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
- [ ] Notificações push
- [ ] Fluxo de compras e adiantamento do valor do item
- [ ] Fluxo de entrega
- [ ] Fluxo de frete

## Fase 4 — Confiança e pagamentos
- [ ] Verificação de telefone
- [ ] Verificação de identidade de prestadores
- [x] Estrutura local de avaliações e reputação
- [x] Perfil público com informações do usuário
- [x] Fotos de perfil e portfólio local
- [ ] Pix e intermediador de pagamentos
- [ ] Regras de cancelamento e disputas
- [ ] Carteira e repasses

## Fase 5 — Administração e monetização
- [ ] Painel administrativo
- [ ] Comissão por demanda concluída
- [ ] Planos para profissionais
- [ ] Destaques e publicidade local
- [ ] Cupons e programa de indicação
- [ ] Métricas e auditoria

## Fase 6 — Produção
- [ ] Conta oficial da marca
- [ ] MongoDB oficial
- [ ] Ambiente de staging
- [ ] Ambiente de produção
- [ ] Crash reporting e observabilidade
- [ ] Políticas, termos e privacidade
- [ ] Publicação Google Play
- [ ] Publicação App Store
