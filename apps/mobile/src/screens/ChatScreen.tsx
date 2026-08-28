import { useEffect, useMemo, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import type { ChatMessage, Conversation } from '@rubli/shared';
import { getMessages, saveMessages } from '../storage/localStore';

const BRAND = '#081B33';
const ACCENT = '#F28C28';

interface ChatScreenProps {
  conversation: Conversation;
  currentUserId: string;
  otherUserName?: string;
  onBack: () => void;
}

function newMessageId() {
  return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function ChatScreen({ conversation, currentUserId, otherUserName = 'Usuário', onBack }: ChatScreenProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState('');

  useEffect(() => {
    getMessages().then((items) => {
      setMessages(items.filter((item) => item.conversationId === conversation.id).sort((a, b) => a.createdAt.localeCompare(b.createdAt)));
    });
  }, [conversation.id]);

  const currentConversationMessages = useMemo(
    () => messages.filter((item) => item.conversationId === conversation.id),
    [messages, conversation.id],
  );

  async function sendMessage() {
    const normalized = text.trim();
    if (!normalized) return;

    const message: ChatMessage = {
      id: newMessageId(),
      conversationId: conversation.id,
      senderId: currentUserId,
      text: normalized,
      createdAt: new Date().toISOString(),
    };

    const allMessages = (await getMessages()).concat(message);
    await saveMessages(allMessages);
    setMessages(allMessages);
    setText('');
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backButton}>
          <Text style={styles.backText}>‹</Text>
        </TouchableOpacity>
        <View style={styles.headerText}>
          <Text style={styles.title}>{otherUserName}</Text>
          <Text style={styles.subtitle}>Negociação pelo Rubli</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.messages} keyboardShouldPersistTaps="handled">
        <View style={styles.notice}>
          <Text style={styles.noticeTitle}>Conversa vinculada à demanda</Text>
          <Text style={styles.noticeText}>Combine valores e detalhes antes de aceitar a proposta. O pagamento será integrado em uma etapa posterior.</Text>
        </View>

        {currentConversationMessages.length === 0 ? (
          <Text style={styles.empty}>Nenhuma mensagem ainda. Comece a conversa.</Text>
        ) : currentConversationMessages.map((message) => {
          const mine = message.senderId === currentUserId;
          return (
            <View key={message.id} style={[styles.bubble, mine ? styles.mine : styles.theirs]}>
              <Text style={mine ? styles.mineText : styles.theirsText}>{message.text}</Text>
              <Text style={mine ? styles.mineTime : styles.theirsTime}>{new Date(message.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</Text>
            </View>
          );
        })}
      </ScrollView>

      <View style={styles.composer}>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder="Digite sua mensagem..."
          placeholderTextColor="#7A8798"
          multiline
          maxLength={1000}
          style={styles.input}
        />
        <TouchableOpacity onPress={() => { sendMessage().catch(() => Alert.alert('Erro', 'Não foi possível salvar a mensagem.')); }} style={styles.sendButton}>
          <Text style={styles.sendText}>Enviar</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7F9FC' },
  header: { backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: '#E5EAF0', padding: 14, flexDirection: 'row', alignItems: 'center' },
  backButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  backText: { color: ACCENT, fontSize: 34, lineHeight: 36 },
  headerText: { flex: 1 },
  title: { color: BRAND, fontSize: 18, fontWeight: '800' },
  subtitle: { color: '#738096', marginTop: 2 },
  messages: { padding: 16, paddingBottom: 24 },
  notice: { backgroundColor: '#EAF1F8', borderRadius: 14, padding: 14, marginBottom: 16 },
  noticeTitle: { color: BRAND, fontWeight: '800', marginBottom: 4 },
  noticeText: { color: '#5F6F83', lineHeight: 19 },
  empty: { color: '#718096', textAlign: 'center', marginTop: 28 },
  bubble: { maxWidth: '82%', paddingHorizontal: 13, paddingVertical: 10, borderRadius: 16, marginBottom: 9 },
  mine: { alignSelf: 'flex-end', backgroundColor: BRAND, borderBottomRightRadius: 5 },
  theirs: { alignSelf: 'flex-start', backgroundColor: '#FFF', borderWidth: 1, borderColor: '#E1E7EE', borderBottomLeftRadius: 5 },
  mineText: { color: '#FFF', fontSize: 15, lineHeight: 20 },
  theirsText: { color: '#26364A', fontSize: 15, lineHeight: 20 },
  mineTime: { color: '#D8E3F0', fontSize: 10, marginTop: 4, textAlign: 'right' },
  theirsTime: { color: '#8A96A6', fontSize: 10, marginTop: 4, textAlign: 'right' },
  composer: { backgroundColor: '#FFF', borderTopWidth: 1, borderTopColor: '#E5EAF0', padding: 10, flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  input: { flex: 1, maxHeight: 100, minHeight: 45, backgroundColor: '#F3F6FA', borderRadius: 14, paddingHorizontal: 13, paddingVertical: 11, color: '#26364A' },
  sendButton: { backgroundColor: ACCENT, paddingHorizontal: 15, paddingVertical: 12, borderRadius: 13 },
  sendText: { color: '#FFF', fontWeight: '800' },
});
