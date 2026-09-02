const fs = require('fs');
const path = require('path');

function read(rel) {
  return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
}
function write(rel, content) {
  fs.writeFileSync(path.join(__dirname, '..', rel), content, 'utf8');
}
function replaceBetweenFunctions(source, functionName, replacement) {
  const start = source.indexOf(`  async function ${functionName}(`);
  if (start < 0) throw new Error(`Não encontrei ${functionName}.`);
  const next = source.indexOf('\n  async function ', start + 1);
  const end = next >= 0 ? next : source.length;
  return source.slice(0, start) + replacement + source.slice(end);
}
function ensureImport(source, needle, importLine) {
  if (source.includes(importLine.trim())) return source;
  const idx = source.indexOf(needle);
  if (idx < 0) throw new Error(`Não encontrei a linha-base da importação: ${needle}`);
  const eol = source.includes('\r\n') ? '\r\n' : '\n';
  const pos = source.indexOf(eol, idx);
  if (pos < 0) return source + eol + importLine;
  return source.slice(0, pos + eol.length) + importLine + eol + source.slice(pos + eol.length);
}

// App.tsx: customer acceptance must be authoritative on the server and must not
// call saveProposals/saveDemands afterwards (those functions still hit /sync).
{
  const rel = 'apps/mobile/App.tsx';
  let s = read(rel);
  const eol = s.includes('\r\n') ? '\r\n' : '\n';
  s = ensureImport(
    s,
    "import { connectRealtime, disconnectRealtime, subscribeRealtime } from './src/api/realtime';",
    `import { apiAcceptProposal } from './src/api/client';`
  );
  const replacement = `  async function acceptProposal(proposal: Proposal) {${eol}    if (!user || proposal.status !== 'pending') return;${eol}    const demand = demands.find((item) => item.id === proposal.demandId);${eol}    if (!demand || demand.requesterId !== user.id) return;${eol}${eol}    const result = await apiAcceptProposal(proposal.id, user.id);${eol}    setProposals((current) => current.map((item) => item.id === result.proposal.id ? result.proposal : item));${eol}    setDemands((current) => current.map((item) => item.id === result.demand.id ? result.demand : item));${eol}${eol}    const conversation = await ensureConversation(result.demand.id, result.proposal.providerId);${eol}    if (conversation) {${eol}      setActiveConversation(conversation);${eol}      setScreen('negotiation');${eol}    }${eol}  }${eol}`;
  s = replaceBetweenFunctions(s, 'acceptProposal', replacement);
  write(rel, s);
}

// NegotiationChatScreen: both customer and provider confirmation must call the
// dedicated server endpoint; never persist agreement through /proposals/sync.
{
  const rel = 'apps/mobile/src/screens/NegotiationChatScreen.tsx';
  let s = read(rel);
  const eol = s.includes('\r\n') ? '\r\n' : '\n';
  s = ensureImport(
    s,
    "import { subscribeRealtime } from '../api/realtime';",
    `import { apiAcceptProposal, apiConfirmProposal, apiListDemands, apiListProposals } from '../api/client';`
  );
  s = s.replace(
    /const \[nextDemands, nextProposals, users, ratings\] = await Promise\.all\(\[getDemands\(\), getProposals\(\), getUsers\(\), getRatings\(\)\]\);/,
    'const [nextDemands, nextProposals, users, ratings] = await Promise.all([apiListDemands(), apiListProposals(), getUsers(), getRatings()]);'
  );
  s = s.replace(
    /const interval = setInterval\(\(\) => \{ reload\(\)\.catch\(\(\) => undefined\); \}, 5000\);/,
    'const interval = setInterval(() => { reload().catch(() => undefined); }, 1500);'
  );

  const acceptReplacement = `  async function acceptProposal(proposal: Proposal) {${eol}    if (proposal.status !== 'pending') throw new Error('Esta oferta não está mais disponível para aceite.');${eol}    const offerSide = proposal.offeredBy ?? 'provider';${eol}    const recipientId = offerSide === 'provider' ? effectiveConversation.customerId : effectiveConversation.providerId;${eol}    if (user.id !== recipientId) throw new Error('Somente quem recebeu a oferta pode aceitá-la.');${eol}${eol}    const result = offerSide === 'provider' && user.id === effectiveConversation.customerId${eol}      ? await apiAcceptProposal(proposal.id, user.id)${eol}      : await apiConfirmProposal(proposal.id, user.id);${eol}${eol}    setProposals((current) => current.map((item) => item.id === result.proposal.id ? result.proposal : item));${eol}    setDemands((current) => current.map((item) => item.id === result.demand.id ? result.demand : item));${eol}  }${eol}`;
  s = replaceBetweenFunctions(s, 'acceptProposal', acceptReplacement);

  const confirmReplacement = `  async function confirmAgreement(proposal: Proposal) {${eol}    if (proposal.status !== 'pending' && proposal.status !== 'accepted') throw new Error('A oferta ainda não pode ser confirmada.');${eol}    if (user.id !== effectiveConversation.customerId && user.id !== effectiveConversation.providerId) throw new Error('Usuário não participa desta negociação.');${eol}${eol}    const result = await apiConfirmProposal(proposal.id, user.id);${eol}    setProposals((current) => current.map((item) => item.id === result.proposal.id ? result.proposal : item));${eol}    setDemands((current) => current.map((item) => item.id === result.demand.id ? result.demand : item));${eol}  }${eol}`;
  s = replaceBetweenFunctions(s, 'confirmAgreement', confirmReplacement);
  write(rel, s);
}

console.log('OK: correção V4 aplicada. Aceite/confirmacao usam o servidor, o /proposals/sync não é usado para concluir o acordo e a negociação consulta o servidor a cada 1,5s.');
