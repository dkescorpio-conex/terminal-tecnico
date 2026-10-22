import React, { useState, useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet, TouchableOpacity, Text } from 'react-native';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../shared/supabaseClient';

export default function IndicadoresScreen({ navigation }) {
  const [url, setUrl] = useState(null);

  useEffect(() => {
    const buildUrl = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      let finalUrl = 'https://indicadores.fibexoym.co.ve/dashboard';
      
      if (session) {
        finalUrl = `${finalUrl}#access_token=${session.access_token}&refresh_token=${session.refresh_token}&expires_in=3600&token_type=bearer`;
      }
      
      setUrl(finalUrl);
    };
    buildUrl();
  }, []);

  if (!url) {
    return (
      <View style={styles.loaderContainer}>
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Indicadores O&M</Text>
      </View>
      <View style={styles.webContainer}>
        <WebView
          source={{ uri: url }}
          javaScriptEnabled={true}
          domStorageEnabled={true}
          startInLoadingState={true}
          renderLoading={() => (
            <View style={styles.loaderOverlay}>
              <ActivityIndicator size="large" color="#2563eb" />
            </View>
          )}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  header: { backgroundColor: '#1d4ed8', padding: 20, paddingTop: 40, flexDirection: 'row', alignItems: 'center' },
  backBtn: { marginRight: 15 },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  webContainer: { flex: 1 },
  loaderContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f8fafc' },
  loaderOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f8fafc' }
});
