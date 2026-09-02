const fs = require('fs');
const path = require('path');

function patchFile(relativePath, patches) {
  const file = path.join(__dirname, '..', relativePath);
  if (!fs.existsSync(file)) throw new Error(`Não encontrei o arquivo: ${file}`);
  let source = fs.readFileSync(file, 'utf8');
  let changed = false;
  for (const { label, find, replace } of patches) {
    if (source.includes(replace)) continue;
    const index = source.indexOf(find);
    if (index === -1) throw new Error(`Não encontrei o bloco de ${label} em ${relativePath}.`);
    source = source.slice(0, index) + replace + source.slice(index + find.length);
    changed = true;
  }
  if (changed) fs.writeFileSync(file, source, 'utf8');
  return changed;
}

const appChanged = patchFile('apps/mobile/App.tsx', [
  {
    label: 'importação da API de propostas',
    find: "import { connectRealtime, disconnectRealtime, subscribeRealtime } from './src/api/realtime';\n",
    replace: "import { connectRealtime, disconnectRealtime, subscribeRealtime } from './src/api/realtime';\nimport { apiAcceptProposal } from './src/api/client';\n",
  },
  {
    label: 'aceite da proposta',
    find: `  async function acceptProposal(proposal: Proposal) {\n    if (!user || proposal.status !== 'pending') return;\n    const demand = demands.find((item) => item.id === proposal.demandId);\n    if (!demand || demand.requesterId !== user.id) return;\n    const now = new Date().toISOString();\n    const nextProposals = proposals.map((item) => item.id === proposal.id ? { ...item, customerConfirmedAt: item.customerConfirmedAt ?? now } : item);\n    const nextDemands = demands.map((item) => item.id === demand.id ? { ...item, status: 'negotiating' as const, updatedAt: now } : item);\n    setProposals(nextProposals);\n    setDemands(nextDemands);\n    await saveProposals(nextProposals);\n    await saveDemands(nextDemands);\n    const conversation = await ensureConversation(demand.id, proposal.providerId);\n    if (conversation) {\n      setActiveConversation(conversation);\n      setScreen('negotiation');\n    }\n  }\n`,
    replace: `  async function acceptProposal(proposal: Proposal) {\n    if (!user || proposal.status !== 'pending') return;\n    const demand = demands.find((item) => item.id === proposal.demandId);\n    if (!demand || demand.requesterId !== user.id) return;\n\n    const result = await apiAcceptProposal(proposal.id, user.id);\n    const nextProposals = proposals.map((item) => item.id === proposal.id ? result.proposal : item);\n    const nextDemands = demands.map((item) => item.id === result.demand.id ? result.demand : item);\n    setProposals(nextProposals);\n    setDemands(nextDemands);\n    await saveProposals(nextProposals);\n    await saveDemands(nextDemands);\n\n    const conversation = await ensureConversation(result.demand.id, result.proposal.providerId);\n    if (conversation) {\n      setActiveConversation(conversation);\n      setScreen('negotiation');\n    }\n  }\n`,
  },
]);

const negotiationChanged = patchFile('apps/mobile/src/screens/NegotiationChatScreen.tsx', [
  {
    label: 'importação da API de propostas',
    find: "import { subscribeRealtime } from '../api/realtime';\n",
    replace: "import { subscribeRealtime } from '../api/realtime';\nimport { apiAcceptProposal, apiConfirmProposal } from '../api/client';\n",
  },
  {
    label: 'aceite dentro da negociação',
    find: `  async function acceptProposal(proposal: Proposal) {`,
    replace: `  async function acceptProposal(proposal: Proposal) {\n    if (proposal.status !== 'pending') throw new Error('Esta oferta não está mais disponível para aceite.');\n    const offerSide = proposal.offeredBy ?? 'provider';\n    const recipientId = offerSide === 'provider' ? effectiveConversation.customerId : effectiveConversation.providerId;\n    if (user.id !== recipientId) throw new Error('Somente quem recebeu a oferta pode aceitá-la.');\n\n    const result = offerSide === 'provider' && user.id === effectiveConversation.customerId\n      ? await apiAcceptProposal(proposal.id, user.id)\n      : await apiConfirmProposal(proposal.id, user.id);\n\n    const nextProposals = proposals.map((item) => item.id === proposal.id ? result.proposal : item);\n    const nextDemands = demands.map((item) => item.id === result.demand.id ? result.demand : item);\n    await saveProposals(nextProposals);\n    await saveDemands(nextDemands);\n    setProposals(nextProposals);\n    setDemands(nextDemands);\n  }\n\n  async function confirmAgreement(proposal: Proposal) {\n    if (proposal.status !== 'pending' && proposal.status !== 'accepted') throw new Error('A oferta ainda não pode ser confirmada.');\n    if (user.id !== effectiveConversation.customerId && user.id !== effectiveConversation.providerId) throw new Error('Usuário não participa desta negociação.');\n\n    const result = await apiConfirmProposal(proposal.id, user.id);\n    const nextProposals = proposals.map((item) => item.id === proposal.id ? result.proposal : item);\n    const nextDemands = demands.map((item) => item.id === result.demand.id ? result.demand : item);\n    await saveProposals(nextProposals);\n    await saveDemands(nextDemands);\n    setProposals(nextProposals);\n    setDemands(nextDemands);\n  }\n\n  /* ORIGINAL_CONFIRM_AGREEMENT_MOVED */\n`,
  },
  {
    label: 'bloco antigo de confirmação',
    find: `  async function confirmAgreement(proposal: Proposal) {`,
    replace: `  /* REMOVED_OLD_CONFIRM_AGREEMENT */\n`,
  },
]);

if (!appChanged && !negotiationChanged) {
  console.log('Correção já aplicada. Nenhuma alteração necessária.');
  process.exit(0);
}

console.log('OK: aceite/confirmação agora passam pelo servidor e o resultado oficial é propagado ao cache local.');
