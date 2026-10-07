import React, { useEffect, useMemo, useState } from 'react';
import { Modal, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { getChampsVisite, getControlesVisite, listerCompteurs } from './db.js';
import { construireEspacesVisite, utiliseParcoursTerrain } from './terrainVisitModel.js';
import { TrameGenericPanel } from './TrameGenericPanel.js';
import { OptimizedRelevesPanel } from './OptimizedRelevesPanel.js';
import { OptimizedRegulationPanel } from './OptimizedRegulationPanel.js';
import { COLORS, FONTS, styles } from './styles.js';
import { CvcIcon } from './MetraCvcIcons.js';
import { ProgressRing } from './premiumChrome.js';
import { ButtonGlow } from './ButtonGlow.js';
import { subscribeSaveActivity } from './saveActivity.js';

export function VisitSpaces({ visiteId, trameId, panels, labels, tabIds, onOpenPanel, onClose, onSaved }) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(null);
  const [sub, setSub] = useState(null);
  const [revision, setRevision] = useState(0);
  const [values, setValues] = useState({});
  const spaces = useMemo(() => construireEspacesVisite(panels, trameId, labels), [panels, trameId, labels]);
  useEffect(()=>subscribeSaveActivity(state=>{if(state.lastSavedAt && state.pending===0)setRevision(v=>v+1)}),[]);
  useEffect(() => {
    let alive = true;
    Promise.all([getChampsVisite(visiteId), getControlesVisite(visiteId), listerCompteurs(visiteId)]).then(([fields, controls, counters]) => {
      const next = Object.fromEntries([...fields.map(r => [`${r.section_code}||${r.cle}`, r.valeur]), ...controls.map(r => [`${r.section_code}||${r.cle}`, r.avis])]);
      const norm = v => String(v || '').replace(/^Index\s*/i,'').replace(/\s*\([^)]*\)\s*$/, '').trim().toLowerCase();
      for (const row of spaces.flatMap(s=>s.rows)) {
        if (row.panelId !== 'p-releves' || !/^Index/i.test(row.field.cle) || !counters.length) continue;
        const found = counters.filter(c=>c.destination ? c.destination===row.field.cle : norm(c.label)===norm(row.field.cle));
        next[row.key] = found.map(c=>c.valeur||'').join('').trim();
      }
      if (alive) setValues(next);
    }).catch(console.warn);
    return () => { alive = false; };
  }, [visiteId, revision]);
  const counts = (rows) => ({ done: rows.filter(r => String(values[r.key] || '').trim()).length, ns: rows.filter(r => values[r.key] === 'N.S').length, total: rows.length });
  const groups = useMemo(() => {
    const out = new Map();
    for (const row of selected?.rows || []) {
      const prefix = row.field.cle.includes(':') ? row.field.cle.split(':')[0] : row.section;
      const label = selected.id === 'securite' && /incendie/i.test(row.section) ? prefix : row.section;
      const key = `${row.panelId}||${row.section}||${label}`;
      if (!out.has(key)) out.set(key, { key, label, panelId: row.panelId, section: row.section, rows: [] });
      out.get(key).rows.push(row);
    }
    return [...out.values()];
  }, [selected]);
  const active = groups.find(g => g.key === sub) || groups[0];
  const saved = () => { setRevision(v => v + 1); onSaved?.(); };
  return <View style={{ flex: 1 }}>
    <ScrollView contentContainerStyle={styles.panelContent} keyboardShouldPersistTaps="handled">
      <TextInput accessibilityLabel="Trouver un point de contrôle" style={[styles.input, { marginBottom: 14 }]} placeholder="BAES, extincteur, soupape, pH…" value={query} onChangeText={setQuery} autoCorrect={false} />
      {spaces.filter(s => !query || [s.label, ...s.rows.map(r => `${r.section} ${r.field.cle}`)].join(' ').toLocaleLowerCase('fr').includes(query.toLocaleLowerCase('fr'))).map(space => {
        const count = counts(space.rows);
        return <TouchableOpacity key={space.id} style={[styles.formCard, { flexDirection: 'row', alignItems: 'center', gap: 12 }]} onPress={() => { if (!utiliseParcoursTerrain(trameId)) { onOpenPanel(space.id); return; } setSelected(space); setSub(null); }}>
          <CvcIcon name={space.icon} size={26} color={COLORS.orange} />
          <View style={{ flex: 1 }}><Text style={styles.cardTitle}>{space.label}</Text><Text numberOfLines={1} style={styles.importHint}>{[...new Set(space.rows.map(r => r.section))].join(', ')}</Text>{count.ns ? <Text style={{ fontFamily: FONTS.bodyBold, color: COLORS.red, marginTop: 4 }}>{count.ns} N.S</Text> : null}</View>
          <View style={{ alignItems: 'center' }}><ProgressRing pct={count.total ? 100 * count.done / count.total : 0} size={38} strokeWidth={4} /><Text style={{ fontFamily: FONTS.body, fontSize: 11, color: COLORS.inkSoft }}>{count.done}/{count.total}</Text></View>
        </TouchableOpacity>;
      })}
      <TouchableOpacity style={styles.btnSecondary} onPress={onClose}><Text style={styles.btnSecondaryText}>Tous les onglets de la trame</Text></TouchableOpacity>
    </ScrollView>
    <Modal visible={Boolean(selected)} animationType="slide" onRequestClose={() => { setSelected(null); saved(); }}>
      <View style={{ flex: 1, backgroundColor: COLORS.bg, paddingTop: 24 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', padding: 16, gap: 12 }}><TouchableOpacity accessibilityLabel="Retour au sommaire" onPress={() => { setSelected(null); saved(); }}><CvcIcon name="chevron-left" size={24} color={COLORS.ink}/></TouchableOpacity><Text style={[styles.modalTitle, { flex: 1, marginBottom: 0 }]}>{selected?.label}</Text></View>
        <ScrollView horizontal style={{ flexGrow: 0, paddingHorizontal: 12 }} contentContainerStyle={{ gap: 7, paddingBottom: 10 }}>
          {groups.map(g => { const n = counts(g.rows); const chosen = g.key === active?.key; return <TouchableOpacity key={g.key} onPress={() => setSub(g.key)} style={[chosen ? styles.btnPrimary : styles.btnSecondary, { minHeight: 44, paddingHorizontal: 12 }]}>{chosen ? <ButtonGlow/> : null}<Text numberOfLines={1} style={[chosen ? styles.btnPrimaryText : styles.btnSecondaryText, { maxWidth: 250 }]}>{g.label.replace(/^Coupure extérieure /i, 'Coupure ')} · {n.ns ? `${n.ns} N.S` : `${n.done}/${n.total}`}</Text></TouchableOpacity>; })}
        </ScrollView>
        {active?.panelId === 'p-releves' ? <OptimizedRelevesPanel visiteId={visiteId} onSaved={saved} trameId={trameId} panels={panels}/>
          : active?.panelId === 'p-regulation' ? <OptimizedRegulationPanel visiteId={visiteId} onSaved={saved}/>
          : active ? <TrameGenericPanel key={active.key} visiteId={visiteId} panelId={active.panelId} sections={{ [active.section]: active.rows.map(r => r.field) }} onSaved={saved} trameId={trameId} navigationScope={active.key} /> : null}
      </View>
    </Modal>
  </View>;
}
