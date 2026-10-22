import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Alert, StyleSheet, RefreshControl, ActivityIndicator } from 'react-native';
import { syncEngine } from '../shared/syncEngine';
import * as Notifications from 'expo-notifications';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../shared/supabaseClient';

export default function MisTareasScreen({ navigation }) {
  const [moduloActivo, setModuloActivo] = useState('TICKETS');
  const [activeTab, setActiveTab] = useState('nuevas');
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isOfflineForce, setIsOfflineForce] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  const fetchDatos = useCallback(async () => {
    if (isUploading) return;
    
    setLoading(true);

    if (isOfflineForce) {
      setTickets(syncEngine.getLocalTickets() || []);
      setLoading(false);
      return;
    }

    const { data: { session } } = await supabase.auth.getSession();
    const emailActivo = session?.user?.email;

    if (!emailActivo) {
      setTickets(syncEngine.getLocalTickets() || []);
      setLoading(false);
      return;
    }

    const result = await syncEngine.syncDown(emailActivo);
    
    if (result && result.success) {
      setTickets(result.tickets || []);
    } else {
      setTickets(result?.tickets?.length ? result.tickets : (syncEngine.getLocalTickets() || []));
      
      if (result && result.error === 'offline_mode') {
        setIsOfflineForce(true);
      } else if (result && result.error) {
        Alert.alert('Fallo de Sincronización', result.error);
      }
    }
    
    setLoading(false);
  }, [isOfflineForce, isUploading]);

  useEffect(() => {
    // Aquí se corrige el ciclo infinito y el paso automático a Offline
    syncEngine.onSyncStateChange((isSyncing, hasNetworkError) => {
      setIsUploading(isSyncing);
      if (!isSyncing) {
        if (hasNetworkError) {
          setIsOfflineForce(true); // Falla de red: Pone el panel en rojo automáticamente
        } else if (!isOfflineForce) {
          fetchDatos(); // Éxito: Sincroniza la bandeja normal
        }
      }
    });

    const initNotifications = async () => {
      try {
        const { status } = await Notifications.getPermissionsAsync();
        if (status !== 'granted') {
          await Notifications.requestPermissionsAsync();
        }
      } catch (error) {}
    };
    initNotifications();
    
    syncEngine.initDB().then(() => {
      fetchDatos();
    });
  }, [fetchDatos, isOfflineForce]);

  const toggleOfflineMode = () => {
    setIsOfflineForce((prev) => !prev);
  };

  const handleAceptar = async (ticket) => {
    const tareasActivas = tickets.filter(t => !t.is_actividad_om && (t.paso_actual === 5 || t.paso_actual === 6));
    
    if (tareasActivas.length >= 3 && !ticket.is_actividad_om) {
      Alert.alert('Límite Alcanzado', 'No puedes tener más de 3 tareas activas simultáneamente.');
      return;
    }
    
    if (ticket.is_actividad_om) {
      let routeName = 'FormularioFase1';
      if (ticket.fase_actual === 2) routeName = 'FormularioFase2';
      if (ticket.fase_actual === 3) routeName = 'FormularioFase3';
      if (ticket.fase_actual === 4) routeName = 'FormularioFase4';
      
      navigation.navigate(routeName, { 
        actividad: ticket, 
        onVolver: () => navigation.goBack(),
        onSuccess: () => {
          navigation.goBack();
          fetchDatos();
        }
      });
      return;
    }

    try {
      await syncEngine.queueAction(ticket.id, 'ACEPTAR_TICKET', null, { paso_actual: 5 });
      setTickets(syncEngine.getLocalTickets());
      setActiveTab('ruta');
    } catch (err) {
      Alert.alert('Error', 'No se pudo procesar la tarea localmente.');
    }
  };

  const handleRechazar = async (ticket) => {
    if (isOfflineForce) {
      Alert.alert('Modo Offline', 'Debes desactivar el modo offline para rechazar una tarea.');
      return;
    }

    Alert.alert(
      'Confirmar Rechazo',
      '¿Estás seguro de que deseas rechazar esta tarea? Será devuelta a la bandeja general.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Rechazar',
          style: 'destructive',
          onPress: async () => {
            setLoading(true);
            try {
              const { error } = await supabase
                .from('tickets')
                .update({ paso_actual: 3, tecnico_id: null })
                .eq('id', ticket.id);

              if (error) throw error;
              fetchDatos();
            } catch (err) {
              Alert.alert('Error', 'No se pudo rechazar la tarea.');
              setLoading(false);
            }
          }
        }
      ]
    );
  };

  const handleLlegada = async (ticket) => {
    try {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permiso denegado', 'Se requiere GPS para registrar la llegada.');
        return;
      }

      let lat = 0;
      let lon = 0;

      try {
        // Intento primario: Alta precisión, pero con timeout de 5 segundos para que no se quede pegado sin internet
        const location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High, timeout: 5000 });
        lat = location.coords.latitude;
        lon = location.coords.longitude;
      } catch (gpsError) {
        // Fallback: Si no hay señal para calcular alta precisión, busca la última conocida
        try {
          const lastLocation = await Location.getLastKnownPositionAsync();
          if (lastLocation) {
            lat = lastLocation.coords.latitude;
            lon = lastLocation.coords.longitude;
          }
        } catch (fallbackError) {
          console.log("Fallback GPS falló también.");
        }
      }

      // Procede al paso 6, incluso si tuvo que usar 0,0 por estar offline sin caché de GPS
      await syncEngine.queueAction(ticket.id, 'LLEGADA_SITIO', { latitud: lat, longitud: lon }, { paso_actual: 6 });
      setTickets(syncEngine.getLocalTickets());
      setActiveTab('ejecucion');
    } catch (err) {
      Alert.alert('Error', 'No se pudo procesar la tarea localmente.');
    }
  };

  const tareasFiltradas = tickets.filter(t => {
    if (t.is_actividad_om) return false;
    if (activeTab === 'nuevas') return t.paso_actual === 4;
    if (activeTab === 'ruta') return t.paso_actual === 5;
    if (activeTab === 'ejecucion') return t.paso_actual === 6;
    return false;
  });

  const actividadesFiltradas = tickets.filter(t => t.is_actividad_om && t.estatus === 'PENDIENTE');

  const renderEmptyState = () => (
    <View style={styles.emptyContainer}>
      <Ionicons name="alert-circle-outline" size={60} color="#cbd5e1" />
      <Text style={styles.emptyTitle}>Bandeja vacía</Text>
      <Text style={styles.emptySub}>No hay tareas en esta sección. Desliza para actualizar.</Text>
    </View>
  );

  return (
    <View style={styles.container}>
      {isUploading && (
        <View style={styles.uploadingOverlay}>
          <ActivityIndicator size="large" color="#ffffff" />
          <Text style={styles.uploadingText}>Sincronizando reportes pendientes...</Text>
          <Text style={styles.uploadingSub}>No cierres la aplicación</Text>
        </View>
      )}

      <View style={styles.header}>
        <Text style={styles.headerTitle}>Terminal O&M</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity style={styles.headerBtn} onPress={fetchDatos} disabled={loading || isUploading}>
            <Ionicons name="refresh" size={24} color={(loading || isUploading) ? "rgba(255,255,255,0.5)" : "#fff"} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.headerBtn} onPress={() => supabase.auth.signOut()}>
            <Ionicons name="log-out-outline" size={24} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>

      <TouchableOpacity 
        style={[styles.networkPanel, isOfflineForce ? styles.networkPanelOffline : styles.networkPanelOnline]} 
        onPress={toggleOfflineMode}
      >
        <Ionicons name={isOfflineForce ? "cloud-offline" : "cloud-done"} size={24} color="#fff" />
        <View style={styles.networkPanelText}>
          <Text style={styles.networkPanelTitle}>{isOfflineForce ? 'MODO OFFLINE ACTIVADO' : 'MODO ONLINE ACTIVADO'}</Text>
          <Text style={styles.networkPanelSub}>{isOfflineForce ? 'Trabajando sin internet. Toca para conectar.' : 'Sincronización automática. Toca para pausar.'}</Text>
        </View>
      </TouchableOpacity>

      <View style={styles.moduleSelector}>
        <TouchableOpacity style={[styles.moduleBtn, moduloActivo === 'TICKETS' && styles.moduleBtnActive]} onPress={() => setModuloActivo('TICKETS')}>
          <Ionicons name="build" size={16} color={moduloActivo === 'TICKETS' ? '#1d4ed8' : '#dbeafe'} />
          <Text style={[styles.moduleBtnText, moduloActivo === 'TICKETS' && styles.moduleBtnTextActive]}>Tickets</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.moduleBtn, moduloActivo === 'ACTIVIDADES' && styles.moduleBtnActive]} onPress={() => setModuloActivo('ACTIVIDADES')}>
          <Ionicons name="shield-checkmark" size={16} color={moduloActivo === 'ACTIVIDADES' ? '#1d4ed8' : '#dbeafe'} />
          <Text style={[styles.moduleBtnText, moduloActivo === 'ACTIVIDADES' && styles.moduleBtnTextActive]}>Actividades</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.moduleBtn} onPress={() => navigation.navigate('Indicadores')}>
          <Ionicons name="bar-chart" size={16} color="#dbeafe" />
          <Text style={styles.moduleBtnText}>Indicadores</Text>
        </TouchableOpacity>
      </View>

      {moduloActivo === 'TICKETS' && (
        <View style={styles.flex1}>
          <View style={styles.tabContainer}>
            <TouchableOpacity style={[styles.tab, activeTab === 'nuevas' && styles.tabActive]} onPress={() => setActiveTab('nuevas')}>
              <Text style={[styles.tabText, activeTab === 'nuevas' && styles.tabTextActive]}>Nuevas</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.tab, activeTab === 'ruta' && styles.tabActive]} onPress={() => setActiveTab('ruta')}>
              <Text style={[styles.tabText, activeTab === 'ruta' && styles.tabTextActive]}>En Ruta</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.tab, activeTab === 'ejecucion' && styles.tabActive]} onPress={() => setActiveTab('ejecucion')}>
              <Text style={[styles.tabText, activeTab === 'ejecucion' && styles.tabTextActive]}>Ejecución</Text>
            </TouchableOpacity>
          </View>
          
          <ScrollView style={styles.flex1} refreshControl={<RefreshControl refreshing={loading && !isUploading} onRefresh={fetchDatos} />}>
            {tareasFiltradas.length === 0 ? renderEmptyState() : (
              <View style={styles.listContainer}>
                {tareasFiltradas.map((t, idx) => (
                  <View key={idx} style={styles.card}>
                    <View style={styles.cardHeader}>
                      <Text style={styles.ticketId}>Ticket #{t.id || t.ticket_externo}</Text>
                      <View style={styles.cardBadge}>
                        <Text style={styles.cardBadgeText}>{t.paso_actual === 4 ? 'Por Aceptar' : t.paso_actual === 5 ? 'En Ruta' : 'Ejecución'}</Text>
                      </View>
                    </View>
                    <View style={styles.cardBody}>
                      <Text style={styles.cardTitle}>{t.titulo || t.tipo}</Text>
                      <Text style={styles.cardSubTitle}>🛠 {t.especialidad} {'>'} {t.actividad}</Text>
                      <View style={styles.cardMeta}>
                        <Text style={styles.metaText}><Text style={styles.metaBold}>Cliente:</Text> {t.cliente || 'N/A'}</Text>
                        <Text style={styles.metaText}><Text style={styles.metaBold}>Teléfono:</Text> {t.telefono || 'N/A'}</Text>
                        <Text style={styles.metaText}><Text style={styles.metaBold}>OLT:</Text> {t.olt || 'N/A'}</Text>
                        <View style={styles.addressBox}>
                          <Text style={styles.addressText}>📍 {t.direccion}, {t.ciudad}, {t.estado}</Text>
                        </View>
                      </View>
                      {t.instrucciones_tecnico ? (
                        <View style={styles.noteBox}>
                          <Text style={styles.noteText}>Nota: {t.instrucciones_tecnico}</Text>
                        </View>
                      ) : null}
                      <View style={styles.actionsBox}>
                        {t.paso_actual === 4 && (
                          <View style={styles.actionRow}>
                            <TouchableOpacity style={styles.btnDanger} onPress={() => handleRechazar(t)}>
                              <Text style={styles.btnTextDanger}>Rechazar</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.btnPrimaryHalf} onPress={() => handleAceptar(t)}>
                              <Text style={styles.btnTextPrimary}>Aceptar Tarea</Text>
                            </TouchableOpacity>
                          </View>
                        )}
                        {t.paso_actual === 5 && (
                          <TouchableOpacity style={styles.btnSuccess} onPress={() => handleLlegada(t)}>
                            <Ionicons name="location" size={16} color="#fff" />
                            <Text style={styles.btnTextPrimary}> Confirmar Llegada al Sitio</Text>
                          </TouchableOpacity>
                        )}
                        {t.paso_actual === 6 && (
                          <TouchableOpacity style={styles.btnPurple} onPress={() => navigation.navigate('Reporte', { ticket: t })}>
                            <Ionicons name="camera" size={16} color="#fff" />
                            <Text style={styles.btnTextPrimary}> Llenar Reporte y Fotos</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </ScrollView>
        </View>
      )}

      {moduloActivo === 'ACTIVIDADES' && (
        <View style={styles.flex1}>
          <ScrollView style={styles.flex1} refreshControl={<RefreshControl refreshing={loading && !isUploading} onRefresh={fetchDatos} />}>
            {actividadesFiltradas.length === 0 ? renderEmptyState() : (
              <View style={styles.listContainer}>
                {actividadesFiltradas.map((act, idx) => (
                  <View key={idx} style={styles.card}>
                    <View style={styles.cardHeader}>
                      <Text style={styles.ticketId}>{act.cliente}</Text>
                      <View style={styles.cardBadge}>
                        <Text style={styles.cardBadgeText}>FASE {act.fase_actual}</Text>
                      </View>
                    </View>
                    <View style={styles.cardBody}>
                      <Text style={styles.cardTitle}>{act.actividad}</Text>
                      <View style={styles.cardMeta}>
                        <Text style={styles.addressText}>📍 {act.ciudad}, {act.estado}</Text>
                      </View>
                      <TouchableOpacity style={styles.btnPrimary} onPress={() => handleAceptar(act)}>
                        <Text style={styles.btnTextPrimary}>Ejecutar Actividad</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </ScrollView>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f1f5f9' },
  flex1: { flex: 1 },
  uploadingOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(15, 23, 42, 0.9)', zIndex: 9999, justifyContent: 'center', alignItems: 'center' },
  uploadingText: { color: '#ffffff', fontSize: 16, fontWeight: 'bold', marginTop: 15 },
  uploadingSub: { color: '#94a3b8', fontSize: 12, marginTop: 5 },
  header: { backgroundColor: '#1d4ed8', padding: 20, paddingTop: 40, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerTitle: { color: '#fff', fontSize: 20, fontWeight: 'bold' },
  headerActions: { flexDirection: 'row', alignItems: 'center' },
  headerBtn: { padding: 5, marginLeft: 15 },
  networkPanel: { flexDirection: 'row', alignItems: 'center', padding: 15, borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.1)' },
  networkPanelOnline: { backgroundColor: '#059669' },
  networkPanelOffline: { backgroundColor: '#dc2626' },
  networkPanelText: { marginLeft: 15 },
  networkPanelTitle: { color: '#fff', fontSize: 14, fontWeight: '900', letterSpacing: 0.5 },
  networkPanelSub: { color: 'rgba(255,255,255,0.8)', fontSize: 11 },
  moduleSelector: { flexDirection: 'row', backgroundColor: '#1e40af', padding: 10 },
  moduleBtn: { flex: 1, padding: 10, borderRadius: 8, alignItems: 'center', justifyContent: 'center', flexDirection: 'row' },
  moduleBtnActive: { backgroundColor: '#fff' },
  moduleBtnText: { color: '#dbeafe', fontSize: 13, fontWeight: 'bold', marginLeft: 6 },
  moduleBtnTextActive: { color: '#1d4ed8' },
  tabContainer: { flexDirection: 'row', backgroundColor: '#fff', elevation: 2 },
  tab: { flex: 1, paddingVertical: 15, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabActive: { borderBottomColor: '#2563eb' },
  tabText: { color: '#64748b', fontWeight: 'bold', fontSize: 14 },
  tabTextActive: { color: '#2563eb' },
  listContainer: { padding: 15 },
  card: { backgroundColor: '#fff', borderRadius: 12, marginBottom: 15, elevation: 1, borderWidth: 1, borderColor: '#e2e8f0' },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', padding: 15, backgroundColor: '#f8fafc', borderBottomWidth: 1, borderBottomColor: '#f1f5f9', borderTopLeftRadius: 12, borderTopRightRadius: 12 },
  ticketId: { fontWeight: '900', color: '#334155', fontSize: 14 },
  cardBadge: { backgroundColor: '#fef3c7', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  cardBadgeText: { color: '#92400e', fontSize: 10, fontWeight: '900', textTransform: 'uppercase' },
  cardBody: { padding: 15 },
  cardTitle: { fontSize: 16, fontWeight: 'bold', color: '#0f172a', marginBottom: 4 },
  cardSubTitle: { fontSize: 12, color: '#64748b', fontWeight: '600', textTransform: 'uppercase', marginBottom: 15 },
  cardMeta: { backgroundColor: '#ecfdf5', padding: 12, borderRadius: 8, borderWidth: 1, borderColor: '#d1fae5', marginBottom: 15 },
  metaText: { fontSize: 12, color: '#064e3b', marginBottom: 4 },
  metaBold: { fontWeight: 'bold', color: '#047857' },
  addressBox: { backgroundColor: '#fff', padding: 8, borderRadius: 4, marginTop: 8, borderColor: '#d1fae5', borderWidth: 1 },
  addressText: { fontSize: 11, color: '#065f46', fontWeight: '600' },
  noteBox: { backgroundColor: '#eff6ff', padding: 10, borderRadius: 8, borderLeftWidth: 4, borderLeftColor: '#3b82f6', marginBottom: 15 },
  noteText: { fontSize: 12, color: '#1e3a8a', fontStyle: 'italic', fontWeight: '500' },
  actionsBox: { marginTop: 5 },
  actionRow: { flexDirection: 'row', gap: 10 },
  btnDanger: { flex: 0.4, backgroundColor: '#fef2f2', padding: 14, borderRadius: 10, alignItems: 'center', borderWidth: 1, borderColor: '#fecaca' },
  btnTextDanger: { color: '#dc2626', fontWeight: 'bold', fontSize: 14 },
  btnPrimaryHalf: { flex: 0.6, backgroundColor: '#2563eb', padding: 14, borderRadius: 10, alignItems: 'center' },
  btnPrimary: { backgroundColor: '#2563eb', padding: 14, borderRadius: 10, alignItems: 'center' },
  btnSuccess: { backgroundColor: '#059669', padding: 14, borderRadius: 10, alignItems: 'center', flexDirection: 'row', justifyContent: 'center' },
  btnPurple: { backgroundColor: '#9333ea', padding: 14, borderRadius: 10, alignItems: 'center', flexDirection: 'row', justifyContent: 'center' },
  btnTextPrimary: { color: '#fff', fontWeight: 'bold', fontSize: 14 },
  emptyContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', marginTop: 100 },
  emptyTitle: { fontSize: 18, fontWeight: 'bold', color: '#64748b', marginTop: 15 },
  emptySub: { fontSize: 13, color: '#94a3b8', marginTop: 5, textAlign: 'center', paddingHorizontal: 40 }
});
