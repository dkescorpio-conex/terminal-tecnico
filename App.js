import 'react-native-url-polyfill/auto';
import React, { useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { View, Text, ActivityIndicator } from 'react-native';
import * as Notifications from 'expo-notifications';
import { supabase } from './src/shared/supabaseClient';
import { syncEngine } from './src/shared/syncEngine';
import LoginScreen from './src/screens/LoginScreen';
import MisTareasScreen from './src/screens/MisTareasScreen';
import ReporteScreen from './src/screens/ReporteScreen';
import FormularioEjecucionActividad from './src/screens/FormularioEjecucionActividad';
import FormularioFase2Actividad from './src/screens/FormularioFase2Actividad';
import FormularioFase3Actividad from './src/screens/FormularioFase3Actividad';
import FormularioFase4Actividad from './src/screens/FormularioFase4Actividad';
import IndicadoresScreen from './src/screens/IndicadoresScreen';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

const Stack = createNativeStackNavigator();

export default function App() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const initStorage = async () => {
      try {
        if (syncEngine?.initDB) {
          await syncEngine.initDB();
          await syncEngine.syncUp();
        }
      } catch (err) {}
    };
    initStorage();
  }, []);

  useEffect(() => {
    const evaluateSession = (currentSession) => {
      if (!currentSession) {
        setSession(null);
        setLoading(false);
        return;
      }
      
      setSession(currentSession);
      setLoading(false);
    };

    supabase.auth.getSession().then(({ data: { session } }) => {
      evaluateSession(session);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, currentSession) => {
      evaluateSession(currentSession);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f3f4f6' }}>
        <ActivityIndicator size="large" color="#2563eb" />
        <Text style={{ marginTop: 10, color: '#4b5563', fontWeight: '600' }}>
          Cargando terminal de trabajo...
        </Text>
      </View>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {!session ? (
          <Stack.Screen name="Login" component={LoginScreen} />
        ) : (
          <>
            <Stack.Screen name="MisTareas" component={MisTareasScreen} />
            <Stack.Screen name="Reporte" component={ReporteScreen} />
            <Stack.Screen name="FormularioFase1" component={FormularioEjecucionActividad} />
            <Stack.Screen name="FormularioFase2" component={FormularioFase2Actividad} />
            <Stack.Screen name="FormularioFase3" component={FormularioFase3Actividad} />
            <Stack.Screen name="FormularioFase4" component={FormularioFase4Actividad} />
            <Stack.Screen name="Indicadores" component={IndicadoresScreen} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
