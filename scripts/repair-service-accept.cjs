const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', 'apps', 'mobile', 'App.tsx');
let source = fs.readFileSync(file, 'utf8');

const start = source.indexOf('  async function acceptProposal(proposal: Proposal) {');
const end = source.indexOf('  async function submitProposal(demand: Demand) {', start);

if (start === -1 || end === -1) {
  throw new Error('Não encontrei a função acceptProposal no App.tsx.');
}

const replacement = `  async function acceptProposal(proposal: Proposal) {
    if (!user || proposal.status !== 'pending') return;
    const demand = demands.find((item) => item.id === proposal.demandId);
    if (!demand || demand.requesterId !== user.id) return;

    const now = new Date().toISOString();
    const nextProposals = proposals.map((item) =>
      item.demandId === demand.id
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

    const nextDemands = demands.map((item) =>
      item.id === demand.id
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

source = source.slice(0, start) + replacement + source.slice(end);

fs.writeFileSync(file, source, 'utf8');
console.log('OK: aceite da proposta agora libera o fluxo de execução do serviço.');
