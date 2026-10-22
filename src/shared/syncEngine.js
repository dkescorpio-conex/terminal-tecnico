import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabaseClient';

const TICKETS_KEY = '@tickets_locales';
const QUEUE_KEY = '@action_queue';

export const diagnosticLog = {
  messages: [],
  add(message, isError = false) {
    this.messages.push({ message, isError, timestamp: new Date().toISOString() });
    if (this.messages.length > 50) this.messages.shift();
    console.log(`[DiagnosticLog] ${isError ? 'ERROR' : 'INFO'}: ${message}`);
  },
  clear() {
    this.messages = [];
  },
  getLogs() {
    return this.messages;
  }
};

class SyncEngine {
  constructor() {
    this.actionQueue = [];
    this.localTickets = [];
    this.isSyncingUp = false;
    this.stateChangeCallback = null;
  }

  onSyncStateChange(callback) {
    this.stateChangeCallback = callback;
  }

  _notifyStateChange(isSyncing, hasNetworkError = false) {
    if (this.stateChangeCallback) {
      this.stateChangeCallback(isSyncing, hasNetworkError);
    }
  }

  async initDB() {
    try {
      const storedTickets = await AsyncStorage.getItem(TICKETS_KEY);
      if (storedTickets) {
        this.localTickets = JSON.parse(storedTickets);
        diagnosticLog.add(`DB local cargada: ${this.localTickets.length} tickets`);
      }
      const storedQueue = await AsyncStorage.getItem(QUEUE_KEY);
      if (storedQueue) {
        this.actionQueue = JSON.parse(storedQueue);
        diagnosticLog.add(`Cola de acciones cargada: ${this.actionQueue.length} acciones`);
      }
    } catch (error) {
      diagnosticLog.add(`Error en initDB: ${error.message}`, true);
    }
  }

  getLocalTickets() {
    return this.localTickets;
  }

  async queueAction(ticketId, actionType, payload, ticketActualizado) {
    this.localTickets = this.localTickets.map(t =>
      t.id === ticketId ? { ...t, ...ticketActualizado } : t
    );
    await AsyncStorage.setItem(TICKETS_KEY, JSON.stringify(this.localTickets));

    this.actionQueue.push({
      id: Date.now().toString(),
      ticketId,
      actionType,
      payload,
      timestamp: new Date().toISOString()
    });
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(this.actionQueue));

    this.syncUp();
  }

  async syncUp() {
    if (this.actionQueue.length === 0 || this.isSyncingUp) return;

    this.isSyncingUp = true;
    this._notifyStateChange(true);
    let networkErrorDetected = false;
    
    const colaPendiente = [...this.actionQueue];

    for (const action of colaPendiente) {
      try {
        diagnosticLog.add(`Procesando accion: ${action.actionType} para ticket: ${action.ticketId}`);

        if (action.actionType === 'REPORTE_TECNICO') {
          const { error: updateError } = await supabase.from('tickets').update({
            paso_actual: 7,
            actividad_2: action.payload.actividad_2,
            falla_solucionada: action.payload.falla_solucionada,
            solucion_aplicada: action.payload.solucion_aplicada,
            materiales_usados: action.payload.materiales_usados,
            tecnico_comentarios1: action.payload.tecnico_comentarios1,
            actualizado_en: new Date().toISOString()
          }).eq('id', action.ticketId);

          if (updateError) throw updateError;

          const textoComentarios = action.payload.tecnico_comentarios1 ? `\n• Comentarios: ${action.payload.tecnico_comentarios1}` : '';
          const textoBitacora = `REPORTE TÉCNICO:\n• Actividad Ejecutada: ${action.payload.actividad_2}\n• Falla Solucionada: ${action.payload.falla_solucionada}\n• Solución: ${action.payload.solucion_aplicada}\n• Materiales: ${action.payload.materiales_usados}${textoComentarios}`;
          
          const ticketLocal = this.localTickets.find(t => t.id === action.ticketId);
          const tecnicoEmail = ticketLocal ? ticketLocal.tecnico_id : 'Técnico (App)';

          const { error: histError } = await supabase.from('historial_ejecuciones').insert([{
            ticket_id: action.ticketId,
            usuario: tecnicoEmail,
            rol_usuario: 'tecnico',
            etapa_proceso: 6,
            nota_texto: textoBitacora,
            datos_enviados: action.payload
          }]);

          if (histError) throw histError;

          if (action.payload.fotos_locales && action.payload.fotos_locales.length > 0) {
            const formData = new FormData();
            formData.append('ticketId', action.ticketId.toString());

            action.payload.fotos_locales.forEach((uri) => {
              const filename = uri.split('/').pop();
              const match = /\.(\w+)$/.exec(filename);
              const type = match ? `image/${match[1]}` : `image/jpeg`;

              formData.append('fotos', {
                uri: uri,
                name: filename,
                type: type
              });
            });

            diagnosticLog.add(`Enviando ${action.payload.fotos_locales.length} fotos a Webhook REPORTE_TECNICO`);
            
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 15000);
            
            try {
              const webhookResponse = await fetch('https://flujos.fibex.ai/webhook/e66308ac-130d-4437-a105-c1cfe7c37036', {
                method: 'POST',
                body: formData,
                headers: { 'Content-Type': 'multipart/form-data' },
                signal: controller.signal
              });
              clearTimeout(timeoutId);
              if (!webhookResponse.ok) throw new Error(`Webhook tickets falló: ${webhookResponse.status}`);
            } catch (fetchError) {
              clearTimeout(timeoutId);
              if (fetchError.name === 'AbortError') throw new Error('Network request failed (Timeout)');
              throw fetchError;
            }
          }

          this.actionQueue = this.actionQueue.filter(a => a.id !== action.id);
        }
        else if (action.actionType === 'AUDITORIA_FASE1_WARNING') {
          const { planificacion_id, payloadMaestra, payloadWarning } = action.payload;
          const formData = new FormData();
          formData.append('actionType', action.actionType);
          formData.append('ticketId', action.ticketId.toString());
          formData.append('planificacion_id', planificacion_id);

          let hasPhotos = false;
          const keys = Object.keys(payloadMaestra);
          diagnosticLog.add(`FASE 1 - Limpiando llaves locales: ${keys.length} detectadas`);

          for (const key of keys) {
            if (key.endsWith('_local')) {
              if (payloadMaestra[key]) {
                hasPhotos = true;
                const localUri = payloadMaestra[key];
                const fileExt = localUri.split('.').pop() || 'jpg';
                const filename = `${key}.${fileExt}`;
                formData.append('fotos', { 
                  uri: localUri, 
                  name: filename, 
                  type: `image/${fileExt === 'jpg' ? 'jpeg' : fileExt}` 
                });
                diagnosticLog.add(`FASE 1 - Foto adjuntada: ${filename}`);
              }
              delete payloadMaestra[key];
            }
          }

          const { error: errMaestra } = await supabase.from('planificacion_olt_maestra').update(payloadMaestra).eq('id', planificacion_id);
          if (errMaestra) throw errMaestra;

          const { error: errWarning } = await supabase.from('actividades_warning').update(payloadWarning).eq('id', action.ticketId);
          if (errWarning) throw errWarning;

          if (hasPhotos) {
            diagnosticLog.add(`FASE 1 - Disparando webhook n8n`);
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 15000);
            
            try {
              const webhookResponse = await fetch('https://flujos.fibex.ai/webhook/7292c684-12cf-4b9b-930a-f51f5759c2d0', {
                method: 'POST',
                body: formData,
                headers: { 'Content-Type': 'multipart/form-data' },
                signal: controller.signal
              });
              clearTimeout(timeoutId);
              if (!webhookResponse.ok) throw new Error(`Webhook warning falló: ${webhookResponse.status}`);
            } catch (fetchError) {
              clearTimeout(timeoutId);
              if (fetchError.name === 'AbortError') throw new Error('Network request failed (Timeout)');
              throw fetchError;
            }
          }

          this.actionQueue = this.actionQueue.filter(a => a.id !== action.id);
        }
        else if (action.actionType === 'AUDITORIA_FASEN_WARNING') {
          const { planificacion_id, fase, puertosDetalle } = action.payload;
          const formData = new FormData();
          formData.append('actionType', action.actionType);
          formData.append('ticketId', action.ticketId.toString());
          formData.append('planificacion_id', planificacion_id);
          formData.append('fase', fase.toString());

          let hasPhotos = false;
          const puertosLimpios = JSON.parse(JSON.stringify(puertosDetalle));

          for (let i = 0; i < puertosLimpios.length; i++) {
            const puerto = puertosLimpios[i];
            const nodos = Object.keys(puerto).filter(k => k !== 'puerto' && k !== 'clientes');
            for (const nodo of nodos) {
              if (puerto[nodo]) {
                if (puerto[nodo].evidencia_local) {
                  hasPhotos = true;
                  const localUri = puerto[nodo].evidencia_local;
                  const fileExt = localUri.split('.').pop() || 'jpg';
                  const filename = `fase${fase}_p${i}_${nodo}.${fileExt}`;
                  formData.append('fotos', { 
                    uri: localUri, 
                    name: filename, 
                    type: `image/${fileExt === 'jpg' ? 'jpeg' : fileExt}` 
                  });
                }
                if ('evidencia_local' in puerto[nodo]) {
                  delete puerto[nodo].evidencia_local;
                }
              }
            }
          }

          const dynamicFaseKey = `puertos_fase${fase}_detalle`;
          const dynamicEstadoKey = `revision_fase${fase}_estado`;
          const dynamicComentarioKey = `revision_fase${fase}_comentario`;
          const dynamicFechaKey = `fecha_fin_f${fase}`;

          const finalMaestra = {
            [dynamicFaseKey]: puertosLimpios,
            fase_activa: fase,
            [dynamicEstadoKey]: 'PENDIENTE',
            [dynamicComentarioKey]: null,
            [dynamicFechaKey]: new Date().toISOString()
          };

          const finalWarning = {
            [dynamicFaseKey]: puertosLimpios,
            estatus: 'EJECUTADO'
          };

          const { error: errMaestra } = await supabase.from('planificacion_olt_maestra').update(finalMaestra).eq('id', planificacion_id);
          if (errMaestra) throw errMaestra;

          const { error: errWarning } = await supabase.from('actividades_warning').update(finalWarning).eq('id', action.ticketId);
          if (errWarning) throw errWarning;

          if (hasPhotos) {
            diagnosticLog.add(`FASE N - Disparando webhook n8n`);
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 15000);
            
            try {
              const webhookResponse = await fetch('https://flujos.fibex.ai/webhook/7292c684-12cf-4b9b-930a-f51f5759c2d0', {
                method: 'POST',
                body: formData,
                headers: { 'Content-Type': 'multipart/form-data' },
                signal: controller.signal
              });
              clearTimeout(timeoutId);
              if (!webhookResponse.ok) throw new Error(`Webhook warning falló: ${webhookResponse.status}`);
            } catch (fetchError) {
              clearTimeout(timeoutId);
              if (fetchError.name === 'AbortError') throw new Error('Network request failed (Timeout)');
              throw fetchError;
            }
          }

          this.actionQueue = this.actionQueue.filter(a => a.id !== action.id);
        }
        else {
          let actualizacion = {};

          if (action.actionType === 'ACEPTAR_TICKET') {
            actualizacion = { paso_actual: 5 };
          } else if (action.actionType === 'LLEGADA_SITIO') {
            actualizacion = {
              paso_actual: 6,
              latitud_cliente: action.payload.latitud,
              longitud_cliente: action.payload.longitud
            };
          }

          const { error } = await supabase.from('tickets').update(actualizacion).eq('id', action.ticketId);

          if (!error) {
            this.actionQueue = this.actionQueue.filter(a => a.id !== action.id);
          } else {
            throw error;
          }
        }
      } catch (err) {
        let det = err.message;
        if (err.code || err.details) {
          det = `Supabase Error [${err.code || 'N/A'}]: ${err.message} | Details: ${err.details || 'N/A'} | Hint: ${err.hint || 'N/A'}`;
        }
        diagnosticLog.add(`Fallo en SyncUp (${action.actionType}): ${det}`, true);
        
        // Detectar si el error fue por falta de internet
        if (det.includes('Network') || det.includes('fetch') || det.includes('Timeout') || det.includes('network')) {
          networkErrorDetected = true;
        }
      }
    }

    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(this.actionQueue));
    this.isSyncingUp = false;
    this._notifyStateChange(false, networkErrorDetected);
  }

  async syncDown(emailTecnico) {
    if (this.actionQueue.length > 0) {
      diagnosticLog.add(`syncDown interrumpido: Hay ${this.actionQueue.length} acciones pendientes en cola. Forzando syncUp primero.`);
      await this.syncUp();
    }

    diagnosticLog.clear();
    diagnosticLog.add(`Iniciando syncDown para ${emailTecnico}`);
    
    try {
      if (!emailTecnico) {
        return { success: false, error: 'Email de técnico vacío', tickets: [] };
      }

      const { data: dataTickets, error: errorTickets } = await supabase
        .from('tickets')
        .select('id, ticket_externo, paso_actual, titulo, tipo, especialidad, actividad, cliente, telefono, num_contrato, olt, direccion, barrio, zona_punto, ciudad, estado, instrucciones_tecnico, tecnico_id, metadata_olt')
        .eq('tecnico_id', emailTecnico)
        .in('paso_actual', [4, 5, 6]);

      if (errorTickets) throw errorTickets;

      const emailQuoted = `"${emailTecnico}"`;
      const filtroOr = `tecnico_id.eq.${emailQuoted},tecnico_fase2_id.eq.${emailQuoted},tecnico_fase3_id.eq.${emailQuoted},tecnico_fase4_id.eq.${emailQuoted}`;
      
      const { data: dataWarning, error: errorWarning } = await supabase
        .from('actividades_warning')
        .select('id, id_planificacion_olt, olt_name, region, estado, ciudad, fase_actual, estatus, tecnico_id, tecnico_fase2_id, tecnico_fase3_id, tecnico_fase4_id, comentario_asignador, puertos_fase2_detalle, puertos_fase3_detalle, puertos_fase4_detalle')
        .or(filtroOr)
        .eq('estatus', 'PENDIENTE');

      if (errorWarning) throw errorWarning;

      let dataMaestra = [];
      if (dataWarning && dataWarning.length > 0) {
        const planificacionIds = [...new Set(dataWarning.map(w => w.id_planificacion_olt).filter(Boolean))];
        
        if (planificacionIds.length > 0) {
          const { data: fetchMaestra, error: errorMaestra } = await supabase
            .from('planificacion_olt_maestra')
            .select('id, revision_fase1_estado, revision_fase1_comentario, revision_fase2_estado, revision_fase2_comentario, revision_fase3_estado, revision_fase3_comentario, revision_fase4_estado, revision_fase4_comentario')
            .in('id', planificacionIds);
            
          if (errorMaestra) throw errorMaestra;
          dataMaestra = fetchMaestra || [];
        }
      }

      const maestraMap = {};
      dataMaestra.forEach(m => {
        maestraMap[m.id] = m;
      });

      const formatWarningData = await Promise.all((dataWarning || []).map(async (w) => {
        const fetchClientsForPhase = async (puertosDetalle) => {
          if (!puertosDetalle || !Array.isArray(puertosDetalle)) return [];
          const newDetalle = [...puertosDetalle];
          for (let i = 0; i < newDetalle.length; i++) {
            if (!newDetalle[i].clientes || newDetalle[i].clientes.length === 0) {
              const puertoStr = newDetalle[i].puerto;
              const [boardStr, portStr] = puertoStr.split('/');
              const board = String(boardStr).trim();
              const port = String(portStr).trim();

              const { data, error } = await supabase
                .from('datos_olt')
                .select('name, address, status, signal, board, port')
                .eq('olt', w.olt_name)
                .eq('board', board)
                .eq('port', port)
                .limit(1000);

              if (!error) {
                newDetalle[i].clientes = data || [];
              } else {
                newDetalle[i].clientes = [];
              }
            }
          }
          return newDetalle;
        };

        if (w.fase_actual === 2) w.puertos_fase2_detalle = await fetchClientsForPhase(w.puertos_fase2_detalle);
        if (w.fase_actual === 3) w.puertos_fase3_detalle = await fetchClientsForPhase(w.puertos_fase3_detalle);
        if (w.fase_actual === 4) w.puertos_fase4_detalle = await fetchClientsForPhase(w.puertos_fase4_detalle);

        const maestraInfo = maestraMap[w.id_planificacion_olt] || {};

        return {
          ...w,
          planificacion_olt_maestra: [maestraInfo],
          titulo: 'Preventivo',
          tipo: 'Mantenimiento OLT',
          especialidad: 'Planta Externa / Interna',
          actividad: `Ejecución Fase ${w.fase_actual} O&M`,
          cliente: w.olt_name,
          paso_actual: 4,
          ticket_externo: w.id,
          is_actividad_om: true
        };
      }));

      this.localTickets = [...(dataTickets || []), ...formatWarningData];
      await AsyncStorage.setItem(TICKETS_KEY, JSON.stringify(this.localTickets));
      diagnosticLog.add(`Total tickets guardados localmente: ${this.localTickets.length}`);

      return { success: true, tickets: this.localTickets, error: null };

    } catch (error) {
      diagnosticLog.add(`Error en syncDown: ${error.message}`, true);
      const isNetworkError = error.message === 'Network request failed' || error.message.includes('fetch') || error.message.includes('Timeout') || error.message.includes('network');
      
      return { 
        success: isNetworkError, 
        error: isNetworkError ? 'offline_mode' : error.message, 
        tickets: this.localTickets 
      };
    }
  }
}

export const syncEngine = new SyncEngine();
