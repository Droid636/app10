import React, { useState, useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  Button,
  Alert,
  ActivityIndicator,
  Platform,
  ScrollView,
  TouchableOpacity,
  Modal,
} from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import DateTimePicker from '@react-native-community/datetimepicker';

// --- Interfaces y Constantes (Mantidas) ---

interface FileInfo {
  name: string;
  uri: string;
  size?: number;
}

const FORMAT_OPTIONS = ['JSON', 'TXT'];

export default function App() {
  // --- Estados del Formulario ---
  const [clientName, setClientName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [diners, setDiners] = useState('');
  const [notes, setNotes] = useState('');
  const [selectedArea, setSelectedArea] = useState<string>('');
  const [selectedFormat, setSelectedFormat] = useState<string>('JSON');

  const [date, setDate] = useState<Date>(new Date());
  const [time, setTime] = useState<Date>(new Date());
  const [saving, setSaving] = useState(false);
  const [files, setFiles] = useState<FileInfo[]>([]);

  // --- Estados de Modales/Pickers ---
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [showOptionsPicker, setShowOptionsPicker] = useState(false);
  const [showFormatPicker, setShowFormatPicker] = useState(false);

  const [tempDate, setTempDate] = useState<Date>(new Date());
  const [tempTime, setTempTime] = useState<Date>(new Date());

  const areaOptions = ['Interior', 'Terraza', 'Barra', 'Salón Privado'];

  // --- Funciones de Utilidad de Fecha (Mantenidas) ---
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 101 }, (_, i) => currentYear - 50 + i);
  const months = [
    'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
    'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'
  ];

  function getDaysInMonth(year: number, month: number): number {
    return new Date(year, month + 1, 0).getDate();
  }

  function getDaysArray(year: number, month: number): number[] {
    const days = getDaysInMonth(year, month);
    return Array.from({ length: days }, (_, i) => i + 1);
  }
  // --- Fin de funciones de utilidad de fecha ---

  useEffect(() => {
    if (Platform.OS !== 'web') {
      refreshFiles();
    }
  }, []);

  function getDocumentDirectory(): string | null {
    if (Platform.OS === 'web') {
      return null;
    }
    return FileSystem.documentDirectory;
  }

  function formatDate(date: Date): string {
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  }

  function formatTime(date: Date): string {
    let hours = date.getHours();
    const minutes = date.getMinutes();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12;
    const minutesStr = String(minutes).padStart(2, '0');
    return `${hours}:${minutesStr} ${ampm}`;
  }

  // --- Funciones de Lógica de Negocio (Mantenidas) ---

  function createReservationObject() {
    return {
      nombreCliente: clientName.trim(),
      telefono: phoneNumber.trim() || null,
      comensales: diners ? parseInt(diners) : null,
      area: selectedArea || null,
      fechaReserva: formatDate(date),
      horaReserva: formatTime(time),
      notas: notes.trim() || null,
      guardado: new Date().toISOString(),
    };
  }

  function generateContent(format: string) {
    const obj = createReservationObject();
    if (format === 'JSON') {
      return {
        content: JSON.stringify(obj, null, 2),
        mimeType: 'application/json',
        extension: 'json',
      };
    } else { // TXT
      const content =
`--- DETALLES DE LA RESERVA ---
Cliente: ${obj.nombreCliente}
Teléfono: ${obj.telefono || 'N/A'}
Comensales: ${obj.comensales}
Área: ${obj.area || 'No especificada'}
Fecha: ${obj.fechaReserva}
Hora: ${obj.horaReserva}
Notas: ${obj.notas || 'Ninguna'}
-----------------------------
Guardado: ${obj.guardado}`;
      return {
        content: content,
        mimeType: 'text/plain',
        extension: 'txt',
      };
    }
  }

  function generateFileName(extension: string): string {
    const sanitizedName = clientName.trim().replace(/[^a-zA-Z0-9]/g, '_') || 'ClienteAnonimo';
    const datePart = formatDate(date).replace(/\//g, '-');
    return `RESERVA-${sanitizedName}-${datePart}.${extension}`;
  }

  async function saveReservationJson() {
    if (!clientName.trim() || !diners) {
      Alert.alert('Faltan Datos', 'Por favor, ingresa tu Nombre y el número de Comensales.');
      return;
    }

    setSaving(true);
    try {
      const { content, mimeType, extension } = generateContent(selectedFormat);
      let fileName = generateFileName(extension);

      if (Platform.OS === 'web') {
        // Lógica de descarga en Web
        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        Alert.alert('Descarga Exitosa', `La reserva "${fileName}" se ha descargado.`);
        return;
      }

      const docDir = getDocumentDirectory();
      if (!docDir) throw new Error('No se encontró un directorio disponible para guardar.');

      const fileUri = docDir + fileName;
      await FileSystem.writeAsStringAsync(fileUri, content, {
        encoding: FileSystem.EncodingType.UTF8,
      });

      await refreshFiles();

      Alert.alert(
        'Reserva Guardada',
        `Reserva para ${clientName} guardada como ${fileName}.`,
        [
          { text: 'OK', style: 'default' },
          {
            text: 'Compartir/Exportar',
            onPress: async () => {
              await performShare(fileUri, mimeType);
            },
          },
        ]
      );
    } catch (e: any) {
      console.error('Error al guardar:', e);
      Alert.alert('Error al guardar', e?.message || 'Ocurrió un error inesperado al guardar la reserva.');
    } finally {
      setSaving(false);
    }
  }

  async function performShare(fileUri: string, mimeType: string) {
    try {
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(fileUri, {
          mimeType: mimeType,
          dialogTitle: 'Exportar Reserva (Selecciona App/Ubicación)',
        });
      } else {
        Alert.alert('Info', 'La función de compartir no está disponible.');
      }
    } catch (shareError: any) {
      Alert.alert('Error al Compartir', shareError?.message || 'Hubo un error al iniciar la función de compartir/exportar.');
    }
  }

  async function refreshFiles() {
    if (Platform.OS === 'web') {
      setFiles([]);
      return;
    }
    try {
      const docDir = getDocumentDirectory();
      if (!docDir) {
        setFiles([]);
        return;
      }

      const list = await FileSystem.readDirectoryAsync(docDir);
      const reservationFiles: FileInfo[] = [];

      for (const file of list) {
        const isReservationFile =
          file.toLowerCase().startsWith('reserva-') &&
          (file.toLowerCase().endsWith('.json') || file.toLowerCase().endsWith('.txt'));

        if (isReservationFile) {
          try {
            const fileUri = docDir + file;
            const fileInfo = await FileSystem.getInfoAsync(fileUri);
            if (fileInfo.exists && !fileInfo.isDirectory) {
              reservationFiles.push({
                name: file,
                uri: fileUri,
                size: fileInfo.size,
              });
            }
          } catch (e) {
            console.log(`Error al obtener info de ${file}:`, e);
          }
        }
      }

      reservationFiles.sort((a, b) => b.name.localeCompare(a.name));

      setFiles(reservationFiles);
    } catch (e: any) {
      console.error('Error al leer archivos:', e);
      setFiles([]);
    }
  }

  async function shareFile(fileInfo: FileInfo) {
    try {
      const info = await FileSystem.getInfoAsync(fileInfo.uri);
      if (!info.exists) {
        Alert.alert('Error', 'El archivo no existe.');
        await refreshFiles();
        return;
      }

      const mimeType = fileInfo.name.endsWith('.txt') ? 'text/plain' : 'application/json';

      await performShare(fileInfo.uri, mimeType);

    } catch (e: any) {
      Alert.alert('Error', e?.message || String(e));
    }
  }

  async function deleteFile(fileInfo: FileInfo) {
    Alert.alert(
      'Confirmar Eliminación',
      `¿Eliminar el archivo de reserva: "${fileInfo.name}"?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            try {
              const fileInfo_check = await FileSystem.getInfoAsync(fileInfo.uri);
              if (fileInfo_check.exists) {
                await FileSystem.deleteAsync(fileInfo.uri, { idempotent: true });
                Alert.alert('Éxito', 'Archivo eliminado correctamente.');
                await refreshFiles();
              } else {
                Alert.alert('Error', 'El archivo no existe.');
                await refreshFiles();
              }
            } catch (e: any) {
              Alert.alert('Error', e?.message || String(e));
            }
          },
        },
      ]
    );
  }

  // --- Funciones para DateTimePicker Nativo (Android/iOS) ---
  const onChangeDate = (event: any, selectedDate: Date | undefined) => {
    // Si la plataforma no es Web, ocultamos el selector. En Android, esto lo cierra.
    // En iOS, si se usa modo 'default' se oculta el modal nativo.
    if (Platform.OS !== 'web') setShowDatePicker(false); 

    if (event.type === 'set' && selectedDate) {
      setDate(selectedDate);
    }
  };

  const onChangeTime = (event: any, selectedTime: Date | undefined) => {
    if (Platform.OS !== 'web') setShowTimePicker(false);
    
    if (event.type === 'set' && selectedTime) {
      setTime(selectedTime);
    }
  };

  // Función para mostrar el picker nativo (Android) o el modal personalizado (iOS/Web)
  const showDateTimePicker = (mode: 'date' | 'time') => {
    if (Platform.OS === 'android' || Platform.OS === 'ios') {
      if (mode === 'date') {
        setShowDatePicker(true);
      } else {
        setShowTimePicker(true);
      }
    } else {
      // Web fallback a modales custom
      if (mode === 'date') {
        setTempDate(date);
        setShowDatePicker(true);
      } else {
        setTempTime(time);
        setShowTimePicker(true);
      }
    }
  };


  // --- Renderizado del Componente ---

  return (
    <ScrollView 
        style={styles.container} 
        contentContainerStyle={styles.contentContainer}
        keyboardShouldPersistTaps="handled" // Mejora la usabilidad al escribir
    >
      <StatusBar style="dark" />

      <Text style={styles.title}>Sistema de Reservas 🗓️</Text>
      <Text style={styles.headerSubtitle}>Administración de Mesas</Text>

      {/* --- CARD PRINCIPAL DEL FORMULARIO --- */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Crear Nueva Reserva</Text>
        <View style={styles.separator} />

        {/* Campo Nombre */}
        <Text style={styles.label}>Nombre del Cliente:</Text>
        <TextInput
          style={styles.input}
          placeholder="Nombre y Apellido..."
          value={clientName}
          onChangeText={setClientName}
          autoCapitalize="words"
        />

        {/* Campo Teléfono */}
        <Text style={styles.label}>Teléfono (Opcional):</Text>
        <TextInput
          style={styles.input}
          placeholder="Ej. 555-555-5555"
          value={phoneNumber}
          onChangeText={setPhoneNumber}
          keyboardType="phone-pad"
        />

        {/* Campo Comensales */}
        <Text style={styles.label}>Comensales:</Text>
        <TextInput
          style={styles.input}
          placeholder="Número de personas"
          value={diners}
          onChangeText={setDiners}
          keyboardType="numeric"
          maxLength={2}
        />

        {/* Selector de Área */}
        <Text style={styles.label}>Área de Reserva:</Text>
        <TouchableOpacity
          style={styles.pickerDisplay}
          onPress={() => setShowOptionsPicker(true)}
        >
          <Text style={styles.pickerDisplayText}>
            {selectedArea || 'Selecciona un área'}
          </Text>
        </TouchableOpacity>
        
        {/* Selector de Fecha */}
        <Text style={styles.label}>Fecha de la Reserva:</Text>
        <TouchableOpacity
          style={styles.pickerDisplay}
          onPress={() => showDateTimePicker('date')}
        >
          <Text style={styles.pickerDisplayText}>
            {formatDate(date)}
          </Text>
        </TouchableOpacity>
        
        {/* Selector de Hora */}
        <Text style={styles.label}>Hora de la Reserva:</Text>
        <TouchableOpacity
          style={styles.pickerDisplay}
          onPress={() => showDateTimePicker('time')}
        >
          <Text style={styles.pickerDisplayText}>
            {formatTime(time)}
          </Text>
        </TouchableOpacity>

        {/* Campo Notas */}
        <Text style={styles.label}>Notas Especiales:</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          placeholder="Ej. Silla de bebé, Cerca de la ventana..."
          value={notes}
          onChangeText={setNotes}
          multiline
        />

        {/* Selector de FORMATO */}
        <Text style={styles.label}>Formato de Guardado:</Text>
        <TouchableOpacity
          style={styles.pickerDisplay}
          onPress={() => setShowFormatPicker(true)}
        >
          <Text style={styles.pickerDisplayText}>
            {selectedFormat}
          </Text>
        </TouchableOpacity>

        {/* Botón de guardar */}
        {saving ? (
          <ActivityIndicator size="large" color="#007AFF" style={styles.loader} />
        ) : (
          <TouchableOpacity
            style={styles.actionButton}
            onPress={saveReservationJson}
          >
            <Text style={styles.actionButtonText}>
              CONFIRMAR RESERVA y Guardar como {selectedFormat}
            </Text>
          </TouchableOpacity>
        )}
      </View>
      {/* --- FIN CARD PRINCIPAL --- */}

      {/* --- LISTA DE ARCHIVOS --- */}
      <View style={[styles.card, styles.filesCard]}>
        <Text style={styles.cardTitle}>Archivos Guardados</Text>
        <TouchableOpacity
          style={styles.refreshButton}
          onPress={refreshFiles}
        >
          <Text style={styles.refreshButtonText}>Actualizar Lista</Text>
        </TouchableOpacity>
        
        {files.length > 0 ? (
          <View>
             <Text style={styles.hint}>
               Guardados en: {getDocumentDirectory() ? 'DocumentDirectory' : 'Navegador/Web'}
             </Text>
            {files.map((fileInfo) => (
              <View key={fileInfo.uri} style={styles.fileItem}>
                <View style={styles.fileInfo}>
                  <Text style={styles.fileName} numberOfLines={1}>
                    {fileInfo.name}
                  </Text>
                  {fileInfo.size !== undefined && (
                    <Text style={styles.fileSize}>
                      {(fileInfo.size / 1024).toFixed(1)} KB
                    </Text>
                  )}
                </View>
                <View style={styles.fileActions}>
                    <TouchableOpacity 
                        style={[styles.smallActionButton, {backgroundColor: '#5AC8FA'}]}
                        onPress={() => shareFile(fileInfo)}
                    >
                        <Text style={styles.smallActionButtonText}>Exportar</Text>
                    </TouchableOpacity>
                    <TouchableOpacity 
                        style={[styles.smallActionButton, {backgroundColor: '#FF3B30'}]}
                        onPress={() => deleteFile(fileInfo)}
                    >
                        <Text style={styles.smallActionButtonText}>Eliminar</Text>
                    </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        ) : (
          <Text style={styles.noFilesText}>No hay archivos de reserva guardados en este dispositivo.</Text>
        )}
      </View>
      {/* --- FIN LISTA DE ARCHIVOS --- */}
      
      {/* --- DATETIMEPICKER NATIVO (Android/iOS) --- */}
      {/* Nota: En iOS, esto muestra el picker nativo, no un modal flotante.
              En Android, esto abre el diálogo nativo. */}
      {showDatePicker && Platform.OS !== 'web' && (
        <DateTimePicker
          testID="datePicker"
          value={date}
          mode="date"
          is24Hour={true}
          display={Platform.OS === 'android' ? 'default' : 'spinner'} 
          onChange={onChangeDate}
        />
      )}
      
      {showTimePicker && Platform.OS !== 'web' && (
        <DateTimePicker
          testID="timePicker"
          value={time}
          mode="time"
          is24Hour={false} // Mantener AM/PM
          display={Platform.OS === 'android' ? 'default' : 'spinner'}
          onChange={onChangeTime}
        />
      )}
      
      {/* --- MODALES PERSONALIZADOS (Web / Fallback iOS) --- */}
      
      {/* Modal de Área */}
      <CustomPickerModal
        visible={showOptionsPicker}
        onClose={() => setShowOptionsPicker(false)}
        title="Selecciona el Área"
        options={areaOptions}
        selectedValue={selectedArea}
        onSelect={setSelectedArea}
      />

      {/* Modal de Formato */}
      <CustomPickerModal
        visible={showFormatPicker}
        onClose={() => setShowFormatPicker(false)}
        title="Selecciona el Formato"
        options={FORMAT_OPTIONS}
        selectedValue={selectedFormat}
        onSelect={setSelectedFormat}
      />

      {/* Modal Date/Time CUSTOM (Solo para Web o iOS/Android si decides NO usar el nativo) */}
      {/* NOTA: En la lógica actual, solo se usa para Web */}
      {(showDatePicker && Platform.OS === 'web') ? (
        <DatePickerModal
          visible={showDatePicker}
          onClose={() => setShowDatePicker(false)}
          date={date}
          tempDate={tempDate}
          setTempDate={setTempDate}
          setDate={setDate}
          years={years}
          months={months}
          getDaysArray={getDaysArray}
        />
      ) : null}
      
      {(showTimePicker && Platform.OS === 'web') ? (
        <TimePickerModal
          visible={showTimePicker}
          onClose={() => setShowTimePicker(false)}
          time={time}
          tempTime={tempTime}
          setTempTime={setTempTime}
          setTime={setTime}
        />
      ) : null}
      
    </ScrollView>
  );
}

// =================================================================
// --- COMPONENTES DE MODAL SIMPLIFICADOS (Para limpiar el render) ---
// =================================================================

interface CustomPickerProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  options: string[];
  selectedValue: string;
  onSelect: (value: string) => void;
}

const CustomPickerModal: React.FC<CustomPickerProps> = ({
  visible,
  onClose,
  title,
  options,
  selectedValue,
  onSelect,
}) => (
  <Modal
    visible={visible}
    transparent={true}
    animationType="slide"
    onRequestClose={onClose}
  >
    <View style={styles.modalOverlay}>
      <View style={styles.modalContent}>
        <Text style={styles.modalTitle}>{title}</Text>
        <ScrollView style={styles.pickerScrollView}>
          {options.map((option, index) => (
            <TouchableOpacity
              key={index}
              style={[
                styles.optionItem,
                selectedValue === option && styles.optionItemSelected
              ]}
              onPress={() => {
                onSelect(option);
                onClose();
              }}
            >
              <Text style={[
                styles.optionText,
                selectedValue === option && styles.optionTextSelected
              ]}>
                {option}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        <TouchableOpacity
            style={[styles.actionButton, styles.secondaryButton]}
            onPress={onClose}
        >
             <Text style={styles.secondaryButtonText}>Cerrar</Text>
        </TouchableOpacity>
      </View>
    </View>
  </Modal>
);

// Los modales de fecha y hora personalizados (DatePickerModal, TimePickerModal) 
// usan la misma estructura de CustomPickerModal pero con lógica de scroll compleja. 
// Los dejo definidos fuera de App() para mantener la limpieza, usando estilos similares.

// (Manteniendo la complejidad de scroll de fecha/hora para Web/fallback)

interface DatePickerModalProps {
  visible: boolean;
  onClose: () => void;
  date: Date;
  tempDate: Date;
  setTempDate: React.Dispatch<React.SetStateAction<Date>>;
  setDate: React.Dispatch<React.SetStateAction<Date>>;
  years: number[];
  months: string[];
  getDaysArray: (year: number, month: number) => number[];
}

const DatePickerModal: React.FC<DatePickerModalProps> = ({
  visible,
  onClose,
  date,
  tempDate,
  setTempDate,
  setDate,
  years,
  months,
  getDaysArray,
}) => {
    // Lógica interna de la fecha (mantenida de tu código original)
    function handleAccept() {
        setDate(tempDate);
        onClose();
    }
    function handleCancel() {
        setTempDate(date);
        onClose();
    }
    
    return (
        <Modal
            visible={visible}
            transparent={true}
            animationType="slide"
            onRequestClose={handleCancel}
        >
            <View style={styles.modalOverlay}>
                <View style={styles.modalContent}>
                    <Text style={styles.modalTitle}>Selecciona la Fecha</Text>
                    <ScrollView style={styles.pickerScrollView}>

                        <Text style={styles.pickerSectionTitle}>Día:</Text>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.horizontalPicker}>
                            {getDaysArray(tempDate.getFullYear(), tempDate.getMonth()).map((day) => (
                                <TouchableOpacity key={day} style={[styles.pickerItem, tempDate.getDate() === day && styles.pickerItemSelected]}
                                    onPress={() => {
                                        const newDate = new Date(tempDate);
                                        newDate.setDate(day);
                                        setTempDate(newDate);
                                    }}>
                                    <Text style={[styles.pickerItemText, tempDate.getDate() === day && styles.pickerItemTextSelected]}>{day}</Text>
                                </TouchableOpacity>
                            ))}
                        </ScrollView>

                        <Text style={styles.pickerSectionTitle}>Mes:</Text>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.horizontalPicker}>
                            {months.map((month, index) => (
                                <TouchableOpacity key={index} style={[styles.pickerItem, tempDate.getMonth() === index && styles.pickerItemSelected]}
                                    onPress={() => {
                                        const newDate = new Date(tempDate);
                                        const daysInNewMonth = new Date(newDate.getFullYear(), index + 1, 0).getDate();
                                        const currentDay = newDate.getDate();
                                        newDate.setMonth(index);
                                        newDate.setDate(Math.min(currentDay, daysInNewMonth));
                                        setTempDate(newDate);
                                    }}>
                                    <Text style={[styles.pickerItemText, tempDate.getMonth() === index && styles.pickerItemTextSelected]}>{month}</Text>
                                </TouchableOpacity>
                            ))}
                        </ScrollView>

                        <Text style={styles.pickerSectionTitle}>Año:</Text>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.horizontalPicker}>
                            {years.map((year) => (
                                <TouchableOpacity key={year} style={[styles.pickerItem, tempDate.getFullYear() === year && styles.pickerItemSelected]}
                                    onPress={() => {
                                        const newDate = new Date(tempDate);
                                        newDate.setFullYear(year);
                                        setTempDate(newDate);
                                    }}>
                                    <Text style={[styles.pickerItemText, tempDate.getFullYear() === year && styles.pickerItemTextSelected]}>{year}</Text>
                                </TouchableOpacity>
                            ))}
                        </ScrollView>
                    </ScrollView>
                    <View style={styles.modalButtons}>
                        <TouchableOpacity style={[styles.secondaryButton, {marginRight: 10}]} onPress={handleCancel}>
                            <Text style={styles.secondaryButtonText}>Cancelar</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={[styles.actionButton, styles.smallActionButton]} onPress={handleAccept}>
                            <Text style={styles.actionButtonText}>Aceptar</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
        </Modal>
    );
};

interface TimePickerModalProps {
  visible: boolean;
  onClose: () => void;
  time: Date;
  tempTime: Date;
  setTempTime: React.Dispatch<React.SetStateAction<Date>>;
  setTime: React.Dispatch<React.SetStateAction<Date>>;
}

const TimePickerModal: React.FC<TimePickerModalProps> = ({
  visible,
  onClose,
  time,
  tempTime,
  setTempTime,
  setTime,
}) => {
    // Lógica interna de la hora (mantenida de tu código original)
    function handleAccept() {
        setTime(tempTime);
        onClose();
    }
    function handleCancel() {
        setTempTime(time);
        onClose();
    }
    
    return (
        <Modal
            visible={visible}
            transparent={true}
            animationType="slide"
            onRequestClose={handleCancel}
        >
            <View style={styles.modalOverlay}>
                <View style={styles.modalContent}>
                    <Text style={styles.modalTitle}>Selecciona la Hora</Text>
                    <ScrollView style={styles.pickerScrollView}>

                        <Text style={styles.pickerSectionTitle}>Hora:</Text>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.horizontalPicker}>
                            {Array.from({ length: 12 }, (_, i) => i + 1).map((hour) => (
                                <TouchableOpacity key={hour} style={[styles.pickerItem, (tempTime.getHours() % 12 || 12) === hour && styles.pickerItemSelected]}
                                    onPress={() => {
                                        const newTime = new Date(tempTime);
                                        const isPM = newTime.getHours() >= 12;
                                        const newHour24 = isPM ? (hour === 12 ? 12 : hour + 12) : (hour === 12 ? 0 : hour);
                                        newTime.setHours(newHour24);
                                        setTempTime(newTime);
                                    }}>
                                    <Text style={[styles.pickerItemText, (tempTime.getHours() % 12 || 12) === hour && styles.pickerItemTextSelected]}>{hour}</Text>
                                </TouchableOpacity>
                            ))}
                        </ScrollView>

                        <Text style={styles.pickerSectionTitle}>Minutos:</Text>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.horizontalPicker}>
                            {Array.from({ length: 60 }, (_, i) => i).filter(m => m % 5 === 0).map((minute) => ( // Solo intervalos de 5 min
                                <TouchableOpacity key={minute} style={[styles.pickerItem, tempTime.getMinutes() === minute && styles.pickerItemSelected]}
                                    onPress={() => {
                                        const newTime = new Date(tempTime);
                                        newTime.setMinutes(minute);
                                        setTempTime(newTime);
                                    }}>
                                    <Text style={[styles.pickerItemText, tempTime.getMinutes() === minute && styles.pickerItemTextSelected]}>{String(minute).padStart(2, '0')}</Text>
                                </TouchableOpacity>
                            ))}
                        </ScrollView>

                        <Text style={styles.pickerSectionTitle}>Periodo:</Text>
                        <View style={styles.ampmContainer}>
                            <TouchableOpacity style={[styles.ampmButton, tempTime.getHours() < 12 && styles.ampmButtonSelected]}
                                onPress={() => {
                                    const newTime = new Date(tempTime);
                                    if (newTime.getHours() >= 12) newTime.setHours(newTime.getHours() - 12);
                                    setTempTime(newTime);
                                }}>
                                <Text style={[styles.ampmText, tempTime.getHours() < 12 && styles.ampmTextSelected]}>AM</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={[styles.ampmButton, tempTime.getHours() >= 12 && styles.ampmButtonSelected]}
                                onPress={() => {
                                    const newTime = new Date(tempTime);
                                    if (newTime.getHours() < 12) newTime.setHours(newTime.getHours() + 12);
                                    setTempTime(newTime);
                                }}>
                                <Text style={[styles.ampmText, tempTime.getHours() >= 12 && styles.ampmTextSelected]}>PM</Text>
                            </TouchableOpacity>
                        </View>
                    </ScrollView>
                    <View style={styles.modalButtons}>
                        <TouchableOpacity style={[styles.secondaryButton, {marginRight: 10}]} onPress={handleCancel}>
                            <Text style={styles.secondaryButtonText}>Cancelar</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={[styles.actionButton, styles.smallActionButton]} onPress={handleAccept}>
                            <Text style={styles.actionButtonText}>Aceptar</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
        </Modal>
    );
};


// =================================================================
// --- ESTILOS MODERNOS Y RESPONSIVOS ---
// =================================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F7F9FC', // Fondo muy claro
  },
  contentContainer: {
    padding: 20,
    paddingTop: Platform.OS === 'android' ? 50 : 20,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#333',
    marginBottom: 5,
    textAlign: 'center',
  },
  headerSubtitle: {
    fontSize: 16,
    color: '#666',
    marginBottom: 20,
    textAlign: 'center',
  },
  // --- Card Styling ---
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 15,
    marginBottom: 25,
    // Sombra elegante para iOS
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    // Sombra para Android
    elevation: 8,
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1E3A8A', // Azul oscuro
    marginBottom: 10,
  },
  separator: {
    height: 1,
    backgroundColor: '#E5E7EB',
    marginVertical: 10,
  },
  // --- Form Elements ---
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#4B5563', // Gris oscuro
    marginTop: 10,
    marginBottom: 5,
  },
  input: {
    minHeight: 44,
    borderColor: '#D1D5DB', // Borde gris claro
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    backgroundColor: '#F9FAFB',
    fontSize: 16,
    color: '#1F2937',
    marginBottom: 10,
  },
  textArea: {
    height: 100,
    paddingTop: 12,
    textAlignVertical: 'top',
  },
  pickerDisplay: {
    backgroundColor: '#F9FAFB',
    borderColor: '#D1D5DB',
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    minHeight: 44,
    justifyContent: 'center',
    marginBottom: 10,
  },
  pickerDisplayText: {
    fontSize: 16,
    color: '#1F2937',
    fontWeight: '500',
  },
  // --- Buttons ---
  loader: {
    marginVertical: 20,
  },
  actionButton: {
    backgroundColor: '#007AFF', // Azul primario
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 15,
  },
  actionButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  secondaryButton: {
    backgroundColor: '#E5E7EB', // Gris secundario
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: '#4B5563',
    fontSize: 16,
    fontWeight: '600',
  },
  smallActionButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginTop: 0,
    marginLeft: 8,
  },
  smallActionButtonText: {
      fontSize: 14,
      fontWeight: '600',
  },
  refreshButton: {
      alignSelf: 'flex-start',
      marginBottom: 10,
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 6,
      backgroundColor: '#E0F2FE', // Azul muy claro
  },
  refreshButtonText: {
      fontSize: 14,
      color: '#1D4ED8', // Azul oscuro para texto
      fontWeight: '600',
  },
  // --- Files List ---
  filesCard: {
    marginBottom: 40,
  },
  hint: {
    fontSize: 12,
    color: '#9CA3AF',
    marginBottom: 10,
    fontStyle: 'italic',
  },
  noFilesText: {
    textAlign: 'center',
    color: '#6B7280',
    paddingVertical: 15,
  },
  fileItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  fileInfo: {
    flex: 1,
    marginRight: 10,
  },
  fileName: {
    fontSize: 14,
    fontWeight: '500',
    color: '#3B82F6', // Azul para el nombre del archivo
  },
  fileSize: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
  fileActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  // --- Modal Styles (Refined) ---
  modalOverlay: {
    flex: 1,
    justifyContent: 'center', // Centrado para mayor elegancia
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.6)', // Fondo más oscuro
  },
  modalContent: {
    backgroundColor: '#fff',
    padding: 20,
    borderRadius: 12,
    width: '90%', // Más responsivo
    maxHeight: '80%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 10,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 15,
    textAlign: 'center',
    color: '#1F2937',
  },
  optionItem: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
    backgroundColor: '#fff',
  },
  optionItemSelected: {
    backgroundColor: '#E0F2FE', // Azul claro para seleccionado
  },
  optionText: {
    fontSize: 16,
    color: '#1F2937',
  },
  optionTextSelected: {
    fontWeight: 'bold',
    color: '#1D4ED8',
  },
  pickerScrollView: {
    maxHeight: 250,
    marginBottom: 15,
  },
  pickerSectionTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    marginTop: 10,
    marginBottom: 5,
    color: '#374151',
  },
  horizontalPicker: {
    flexDirection: 'row',
    marginBottom: 10,
  },
  pickerItem: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginHorizontal: 4,
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    minWidth: 40,
  },
  pickerItemSelected: {
    backgroundColor: '#007AFF',
  },
  pickerItemText: {
    fontSize: 14,
    color: '#374151',
  },
  pickerItemTextSelected: {
    color: '#fff',
    fontWeight: 'bold',
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 15,
  },
  ampmContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 10,
    marginBottom: 20,
  },
  ampmButton: {
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    minWidth: 80,
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
  },
  ampmButtonSelected: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
  },
  ampmText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#374151',
  },
  ampmTextSelected: {
    color: '#fff',
  },
});