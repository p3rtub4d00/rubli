const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', 'apps/mobile/App.tsx');
if (!fs.existsSync(file)) throw new Error(`Não encontrei ${file}`);
let source = fs.readFileSync(file, 'utf8');
const eol = source.includes('\r\n') ? '\r\n' : '\n';

if (source.includes('async function submitProposal(')) {
  console.log('OK: submitProposal já existe. Nenhuma alteração necessária.');
  process.exit(0);
}

const marker = `  async function updateProviderSettings(`;
const markerIndex = source.indexOf(marker);
if (markerIndex < 0) throw new Error('Não encontrei updateProviderSettings para inserir submitProposal.');

const fn = [
  '  async function submitProposal(demand: Demand) {',
  '    if (!user) return;',
  "    const amount = Number((proposalAmounts[demand.id] ?? '').replace(',', '.'));",
  "    if (!Number.isFinite(amount) || amount <= 0) return Alert.alert('Valor inválido', 'Informe seu preço.');",
  "    if (proposals.some((item) => item.demandId === demand.id && item.providerId === user.id && item.status !== 'withdrawn' && item.status !== 'rejected')) return Alert.alert('Negociação já iniciada', 'Use \\\"Ver negociação\\\" para continuar.');",
  "    const proposal: Proposal = { id: newId('pro'), demandId: demand.id, providerId: user.id, amount: Math.round(amount * 100) / 100, message: proposalMessages[demand.id]?.trim() || undefined, status: 'pending', createdAt: new Date().toISOString(), offeredBy: 'provider', version: 1 };",
  '    const nextProposals = [proposal, ...proposals];',
  "    const nextDemands = demands.map((item) => item.id === demand.id ? { ...item, status: 'negotiating' as const, updatedAt: new Date().toISOString() } : item);",
  '    setProposals(nextProposals);',
  '    setDemands(nextDemands);',
  '    await saveProposals(nextProposals);',
  '    await saveDemands(nextDemands);',
  "    setProposalAmounts((state) => ({ ...state, [demand.id]: '' }));",
  "    setProposalMessages((state) => ({ ...state, [demand.id]: '' }));",
  "    Alert.alert('Proposta enviada', 'A negociação está aberta. Use \"Ver negociação\" para continuar.');",
  '  }',
  '',
].join(eol);

source = source.slice(0, markerIndex) + fn + source.slice(markerIndex);
fs.writeFileSync(file, source, 'utf8');
console.log('OK: submitProposal restaurada no App.tsx.');
