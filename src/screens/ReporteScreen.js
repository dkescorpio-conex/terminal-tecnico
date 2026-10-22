import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, Alert, Image, StyleSheet } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import ViewShot from 'react-native-view-shot';
import { syncEngine } from '../shared/syncEngine';
import { supabase } from '../shared/supabaseClient';
import { ACTIVIDADES_DATA } from '../shared/actividadesData';
import { Ionicons } from '@expo/vector-icons';

export default function ReporteScreen({ route, navigation }) {
  const initialTicket = route.params?.ticket || {};

  const [currentTicket, setCurrentTicket] = useState(initialTicket);
  
  const [fallaSolucionada, setFallaSolucionada] = useState('');
  const [solucionesSeleccionadas, setSolucionesSeleccionadas] = useState([]);
  const [solucionManual, setSolucionManual] = useState('');
  const [materialesUsados, setMaterialesUsados] = useState('');
  const [tecnicoComentarios, setTecnicoComentarios] = useState('');
  const [fotosLocales, setFotosLocales] = useState([]);
  const [opcionesSolucion, setOpcionesSolucion] = useState([]);
  
  const [showCamera, setShowCamera] = useState(false);
  const [previewPhoto, setPreviewPhoto] = useState(null);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [galleryPermission, requestGalleryPermission] = ImagePicker.useMediaLibraryPermissions();
  const [locationData, setLocationData] = useState(null);
  const [emailTecnico, setEmailTecnico] = useState('');
  const [currentTime, setCurrentTime] = useState('');

  const cameraRef = useRef(null);
  const viewShotRef = useRef(null);

  useEffect(() => {
    const fetchContextData = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user?.email) {
          setEmailTecnico(session.user.email);
        }
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
          setLocationData(loc);
        }
      } catch (error) {}
    };

    const revalidateData = async () => {
      if (!currentTicket.id) return;
      
      let latestActividad = (currentTicket.actividad || '').trim();
      
      try {
        const { data: freshTicket, error: ticketError } = await supabase
          .from('tickets')
          .select('id, actividad, cliente, olt, direccion, ciudad, estado')
          .eq('id', currentTicket.id)
          .single();
          
        if (!ticketError && freshTicket) {
          setCurrentTicket(prev => ({ ...prev, ...freshTicket }));
          latestActividad = (freshTicket.actividad || '').trim();
        }
      } catch (err) {}

      if (!latestActividad) return;

      try {
        const { data: optionsData, error: optionsError } = await supabase
          .from('opciones_actividades')
          .select('soluciones')
          .eq('actividad', latestActividad)
          .single();

        if (!optionsError && optionsData && Array.isArray(optionsData.soluciones) && optionsData.soluciones.length > 0) {
          setOpcionesSolucion(optionsData.soluciones);
        } else {
          setOpcionesSolucion(ACTIVIDADES_DATA.soluciones[latestActividad] || []);
        }
      } catch (err) {
        setOpcionesSolucion(ACTIVIDADES_DATA.soluciones[latestActividad] || []);
      }
    };

    fetchContextData();
    revalidateData();
  }, []);

  const toggleSolucion = (solucion) => {
    if (solucionesSeleccionadas.includes(solucion)) {
      setSolucionesSeleccionadas(solucionesSeleccionadas.filter(s => s !== solucion));
    } else {
      setSolucionesSeleccionadas([...solucionesSeleccionadas, solucion]);
    }
  };

  const prepareMetadata = () => {
    const now = new Date();
    const formattedTime = `${now.getDate().toString().padStart(2, '0')}/${(now.getMonth()+1).toString().padStart(2, '0')}/${now.getFullYear()} ${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    setCurrentTime(formattedTime);
  };

  const openCamera = async () => {
    if (!cameraPermission?.granted) {
      const { granted } = await requestCameraPermission();
      if (!granted) {
        Alert.alert('Permiso Denegado', 'Se necesita acceso a la cámara para el reporte.');
        return;
      }
    }
    prepareMetadata();
    setShowCamera(true);
  };

  const openGallery = async () => {
    if (!galleryPermission?.granted) {
      const { granted } = await requestGalleryPermission();
      if (!granted) {
        Alert.alert('Permiso Denegado', 'Se necesita acceso a la galería para seleccionar imágenes.');
        return;
      }
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
    });

    if (!result.canceled && result.assets && result.assets.length > 0) {
      setFotosLocales(prev => [...prev, result.assets[0].uri]);
    }
  };

  const takePicture = async () => {
    if (cameraRef.current) {
      try {
        const photo = await cameraRef.current.takePictureAsync({ quality: 0.5, skipProcessing: true });
        setPreviewPhoto(photo.uri);
      } catch (error) {
        Alert.alert('Error', 'No se pudo capturar la imagen.');
      }
    }
  };

  const saveWatermarkedPhoto = async () => {
    if (viewShotRef.current) {
      try {
        const uri = await viewShotRef.current.capture();
        setFotosLocales(prev => [...prev, uri]);
        setPreviewPhoto(null);
        setShowCamera(false);
      } catch (error) {
        Alert.alert('Error', 'No se pudo procesar la marca de agua.');
      }
    }
  };

  const discardPhoto = () => {
    setPreviewPhoto(null);
  };

  const handleSubmit = async () => {
    const opcionesText = solucionesSeleccionadas.join(', ');
    const manualText = solucionManual.trim();
    let solucionFinal = '';

    if (opcionesText && manualText) {
      solucionFinal = `${opcionesText} | ${manualText}`;
    } else if (opcionesText) {
      solucionFinal = opcionesText;
    } else {
      solucionFinal = manualText;
    }

    if (!fallaSolucionada || !solucionFinal) {
      Alert.alert('Incompleto', 'Falla Solucionada y Soluciones Aplicadas son obligatorios.');
      return;
    }
    if (!materialesUsados.trim()) {
      Alert.alert('Incompleto', 'Debes indicar el material usado (o escribir "Ninguno").');
      return;
    }
    if (fotosLocales.length < 2) {
      Alert.alert('Auditoría', 'Debes incluir al menos dos fotografías de evidencia.');
      return;
    }

    const payload = {
      actividad_2: currentTicket.actividad || '',
      falla_solucionada: fallaSolucionada,
      solucion_aplicada: solucionFinal,
      materiales_usados: materialesUsados,
      tecnico_comentarios1: tecnicoComentarios,
      fotos_locales: fotosLocales
    };

    try {
      await syncEngine.queueAction(currentTicket.id, 'REPORTE_TECNICO', payload, { paso_actual: 7 });
      Alert.alert('Éxito', 'Reporte guardado. Se sincronizará en segundo plano.', [
        { text: 'OK', onPress: () => navigation.goBack() }
      ]);
    } catch (err) {
      Alert.alert('Error', 'No se pudo encolar el reporte.');
    }
  };

  const renderWatermarkPreview = () => {
    const lat = locationData?.coords?.latitude?.toFixed(6) || 'Desconocida';
    const lon = locationData?.coords?.longitude?.toFixed(6) || 'Desconocida';
    const techName = emailTecnico || 'Técnico Autorizado';

    return (
      <View style={styles.cameraContainer}>
        <ViewShot ref={viewShotRef} options={{ format: 'jpg', quality: 0.8 }} style={styles.viewShotWrapper}>
          <Image source={{ uri: previewPhoto }} style={styles.fullImage} resizeMode="cover" />
          <View style={styles.watermarkOverlay}>
            <Text style={styles.watermarkText}>O&M - Fibex Telecom</Text>
            <Text style={styles.watermarkText}>Fecha: {currentTime}</Text>
            <Text style={styles.watermarkText}>Técnico: {techName}</Text>
            <Text style={styles.watermarkText}>GPS: {lat}, {lon}</Text>
          </View>
        </ViewShot>
        <View style={styles.previewControls}>
          <TouchableOpacity style={styles.btnDiscard} onPress={discardPhoto}>
            <Ionicons name="close-circle" size={40} color="#fff" />
            <Text style={styles.btnTextWhite}>Descartar</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.btnAccept} onPress={saveWatermarkedPhoto}>
            <Ionicons name="checkmark-circle" size={40} color="#fff" />
            <Text style={styles.btnTextWhite}>Guardar</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  if (previewPhoto) {
    return renderWatermarkPreview();
  }

  if (showCamera) {
    return (
      <View style={styles.cameraContainer}>
        <CameraView ref={cameraRef} style={styles.fullCamera} facing="back">
          <View style={styles.cameraHeader}>
            <TouchableOpacity onPress={() => setShowCamera(false)} style={styles.closeCameraBtn}>
              <Ionicons name="close" size={30} color="#fff" />
            </TouchableOpacity>
          </View>
          <View style={styles.cameraFooter}>
            <TouchableOpacity onPress={takePicture} style={styles.captureBtn}>
              <View style={styles.captureInner} />
            </TouchableOpacity>
          </View>
        </CameraView>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Reporte Ejecución</Text>
      </View>

      <ScrollView style={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.infoCard}>
          <Text style={styles.infoText}><Text style={styles.bold}>Cliente:</Text> {currentTicket.cliente || 'N/A'}</Text>
          <Text style={styles.infoText}><Text style={styles.bold}>OLT / Puerto:</Text> {currentTicket.olt || 'N/A'}</Text>
          <View style={styles.locationBadge}>
            <Ionicons name="location" size={14} color="#dc2626" />
            <Text style={styles.locationText}>{currentTicket.direccion}, {currentTicket.ciudad}, {currentTicket.estado}</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>ACTIVIDAD A EJECUTAR</Text>
        <View style={styles.actividadBox}>
          <Text style={styles.actividadText}>{currentTicket.actividad}</Text>
        </View>

        <Text style={styles.sectionTitle}>¿SE SOLUCIONÓ LA FALLA? *</Text>
        <View style={styles.radioGroup}>
          {['Sí', 'No', 'Requiere Escalar'].map((opcion) => (
            <TouchableOpacity
              key={opcion}
              style={[styles.radioBtn, fallaSolucionada === opcion && styles.radioBtnActive]}
              onPress={() => setFallaSolucionada(opcion)}
            >
              <Text style={[styles.radioText, fallaSolucionada === opcion && styles.radioTextActive]}>
                {opcion}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.sectionTitle}>SOLUCIONES APLICADAS *</Text>
        <View style={styles.cardWrapper}>
          {opcionesSolucion.length > 0 && (
            <View>
              {opcionesSolucion.map((solucion, idx) => (
                <TouchableOpacity
                  key={idx}
                  style={styles.checkboxRow}
                  onPress={() => toggleSolucion(solucion)}
                >
                  <Ionicons
                    name={solucionesSeleccionadas.includes(solucion) ? 'checkbox' : 'square-outline'}
                    size={24}
                    color={solucionesSeleccionadas.includes(solucion) ? '#2563eb' : '#94a3b8'}
                  />
                  <Text style={styles.checkboxLabel}>{solucion}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
          <TextInput
            style={styles.hybridInput}
            value={solucionManual}
            onChangeText={setSolucionManual}
            placeholder={opcionesSolucion.length > 0 ? "Otras soluciones o detalles adicionales..." : "Describe el trabajo realizado"}
            multiline
          />
        </View>

        <Text style={styles.sectionTitle}>MATERIAL USADO *</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          value={materialesUsados}
          onChangeText={setMaterialesUsados}
          placeholder='Ej: 20m cable drop, 2 conectores APC (Escribe "Ninguno" si no aplica)'
          multiline
        />

        <Text style={styles.sectionTitle}>COMENTARIOS DEL TÉCNICO (OPCIONAL)</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          value={tecnicoComentarios}
          onChangeText={setTecnicoComentarios}
          placeholder="Observaciones adicionales sobre la ejecución..."
          multiline
        />

        <Text style={styles.sectionTitle}>EVIDENCIAS (MÍN 2) *</Text>
        <View style={styles.photoContainer}>
          {fotosLocales.length === 0 ? (
            <View style={styles.emptyPhotoBox}>
              <Ionicons name="camera-outline" size={40} color="#cbd5e1" />
              <Text style={styles.emptyPhotoText}>No has adjuntado evidencias.</Text>
            </View>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.photoScroll}>
              {fotosLocales.map((uri, idx) => (
                <View key={idx} style={styles.thumbnailWrapper}>
                  <Image source={{ uri }} style={styles.thumbnail} />
                  <TouchableOpacity style={styles.removePhotoBtn} onPress={() => setFotosLocales(fotosLocales.filter((_, i) => i !== idx))}>
                    <Ionicons name="close" size={16} color="#fff" />
                  </TouchableOpacity>
                </View>
              ))}
            </ScrollView>
          )}
          <View style={styles.mediaButtonsRow}>
            <TouchableOpacity style={styles.galleryTriggerBtn} onPress={openGallery}>
              <Ionicons name="images" size={20} color="#2563eb" />
              <Text style={styles.galleryTriggerText}>Galería</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.cameraTriggerBtn} onPress={openCamera}>
              <Ionicons name="camera" size={20} color="#10b981" />
              <Text style={styles.cameraTriggerText}>Cámara</Text>
            </TouchableOpacity>
          </View>
        </View>

        <TouchableOpacity style={styles.submitBtn} onPress={handleSubmit}>
          <Ionicons name="send" size={18} color="#fff" style={{ marginRight: 8 }} />
          <Text style={styles.submitBtnText}>Finalizar y Enviar Reporte</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f1f5f9' },
  header: { backgroundColor: '#1d4ed8', padding: 20, paddingTop: 40, flexDirection: 'row', alignItems: 'center' },
  backBtn: { marginRight: 15 },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  content: { padding: 15 },
  infoCard: { backgroundColor: '#fff', padding: 15, borderRadius: 8, marginBottom: 20, borderWidth: 1, borderColor: '#e2e8f0' },
  infoText: { fontSize: 13, color: '#334155', marginBottom: 4 },
  bold: { fontWeight: 'bold', color: '#0f172a' },
  locationBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#ecfdf5', padding: 8, borderRadius: 6, marginTop: 8, borderWidth: 1, borderColor: '#d1fae5' },
  locationText: { fontSize: 11, color: '#065f46', marginLeft: 4, flex: 1 },
  sectionTitle: { fontSize: 12, fontWeight: 'bold', color: '#64748b', marginBottom: 8, marginTop: 10 },
  actividadBox: { backgroundColor: '#e2e8f0', padding: 15, borderRadius: 8, marginBottom: 15 },
  actividadText: { fontSize: 14, fontWeight: 'bold', color: '#1e293b' },
  radioGroup: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 },
  radioBtn: { flex: 1, backgroundColor: '#fff', paddingVertical: 12, borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 8, alignItems: 'center', marginHorizontal: 4 },
  radioBtnActive: { backgroundColor: '#f0fdf4', borderColor: '#22c55e' },
  radioText: { fontSize: 13, color: '#64748b', fontWeight: '600' },
  radioTextActive: { color: '#166534', fontWeight: 'bold' },
  cardWrapper: { backgroundColor: '#fff', borderRadius: 8, borderWidth: 1, borderColor: '#e2e8f0', padding: 5, marginBottom: 20 },
  checkboxRow: { flexDirection: 'row', alignItems: 'center', padding: 12, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  checkboxLabel: { fontSize: 14, color: '#334155', marginLeft: 10, flex: 1 },
  input: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 8, padding: 12, fontSize: 14, color: '#0f172a', marginBottom: 20 },
  textArea: { height: 80, textAlignVertical: 'top' },
  hybridInput: { backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 8, padding: 12, fontSize: 14, color: '#0f172a', margin: 10, height: 80, textAlignVertical: 'top' },
  photoContainer: { backgroundColor: '#fff', borderRadius: 8, borderWidth: 1, borderColor: '#e2e8f0', padding: 15, marginBottom: 30, alignItems: 'center' },
  emptyPhotoBox: { alignItems: 'center', justifyContent: 'center', paddingVertical: 20 },
  emptyPhotoText: { color: '#94a3b8', fontSize: 12, marginTop: 8, fontStyle: 'italic' },
  photoScroll: { flexDirection: 'row', width: '100%', marginBottom: 15 },
  thumbnailWrapper: { position: 'relative', marginRight: 10 },
  thumbnail: { width: 80, height: 80, borderRadius: 8, borderWidth: 1, borderColor: '#cbd5e1' },
  removePhotoBtn: { position: 'absolute', top: -5, right: -5, backgroundColor: '#ef4444', borderRadius: 12, width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },
  mediaButtonsRow: { flexDirection: 'row', justifyContent: 'flex-end', width: '100%', gap: 10, marginTop: 10 },
  cameraTriggerBtn: { flexDirection: 'row', backgroundColor: '#ecfdf5', borderWidth: 1, borderColor: '#10b981', paddingVertical: 8, paddingHorizontal: 15, borderRadius: 20, alignItems: 'center' },
  cameraTriggerText: { color: '#059669', fontSize: 12, fontWeight: 'bold', marginLeft: 5 },
  galleryTriggerBtn: { flexDirection: 'row', backgroundColor: '#eff6ff', borderWidth: 1, borderColor: '#3b82f6', paddingVertical: 8, paddingHorizontal: 15, borderRadius: 20, alignItems: 'center' },
  galleryTriggerText: { color: '#2563eb', fontSize: 12, fontWeight: 'bold', marginLeft: 5 },
  submitBtn: { backgroundColor: '#2563eb', padding: 15, borderRadius: 8, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginBottom: 40 },
  submitBtnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  cameraContainer: { flex: 1, backgroundColor: '#000' },
  fullCamera: { flex: 1, justifyContent: 'space-between' },
  cameraHeader: { padding: 40, alignItems: 'flex-end' },
  closeCameraBtn: { backgroundColor: 'rgba(0,0,0,0.5)', padding: 10, borderRadius: 25 },
  cameraFooter: { padding: 30, alignItems: 'center', paddingBottom: 50 },
  captureBtn: { width: 70, height: 70, borderRadius: 35, backgroundColor: 'rgba(255,255,255,0.3)', justifyContent: 'center', alignItems: 'center' },
  captureInner: { width: 54, height: 54, borderRadius: 27, backgroundColor: '#fff' },
  viewShotWrapper: { flex: 1 },
  fullImage: { width: '100%', height: '100%' },
  watermarkOverlay: { position: 'absolute', bottom: 20, left: 20, right: 20, backgroundColor: 'rgba(0,0,0,0.6)', padding: 10, borderRadius: 8 },
  watermarkText: { color: '#fff', fontSize: 12, fontWeight: 'bold', textShadowColor: '#000', textShadowOffset: { width: 1, height: 1 }, textShadowRadius: 3, marginBottom: 2 },
  previewControls: { flexDirection: 'row', justifyContent: 'space-around', padding: 20, backgroundColor: '#000' },
  btnDiscard: { alignItems: 'center' },
  btnAccept: { alignItems: 'center' },
  btnTextWhite: { color: '#fff', marginTop: 5, fontSize: 14, fontWeight: 'bold' }
});
