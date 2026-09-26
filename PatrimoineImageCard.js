import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, Modal, Text, TouchableOpacity, View } from 'react-native';
import { COLORS, styles, FONTS } from './styles.js';
import { CvcIcon } from './MetraCvcIcons.js';
import { IconOrb } from './premiumChrome.js';
import { prewarmCameraRuntime } from './cameraRuntime.js';
import { PhotoVariantImage } from './PhotoVariantImage.js';
import { enregistrerImagePatrimoine, lireImagePatrimoine } from './patrimoineImageDb.js';
import { importerImagePatrimoine, supprimerImagePatrimoine } from './patrimoineImageStorage.js';

export function PatrimoineThumbnail({ uri, size = 54, radius = 10, style = null }) {
  if (!uri) return null;
  return <PhotoVariantImage uri={uri} variant="thumb" resizeMode="cover" style={[{ width: size, height: size, borderRadius: radius, backgroundColor: '#F1F2F4', marginRight: 12 }, style]} />;
}

export function PatrimoineImageCard({ entityType, entityId, title, subtitle = null, onChanged = null }) {
  const [uri, setUri] = useState(null);
  const [busy, setBusy] = useState(false);
  const [viewer, setViewer] = useState(false);

  const charger = useCallback(async () => {
    if (!entityId) { setUri(null); return null; }
    const valeur = await lireImagePatrimoine(entityType, entityId);
    setUri(valeur || null);
    return valeur || null;
  }, [entityType, entityId]);

  useEffect(() => { charger().catch(() => {}); }, [charger]);

  const choisir = async (source) => {
    if (busy || !entityId) return;
    const ancienneUri = uri;
    setBusy(true);
    try {
      const nouvelleUri = await importerImagePatrimoine({
        type: entityType,
        id: entityId,
        source,
        onCaptured: (tempUri) => {
          // Retour caméra instantané : la photo apparaît pendant la compression
          // et la copie durable, au lieu d'afficher un spinner sur l'ancienne.
          if (tempUri) setUri(tempUri);
        },
      });
      if (!nouvelleUri) { setUri(ancienneUri); return; }
      await enregistrerImagePatrimoine(entityType, entityId, nouvelleUri);
      setUri(nouvelleUri);
      onChanged?.(nouvelleUri);
    } catch (e) {
      setUri(ancienneUri);
      Alert.alert('Image impossible', String(e?.message || e));
    } finally {
      setBusy(false);
    }
  };

  const demanderSuppression = () => {
    if (!uri || busy) return;
    Alert.alert(
      'Supprimer cette image ?',
      'La photo de couverture sera retirée du patrimoine local. Les photos de visite ne sont pas concernées.',
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Supprimer', style: 'destructive', onPress: async () => {
          setBusy(true);
          try {
            const ancienneUri = uri;
            await enregistrerImagePatrimoine(entityType, entityId, null);
            setUri(null);
            setViewer(false);
            await supprimerImagePatrimoine({ type: entityType, id: entityId, uri: ancienneUri }).catch(() => {});
            onChanged?.(null);
          } catch (e) {
            Alert.alert('Suppression impossible', String(e?.message || e));
          } finally {
            setBusy(false);
          }
        } },
      ]
    );
  };

  const libelleType = entityType === 'client' ? 'Image du client' : 'Image du site';

  return <View style={{ backgroundColor: 'rgba(255,255,255,0.82)', borderRadius: 14, borderWidth: 1, borderColor: '#E3E5E8', overflow: 'hidden', marginBottom: 14 }}>
    <TouchableOpacity activeOpacity={uri ? 0.86 : 1} onPress={() => { if (uri) setViewer(true); }} accessibilityRole={uri ? 'imagebutton' : undefined}>
      {uri ? <PhotoVariantImage uri={uri} variant={busy ? 'original' : 'thumb'} resizeMode="cover" style={{ width: '100%', height: 152, backgroundColor: '#F2F3F5' }} /> : <View style={{ height: 96, backgroundColor: 'rgba(255,255,255,0.66)', alignItems: 'center', justifyContent: 'center', borderBottomWidth: 1, borderBottomColor: '#ECEEF1' }}>
        <IconOrb accent={COLORS.orange} light={COLORS.orangeLight} size={40}><CvcIcon name="gallery" size={20} color={COLORS.orangeDark} /></IconOrb>
        <Text style={{ marginTop: 7, color: COLORS.muted, fontSize: 12 }}>{libelleType} non renseignée</Text>
      </View>}
    </TouchableOpacity>

    <View style={{ padding: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
        <View style={{ flex: 1, paddingRight: 10 }}>
          <Text numberOfLines={1} style={{ color: COLORS.ink, fontSize: 14, fontFamily: FONTS.bold }}>{title || libelleType}</Text>
          <Text style={{ color: COLORS.muted, fontSize: 11.5, marginTop: 2 }}>{subtitle || `${libelleType} · stockée hors connexion`}</Text>
        </View>
        {busy ? <ActivityIndicator color={COLORS.orange || '#F26426'} /> : null}
      </View>
      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
        <TouchableOpacity disabled={busy} onPressIn={() => { prewarmCameraRuntime().catch(() => {}); }} onPress={() => choisir('camera')} style={[styles.btnSecondary, { flex: 1, minWidth: 145, minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }]}>
          <CvcIcon name="camera" size={17} color={COLORS.ink} /><Text style={styles.btnSecondaryText}>Prendre une photo</Text>
        </TouchableOpacity>
        <TouchableOpacity disabled={busy} onPress={() => choisir('galerie')} style={[styles.btnSecondary, { flex: 1, minWidth: 130, minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }]}>
          <CvcIcon name="gallery" size={17} color={COLORS.ink} /><Text style={styles.btnSecondaryText}>Galerie</Text>
        </TouchableOpacity>
        {uri ? <TouchableOpacity disabled={busy} onPress={demanderSuppression} style={{ minHeight: 44, paddingHorizontal: 13, borderRadius: 10, borderWidth: 1, borderColor: '#F0D1CD', backgroundColor: '#FFF7F6', alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: COLORS.red || '#B42318', fontFamily: FONTS.bold }}>Supprimer</Text>
        </TouchableOpacity> : null}
      </View>
    </View>

    <Modal visible={viewer} transparent animationType="fade" onRequestClose={() => setViewer(false)}>
      <View style={[styles.modalOverlay, { padding: 18 }]}>
        <View style={{ width: '100%', maxWidth: 850, maxHeight: '88%', backgroundColor: '#FFFFFF', borderRadius: 18, overflow: 'hidden' }}>
          {uri ? <PhotoVariantImage uri={uri} variant="preview" resizeMode="contain" style={{ width: '100%', height: 520, maxHeight: '75%', backgroundColor: '#111827' }} /> : null}
          <View style={{ flexDirection: 'row', gap: 8, padding: 12 }}>
            <TouchableOpacity style={[styles.btnSecondary, { flex: 1 }]} onPress={() => setViewer(false)}><Text style={styles.btnSecondaryText}>Fermer</Text></TouchableOpacity>
            <TouchableOpacity style={[styles.btnPrimary, { flex: 1 }]} onPress={() => { setViewer(false); choisir('galerie'); }}><Text style={styles.btnPrimaryText}>Remplacer</Text></TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  </View>;
}
