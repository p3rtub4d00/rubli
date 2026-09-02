const fs = require('fs');
const path = require('path');

function readFile(relativePath) {
  const file = path.join(__dirname, '..', relativePath);
  if (!fs.existsSync(file)) throw new Error(`Não encontrei o arquivo: ${file}`);
  return { file, source: fs.readFileSync(file, 'utf8') };
}

function replaceBlock(source, startMarker, endMarker, replacement, label, relativePath) {
  const start = source.indexOf(startMarker);
  if (start === -1) throw new Error(`Não encontrei o início de ${label} em ${relativePath}.`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  if (end === -1) throw new Error(`Não encontrei o fim de ${label} em ${relativePath}.`);
  return source.slice(0, start) + replacement + source.slice(end);
}

function ensureImport(source, anchor, importLine, relativePath) {
  if (source.includes(importLine)) return source;
  const index = source.indexOf(anchor);
  if (index === -1) throw new Error(`Não encontrei a âncora de importação em ${relativePath}.`);
  return source.slice(0, index + anchor.length) + importLine + source.slice(index + anchor.length);
}

const appPath = 'apps/mobile/App.tsx';
const app = readFile(appPath);
let appSource = ensureImport(
  app.source,
  "import { connectRealtime, disconnectRealtime, subscribeRealtime } from './src/api/realtime';\n",
  "import { apiAcceptProposal } from './src/api/client';\n",
  appPath,
);

const appAcceptStart = '  async function acceptProposal(proposal: Proposal) {';
const appAcceptEnd = '  async function submitProposal(demand: Demand) {';
const appAcceptReplacement = `  async function acceptProposal(proposal: Proposal) {
    if (!user || proposal.status !== 'pending') return;
    const demand = demands.find((item) => item.id === proposal.demandId);
    if (!demand || demand.requesterId !== user.id) return;

    const result = await apiAcceptProposal(proposal.id, user.id);
    const nextProposals = proposals.map((item) => item.id === proposal.id ? result.proposal : item);
    const nextDemands = demands.map((item) => item.id === result.demand.id ? result.demand : item);
    setProposals(nextProposals);
    setDemands(nextDemands);
    await saveProposals(nextProposals);
    await saveDemands(nextDemands);

    const conversation = await ensureConversation(result.demand.id, result.proposal.providerId);
    if (conversation) {
      setActiveConversation(conversation);
      setScreen('negotiation');
    }
  }
`;
appSource = replaceBlock(appSource, appAcceptStart, appAcceptEnd, appAcceptReplacement, 'aceite da proposta', appPath);
if (appSource !== app.source) fs.writeFileSync(app.file, appSource, 'utf8');

const negotiationPath = 'apps/mobile/src/screens/NegotiationChatScreen.tsx';
const negotiation = readFile(negotiationPath);
let negotiationSource = ensureImport(
  negotiation.source,
  "import { subscribeRealtime } from '../api/realtime';\n",
  "import { apiAcceptProposal, apiConfirmProposal } from '../api/client';\n",
  negotiationPath,
);

const negotiationAcceptStart = '  async function acceptProposal(proposal: Proposal) {';
const negotiationAcceptEnd = '  async function confirmAgreement(proposal: Proposal) {';
const negotiationAcceptReplacement = `  async function acceptProposal(proposal: Proposal) {
    if (proposal.status !== 'pending') throw new Error('Esta oferta não está mais disponível para aceite.');
    const offerSide = proposal.offeredBy ?? 'provider';
    const recipientId = offerSide === 'provider' ? effectiveConversation.customerId : effectiveConversation.providerId;
    if (user.id !== recipientId) throw new Error('Somente quem recebeu a oferta pode aceitá-la.');

    const result = offerSide === 'provider' && user.id === effectiveConversation.customerId
      ? await apiAcceptProposal(proposal.id, user.id)
      : await apiConfirmProposal(proposal.id, user.id);

    const nextProposals = proposals.map((item) => item.id === proposal.id ? result.proposal : item);
    const nextDemands = demands.map((item) => item.id === result.demand.id ? result.demand : item);
    await saveProposals(nextProposals);
    await saveDemands(nextDemands);
    setProposals(nextProposals);
    setDemands(nextDemands);
  }

`;
negotiationSource = replaceBlock(negotiationSource, negotiationAcceptStart, negotiationAcceptEnd, negotiationAcceptReplacement, 'aceite dentro da negociação', negotiationPath);

const negotiationConfirmStart = '  async function confirmAgreement(proposal: Proposal) {';
const negotiationConfirmEnd = '  async function sendCounterProposal(proposal: Proposal, amount: number, message?: string) {';
const negotiationConfirmReplacement = `  async function confirmAgreement(proposal: Proposal) {
    if (proposal.status !== 'pending' && proposal.status !== 'accepted') throw new Error('A oferta ainda não pode ser confirmada.');
    if (user.id !== effectiveConversation.customerId && user.id !== effectiveConversation.providerId) throw new Error('Usuário não participa desta negociação.');

    const result = await apiConfirmProposal(proposal.id, user.id);
    const nextProposals = proposals.map((item) => item.id === proposal.id ? result.proposal : item);
    const nextDemands = demands.map((item) => item.id === result.demand.id ? result.demand : item);
    await saveProposals(nextProposals);
    await saveDemands(nextDemands);
    setProposals(nextProposals);
    setDemands(nextDemands);
  }

`;
negotiationSource = replaceBlock(negotiationSource, negotiationConfirmStart, negotiationConfirmEnd, negotiationConfirmReplacement, 'confirmação do acordo', negotiationPath);
if (negotiationSource !== negotiation.source) fs.writeFileSync(negotiation.file, negotiationSource, 'utf8');

console.log('OK: aceite e confirmação agora usam o backend como fonte oficial e atualizam o cache com a resposta do servidor.');
