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
  const currentProposal = proposals.filter((item) => item.demandId === conversation.demandId && item.providerId === conversation.providerId).sort((a, b) => a.createdAt.localeCompare(b.createdAt)).at(-1) ?? null;

  async function acceptProposal(proposal: Proposal) {
    if (proposal.status !== 'pending') throw new Error('Esta oferta não está mais disponível para aceite.');
    const offerSide = proposal.offeredBy ?? 'provider';
    const recipientId = offerSide === 'provider' ? conversation.customerId : conversation.providerId;
    if (user.id !== recipientId) throw new Error('Somente quem recebeu a oferta pode aceitá-la.');

    const now = new Date().toISOString();
    const nextProposals = proposals.map((item) => item.demandId === conversation.demandId
      ? item.id === proposal.id
        ? { ...item, status: 'accepted' as const, customerConfirmedAt: now, providerConfirmedAt: now }
        : item.status === 'pending' ? { ...item, status: 'rejected' as const } : item
      : item);
    const nextDemands = demands.map((item) => item.id === conversation.demandId
      ? { ...item, status: 'accepted' as const, acceptedProviderId: proposal.providerId, updatedAt: now }
      : item);

    await saveProposals(nextProposals);
    await saveDemands(nextDemands);
    setProposals(nextProposals);
    setDemands(nextDemands);
  }

  async function confirmAgreement(proposal: Proposal) {
    if (proposal.status !== 'accepted') throw new Error('A oferta ainda não foi aceita.');
    if (user.id !== conversation.customerId && user.id !== conversation.providerId) throw new Error('Usuário não participa desta negociação.');
    const now = new Date().toISOString();
    const nextProposals = proposals.map((item) => {
      if (item.id !== proposal.id) return item;
      if (user.id === conversation.customerId && !item.customerConfirmedAt) return { ...item, customerConfirmedAt: now };
      if (user.id === conversation.providerId && !item.providerConfirmedAt) return { ...item, providerConfirmedAt: now };
      return item;
    });
    const updatedProposal = nextProposals.find((item) => item.id === proposal.id);
    const bothConfirmed = Boolean(updatedProposal?.customerConfirmedAt && updatedProposal?.providerConfirmedAt);
    const nextDemands = demands.map((item) => item.id === conversation.demandId && bothConfirmed
      ? { ...item, status: 'accepted' as const, acceptedProviderId: proposal.providerId, updatedAt: now }
      : item);
    await saveProposals(nextProposals);
    await saveDemands(nextDemands);
    setProposals(nextProposals);
    setDemands(nextDemands);
  }

  async function sendCounterProposal(proposal: Proposal, amount: number, message?: string) {
    if (proposal.status !== 'pending') throw new Error('Somente propostas pendentes podem receber contraproposta.');
    if (user.id !== conversation.customerId && user.id !== conversation.providerId) throw new Error('Usuário não participa desta negociação.');
    const offerSide = proposal.offeredBy ?? 'provider';
    const offerAuthorId = offerSide === 'provider' ? conversation.providerId : conversation.customerId;
    if (user.id === offerAuthorId) throw new Error('Quem enviou a oferta atual deve aguardar a resposta do outro lado.');

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

  async function updateServiceStage(nextDemand: Demand, action: 'en_route' | 'arrived' | 'start' | 'request_confirmation' | 'confirm_completion') {
    const now = new Date().toISOString();
    const isProvider = user.id === nextDemand.acceptedProviderId;
    const isCustomer = user.id === conversation.customerId;

    if (action === 'en_route') {
      if (!isProvider || nextDemand.status !== 'accepted') throw new Error('Somente o prestador contratado pode informar o deslocamento.');
      const next = demands.map((item) => item.id === nextDemand.id ? { ...item, status: 'provider_en_route' as const, enRouteAt: now, updatedAt: now } : item);
      await saveDemands(next); setDemands(next); return;
    }

    if (action === 'arrived') {
      if (!isProvider || nextDemand.status !== 'provider_en_route') throw new Error('O prestador deve estar a caminho para registrar a chegada.');
      const next = demands.map((item) => item.id === nextDemand.id ? { ...item, status: 'provider_arrived' as const, arrivedAt: now, updatedAt: now } : item);
      await saveDemands(next); setDemands(next); return;
    }

    if (action === 'start') {
      if (!isProvider || nextDemand.status !== 'provider_arrived') throw new Error('Registre a chegada antes de iniciar o serviço.');
      const next = demands.map((item) => item.id === nextDemand.id ? { ...item, status: 'in_progress' as const, startedAt: now, updatedAt: now } : item);
      await saveDemands(next); setDemands(next); return;
    }

    if (action === 'request_confirmation') {
      if (!isProvider || nextDemand.status !== 'in_progress') throw new Error('Somente o prestador pode solicitar a confirmação da conclusão.');
      const next = demands.map((item) => item.id === nextDemand.id ? { ...item, status: 'awaiting_customer_confirmation' as const, completionRequestedAt: now, updatedAt: now } : item);
      await saveDemands(next); setDemands(next); return;
    }

    if (action === 'confirm_completion') {
      if (!isCustomer || nextDemand.status !== 'awaiting_customer_confirmation') throw new Error('Somente o cliente pode confirmar a conclusão.');
      const next = demands.map((item) => item.id === nextDemand.id ? { ...item, status: 'completed' as const, customerConfirmedCompletionAt: now, completedAt: now, updatedAt: now } : item);
      await saveDemands(next); setDemands(next); return;
    }
  }

  if (!demand) return <View style={{ flex: 1, backgroundColor: '#F7F9FC' }} />;

  return <ChatScreen
    conversation={conversation}
    currentUserId={user.id}
    otherUserName={user.id === conversation.customerId ? 'Prestador' : 'Cliente'}
    onBack={onBack}
    onAcceptProposal={acceptProposal}
    onConfirmAgreement={confirmAgreement}
    onCounterProposal={sendCounterProposal}
    onServiceAction={updateServiceStage}
  />;
}
