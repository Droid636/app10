import React, { useState, useEffect } from 'react';
import { 
    StyleSheet, 
    Text, 
    View, 
    TextInput, 
    Alert, 
    ActivityIndicator, 
    Platform, 
    ScrollView, 
    TouchableOpacity, 
    Modal 
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as DocumentPicker from 'expo-document-picker'; // Necesario para SAF/Picker

// Importación específica de StorageAccessFramework (SAF)
const { StorageAccessFramework } = FileSystem;

// ----------------------------------------------------------------------
// --- 1. INTERFACES Y CONSTANTES
// ----------------------------------------------------------------------

interface FileInfo {
    name: string;
    uri: string;
    size?: number;
}

const FORMAT_OPTIONS = ['JSON', 'TXT'];

// --- Paleta de Colores (Dark Mode) ---
const COLORS = {
    background: '#121212', 
    card: '#1F1F1F', 
    textPrimary: '#FFFFFF',
    textSecondary: '#B0B0B0',
    inputBackground: '#2C2C2C',
    accent: '#FF4500', // Naranja/Rojo brillante 
    danger: '#DC3545',
    info: '#17A2B8', // Azul brillante
};

// ----------------------------------------------------------------------
// --- 2. COMPONENTE PRINCIPAL (APP)
// ----------------------------------------------------------------------

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

    // --- Funciones de Utilidad de Fecha (Omisión para brevedad, asumiendo que existen) ---
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
    // --- Fin de Funciones de Utilidad de Fecha ---


    // --- Lógica de Archivos ---

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

    async function performShare(fileUri: string, mimeType: string) {
        try {
            const canShare = await Sharing.isAvailableAsync();
            if (canShare) {
                // Función de compartir usada en iOS o como fallback en Android
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
    
    // --- NUEVA FUNCIÓN: Guarda el archivo usando SAF (Solo Android) o Sharing (iOS) ---
    async function saveToSelectedFolder(latestFile: FileInfo, mimeType: string, extension: string) {
        if (Platform.OS !== 'android') {
            // --- iOS: Usa Sharing (Única opción para exportar) ---
            await performShare(latestFile.uri, mimeType);
            Alert.alert(
                'Exportación Iniciada',
                'En iOS, selecciona "Guardar en Archivos" para elegir la carpeta de destino.',
                [{ text: 'Entendido' }]
            );
            return;
        }

        // --- Android: Lógica de SAF para selección de carpeta ---
        try {
            // 1. Pedir permisos de escritura (necesario para SAF)
            const permissions = await StorageAccessFramework.requestDirectoryPermissionsAsync();
            

            if (!permissions.granted) {
                Alert.alert('Permisos Denegados', 'Necesitas otorgar permisos para seleccionar la carpeta de destino.');
                return;
            }

            // 2. Leer el contenido del archivo temporal (del sandbox)
            const content = await FileSystem.readAsStringAsync(latestFile.uri, {
                encoding: FileSystem.EncodingType.UTF8,
            });
            
            const fileName = latestFile.name;

            // 3. Usar SAF para que el usuario seleccione la ubicación y cree el archivo
            // ESTO ABRE EL DIÁLOGO NATIVO DE SELECCIÓN DE CARPETA/ARCHIVO
            const uri = await StorageAccessFramework.createFileAsync(
                permissions.directoryUri, // La URI de la carpeta ya seleccionada (o sugerida)
                fileName.replace(`.${extension}`, ''), // Nombre base del archivo
                mimeType
            );
            

            if (uri) {
                // 4. Escribir el contenido en la nueva ubicación (Descargas/Carpeta Seleccionada)
                await FileSystem.writeAsStringAsync(uri, content, {
                    encoding: FileSystem.EncodingType.UTF8,
                });
                
                Alert.alert(
                    '¡Exportado con Éxito!',
                    `El archivo "${fileName}" ha sido guardado en la carpeta seleccionada.`,
                    [{ text: 'OK' }]
                );
            } else {
                // Cancelado por el usuario
                Alert.alert('Exportación Cancelada', 'No se seleccionó una ubicación de destino.');
            }

        } catch (e: any) {
            console.error('Error al usar SAF:', e);
            Alert.alert('Error de Exportación', 'Ocurrió un error al intentar exportar el archivo usando el selector de carpetas de Android.');
        }
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
                // Lógica de descarga en Web (no necesita SAF)
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
                await refreshFiles(); 
                return;
            }

            const docDir = getDocumentDirectory();
            if (!docDir) throw new Error('No se encontró un directorio disponible para guardar.');

            // Guardar internamente en el sandbox
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
                        text: 'Exportar a Carpeta',
                        onPress: async () => {
                            // Ofrecemos exportar usando SAF/Sharing inmediatamente después de guardar
                            await saveToSelectedFolder({ name: fileName, uri: fileUri }, mimeType, extension);
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

            // Ordenar por nombre (generalmente el más reciente está cerca del inicio)
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

            // Usamos Sharing, que funciona como "Exportar" para archivos individuales
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

    // --- FUNCIÓN PRINCIPAL: Inicia la lógica de selección de carpeta (SAF/Sharing) ---
    async function openDirectoryLocation() {
        if (Platform.OS === 'web') {
            Alert.alert('Acceso a Archivos', 'En web, los archivos se descargan directamente en tu carpeta de descargas del navegador.');
            return;
        }

        await refreshFiles(); 
        
        if (files.length === 0) {
            Alert.alert('Archivos no Encontrados', 'No hay archivos de reserva guardados.');
            return;
        }

        const latestFile = files[0];
        const mimeType = latestFile.name.endsWith('.txt') ? 'text/plain' : 'application/json';
        const extension = latestFile.name.endsWith('.txt') ? 'txt' : 'json';

        // Llamamos a la función que implementa la lógica del selector de carpeta
        await saveToSelectedFolder(latestFile, mimeType, extension);
    }
    
    // --- Funciones para DateTimePicker Nativo (Android/iOS) ---
    const onChangeDate = (event: any, selectedDate: Date | undefined) => {
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
            keyboardShouldPersistTaps="handled" 
        >
            <StatusBar style="light" />

            <Text style={styles.title}>Super Food 🍽️</Text>
            <Text style={styles.headerSubtitle}>Sistema de Reservas</Text>

        
            <View style={styles.card}>
                <Text style={styles.cardTitle}>Crea tu Reserva</Text>
                <View style={styles.separator} />

                {/* Campo Nombre */}
                <Text style={styles.label}>Nombre del Cliente:</Text>
                <TextInput
                    style={styles.input}
                    placeholder="Nombre y Apellido" 
                    placeholderTextColor={COLORS.textSecondary}
                    value={clientName}
                    onChangeText={setClientName}
                    autoCapitalize="words"
                />
                {/* [Otros campos de input: Teléfono, Comensales, Área, Fecha, Hora, Notas] */}
                {/* ... (código omitido para brevedad, asumiendo que los inputs intermedios existen) */}
                
                {/* Campo Teléfono */}
                <Text style={styles.label}>Teléfono (Opcional):</Text>
                <TextInput
                    style={styles.input}
                    placeholder="7713535821"
                    placeholderTextColor={COLORS.textSecondary}
                    value={phoneNumber}
                    onChangeText={setPhoneNumber}
                    keyboardType="phone-pad"
                />

                {/* Campo Comensales */}
                <Text style={styles.label}>Comensales:</Text>
                <TextInput
                    style={styles.input}
                    placeholder="Número de personas"
                    placeholderTextColor={COLORS.textSecondary}
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
                    placeholder="Silla de bebé, Cerca de la ventana"
                    placeholderTextColor={COLORS.textSecondary}
                    value={notes}
                    onChangeText={setNotes}
                    multiline
                />
                {/* Fin de campos de input */}


                {/* Selector de FORMATO */}
                <Text style={styles.label}>Formato de Exportación:</Text>
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
                    <ActivityIndicator size="large" color={COLORS.accent} style={styles.loader} />
                ) : (
                    <TouchableOpacity
                        style={styles.actionButton}
                        onPress={saveReservationJson}
                    >
                        <Text style={styles.actionButtonText}>
                            RESERVAR MESA ({selectedFormat})
                        </Text>
                    </TouchableOpacity>
                )}
            </View>
            
            <View style={[styles.card, styles.filesCard]}>
                <Text style={styles.cardTitle}>Archivos Guardados (Exportar)</Text>
                
                <View style={styles.fileActionsRow}>
                    <TouchableOpacity
                        style={[styles.refreshButton, { flex: 1, marginRight: 10 }]}
                        onPress={refreshFiles}
                    >
                        <Text style={styles.refreshButtonText}>Actualizar Lista</Text>
                    </TouchableOpacity>

                    {/* Botón: Abrir Ubicación (Ahora abre el selector de carpeta/archivo con SAF) */}
                    <TouchableOpacity
                        style={[styles.actionButton, styles.smallActionButton, { flex: 1, backgroundColor: COLORS.info }]}
                        onPress={openDirectoryLocation}
                    >
                        <Text style={styles.actionButtonText}>Abrir Ubicación</Text>
                    </TouchableOpacity>
                </View>
                
                {files.length > 0 ? (
                    <View>
                        <Text style={styles.hint}>
                            Guardados internamente en: {getDocumentDirectory() ? 'DocumentDirectory' : 'Navegador/Web'}
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
                                        style={[styles.smallActionButton, {backgroundColor: COLORS.info}]}
                                        onPress={() => shareFile(fileInfo)}
                                    >
                                        <Text style={styles.smallActionButtonText}>Compartir</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity 
                                        style={[styles.smallActionButton, {backgroundColor: COLORS.danger}]}
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
            
            {/* Pickers NATIVOS (Android/iOS) */}
            {showDatePicker && Platform.OS !== 'web' && (
                <DateTimePicker
                    testID="datePicker"
                    value={date}
                    mode="date"
                    is24Hour={true}
                    display={Platform.OS === 'android' ? 'default' : 'spinner'} 
                    onChange={onChangeDate}
                    // Omitir propiedad 'textColor' para compatibilidad en algunos ambientes
                />
            )}
            
            {showTimePicker && Platform.OS !== 'web' && (
                <DateTimePicker
                    testID="timePicker"
                    value={time}
                    mode="time"
                    is24Hour={false} 
                    display={Platform.OS === 'android' ? 'default' : 'spinner'}
                    onChange={onChangeTime}
                    // Omitir propiedad 'textColor' para compatibilidad en algunos ambientes
                />
            )}
            
            
            {/* Modal para Selector de Área */}
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
                title="Formato de Exportación"
                options={FORMAT_OPTIONS}
                selectedValue={selectedFormat}
                onSelect={setSelectedFormat}
            />

            {/* Modal Date CUSTOM (Web) */}
            {(showDatePicker && Platform.OS === 'web') && (
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
            )}
            
            {/* Modal Time CUSTOM (Web) */}
            {(showTimePicker && Platform.OS === 'web') && (
                <TimePickerModal
                    visible={showTimePicker}
                    onClose={() => setShowTimePicker(false)}
                    time={time}
                    tempTime={tempTime}
                    setTempTime={setTempTime}
                    setTime={setTime}
                />
            )}
            
        </ScrollView>
    );
}

// ----------------------------------------------------------------------
// --- 3. COMPONENTES MODALES AUXILIARES (CustomPickerModal, DatePickerModal, TimePickerModal)
// ----------------------------------------------------------------------

// *** NOTA: Los siguientes componentes de modales auxiliares (CustomPickerModal, DatePickerModal, TimePickerModal) son idénticos a la versión anterior y se mantienen para la funcionalidad completa del código, pero se omiten aquí para reducir la extensión del código. ***

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
        animationType="fade"
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
                    style={[styles.secondaryButton, { marginTop: 15 }]}
                    onPress={onClose}
                >
                    <Text style={styles.secondaryButtonText}>Cerrar</Text>
                </TouchableOpacity>
            </View>
        </View>
    </Modal>
);

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
            animationType="fade"
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
            animationType="fade"
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
// --- Fin de Componentes Modales Auxiliares ---


// ----------------------------------------------------------------------
// --- 4. ESTILOS
// ----------------------------------------------------------------------

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: COLORS.background,
    },
    contentContainer: {
        padding: 20,
        paddingBottom: 40,
        alignItems: 'center',
    },
    title: {
        fontSize: 32,
        fontWeight: 'bold',
        color: COLORS.accent,
        marginBottom: 5,
        textAlign: 'center',
    },
    headerSubtitle: {
        fontSize: 18,
        color: COLORS.textSecondary,
        marginBottom: 20,
        textAlign: 'center',
    },
    card: {
        width: '100%',
        maxWidth: 600,
        backgroundColor: COLORS.card,
        borderRadius: 12,
        padding: 20,
        marginBottom: 25,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 5,
        elevation: 8,
    },
    filesCard: {
        backgroundColor: '#292929', 
    },
    cardTitle: {
        fontSize: 22,
        fontWeight: '600',
        color: COLORS.textPrimary,
        marginBottom: 10,
    },
    separator: {
        height: 1,
        backgroundColor: COLORS.inputBackground,
        marginVertical: 10,
    },
    label: {
        fontSize: 16,
        color: COLORS.textPrimary,
        marginTop: 15,
        marginBottom: 5,
        fontWeight: '500',
    },
    input: {
        width: '100%',
        backgroundColor: COLORS.inputBackground,
        color: COLORS.textPrimary,
        padding: Platform.OS === 'web' ? 12 : 10,
        borderRadius: 8,
        fontSize: 16,
        borderWidth: 1,
        borderColor: COLORS.inputBackground,
    },
    textArea: {
        height: 100,
        textAlignVertical: 'top',
        paddingTop: 10,
    },
    pickerDisplay: {
        width: '100%',
        backgroundColor: COLORS.inputBackground,
        padding: 12,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: COLORS.inputBackground,
        justifyContent: 'center',
        minHeight: 45,
    },
    pickerDisplayText: {
        color: COLORS.textPrimary,
        fontSize: 16,
    },
    actionButton: {
        backgroundColor: COLORS.accent,
        padding: 15,
        borderRadius: 8,
        marginTop: 20,
        alignItems: 'center',
        justifyContent: 'center',
    },
    actionButtonText: {
        color: COLORS.textPrimary,
        fontSize: 16,
        fontWeight: 'bold',
    },
    loader: {
        marginTop: 20,
    },
    // --- Estilos de Modales ---
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    modalContent: {
        width: '90%',
        maxWidth: 400,
        backgroundColor: COLORS.card,
        borderRadius: 15,
        padding: 25,
    },
    modalTitle: {
        fontSize: 20,
        fontWeight: 'bold',
        color: COLORS.textPrimary,
        marginBottom: 15,
        textAlign: 'center',
    },
    pickerScrollView: {
        maxHeight: 250,
        width: '100%',
    },
    optionItem: {
        padding: 12,
        borderBottomWidth: 1,
        borderBottomColor: COLORS.inputBackground,
        backgroundColor: COLORS.card,
    },
    optionItemSelected: {
        backgroundColor: COLORS.inputBackground,
    },
    optionText: {
        fontSize: 16,
        color: COLORS.textPrimary,
        textAlign: 'center',
    },
    optionTextSelected: {
        fontWeight: 'bold',
        color: COLORS.accent,
    },
    secondaryButton: {
        backgroundColor: COLORS.inputBackground,
        padding: 12,
        borderRadius: 8,
        alignItems: 'center',
    },
    secondaryButtonText: {
        color: COLORS.textSecondary,
        fontSize: 16,
        fontWeight: '500',
    },
    // Estilos de Pickers Custom (Date/Time Web)
    pickerSectionTitle: {
        fontSize: 14,
        color: COLORS.textSecondary,
        marginTop: 10,
        marginBottom: 5,
        fontWeight: 'bold',
        textAlign: 'center',
    },
    horizontalPicker: {
        width: '100%',
        borderWidth: 1,
        borderColor: COLORS.inputBackground,
        borderRadius: 8,
        paddingVertical: 5,
        marginBottom: 10,
    },
    pickerItem: {
        paddingHorizontal: 15,
        paddingVertical: 8,
        marginHorizontal: 4,
        borderRadius: 8,
        justifyContent: 'center',
        alignItems: 'center',
    },
    pickerItemSelected: {
        backgroundColor: COLORS.accent,
    },
    pickerItemText: {
        color: COLORS.textPrimary,
        fontSize: 16,
    },
    pickerItemTextSelected: {
        color: COLORS.textPrimary,
        fontWeight: 'bold',
    },
    modalButtons: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginTop: 15,
    },
    ampmContainer: {
        flexDirection: 'row',
        justifyContent: 'center',
        marginBottom: 10,
    },
    ampmButton: {
        flex: 1,
        marginHorizontal: 5,
        padding: 10,
        borderRadius: 8,
        backgroundColor: COLORS.inputBackground,
        alignItems: 'center',
    },
    ampmButtonSelected: {
        backgroundColor: COLORS.accent,
    },
    ampmText: {
        color: COLORS.textPrimary,
        fontSize: 16,
    },
    ampmTextSelected: {
        fontWeight: 'bold',
    },
    // Estilos de la lista de archivos
    fileActionsRow: { 
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 15,
    },
    refreshButton: {
        backgroundColor: COLORS.inputBackground,
        padding: 10,
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
    },
    refreshButtonText: {
        color: COLORS.textSecondary,
        fontSize: 14,
        fontWeight: '500',
    },
    hint: {
        color: COLORS.textSecondary,
        fontSize: 12,
        textAlign: 'center',
        marginBottom: 15,
    },
    fileItem: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 12,
        backgroundColor: '#2C2C2C', 
        borderRadius: 8,
        marginBottom: 10,
        borderLeftWidth: 3,
        borderLeftColor: COLORS.info,
    },
    fileInfo: {
        flex: 1,
        marginRight: 10,
    },
    fileName: {
        color: COLORS.textPrimary,
        fontSize: 14,
        fontWeight: '600',
    },
    fileSize: {
        color: COLORS.textSecondary,
        fontSize: 12,
        marginTop: 3,
    },
    fileActions: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    smallActionButton: {
        paddingVertical: 8,
        paddingHorizontal: 10,
        borderRadius: 6,
        marginLeft: 8,
    },
    smallActionButtonText: {
        color: COLORS.textPrimary,
        fontSize: 12,
        fontWeight: 'bold',
    },
    noFilesText: {
        color: COLORS.textSecondary,
        textAlign: 'center',
        paddingVertical: 15,
        fontStyle: 'italic',
    },
});