import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import type { User } from '@rubli/shared';
import App from './App';
import { getUser } from './src/storage/localStore';
import { AccountSetupScreen } from './src/screens/AccountSetupScreen';

const BRAND = '#081B33';

export default function AccountGate() {
  const [loading, setLoading] = useState(true);
  const [hasAccount, setHasAccount] = useState(false);

  useEffect(() => {
    getUser()
      .then((user: User | null) => setHasAccount(Boolean(user?.id)))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={BRAND} />
      </View>
    );
  }

  if (!hasAccount) {
    return <AccountSetupScreen onCreated={() => setHasAccount(true)} />;
  }

  return <App />;
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F7F9FC' },
});
