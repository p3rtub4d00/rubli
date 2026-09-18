import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { Alert, Image, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import type { DemandType, ProviderVehicle, User } from '@rubli/shared';
import { apiCreateProviderCategory, apiCurrentUser, apiUpdateUserProfile, type RemoteDemandCategory } from '../api/client';
import { updateStoredUser } from '../profile/profileStore';

const BRAND = '#081B33';
const ACCENT = '#F28C28';
const RADIUS_OPTIONS = [5, 10, 20, 50, 100] as const;
const MAX_PROFILE_IMAGE_CHARS = 1_200_000;
const MAX_SERVICE_CATEGORIES = 30;
const CUSTOM_AREA_TYPES: Array<{ type: DemandType; label: string }> = [
  { type: 'service', label: 'Serviço' }, { type: 'purchase', label: 'Compra' }, { type: 'delivery', label: 'Entrega' }, { type: 'freight', label: 'Frete' },
];
const normalizeArea = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').trim().replace(/\s+/g, ' ');
const uniqueAreas = (areas: string[]) => areas.reduce<string[]>((result, area) => result.some((item) => normalizeArea(item) === normalizeArea(area)) ? result : [...result, area.trim()], []);

function portableImageUri(asset: ImagePicker.ImagePickerAsset) {
  if (!asset.base64) return null;
  return `data:${asset.mimeType ?? 'image/jpeg'};base64,${asset.base64}`;
}

function isPortableImageUri(uri?: string) {
  return Boolean(uri && (uri.startsWith('data:image/') || /^https?:\/\//i.test(uri)));
}

interface Props { user: User; availableCategories?: RemoteDemandCategory[]; onSaved: (user: User) => void; onClose: () => void; }

export function MyProfileScreen({ user, availableCategories = [], onSaved, onClose }: Props) {
  const providerType = user.providerType ?? 'services';
  const isServicesProvider = user.role === 'provider' && providerType === 'services';
  const isCourier = user.role === 'provider' && providerType === 'courier';
  const isFreight = user.role === 'provider' && providerType === 'freight';
  const allowedCategoryType: DemandType | undefined = isCourier ? 'delivery' : isFreight ? 'freight' : undefined;
  const [name, setName] = useState(user.name);
  const [bio, setBio] = useState(user.bio ?? '');
  const [city, setCity] = useState(user.city ?? '');
  const [radius, setRadius] = useState(user.serviceRadiusKm ?? 10);
  const [categories, setCategories] = useState<string[]>(user.serviceCategories ?? []);
  const [avatarUri, setAvatarUri] = useState(user.avatarUri);
  const [photos, setPhotos] = useState<string[]>(user.profilePhotos ?? []);
  const [professionalTitle, setProfessionalTitle] = useState(user.professionalTitle ?? '');
  const [businessAddress, setBusinessAddress] = useState(user.businessAddress ?? '');
  const [isAvailable, setIsAvailable] = useState(user.isAvailable !== false);
  const [availabilityBusy, setAvailabilityBusy] = useState(false);
  const [customArea, setCustomArea] = useState('');
  const [customAreaType, setCustomAreaType] = useState<DemandType>('service');
  const [newProviderCategories, setNewProviderCategories] = useState<Array<{ name: string; type: DemandType }>>([]);
  const [vehicleType, setVehicleType] = useState<ProviderVehicle['type'] | ''>(user.providerVehicle?.type ?? '');
  const [vehicleBrand, setVehicleBrand] = useState(user.providerVehicle?.brand ?? '');
  const [vehicleModel, setVehicleModel] = useState(user.providerVehicle?.model ?? '');
  const [vehiclePlate, setVehiclePlate] = useState(user.providerVehicle?.plate ?? '');
  const [loadCapacityKg, setLoadCapacityKg] = useState(user.providerVehicle?.loadCapacityKg ? String(user.providerVehicle.loadCapacityKg) : '');

  function addCustomArea() {
    const name = customArea.trim().replace(/\s+/g, ' ');
    if (name.length < 3) return Alert.alert('Área inválida', 'Informe ao menos 3 caracteres, como “Cuidador” ou “Técnico em informática”.');
    if (categories.some((item) => normalizeArea(item) === normalizeArea(name))) return Alert.alert('Área já adicionada', 'Essa área de atuação já está no seu perfil.');
    if (categories.length >= MAX_SERVICE_CATEGORIES) return Alert.alert('Limite de áreas', `Você pode cadastrar até ${MAX_SERVICE_CATEGORIES} áreas de atuação.`);
    setCategories((current) => [...current, name]);
    setNewProviderCategories((current) => [...current, { name, type: customAreaType }]);
    setCustomArea('');
  }

  async function pickAvatar() {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, quality: 0.35, base64: true });
    if (result.canceled) return;
    const uri = portableImageUri(result.assets[0]);
    if (!uri || uri.length > MAX_PROFILE_IMAGE_CHARS) return Alert.alert('Foto muito grande', 'Escolha uma foto menor para que ela apareça em todos os aparelhos.');
    setAvatarUri(uri);
  }

  async function pickPhotos() {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, selectionLimit: 5, quality: 0.35, base64: true });
    if (result.canceled) return;
    const selected = result.assets.map(portableImageUri).filter((uri): uri is string => Boolean(uri && uri.length <= MAX_PROFILE_IMAGE_CHARS));
    if (selected.length !== result.assets.length) Alert.alert('Algumas fotos não foram adicionadas', 'Escolha fotos menores para que elas possam ser sincronizadas entre aparelhos.');
    setPhotos((current) => [...current.filter(isPortableImageUri), ...selected.filter((uri) => !current.includes(uri))].slice(0, 5));
  }

  async function save() {
    if (name.trim().length < 3) return Alert.alert('Nome inválido', 'Informe seu nome completo.');
    const selectedAreas = uniqueAreas(categories).slice(0, MAX_SERVICE_CATEGORIES);
    if (isServicesProvider) {
      // Cria novas áreas primeiro para que o PATCH do perfil já receba os IDs
      // canônicos do catálogo, sem uma janela em que o matching veja só texto.
      const selectedNewCategories = newProviderCategories.filter((area) => selectedAreas.some((item) => normalizeArea(item) === normalizeArea(area.name)));
      await Promise.all(selectedNewCategories.map((area) => apiCreateProviderCategory(area)));
    }
    const syncedPhotos = photos.filter(isPortableImageUri).slice(0, 5);
    const vehicle = (isCourier || isFreight) ? { type: vehicleType, brand: vehicleBrand.trim() || undefined, model: vehicleModel.trim() || undefined, plate: vehiclePlate.trim() || undefined, loadCapacityKg: loadCapacityKg.trim() ? Number(loadCapacityKg) : undefined } : undefined;
    if ((isCourier || isFreight) && !vehicleType) return Alert.alert('Veículo obrigatório', 'Selecione o tipo de veículo cadastrado.');
    const capacityValue = loadCapacityKg.trim() ? Number(loadCapacityKg) : undefined;
    if (isFreight && (!capacityValue || !Number.isFinite(capacityValue) || capacityValue <= 0)) return Alert.alert('Capacidade obrigatória', 'Informe a capacidade de carga aproximada em kg.');
    const nextUser = await apiUpdateUserProfile(user.id, { name: name.trim(), bio: bio.trim() || undefined, city: city.trim() || undefined, serviceRadiusKm: user.role === 'provider' ? radius : undefined, serviceCategories: user.role === 'provider' ? selectedAreas : undefined, avatarUri: isPortableImageUri(avatarUri) ? avatarUri : '', profilePhotos: isServicesProvider ? syncedPhotos : undefined, professionalTitle: isServicesProvider ? professionalTitle.trim() || undefined : undefined, businessAddress: isServicesProvider && user.taxDocumentType === 'cnpj' ? businessAddress.trim() || undefined : undefined, providerVehicle: vehicle as ProviderVehicle | undefined, isAvailable: user.role === 'provider' ? isAvailable : undefined });
    if (user.role === 'provider') {
      const returnedAreas = uniqueAreas(nextUser.serviceCategories ?? []);
      if (returnedAreas.length !== selectedAreas.length || selectedAreas.some((area) => !returnedAreas.some((saved) => normalizeArea(saved) === normalizeArea(area)))) throw new Error('O servidor não confirmou todas as áreas selecionadas. Nenhuma alteração foi considerada concluída.');
      const confirmedUser = (await apiCurrentUser()).user;
      if (!selectedAreas.every((area) => (confirmedUser.serviceCategories ?? []).some((saved) => normalizeArea(saved) === normalizeArea(area)))) {
        throw new Error('Não foi possível confirmar a gravação das áreas no seu perfil. Tente salvar novamente.');
      }
      await updateStoredUser(confirmedUser);
      onSaved(confirmedUser);
      Alert.alert('Perfil atualizado', 'As áreas de atuação foram salvas e sincronizadas com o servidor.');
      return;
    }
    await updateStoredUser(nextUser);
    onSaved(nextUser);
    Alert.alert('Perfil atualizado', 'As informações foram sincronizadas com o servidor.');
  }

  async function toggleAvailability() {
    if (availabilityBusy) return;
    const nextAvailability = !isAvailable;
    setAvailabilityBusy(true);
    try {
      const nextUser = await apiUpdateUserProfile(user.id, { isAvailable: nextAvailability });
      setIsAvailable(nextUser.isAvailable !== false);
      await updateStoredUser(nextUser);
      onSaved(nextUser);
    } catch {
      Alert.alert('Disponibilidade indisponível', 'Não foi possível atualizar sua disponibilidade agora.');
    } finally {
      setAvailabilityBusy(false);
    }
  }

  return <ScrollView contentContainerStyle={styles.content}>
    <TouchableOpacity onPress={onClose}><Text style={styles.back}>‹ Voltar</Text></TouchableOpacity>
    <Text style={styles.title}>Meu perfil</Text>
    <TouchableOpacity style={styles.avatarWrap} onPress={pickAvatar}>{avatarUri ? <Image source={{ uri: avatarUri }} style={styles.avatar} /> : <View style={styles.avatarPlaceholder}><Text style={styles.avatarLetter}>{name[0]?.toUpperCase() ?? '?'}</Text></View>}<Text style={styles.photoHint}>Alterar foto</Text></TouchableOpacity>
    <Text style={styles.label}>Nome completo</Text><TextInput value={name} onChangeText={setName} style={styles.input} />
    <Text style={styles.label}>Cidade</Text><TextInput value={city} onChangeText={setCity} placeholder="Porto Velho" style={styles.input} />
    <Text style={styles.label}>Sobre você</Text><TextInput value={bio} onChangeText={setBio} placeholder="Conte um pouco sobre você e seu trabalho" multiline style={[styles.input, styles.multiline]} />
    {user.role === 'provider' && <>
      <View style={[styles.availabilityCard, isAvailable ? styles.available : styles.unavailable]}><View style={styles.availabilityText}><Text style={styles.availabilityTitle}>Disponível para novos serviços</Text><Text style={styles.availabilityHint}>{isAvailable ? 'Você recebe oportunidades novas e avisos de matching.' : 'Você não recebe oportunidades novas nem push de matching. Serviços contratados continuam normalmente.'}</Text></View><TouchableOpacity style={[styles.availabilityToggle, isAvailable ? styles.toggleOn : styles.toggleOff]} onPress={() => toggleAvailability().catch(() => undefined)} disabled={availabilityBusy}><Text style={styles.availabilityToggleText}>{availabilityBusy ? '...' : isAvailable ? 'ON' : 'OFF'}</Text></TouchableOpacity></View>
      <View style={{ backgroundColor: '#EAF1F8', borderRadius: 14, padding: 13, marginBottom: 8 }}><Text style={{ color: BRAND, fontWeight: '900', fontSize: 11 }}>MODALIDADE PROFISSIONAL</Text><Text style={{ color: BRAND, fontWeight: '900', fontSize: 16, marginTop: 4 }}>{providerType === 'courier' ? 'Entregas / Motoboy' : providerType === 'freight' ? 'Fretes e mudanças' : 'Prestador de serviços'}</Text><Text style={{ color: '#5E7085', fontSize: 12, lineHeight: 17, marginTop: 5 }}>Para adicionar outra modalidade profissional, utilize a opção específica quando ela estiver disponível.</Text></View>
      {isServicesProvider && <>
      <Text style={styles.label}>Profissão ou especialidade</Text><TextInput value={professionalTitle} onChangeText={setProfessionalTitle} placeholder="Ex.: Eletricista residencial" style={styles.input} />
      {user.taxDocumentType === 'cnpj' && <><Text style={styles.label}>Endereço comercial (opcional)</Text><TextInput value={businessAddress} onChangeText={setBusinessAddress} placeholder="Ex.: Rua, número, bairro e cidade" multiline style={[styles.input, styles.address]} /></>}
      <Text style={styles.label}>Fotos dos seus trabalhos</Text>
      <View style={styles.photoGrid}>{photos.map((uri) => <Image key={uri} source={{ uri }} style={styles.photo} />)}<TouchableOpacity onPress={pickPhotos} style={styles.addPhoto}><Text style={styles.addPhotoText}>+ Foto</Text></TouchableOpacity></View>
      </>}
      <Text style={styles.label}>{isServicesProvider ? 'Áreas de atuação' : isCourier ? 'Tipos de entrega aceitos' : 'Tipos de frete aceitos'}</Text><View style={styles.chips}>{[...availableCategories.filter((item) => item.active && (!allowedCategoryType || item.type === allowedCategoryType)).map((item) => item.name), ...categories.filter((item) => !availableCategories.some((category) => normalizeArea(category.name) === normalizeArea(item)))].map((item) => <TouchableOpacity key={item} onPress={() => setCategories((current) => current.some((value) => normalizeArea(value) === normalizeArea(item)) ? current.filter((value) => normalizeArea(value) !== normalizeArea(item)) : [...current, item])} style={[styles.chip, categories.some((value) => normalizeArea(value) === normalizeArea(item)) && styles.chipActive]}><Text style={[styles.chipText, categories.some((value) => normalizeArea(value) === normalizeArea(item)) && styles.chipTextActive]}>{item}</Text></TouchableOpacity>)}</View>
      {isServicesProvider && <><Text style={styles.customAreaHint}>Não encontrou sua atuação? Adicione uma nova para ela aparecer também para clientes.</Text><TextInput value={customArea} onChangeText={setCustomArea} placeholder="Ex.: Cuidador ou Técnico em informática" style={styles.input} /><View style={styles.customTypeRow}>{CUSTOM_AREA_TYPES.map((item) => <TouchableOpacity key={item.type} onPress={() => setCustomAreaType(item.type)} style={[styles.customType, customAreaType === item.type && styles.customTypeActive]}><Text style={[styles.customTypeText, customAreaType === item.type && styles.customTypeTextActive]}>{item.label}</Text></TouchableOpacity>)}</View><TouchableOpacity style={styles.addAreaButton} onPress={addCustomArea}><Text style={styles.addAreaButtonText}>+ Adicionar área de atuação</Text></TouchableOpacity></>}
      <Text style={styles.label}>Raio de atendimento</Text><View style={styles.chips}>{RADIUS_OPTIONS.map((value) => <TouchableOpacity key={value} onPress={() => setRadius(value)} style={[styles.chip, radius === value && styles.chipActive]}><Text style={[styles.chipText, radius === value && styles.chipTextActive]}>{value} km</Text></TouchableOpacity>)}</View>
      {(isCourier || isFreight) && <><Text style={styles.label}>Veículo</Text><View style={styles.chips}>{(isCourier ? [['motorcycle', 'Moto'], ['bicycle', 'Bicicleta'], ['car', 'Carro']] : [['utility', 'Utilitário'], ['pickup', 'Picape'], ['van', 'Van'], ['small_truck', 'Caminhão pequeno'], ['truck', 'Caminhão']]).map(([value, label]) => <TouchableOpacity key={value} onPress={() => setVehicleType(value as ProviderVehicle['type'])} style={[styles.chip, vehicleType === value && styles.chipActive]}><Text style={[styles.chipText, vehicleType === value && styles.chipTextActive]}>{label}</Text></TouchableOpacity>)}</View><Text style={styles.label}>Marca (opcional)</Text><TextInput value={vehicleBrand} onChangeText={setVehicleBrand} placeholder="Ex.: Honda" placeholderTextColor="#718096" style={styles.input} /><Text style={styles.label}>Modelo (opcional)</Text><TextInput value={vehicleModel} onChangeText={setVehicleModel} placeholder="Ex.: CG 160" placeholderTextColor="#718096" style={styles.input} /><Text style={styles.label}>Placa (privada, opcional)</Text><TextInput value={vehiclePlate} onChangeText={setVehiclePlate} placeholder="ABC1D23" autoCapitalize="characters" placeholderTextColor="#718096" style={styles.input} />{isFreight && <><Text style={styles.label}>Capacidade de carga (kg)</Text><TextInput value={loadCapacityKg} onChangeText={setLoadCapacityKg} placeholder="Ex.: 1500" keyboardType="numeric" placeholderTextColor="#718096" style={styles.input} /></>}</>}
    </>}
    <View style={styles.notice}><Text style={styles.noticeText}>As informações são sincronizadas com o servidor. Para fotos aparecerem em todos os aparelhos, a próxima etapa será o armazenamento em nuvem.</Text></View>
    <TouchableOpacity style={styles.primary} onPress={() => save().catch(() => Alert.alert('Erro', 'Não foi possível salvar o perfil.'))}><Text style={styles.primaryText}>Salvar perfil</Text></TouchableOpacity>
  </ScrollView>;
}

const styles = StyleSheet.create({ content: { padding: 20, paddingBottom: 40 }, back: { color: ACCENT, fontWeight: '900', marginBottom: 14 }, title: { color: BRAND, fontSize: 28, fontWeight: '900', marginBottom: 18 }, avatarWrap: { alignItems: 'center', marginBottom: 18 }, avatar: { width: 104, height: 104, borderRadius: 52 }, avatarPlaceholder: { width: 104, height: 104, borderRadius: 52, backgroundColor: BRAND, alignItems: 'center', justifyContent: 'center' }, avatarLetter: { color: '#FFF', fontSize: 38, fontWeight: '900' }, photoHint: { color: ACCENT, fontWeight: '800', marginTop: 7 }, availabilityCard: { borderRadius: 14, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 6 }, available: { backgroundColor: '#EAF7EF', borderWidth: 1, borderColor: '#BBDCC5' }, unavailable: { backgroundColor: '#F5F7FA', borderWidth: 1, borderColor: '#D8E0EA' }, availabilityText: { flex: 1 }, availabilityTitle: { color: BRAND, fontWeight: '900' }, availabilityHint: { color: '#5E7085', fontSize: 12, lineHeight: 17, marginTop: 4 }, availabilityToggle: { borderRadius: 99, minWidth: 52, paddingHorizontal: 10, paddingVertical: 9, alignItems: 'center' }, toggleOn: { backgroundColor: '#277A48' }, toggleOff: { backgroundColor: '#68778C' }, availabilityToggleText: { color: '#FFF', fontWeight: '900', fontSize: 12 }, label: { color: BRAND, fontWeight: '900', marginBottom: 7, marginTop: 9 }, input: { backgroundColor: '#FFF', borderWidth: 1, borderColor: '#D8E0EA', borderRadius: 14, padding: 14, fontSize: 16 }, multiline: { minHeight: 100, textAlignVertical: 'top' }, address: { minHeight: 72, textAlignVertical: 'top' }, chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 }, chip: { borderWidth: 1, borderColor: '#CBD5E1', borderRadius: 99, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: '#FFF' }, chipActive: { backgroundColor: BRAND, borderColor: BRAND }, chipText: { color: '#566579', fontWeight: '700' }, chipTextActive: { color: '#FFF' }, customAreaHint: { color: '#5E7085', lineHeight: 18, fontSize: 12, marginBottom: 8 }, customTypeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 8, marginBottom: 8 }, customType: { borderRadius: 99, borderWidth: 1, borderColor: '#CBD5E1', paddingHorizontal: 10, paddingVertical: 7 }, customTypeActive: { borderColor: BRAND, backgroundColor: '#EAF1F8' }, customTypeText: { color: '#566579', fontSize: 12, fontWeight: '800' }, customTypeTextActive: { color: BRAND }, addAreaButton: { borderWidth: 1, borderColor: ACCENT, borderRadius: 12, padding: 12, alignItems: 'center', marginBottom: 8 }, addAreaButtonText: { color: ACCENT, fontWeight: '900' }, photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 }, photo: { width: 86, height: 86, borderRadius: 12 }, addPhoto: { width: 86, height: 86, borderRadius: 12, borderWidth: 1, borderColor: BRAND, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' }, addPhotoText: { color: BRAND, fontWeight: '900' }, notice: { backgroundColor: '#EAF1F8', borderRadius: 14, padding: 13, marginTop: 8, marginBottom: 16 }, noticeText: { color: '#566579', lineHeight: 19 }, primary: { backgroundColor: ACCENT, borderRadius: 14, padding: 16, alignItems: 'center' }, primaryText: { color: '#FFF', fontSize: 16, fontWeight: '900' }, });
