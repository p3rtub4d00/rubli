# Auditoria Técnica e de Produto — Rubli

Data: 2026-09-18
Commit-base auditado: `298d3d9bf3ee76d82cf113b039d27ede44a0bd50`
Branch de trabalho: `auditoria-melhorias-2026-09-18`

## Objetivo

Revisar arquitetura, segurança, matching, experiência Cliente/Prestador, busca Premium, confiança, operação e escalabilidade do Rubli sem desmontar fluxos que já estão funcionando.

## Visão geral

A versão atual já contém uma base de marketplace muito mais completa do que um MVP inicial:

- autenticação com access token e refresh token;
- autorização por papel;
- separação interna Cliente/Prestador;
- matching centralizado por categoria, localização, raio, disponibilidade e assinatura;
- endereço estruturado e proteção do endereço completo;
- proposta e contraproposta;
- confirmação bilateral;
- chat;
- execução do serviço por estados;
- avaliações;
- agendamento;
- cancelamento e disputa;
- busca Premium;
- solicitação direta a profissional;
- modalidades profissionais `services`, `courier`, `freight`;
- painel administrativo;
- realtime e push.

O foco agora deve ser menos “adicionar telas” e mais consolidar consistência, segurança, confiança e escalabilidade.

---

# P0 — Corrigir antes de piloto público

## 1. Higiene do repositório

Há artefatos gerados ainda rastreados no Git, incluindo:

- `.expo/`
- `.pnpm-store/`
- `apps/api/dist/`
- `apps/api/node_modules/`
- `packages/shared/dist/`

Mesmo existindo regras de ignore, arquivos previamente versionados continuam no histórico/índice.

### Ação

Remover do rastreamento sem apagar dependências locais necessárias.

Também revisar scripts temporários em `scripts/fix-*.cjs` e `scripts/integrate-*.cjs`. Os que já cumpriram sua função devem ser arquivados ou removidos para reduzir risco de execução acidental.

---

## 2. Modelo de domínio duplicado e obsoleto

Existe `packages/shared/src/domain.ts` com tipos antigos e incompatíveis com o domínio atual exportado por `packages/shared/src/index.ts`.

Exemplos de divergência:

- estados de demanda diferentes;
- `DemandKind` vs `DemandType`;
- `Money.amountInCents` vs valores atuais;
- campos diferentes de Proposal;
- UserRole divergente.

Não foram encontradas referências atuais relevantes a esses tipos.

### Risco

Um desenvolvedor/Codex pode importar o arquivo errado e recriar regras antigas.

### Ação

Confirmar ausência total de imports e remover o arquivo obsoleto ou substituí-lo por uma camada que reexporte o domínio canônico.

---

## 3. UserRole legado `courier` conflita com providerType

O domínio atual possui:

`role: 'customer' | 'provider' | 'courier' | 'admin'`

e também:

`providerType: 'services' | 'courier' | 'freight'`

Novas contas profissionais usam `role='provider'` + `providerType`.

Porém contas antigas com `role='courier'` podem falhar em regras que verificam estritamente `role === 'provider'`, incluindo matching e consultas do banco.

### Ação

Criar migração segura:

`role='courier' -> role='provider', providerType='courier'`

Depois remover gradualmente `courier` de UserRole.

---

## 4. CORS de produção está permissivo

A API registra:

`cors({ origin: true })`

Isso aceita origens amplas e não é a configuração ideal para produção.

### Ação

Criar allowlist por ambiente:

- web oficial Rubli;
- painel administrativo;
- desenvolvimento local explicitamente configurado.

Aplicativos nativos não dependem do modelo CORS do browser da mesma forma que o Web.

---

## 5. Upload de imagens ainda precisa sair de Data URI/local URI

O servidor ainda possui `bodyLimit` alto e comentários relacionados a fotos em Data URI.

O domínio persiste `photoUris`, `avatarUri` e `profilePhotos`.

### Riscos

- payloads grandes;
- documentos Mongo desnecessariamente pesados;
- URLs/URIs locais que não funcionam em outro dispositivo;
- custo de memória;
- ataque por payload volumoso.

### Ação

Implementar storage real:

1. selecionar/comprimir;
2. upload para storage;
3. banco guarda URL e metadados;
4. exclusão controlada.

Não armazenar segredo do storage no mobile.

---

## 6. Rate limiting

Não foi encontrada uma camada central explícita de rate limiting na API.

### Endpoints prioritários

- login;
- refresh;
- cadastro;
- suporte;
- criação de demanda;
- envio de proposta;
- chat;
- busca Premium;
- registro de push token.

### Ação

Adicionar rate limiting por IP/usuário conforme tipo de operação, com limites diferentes para autenticação e uso normal.

---

# P1 — Produto, confiança e escalabilidade

## 7. Busca Premium não está usando localização na Home

O backend de busca suporta `latitude`, `longitude` e `radius`.

Porém `CustomerApp` chama a busca Premium apenas com texto/página/limite.

Resultado: o bloco chamado “Prestadores Premium perto de você” pode não estar realmente filtrando por proximidade.

### Ação

A Home deve enviar localização válida do cliente.

Sem localização:

- não afirmar “perto de você”;
- solicitar localização ou usar cidade explicitamente selecionada.

---

## 8. “Ver todos” ainda aumenta a Home

Hoje o botão “Ver todos” chama a próxima página e adiciona os resultados no próprio bloco da Home.

Com 50 profissionais, a Home volta a ficar longa — exatamente o problema que a paginação deveria evitar.

### Ação

Criar tela dedicada `PremiumProviderResultsScreen`.

Home:
- máximo 6.

Tela completa:
- 10/20 por página;
- filtros;
- ordenação;
- carregamento progressivo.

---

## 9. Rotação dos Premium praticamente não rotaciona

A rotação atual usa algo baseado no primeiro caractere de `user.id`.

Como IDs de usuário seguem padrão semelhante a `usr_...`, vários usuários compartilham o mesmo primeiro caractere.

### Ação

Criar hash determinístico usando o ID completo + janela temporal.

Exemplo conceitual:

`hash(user.id + YYYY-MM-DD)`

A rotação deve atuar apenas entre profissionais de relevância próxima.

---

## 10. Busca Premium tem risco de N+1

`providerSearch.ts` carrega todos os Premium e chama `professionalMetrics(user)` para cada profissional.

`professionalMetrics` realiza consultas em demandas, propostas e avaliações.

Com centenas/milhares de profissionais, uma busca pode gerar muitas consultas.

### Ação

Criar coleção/materialized metrics ou pipeline agregado.

Exemplo:

`provider_metrics`

- completedServices
- averageRating
- ratingsCount
- completionRate
- cancellationRate
- averageResponseMinutes
- updatedAt

Atualizar incrementalmente após eventos relevantes.

---

## 11. Premium e verificação estão conceitualmente misturados

Hoje existe:

`providerPlan = 'standard' | 'premium_verified'`

e também:

`verificationStatus`.

Além disso, no simulador o plano Premium altera a verificação para `simulated_verified`.

### Problema

Pagar plano e verificar identidade devem ser conceitos diferentes.

### Modelo sugerido

Plano:
- standard
- pro/premium

Verificação:
- not_requested
- pending
- verified
- rejected
- expired

Selos devem refletir verificações reais, não pagamento.

---

## 12. Verificação de prestador precisa virar módulo próprio

O Rubli quer se posicionar em confiança.

Criar fluxo:

`draft -> pending -> verified/rejected -> revalidation_required`

Camadas:

- celular;
- CPF/CNPJ;
- documento;
- selfie/prova de vida;
- veículo para courier/freight;
- checagens adicionais por categoria, quando juridicamente justificadas.

Nunca mostrar “100% seguro”.

Mostrar fatos:

- Celular verificado
- Identidade verificada
- CNPJ verificado
- Veículo verificado

---

## 13. Login por celular/WhatsApp ainda não está implementado

A autenticação atual ainda exige e-mail no cadastro.

Direção de produto definida:

- celular como identificador principal;
- e-mail opcional;
- OTP para verificação/recuperação;
- senha + celular para login inicial, ou passwordless posteriormente.

### Ação

Implementar isso em uma etapa própria, evitando misturar com outras alterações.

---

## 14. Proposta ainda está simples no domínio atual

Proposal ainda possui principalmente:

- amount;
- message.

### Evolução útil

- estimatedDurationMinutes;
- availableAt;
- materialsIncluded;
- materialsDescription;
- warrantyDays.

Isso reduz decisão baseada apenas em preço.

---

## 15. Comparador de propostas

Criar tela de comparação objetiva:

- valor;
- avaliação;
- quantidade de avaliações;
- serviços concluídos;
- distância;
- disponibilidade;
- duração;
- material;
- garantia;
- verificação.

Não escolher automaticamente um vencedor.

---

# P1 — Confiança como produto

## 16. Safety Center por serviço

Criar no serviço contratado um bloco de segurança:

- identidade do prestador;
- status de verificação;
- foto;
- veículo quando aplicável;
- código/identificador do serviço;
- compartilhar detalhes do atendimento com contato de confiança;
- suporte/disputa em um toque.

Especialmente importante para clientes que recebem profissionais em casa.

---

## 17. Código de chegada

Antes de iniciar o serviço presencial:

Prestador chega -> cliente vê um código curto -> prestador confirma o código.

Isso ajuda a garantir que o profissional que chegou corresponde ao contratado.

Não substitui verificação de identidade, mas adiciona uma camada operacional.

---

## 18. Contato de confiança

Permitir ao cliente compartilhar:

- nome do prestador;
- foto;
- horário;
- situação do serviço;
- identificação da contratação.

Não compartilhar endereço completo desnecessariamente.

---

## 19. Política de comunicação dentro do Rubli

Manter negociação e condições no chat ajuda em:

- suporte;
- disputa;
- histórico;
- segurança.

Evitar estimular troca precoce de WhatsApp/telefone.

---

# P2 — Crescimento

## 20. Contratar novamente

Após serviço concluído:

`Contratar novamente`

Cria nova demanda direcionada ao mesmo profissional, permitindo editar endereço/data/descrição.

---

## 21. Favoritos

Cliente pode salvar profissionais.

Não confundir favorito com contratação ou ranking.

---

## 22. Disponibilidade/agenda profissional

Além de online/offline:

- horários de trabalho;
- dias disponíveis;
- bloqueios;
- janela de atendimento.

Isso melhora matching e propostas.

---

## 23. Limite de propostas por demanda

Avaliar limite configurável de propostas para evitar leilão infinito e excesso de notificações.

A regra pode variar por categoria/mercado e deve ser validada com dados reais.

---

# Boas práticas observadas em concorrentes para adaptar

## GetNinjas

Mecanismos úteis:

- pedido estruturado;
- conexão por região;
- profissional escolhe oportunidades;
- cliente recebe poucos contatos/propostas em vez de lista infinita;
- categoria/subcategoria e perguntas específicas do pedido.

Evitar copiar o modelo de “pagar para desbloquear contato” como padrão do Rubli.

## Triider

Mecanismos úteis:

- negociação dentro da plataforma;
- contratação formal antes da execução;
- agendamento;
- verificação documental;
- suporte;
- garantia/disputa;
- profissionais limitados às categorias cadastradas.

Esses pontos combinam diretamente com o posicionamento de confiança do Rubli.

## Cronoshare

Mecanismo a aproveitar:

- questionários específicos por categoria para qualificar a demanda antes de distribuí-la.

Exemplo:

Elétrica:
- tomada?
- chuveiro?
- quadro?
- instalação nova?
- urgência?

Isso reduz propostas irrelevantes.

---

# Ordem recomendada de execução

## Bloco A — estabilização

1. higiene Git;
2. eliminar domínio duplicado;
3. normalizar role/providerType legado;
4. CORS;
5. rate limiting;
6. storage de imagens.

## Bloco B — busca Premium

1. localização real na busca;
2. Home com máximo 6;
3. tela Ver Todos;
4. paginação;
5. filtros;
6. rotação correta;
7. otimização de métricas.

## Bloco C — confiança

1. módulo de verificação;
2. perfil com selos factuais;
3. Safety Center;
4. código de chegada;
5. contato de confiança.

## Bloco D — contratação

1. proposta detalhada;
2. comparador;
3. contratar novamente;
4. favoritos.

## Bloco E — autenticação simplificada

1. telefone como identificador;
2. OTP;
3. recuperação;
4. e-mail opcional.

---

# Regra operacional para próximas alterações

Não alterar cinco subsistemas na mesma tarefa.

Cada mudança deve seguir:

1. diagnóstico;
2. implementação isolada;
3. typecheck;
4. testes automatizados;
5. teste manual;
6. regressão;
7. somente depois próxima etapa.

