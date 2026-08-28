# Rubli — negociação e chat

## Fluxo previsto

1. O cliente publica uma demanda.
2. Prestadores interessados enviam propostas com valor e mensagem.
3. A demanda passa para `negotiating` quando recebe a primeira proposta.
4. Cliente e prestador podem conversar no chat vinculado à demanda.
5. A negociação deve acontecer dentro da plataforma, preservando o histórico.
6. O cliente aceita uma proposta quando houver acordo.
7. A demanda passa para `accepted` e as demais propostas pendentes são recusadas.

## Estado atual

A camada de dados já possui `Conversation` e `ChatMessage`. O armazenamento mobile usa AsyncStorage para permitir testes offline e a API possui endpoints de conversas e mensagens em memória durante o desenvolvimento.

## Contraproposta

Nesta fase, a contraproposta é tratada como negociação dentro do chat para evitar criar versões financeiras incompletas antes da definição do módulo de pagamentos. Em uma fase posterior, será criada uma estrutura formal de versões de proposta, com histórico de valores, responsável pela alteração, validade e aceite explícito.

## Segurança futura

Antes de produção, o chat deverá ter autenticação, autorização por participante, limites de conteúdo, bloqueio/denúncia e auditoria. Pagamentos não devem ser considerados concluídos apenas por uma mensagem no chat.
