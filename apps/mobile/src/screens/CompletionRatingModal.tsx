import { useEffect, useState } from 'react';
import { Alert, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { Demand, Rating, User } from '@rubli/shared';
import { apiCreateRating } from '../api/client';
import { FormField } from '../shared/components/FormField';

interface Props {
  visible: boolean;
  demand: Demand | null;
  user: Pick<User, 'id' | 'role'>;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
}

export function CompletionRatingModal({ visible, demand, user, onClose, onSaved }: Props) {
  const [stars, setStars] = useState<Rating['stars']>(5);
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);
  const isCustomer = demand?.requesterId === user.id;
  const targetLabel = isCustomer ? 'prestador' : 'cliente';

  useEffect(() => {
    if (!visible) return;
    setStars(5);
    setComment('');
  }, [visible, demand?.id]);

  async function submit() {
    if (!demand || saving) return;
    setSaving(true);
    try {
      await apiCreateRating({ demandId: demand.id, stars, comment: comment.trim() || undefined });
      await onSaved();
      onClose();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Não foi possível enviar a avaliação.';
      Alert.alert('Avaliação não enviada', message);
    } finally {
      setSaving(false);
    }
  }

  if (!demand) return null;
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
    <View style={styles.backdrop}>
      <View style={styles.card}>
        <Text style={styles.eyebrow}>SERVIÇO CONCLUÍDO</Text>
        <Text style={styles.title}>Como foi sua experiência?</Text>
        <Text style={styles.text}>Avalie o {targetLabel} e deixe um comentário para ajudar a comunidade Rubli.</Text>
        <View style={styles.stars}>{([1, 2, 3, 4, 5] as const).map((value) => <TouchableOpacity key={value} onPress={() => setStars(value)} accessibilityLabel={`${value} estrela${value > 1 ? 's' : ''}`}><Text style={[styles.star, value <= stars && styles.starSelected]}>★</Text></TouchableOpacity>)}</View>
        <FormField label="Comentário" optional value={comment} onChangeText={setComment} placeholder="Conte como foi o serviço" multiline maxLength={1000} />
        <TouchableOpacity style={styles.primary} onPress={() => submit().catch(() => undefined)} disabled={saving}><Text style={styles.primaryText}>{saving ? 'Enviando...' : 'Enviar avaliação'}</Text></TouchableOpacity>
        <TouchableOpacity style={styles.later} onPress={onClose} disabled={saving}><Text style={styles.laterText}>Avaliar depois</Text></TouchableOpacity>
      </View>
    </View>
  </Modal>;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(8, 27, 51, 0.46)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  card: { width: '100%', maxWidth: 430, backgroundColor: '#FFF', borderRadius: 22, padding: 22 },
  eyebrow: { color: '#0B66FF', fontWeight: '900', fontSize: 11, letterSpacing: .7, textAlign: 'center' },
  title: { color: '#0B3B82', fontWeight: '900', fontSize: 23, textAlign: 'center', marginTop: 7 },
  text: { color: '#607089', lineHeight: 20, textAlign: 'center', marginTop: 8 },
  stars: { flexDirection: 'row', justifyContent: 'center', gap: 5, marginVertical: 19 },
  star: { color: '#D8E0EA', fontSize: 38 },
  starSelected: { color: '#FFB300' },
  comment: { minHeight: 100, borderWidth: 1, borderColor: '#D8E3F0', borderRadius: 14, padding: 13, textAlignVertical: 'top', color: '#26384D' },
  primary: { backgroundColor: '#0B66FF', borderRadius: 14, paddingVertical: 15, alignItems: 'center', marginTop: 14 },
  primaryText: { color: '#FFF', fontWeight: '900' },
  later: { alignItems: 'center', paddingTop: 15, paddingBottom: 2 },
  laterText: { color: '#607089', fontWeight: '800' },
});
