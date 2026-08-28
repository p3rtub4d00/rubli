# Rubli

**Quem precisa, encontra quem resolve.**

Rubli é uma plataforma de demandas locais que conecta pessoas e empresas a quem pode resolver suas necessidades: serviços, compras sob demanda, entregas e fretes.

## Visão do produto

O usuário publica uma demanda com descrição, localização, fotos e orçamento desejado (opcional). Profissionais ou entregadores próximos podem aceitar o valor ou enviar uma contraproposta. Após a contratação, as partes acompanham o pedido pelo aplicativo, conversam pelo chat e avaliam a experiência.

## Módulos principais

- Serviços: pequenos ou grandes serviços, com preço definido ou propostas.
- Compras sob demanda: alguém compra um item em um estabelecimento indicado e entrega ao solicitante.
- Entregas: coleta e entrega de objetos ou pedidos.
- Fretes: cargas pequenas, médias e grandes, com veículo e capacidade adequados.
- Demandas urgentes: atendimento rápido por proximidade.
- Chat: comunicação entre cliente e executor.
- Geolocalização: busca e distribuição por raio.
- Avaliações: reputação das duas pontas da plataforma.
- Pagamentos: arquitetura preparada para Pix e intermediador de pagamentos.
- Administração: usuários, categorias, demandas, disputas, pagamentos, taxas e indicadores.

## Arquitetura inicial

Monorepo preparado para crescer:

```text
rubli/
├── apps/
│   ├── mobile/       # App Android/iOS
│   ├── api/          # Backend HTTP
│   └── admin/        # Painel administrativo web
├── packages/
│   ├── shared/       # Tipos, constantes e utilitários compartilhados
│   └── config/       # Configurações comuns
├── docs/             # Requisitos e decisões do produto
├── .gitignore
├── package.json
└── README.md
```

## Stack planejada

- Mobile: Flutter + Dart
- API: Node.js + TypeScript + Fastify
- Banco: MongoDB
- Autenticação: JWT com refresh token
- Mapas/geolocalização: provedor de mapas plugável
- Pagamentos: provedor com Pix e split/marketplace, conforme viabilidade jurídica e comercial
- Infraestrutura: preparada para deploy em Render

## Estratégia de desenvolvimento

1. Fundação técnica e autenticação.
2. Cadastro de cliente e profissional/entregador.
3. Publicação de demandas.
4. Aceite e contrapropostas.
5. Chat e status da demanda.
6. Avaliações e reputação.
7. Geolocalização e notificações.
8. Pagamentos e repasses.
9. Painel administrativo.
10. Lançamento piloto em Porto Velho e expansão gradual.

## Princípios

- Mobile-first.
- Segurança e rastreabilidade desde o início.
- Código modular e tipado.
- Nenhuma regra financeira crítica somente no aplicativo: decisões sensíveis ficam no backend.
- Preparado para escalar sem reescrever a base do produto.
