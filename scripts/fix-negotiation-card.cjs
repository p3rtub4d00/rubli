const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', 'apps', 'mobile', 'src', 'screens', 'ChatScreen.tsx');
let source = fs.readFileSync(file, 'utf8');

const oldBlock = `    const history = proposalItems.filter((item) => item.demandId === conversation.demandId && item.providerId === conversation.providerId).sort((a, b) => a.createdAt.localeCompare(b.createdAt));`;
const newBlock = `    const exactHistory = proposalItems.filter((item) => item.demandId === conversation.demandId && item.providerId === conversation.providerId);
    const fallbackHistory = exactHistory.length > 0
      ? exactHistory
      : proposalItems.filter((item) => item.demandId === conversation.demandId && item.providerId === (currentDemand?.acceptedProviderId ?? conversation.providerId));
    const history = fallbackHistory.sort((a, b) => a.createdAt.localeCompare(b.createdAt));`;

if (source.includes(newBlock)) {
  console.log('Correção do cartão de negociação já está aplicada.');
  process.exit(0);
}

if (!source.includes(oldBlock)) {
  throw new Error('Não encontrei o bloco de carregamento da proposta no ChatScreen.tsx.');
}

source = source.replace(oldBlock, newBlock);
fs.writeFileSync(file, source, 'utf8');
console.log('Correção aplicada: o cartão da negociação volta a carregar pela demanda e prestador aceito.');
