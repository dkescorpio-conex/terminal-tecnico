import React, { useState, useEffect, useRef } from 'react';
import { 
  View, Text, TextInput, TouchableOpacity, StyleSheet, 
  ScrollView, Image, Alert, SafeAreaView, ActivityIndicator 
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Location from 'expo-location';
import ViewShot from 'react-native-view-shot';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { syncEngine } from '../shared/syncEngine';

export default function FormularioFase4Actividad({ route, navigation }) {
  const { actividad = {}, onVolver, onSuccess } = route?.params || {};
  
  const handleVolver = onVolver || (() => navigation.goBack());
  const handleSuccess = onSuccess || (() => navigation.goBack());

  const [loading, setLoading] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef(null);
  const viewShotRef = useRef(null);

  const [expandedClients, setExpandedClients] = useState({});

  const rawQaData = actividad?.planificacion_olt_maestra || [];
  const qaData = Array.isArray(rawQaData) ? (rawQaData[0] || {}) : (rawQaData || {});
  
  const isRechazado = qaData.revision_fase4_estado === 'RECHAZADO';
  const comentarioRechazo = qaData.revision_fase4_comentario || 'Verifique las instrucciones del analista.';
  const comentarioAsignador = actividad?.comentario_asignador || '';

  const draftKey = `@draft_warning_${actividad?.id}_fase4`;

  const [puertosForm, setPuertosForm] = useState(() => {
    const puertosBase = actividad?.puertos_fase4_detalle || [];
    return puertosBase.map(p => ({
      puerto: p.puerto,
      clientes: p.clientes || [],
      nap_drop: { completado: true, danado: p.nap_drop?.danado || false, comentario: p.nap_drop?.comentario || '', evidencia_local: null },
      roseta: { completado: true, danado: p.roseta?.danado || false, comentario: p.roseta?.comentario || '', evidencia_local: null },
      ont: { completado: true, danado: p.ont?.danado || false, comentario: p.ont?.comentario || '', evidencia_local: null }
    }));
  });

  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [activeCameraKey, setActiveCameraKey] = useState(null);
  const [previewRawImage, setPreviewRawImage] = useState(null);
  const [locationData, setLocationData] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    const loadDraft = async () => {
      try {
        const draftStr = await AsyncStorage.getItem(draftKey);
        if (draftStr) {
          const draft = JSON.parse(draftStr);
          if (draft.puertosForm) setPuertosForm(draft.puertosForm);
        }
      } catch (e) {}
    };
    loadDraft();
  }, [draftKey]);

  useEffect(() => {
    const saveDraft = async () => {
      try {
        await AsyncStorage.setItem(draftKey, JSON.stringify({ puertosForm }));
      } catch (e) {}
    };
    saveDraft();
  }, [puertosForm, draftKey]);

  const toggleExpand = (puertoStr) => {
    setExpandedClients(prev => ({ ...prev, [puertoStr]: !prev[puertoStr] }));
  };

  const handleStatusChange = (pIndex, nodo, value) => {
    const newPuertos = [...puertosForm];
    newPuertos[pIndex][nodo].danado = (value === 'SI');
    if (value === 'NO') {
      newPuertos[pIndex][nodo].comentario = '';
      newPuertos[pIndex][nodo].evidencia_local = null;
    }
    setPuertosForm(newPuertos);
  };

  const handleComentarioChange = (pIndex, nodo, value) => {
    const newPuertos = [...puertosForm];
    newPuertos[pIndex][nodo].comentario = value;
    setPuertosForm(newPuertos);
  };

  const handleRemoveFoto = (pIndex, nodo) => {
    const newPuertos = [...puertosForm];
    newPuertos[pIndex][nodo].evidencia_local = null;
    setPuertosForm(newPuertos);
  };

  const abrirCamara = async (pIndex, nodo) => {
    if (!permission) await requestPermission();
    else if (!permission.granted) {
      const newPermission = await requestPermission();
      if (!newPermission.granted) return Alert.alert('Permiso Denegado', 'Necesitas acceso a la cámara.');
    }

    const { status: locStatus } = await Location.requestForegroundPermissionsAsync();
    if (locStatus !== 'granted') return Alert.alert('Permiso Denegado', 'El GPS es obligatorio.');

    setActiveCameraKey({ pIndex, nodo });
    setIsCameraOpen(true);
  };

  const capturarFoto = async () => {
    if (cameraRef.current && activeCameraKey) {
      setIsProcessing(true);
      try {
        const photo = await cameraRef.current.takePictureAsync({ quality: 0.8 });
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
        const now = new Date();
        const fDate = `${now.getDate().toString().padStart(2, '0')}/${(now.getMonth() + 1).toString().padStart(2, '0')}/${now.getFullYear()} ${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

        const portLabel = puertosForm[activeCameraKey.pIndex].puerto.replace('/', '-');

        setLocationData({
          lat: loc.coords.latitude.toFixed(6),
          lon: loc.coords.longitude.toFixed(6),
          date: fDate,
          tech: actividad?.tecnico_id || 'Técnico O&M',
          nodo: `${portLabel} | ${activeCameraKey.nodo.toUpperCase()}`
        });

        setPreviewRawImage(photo.uri);
        setIsCameraOpen(false);
      } catch (error) {
        Alert.alert('Error', 'Fallo al capturar GPS o imagen.');
      } finally {
        setIsProcessing(false);
      }
    }
  };

  const confirmarEstampado = async () => {
    try {
      setIsProcessing(true);
      const uriEstampada = await viewShotRef.current.capture();
      
      const newPuertos = [...puertosForm];
      newPuertos[activeCameraKey.pIndex][activeCameraKey.nodo].evidencia_local = uriEstampada;
      setPuertosForm(newPuertos);

      setPreviewRawImage(null);
      setLocationData(null);
      setActiveCameraKey(null);
    } catch (error) {
      Alert.alert('Error', 'Fallo al procesar la marca de agua.');
    } finally {
      setIsProcessing(false);
    }
  };

  const descartarEstampado = () => {
    setPreviewRawImage(null);
    setLocationData(null);
    setIsCameraOpen(true);
  };

  const guardarEjecucion = async () => {
    for (let i = 0; i < puertosForm.length; i++) {
      const p = puertosForm[i];
      const pLabel = p.puerto;
      
      if (p.nap_drop.danado && !p.nap_drop.evidencia_local) return Alert.alert('Evidencia', `Falta foto en NAP/DROP de ${pLabel}`);
      if (p.roseta.danado && !p.roseta.evidencia_local) return Alert.alert('Evidencia', `Falta foto en ROSETA de ${pLabel}`);
      if (p.ont.danado && !p.ont.evidencia_local) return Alert.alert('Evidencia', `Falta foto en ONT de ${pLabel}`);
    }

    setLoading(true);

    try {
      const ticketActualizado = { ...actividad, estatus: 'EJECUTADO' };

      await syncEngine.queueAction(actividad.id, 'AUDITORIA_FASEN_WARNING', {
        planificacion_id: actividad.id_planificacion_olt,
        fase: 4,
        puertosDetalle: puertosForm
      }, ticketActualizado);

      await AsyncStorage.removeItem(draftKey);
      Alert.alert('Registro Guardado', 'Fase 4 registrada. En cola de sincronización...');
      handleSuccess(actividad.id);

    } catch (error) {
      Alert.alert('Error', 'Fallo al guardar la ejecución de Fase 4.');
    } finally {
      setLoading(false);
    }
  };

  const renderNodoAuditoria = (pIndex, titulo, nodoKey) => {
    const dataNodo = puertosForm[pIndex][nodoKey];
    
    return (
      <View style={styles.nodeBox}>
        <View style={styles.nodeHeader}>
          <Text style={styles.nodeTitle}>{titulo}</Text>
          <View style={styles.segmentedControl}>
            <TouchableOpacity 
              style={[styles.segmentBtn, !dataNodo.danado && styles.segmentBtnActiveOK]} 
              onPress={() => handleStatusChange(pIndex, nodoKey, 'NO')}
            >
              <Text style={[styles.segmentText, !dataNodo.danado && styles.segmentTextActive]}>OK</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.segmentBtn, dataNodo.danado && styles.segmentBtnActiveError]} 
              onPress={() => handleStatusChange(pIndex, nodoKey, 'SI')}
            >
              <Text style={[styles.segmentText, dataNodo.danado && styles.segmentTextActive]}>FALLA</Text>
            </TouchableOpacity>
          </View>
        </View>

        {dataNodo.danado && (
          <View style={styles.nodeBody}>
            <Text style={styles.label}>DIAGNÓSTICO / FALLA</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              multiline
              numberOfLines={2}
              value={dataNodo.comentario}
              onChangeText={(val) => handleComentarioChange(pIndex, nodoKey, val)}
              placeholder="Especifique el daño detectado..."
            />

            <View style={styles.evidenceHeader}>
              <Text style={styles.label}>EVIDENCIA ESTAMPADA</Text>
              <TouchableOpacity style={styles.btnCameraSmall} onPress={() => abrirCamara(pIndex, nodoKey)}>
                <Text style={styles.btnCameraText}>📸 Cámara</Text>
              </TouchableOpacity>
            </View>

            {!dataNodo.evidencia_local ? (
              <View style={styles.emptyEvidence}>
                <Text style={styles.emptyEvidenceText}>Sin evidencia</Text>
              </View>
            ) : (
              <View style={styles.previewContainer}>
                <Image source={{ uri: dataNodo.evidencia_local }} style={styles.previewImage} />
                <TouchableOpacity style={styles.btnRemovePhoto} onPress={() => handleRemoveFoto(pIndex, nodoKey)}>
                  <Text style={styles.btnRemoveText}>X</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}
      </View>
    );
  };

  if (previewRawImage && locationData) {
    return (
      <SafeAreaView style={styles.cameraScreen}>
        <View style={styles.cameraHeader}>
          <Text style={styles.cameraTitle}>Validar Marca de Agua</Text>
        </View>
        <View style={styles.cameraFlex}>
          <ViewShot ref={viewShotRef} options={{ format: "jpg", quality: 0.9 }} style={styles.cameraFlex}>
            <Image source={{ uri: previewRawImage }} style={styles.cameraFlex} resizeMode="cover" />
            <View style={styles.watermarkOverlay}>
              <Text style={styles.watermarkText}><Text style={styles.watermarkBold}>O&M - Fibex Telecom</Text></Text>
              <Text style={styles.watermarkText}><Text style={styles.watermarkBold}>Nodo:</Text> {locationData.nodo}</Text>
              <Text style={styles.watermarkText}><Text style={styles.watermarkBold}>Técnico:</Text> {locationData.tech}</Text>
              <Text style={styles.watermarkText}><Text style={styles.watermarkBold}>Fecha:</Text> {locationData.date}</Text>
              <Text style={styles.watermarkText}><Text style={styles.watermarkBold}>GPS:</Text> {locationData.lat}, {locationData.lon}</Text>
            </View>
          </ViewShot>
        </View>
        <View style={styles.cameraFooter}>
          <TouchableOpacity style={styles.btnDiscard} onPress={descartarEstampado} disabled={isProcessing}>
            <Text style={styles.btnTextWhite}>Descartar</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.btnStamp} onPress={confirmarEstampado} disabled={isProcessing}>
            {isProcessing ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnTextWhite}>Estampar y Guardar</Text>}
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (isCameraOpen) {
    return (
      <SafeAreaView style={styles.cameraScreen}>
        <CameraView style={styles.cameraFlex} facing="back" ref={cameraRef}>
          <View style={styles.cameraHeaderOverlay}>
            <TouchableOpacity style={styles.btnCameraBack} onPress={() => setIsCameraOpen(false)}>
              <Text style={styles.btnTextWhite}>Volver</Text>
            </TouchableOpacity>
            <Text style={styles.cameraTagLabel}>{activeCameraKey?.nodo.toUpperCase()}</Text>
          </View>
          <View style={styles.cameraCaptureFooter}>
            <TouchableOpacity style={styles.btnCaptureOuter} onPress={capturarFoto} disabled={isProcessing}>
              {isProcessing ? <ActivityIndicator size="large" color="#fff" /> : <View style={styles.btnCaptureInner} />}
            </TouchableOpacity>
          </View>
        </CameraView>
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollArea}>
        
        {comentarioAsignador !== '' && (
          <View style={styles.assignerBox}>
            <Text style={styles.assignerTitle}>INSTRUCCIONES DE COORDINACIÓN</Text>
            <Text style={styles.assignerText}>{comentarioAsignador}</Text>
          </View>
        )}

        {isRechazado && (
          <View style={styles.rejectBox}>
            <Text style={styles.rejectTitle}>CONTROL DE CALIDAD RECHAZADO</Text>
            <Text style={styles.rejectText}>"{comentarioRechazo}"</Text>
            <Text style={styles.rejectSub}>Por favor aplique las correcciones y re-capture evidencia.</Text>
          </View>
        )}

        <View style={styles.infoBox}>
          <Text style={styles.infoTitle}>Auditoría Acometida y Cliente</Text>
          <Text style={styles.infoText}>Auditoría asignada a {puertosForm.length} puerto(s). Verifique el estado de NAP/Drop, Roseta y ONT.</Text>
        </View>

        {puertosForm.map((p, index) => {
          const numClientes = p.clientes ? p.clientes.length : 0;
          const isExpanded = expandedClients[p.puerto] || false;

          return (
            <View key={index} style={styles.portCard}>
              <View style={styles.portHeader}>
                <Text style={styles.portHeaderText}>TARJETA {p.puerto.split('/')[0]} | PUERTO {p.puerto.split('/')[1] || p.puerto}</Text>
              </View>
              
              <View style={styles.portBody}>
                <View style={styles.clientSummaryBox}>
                  <TouchableOpacity style={styles.clientSummaryBtn} onPress={() => toggleExpand(p.puerto)}>
                    <Text style={[styles.clientSummaryText, numClientes > 0 && styles.clientSummaryTextActive]}>
                      👥 {numClientes} Clientes Afectados
                    </Text>
                    <Text style={styles.expandIcon}>{isExpanded ? '▲' : '▼'}</Text>
                  </TouchableOpacity>

                  {isExpanded && numClientes > 0 && (
                    <View style={styles.clientList}>
                      {p.clientes.map((c, i) => (
                        <View key={i} style={styles.clientItem}>
                          <Text style={styles.clientName} numberOfLines={1}>{c.name}</Text>
                          <Text style={styles.clientAddress}>{c.address || 'Sin dirección'}</Text>
                          <View style={styles.clientStatusRow}>
                            <Text style={[styles.statusText, c.status === 'Online' ? styles.statusOnline : styles.statusOffline]}>{c.status}</Text>
                            <Text style={styles.statusDivider}>|</Text>
                            <Text style={[styles.signalText, c.signal === 'Very good' ? styles.signalGood : c.signal === 'Warning' ? styles.signalWarning : c.signal === 'Critical' ? styles.signalCritical : styles.signalDefault]}>{c.signal}</Text>
                          </View>
                        </View>
                      ))}
                    </View>
                  )}
                  {isExpanded && numClientes === 0 && (
                    <Text style={styles.emptyClientsText}>PUERTO SIN CLIENTES REPORTADOS</Text>
                  )}
                </View>

                {renderNodoAuditoria(index, '1. NAP / DROP', 'nap_drop')}
                {renderNodoAuditoria(index, '2. ROSETA', 'roseta')}
                {renderNodoAuditoria(index, '3. ONT', 'ont')}
              </View>
            </View>
          );
        })}

      </ScrollView>

      <View style={styles.bottomBar}>
        <TouchableOpacity style={styles.btnVolver} onPress={handleVolver} disabled={loading}>
          <Text style={styles.btnVolverText}>Cancelar</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.btnSubmit, isRechazado && styles.btnSubmitRechazo]} onPress={guardarEjecucion} disabled={loading}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnSubmitText}>{isRechazado ? 'Subir Correcciones' : 'Guardar Acometida'}</Text>}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  scrollArea: { padding: 16, paddingBottom: 100 },
  assignerBox: { backgroundColor: '#eef2ff', borderLeftWidth: 4, borderLeftColor: '#4f46e5', padding: 12, borderRadius: 8, marginBottom: 16 },
  assignerTitle: { fontSize: 11, fontWeight: 'bold', color: '#312e81', marginBottom: 4 },
  assignerText: { fontSize: 12, color: '#3730a3', fontStyle: 'italic' },
  rejectBox: { backgroundColor: '#fef2f2', borderLeftWidth: 4, borderLeftColor: '#dc2626', padding: 12, borderRadius: 8, marginBottom: 16 },
  rejectTitle: { fontSize: 11, fontWeight: 'bold', color: '#991b1b', marginBottom: 4 },
  rejectText: { fontSize: 12, color: '#7f1d1d', fontStyle: 'italic', backgroundColor: '#ffffff', padding: 8, borderRadius: 4 },
  rejectSub: { fontSize: 10, fontWeight: 'bold', color: '#b91c1c', marginTop: 8, textAlign: 'right' },
  infoBox: { backgroundColor: '#ecfdf5', borderWidth: 1, borderColor: '#a7f3d0', padding: 12, borderRadius: 8, marginBottom: 16 },
  infoTitle: { fontSize: 13, fontWeight: 'bold', color: '#064e3b' },
  infoText: { fontSize: 11, color: '#047857', marginTop: 4 },
  portCard: { backgroundColor: '#ffffff', borderRadius: 12, marginBottom: 16, borderWidth: 1, borderColor: '#e2e8f0', overflow: 'hidden', elevation: 1 },
  portHeader: { backgroundColor: '#064e3b', paddingHorizontal: 16, paddingVertical: 12 },
  portHeaderText: { color: '#ffffff', fontSize: 12, fontWeight: '900', letterSpacing: 1 },
  portBody: { padding: 16 },
  clientSummaryBox: { backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 8, padding: 10, marginBottom: 16 },
  clientSummaryBtn: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  clientSummaryText: { fontSize: 12, fontWeight: 'bold', color: '#64748b' },
  clientSummaryTextActive: { color: '#047857' },
  expandIcon: { fontSize: 10, color: '#64748b' },
  clientList: { marginTop: 12 },
  clientItem: { backgroundColor: '#ffffff', padding: 10, borderRadius: 6, borderWidth: 1, borderColor: '#e2e8f0', marginBottom: 8 },
  clientName: { fontSize: 11, fontWeight: 'bold', color: '#1e293b', marginBottom: 2 },
  clientAddress: { fontSize: 10, color: '#64748b', marginBottom: 6 },
  clientStatusRow: { flexDirection: 'row', alignItems: 'center' },
  statusText: { fontSize: 10, fontWeight: 'bold' },
  statusOnline: { color: '#059669' },
  statusOffline: { color: '#dc2626' },
  statusDivider: { fontSize: 10, color: '#cbd5e1', marginHorizontal: 6 },
  signalText: { fontSize: 10, fontWeight: 'bold' },
  signalGood: { color: '#0d9488' },
  signalWarning: { color: '#ea580c' },
  signalCritical: { color: '#dc2626' },
  signalDefault: { color: '#64748b' },
  emptyClientsText: { marginTop: 12, fontSize: 10, fontWeight: 'bold', color: '#94a3b8', textAlign: 'center' },
  nodeBox: { backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 8, padding: 12, marginBottom: 12 },
  nodeHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  nodeTitle: { fontSize: 11, fontWeight: '900', color: '#334155' },
  segmentedControl: { flexDirection: 'row', backgroundColor: '#e2e8f0', borderRadius: 6, padding: 2 },
  segmentBtn: { paddingVertical: 4, paddingHorizontal: 10, borderRadius: 4, alignItems: 'center', justifyContent: 'center' },
  segmentBtnActiveOK: { backgroundColor: '#10b981', elevation: 1 },
  segmentBtnActiveError: { backgroundColor: '#ef4444', elevation: 1 },
  segmentText: { fontSize: 10, fontWeight: 'bold', color: '#64748b' },
  segmentTextActive: { color: '#ffffff' },
  nodeBody: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#e2e8f0' },
  label: { fontSize: 10, fontWeight: 'bold', color: '#64748b', marginBottom: 6 },
  input: { backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 6, paddingHorizontal: 10, paddingVertical: 8, fontSize: 12, color: '#0f172a' },
  textArea: { height: 50, textAlignVertical: 'top' },
  evidenceHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, marginBottom: 8 },
  btnCameraSmall: { backgroundColor: '#10b981', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6 },
  btnCameraText: { color: '#ffffff', fontSize: 10, fontWeight: 'bold' },
  emptyEvidence: { height: 70, backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#cbd5e1', borderStyle: 'dashed', borderRadius: 6, justifyContent: 'center', alignItems: 'center' },
  emptyEvidenceText: { fontSize: 10, fontWeight: 'bold', color: '#94a3b8' },
  previewContainer: { height: 100, borderRadius: 6, overflow: 'hidden', borderWidth: 1, borderColor: '#e2e8f0' },
  previewImage: { width: '100%', height: '100%' },
  btnRemovePhoto: { position: 'absolute', top: 4, right: 4, backgroundColor: '#ef4444', width: 22, height: 22, borderRadius: 11, justifyContent: 'center', alignItems: 'center' },
  btnRemoveText: { color: '#ffffff', fontSize: 10, fontWeight: 'bold' },
  bottomBar: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: '#ffffff', borderTopWidth: 1, borderTopColor: '#e2e8f0', padding: 16, flexDirection: 'row', gap: 12, elevation: 10 },
  btnVolver: { flex: 1, backgroundColor: '#f1f5f9', paddingVertical: 14, borderRadius: 10, alignItems: 'center', borderWidth: 1, borderColor: '#e2e8f0' },
  btnVolverText: { fontSize: 14, fontWeight: 'bold', color: '#475569' },
  btnSubmit: { flex: 2, backgroundColor: '#10b981', paddingVertical: 14, borderRadius: 10, alignItems: 'center' },
  btnSubmitRechazo: { backgroundColor: '#ea580c' },
  btnSubmitText: { fontSize: 14, fontWeight: 'bold', color: '#ffffff' },
  cameraScreen: { flex: 1, backgroundColor: '#000' },
  cameraFlex: { flex: 1 },
  cameraHeader: { padding: 16, backgroundColor: '#111827', alignItems: 'center' },
  cameraTitle: { color: '#ffffff', fontSize: 16, fontWeight: 'bold' },
  watermarkOverlay: { position: 'absolute', bottom: 20, left: 15, backgroundColor: 'rgba(0,0,0,0.6)', padding: 10, borderRadius: 8, maxWidth: '85%' },
  watermarkText: { color: '#ffffff', fontSize: 11, marginBottom: 2, textShadowColor: '#000', textShadowOffset: {width: 1, height: 1}, textShadowRadius: 3 },
  watermarkBold: { fontWeight: 'bold', color: '#fde047' },
  cameraFooter: { flexDirection: 'row', padding: 20, backgroundColor: '#111827', justifyContent: 'space-between' },
  btnDiscard: { backgroundColor: '#ef4444', paddingVertical: 12, paddingHorizontal: 20, borderRadius: 8 },
  btnStamp: { flex: 1, backgroundColor: '#10b981', paddingVertical: 12, marginLeft: 15, borderRadius: 8, alignItems: 'center' },
  btnTextWhite: { color: '#ffffff', fontSize: 14, fontWeight: 'bold' },
  cameraHeaderOverlay: { flexDirection: 'row', justifyContent: 'space-between', padding: 20, paddingTop: 40, backgroundColor: 'rgba(0,0,0,0.4)' },
  btnCameraBack: { backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6 },
  cameraTagLabel: { backgroundColor: '#2563eb', color: '#ffffff', fontSize: 10, fontWeight: 'bold', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, overflow: 'hidden' },
  cameraCaptureFooter: { position: 'absolute', bottom: 40, width: '100%', alignItems: 'center' },
  btnCaptureOuter: { width: 70, height: 70, borderRadius: 35, backgroundColor: 'rgba(255,255,255,0.3)', justifyContent: 'center', alignItems: 'center' },
  btnCaptureInner: { width: 54, height: 54, borderRadius: 27, backgroundColor: '#ffffff' }
});
