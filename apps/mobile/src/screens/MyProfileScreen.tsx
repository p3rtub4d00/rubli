import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { Alert, Image, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import type { User } from '@rubli/shared';
import { updateStoredUser } from '../profile/profileStore';

const BRAND = '#081B33';
const ACCENT = '#F28C28';
const SERVICE_OPTIONS = ['Elétrica', 'Hidráulica', 'Chaveiro', 'Limpeza', 'Montagem', 'Pintura', 'Construção', 'Outros', 'Compras', 'Entrega', 'Frete'];
const RADIUS_OPTIONS = [5, 10, 20, 50, 100] as const;

interface Props { user: User; onSaved: (user: User) => void; onClose: () => void; }

export function MyProfileScreen({ user, onSaved, onClose }: Props) {
  const [name, setName] = useState(user.name);
  const [bio, setBio] = useState(user.bio ?? '');
  const [city, setCity] = useState(user.city ?? '');
  const [radius, setRadius] = useState(user.serviceRadiusKm ?? 10);
  const [categories, setCategories] = useState<string[]>(user.serviceCategories ?? []);
  const [avatarUri, setAvatarUri] = useState(user.avatarUri);
  const [photos, setPhotos] = useState<string[]>(user.profilePhotos ?? []);

  async function pickAvatar() {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, quality: 0.8 });
    if (!result.canceled) setAvatarUri(result.assets[0]?.uri);
  }

  async function pickPhotos() {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, selectionLimit: 8, quality: 0.8 });
    if (!result.canceled) setPhotos((current) => [...current, ...result.assets.map((asset) => asset.uri).filter((uri) => !current.includes(uri))].slice(0, 8));
  }

  async function save() {
    if (name.trim().length < 3) return Alert.alert('Nome inválido', 'Informe seu nome completo.');
    const nextUser: User = { ...user, name: name.trim(), bio: bio.trim() || undefined, city: city.trim() || undefined, serviceRadiusKm: user.role === 'provider' ? radius : undefined, serviceCategories: user.role === 'provider' ? categories : undefined, avatarUri, profilePhotos: photos };
    await updateStoredUser(nextUser);
    onSaved(nextUser);
    Alert.alert('Perfil atualizado', 'As informações foram salvas neste aparelho.');
  }

  return <ScrollView contentContainerStyle={styles.content}>
    <TouchableOpacity onPress={onClose}><Text style={styles.back}>‹ Voltar</Text></TouchableOpacity>
    <Text style={styles.title}>Meu perfil</Text>
    <TouchableOpacity style={styles.avatarWrap} onPress={pickAvatar}>{avatarUri ? <Image source={{ uri: avatarUri }} style={styles.avatar} /> : <View style={styles.avatarPlaceholder}><Text style={styles.avatarLetter}>{name[0]?.toUpperCase() ?? '?'}</Text></View>}<Text style={styles.photoHint}>Alterar foto</Text></TouchableOpacity>
    <Text style={styles.label}>Nome completo</Text><TextInput value={name} onChangeText={setName} style={styles.input} />
    <Text style={styles.label}>Cidade</Text><TextInput value={city} onChangeText={setCity} placeholder="Porto Velho" style={styles.input} />
    <Text style={styles.label}>Sobre você</Text><TextInput value={bio} onChangeText={setBio} placeholder="Conte um pouco sobre você e seu trabalho" multiline style={[styles.input, styles.multiline]} />
    {user.role === 'provider' && <>
      <Text style={styles.label}>Áreas de atuação</Text><View style={styles.chips}>{SERVICE_OPTIONS.map((item) => <TouchableOpacity key={item} onPress={() => setCategories((current) => current.includes(item) ? current.filter((value) => value !== item) : [...current, item])} style={[styles.chip, categories.includes(item) && styles.chipActive]}><Text style={[styles.chipText, categories.includes(item) && styles.chipTextActive]}>{item}</Text></TouchableOpacity>)}</View>
      <Text style={styles.label}>Raio de atendimento</Text><View style={styles.chips}>{RADIUS_OPTIONS.map((value) => <TouchableOpacity key={value} onPress={() => setRadius(value)} style={[styles.chip, radius === value && styles.chipActive]}><Text style={[styles.chipText, radius === value && styles.chipTextActive]}>{value} km</Text></TouchableOpacity>)}</View>
      <Text style={styles.label}>Fotos dos seus trabalhos</Text>
      <View style={styles.photoGrid}>{photos.map((uri) => <Image key={uri} source={{ uri }} style={styles.photo} />)}<TouchableOpacity onPress={pickPhotos} style={styles.addPhoto}><Text style={styles.addPhotoText}>+ Foto</Text></TouchableOpacity></View>
    </>}
    <View style={styles.notice}><Text style={styles.noticeText}>Essas fotos ficam locais nesta fase. No backend futuro, serão enviadas para armazenamento em nuvem.</Text></View>
    <TouchableOpacity style={styles.primary} onPress={() => save().catch(() => Alert.alert('Erro', 'Não foi possível salvar o perfil.'))}><Text style={styles.primaryText}>Salvar perfil</Text></TouchableOpacity>
  </ScrollView>;
}

const styles = StyleSheet.create({ content: { padding: 20, paddingBottom: 40 }, back: { color: ACCENT, fontWeight: '900', marginBottom: 14 }, title: { color: BRAND, fontSize: 28, fontWeight: '900', marginBottom: 18 }, avatarWrap: { alignItems: 'center', marginBottom: 18 }, avatar: { width: 104, height: 104, borderRadius: 52 }, avatarPlaceholder: { width: 104, height: 104, borderRadius: 52, backgroundColor: BRAND, alignItems: 'center', justifyContent: 'center' }, avatarLetter: { color: '#FFF', fontSize: 38, fontWeight: '900' }, photoHint: { color: ACCENT, fontWeight: '800', marginTop: 7 }, label: { color: BRAND, fontWeight: '900', marginBottom: 7, marginTop: 9 }, input: { backgroundColor: '#FFF', borderWidth: 1, borderColor: '#D8E0EA', borderRadius: 14, padding: 14, fontSize: 16 }, multiline: { minHeight: 100, textAlignVertical: 'top' }, chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 }, chip: { borderWidth: 1, borderColor: '#CBD5E1', borderRadius: 99, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: '#FFF' }, chipActive: { backgroundColor: BRAND, borderColor: BRAND }, chipText: { color: '#566579', fontWeight: '700' }, chipTextActive: { color: '#FFF' }, photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 }, photo: { width: 86, height: 86, borderRadius: 12 }, addPhoto: { width: 86, height: 86, borderRadius: 12, borderWidth: 1, borderColor: BRAND, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' }, addPhotoText: { color: BRAND, fontWeight: '900' }, notice: { backgroundColor: '#EAF1F8', borderRadius: 14, padding: 13, marginTop: 8, marginBottom: 16 }, noticeText: { color: '#566579', lineHeight: 19 }, primary: { backgroundColor: ACCENT, borderRadius: 14, padding: 16, alignItems: 'center' }, primaryText: { color: '#FFF', fontSize: 16, fontWeight: '900' }, });
