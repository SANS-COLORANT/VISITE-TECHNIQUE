/**
 * Recherche dans la visite : retrouve un champ ou un contrôle par son nom
 * (ex. « calorifuge ») parmi tous les onglets, et ouvre l'onglet concerné.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Modal, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { CvcIcon } from './MetraCvcIcons.js';
import { COLORS, FONTS } from './styles.js';

const norm = (v) => String(v || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function VisitSearchSheet({ visible, onClose, panels = {}, tabs = [], labels = {}, onOpen }) {
  const [q, setQ] = useState('');
  useEffect(() => { if (visible) setQ(''); }, [visible]);

  const index = useMemo(() => {
    const out = [];
    for (const pid of tabs) {
      for (const [section, fields] of Object.entries(panels[pid] || {})) {
        for (const field of fields || []) {
          if (!field?.cle || field.hiddenInApp === true) continue;
          out.push({ key: `${pid}|${section}|${field.cle}`, pid, label: field.cle, section, tab: labels[pid] || pid, controle: field.type !== 'champ', n: norm(`${field.cle} ${section}`) });
        }
      }
      if (!panels[pid]) out.push({ key: `${pid}|onglet`, pid, label: labels[pid] || pid, section: 'Onglet', tab: labels[pid] || pid, controle: false, n: norm(labels[pid] || pid) });
    }
    return out;
  }, [panels, tabs, labels]);

  const nq = norm(q.trim());
  const results = nq.length < 2 ? [] : index.filter((r) => nq.split(/\s+/).every((w) => r.n.includes(w))).slice(0, 60);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <TouchableOpacity activeOpacity={1} style={s.dim} onPress={onClose} />
        <View style={s.sheet}>
          <View style={s.grab} />
          <View style={s.search}>
            <CvcIcon name="search" size={18} color={COLORS.inkFaint} strokeWidth={2.1} />
            <TextInput value={q} onChangeText={setQ} autoFocus placeholder="Chercher un champ ou un contrôle…" placeholderTextColor={COLORS.inkFaint} style={s.input} autoCorrect={false} />
          </View>
          <FlatList
            data={results}
            keyExtractor={(r) => r.key}
            keyboardShouldPersistTaps="handled"
            style={{ maxHeight: 380 }}
            ListEmptyComponent={<Text style={s.empty}>{nq.length < 2 ? 'Tape au moins deux lettres.' : 'Aucun résultat dans cette visite.'}</Text>}
            renderItem={({ item }) => (
              <TouchableOpacity activeOpacity={0.85} onPress={() => { onClose?.(); onOpen?.(item.pid); }} style={s.row}>
                <View style={[s.dot, { backgroundColor: item.controle ? COLORS.orange : '#9B927C' }]} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text numberOfLines={1} style={s.title}>{item.label}</Text>
                  <Text numberOfLines={1} style={s.sub}>{item.tab} · {item.section}</Text>
                </View>
                <CvcIcon name="chevron-right" size={16} color={COLORS.orangeDark} strokeWidth={2.2} />
              </TouchableOpacity>
            )}
          />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const s = StyleSheet.create({
  dim: { flex: 1, backgroundColor: 'rgba(22,21,15,0.32)' },
  sheet: { backgroundColor: '#FBFAF7', borderTopLeftRadius: 26, borderTopRightRadius: 26, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 20 },
  grab: { alignSelf: 'center', width: 42, height: 5, borderRadius: 3, backgroundColor: '#D6D1C6', marginBottom: 12 },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 50, paddingHorizontal: 14, borderRadius: 16, backgroundColor: COLORS.white, borderWidth: 1, borderColor: 'rgba(22,21,15,0.1)', marginBottom: 10 },
  input: { flex: 1, fontSize: 15, fontFamily: FONTS.bodyMedium, color: COLORS.ink, paddingVertical: 10 },
  empty: { textAlign: 'center', paddingVertical: 20, fontSize: 12.5, fontFamily: FONTS.bodyMedium, color: COLORS.inkSoft },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11, paddingHorizontal: 6, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(22,21,15,0.1)' },
  dot: { width: 8, height: 8, borderRadius: 4 },
  title: { fontSize: 14, fontFamily: FONTS.bodySemi, color: COLORS.ink },
  sub: { fontSize: 11.5, fontFamily: FONTS.bodyMedium, color: COLORS.inkSoft, marginTop: 1 },
});
