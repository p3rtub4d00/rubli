import { Image, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { Rating, User } from '@rubli/shared';
import type { ProfessionalMetrics } from '../api/client';
import { getUserRatingSummary } from '../profile/profileStore';

const BRAND = '#081B33';
const ACCENT = '#F28C28';

function isPublicImageUri(uri?: string) {
  return Boolean(uri && (uri.startsWith('data:image/') || /^https?:\/\//i.test(uri)));
}

interface Props {
  user: User;
  metrics?: ProfessionalMetrics;
  ratings: Rating[];
  visible: boolean;
  onClose: () => void;
}

export function PublicProfileScreen({ user, metrics, ratings, visible, onClose }: Props) {
  const providerType = user.providerType ?? 'services';
  const providerTypeLabel = providerType === 'courier' ? 'Entregas / Motoboy' : providerType === 'freight' ? 'Fretes e mudanças' : 'Prestador de serviços';
  const vehicleLabel = user.providerVehicle ? `${user.providerVehicle.type === 'motorcycle' ? 'Moto' : user.providerVehicle.type === 'bicycle' ? 'Bicicleta' : user.providerVehicle.type === 'car' ? 'Carro' : user.providerVehicle.type === 'utility' ? 'Utilitário' : user.providerVehicle.type === 'pickup' ? 'Picape' : user.providerVehicle.type === 'van' ? 'Van' : user.providerVehicle.type === 'small_truck' ? 'Caminhão pequeno' : 'Caminhão'}${user.providerVehicle.brand ? ` · ${user.providerVehicle.brand}` : ''}${user.providerVehicle.model ? ` ${user.providerVehicle.model}` : ''}` : undefined;
  const summary = getUserRatingSummary(ratings, user.id);
  const photos = (user.profilePhotos ?? []).filter(isPublicImageUri);
  const avatarUri = isPublicImageUri(user.avatarUri) ? user.avatarUri : undefined;
  const memberSince = metrics?.memberSince ? new Date(metrics.memberSince).getFullYear() : undefined;
  const ratingSummary = metrics?.averageRating !== undefined
    ? `★ ${metrics.averageRating.toFixed(1).replace('.', ',')} · ${metrics.ratingsCount} avaliação(ões)`
    : summary.count ? `★ ${summary.average.toFixed(1)} · ${summary.count} avaliação(ões)` : 'Ainda sem avaliações';

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.root}>
        <View style={styles.header}>
          <Text style={styles.title}>Perfil</Text>
          <TouchableOpacity onPress={onClose} style={styles.close}><Text style={styles.closeText}>Fechar</Text></TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.profileHead}>
            {avatarUri ? <Image source={{ uri: avatarUri }} style={styles.avatar} /> : <View style={styles.avatarPlaceholder}><Text style={styles.avatarLetter}>{user.name[0]?.toUpperCase()}</Text></View>}
            <View style={styles.identity}>
              <Text style={styles.name}>{user.name}</Text>
              <Text style={styles.role}>{user.role === 'provider' ? providerTypeLabel : 'Cliente'}{user.city ? ` · ${user.city}` : ''}</Text>
              <Text style={styles.rating}>{ratingSummary}</Text>
            </View>
          </View>

          {user.bio && <View style={styles.section}><Text style={styles.sectionTitle}>Sobre</Text><Text style={styles.text}>{user.bio}</Text></View>}

          {user.role === 'provider' && providerType === 'services' && <View style={styles.section}>
            <Text style={styles.sectionTitle}>Serviços</Text>
            {user.professionalTitle && <Text style={styles.text}>Profissional: {user.professionalTitle}</Text>}
            {user.businessName ? <Text style={styles.meta}>Empresa: {user.businessName}</Text> : <Text style={styles.meta}>Profissional autônomo</Text>}
            {user.taxDocumentType === 'cnpj' && user.taxDocument && <Text style={styles.meta}>CNPJ: {user.taxDocument}</Text>}
            {user.businessAddress && <Text style={styles.meta}>Endereço comercial: {user.businessAddress}</Text>}
            <Text style={styles.meta}>{user.issuesInvoice ? '✓ Emite nota fiscal' : 'Não informa emissão de nota fiscal'}</Text>
            <View style={styles.chips}>{(user.serviceCategories ?? []).length ? (user.serviceCategories ?? []).map((item) => <View key={item} style={styles.chip}><Text style={styles.chipText}>{item}</Text></View>) : <Text style={styles.text}>Categorias ainda não cadastradas.</Text>}</View>
            <Text style={styles.meta}>Atende em até {user.serviceRadiusKm ?? 10} km.</Text>
          </View>}

          {user.role === 'provider' && providerType !== 'services' && <View style={styles.section}>
            <Text style={styles.sectionTitle}>{providerTypeLabel}</Text>
            {vehicleLabel && <Text style={styles.text}>{vehicleLabel} cadastrada</Text>}
            {providerType === 'freight' && user.providerVehicle?.loadCapacityKg && <Text style={styles.meta}>Capacidade aproximada: {user.providerVehicle.loadCapacityKg} kg</Text>}
            <Text style={styles.meta}>Atende em até {user.serviceRadiusKm ?? 10} km.</Text>
          </View>}

          {user.role === 'provider' && metrics && <View style={styles.section}>
            <Text style={styles.sectionTitle}>Métricas profissionais</Text>
            <Text style={styles.metric}>{metrics.completedServices} serviço{metrics.completedServices === 1 ? '' : 's'} concluído{metrics.completedServices === 1 ? '' : 's'}</Text>
            {metrics.completionRate !== undefined && <Text style={styles.metric}>{metrics.completionRate}% de conclusão</Text>}
            {metrics.cancellationRate !== undefined && <Text style={styles.metric}>{metrics.cancellationRate}% de cancelamento</Text>}
            {metrics.averageResponseMinutes !== undefined && <Text style={styles.metric}>Responde em média em {metrics.averageResponseMinutes} min</Text>}
            {memberSince && <Text style={styles.metric}>No Rubli desde {memberSince}</Text>}
          </View>}

          {providerType === 'services' && <View style={styles.section}>
            <Text style={styles.sectionTitle}>Fotos</Text>
            {photos.length === 0 ? <Text style={styles.text}>Nenhuma foto adicionada.</Text> : <View style={styles.photoGrid}>{photos.map((uri) => <Image key={uri} source={{ uri }} style={styles.photo} />)}</View>}
          </View>}

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Avaliações</Text>
            {ratings.filter((item) => item.toUserId === user.id).length === 0 ? <Text style={styles.text}>Este perfil ainda não recebeu avaliações.</Text> : ratings.filter((item) => item.toUserId === user.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((item) => <View key={item.id} style={styles.review}><Text style={styles.stars}>{'★'.repeat(item.stars)}{'☆'.repeat(5 - item.stars)}</Text>{item.comment && <Text style={styles.text}>{item.comment}</Text>}</View>)}
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F7F9FC' }, header: { backgroundColor: '#FFF', padding: 16, borderBottomWidth: 1, borderBottomColor: '#E4EAF1', flexDirection: 'row', alignItems: 'center' }, title: { flex: 1, color: BRAND, fontSize: 24, fontWeight: '900' }, close: { backgroundColor: BRAND, borderRadius: 11, paddingHorizontal: 13, paddingVertical: 9 }, closeText: { color: '#FFF', fontWeight: '800' }, content: { padding: 20, paddingBottom: 40 }, profileHead: { backgroundColor: '#FFF', borderRadius: 18, padding: 18, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#E3E9F0' }, avatar: { width: 76, height: 76, borderRadius: 38 }, avatarPlaceholder: { width: 76, height: 76, borderRadius: 38, backgroundColor: BRAND, alignItems: 'center', justifyContent: 'center' }, avatarLetter: { color: '#FFF', fontSize: 28, fontWeight: '900' }, identity: { flex: 1, marginLeft: 14 }, name: { color: BRAND, fontSize: 23, fontWeight: '900' }, role: { color: '#69788D', marginTop: 4 }, rating: { color: ACCENT, fontWeight: '900', marginTop: 7 }, section: { backgroundColor: '#FFF', borderRadius: 16, padding: 16, marginTop: 14, borderWidth: 1, borderColor: '#E3E9F0' }, sectionTitle: { color: BRAND, fontSize: 17, fontWeight: '900', marginBottom: 8 }, metric: { color: '#44566D', lineHeight: 21, marginTop: 5, fontWeight: '700' }, text: { color: '#44566D', lineHeight: 20 }, chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, chip: { backgroundColor: '#EAF1F8', borderRadius: 99, paddingHorizontal: 12, paddingVertical: 8 }, chipText: { color: BRAND, fontWeight: '800' }, meta: { color: '#6E7C90', marginTop: 10 }, photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, photo: { width: 92, height: 92, borderRadius: 12, backgroundColor: '#E8EDF3' }, review: { borderTopWidth: 1, borderTopColor: '#E9EEF4', paddingTop: 10, marginTop: 10 }, stars: { color: ACCENT, fontSize: 18, marginBottom: 4 },
});
