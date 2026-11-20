/**
 * Android system photo picker; no broad access to private media is requested.
 * Gallery images become small JPEGs before being stored inside the METRA visit.
 */
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system/legacy';

export const GALERIE_MAX_OCTETS = 1500000;
export const GALERIE_MAX_PX = 1920;
const PASSES = Object.freeze([
  { maxPx: 1920, quality: 0.70 },
  { maxPx: 1600, quality: 0.62 },
  { maxPx: 1280, quality: 0.52 },
]);

export function nettoyerTitrePhotoGalerie(value, fallback = 'Photo') {
  const cleaned = String(value ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\|\|/g, ' ')
    .replace(/[\\/:*?"<>|]+/g, ' ')
    .replace(/\s+/g, ' ').trim().slice(0, 120);
  return cleaned || String(fallback || 'Photo').slice(0,120);
}

export function titrePhotoGalerie(asset, contextLabel = 'Photo') {
  // A meaningful visit/equipment label is more useful than IMG_1234 in reports.
  return nettoyerTitrePhotoGalerie(contextLabel || asset?.fileName || 'Photo');
}

export async function choisirPhotoDansGalerie() {
  // The OS picker can expose Albums/Search depending on Android version and
  // provider. A native camera screen cannot be augmented with a custom search.
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    allowsEditing: false,
    allowsMultipleSelection: false,
    base64: false,
    exif: false,
    quality: 1,
  });
  if (result?.canceled || !result?.assets?.length) return null;
  const asset = result.assets[0];
  if (!asset?.uri || (asset.type && asset.type !== 'image'))
    throw new Error('Sélectionne une image depuis la galerie.');
  return asset;
}

function calculerReduction(width, height, maxPx) {
  const w = Number(width || 0), h = Number(height || 0);
  if (w <= 0 || h <= 0 || Math.max(w,h) <= maxPx) return [];
  return w >= h ? [{ resize: { width: maxPx } }] : [{ resize: { height: maxPx } }];
}

export function estPhotoTemporaireGalerie(uri) {
  return !!FileSystem.cacheDirectory && String(uri || '').startsWith(FileSystem.cacheDirectory);
}

export async function nettoyerPhotoTemporaireGalerie(uri) {
  if (estPhotoTemporaireGalerie(uri)) await FileSystem.deleteAsync(uri,{idempotent:true}).catch(()=>{});
}

/**
 * Fail closed: never fall back to copying a 15MB HEIC or uncompressed picture.
 * Keep dimensions proportional and never upscale a small source image.
 */
export async function compresserPhotoDeGalerie(asset, maxOctets = GALERIE_MAX_OCTETS) {
  if (!asset?.uri) throw new Error('Image de galerie absente.');
  let current = asset.uri;
  let width = Number(asset.width || 0), height = Number(asset.height || 0);
  let generated = null;
  try {
    for (const step of PASSES) {
      const actions = calculerReduction(width,height,step.maxPx);
      const output = await ImageManipulator.manipulateAsync(current,actions,{
        compress: step.quality,format:ImageManipulator.SaveFormat.JPEG,
      });
      if (!output?.uri) throw new Error('Conversion JPEG de la photo impossible.');
      if (generated && generated !== asset.uri) await nettoyerPhotoTemporaireGalerie(generated);
      generated = output.uri;
      current = output.uri;
      width = Number(output.width || width);
      height = Number(output.height || height);
      const info = await FileSystem.getInfoAsync(current,{size:true});
      if (!info?.exists || !(Number(info.size)>0))
        throw new Error('Le fichier photo converti est vide ou inaccessible.');
      if (Number(info.size) <= maxOctets)
        return {uri:current,width,height,size:Number(info.size),mimeType:'image/jpeg'};
    }
    throw new Error('Image trop lourde même après compression : sélectionne une photo de résolution inférieure.');
  } catch(error) {
    if(generated && generated!==asset.uri) await nettoyerPhotoTemporaireGalerie(generated);
    throw error;
  }
}
