import { useEffect, useMemo, useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { Conversation, Demand, Proposal, User } from '@rubli/shared';
import { getConversations, getDemands, getMessages, getProposals } from '../storage/localStore';
import { ChatScreen } from './ChatScreen';

const BRAND = '#081B33';
const ACCENT = '#F28C28';

interface Props {
  user: User;
  profiles: User[];
  visible: boolean;
  onClose: () => void;
}

function formatTime(value?: string) {
  if (!value) return '';
  return new Date(value).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

export function MessagesCenterScreen({ user, profiles, visible, onClose }: Props) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [demands, setDemands] = useState<Demand[]>([]);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [messages, setMessages] = useState<Array<{ id: string; conversationId: string; senderId: string; text: string; createdAt: string }>>([]);
  const [activeConversation, setActiveConversation] = useState<Conversation | null>(null);

  async function reload() {
    const [nextConversations, nextDemands, nextProposals, nextMessages] = await Promise.all([
      getConversations(), getDemands(), getProposals(), getMessages(),
    ]);
    setConversations(nextConversations);
    setDemands(nextDemands);
    setProposals(nextProposals);
    setMessages(nextMessages);
  }

  useEffect(() => {
    if (visible) reload().catch(() => undefined);
  }, [visible, user.id]);

  const items = useMemo(() => conversations
    .filter((conversation) => conversation.customerId === user.id || conversation.providerId === user.id)
    .map((conversation) => {
      const demand = demands.find((item) => item.id === conversation.demandId);
      const proposal = proposals
        .filter((item) => item.demandId === conversation.demandId && item.providerId === conversation.providerId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
      const otherId = conversation.customerId === user.id ? conversation.providerId : conversation.customerId;
      const other = profiles.find((item) => item.id === otherId);
      const convoMessages = messages
        .filter((item) => item.conversationId === conversation.id)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      const last = convoMessages[convoMessages.length - 1];
      return { conversation, demand, proposal, other, last };
    })
    .sort((a, b) => (b.last?.createdAt ?? b.conversation.updatedAt).localeCompare(a.last?.createdAt ?? a.conversation.updatedAt)),
    [conversations, demands, proposals, messages, profiles, user.id],
  );

  if (!visible) return null;
  if (activeConversation) {
    return (
      <Modal visible animationType="slide" onRequestClose={() => setActiveConversation(null)}>
        <ChatScreen
          conversation={activeConversation}
          currentUserId={user.id}
          otherUserName={user.id === activeConversation.customerId ? profiles.find((item) => item.id === activeConversation.providerId)?.name : profiles.find((item) => item.id === activeConversation.customerId)?.name}
          onBack={() => { setActiveConversation(null); reload().catch(() => undefined); }}
        />
      </Modal>
    );
  }

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={styles.root}>
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text style={styles.title}>Mensagens</Text>
            <Text style={styles.subtitle}>Conversas e negociações</Text>
          </View>
          <TouchableOpacity style={styles.close} onPress={onClose}><Text style={styles.closeText}>Fechar</Text></TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={styles.content}>
          {items.length === 0 ? (
            <View style={styles.emptyCard}><Text style={styles.emptyTitle}>Nenhuma conversa</Text><Text style={styles.emptyText}>As conversas aparecerão aqui quando houver uma negociação.</Text></View>
          ) : items.map(({ conversation, demand, proposal, other, last }) => (
            <TouchableOpacity key={conversation.id} style={styles.card} onPress={() => setActiveConversation(conversation)}>
              <View style={styles.top}>
                <View style={styles.personRow}>
                  <View style={styles.avatar}><Text style={styles.avatarText}>{other?.name?.[0]?.toUpperCase() ?? '?'}</Text></View>
                  <View style={styles.personInfo}><Text style={styles.personName}>{other?.name ?? 'Usuário'}</Text><Text style={styles.demand}>{demand?.title ?? 'Demanda'}</Text></View>
                </View>
                <Text style={styles.time}>{formatTime(last?.createdAt ?? conversation.updatedAt)}</Text>
              </View>
              <View style={styles.metaRow}><Text style={styles.status}>{demand?.status === 'in_progress' ? 'Serviço em andamento' : demand?.status === 'completed' ? 'Concluído' : proposal?.status === 'accepted' ? 'Acordo confirmado' : 'Negociação'}</Text>{proposal && <Text style={styles.amount}>R$ {proposal.amount.toFixed(2).replace('.', ',')}</Text>}</View>
              <Text style={styles.preview} numberOfLines={2}>{last?.text ?? proposal?.message ?? 'Abra a conversa para continuar.'}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({ root:{flex:1,backgroundColor:'#F7F9FC'}, header:{backgroundColor:'#FFF',padding:16,borderBottomWidth:1,borderBottomColor:'#E5EAF0',flexDirection:'row',alignItems:'center'}, headerText:{flex:1}, title:{color:BRAND,fontSize:25,fontWeight:'900'}, subtitle:{color:'#718096',marginTop:3}, close:{backgroundColor:BRAND,borderRadius:12,paddingHorizontal:13,paddingVertical:9}, closeText:{color:'#FFF',fontWeight:'800'}, content:{padding:16,paddingBottom:36}, card:{backgroundColor:'#FFF',borderWidth:1,borderColor:'#E2E8F0',borderRadius:18,padding:15,marginBottom:11}, top:{flexDirection:'row',justifyContent:'space-between',alignItems:'flex-start'}, personRow:{flexDirection:'row',alignItems:'center',flex:1}, avatar:{width:42,height:42,borderRadius:21,backgroundColor:BRAND,alignItems:'center',justifyContent:'center',marginRight:10}, avatarText:{color:'#FFF',fontWeight:'900',fontSize:17}, personInfo:{flex:1}, personName:{color:BRAND,fontWeight:'900',fontSize:16}, demand:{color:'#718096',fontSize:12,marginTop:2}, time:{color:'#8A96A6',fontSize:11}, metaRow:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginTop:12}, status:{color:ACCENT,fontWeight:'900',fontSize:12}, amount:{color:BRAND,fontWeight:'900'}, preview:{color:'#526174',lineHeight:19,marginTop:7}, emptyCard:{backgroundColor:'#FFF',borderRadius:18,padding:24,alignItems:'center',marginTop:12}, emptyTitle:{color:BRAND,fontSize:18,fontWeight:'900'}, emptyText:{color:'#718096',textAlign:'center',marginTop:7,lineHeight:19} });
