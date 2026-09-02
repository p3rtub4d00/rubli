const fs = require('fs');
const path = require('path');

function patchFile(relativePath, patches) {
  const file = path.join(__dirname, '..', relativePath);
  if (!fs.existsSync(file)) throw new Error(`Não encontrei o arquivo: ${file}`);
  let source = fs.readFileSync(file, 'utf8');
  let changed = false;
  for (const { label, find, replace } of patches) {
    const index = source.indexOf(find);
    if (index === -1) throw new Error(`Não encontrei o bloco de ${label} em ${relativePath}.`);
    source = source.slice(0, index) + replace + source.slice(index + find.length);
    changed = true;
  }
  if (changed) fs.writeFileSync(file, source, 'utf8');
  return changed;
}

patchFile('apps/mobile/App.tsx', [
  {
    label: 'importação da API de aceite',
    find: "import { connectRealtime, disconnectRealtime, subscribeRealtime } from './src/api/realtime';\n",
    replace: "import { connectRealtime, disconnectRealtime, subscribeRealtime } from './src/api/realtime';\nimport { apiAcceptProposal } from './src/api/client';\n",
  },
  {
    label: 'função de aceite do cliente',
    find: `  async function acceptProposal(proposal: Proposal) {\n    if (!user || proposal.status !== 'pending') return;\n    const demand = demands.find((item) => item.id === proposal.demandId);\n    if (!demand || demand.requesterId !== user.id) return;\n    const now = new Date().toISOString();\n    const nextProposals = proposals.map((item) => item.id === proposal.id ? { ...item, customerConfirmedAt: item.customerConfirmedAt ?? now } : item);\n    const nextDemands = demands.map((item) => item.id === demand.id ? { ...item, status: 'negotiating' as const, updatedAt: now } : item);\n    setProposals(nextProposals);\n    setDemands(nextDemands);\n    await saveProposals(nextProposals);\n    await saveDemands(nextDemands);\n    const conversation = await ensureConversation(demand.id, proposal.providerId);\n    if (conversation) {\n      setActiveConversation(conversation);\n      setScreen('negotiation');\n    }\n  }\n`,
    replace: `  async function acceptProposal(proposal: Proposal) {\n    if (!user || proposal.status !== 'pending') return;\n    const demand = demands.find((item) => item.id === proposal.demandId);\n    if (!demand || demand.requesterId !== user.id) return;\n\n    const result = await apiAcceptProposal(proposal.id, user.id);\n    const nextProposals = proposals.map((item) => item.id === proposal.id ? result.proposal : item);\n    const nextDemands = demands.map((item) => item.id === result.demand.id ? result.demand : item);\n    setProposals(nextProposals);\n    setDemands(nextDemands);\n    await saveProposals(nextProposals);\n    await saveDemands(nextDemands);\n\n    const conversation = await ensureConversation(result.demand.id, result.proposal.providerId);\n    if (conversation) {\n      setActiveConversation(conversation);\n      setScreen('negotiation');\n    }\n  }\n`,
  },
]);

patchFile('apps/mobile/src/screens/NegotiationChatScreen.tsx', [
  {
    label: 'imports de API e realtime',
    find: "import { getDemands, getProposals, getRatings, getUsers, saveDemands, saveProposals } from '../storage/localStore';\nimport { subscribeRealtime } from '../api/realtime';\n",
    replace: "import { getRatings, getUsers, saveDemands, saveProposals } from '../storage/localStore';\nimport { apiAcceptProposal, apiConfirmProposal, apiListDemands, apiListProposals } from '../api/client';\nimport { subscribeRealtime } from '../api/realtime';\n",
  },
  {
    label: 'reload server-authoritative',
    find: `  async function reload() {\n    const [nextDemands, nextProposals, users, ratings] = await Promise.all([getDemands(), getProposals(), getUsers(), getRatings()]);\n    setDemands(nextDemands); setProposals(nextProposals);\n    const providerId = conversation.providerId;\n    setProviderProfile(users.find((item) => item.id === providerId) ?? null);\n    setProviderRatings(ratings.filter((item) => item.providerId === providerId));\n  }\n`,
    replace: `  async function reload() {\n    const [nextDemands, nextProposals, users, ratings] = await Promise.all([apiListDemands(), apiListProposals(), getUsers(), getRatings()]);\n    const activeDemands = nextDemands.filter((item) => item.status !== 'completed' && item.status !== 'cancelled');\n    setDemands(activeDemands);\n    setProposals(nextProposals);\n    const providerId = conversation.providerId;\n    setProviderProfile(users.find((item) => item.id === providerId) ?? null);\n    setProviderRatings(ratings.filter((item) => item.providerId === providerId));\n  }\n`,
  },
  {
    label: 'intervalo e atualização realtime',
    find: `    const interval = setInterval(() => { reload().catch(() => undefined); }, 5000);\n    const unsubscribe = subscribeRealtime((event) => {\n      if (!event.demandId || event.demandId === conversation.demandId || event.proposalId) reload().catch(() => undefined);\n    });\n`,
    replace: `    const interval = setInterval(() => { reload().catch(() => undefined); }, 1500);\n    const unsubscribe = subscribeRealtime((event) => {\n      if (event.demandId === conversation.demandId || event.proposalId) reload().catch(() => undefined);\n    });\n`,
  },
  {
    label: 'aceite server-authoritative da negociação',
    find: `  async function acceptProposal(proposal: Proposal) {\n    if (proposal.status !== 'pending') throw new Error('Esta oferta não está mais disponível para aceite.');\n    const offerSide = proposal.offeredBy ?? 'provider';\n    const recipientId = offerSide === 'provider' ? effectiveConversation.customerId : effectiveConversation.providerId;\n    if (user.id !== recipientId) throw new Error('Somente quem recebeu a oferta pode aceitá-la.');\n    const now = new Date().toISOString();\n    const nextProposals = proposals.map((item) => item.id === proposal.id\n      ? { ...item, customerConfirmedAt: user.id === effectiveConversation.customerId ? (item.customerConfirmedAt ?? now) : item.customerConfirmedAt, providerConfirmedAt: user.id === effectiveConversation.providerId ? (item.providerConfirmedAt ?? now) : item.providerConfirmedAt }\n      : item);\n    const updated = nextProposals.find((item) => item.id === proposal.id)!;\n    const bothConfirmed = Boolean(updated.customerConfirmedAt && updated.providerConfirmedAt);\n    const nextDemands = demands.map((item) => item.id === effectiveConversation.demandId ? { ...item, status: bothConfirmed ? 'accepted' as const : 'negotiating' as const, acceptedProviderId: bothConfirmed ? proposal.providerId : item.acceptedProviderId, updatedAt: now } : item);\n    await saveProposals(nextProposals); await saveDemands(nextDemands); setProposals(nextProposals); setDemands(nextDemands);\n  }\n`,
    replace: `  async function acceptProposal(proposal: Proposal) {\n    if (proposal.status !== 'pending') throw new Error('Esta oferta não está mais disponível para aceite.');\n    const offerSide = proposal.offeredBy ?? 'provider';\n    const recipientId = offerSide === 'provider' ? effectiveConversation.customerId : effectiveConversation.providerId;\n    if (user.id !== recipientId) throw new Error('Somente quem recebeu a oferta pode aceitá-la.');\n\n    const result = offerSide === 'provider' && user.id === effectiveConversation.customerId\n      ? await apiAcceptProposal(proposal.id, user.id)\n      : await apiConfirmProposal(proposal.id, user.id);\n\n    const nextProposals = proposals.map((item) => item.id === proposal.id ? result.proposal : item);\n    const nextDemands = demands.map((item) => item.id === result.demand.id ? result.demand : item);\n    await saveProposals(nextProposals);\n    await saveDemands(nextDemands);\n    setProposals(nextProposals);\n    setDemands(nextDemands);\n  }\n`,
  },
  {
    label: 'confirmação server-authoritative',
    find: `  async function confirmAgreement(proposal: Proposal) {\n    if (proposal.status !== 'pending' && proposal.status !== 'accepted') throw new Error('A oferta ainda não pode ser confirmada.');\n    if (user.id !== effectiveConversation.customerId && user.id !== effectiveConversation.providerId) throw new Error('Usuário não participa desta negociação.');\n    const now = new Date().toISOString();\n    const nextProposals = proposals.map((item) => item.id !== proposal.id ? item : user.id === effectiveConversation.customerId ? { ...item, customerConfirmedAt: item.customerConfirmedAt ?? now } : { ...item, providerConfirmedAt: item.providerConfirmedAt ?? now });\n    const updatedProposal = nextProposals.find((item) => item.id === proposal.id)!;\n    const bothConfirmed = Boolean(updatedProposal.customerConfirmedAt && updatedProposal.providerConfirmedAt);\n    const nextDemands = demands.map((item) => item.id === effectiveConversation.demandId ? { ...item, status: bothConfirmed ? 'accepted' as const : 'negotiating' as const, acceptedProviderId: bothConfirmed ? proposal.providerId : item.acceptedProviderId, updatedAt: now } : item);\n    await saveProposals(nextProposals); await saveDemands(nextDemands); setProposals(nextProposals); setDemands(nextDemands);\n  }\n`,
    replace: `  async function confirmAgreement(proposal: Proposal) {\n    if (proposal.status !== 'pending' && proposal.status !== 'accepted') throw new Error('A oferta ainda não pode ser confirmada.');\n    if (user.id !== effectiveConversation.customerId && user.id !== effectiveConversation.providerId) throw new Error('Usuário não participa desta negociação.');\n\n    const result = await apiConfirmProposal(proposal.id, user.id);\n    const nextProposals = proposals.map((item) => item.id === proposal.id ? result.proposal : item);\n    const nextDemands = demands.map((item) => item.id === result.demand.id ? result.demand : item);\n    await saveProposals(nextProposals);\n    await saveDemands(nextDemands);\n    setProposals(nextProposals);\n    setDemands(nextDemands);\n  }\n`,
  },
]);

console.log('OK: acordo agora atualiza em tempo real, confirmação usa o servidor e a tela faz fallback de sincronização a cada 1,5s.');
