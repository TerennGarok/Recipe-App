import * as ImagePicker from 'expo-image-picker';
import { Alert } from 'react-native';

import type { LocalAsset } from './recipes';

function toAssets(res: ImagePicker.ImagePickerResult): LocalAsset[] {
  if (res.canceled) return [];
  return res.assets.map((a) => ({
    uri: a.uri,
    kind: a.type === 'video' ? 'video' : 'image',
    mimeType: a.mimeType ?? null,
    fileName: a.fileName ?? null,
  }));
}

export async function takeWithCamera(kind: 'photo' | 'photo-or-video'): Promise<LocalAsset[]> {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) {
    Alert.alert('Camera access needed', 'Allow camera access in Settings to scan recipes and take food photos.');
    return [];
  }
  return toAssets(
    await ImagePicker.launchCameraAsync({
      mediaTypes: kind === 'photo' ? ['images'] : ['images', 'videos'],
      quality: 0.9,
      videoMaxDuration: 180,
    }),
  );
}

export async function pickFromLibrary(kind: 'photos' | 'photos-and-videos', multiple = true): Promise<LocalAsset[]> {
  return toAssets(
    await ImagePicker.launchImageLibraryAsync({
      mediaTypes: kind === 'photos' ? ['images'] : ['images', 'videos'],
      allowsMultipleSelection: multiple,
      selectionLimit: 10,
      quality: 0.9,
    }),
  );
}
