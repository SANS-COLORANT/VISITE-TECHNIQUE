import React, { useMemo } from 'react';
import { FlatList, Image, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { COLORS, styles } from './styles.js';
const DEFAULT_COVER = require('./assets/report/cover-building.png');

const TEXT_LABELS = { compact: 'Petit', normal: 'Normal', large: 'Grand' };

function Chip({ label, active, onPress }) {
  return <TouchableOpacity
    onPress={onPress}
    style={{
      paddingHorizontal: 10,
      paddingVertical: 7,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: active ? COLORS.orange : COLORS.line,
      backgroundColor: active ? '#FFF3E8' : '#fff',
    }}
  ><Text style={{ color: active ? COLORS.orange : COLORS.ink, fontWeight: '800', fontSize: 12 }}>{label}</Text></TouchableOpacity>;
}

function MiniButton({ label, onPress, disabled, danger = false }) {
  return <TouchableOpacity
    disabled={disabled}
    onPress={onPress}
    style={{
      paddingHorizontal: 10,
      paddingVertical: 7,
      borderRadius: 9,
      borderWidth: 1,
      borderColor: danger ? '#F1B2AC' : COLORS.line,
      backgroundColor: danger ? '#FFF1EF' : '#fff',
      opacity: disabled ? 0.35 : 1,
    }}
  ><Text style={{ fontSize: 12, fontWeight: '800', color: danger ? '#B42318' : COLORS.ink }}>{label}</Text></TouchableOpacity>;
}

function sectionKey(visiteId, panelId) { return `${visiteId}||${panelId}`; }

function ordreSection(layout, data, section, index) {
  const v = layout?.sections?.[sectionKey(data.visite.id, section.panelId)]?.ordre;
  return Number.isFinite(Number(v)) ? Number(v) : index;
}

function sectionsOrdonnees(data, layout) {
  return (data.sections || [])
    .map((section, index) => ({ section, index, ordre: ordreSection(layout, data, section, index) }))
    .sort((a, b) => a.ordre - b.ordre || a.index - b.index);
}

function poidsPhoto(size) {
  if (size === 'small') return 2;
  if (size === 'large') return 6;
  if (size === 'full') return 12;
  return 3;
}

function grouperPhotosPages(items) {
  const pages = [];
  let page = [], charge = 0;
  for (const photo of items) {
    const poids = poidsPhoto(photo.size || 'medium');
    if (page.length && charge + poids > 12) {
      pages.push(page);
      page = [];
      charge = 0;
    }
    page.push(photo);
    charge += poids;
    if (charge >= 12) {
      pages.push(page);
      page = [];
      charge = 0;
    }
  }
  if (page.length) pages.push(page);
  return pages;
}

function buildPreviewItems(datas, photos, config, layout) {
  const out = [{ id: 'cover', type: 'cover' }];
  for (let siteIndex = 0; siteIndex < datas.length; siteIndex += 1) {
    const data = datas[siteIndex];
    out.push({ id: `site-${data.visite.id}`, type: 'site', data, siteIndex });
    const sections = sectionsOrdonnees(data, layout);
    sections.forEach((entry, index) => out.push({
      id: `section-${data.visite.id}-${entry.section.panelId}`,
      type: 'section',
      data,
      section: entry.section,
      sectionIndex: index,
      sectionTotal: sections.length,
    }));
    if (config.remarques && (data.remarques || []).length) out.push({ id: `reserves-${data.visite.id}`, type: 'reserves', data });
    const sitePhotos = config.photos === false ? [] : (photos || []).filter((p) => p.visiteId === data.visite.id && p.include).sort((a, b) => a.ordre - b.ordre);
    grouperPhotosPages(sitePhotos).forEach((page, index) => out.push({ id: `photos-${data.visite.id}-${index}`, type: 'photos', data, photos: page, pageIndex: index }));
    if (config.materiel && (data.materiel || []).length) out.push({ id: `materiel-${data.visite.id}`, type: 'materiel', data });
  }
  return out;
}

function Page({ children, muted = false }) {
  return <View style={{ alignItems: 'center', marginBottom: 10 }}>
    <View style={{
      width: '100%', maxWidth: 360, aspectRatio: 210 / 297,
      backgroundColor: '#fff', borderWidth: 1, borderColor: COLORS.line,
      borderRadius: 4, padding: 18, shadowColor: '#000', shadowOpacity: 0.06,
      shadowRadius: 8, elevation: 2, opacity: muted ? 0.42 : 1,
    }}>{children}</View>
  </View>;
}

function CoverPage({ config }) {
  const cover = config.coverUri || null;
  return <Page>
    <Text style={{ fontWeight: '900', fontSize: 17, color: COLORS.orange }}>ÉNERGIE & SERVICE</Text>
    <Text style={{ alignSelf: 'flex-end', marginTop: 12, fontSize: 8 }}>VERSAILLES, le {config.dateRapport || ''}</Text>
    <Text style={{ marginTop: 16, fontWeight: '700', fontSize: 8 }}>Nos réf. : {config.chrono || ''}</Text>
    <View style={{ marginTop: 16, backgroundColor: COLORS.orange, padding: 10, borderRadius: 18 }}><Text style={{ color: '#fff', textAlign: 'center', fontSize: 16, fontWeight: '900' }}>{config.clientLabel || 'Rapport de visite'}</Text></View>
    <Image source={cover ? { uri: cover } : DEFAULT_COVER} style={{ width: '100%', height: 145, marginTop: 12, backgroundColor: '#eee' }} resizeMode="cover" />
    <Text style={{ marginTop: 18, textAlign: 'center', fontWeight: '900', fontSize: 14 }}>{config.objet || 'Compte rendu de visite technique'}</Text>
    <View style={{ flex: 1 }} />
    <View style={{ height: 13, backgroundColor: COLORS.orange, marginHorizontal: -18, marginBottom: -18 }} />
  </Page>;
}

function SitePage({ item, onMoveSite, total }) {
  const d = item.data;
  return <>
    <Page>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontSize: 23, fontWeight: '900', textDecorationLine: 'underline', textAlign: 'center' }}>{d.visite.nom_site || 'Site'}</Text>
        <Text style={{ fontSize: 17, fontWeight: '800', textDecorationLine: 'underline', marginTop: 18, textAlign: 'center' }}>{d.visite.nom_local || d.visite.type_local || 'Installation technique'}</Text>
        <Text style={{ marginTop: 18, color: COLORS.inkSoft, textAlign: 'center' }}>{d.trame?.nom || d.visite.trame_id || 'Visite technique'} · {d.visite.date_visite || ''}</Text>
      </View>
    </Page>
    <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: 20 }}>
      <MiniButton label="↑ Site" disabled={item.siteIndex === 0} onPress={() => onMoveSite(item.siteIndex, item.siteIndex - 1)} />
      <MiniButton label="↓ Site" disabled={item.siteIndex === total - 1} onPress={() => onMoveSite(item.siteIndex, item.siteIndex + 1)} />
    </View>
  </>;
}

function SectionPage({ item, layout, onPatchSection, onMoveSection }) {
  const d = item.data, s = item.section;
  const key = sectionKey(d.visite.id, s.panelId);
  const ov = layout?.sections?.[key] || {};
  const visible = ov.visible !== false;
  const title = ov.title ?? s.title ?? '';
  const showBanner = s.banner || Boolean(ov.title);
  const titleSize = ov.titleSize || 'normal';
  const font = titleSize === 'small' ? 11 : titleSize === 'large' ? 17 : 14;
  const bodyScale = layout?.textScale || 'normal';
  const rowFont = bodyScale === 'compact' ? 6.7 : bodyScale === 'large' ? 8.3 : 7.5;
  const previewRows = (s.groups || []).flatMap((g) => (g.rows || []).slice(0, 3).map((r) => ({ group: g.title, ...r }))).slice(0, 12);
  return <>
    <Page muted={!visible}>
      {showBanner ? <View style={{ backgroundColor: COLORS.orange, paddingVertical: 8, paddingHorizontal: 8, marginBottom: 12 }}><Text style={{ color: '#fff', textAlign: 'center', fontWeight: '900', fontSize: font }}>{title || s.panelId}</Text></View> : null}
      {previewRows.length ? previewRows.map((r, i) => <View key={`${r.group}-${r.label}-${i}`} style={{ flexDirection: 'row', borderWidth: 0.5, borderColor: '#777', minHeight: 24 }}>
        <Text style={{ width: '36%', padding: 4, backgroundColor: '#F8CBAD', fontSize: rowFont, fontWeight: '700' }}>{r.label}</Text>
        <Text style={{ width: '12%', padding: 4, textAlign: 'center', fontSize: rowFont, color: String(r.avis).toUpperCase().includes('N.S') ? '#B42318' : '#087A2E' }}>{r.avis || ''}</Text>
        <Text numberOfLines={2} style={{ flex: 1, padding: 4, fontSize: rowFont }}>{r.comment || '/'}</Text>
      </View>) : <Text style={{ color: COLORS.inkSoft, textAlign: 'center', marginTop: 30 }}>Section sans donnée visible dans l’aperçu.</Text>}
      {!visible ? <View style={{ position: 'absolute', left: 20, right: 20, top: '45%', padding: 10, backgroundColor: '#fff', borderWidth: 1, borderColor: COLORS.line }}><Text style={{ textAlign: 'center', fontWeight: '900' }}>SECTION MASQUÉE DU RAPPORT</Text></View> : null}
    </Page>
    <View style={[styles.card, { marginBottom: 20, maxWidth: 720, alignSelf: 'center', width: '100%', flexDirection: 'column', alignItems: 'stretch', justifyContent: 'flex-start' }]}>
      <Text style={styles.fieldLabel}>Titre dans le rapport</Text>
      <TextInput style={styles.input} value={title} onChangeText={(v) => onPatchSection(d.visite.id, s.panelId, { title: v })} placeholder={s.title || 'Titre de section'} />
      <Text style={[styles.fieldLabel, { marginTop: 10 }]}>Taille du titre</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>
        {['small', 'normal', 'large'].map((v) => <Chip key={v} label={v === 'small' ? 'Petit' : v === 'large' ? 'Grand' : 'Normal'} active={titleSize === v} onPress={() => onPatchSection(d.visite.id, s.panelId, { titleSize: v })} />)}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
        <MiniButton label="↑ Section" disabled={item.sectionIndex === 0} onPress={() => onMoveSection(d.visite.id, s.panelId, -1)} />
        <MiniButton label="↓ Section" disabled={item.sectionIndex === item.sectionTotal - 1} onPress={() => onMoveSection(d.visite.id, s.panelId, 1)} />
        <MiniButton label={ov.breakBefore ?? s.breakBefore ? 'Saut de page ✓' : 'Saut de page'} onPress={() => onPatchSection(d.visite.id, s.panelId, { breakBefore: !(ov.breakBefore ?? s.breakBefore) })} />
        <MiniButton label={visible ? 'Masquer' : 'Réafficher'} danger={visible} onPress={() => onPatchSection(d.visite.id, s.panelId, { visible: !visible })} />
      </View>
    </View>
  </>;
}

function StaticPage({ title, lines = [] }) {
  return <Page><View style={{ backgroundColor: COLORS.orange, padding: 8, marginBottom: 12 }}><Text style={{ color: '#fff', fontWeight: '900', textAlign: 'center', fontSize: 14 }}>{title}</Text></View>{lines.slice(0, 10).map((line, i) => <View key={i} style={{ borderBottomWidth: 0.5, borderColor: COLORS.line, paddingVertical: 6 }}><Text numberOfLines={2} style={{ fontSize: 8 }}>{line}</Text></View>)}</Page>;
}

function PhotoPreviewPage({ item, onPatchPhoto }) {
  const cycle = (photo, kind) => {
    if (kind === 'size') {
      const values = ['small', 'medium', 'large', 'full'];
      const next = values[(values.indexOf(photo.size || 'medium') + 1) % values.length];
      onPatchPhoto(photo.id, { size: next });
    } else {
      const values = ['small', 'normal', 'large'];
      const next = values[(values.indexOf(photo.captionSize || 'normal') + 1) % values.length];
      onPatchPhoto(photo.id, { captionSize: next });
    }
  };
  return <Page>
    <View style={{ backgroundColor: COLORS.orange, padding: 7, marginBottom: 10 }}><Text style={{ color: '#fff', textAlign: 'center', fontWeight: '900' }}>PHOTOGRAPHIES</Text></View>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7, alignItems: 'flex-start' }}>
      {item.photos.map((p) => {
        const size = p.size || 'medium';
        const width = size === 'small' ? '31%' : size === 'medium' ? '48%' : '100%';
        const height = size === 'small' ? 62 : size === 'medium' ? 88 : size === 'large' ? 120 : 190;
        const captionFont = p.captionSize === 'small' ? 7 : p.captionSize === 'large' ? 10 : 8;
        return <View key={p.id} style={{ width, borderWidth: 0.7, borderColor: '#555', marginBottom: 5 }}>
          <TouchableOpacity onPress={() => cycle(p, 'size')}><Image source={{ uri: p.uri }} style={{ width: '100%', height, backgroundColor: '#eee' }} resizeMode="contain" /></TouchableOpacity>
          <TouchableOpacity onPress={() => cycle(p, 'caption')} style={{ backgroundColor: '#F8CBAD', minHeight: 22, padding: 4, justifyContent: 'center' }}><Text style={{ textAlign: 'center', fontSize: captionFont, fontWeight: '700' }} numberOfLines={2}>{p.label || 'Photo'}</Text></TouchableOpacity>
        </View>;
      })}
    </View>
    <Text style={{ position: 'absolute', bottom: 8, left: 18, right: 18, textAlign: 'center', color: COLORS.inkSoft, fontSize: 7 }}>Touchez une image pour changer sa taille, ou son libellé pour changer la taille du texte.</Text>
  </Page>;
}

export function ReportLayoutEditor({
  datas, photos, config, layout, onLayoutChange, onMoveSite, onPatchPhoto,
  onGenerate, busy, format, onFormatChange,
}) {
  const items = useMemo(() => buildPreviewItems(datas, photos, config, layout), [datas, photos, config, layout]);
  const totalReserves = useMemo(() => datas.reduce((n, d) => n + (d.remarques || []).length, 0), [datas]);
  const selectedPhotos = useMemo(() => photos.filter((p) => p.include).length, [photos]);

  const patchLayout = (patch) => onLayoutChange({ ...layout, ...patch });
  const patchSection = (visiteId, panelId, patch) => {
    const key = sectionKey(visiteId, panelId);
    onLayoutChange({ ...layout, sections: { ...(layout.sections || {}), [key]: { ...(layout.sections?.[key] || {}), ...patch } } });
  };
  const moveSection = (visiteId, panelId, delta) => {
    const data = datas.find((d) => d.visite.id === visiteId); if (!data) return;
    const ordered = sectionsOrdonnees(data, layout);
    const index = ordered.findIndex((x) => x.section.panelId === panelId);
    const target = index + delta;
    if (index < 0 || target < 0 || target >= ordered.length) return;
    const a = ordered[index], b = ordered[target];
    const ka = sectionKey(visiteId, a.section.panelId), kb = sectionKey(visiteId, b.section.panelId);
    onLayoutChange({
      ...layout,
      sections: {
        ...(layout.sections || {}),
        [ka]: { ...(layout.sections?.[ka] || {}), ordre: b.ordre },
        [kb]: { ...(layout.sections?.[kb] || {}), ordre: a.ordre },
      },
    });
  };

  const renderItem = ({ item }) => {
    if (item.type === 'cover') return <CoverPage config={{ ...config, clientLabel: datas[0]?.visite?.nom_client || 'Rapport' }} />;
    if (item.type === 'site') return <SitePage item={item} total={datas.length} onMoveSite={onMoveSite} />;
    if (item.type === 'section') return <SectionPage item={item} layout={layout} onPatchSection={patchSection} onMoveSection={moveSection} />;
    if (item.type === 'photos') return <PhotoPreviewPage item={item} onPatchPhoto={onPatchPhoto} />;
    if (item.type === 'reserves') return <StaticPage title="REMARQUES PARTICULIÈRES" lines={(item.data.remarques || []).map((r) => `${r.poste || 'Remarque'} — ${r.prestation || '/'}`)} />;
    if (item.type === 'materiel') return <StaticPage title="LISTING MATÉRIEL" lines={(item.data.materiel || []).map((m) => `${m.categorie || ''} — ${m.designation || ''} ${m.marque || ''} ${m.modele || ''}`)} />;
    return null;
  };

  return <FlatList
    data={items}
    keyExtractor={(item) => item.id}
    renderItem={renderItem}
    contentContainerStyle={[styles.content, { paddingBottom: 38 }]}
    removeClippedSubviews
    initialNumToRender={3}
    maxToRenderPerBatch={3}
    windowSize={5}
    ListHeaderComponent={<View>
      <Text style={styles.sectionTitle}>Aperçu PDF dynamique</Text>
      <Text style={styles.importHint}>L’aperçu est volontairement léger : il simule le rendu A4 sans régénérer le PDF à chaque changement. Le PDF final est calculé uniquement à la fin.</Text>
      <View style={[styles.card, { marginTop: 12, flexDirection: 'column', alignItems: 'stretch', justifyContent: 'flex-start' }]}>
        <Text style={styles.cardTitle}>Contrôle avant génération</Text>
        <Text style={styles.cardSub}>{datas.length} site(s) · {selectedPhotos} photo(s) · {totalReserves} réserve(s) · couverture : {config.coverLabel || 'standard METRA'}</Text>
        <Text style={[styles.fieldLabel, { marginTop: 12 }]}>Taille générale du texte</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>
          {['compact', 'normal', 'large'].map((v) => <Chip key={v} label={TEXT_LABELS[v]} active={(layout.textScale || 'normal') === v} onPress={() => patchLayout({ textScale: v })} />)}
        </View>
      </View>
      <Text style={[styles.importHint, { marginVertical: 12 }]}>Sur les pages de section : modifie le titre, l’ordre, le saut de page ou masque la section. Sur les pages photos : touche directement une photo pour faire défiler Petite → Moyenne → Grande → Pleine largeur.</Text>
    </View>}
    ListFooterComponent={<View style={{ marginTop: 6 }}>
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
        <TouchableOpacity style={[styles.btnSecondary, { flex: 1 }, format === 'pdf' && { borderColor: COLORS.orange, backgroundColor: '#FFF3E8' }]} onPress={() => onFormatChange('pdf')}><Text style={styles.btnSecondaryText}>PDF</Text></TouchableOpacity>
        <TouchableOpacity style={[styles.btnSecondary, { flex: 1 }, format === 'word' && { borderColor: COLORS.orange, backgroundColor: '#FFF3E8' }]} onPress={() => onFormatChange('word')}><Text style={styles.btnSecondaryText}>Word</Text></TouchableOpacity>
      </View>
      <TouchableOpacity style={[styles.btnPrimary, { opacity: busy ? 0.55 : 1 }]} disabled={busy} onPress={onGenerate}><Text style={styles.btnPrimaryText}>{busy ? 'Génération…' : `Générer ${format === 'pdf' ? 'le PDF' : 'le Word'}`}</Text></TouchableOpacity>
    </View>}
  />;
}
