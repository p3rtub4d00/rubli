import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import type { User, UserRole } from '@rubli/shared';
import { saveUser } from '../storage/localStore';

const BRAND = '#081B33';
const ACCENT = '#F28C28';
const BG = '#F7F9FC';
const RADIUS_OPTIONS = [5, 10, 20, 50, 100] as const;

function newId() {
  return `usr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function normalizePhone(value: string) {
  return value.replace(/\D/g, '');
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

interface AccountSetupScreenProps {
  onCreated: () => void;
}

export function AccountSetupScreen({ onCreated }: AccountSetupScreenProps) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<UserRole>('customer');
  const [radius, setRadius] = useState(10);

  async function createAccount() {
    const cleanName = name.trim();
    const cleanPhone = normalizePhone(phone);
    const cleanEmail = email.trim().toLowerCase();

    if (cleanName.length < 3) {
      Alert.alert('Nome inválido', 'Informe seu nome completo.');
      return;
    }

    if (cleanPhone.length < 10 || cleanPhone.length > 13) {
      Alert.alert('Telefone inválido', 'Informe um telefone celular válido com DDD.');
      return;
    }

    if (!isValidEmail(cleanEmail)) {
      Alert.alert('E-mail inválido', 'Informe um e-mail válido.');
      return;
    }

    const newUser: User = {
      id: newId(),
      name: cleanName,
      phone: cleanPhone,
      email: cleanEmail,
      role,
      serviceRadiusKm: role === 'provider' ? radius : undefined,
      createdAt: new Date().toISOString(),
    };

    await saveUser(newUser);
    onCreated();
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={styles.logo}>Rubli</Text>
          <Text style={styles.tagline}>Quem precisa, encontra quem resolve.</Text>

          <View style={styles.card}>
            <Text style={styles.heading}>Crie sua conta</Text>
            <Text style={styles.description}>
              Nesta fase inicial, seus dados ficam somente neste aparelho. O cadastro online e a verificação da conta serão conectados ao servidor posteriormente.
            </Text>

            <Text style={styles.label}>Nome completo</Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Ex.: João da Silva"
              placeholderTextColor="#8491A3"
              autoCapitalize="words"
              style={styles.input}
            />

            <Text style={styles.label}>Celular</Text>
            <TextInput
              value={phone}
              onChangeText={setPhone}
              placeholder="(69) 99999-9999"
              placeholderTextColor="#8491A3"
              keyboardType="phone-pad"
              style={styles.input}
            />

            <Text style={styles.label}>E-mail</Text>
            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder="voce@email.com"
              placeholderTextColor="#8491A3"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              style={styles.input}
            />

            <Text style={styles.label}>Como você vai usar o Rubli?</Text>
            <View style={styles.rowWrap}>
              <TouchableOpacity onPress={() => setRole('customer')} style={[styles.option, role === 'customer' && styles.optionActive]}>
                <Text style={[styles.optionTitle, role === 'customer' && styles.optionTitleActive]}>Quero contratar</Text>
                <Text style={[styles.optionBody, role === 'customer' && styles.optionBodyActive]}>Publicar demandas e encontrar quem resolve.</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setRole('provider')} style={[styles.option, role === 'provider' && styles.optionActive]}>
                <Text style={[styles.optionTitle, role === 'provider' && styles.optionTitleActive]}>Quero trabalhar</Text>
                <Text style={[styles.optionBody, role === 'provider' && styles.optionBodyActive]}>Receber demandas e enviar propostas.</Text>
              </TouchableOpacity>
            </View>

            {role === 'provider' && (
              <>
                <Text style={styles.label}>Raio inicial de atendimento</Text>
                <View style={styles.rowWrap}>
                  {RADIUS_OPTIONS.map((value) => (
                    <TouchableOpacity key={value} onPress={() => setRadius(value)} style={[styles.pill, radius === value && styles.pillActive]}>
                      <Text style={[styles.pillText, radius === value && styles.pillTextActive]}>{value} km</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            )}

            <Text style={styles.notice}>
              A próxima etapa incluirá confirmação de telefone/e-mail, senha, recuperação de acesso e verificação de identidade do prestador.
            </Text>

            <TouchableOpacity style={styles.primaryButton} onPress={() => createAccount().catch(() => Alert.alert('Erro', 'Não foi possível salvar a conta localmente.'))}>
              <Text style={styles.primaryText}>Criar minha conta</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BG },
  flex: { flex: 1 },
  content: { flexGrow: 1, padding: 20, justifyContent: 'center' },
  logo: { color: BRAND, fontSize: 42, fontWeight: '900', marginBottom: 2 },
  tagline: { color: '#68778C', fontSize: 15, marginBottom: 18 },
  card: { backgroundColor: '#FFF', borderRadius: 22, padding: 20, borderWidth: 1, borderColor: '#E4EAF1' },
  heading: { color: BRAND, fontSize: 28, fontWeight: '900', marginBottom: 8 },
  description: { color: '#67768A', lineHeight: 20, marginBottom: 18 },
  label: { color: BRAND, fontWeight: '800', marginBottom: 7, marginTop: 6 },
  input: { backgroundColor: '#F7F9FC', borderWidth: 1, borderColor: '#D8E0EA', borderRadius: 14, padding: 14, color: '#24354A', fontSize: 16, marginBottom: 8 },
  rowWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  option: { flex: 1, minWidth: 140, borderWidth: 1, borderColor: '#D4DDE8', borderRadius: 16, padding: 14, backgroundColor: '#FFF' },
  optionActive: { backgroundColor: BRAND, borderColor: BRAND },
  optionTitle: { color: BRAND, fontWeight: '900', marginBottom: 5 },
  optionTitleActive: { color: '#FFF' },
  optionBody: { color: '#718096', lineHeight: 18, fontSize: 13 },
  optionBodyActive: { color: '#DDE7F5' },
  pill: { borderWidth: 1, borderColor: '#CBD5E1', borderRadius: 99, paddingHorizontal: 13, paddingVertical: 9, backgroundColor: '#FFF' },
  pillActive: { backgroundColor: BRAND, borderColor: BRAND },
  pillText: { color: '#526174', fontWeight: '700' },
  pillTextActive: { color: '#FFF' },
  notice: { backgroundColor: '#FFF4EA', color: '#6A5844', borderRadius: 13, padding: 12, lineHeight: 18, marginVertical: 8 },
  primaryButton: { backgroundColor: ACCENT, borderRadius: 14, padding: 16, alignItems: 'center', marginTop: 8 },
  primaryText: { color: '#FFF', fontWeight: '900', fontSize: 16 },
});
