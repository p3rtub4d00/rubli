const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', 'apps', 'mobile', 'src', 'screens', 'ChatScreen.tsx');
let source = fs.readFileSync(file, 'utf8');

// 1) Recupera a proposta pelo chamado/acceptedProvider quando o providerId da conversa
// estiver inconsistente (comum nos testes locais após várias identidades).
const oldHistory = `    const history = proposalItems.filter((item) => item.demandId === conversation.demandId && item.providerId === conversation.providerId).sort((a, b) => a.createdAt.localeCompare(b.createdAt));`;
const badFallback = `    const exactHistory = proposalItems.filter((item) => item.demandId === conversation.demandId && item.providerId === conversation.providerId);\n    const fallbackHistory = exactHistory.length > 0\n      ? exactHistory\n      : proposalItems.filter((item) => item.demandId === conversation.demandId && item.providerId === (currentDemand?.acceptedProviderId ?? conversation.providerId));\n    const history = fallbackHistory.sort((a, b) => a.createdAt.localeCompare(b.createdAt));`;
const goodFallback = `    const currentDemand = demandItems.find((item) => item.id === conversation.demandId) ?? null;\n    const exactHistory = proposalItems.filter((item) => item.demandId === conversation.demandId && item.providerId === conversation.providerId);\n    const fallbackHistory = exactHistory.length > 0\n      ? exactHistory\n      : proposalItems.filter((item) => item.demandId === conversation.demandId && item.providerId === (currentDemand?.acceptedProviderId ?? conversation.providerId));\n    const history = fallbackHistory.sort((a, b) => a.createdAt.localeCompare(b.createdAt));`;

if (source.includes(badFallback)) source = source.replace(badFallback, goodFallback);
else if (source.includes(oldHistory)) source = source.replace(oldHistory, goodFallback);
else if (!source.includes(goodFallback)) throw new Error('Não encontrei o bloco de carregamento da negociação no ChatScreen.tsx.');

// 2) A tela de negociação deve ocupar toda a área do app. Isso impede que a navegação
// persistente de outras telas fique sobreposta ao chat.
const oldContainer = `container:{flex:1,backgroundColor:'#F7F9FC'}`;
const newContainer = `container:{flex:1,backgroundColor:'#F7F9FC',position:'absolute',top:0,left:0,right:0,bottom:0,zIndex:99999,elevation:99999}`;
if (source.includes(oldContainer)) source = source.replace(oldContainer, newContainer);

// 3) Garante que o conteúdo tenha espaço para o cabeçalho próprio e o composer.
const oldMessages = `messages:{`;
if (source.includes(oldMessages) && !source.includes(`messages:{paddingTop:8`)) {
  source = source.replace(oldMessages, `messages:{paddingTop:8`);
}

fs.writeFileSync(file, source, 'utf8');
console.log('Correção aplicada: cartão da negociação restaurado e tela colocada em modo exclusivo.');
