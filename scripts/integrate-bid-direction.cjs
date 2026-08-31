const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const appPath = path.join(root, 'apps', 'mobile', 'App.tsx');
const chatPath = path.join(root, 'apps', 'mobile', 'src', 'screens', 'ChatScreen.tsx');
const negotiationPath = path.join(root, 'apps', 'mobile', 'src', 'screens', 'NegotiationChatScreen.tsx');

function updateFile(filePath, replacements, label) {
  let source = fs.readFileSync(filePath, 'utf8');
  if (source.includes('// RUBLI_BID_DIRECTION_V1')) {
    console.log(`${label} já aplicado.`);
    return;
  }
  for (const [needle, replacement, name] of replacements) {
    if (!source.includes(needle)) throw new Error(`Não encontrei o trecho: ${name}`);
    source = source.replace(needle, replacement);
  }
  source = `// RUBLI_BID_DIRECTION_V1\n${source}`;
  fs.writeFileSync(filePath, source, 'utf8');
}

updateFile(appPath, [
  [
    "async function acceptProposal(proposal: Proposal) { if (!user || proposal.status !== 'pending') return; const demand = demands.find((item) => item.id === proposal.demandId); if (!demand || demand.requesterId !== user.id) return; const now = new Date().toISOString(); const nextProposals = proposals.map((item) => item.demandId === demand.id ? (item.id === proposal.id ? { ...item, status: 'accepted' as const, customerConfirmedAt: now } : item.status === 'pending' ? { ...item, status: 'rejected' as const } : item) : item); const nextDemands = demands.map((item) => item.id === demand.id ? { ...item, status: 'negotiating' as const, acceptedProviderId: proposal.providerId, updatedAt: now } : item); setProposals(nextProposals); setDemands(nextDemands); await saveProposals(nextProposals); await saveDemands(nextDemands); const conversation = await ensureConversation(demand.id, proposal.providerId); if (conversation) { setActiveConversation(conversation); setScreen('negotiation'); } }",
    "async function acceptProposal(proposal: Proposal) { if (!user || proposal.status !== 'pending') return; const demand = demands.find((item) => item.id === proposal.demandId); if (!demand) return; const offerSide = proposal.offeredBy ?? 'provider'; const recipientId = offerSide === 'provider' ? demand.requesterId : proposal.providerId; if (user.id !== recipientId) throw new Error('Somente quem recebeu a oferta pode aceitá-la.'); const now = new Date().toISOString(); const nextProposals = proposals.map((item) => item.demandId === demand.id ? (item.id === proposal.id ? { ...item, status: 'accepted' as const, ...(offerSide === 'provider' ? { customerConfirmedAt: now } : { providerConfirmedAt: now }) } : item.status === 'pending' ? { ...item, status: 'rejected' as const } : item) : item); const nextDemands = demands.map((item) => item.id === demand.id ? { ...item, status: 'negotiating' as const, acceptedProviderId: proposal.providerId, updatedAt: now } : item); setProposals(nextProposals); setDemands(nextDemands); await saveProposals(nextProposals); await saveDemands(nextDemands); const conversation = await ensureConversation(demand.id, proposal.providerId); if (conversation) { setActiveConversation(conversation); setScreen('negotiation'); } }",
    'acceptProposal principal'
  ],
  [
    "const proposal: Proposal = { id: newId('pro'), demandId: demand.id, providerId: user.id, amount: Math.round(amount * 100) / 100, message: proposalMessages[demand.id]?.trim() || undefined, status: 'pending', createdAt: new Date().toISOString() };",
    "const proposal: Proposal = { id: newId('pro'), demandId: demand.id, providerId: user.id, amount: Math.round(amount * 100) / 100, message: proposalMessages[demand.id]?.trim() || undefined, status: 'pending', offeredBy: 'provider', createdAt: new Date().toISOString() };",
    'oferta inicial do prestador'
  ]
], 'App.tsx');

updateFile(chatPath, [
  [
    "  const isCustomer = currentUserId === conversation.customerId;\n  const customerConfirmed = Boolean(proposal?.customerConfirmedAt);\n  const providerConfirmed = Boolean(proposal?.providerConfirmedAt);\n  const bothConfirmed = customerConfirmed && providerConfirmed;\n  const canCounter = Boolean(proposal && proposal.status === 'pending' && onCounterProposal);",
    "  const isCustomer = currentUserId === conversation.customerId;\n  const offerSide = proposal?.offeredBy ?? 'provider';\n  const isOfferAuthor = Boolean(proposal && ((offerSide === 'customer' && isCustomer) || (offerSide === 'provider' && !isCustomer)));\n  const canAcceptCurrent = Boolean(proposal && proposal.status === 'pending' && !isOfferAuthor);\n  const customerConfirmed = Boolean(proposal?.customerConfirmedAt);\n  const providerConfirmed = Boolean(proposal?.providerConfirmedAt);\n  const bothConfirmed = customerConfirmed && providerConfirmed;\n  const canCounter = Boolean(proposal && proposal.status === 'pending' && !isOfferAuthor && onCounterProposal);",
    'regra de autoria da oferta'
  ],
  [
    "  async function accept() {\n    if (!proposal || working || proposal.status !== 'pending' || !isCustomer || !onAcceptProposal) return;\n    setWorking(true); try { await onAcceptProposal(proposal); await reload(); } catch { Alert.alert('Erro', 'Não foi possível confirmar a proposta.'); } finally { setWorking(false); }\n  }",
    "  async function accept() {\n    if (!proposal || working || !canAcceptCurrent || !onAcceptProposal) return;\n    setWorking(true); try { await onAcceptProposal(proposal); await reload(); } catch { Alert.alert('Erro', 'Não foi possível aceitar a oferta.'); } finally { setWorking(false); }\n  }",
    'função accept'
  ],
  [
    "          {isCustomer && onAcceptProposal && <TouchableOpacity style={styles.acceptButton} onPress={() => accept().catch(() => undefined)} disabled={working}><Text style={styles.acceptButtonText}>{working ? 'Confirmando...' : `✓ Aceitar por ${money(proposal.amount)}`}</Text></TouchableOpacity>}",
    "          {canAcceptCurrent && onAcceptProposal && <TouchableOpacity style={styles.acceptButton} onPress={() => accept().catch(() => undefined)} disabled={working}><Text style={styles.acceptButtonText}>{working ? 'Aceitando...' : `✓ Aceitar por ${money(proposal.amount)}`}</Text></TouchableOpacity>}",
    'botão aceitar condicional'
  ],
  [
    "  async function confirmAgreement() {\n    if (!proposal || working || isCustomer || proposal.status !== 'accepted' || !proposal.customerConfirmedAt || providerConfirmed || !onConfirmAgreement) return;\n    setWorking(true); try { await onConfirmAgreement(proposal); await reload(); } catch { Alert.alert('Erro', 'Não foi possível confirmar o acordo.'); } finally { setWorking(false); }\n  }",
    "  async function confirmAgreement() {\n    if (!proposal || working || proposal.status !== 'accepted' || bothConfirmed || !onConfirmAgreement) return;\n    const needsCustomerConfirmation = !customerConfirmed && isCustomer;\n    const needsProviderConfirmation = !providerConfirmed && !isCustomer;\n    if (!needsCustomerConfirmation && !needsProviderConfirmation) return;\n    setWorking(true); try { await onConfirmAgreement(proposal); await reload(); } catch { Alert.alert('Erro', 'Não foi possível confirmar o acordo.'); } finally { setWorking(false); }\n  }",
    'confirmação simétrica'
  ],
  [
    "        {proposal.status === 'accepted' && !isCustomer && !providerConfirmed && onConfirmAgreement && <TouchableOpacity style={styles.providerConfirmButton} onPress={() => confirmAgreement().catch(() => undefined)} disabled={working}><Text style={styles.providerConfirmText}>{working ? 'Confirmando...' : '✓ Confirmar acordo e serviço'}</Text></TouchableOpacity>}",
    "        {proposal.status === 'accepted' && !bothConfirmed && onConfirmAgreement && ((!isCustomer && !providerConfirmed) || (isCustomer && !customerConfirmed)) && <TouchableOpacity style={styles.providerConfirmButton} onPress={() => confirmAgreement().catch(() => undefined)} disabled={working}><Text style={styles.providerConfirmText}>{working ? 'Confirmando...' : '✓ Confirmar acordo e serviço'}</Text></TouchableOpacity>}",
    'botão de confirmação simétrico'
  ]
], 'ChatScreen.tsx');

updateFile(negotiationPath, [
  [
    "  async function acceptProposal(proposal: Proposal) {\n    if (user.id !== conversation.customerId || proposal.status !== 'pending') throw new Error('Somente o cliente pode aceitar esta proposta.');\n    const now = new Date().toISOString();\n    const nextProposals = proposals.map((item) =>\n      item.demandId === conversation.demandId\n        ? item.id === proposal.id\n          ? { ...item, status: 'accepted' as const, customerConfirmedAt: now }\n          : item.status === 'pending'\n            ? { ...item, status: 'rejected' as const }\n            : item\n        : item,\n    );",
    "  async function acceptProposal(proposal: Proposal) {\n    if (proposal.status !== 'pending') throw new Error('Somente ofertas pendentes podem ser aceitas.');\n    const offerSide = proposal.offeredBy ?? 'provider';\n    const recipientId = offerSide === 'provider' ? conversation.customerId : conversation.providerId;\n    if (user.id !== recipientId) throw new Error('Somente quem recebeu a oferta pode aceitá-la.');\n    const now = new Date().toISOString();\n    const nextProposals = proposals.map((item) =>\n      item.demandId === conversation.demandId\n        ? item.id === proposal.id\n          ? { ...item, status: 'accepted' as const, ...(offerSide === 'provider' ? { customerConfirmedAt: now } : { providerConfirmedAt: now }) }\n          : item.status === 'pending'\n            ? { ...item, status: 'rejected' as const }\n            : item\n        : item,\n    );",
    'aceite simétrico da negociação'
  ],
  [
    "  async function confirmAgreement(proposal: Proposal) {\n    if (user.id !== conversation.providerId) throw new Error('Somente o prestador pode confirmar o acordo.');\n    if (proposal.status !== 'accepted' || !proposal.customerConfirmedAt) throw new Error('O cliente ainda não confirmou a proposta.');\n    const now = new Date().toISOString();\n    const nextProposals = proposals.map((item) => item.id === proposal.id ? { ...item, providerConfirmedAt: now } : item);",
    "  async function confirmAgreement(proposal: Proposal) {\n    if (proposal.status !== 'accepted') throw new Error('Somente uma oferta aceita pode ser confirmada.');\n    const waitingForCustomer = !proposal.customerConfirmedAt && user.id === conversation.customerId;\n    const waitingForProvider = !proposal.providerConfirmedAt && user.id === conversation.providerId;\n    if (!waitingForCustomer && !waitingForProvider) throw new Error('Você não pode confirmar esta etapa da negociação.');\n    const now = new Date().toISOString();\n    const nextProposals = proposals.map((item) => item.id === proposal.id ? { ...item, ...(waitingForCustomer ? { customerConfirmedAt: now } : { providerConfirmedAt: now }) } : item);",
    'confirmação simétrica do acordo'
  ]
], 'NegotiationChatScreen.tsx');

console.log('Fluxo de negociação por autoria da oferta aplicado com sucesso.');
