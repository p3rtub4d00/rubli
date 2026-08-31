const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', 'apps', 'mobile', 'App.tsx');
const source = fs.readFileSync(file, 'utf8');

const start = source.indexOf('  async function acceptProposal(proposal: Proposal) {');
const end = source.indexOf('  async function submitProposal(demand: Demand) {', start);
if (start === -1 || end === -1) {
  throw new Error('Não encontrei o bloco de aceitação de proposta no App.tsx.');
}

const replacement = `  async function acceptProposal(proposal: Proposal) {
    if (!user || proposal.status !== 'pending') return;
    const demand = demands.find((item) => item.id === proposal.demandId);
    if (!demand || demand.requesterId !== user.id) return;

    const now = new Date().toISOString();
    const nextProposals = proposals.map((item) => item.demandId === demand.id
      ? item.id === proposal.id
        ? {
            ...item,
            status: 'accepted' as const,
            offeredBy: item.offeredBy ?? 'provider',
            customerConfirmedAt: now,
            providerConfirmedAt: now,
          }
        : item.status === 'pending'
          ? { ...item, status: 'rejected' as const }
          : item
      : item
    );

    // Aceitar a última oferta fecha o acordo. A partir daqui o prestador
    // pode executar as etapas: a caminho -> chegada -> início -> conclusão.
    const nextDemands = demands.map((item) => item.id === demand.id
      ? {
          ...item,
          status: 'accepted' as const,
          acceptedProviderId: proposal.providerId,
          updatedAt: now,
        }
      : item
    );

    setProposals(nextProposals);
    setDemands(nextDemands);
    await saveProposals(nextProposals);
    await saveDemands(nextDemands);

    const conversation = await ensureConversation(demand.id, proposal.providerId);
    if (conversation) {
      setActiveConversation(conversation);
      setScreen('negotiation');
    }
  }
`;

let next = source.slice(0, start) + replacement + source.slice(end);

// Mantém os novos estados visíveis corretamente em qualquer tela que use STATUS_LABELS.
next = next.replace(
  "const STATUS_LABELS: Record<Demand['status'], string> = { draft: 'Rascunho', open: 'Aberta', negotiating: 'Recebendo propostas', accepted: 'Aceita', in_progress: 'Em andamento', completed: 'Concluída', cancelled: 'Cancelada' };",
  "const STATUS_LABELS: Record<Demand['status'], string> = { draft: 'Rascunho', open: 'Aberta', negotiating: 'Recebendo propostas', accepted: 'Aceita', provider_en_route: 'Prestador a caminho', provider_arrived: 'Chegou ao local', in_progress: 'Em andamento', awaiting_customer_confirmation: 'Aguardando confirmação', completed: 'Concluída', cancelled: 'Cancelada' };"
);

fs.writeFileSync(file, next, 'utf8');
console.log('Correção aplicada: aceitar proposta agora libera o fluxo de execução do serviço.');
