import React, { useState } from 'react';
import { 
  View, Text, TextInput, TouchableOpacity, StyleSheet, 
  ActivityIndicator, Alert, Platform, KeyboardAvoidingView, SafeAreaView
} from 'react-native';
import { supabase } from '../shared/supabaseClient';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert('Atención', 'Por favor ingresa tu correo y contraseña.');
      return;
    }

    setLoading(true);
    const normalizedEmail = email.toLowerCase().trim();

    const { error } = await supabase.auth.signInWithPassword({ 
      email: normalizedEmail, 
      password 
    });

    if (error) {
      Alert.alert('Error de acceso', 'Su correo está mal registrado, envíe un reporte al WS: +584128817502');
      setLoading(false);
      return;
    }

    await registerTokenAndFinish();
    setLoading(false);
  };

  const registerTokenAndFinish = async () => {
    try {
      if (!Device.isDevice) {
        return;
      }

      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;
      
      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }
      
      if (finalStatus !== 'granted') {
        Alert.alert('Permiso Denegado', 'No recibirás alertas de nuevas tareas de O&M.');
        return;
      }

      const tokenData = await Notifications.getExpoPushTokenAsync({
        projectId: '0d34fa45-7b2d-49c1-b0b3-440eb52c7f2d' 
      });
      const pushToken = tokenData.data;

      const { data: userData } = await supabase.auth.getUser();
      
      if (userData?.user) {
        const { error: updateError } = await supabase
          .from('perfiles_roles')
          .update({ expo_push_token: pushToken })
          .eq('id', userData.user.id); 
        
        if (updateError) {
          console.error(updateError);
        }
      }
    } catch (error) {
      console.error(error);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.mainContainer}>
        
        <View style={styles.bgOrbTop} />
        <View style={styles.bgOrbBottom} />

        <View style={styles.cardContainer}>
          <View style={styles.versionTag}>
            <Text style={styles.versionText}>V3.5</Text>
          </View>

          <View style={styles.headerTextContainer}>
            <Text style={styles.brandTitle}>
              Fibex <Text style={styles.brandAccent}>O&M</Text>
            </Text>
            <Text style={styles.subtitle}>Terminal de Operaciones</Text>
          </View>

          <View style={styles.formContainer}>
            <Text style={styles.inputLabel}>CORREO CORPORATIVO</Text>
            <View style={styles.inputWrapper}>
              <TextInput
                style={styles.input}
                placeholder="usuario@fibextelecom.com"
                placeholderTextColor="#475569"
                autoCapitalize="none"
                keyboardType="email-address"
                value={email}
                onChangeText={setEmail}
                editable={!loading}
              />
            </View>

            <Text style={styles.inputLabel}>CONTRASEÑA</Text>
            <View style={styles.inputWrapper}>
              <TextInput
                style={styles.inputPassword}
                placeholder="••••••••"
                placeholderTextColor="#475569"
                secureTextEntry={!showPassword}
                value={password}
                onChangeText={setPassword}
                editable={!loading}
              />
              <TouchableOpacity 
                style={styles.toggleButton} 
                onPress={() => setShowPassword(!showPassword)}
                disabled={loading}
              >
                <Text style={styles.toggleButtonText}>
                  {showPassword ? 'Ocultar' : 'Ver'}
                </Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity 
              style={[styles.primaryButton, loading && styles.primaryButtonDisabled]} 
              onPress={handleLogin} 
              disabled={loading}
              activeOpacity={0.8}
            >
              {loading ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text style={styles.buttonText}>Ingresar al Sistema</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>© {new Date().getFullYear()} Fibex Telecom</Text>
        </View>

      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#020617',
  },
  mainContainer: {
    flex: 1,
    justifyContent: 'center',
    backgroundColor: '#020617',
  },
  bgOrbTop: {
    position: 'absolute',
    top: -100,
    left: -100,
    width: 350,
    height: 350,
    borderRadius: 175,
    backgroundColor: 'rgba(37, 99, 235, 0.15)',
  },
  bgOrbBottom: {
    position: 'absolute',
    bottom: -100,
    right: -100,
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: 'rgba(6, 182, 212, 0.12)',
  },
  cardContainer: {
    backgroundColor: 'rgba(30, 41, 59, 0.6)',
    marginHorizontal: 24,
    borderRadius: 24,
    paddingTop: 36,
    paddingBottom: 32,
    paddingHorizontal: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  versionTag: {
    position: 'absolute',
    top: 20,
    right: 20,
    backgroundColor: 'rgba(59, 130, 246, 0.2)',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.3)',
  },
  versionText: {
    color: '#67e8f9',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1,
  },
  headerTextContainer: {
    alignItems: 'center',
    marginBottom: 32,
  },
  brandTitle: {
    fontSize: 32,
    fontWeight: '900',
    color: '#ffffff',
    letterSpacing: 1,
  },
  brandAccent: {
    color: '#22d3ee',
  },
  subtitle: {
    fontSize: 12,
    color: '#94a3b8',
    marginTop: 6,
    textTransform: 'uppercase',
    letterSpacing: 2,
    fontWeight: '700',
  },
  formContainer: {
    width: '100%',
  },
  inputLabel: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#64748b',
    marginBottom: 8,
    marginLeft: 4,
    letterSpacing: 1,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(2, 6, 23, 0.5)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 16,
    marginBottom: 20,
  },
  input: {
    flex: 1,
    color: '#f8fafc',
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 14,
  },
  inputPassword: {
    flex: 1,
    color: '#f8fafc',
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 14,
  },
  toggleButton: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  toggleButtonText: {
    color: '#38bdf8',
    fontSize: 12,
    fontWeight: 'bold',
  },
  primaryButton: {
    backgroundColor: '#2563eb',
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: 'center',
    marginTop: 12,
  },
  primaryButtonDisabled: {
    backgroundColor: '#1e3a8a',
    opacity: 0.7,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
  footer: {
    position: 'absolute',
    bottom: 30,
    width: '100%',
    alignItems: 'center',
  },
  footerText: {
    color: '#475569',
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 1,
  }
});
