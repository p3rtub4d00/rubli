# Matching Inteligente do Rubli — versão 1

O matching é decidido no backend em `apps/api/src/services/matching.ts`. O mobile não determina quem pode receber uma oportunidade: o endpoint de demandas já devolve ao prestador somente as oportunidades que ele pode atender.

## Elegibilidade

Uma demanda aberta ou em negociação é enviada ao prestador somente se ele:

- possui papel `provider`;
- não é o cliente que criou a demanda;
- está disponível (`isAvailable !== false`);
- possui o mesmo `categoryId` estável em `serviceCategoryIds`; para registros anteriores à migração, usa a compatibilidade segura por texto normalizado (caixa, acentos e espaços);
- possui localização operacional e raio configurado, e a demanda está dentro desse raio;
- tem trial vigente ou assinatura ativa quando o estado de assinatura já existe. Contas legadas que ainda não possuem esse estado continuam elegíveis para não interromper a operação durante a migração.

Perfis sem coordenadas operacionais, ou demandas sem coordenadas, não entram no matching automático. Essa escolha é intencionalmente segura: sem distância verificável não há push, WebSocket nem item no feed. O prestador atualiza sua localização pelo botão **Usar minha localização** já existente.

## Ranking

As oportunidades retornadas seguem esta ordem:

1. demandas urgentes;
2. menor distância em quilômetros;
3. criação mais recente.

O push contém apenas título do chamado e a indicação de oportunidade na região; nunca inclui endereço ou coordenadas exatas. Realtime `demand.created` também é direcionado somente aos IDs elegíveis. Serviços já contratados continuam visíveis ao prestador mesmo se ele ficar indisponível.

## Fonte única da decisão

`matchProviderToDemand` é a função central: ela retorna `eligible`, os motivos da decisão e a distância calculada. Tanto a criação da demanda (push e WebSocket) quanto `GET /api/v1/demands`, `GET /api/v1/demands/nearby` e `GET /api/v1/providers/me/opportunities` passam por ela.

O aplicativo usa o último endpoint para o feed e volta a consultá-lo antes de abrir o popup de um novo chamado. Assim, uma notificação recebida não é suficiente para exibir uma oportunidade se o perfil tiver sido alterado depois do disparo.

## Categorias canônicas

O catálogo público mantém `id`, `type` e `name`. Ao salvar o perfil, o backend resolve os nomes selecionados para `serviceCategoryIds`; ao publicar, resolve a categoria para `Demand.categoryId`. Isso permite alterar o texto de exibição sem quebrar o matching. Categorias criadas por um prestador entram no mesmo catálogo, são divulgadas por `category.updated` e ficam disponíveis para criação de demanda após a atualização do catálogo.
