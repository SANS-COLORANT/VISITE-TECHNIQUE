import * as ImagePicker from 'expo-image-picker';

let permissionState = null;
let permissionPromise = null;
let launchPromise = null;
let lastCheckAt = 0;

function now() {
  return Date.now();
}

async function readPermission() {
  try {
    const current = await ImagePicker.getCameraPermissionsAsync();
    permissionState = current?.granted ? 'granted' : current?.canAskAgain === false ? 'blocked' : 'denied';
    lastCheckAt = now();
    return current;
  } catch {
    permissionState = null;
    return null;
  }
}

export async function prewarmCameraRuntime() {
  if (permissionState === 'granted' && now() - lastCheckAt < 120000) return { granted: true };
  if (permissionPromise) return permissionPromise;
  permissionPromise = readPermission().finally(() => {
    permissionPromise = null;
  });
  return permissionPromise;
}

export async function ensureCameraPermission() {
  if (permissionState === 'granted') return true;

  const current = await prewarmCameraRuntime();
  if (current?.granted) return true;
  if (current?.canAskAgain === false || permissionState === 'blocked') return false;

  const requested = await ImagePicker.requestCameraPermissionsAsync();
  permissionState = requested?.granted ? 'granted' : requested?.canAskAgain === false ? 'blocked' : 'denied';
  lastCheckAt = now();
  return Boolean(requested?.granted);
}

export async function launchMetraCamera({ quality = 0.5, allowsEditing = false } = {}) {
  // Un double tap ne doit jamais ouvrir deux activités caméra Android.
  if (launchPromise) return launchPromise;

  launchPromise = (async () => {
    const granted = await ensureCameraPermission();
    if (!granted) return { status: 'permission', uri: null };

    const result = await ImagePicker.launchCameraAsync({
      quality,
      allowsEditing,
      base64: false,
      exif: false,
      mediaTypes: ImagePicker.MediaTypeOptions.Images
    });
    if (result?.canceled || !result?.assets?.[0]?.uri) return { status: 'cancelled', uri: null };
    return { status: 'captured', uri: result.assets[0].uri, asset: result.assets[0] };
  })().finally(() => {
    launchPromise = null;
  });

  return launchPromise;
}

export function cameraRuntimeStatus() {
  return {
    permission: permissionState,
    checkingPermission: Boolean(permissionPromise),
    cameraOpen: Boolean(launchPromise),
    lastCheckAt
  };
}
