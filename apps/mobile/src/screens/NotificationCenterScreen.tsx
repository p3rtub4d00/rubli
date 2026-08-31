import { useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { Demand, Proposal, User } from '@rubli/shared';
import { getDemands, getMessages, getProposals } from '../storage/localStore';

const BRAND = '#081B33';
const ACCENT = '#F28C28';
const READ_KEY = '@rubli/read_notifications';

type Notice = { id: string; title: string; body: string; createdAt: string };

interface Props { user: User; visible: boolean; onClose: () => void; }

export function NotificationCenterScreen({ user, visible, onClose }: Props) {
  const [readIds, setReadIds] = useState<string[]>([]);
  const [notices, setNotices] = useState<Notice[]>([]);

  async function reload() {
    const [demands, proposals, messages, rawRead] = await Promise.all([
      getDemands(), getProposals(), getMessages(), AsyncStorage.getItem(READ_KEY),
    ]);
    let parsedRead: string[] = [];
    try { if (rawRead) parsedRead = JSON.parse(rawRead) as string[]; } catch { parsedRead = []; }
    const result: Notice[] = [];
    const myDemandIds = new Set(demands.filter((item) => item.requesterId === user.id).map((item) => item.id));

    proposals.filter((item) => myDemandIds.has(item.demandId) && item.status === 'pending').forEach((item: Proposal) => {
      result.push({ id: `proposal:${item.id}`, title: 'Nova proposta', body: `Você recebeu uma proposta de R$ ${item.amount.toFixed(2).replace('.', ',')}.`, createdAt: item.createdAt });
    });
    proposals.filter((item) => item.providerId === user.id && item.status === 'accepted').forEach((item) => {
      result.push({ id: `accepted:${item.id}`, title: 'Proposta aceita', body: 'O cliente aceitou sua proposta e a negociação continua no chat.', createdAt: item.customerConfirmedAt ?? item.createdAt });
    });
    messages.filter((item) => item.senderId !== user.id).forEach((item) => {
      result.push({ id: `message:${item.id}`, title: 'Nova mensagem', body: item.text, createdAt: item.createdAt });
    });
    demands.filter((item: Demand) => item.requesterId === user.id && item.status === 'completed').forEach((item) => {
      result.push({ id: `completed:${item.id}`, title: 'Serviço concluído', body: `O chamado “${item.title}” foi concluído. A avaliação está disponível no histórico.`, createdAt: item.completedAt ?? item.updatedAt });
    });
    setReadIds(parsedRead);
    setNotices(result.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 50));
  }

  useEffect(() => { if (visible) reload().catch(() => undefined); }, [visible, user.id]);

  const unread = useMemo(() => notices.filter((item) => !readIds.includes(item.id)).length, [notices, readIds]);

  async function markAllRead() {
    const ids = notices.map((item) => item.id);
    const next = Array.from(new Set([...readIds, ...ids]));
    await AsyncStorage.setItem(READ_KEY, JSON.stringify(next));
    setReadIds(next);
  }

  if (!visible) return null;
  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={styles.root}>
        <View style={styles.header}>
          <View style={styles.headerText}><Text style={styles.title}>Notificações</Text><Text style={styles.subtitle}>{unread} não lida(s)</Text></View>
          <TouchableOpacity style={styles.close} onPress={onClose}><Text style={styles.closeText}>Fechar</Text></TouchableOpacity>
        </View>
        <View style={styles.toolbar}><TouchableOpacity onPress={() => markAllRead().catch(() => undefined)}><Text style={styles.markRead}>Marcar todas como lidas</Text></TouchableOpacity></View>
        <ScrollView contentContainerStyle={styles.content}>
          {notices.length === 0 ? <View style={styles.empty}><Text style={styles.emptyTitle}>Tudo tranquilo</Text><Text style={styles.emptyText}>Novos eventos do Rubli aparecerão aqui.</Text></View> : notices.map((item) => {
            const isUnread = !readIds.includes(item.id);
            return <View key={item.id} style={[styles.notice, isUnread && styles.unread]}><View style={styles.dotRow}>{isUnread && <View style={styles.dot} />}<Text style={styles.noticeTitle}>{item.title}</Text><Text style={styles.time}>{new Date(item.createdAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</Text></View><Text style={styles.body}>{item.body}</Text></View>;
          })}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({ root:{flex:1,backgroundColor:'#F7F9FC'},header:{backgroundColor:'#FFF',padding:16,borderBottomWidth:1,borderBottomColor:'#E5EAF0',flexDirection:'row',alignItems:'center'},headerText:{flex:1},title:{color:BRAND,fontSize:25,fontWeight:'900'},subtitle:{color:'#718096',marginTop:3},close:{backgroundColor:BRAND,borderRadius:12,paddingHorizontal:13,paddingVertical:9},closeText:{color:'#FFF',fontWeight:'800'},toolbar:{backgroundColor:'#FFF',paddingHorizontal:16,paddingVertical:10,borderBottomWidth:1,borderBottomColor:'#EEF2F6'},markRead:{color:ACCENT,fontWeight:'900'},content:{padding:16,paddingBottom:40},notice:{backgroundColor:'#FFF',borderWidth:1,borderColor:'#E2E8F0',borderRadius:16,padding:15,marginBottom:10},unread:{borderColor:'#F1C28F'},dotRow:{flexDirection:'row',alignItems:'center'},dot:{width:8,height:8,borderRadius:4,backgroundColor:ACCENT,marginRight:7},noticeTitle:{color:BRAND,fontWeight:'900',fontSize:15,flex:1},time:{color:'#8A96A6',fontSize:10},body:{color:'#526174',lineHeight:19,marginTop:7},empty:{backgroundColor:'#FFF',borderRadius:18,padding:24,alignItems:'center',marginTop:12},emptyTitle:{color:BRAND,fontSize:18,fontWeight:'900'},emptyText:{color:'#718096',textAlign:'center',marginTop:7,lineHeight:19} });
