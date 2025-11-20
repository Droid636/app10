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

interface FileInfo {
  name: string;
  uri: string;
  size?: number;
}

// Opciones de formato de guardado
const FORMAT_OPTIONS = ['JSON', 'TXT'];

export default function App() {
  // --- Estados del Formulario ---
  const [clientName, setClientName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [diners, setDiners] = useState('');
  const [notes, setNotes] = useState('');
  const [selectedArea, setSelectedArea] = useState<string>('');
  const [selectedFormat, setSelectedFormat] = useState<string>('JSON'); // Nuevo estado para el formato
  
  const [date, setDate] = useState<Date>(new Date());
  const [time, setTime] = useState<Date>(new Date());
  const [saving, setSaving] = useState(false);
  const [files, setFiles] = useState<FileInfo[]>([]);
  
  // --- Estados de Modales/Pickers ---
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [showOptionsPicker, setShowOptionsPicker] = useState(false);
  const [showFormatPicker, setShowFormatPicker] = useState(false); // Nuevo modal para formato
  
  const [tempDate, setTempDate] = useState<Date>(new Date());
  const [tempTime, setTempTime] = useState<Date>(new Date());
  
  const areaOptions = ['Interior', 'Terraza', 'Barra', 'Salón Privado'];
  
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
  
  function formatDateForFileName(date: Date): string {
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}-${month}-${year}`;
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

  // Genera el objeto de reserva para ambos formatos
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
  
  // Genera el contenido basado en el formato seleccionado
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

  // Generar nombre de archivo con la extensión correcta
  function generateFileName(extension: string): string {
    const sanitizedName = clientName.trim().replace(/[^a-zA-Z0-9]/g, '_') || 'ClienteAnonimo';
    const datePart = formatDateForFileName(date);
    return `RESERVA-${sanitizedName}-${datePart}.${extension}`;
  }

  // --- FUNCIÓN PRINCIPAL DE GUARDADO ---
  async function saveReservationJson() {
    if (!clientName.trim() || !diners) {
        Alert.alert('Faltan Datos', 'Por favor, ingresa tu Nombre y el número de Comensales.');
        return;
    }

    setSaving(true);
    try {
      const { content, mimeType, extension } = generateContent(selectedFormat);
      let fileName = generateFileName(extension);
      
      // 1. Manejo especial para web (Descarga)
      if (Platform.OS === 'web') {
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
        setSaving(false);
        return;
      }

      // 2. Para móvil: usar FileSystem (Guardado interno)
      const docDir = getDocumentDirectory();
      if (!docDir) {
        throw new Error('No se encontró un directorio disponible para guardar.');
      }
      
      const fileUri = docDir + fileName;
      
      // Escribir el archivo
      await FileSystem.writeAsStringAsync(fileUri, content, {
        encoding: FileSystem.EncodingType.UTF8,
      });

      // Refrescar lista solo para archivos JSON, ya que es el formato original para la lista de archivos
      // Si la lista debe mostrar TXT también, se necesitaría un ajuste en refreshFiles.
      if (extension === 'json') {
          await refreshFiles();
      } else {
          // Opcionalmente, puedes alertar sobre archivos .txt guardados y forzar una actualización
          await refreshFiles(); 
      }

      Alert.alert(
        'Reserva Guardada',
        `Reserva para ${clientName} guardada como ${fileName}.`,
        [
          { text: 'OK', style: 'default' },
          {
            text: 'Compartir/Exportar',
            onPress: async () => {
              await performShare(fileUri, mimeType); // Usamos la nueva función performShare
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

  // Función de Compartir unificada
  async function performShare(fileUri: string, mimeType: string) {
    try {
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        // Al usar shareAsync, el sistema operativo le pedirá al usuario
        // DÓNDE guardar o a QUÉ aplicación enviar el archivo.
        // Esto SIMULA la selección de carpeta/ubicación.
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
  
  // --- Funciones de Gestión de Archivos (Mantenidas) ---

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
        // Acepta JSON y TXT para la lista de archivos
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
      
      // Determinar el mimeType en base a la extensión para compartir correctamente
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

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      <Text style={styles.title}>Mesa de Restaurante 🍽️</Text>
      <Text style={styles.subtitle}>Crea una nueva reserva</Text>

      {/* Inputs del Formulario */}
      <Text style={styles.label}>Nombre del Cliente:</Text>
      <TextInput
        style={[styles.input, styles.inputSmall]}
        placeholder="Nombre para la reserva..."
        value={clientName}
        onChangeText={setClientName}
        autoCapitalize="words"
      />
      
      <Text style={styles.label}>Teléfono (Opcional):</Text>
      <TextInput
        style={[styles.input, styles.inputSmall]}
        placeholder="Ej. 555-555-5555"
        value={phoneNumber}
        onChangeText={setPhoneNumber}
        keyboardType="phone-pad"
      />

      <Text style={styles.label}>Comensales:</Text>
      <TextInput
        style={[styles.input, styles.inputSmall]}
        placeholder="¿Cuántas personas?"
        value={diners}
        onChangeText={setDiners}
        keyboardType="numeric"
      />

      <Text style={styles.label}>Área de Reserva:</Text>
      <TouchableOpacity
        style={styles.pickerButton}
        onPress={() => setShowOptionsPicker(true)}
      >
        <Text style={styles.pickerButtonText}>
          {selectedArea || 'Selecciona un área'}
        </Text>
      </TouchableOpacity>

      {/* Selector de FORMATO (Nuevo) */}
      <Text style={styles.label}>Formato de Guardado:</Text>
      <TouchableOpacity
        style={styles.pickerButton}
        onPress={() => setShowFormatPicker(true)}
      >
        <Text style={styles.pickerButtonText}>
          {selectedFormat || 'Selecciona el formato'}
        </Text>
      </TouchableOpacity>

      {/* Pickers de fecha y hora */}
      <Text style={styles.label}>Fecha de la Reserva:</Text>
      <TouchableOpacity
        style={styles.pickerButton}
        onPress={() => {
          setTempDate(date);
          setShowDatePicker(true);
        }}
      >
        <Text style={styles.pickerButtonText}>
          {formatDate(date)}
        </Text>
      </TouchableOpacity>
      
      <Text style={styles.label}>Hora de la Reserva:</Text>
      <TouchableOpacity
        style={styles.pickerButton}
        onPress={() => {
          setTempTime(time);
          setShowTimePicker(true);
        }}
      >
        <Text style={styles.pickerButtonText}>
          {formatTime(time)}
        </Text>
      </TouchableOpacity>

      <Text style={styles.label}>Notas/Peticiones Especiales:</Text>
      <TextInput
        style={styles.input}
        placeholder="¿Algo más que debamos saber? (Ej. Pastel de cumpleaños, silla de bebé)"
        value={notes}
        onChangeText={setNotes}
        multiline
        numberOfLines={4}
      />

      {/* Botón de guardar */}
      {saving ? (
        <ActivityIndicator size="large" color="#00aaff" style={styles.loader} />
      ) : (
        <View style={styles.buttonContainer}>
          <Button
            title={`CONFIRMAR RESERVA y Guardar como ${selectedFormat}`}
            onPress={saveReservationJson}
            color="#00aaff"
          />
        </View>
      )}

      <View style={styles.separator} />
      
      <Button 
        title="Mostrar / Actualizar Archivos Guardados" 
        onPress={refreshFiles} 
        color="#888"
      />

      {/* Lista de archivos guardados */}
      {files.length > 0 && (
        <View style={styles.filesContainer}>
          <Text style={styles.filesTitle}>Archivos de Reservas ({files.length}):</Text>
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
                    Tamaño: {(fileInfo.size / 1024).toFixed(1)} KB
                  </Text>
                )}
              </View>
              <View style={styles.fileActions}>
                <View style={styles.buttonWrapper}>
                  <Button 
                    title="Exportar" 
                    onPress={() => shareFile(fileInfo)}
                    color="#007aff"
                  />
                </View>
                <View style={styles.buttonWrapper}>
                  <Button 
                    title="Eliminar" 
                    onPress={() => deleteFile(fileInfo)}
                    color="#ff3b30"
                  />
                </View>
              </View>
            </View>
          ))}
        </View>
      )}

      {/* --- MODALES --- */}
      
      {/* Modal de Opciones/Área (Mantenido) */}
      <Modal
        visible={showOptionsPicker}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowOptionsPicker(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Selecciona el Área</Text>
            <ScrollView>
              {areaOptions.map((option, index) => (
                <TouchableOpacity
                  key={index}
                  style={[
                    styles.optionItem,
                    selectedArea === option && styles.optionItemSelected
                  ]}
                  onPress={() => {
                    setSelectedArea(option);
                    setShowOptionsPicker(false);
                  }}
                >
                  <Text style={[
                    styles.optionText,
                    selectedArea === option && styles.optionTextSelected
                  ]}>
                    {option}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <Button
              title="Cerrar"
              onPress={() => setShowOptionsPicker(false)}
              color="#ff3b30"
            />
          </View>
        </View>
      </Modal>

      {/* Modal de Formato de Archivo (Nuevo) */}
      <Modal
        visible={showFormatPicker}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowFormatPicker(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Selecciona el Formato de Archivo</Text>
            <ScrollView>
              {FORMAT_OPTIONS.map((format, index) => (
                <TouchableOpacity
                  key={index}
                  style={[
                    styles.optionItem,
                    selectedFormat === format && styles.optionItemSelected
                  ]}
                  onPress={() => {
                    setSelectedFormat(format);
                    setShowFormatPicker(false);
                  }}
                >
                  <Text style={[
                    styles.optionText,
                    selectedFormat === format && styles.optionTextSelected
                  ]}>
                    {format}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <Button
              title="Cerrar"
              onPress={() => setShowFormatPicker(false)}
              color="#ff3b30"
            />
          </View>
        </View>
      </Modal>

      {/* Modal Date Picker (Mantenido) */}
      <Modal
        visible={showDatePicker}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowDatePicker(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Selecciona la Fecha</Text>
            <ScrollView style={styles.pickerScrollView}>
              
              <Text style={styles.pickerSectionTitle}>Día:</Text>
              <ScrollView 
                horizontal 
                showsHorizontalScrollIndicator={false}
                style={styles.horizontalPicker}
              >
                {getDaysArray(tempDate.getFullYear(), tempDate.getMonth()).map((day) => (
                  <TouchableOpacity
                    key={day}
                    style={[
                      styles.pickerItem,
                      tempDate.getDate() === day && styles.pickerItemSelected
                    ]}
                    onPress={() => {
                      const newDate = new Date(tempDate);
                      newDate.setDate(day);
                      setTempDate(newDate);
                    }}
                  >
                    <Text style={[
                      styles.pickerItemText,
                      tempDate.getDate() === day && styles.pickerItemTextSelected
                    ]}>
                      {day}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              
              <Text style={styles.pickerSectionTitle}>Mes:</Text>
              <ScrollView 
                horizontal 
                showsHorizontalScrollIndicator={false}
                style={styles.horizontalPicker}
              >
                {months.map((month, index) => (
                  <TouchableOpacity
                    key={index}
                    style={[
                      styles.pickerItem,
                      tempDate.getMonth() === index && styles.pickerItemSelected
                    ]}
                    onPress={() => {
                      const newDate = new Date(tempDate);
                      const daysInNewMonth = getDaysInMonth(newDate.getFullYear(), index);
                      const currentDay = newDate.getDate();
                      newDate.setMonth(index);
                      newDate.setDate(Math.min(currentDay, daysInNewMonth));
                      setTempDate(newDate);
                    }}
                  >
                    <Text style={[
                      styles.pickerItemText,
                      tempDate.getMonth() === index && styles.pickerItemTextSelected
                    ]}>
                      {month}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              
              <Text style={styles.pickerSectionTitle}>Año:</Text>
              <ScrollView 
                horizontal 
                showsHorizontalScrollIndicator={false}
                style={styles.horizontalPicker}
              >
                {years.map((year) => (
                  <TouchableOpacity
                    key={year}
                    style={[
                      styles.pickerItem,
                      tempDate.getFullYear() === year && styles.pickerItemSelected
                    ]}
                    onPress={() => {
                      const newDate = new Date(tempDate);
                      newDate.setFullYear(year);
                      setTempDate(newDate);
                    }}
                  >
                    <Text style={[
                      styles.pickerItemText,
                      tempDate.getFullYear() === year && styles.pickerItemTextSelected
                    ]}>
                      {year}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </ScrollView>
            <View style={styles.modalButtons}>
              <Button
                title="Cancelar"
                onPress={() => {
                  setTempDate(date);
                  setShowDatePicker(false);
                }}
              />
              <View style={{ width: 10 }} />
              <Button
                title="Aceptar"
                onPress={() => {
                  setDate(tempDate);
                  setShowDatePicker(false);
                }}
                color="#00aaff"
              />
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal Time Picker (Mantenido) */}
      <Modal
        visible={showTimePicker}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowTimePicker(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Selecciona la Hora</Text>
            <ScrollView style={styles.pickerScrollView}>
              
              <Text style={styles.pickerSectionTitle}>Hora:</Text>
              <ScrollView 
                horizontal 
                showsHorizontalScrollIndicator={false}
                style={styles.horizontalPicker}
              >
                {Array.from({ length: 12 }, (_, i) => i + 1).map((hour) => (
                  <TouchableOpacity
                    key={hour}
                    style={[
                      styles.pickerItem,
                      (tempTime.getHours() % 12 || 12) === hour && styles.pickerItemSelected
                    ]}
                    onPress={() => {
                      const newTime = new Date(tempTime);
                      const currentHour24 = newTime.getHours();
                      const isPM = currentHour24 >= 12;
                      const newHour24 = isPM ? (hour === 12 ? 12 : hour + 12) : (hour === 12 ? 0 : hour);
                      newTime.setHours(newHour24);
                      setTempTime(newTime);
                    }}
                  >
                    <Text style={[
                      styles.pickerItemText,
                      (tempTime.getHours() % 12 || 12) === hour && styles.pickerItemTextSelected
                    ]}>
                      {hour}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              
              <Text style={styles.pickerSectionTitle}>Minutos:</Text>
              <ScrollView 
                horizontal 
                showsHorizontalScrollIndicator={false}
                style={styles.horizontalPicker}
              >
                {Array.from({ length: 60 }, (_, i) => i).filter(m => m % 5 === 0).map((minute) => ( // Solo intervalos de 5 min
                  <TouchableOpacity
                    key={minute}
                    style={[
                      styles.pickerItem,
                      tempTime.getMinutes() === minute && styles.pickerItemSelected
                    ]}
                    onPress={() => {
                      const newTime = new Date(tempTime);
                      newTime.setMinutes(minute);
                      setTempTime(newTime);
                    }}
                  >
                    <Text style={[
                      styles.pickerItemText,
                      tempTime.getMinutes() === minute && styles.pickerItemTextSelected
                    ]}>
                      {String(minute).padStart(2, '0')}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              
              <Text style={styles.pickerSectionTitle}>Periodo:</Text>
              <View style={styles.ampmContainer}>
                <TouchableOpacity
                  style={[
                    styles.ampmButton,
                    tempTime.getHours() < 12 && styles.ampmButtonSelected
                  ]}
                  onPress={() => {
                    const newTime = new Date(tempTime);
                    if (newTime.getHours() >= 12) {
                      newTime.setHours(newTime.getHours() - 12);
                    }
                    setTempTime(newTime);
                  }}
                >
                  <Text style={[
                    styles.ampmText,
                    tempTime.getHours() < 12 && styles.ampmTextSelected
                  ]}>
                    AM
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.ampmButton,
                    tempTime.getHours() >= 12 && styles.ampmButtonSelected
                  ]}
                  onPress={() => {
                    const newTime = new Date(tempTime);
                    if (newTime.getHours() < 12) {
                      newTime.setHours(newTime.getHours() + 12);
                    }
                    setTempTime(newTime);
                  }}
                >
                  <Text style={[
                    styles.ampmText,
                    tempTime.getHours() >= 12 && styles.ampmTextSelected
                  ]}>
                    PM
                  </Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
            <View style={styles.modalButtons}>
              <Button
                title="Cancelar"
                onPress={() => {
                  setTempTime(time);
                  setShowTimePicker(false);
                }}
              />
              <View style={{ width: 10 }} />
              <Button
                title="Aceptar"
                onPress={() => {
                  setTime(tempTime);
                  setShowTimePicker(false);
                }}
                color="#00aaff"
              />
            </View>
          </View>
        </View>
      </Modal>

      <StatusBar style="auto" />
      
      <Text style={styles.hint}>
        **Nota sobre Carpetas:** En móvil, los archivos se guardan en el área privada de la app (DocumentDirectory). La función "Compartir/Exportar" te permite seleccionar una carpeta o aplicación (Drive, Email, etc.) para guardarlos fuera de la aplicación.
      </Text>
    </ScrollView>
  );
}

// Los estilos no se han modificado, solo se han reutilizado para el nuevo modal de formato
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  contentContainer: {
    padding: 25,
    paddingTop: 50,
    paddingBottom: 40,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    marginBottom: 5,
    textAlign: 'center',
    color: '#333',
  },
  subtitle: {
    fontSize: 18,
    fontWeight: '500',
    marginBottom: 20,
    textAlign: 'center',
    color: '#666',
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
    color: '#333',
  },
  input: {
    minHeight: 100,
    borderColor: '#ddd',
    borderWidth: 1,
    borderRadius: 8,
    padding: 15,
    marginBottom: 20,
    textAlignVertical: 'top',
    fontSize: 16,
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 1,
    elevation: 2,
  },
  inputSmall: {
    minHeight: 48,
    fontSize: 16,
  },
  pickerButton: {
    minHeight: 48,
    borderColor: '#ddd',
    borderWidth: 1,
    borderRadius: 8,
    padding: 15,
    marginBottom: 20,
    backgroundColor: '#fff',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 1,
    elevation: 2,
  },
  pickerButtonText: {
    fontSize: 16,
    color: '#000',
    fontWeight: '500',
  },
  loader: {
    marginVertical: 20,
  },
  buttonContainer: {
    marginTop: 10,
    marginBottom: 30,
  },
  separator: {
    height: 1,
    backgroundColor: '#ccc',
    marginVertical: 25,
  },
  filesContainer: {
    marginTop: 20,
    padding: 15,
    backgroundColor: '#e6f7ff', 
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#b3e0ff',
  },
  filesTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 15,
    color: '#005580', 
  },
  fileItem: {
    flexDirection: 'column',
    marginBottom: 15,
    padding: 15,
    backgroundColor: '#fff',
    borderRadius: 8,
    borderLeftWidth: 5,
    borderLeftColor: '#00aaff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 3,
  },
  fileInfo: {
    marginBottom: 10,
  },
  fileName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  fileSize: {
    fontSize: 13,
    color: '#666',
  },
  fileActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
    marginTop: 5,
  },
  buttonWrapper: {
    flex: 1,
  },
  hint: {
    marginTop: 20,
    fontSize: 13,
    color: '#999',
    textAlign: 'center',
    fontStyle: 'italic',
  },

  // Estilos de Modales limpios
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 15,
    borderTopRightRadius: 15,
    padding: 20,
    maxHeight: '70%',
    width: '100%',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 15,
    textAlign: 'center',
    color: '#333',
  },
  pickerScrollView: {
    marginBottom: 20,
    maxHeight: 300, 
  },
  pickerSectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    marginTop: 15,
    marginBottom: 10,
    color: '#00aaff',
  },
  horizontalPicker: {
    maxHeight: 50,
    marginBottom: 5,
  },
  pickerItem: {
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 8,
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  pickerItemSelected: {
    backgroundColor: '#00aaff',
  },
  pickerItemText: {
    fontSize: 16,
    color: '#333',
  },
  pickerItemTextSelected: {
    color: '#fff',
    fontWeight: '700',
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 15,
  },
  ampmContainer: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    marginBottom: 10,
  },
  ampmButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    marginRight: 10,
    backgroundColor: '#f0f0f0',
    borderWidth: 1,
    borderColor: '#ddd',
  },
  ampmButtonSelected: {
    backgroundColor: '#00aaff',
    borderColor: '#00aaff',
  },
  ampmText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#333',
  },
  ampmTextSelected: {
    color: '#fff',
  },
  optionItem: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    borderRadius: 0,
  },
  optionItemSelected: {
    backgroundColor: '#e6f7ff',
  },
  optionText: {
    fontSize: 16,
    color: '#333',
  },
  optionTextSelected: {
    fontWeight: '700',
    color: '#00aaff',
  },
});