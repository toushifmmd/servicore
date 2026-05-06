import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, ScrollView, Image } from 'react-native';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../lib/supabase';

export function VisitDetailScreen({ route, navigation }: any) {
  const { visit } = route.params;
  const [photo, setPhoto] = useState<string | null>(null);
  const [gps, setGps] = useState<{ lat: number; lng: number } | null>(null);
  const [uploading, setUploading] = useState(false);

  const capturePhotoAndGPS = async () => {
    // Get GPS
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return Alert.alert('Error', 'Location permission required');

    const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
    setGps({ lat: loc.coords.latitude, lng: loc.coords.longitude });

    // Take photo
    const { status: camStatus } = await ImagePicker.requestCameraPermissionsAsync();
    if (camStatus !== 'granted') return Alert.alert('Error', 'Camera permission required');

    const result = await ImagePicker.launchCameraAsync({
      quality: 0.8,
      base64: false,
    });

    if (!result.canceled) {
      setPhoto(result.assets[0].uri);
    }
  };

  const uploadProof = async () => {
    if (!photo || !gps) return Alert.alert('Error', 'Capture photo with GPS first');

    setUploading(true);
    try {
      // Upload photo to Supabase Storage
      const fileName = `visit-${visit.id}-${Date.now()}.jpg`;
      const response = await fetch(photo);
      const blob = await response.blob();

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('service-photos')
        .upload(fileName, blob, { contentType: 'image/jpeg' });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from('service-photos').getPublicUrl(fileName);
      const photoUrl = urlData.publicUrl;

      // Update visit record
      const { error: updateError } = await supabase
        .from('service_visits')
        .update({
          status: 'completed',
          completed_date: new Date().toISOString().split('T')[0],
          gps_latitude: gps.lat,
          gps_longitude: gps.lng,
          photo_url: photoUrl,
        })
        .eq('id', visit.id);

      if (updateError) throw updateError;

      // Save photo metadata
      await supabase.from('service_photos').insert([{
        visit_id: visit.id,
        photo_url: photoUrl,
        gps_latitude: gps.lat,
        gps_longitude: gps.lng,
        timestamp: new Date().toISOString(),
      }]);

      Alert.alert('✅ Success', 'Visit completed with GPS proof!', [
        { text: 'OK', onPress: () => navigation.goBack() }
      ]);
    } catch (e: any) {
      Alert.alert('Upload Failed', e.message);
    }
    setUploading(false);
  };

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.clientName}>{visit.clients?.name}</Text>
      <Text style={styles.address}>{visit.clients?.address}</Text>
      <Text style={styles.date}>📅 {new Date(visit.scheduled_date).toLocaleDateString('en-IN')}</Text>

      <View style={styles.statusRow}>
        <Text style={styles.label}>Status:</Text>
        <Text style={[styles.status, { color: visit.status === 'completed' ? '#10b981' : '#f59e0b' }]}>
          {visit.status}
        </Text>
      </View>

      {visit.status !== 'completed' && (
        <>
          <TouchableOpacity style={styles.captureBtn} onPress={capturePhotoAndGPS}>
            <Text style={styles.btnText}>📸 Capture Photo + GPS</Text>
          </TouchableOpacity>

          {photo && (
            <View style={styles.preview}>
              <Image source={{ uri: photo }} style={styles.image} />
              {gps && (
                <Text style={styles.gps}>
                  📍 {gps.lat.toFixed(6)}, {gps.lng.toFixed(6)}
                </Text>
              )}
            </View>
          )}

          {photo && gps && (
            <TouchableOpacity style={styles.uploadBtn} onPress={uploadProof} disabled={uploading}>
              <Text style={styles.btnText}>{uploading ? 'Uploading...' : '✅ Complete Visit'}</Text>
            </TouchableOpacity>
          )}
        </>
      )}

      {visit.status === 'completed' && (
        <View style={styles.completedInfo}>
          <Text style={styles.completedText}>✅ Visit Completed</Text>
          <Text style={styles.gps}>📍 {visit.gps_latitude?.toFixed(6)}, {visit.gps_longitude?.toFixed(6)}</Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0f', padding: 16 },
  clientName: { fontSize: 24, fontWeight: 'bold', color: '#fff', marginTop: 16 },
  address: { fontSize: 16, color: '#aaa', marginTop: 4 },
  date: { fontSize: 14, color: '#6366f1', marginTop: 8 },
  statusRow: { flexDirection: 'row', alignItems: 'center', marginTop: 16, gap: 8 },
  label: { fontSize: 14, color: '#888' },
  status: { fontSize: 16, fontWeight: '600', textTransform: 'capitalize' },
  captureBtn: { backgroundColor: '#1a1a2e', borderRadius: 12, padding: 18, alignItems: 'center', marginTop: 24, borderWidth: 1, borderColor: '#6366f1' },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  preview: { marginTop: 16, alignItems: 'center' },
  image: { width: '100%', height: 300, borderRadius: 12 },
  gps: { color: '#10b981', fontSize: 13, marginTop: 8, fontFamily: 'monospace' },
  uploadBtn: { backgroundColor: '#10b981', borderRadius: 12, padding: 18, alignItems: 'center', marginTop: 16 },
  completedInfo: { marginTop: 24, padding: 16, backgroundColor: '#10b98120', borderRadius: 12, alignItems: 'center' },
  completedText: { color: '#10b981', fontSize: 18, fontWeight: '600' },
});
