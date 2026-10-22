import React, { useState, useEffect, useRef } from 'react';
import { 
  View, Text, TextInput, TouchableOpacity, StyleSheet, 
  ScrollView, Image, Alert, SafeAreaView, ActivityIndicator
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import ViewShot from 'react-native-view-shot';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { syncEngine } from '../shared/syncEngine';

const SeccionElemento = ({ 
  titulo, pregunta, prefijo, form, onChange, fotoPreview, onRequestCamera, onRequestGallery, onRemoveFoto 
}) => {
  const tieneDano = form[`${prefijo}_danado`];

  return (
    <View style={styles.sectionCard}>
      <Text style={styles.sectionTitle}>{titulo}</Text>
      
      <View style={styles.questionBox}>
        <Text style={styles.questionText}>{pregunta}</Text>
        <View style={styles.segmentedControl}>
          <TouchableOpacity 
            style={[styles.segmentBtn, tieneDano === 'NO' && styles.segmentBtnActive]} 
            onPress={() => onChange(`${prefijo}_danado`, 'NO')}
          >
            <Text style={[styles.segmentText, tieneDano === 'NO' && styles.segmentTextActive]}>NO</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.segmentBtn, tieneDano === 'SI' && styles.segmentBtnActiveError]} 
            onPress={() => onChange(`${prefijo}_danado`, 'SI')}
          >
            <Text style={[styles.segmentText, tieneDano === 'SI' && styles.segmentTextActive]}>SÍ</Text>
          </TouchableOpacity>
        </View>
      </View>
      
      {tieneDano === 'SI' && (
        <View style={styles.conditionalBox}>
          <View style={styles.row}>
            <View style={styles.flex1}>
              <Text style={styles.label}>ESTADO</Text>
              <View style={styles.segmentedControl}>
                <TouchableOpacity 
                  style={[styles.segmentBtn, form[`${prefijo}_estado`] === 'REEMPLAZO' && styles.segmentBtnActive]} 
                  onPress={() => onChange(`${prefijo}_estado`, 'REEMPLAZO')}
                >
                  <Text style={[styles.segmentText, form[`${prefijo}_estado`] === 'REEMPLAZO' && styles.segmentTextActive]}>Reemplazo</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={[styles.segmentBtn, form[`${prefijo}_estado`] === 'DANADO' && styles.segmentBtnActive]} 
                  onPress={() => onChange(`${prefijo}_estado`, 'DANADO')}
                >
                  <Text style={[styles.segmentText, form[`${prefijo}_estado`] === 'DANADO' && styles.segmentTextActive]}>Dañado</Text>
                </TouchableOpacity>
              </View>
            </View>
            <View style={styles.flexHalf}>
              <Text style={styles.label}>CANTIDAD</Text>
              <TextInput
                style={styles.input}
                keyboardType="numeric"
                value={String(form[`${prefijo}_cantidad`])}
                onChangeText={(val) => onChange(`${prefijo}_cantidad`, parseInt(val) || 0)}
              />
            </View>
          </View>
          
          <View style={styles.marginTop}>
            <Text style={styles.label}>OBSERVACIONES</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              multiline
              numberOfLines={2}
              value={form[`${prefijo}_comentario`]}
              onChangeText={(val) => onChange(`${prefijo}_comentario`, val)}
              placeholder="Motivo del daño o reemplazo..."
            />
          </View>

          <View style={styles.evidenceBox}>
            <View style={styles.evidenceHeader}>
              <Text style={styles.label}>EVIDENCIA ESTAMPADA</Text>
              <View style={styles.btnRow}>
                <TouchableOpacity style={styles.btnGallerySmall} onPress={() => onRequestGallery(prefijo)}>
                  <Text style={styles.btnCameraText}>🖼 Galería</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.btnCameraSmall} onPress={() => onRequestCamera(prefijo)}>
                  <Text style={styles.btnCameraText}>📸 Cámara</Text>
                </TouchableOpacity>
              </View>
            </View>

            {!fotoPreview ? (
              <View style={styles.emptyEvidence}>
                <Text style={styles.emptyEvidenceText}>Sin evidencia capturada</Text>
              </View>
            ) : (
              <View style={styles.previewContainer}>
                <Image source={{ uri: fotoPreview }} style={styles.previewImage} />
                <TouchableOpacity style={styles.btnRemovePhoto} onPress={() => onRemoveFoto(prefijo)}>
                  <Text style={styles.btnRemoveText}>X</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      )}
    </View>
  );
};

export default function FormularioEjecucionActividad({ route, navigation }) {
  const { actividad = {}, onVolver, onSuccess } = route?.params || {};
  
  const handleVolver = onVolver || (() => navigation.goBack());
  const handleSuccess = onSuccess || (() => navigation.goBack());

  const [loading, setLoading] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const [galleryPermission, requestGalleryPermission] = ImagePicker.useMediaLibraryPermissions();
  const cameraRef = useRef(null);
  const viewShotRef = useRef(null);

  const rawQaData = actividad?.planificacion_olt_maestra || [];
  const qaData = Array.isArray(rawQaData) ? (rawQaData[0] || {}) : (rawQaData || {});
  
  const isRechazado = qaData.revision_fase1_estado === 'RECHAZADO';
  const comentarioRechazo = qaData.revision_fase1_comentario || 'Verifique las instrucciones del analista.';
  const comentarioAsignador = actividad?.comentario_asignador || '';

  const draftKey = `@draft_warning_${actividad?.id}_fase1`;

  const [form, setForm] = useState({
    sfp_danado: 'NO', sfp_estado: 'REEMPLAZO', sfp_cantidad: 1, sfp_comentario: '',
    patch_danado: 'NO', patch_estado: 'REEMPLAZO', patch_cantidad: 1, patch_comentario: '',
    pigtail_danado: 'NO', pigtail_estado: 'REEMPLAZO', pigtail_cantidad: 1, pigtail_comentario: '',
    fusion_danado: 'NO', fusion_estado: 'REEMPLAZO', fusion_cantidad: 1, fusion_comentario: ''
  });

  const [fotosEstampadas, setFotosEstampadas] = useState({
    sfp: null, patch: null, pigtail: null, fusion: null
  });

  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [activePrefix, setActivePrefix] = useState(null);
  const [previewRawImage, setPreviewRawImage] = useState(null);
  const [locationData, setLocationData] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    const loadDraft = async () => {
      try {
        const draftStr = await AsyncStorage.getItem(draftKey);
        if (draftStr) {
          const draft = JSON.parse(draftStr);
          if (draft.form) setForm(draft.form);
          if (draft.fotosEstampadas) setFotosEstampadas(draft.fotosEstampadas);
        }
      } catch (e) {}
    };
    loadDraft();
  }, [draftKey]);

  useEffect(() => {
    const saveDraft = async () => {
      try {
        await AsyncStorage.setItem(draftKey, JSON.stringify({ form, fotosEstampadas }));
      } catch (e) {}
    };
    saveDraft();
  }, [form, fotosEstampadas, draftKey]);

  const handleInputChange = (campo, valor) => {
    setForm(prev => ({ ...prev, [campo]: valor }));
  };

  const handleRemoveFoto = (prefijo) => {
    setFotosEstampadas(prev => ({ ...prev, [prefijo]: null }));
  };

  const abrirCamara = async (prefijo) => {
    if (!permission) await requestPermission();
    else if (!permission.granted) {
      const newPermission = await requestPermission();
      if (!newPermission.granted) return Alert.alert('Permiso Denegado', 'Necesitas acceso a la cámara.');
    }

    const { status: locStatus } = await Location.requestForegroundPermissionsAsync();
    if (locStatus !== 'granted') return Alert.alert('Permiso Denegado', 'El GPS es obligatorio.');

    setActivePrefix(prefijo);
    setIsCameraOpen(true);
  };

  const abrirGaleria = async (prefijo) => {
    if (!galleryPermission?.granted) {
      const newPerm = await requestGalleryPermission();
      if (!newPerm.granted) return Alert.alert('Permiso Denegado', 'Necesitas acceso a la galería.');
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
    });

    if (!result.canceled && result.assets && result.assets.length > 0) {
      setFotosEstampadas(prev => ({ ...prev, [prefijo]: result.assets[0].uri }));
    }
  };

  const capturarFoto = async () => {
    if (cameraRef.current) {
      setIsProcessing(true);
      try {
        const photo = await cameraRef.current.takePictureAsync({ quality: 0.8 });
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
        const now = new Date();
        const fDate = `${now.getDate().toString().padStart(2, '0')}/${(now.getMonth() + 1).toString().padStart(2, '0')}/${now.getFullYear()} ${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

        setLocationData({
          lat: loc.coords.latitude.toFixed(6),
          lon: loc.coords.longitude.toFixed(6),
          date: fDate,
          tech: actividad?.tecnico_id || 'Técnico O&M',
          nodo: activePrefix?.toUpperCase() || 'NODO'
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
      setFotosEstampadas(prev => ({ ...prev, [activePrefix]: uriEstampada }));
      setPreviewRawImage(null);
      setLocationData(null);
      setActivePrefix(null);
    } catch (error) {
      Alert.alert('Error', 'Fallo al procesar la marca de agua.');
    } finally {
      setIsProcessing(false);
    }
  };

  const descartarEstampado = () => {
    setPreviewRawImage(null);
    setLocationData(null);
  };

  const guardarEjecucion = async () => {
    if (form.sfp_danado === 'SI' && !fotosEstampadas.sfp) return Alert.alert('Evidencia', 'Falta foto de SFP.');
    if (form.patch_danado === 'SI' && !fotosEstampadas.patch) return Alert.alert('Evidencia', 'Falta foto de Patch Cord.');
    if (form.pigtail_danado === 'SI' && !fotosEstampadas.pigtail) return Alert.alert('Evidencia', 'Falta foto de Pigtail.');
    if (form.fusion_danado === 'SI' && !fotosEstampadas.fusion) return Alert.alert('Evidencia', 'Falta foto de Fusión.');

    setLoading(true);

    try {
      const payloadMaestra = {
        sfp_danados: form.sfp_danado === 'SI',
        sfp_cantidad: form.sfp_danado === 'SI' ? form.sfp_cantidad : 0,
        sfp_comentario: form.sfp_danado === 'SI' ? form.sfp_comentario : null,
        sfp_evidencia_local: fotosEstampadas.sfp,

        patchcord_danados: form.patch_danado === 'SI',
        patchcord_cantidad: form.patch_danado === 'SI' ? form.patch_cantidad : 0,
        patchcord_comentario: form.patch_danado === 'SI' ? form.patch_comentario : null,
        patchcord_evidencia_local: fotosEstampadas.patch,

        odf_piteil_danados: form.pigtail_danado === 'SI',
        odf_piteil_cantidad: form.pigtail_danado === 'SI' ? form.pigtail_cantidad : 0,
        odf_piteil_comentario: form.pigtail_danado === 'SI' ? form.pigtail_comentario : null,
        odf_piteil_evidencia_local: fotosEstampadas.pigtail,

        odf_fusion_danados: form.fusion_danado === 'SI',
        odf_fusion_cantidad: form.fusion_danado === 'SI' ? form.fusion_cantidad : 0,
        odf_fusion_comentario: form.fusion_danado === 'SI' ? form.fusion_comentario : null,
        odf_fusion_evidencia_local: fotosEstampadas.fusion,

        paso_interno_fase1: 4,
        revision_fase1_estado: 'PENDIENTE',
        revision_fase1_comentario: null,
        fecha_fin_f1: new Date().toISOString()
      };

      const payloadWarning = {
        estatus: 'EJECUTADO'
      };

      const ticketActualizado = { ...actividad, estatus: 'EJECUTADO' };

      await syncEngine.queueAction(actividad.id, 'AUDITORIA_FASE1_WARNING', {
        planificacion_id: actividad.id_planificacion_olt,
        payloadMaestra,
        payloadWarning
      }, ticketActualizado);

      await AsyncStorage.removeItem(draftKey);
      Alert.alert('Registro Guardado', 'Fase 1 registrada. En cola de sincronización...');
      handleSuccess(actividad.id);

    } catch (error) {
      Alert.alert('Error', 'Fallo al guardar ejecución.');
    } finally {
      setLoading(false);
    }
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
            <Text style={styles.cameraTagLabel}>{activePrefix?.toUpperCase()}</Text>
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
          <Text style={styles.infoTitle}>Fase de Planta Interna / Externa</Text>
          <Text style={styles.infoText}>Auditoría de hardware físico. Adjunte evidencias generadas por la cámara nativa o la galería para elementos afectados.</Text>
        </View>

        <SeccionElemento titulo="1. Revisión de SFP" pregunta="¿SFP dañados o reemplazados?" prefijo="sfp" form={form} onChange={handleInputChange} fotoPreview={fotosEstampadas.sfp} onRequestCamera={abrirCamara} onRequestGallery={abrirGaleria} onRemoveFoto={handleRemoveFoto} />
        <SeccionElemento titulo="2. Patch Cords" pregunta="¿Patch Cords dañados o reemplazados?" prefijo="patch" form={form} onChange={handleInputChange} fotoPreview={fotosEstampadas.patch} onRequestCamera={abrirCamara} onRequestGallery={abrirGaleria} onRemoveFoto={handleRemoveFoto} />
        <SeccionElemento titulo="3. Pigtails ODF" pregunta="¿Pigtails dañados o reemplazados?" prefijo="pigtail" form={form} onChange={handleInputChange} fotoPreview={fotosEstampadas.pigtail} onRequestCamera={abrirCamara} onRequestGallery={abrirGaleria} onRemoveFoto={handleRemoveFoto} />
        <SeccionElemento titulo="4. Fusiones" pregunta="¿Se rehicieron fusiones dañadas?" prefijo="fusion" form={form} onChange={handleInputChange} fotoPreview={fotosEstampadas.fusion} onRequestCamera={abrirCamara} onRequestGallery={abrirGaleria} onRemoveFoto={handleRemoveFoto} />
      </ScrollView>

      <View style={styles.bottomBar}>
        <TouchableOpacity style={styles.btnVolver} onPress={handleVolver} disabled={loading}>
          <Text style={styles.btnVolverText}>Cancelar</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.btnSubmit, isRechazado && styles.btnSubmitRechazo]} onPress={guardarEjecucion} disabled={loading}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnSubmitText}>{isRechazado ? 'Subir Correcciones' : 'Guardar Ejecución'}</Text>}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  scrollArea: { padding: 16, paddingBottom: 100 },
  sectionCard: { backgroundColor: '#ffffff', borderRadius: 12, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: '#e2e8f0', elevation: 1 },
  sectionTitle: { fontSize: 14, fontWeight: 'bold', color: '#1e293b', marginBottom: 12, borderBottomWidth: 1, borderBottomColor: '#f1f5f9', paddingBottom: 8 },
  questionBox: { backgroundColor: '#f8fafc', padding: 12, borderRadius: 8, borderWidth: 1, borderColor: '#e2e8f0', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  questionText: { fontSize: 13, fontWeight: 'bold', color: '#334155', flex: 1, paddingRight: 8 },
  segmentedControl: { flexDirection: 'row', backgroundColor: '#e2e8f0', borderRadius: 8, padding: 2 },
  segmentBtn: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  segmentBtnActive: { backgroundColor: '#ffffff', elevation: 2 },
  segmentBtnActiveError: { backgroundColor: '#ef4444', elevation: 2 },
  segmentText: { fontSize: 12, fontWeight: 'bold', color: '#64748b' },
  segmentTextActive: { color: '#0f172a' },
  conditionalBox: { marginTop: 16, paddingTop: 16, borderTopWidth: 1, borderTopColor: '#f1f5f9' },
  row: { flexDirection: 'row', gap: 12 },
  flex1: { flex: 1 },
  flexHalf: { flex: 0.5 },
  label: { fontSize: 10, fontWeight: 'bold', color: '#64748b', marginBottom: 6 },
  input: { backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, fontSize: 13, color: '#0f172a' },
  textArea: { height: 60, textAlignVertical: 'top' },
  marginTop: { marginTop: 12 },
  evidenceBox: { marginTop: 16, borderTopWidth: 1, borderTopColor: '#f1f5f9', paddingTop: 12 },
  evidenceHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  btnRow: { flexDirection: 'row', gap: 8 },
  btnCameraSmall: { backgroundColor: '#10b981', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6 },
  btnGallerySmall: { backgroundColor: '#3b82f6', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6 },
  btnCameraText: { color: '#ffffff', fontSize: 11, fontWeight: 'bold' },
  emptyEvidence: { height: 80, backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#cbd5e1', borderStyle: 'dashed', borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  emptyEvidenceText: { fontSize: 11, fontWeight: 'bold', color: '#94a3b8' },
  previewContainer: { height: 120, borderRadius: 8, overflow: 'hidden', borderWidth: 1, borderColor: '#e2e8f0' },
  previewImage: { width: '100%', height: '100%' },
  btnRemovePhoto: { position: 'absolute', top: 4, right: 4, backgroundColor: '#ef4444', width: 24, height: 24, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  btnRemoveText: { color: '#ffffff', fontSize: 10, fontWeight: 'bold' },
  assignerBox: { backgroundColor: '#eef2ff', borderLeftWidth: 4, borderLeftColor: '#6366f1', padding: 12, borderRadius: 8, marginBottom: 16 },
  assignerTitle: { fontSize: 11, fontWeight: 'bold', color: '#3730a3', marginBottom: 4 },
  assignerText: { fontSize: 12, color: '#312e81', fontStyle: 'italic' },
  rejectBox: { backgroundColor: '#fef2f2', borderLeftWidth: 4, borderLeftColor: '#dc2626', padding: 12, borderRadius: 8, marginBottom: 16 },
  rejectTitle: { fontSize: 11, fontWeight: 'bold', color: '#991b1b', marginBottom: 4 },
  rejectText: { fontSize: 12, color: '#7f1d1d', fontStyle: 'italic', backgroundColor: '#ffffff', padding: 8, borderRadius: 4 },
  rejectSub: { fontSize: 10, fontWeight: 'bold', color: '#b91c1c', marginTop: 8, textAlign: 'right' },
  infoBox: { backgroundColor: '#eff6ff', borderWidth: 1, borderColor: '#bfdbfe', padding: 12, borderRadius: 8, marginBottom: 16 },
  infoTitle: { fontSize: 13, fontWeight: 'bold', color: '#1e3a8a' },
  infoText: { fontSize: 11, color: '#1d4ed8', marginTop: 4 },
  bottomBar: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: '#ffffff', borderTopWidth: 1, borderTopColor: '#e2e8f0', padding: 16, flexDirection: 'row', gap: 12, elevation: 10 },
  btnVolver: { flex: 1, backgroundColor: '#f1f5f9', paddingVertical: 14, borderRadius: 10, alignItems: 'center', borderWidth: 1, borderColor: '#e2e8f0' },
  btnVolverText: { fontSize: 14, fontWeight: 'bold', color: '#475569' },
  btnSubmit: { flex: 2, backgroundColor: '#2563eb', paddingVertical: 14, borderRadius: 10, alignItems: 'center' },
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
