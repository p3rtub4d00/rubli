const fs = require('fs');
const path = require('path');

function read(relativePath) {
  const file = path.join(__dirname, '..', relativePath);
  if (!fs.existsSync(file)) throw new Error(`Arquivo não encontrado: ${relativePath}`);
  const raw = fs.readFileSync(file, 'utf8');
  return { file, source: raw.replace(/\r\n/g, '\n') };
}

function write(file, source) {
  // Preserve the Windows newline convention used by the local checkout.
  fs.writeFileSync(file, source.replace(/\n/g, '\r\n'), 'utf8');
}

function replaceOnce(source, pattern, replacement, label) {
  if (!pattern.test(source)) throw new Error(`Não encontrei ${label}.`);
  return source.replace(pattern, replacement);
}

// ---------- App.tsx ----------
{
  const { file, source: original } = read('apps/mobile/App.tsx');
  let source = original;

  if (!source.includes("import { apiAcceptProposal } from './src/api/client';")) {
    source = replaceOnce(
      source,
      /import \{ connectRealtime, disconnectRealtime, subscribeRealtime \} from '\.\/src\/api\/realtime';\n/,
      "import { connectRealtime, disconnectRealtime, subscribeRealtime } from './src/api/realtime';\nimport { apiAcceptProposal } from './src/api/client';\n",
      'import da apiAcceptProposal no App.tsx'
    );
  }

  source = replaceOnce(
    source,
    /  async function acceptProposal\(proposal: Proposal\) \{[\s\S]*?\n  \}\n  async function submitProposal/,
    `  async function acceptProposal(proposal: Proposal) {
    if (!user || proposal.status !== 'pending') return;
    const demand = demands.find((item) => item.id === proposal.demandId);
    if (!demand || demand.requesterId !== user.id) return;

    const result = await apiAcceptProposal(proposal.id, user.id);
    const nextProposals = proposals.map((item) => item.id === proposal.id ? result.proposal : item);
    const nextDemands = demands.map((item) => item.id === result.demand.id ? result.demand : item);
    setProposals(nextProposals);
    setDemands(nextDemands);

    const conversation = await ensureConversation(result.demand.id, result.proposal.providerId);
    if (conversation) {
      setActiveConversation(conversation);
      setScreen('negotiation');
    }
  }
  async function submitProposal`,
    'função acceptProposal do App.tsx'
  );

  write(file, source);
}

// ---------- NegotiationChatScreen.tsx ----------
{
  const { file, source: original } = read('apps/mobile/src/screens/NegotiationChatScreen.tsx');
  let source = original;

  if (!source.includes("apiAcceptProposal, apiConfirmProposal, apiListDemands, apiListProposals")) {
    source = replaceOnce(
      source,
      /import \{ getDemands, getProposals, getRatings, getUsers, saveDemands, saveProposals \} from '\.\.\/storage\/localStore';\nimport \{ subscribeRealtime \} from '\.\.\/api\/realtime';\n/,
      "import { getRatings, getUsers } from '../storage/localStore';\nimport { apiAcceptProposal, apiConfirmProposal, apiListDemands, apiListProposals } from '../api/client';\nimport { subscribeRealtime } from '../api/realtime';\n",
      'imports server-authoritative da NegotiationChatScreen'
    );
  }

  source = replaceOnce(
    source,
    /  async function reload\(\) \{[\s\S]*?\n  \}\n\n  useEffect\(\(\) => \{/,
    `  async function reload() {
    const [nextDemands, nextProposals, users, ratings] = await Promise.all([
      apiListDemands(),
      apiListProposals(),
      getUsers(),
      getRatings(),
    ]);
    const activeDemands = nextDemands.filter((item) => item.status !== 'completed' && item.status !== 'cancelled');
    setDemands(activeDemands);
    setProposals(nextProposals);
    const providerId = conversation.providerId;
    setProviderProfile(users.find((item) => item.id === providerId) ?? null);
    setProviderRatings(ratings.filter((item) => item.providerId === providerId));
  }

  useEffect(() => {`,
    'reload da NegotiationChatScreen'
  );

  source = replaceOnce(
    source,
    /    const interval = setInterval\(\(\) => \{ reload\(\)\.catch\(\(\) => undefined\); \}, 5000\);\n    const unsubscribe = subscribeRealtime\(\(event\) => \{[\s\S]*?\n    \}\);/,
    `    const interval = setInterval(() => { reload().catch(() => undefined); }, 1500);
    const unsubscribe = subscribeRealtime((event) => {
      if (event.demandId === conversation.demandId || event.proposalId === currentProposal?.id) {
        reload().catch(() => undefined);
      }
    });`,
    'atualização realtime/polling da NegotiationChatScreen'
  );

  source = replaceOnce(
    source,
    /  async function acceptProposal\(proposal: Proposal\) \{[\s\S]*?\n  \}\n\n  async function confirmAgreement/,
    `  async function acceptProposal(proposal: Proposal) {
    if (proposal.status !== 'pending') throw new Error('Esta oferta não está mais disponível para aceite.');
    const offerSide = proposal.offeredBy ?? 'provider';
    const recipientId = offerSide === 'provider' ? effectiveConversation.customerId : effectiveConversation.providerId;
    if (user.id !== recipientId) throw new Error('Somente quem recebeu a oferta pode aceitá-la.');

    // Cliente aceita proposta do prestador pela rota /accept.
    // Prestador confirma proposta/contraproposta do cliente pela rota /confirm.
    const result = offerSide === 'provider' && user.id === effectiveConversation.customerId
      ? await apiAcceptProposal(proposal.id, user.id)
      : await apiConfirmProposal(proposal.id, user.id);

    setProposals((items) => items.map((item) => item.id === result.proposal.id ? result.proposal : item));
    setDemands((items) => items.map((item) => item.id === result.demand.id ? result.demand : item));
  }

  async function confirmAgreement`,
    'acceptProposal da NegotiationChatScreen'
  );

  source = replaceOnce(
    source,
    /  async function confirmAgreement\(proposal: Proposal\) \{[\s\S]*?\n  \}\n\n  async function sendCounterProposal/,
    `  async function confirmAgreement(proposal: Proposal) {
    if (proposal.status !== 'pending' && proposal.status !== 'accepted') throw new Error('A oferta ainda não pode ser confirmada.');
    if (user.id !== effectiveConversation.customerId && user.id !== effectiveConversation.providerId) throw new Error('Usuário não participa desta negociação.');

    const result = await apiConfirmProposal(proposal.id, user.id);
    setProposals((items) => items.map((item) => item.id === result.proposal.id ? result.proposal : item));
    setDemands((items) => items.map((item) => item.id === result.demand.id ? result.demand : item));
  }

  async function sendCounterProposal`,
    'confirmAgreement da NegotiationChatScreen'
  );

  write(file, source);
}

console.log('OK: aceite/confirmacao agora usam a API do servidor; o prestador confirma a proposta do cliente; a negociacao faz polling a cada 1,5s e nao depende do /proposals/sync para concluir o acordo.');
