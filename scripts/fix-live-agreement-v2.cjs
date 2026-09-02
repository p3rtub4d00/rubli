const fs = require('fs');
const path = require('path');

function readFile(relativePath) {
  const file = path.join(__dirname, '..', relativePath);
  if (!fs.existsSync(file)) throw new Error(`Arquivo não encontrado: ${relativePath}`);
  const source = fs.readFileSync(file, 'utf8');
  return { file, source, eol: source.includes('\r\n') ? '\r\n' : '\n' };
}

function writeFile(file, source, eol) {
  fs.writeFileSync(file, source.replace(/\r?\n/g, eol), 'utf8');
}

function replaceFunction(source, signature, replacement) {
  const start = source.indexOf(signature);
  if (start < 0) throw new Error(`Função não encontrada: ${signature}`);
  const braceStart = source.indexOf('{', start);
  if (braceStart < 0) throw new Error(`Bloco não encontrado: ${signature}`);
  let depth = 0;
  let inString = null;
  let escaped = false;
  for (let i = braceStart; i < source.length; i++) {
    const ch = source[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === inString) inString = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') { inString = ch; continue; }
    if (ch === '{') depth++;
    if (ch === '}') {
      depth--;
      if (depth === 0) {
        let end = i + 1;
        if (source[end] === '\r' && source[end + 1] === '\n') end += 2;
        else if (source[end] === '\n') end += 1;
        return source.slice(0, start) + replacement + source.slice(end);
      }
    }
  }
  throw new Error(`Não foi possível fechar a função: ${signature}`);
}

function ensureImport(source, importText, anchor) {
  if (source.includes(importText)) return source;
  const index = source.indexOf(anchor);
  if (index < 0) throw new Error(`Âncora de import não encontrada: ${anchor}`);
  const lineEnd = source.indexOf('\n', index);
  if (lineEnd < 0) return source + `\n${importText}\n`;
  return source.slice(0, lineEnd + 1) + importText + source.slice(lineEnd + 1);
}

// App.tsx
{
  const { file, source, eol } = readFile('apps/mobile/App.tsx');
  let next = source.replace(/\r\n/g, '\n');
  next = ensureImport(next, "import { apiAcceptProposal } from './src/api/client';\n", "import { connectRealtime, disconnectRealtime, subscribeRealtime } from './src/api/realtime';");
  next = replaceFunction(next, 'async function acceptProposal(proposal: Proposal)', `async function acceptProposal(proposal: Proposal) {
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
  }`);
  writeFile(file, next, eol);
}

// NegotiationChatScreen.tsx
{
  const { file, source, eol } = readFile('apps/mobile/src/screens/NegotiationChatScreen.tsx');
  let next = source.replace(/\r\n/g, '\n');
  next = ensureImport(next, "import { apiAcceptProposal, apiConfirmProposal, apiListDemands, apiListProposals } from '../api/client';\n", "import { subscribeRealtime } from '../api/realtime';");
  next = next.replace("import { getDemands, getProposals, getRatings, getUsers, saveDemands, saveProposals } from '../storage/localStore';", "import { getRatings, getUsers, saveDemands, saveProposals } from '../storage/localStore';");

  next = replaceFunction(next, 'async function reload()', `async function reload() {
    const [nextDemands, nextProposals, users, ratings] = await Promise.all([apiListDemands(), apiListProposals(), getUsers(), getRatings()]);
    const activeDemands = nextDemands.filter((item) => item.status !== 'completed' && item.status !== 'cancelled');
    setDemands(activeDemands);
    setProposals(nextProposals);
    const providerId = conversation.providerId;
    setProviderProfile(users.find((item) => item.id === providerId) ?? null);
    setProviderRatings(ratings.filter((item) => item.providerId === providerId));
  }`);

  next = next.replace(
    /    const interval = setInterval\(\(\) => \{ reload\(\)\.catch\(\(\) => undefined\); \}, 5000\);\n    const unsubscribe = subscribeRealtime\(\(event\) => \{\n      if \(!event\.demandId \|\| event\.demandId === conversation\.demandId \|\| event\.proposalId\) reload\(\)\.catch\(\(\) => undefined\);\n    \}\);/,
    `    const interval = setInterval(() => { reload().catch(() => undefined); }, 1500);
    const unsubscribe = subscribeRealtime((event) => {
      if (event.demandId === conversation.demandId || event.proposalId) reload().catch(() => undefined);
    });`
  );

  next = replaceFunction(next, 'async function acceptProposal(proposal: Proposal)', `async function acceptProposal(proposal: Proposal) {
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
  }`);

  next = replaceFunction(next, 'async function confirmAgreement(proposal: Proposal)', `async function confirmAgreement(proposal: Proposal) {
    if (proposal.status !== 'pending' && proposal.status !== 'accepted') throw new Error('A oferta ainda não pode ser confirmada.');
    if (user.id !== effectiveConversation.customerId && user.id !== effectiveConversation.providerId) throw new Error('Usuário não participa desta negociação.');

    const result = await apiConfirmProposal(proposal.id, user.id);
    const nextProposals = proposals.map((item) => item.id === proposal.id ? result.proposal : item);
    const nextDemands = demands.map((item) => item.id === result.demand.id ? result.demand : item);
    await saveProposals(nextProposals);
    await saveDemands(nextDemands);
    setProposals(nextProposals);
    setDemands(nextDemands);
  }`);
  writeFile(file, next, eol);
}

console.log('OK: correção aplicada. Aceite/confirmação usam a API, negociação consulta o servidor e atualiza a cada 1,5s.');
