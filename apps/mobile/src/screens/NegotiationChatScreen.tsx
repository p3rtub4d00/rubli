import { useEffect, useState } from 'react';
import { Alert, View } from 'react-native';
import type { Conversation, Demand, Proposal, User } from '@rubli/shared';
import { getDemands, getProposals, saveDemands, saveProposals } from '../storage/localStore';
import { ChatScreen } from './ChatScreen';

interface Props {
  user: User;
  conversation: Conversation;
  onBack: () => void;
}

export function NegotiationChatScreen({ user, conversation, onBack }: Props) {
  const [demands, setDemands] = useState<Demand[]>([]);
  const [proposals, setProposals] = useState<Proposal[]>([]);

  async function reload() {
    const [nextDemands, nextProposals] = await Promise.all([getDemands(), getProposals()]);
    setDemands(nextDemands);
    setProposals(nextProposals);
  }

  useEffect(() => {
    reload().catch(() => Alert.alert('Erro', 'Não foi possível carregar a negociação.'));
  }, [conversation.id, conversation.demandId, conversation.providerId]);

  const demand = demands.find((item) => item.id === conversation.demandId) ?? null;
  const currentProposal = proposals
    .filter((item) => item.demandId === conversation.demandId && item.providerId === conversation.providerId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .at(-1) ?? null;

  async function acceptProposal(proposal: Proposal) {
    if (user.id !== conversation.customerId || proposal.status !== 'pending') throw new Error('Somente o cliente pode aceitar esta proposta.');
    const now = new Date().toISOString();
    const nextProposals = proposals.map((item) =>
      item.demandId === conversation.demandId
        ? item.id === proposal.id
          ? { ...item, status: 'accepted' as const, customerConfirmedAt: now }
          : item.status === 'pending'
            ? { ...item, status: 'rejected' as const }
            : item
        : item,
    );
    const nextDemands = demands.map((item) =>
      item.id === conversation.demandId
        ? { ...item, status: 'negotiating' as const, acceptedProviderId: proposal.providerId, updatedAt: now }
        : item,
    );
    await saveProposals(nextProposals);
    await saveDemands(nextDemands);
    setProposals(nextProposals);
    setDemands(nextDemands);
  }

  async function confirmAgreement(proposal: Proposal) {
    if (user.id !== conversation.providerId) throw new Error('Somente o prestador pode confirmar o acordo.');
    if (proposal.status !== 'accepted' || !proposal.customerConfirmedAt) throw new Error('O cliente ainda não confirmou a proposta.');
    const now = new Date().toISOString();
    const nextProposals = proposals.map((item) => item.id === proposal.id ? { ...item, providerConfirmedAt: now } : item);
    const nextDemands = demands.map((item) =>
      item.id === conversation.demandId
        ? { ...item, status: 'accepted' as const, acceptedProviderId: proposal.providerId, updatedAt: now }
        : item,
    );
    await saveProposals(nextProposals);
    await saveDemands(nextDemands);
    setProposals(nextProposals);
    setDemands(nextDemands);
  }

  async function sendCounterProposal(proposal: Proposal, amount: number, message?: string) {
    if (proposal.status !== 'pending') throw new Error('Somente propostas pendentes podem receber contraproposta.');
    if (user.id !== conversation.customerId && user.id !== conversation.providerId) throw new Error('Usuário não participa desta negociação.');

    const now = new Date().toISOString();
    const version = Math.max(0, ...proposals.filter((item) => item.demandId === conversation.demandId).map((item) => item.version ?? 1)) + 1;
    const counter: Proposal = {
      id: `pro_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      demandId: conversation.demandId,
      providerId: conversation.providerId,
      amount,
      message,
      status: 'pending',
      version,
      parentProposalId: proposal.id,
      offeredBy: user.id === conversation.customerId ? 'customer' : 'provider',
      createdAt: now,
    };

    const nextProposals = proposals.map((item) => item.id === proposal.id ? { ...item, status: 'superseded' as const } : item);
    nextProposals.unshift(counter);
    const nextDemands = demands.map((item) => item.id === conversation.demandId ? { ...item, status: 'negotiating' as const, updatedAt: now } : item);
    await saveProposals(nextProposals);
    await saveDemands(nextDemands);
    setProposals(nextProposals);
    setDemands(nextDemands);
  }

  async function startService(nextDemand: Demand) {
    if (user.id !== nextDemand.acceptedProviderId || nextDemand.status !== 'accepted') throw new Error('Somente o prestador contratado pode iniciar o serviço.');
    const now = new Date().toISOString();
    const next = demands.map((item) => item.id === nextDemand.id ? { ...item, status: 'in_progress' as const, startedAt: now, updatedAt: now } : item);
    await saveDemands(next);
    setDemands(next);
  }

  async function completeService(nextDemand: Demand) {
    if (user.id !== nextDemand.acceptedProviderId || nextDemand.status !== 'in_progress') throw new Error('Somente o prestador contratado pode concluir o serviço.');
    const now = new Date().toISOString();
    const next = demands.map((item) => item.id === nextDemand.id ? { ...item, status: 'completed' as const, completedAt: now, updatedAt: now } : item);
    await saveDemands(next);
    setDemands(next);
  }

  if (!demand || !currentProposal) return <View style={{ flex: 1, backgroundColor: '#F7F9FC' }} />;

  return (
    <ChatScreen
      conversation={conversation}
      currentUserId={user.id}
      otherUserName={user.id === conversation.customerId ? 'Prestador' : 'Cliente'}
      onBack={onBack}
      onAcceptProposal={acceptProposal}
      onConfirmAgreement={confirmAgreement}
      onCounterProposal={sendCounterProposal}
      onStartService={startService}
      onCompleteService={completeService}
    />
  );
}
