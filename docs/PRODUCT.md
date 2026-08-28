# Rubli — Especificação inicial do produto

## 1. Proposta

O Rubli permite que qualquer pessoa publique uma necessidade local e encontre alguém disponível para executá-la.

O pedido pode ser:

- Serviço: instalação, manutenção, limpeza, montagem, construção, reparo etc.
- Compra sob demanda: o solicitante informa o produto e o estabelecimento; um executor compra e entrega.
- Entrega: transporte de um item entre origem e destino.
- Frete: transporte de volumes maiores, com informações de veículo, carga e dimensões.

## 2. Modelo de contratação

A demanda terá três possibilidades:

### Valor definido
O cliente informa quanto pretende pagar. Profissionais/entregadores podem aceitar ou enviar contraproposta.

### Sem valor definido
O cliente descreve o trabalho e recebe propostas.

### Oferta/negociação
O cliente publica uma faixa ou orçamento inicial e negocia pelo chat.

## 3. Atores

### Cliente
Cria demandas, acompanha propostas, conversa com executores, paga, confirma conclusão e avalia.

### Executor
Pode atuar como profissional de serviços, entregador, motorista de frete ou mais de uma categoria. Recebe oportunidades próximas, aceita ou contrapropõe, executa e recebe.

### Administrador
Gerencia usuários, categorias, demandas, taxas, pagamentos, denúncias, disputas, bloqueios, conteúdo e indicadores.

## 4. Status da demanda

`DRAFT -> OPEN -> PROPOSALS -> ACCEPTED -> IN_PROGRESS -> COMPLETED -> CONFIRMED -> PAID_OUT`

Estados de exceção:

`CANCELLED`, `DISPUTED`, `EXPIRED`

## 5. Regras iniciais

- A localização exata do cliente não deve ser exposta publicamente antes da contratação.
- O chat deve registrar data/hora e participantes.
- O backend é a fonte de verdade para status, preço e regras financeiras.
- O usuário só pode concluir etapas permitidas pelo estado atual.
- Cancelamentos e disputas devem manter histórico/auditoria.
- Avaliações só podem ocorrer após uma demanda elegível ser concluída.
- Perfis de executor devem possuir identidade e dados mínimos de segurança antes de receber tarefas sensíveis, de acordo com a política do produto.

## 6. Compra sob demanda

Fluxo de referência:

1. Cliente informa produto, quantidade e estabelecimento.
2. Cliente informa valor estimado do item e/ou autoriza orçamento.
3. Cliente define a remuneração do executor ou aceita propostas.
4. Executor aceita.
5. O sistema registra o valor autorizado e o pedido.
6. Compra é realizada.
7. Executor coleta e entrega.
8. Cliente confirma recebimento.
9. Sistema encerra a demanda e inicia o repasse conforme o provedor de pagamento.

Para medicamentos, bebidas, produtos controlados ou itens com restrição legal, o produto deverá aplicar regras específicas e não permitir fluxos incompatíveis com a legislação ou políticas dos parceiros de pagamento.

## 7. Fretes

Campos mínimos:

- Origem
- Destino
- Tipo de carga
- Descrição
- Quantidade/volume
- Peso estimado
- Fotos
- Necessidade de ajudante
- Data/hora desejada
- Tipo de veículo requerido
- Orçamento ou propostas

## 8. Monetização prevista

Modelo híbrido, sujeito a validação no piloto:

- Comissão por transação/serviço concluído.
- Taxa de conveniência quando aplicável.
- Plano para profissionais com recursos adicionais.
- Destaque patrocinado de perfis/anúncios.
- Soluções comerciais para estabelecimentos.

A porcentagem de comissão não será codificada como constante fixa no aplicativo; ela deverá ser configurável pelo backend/admin.

## 9. MVP

Primeira versão focada em provar o ciclo completo:

- Cadastro/login.
- Perfil de cliente e executor.
- Categorias.
- Publicação de demanda.
- Feed de oportunidades por proximidade/categoria.
- Aceite e contraproposta.
- Chat básico.
- Alteração de status.
- Conclusão e avaliação.
- Painel administrativo mínimo.

Pagamentos, mapas avançados, notificações push, antifraude e recursos premium entram na evolução logo após validar o fluxo principal.
