import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Alert, StyleSheet } from 'react-native';
import { useAuth } from '../auth/AuthProvider';

export function LoginScreen() {
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const { signIn } = useAuth();

  const handleLogin = async () => {
    if (!phone) return Alert.alert('Error', 'Enter your phone number');
    setLoading(true);
    try {
      await signIn(phone);
    } catch (e: any) {
      Alert.alert('Login Failed', e.message);
    }
    setLoading(false);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.logo}>🔧 ServiCore</Text>
      <Text style={styles.subtitle}>Technician Login</Text>
      <TextInput
        style={styles.input}
        placeholder="Phone number (e.g. 9876543210)"
        placeholderTextColor="#666"
        keyboardType="phone-pad"
        value={phone}
        onChangeText={setPhone}
      />
      <TouchableOpacity style={styles.button} onPress={handleLogin} disabled={loading}>
        <Text style={styles.buttonText}>{loading ? 'Signing in...' : 'Sign In'}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0f', justifyContent: 'center', alignItems: 'center', padding: 24 },
  logo: { fontSize: 32, fontWeight: 'bold', color: '#fff', marginBottom: 8 },
  subtitle: { fontSize: 16, color: '#888', marginBottom: 32 },
  input: { width: '100%', backgroundColor: '#1a1a2e', borderRadius: 12, padding: 16, color: '#fff', fontSize: 16, borderWidth: 1, borderColor: '#333', marginBottom: 16 },
  button: { width: '100%', backgroundColor: '#6366f1', borderRadius: 12, padding: 16, alignItems: 'center' },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
