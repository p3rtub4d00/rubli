const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', 'apps', 'mobile', 'App.tsx');
if (!fs.existsSync(file)) throw new Error(`Não encontrei o arquivo: ${file}`);

const source = fs.readFileSync(file, 'utf8');
const start = source.indexOf('  async function acceptProposal(proposal: Proposal) {');
const end = source.indexOf('  async function submitProposal(demand: Demand) {', start);
if (start === -1 || end === -1) throw new Error('Não encontrei o bloco de aceitação de proposta no App.tsx.');

const currentBlock = source.slice(start, end);
const oldDemandStatus = "status: 'negotiating' as const,\n          acceptedProviderId: proposal.providerId,";
const newDemandStatus = "status: 'accepted' as const,\n          acceptedProviderId: proposal.providerId,";

let next = source;
if (currentBlock.includes(oldDemandStatus)) {
  const replacement = currentBlock.replace(oldDemandStatus, newDemandStatus);
  next = source.slice(0, start) + replacement + source.slice(end);
}

next = next.replace(
  "const STATUS_LABELS: Record<Demand['status'], string> = { draft: 'Rascunho', open: 'Aberta', negotiating: 'Recebendo propostas', accepted: 'Aceita', in_progress: 'Em andamento', completed: 'Concluída', cancelled: 'Cancelada' };",
  "const STATUS_LABELS: Record<Demand['status'], string> = { draft: 'Rascunho', open: 'Aberta', negotiating: 'Recebendo propostas', accepted: 'Aceita', provider_en_route: 'Prestador a caminho', provider_arrived: 'Chegou ao local', in_progress: 'Em andamento', awaiting_customer_confirmation: 'Aguardando confirmação', completed: 'Concluída', cancelled: 'Cancelada' };"
);

if (next === source) {
  console.log('Correção já estava aplicada. Nenhuma alteração necessária.');
  process.exit(0);
}

fs.writeFileSync(file, next, 'utf8');
console.log('Correção aplicada: aceitar proposta agora libera o fluxo de execução do serviço.');
