/**
 * Modèles Word à balises : l'utilisateur fournit son propre .docx (charte,
 * page de garde, plan) avec des balises {{…}} ; METRA le remplit avec les
 * données de la Mission. Aide intégrée : balises disponibles, y compris
 * celles des trames rattachées à la Mission.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { FONTS } from './styles.js';
import { MISSION_COLORS, missionStyles } from './missionTheme.js';
import { CvcIcon } from './MetraCvcIcons.js';
import { ButtonGlow } from './ButtonGlow.js';
import { confirmer } from './VisitKit.js';
import { showToast } from './PremiumDialogs.js';
import { hapticSuccess } from './fieldFeedback.js';
import { missionSheetStore } from './missionSheetStore.js';
import { normalizeFormFields } from './missionFormEngine.js';
import { TEMPLATE_TAG_HELP, templateFormKey } from './missionTemplateContext.js';
import { listerModelesWord, listerTramesMission, supprimerModeleWord } from './missionFormsDb.js';
import { genererDepuisModeleWord, importerModeleWord, supprimerFichierModeleWord } from './missionReportTemplateExporter.js';
import { SHEET_TYPE, SheetButton, SheetCard, SheetEmptyLine, SheetErgoProvider, SheetIconButton, SheetRow } from './missionSheetUi.js';

const errorText = (e) => String(e?.message || e || 'Erreur inconnue');

export function MissionReportTemplatesScreen({ route }) {
  const missionId = route?.params?.missionId || null;
  const [templates, setTemplates] = useState([]);
  const [forms, setForms] = useState([]);
  const [busy, setBusy] = useState(null);
  const gloves = useMemo(() => missionSheetStore.getGloves(), []);

  const reload = useCallback(async () => {
    setTemplates(await listerModelesWord());
    if (missionId) setForms(await listerTramesMission(missionId));
  }, [missionId]);
  useEffect(() => { reload().catch(() => {}); }, [reload]);

  const add = async () => {
    setBusy('import');
    try {
      const result = await importerModeleWord();
      if (!result) return;
      hapticSuccess();
      showToast(`${result.tags.length} balise(s) reconnue(s).`, { title: `Modèle « ${result.label} » ajouté`, tone: 'success' });
      await reload();
    } catch (e) {
      Alert.alert('Modèle non ajouté', errorText(e));
    } finally {
      setBusy(null);
    }
  };

  const generate = async (template) => {
    setBusy(template.id);
    try {
      await genererDepuisModeleWord(template.id, missionId);
      hapticSuccess();
    } catch (e) {
      Alert.alert('Document non généré', errorText(e));
    } finally {
      setBusy(null);
    }
  };

  const formKeys = [];
  const formHelp = forms.map((form) => {
    const key = templateFormKey(form, formKeys);
    formKeys.push(key);
    const fields = normalizeFormFields(form.fields_json).filter((f) => f.type !== 'section');
    return { key, label: form.label, fields };
  });

  return (
    <SheetErgoProvider gloves={gloves}>
      <View style={[{ flex: 1 }, missionStyles.screen]}>
        <ScrollView contentContainerStyle={s.content}>
          <Text style={[SHEET_TYPE.meta, { paddingHorizontal: 4 }]}>Écris ton rapport dans Word avec ta mise en page, place des balises comme {'{{mission.nom}}'} ; METRA les remplace. Une ligne de tableau entre {'{{#reserves}}'} et {'{{/reserves}}'} est répétée pour chaque réserve.</Text>
          <TouchableOpacity accessibilityRole="button" disabled={busy === 'import'} onPress={add} style={s.primary}>
            <ButtonGlow tone="mission" radius={17} />
            <CvcIcon name="upload" size={20} color="#FFFFFF" strokeWidth={2.4} />
            <Text style={s.primaryText}>{busy === 'import' ? 'Lecture du modèle…' : 'Importer un modèle Word (.docx)'}</Text>
          </TouchableOpacity>

          <SheetCard title="Mes modèles Word" icon="document" count={templates.length || null}>
            {templates.length ? templates.map((t, index) => {
              let tags = [];
              try { tags = JSON.parse(t.tags_json || '[]'); } catch { tags = []; }
              return (
                <View key={t.id} style={{ gap: 8 }}>
                  <SheetRow
                    icon="document"
                    title={t.label}
                    meta={tags.length ? `${tags.length} balise(s) : ${tags.slice(0, 4).join(', ')}${tags.length > 4 ? '…' : ''}` : t.original_name || ''}
                    right={<SheetIconButton icon="trash" tone="neutral" label={`Supprimer ${t.label}`} onPress={() => confirmer({ title: `Supprimer « ${t.label} » ?`, message: 'Les documents déjà générés ne sont pas touchés.', onConfirm: async () => { await supprimerFichierModeleWord(await supprimerModeleWord(t.id)); await reload(); } })} />}
                    last={!missionId && index === templates.length - 1}
                  />
                  {missionId ? <SheetButton icon="export" label={busy === t.id ? 'Génération…' : 'Générer pour cette Mission'} onPress={() => generate(t)} /> : null}
                </View>
              );
            }) : <SheetEmptyLine icon="document" text="Aucun modèle. Importe un .docx qui contient des balises." />}
          </SheetCard>

          <SheetCard title="Balises disponibles" icon="list">
            {TEMPLATE_TAG_HELP.map((item, index) => (
              <View key={item.tag} style={[s.tag, index === TEMPLATE_TAG_HELP.length - 1 && !formHelp.length && { borderBottomWidth: 0 }]}>
                <Text selectable style={s.code}>{item.tag}</Text>
                <Text style={SHEET_TYPE.meta}>{item.label}</Text>
              </View>
            ))}
            {formHelp.map((form) => (
              <View key={form.key} style={s.tag}>
                <Text style={SHEET_TYPE.bodyStrong}>Trame « {form.label} »</Text>
                <Text selectable style={s.code}>{`{{#${form.key}}}{{cible}} : ${form.fields.slice(0, 3).map((f) => `{{${f.key}}}`).join(' · ')}{{/${form.key}}}`}</Text>
                <Text selectable style={SHEET_TYPE.meta}>Champs : {form.fields.map((f) => `{{${f.key}}}`).join(' ')}</Text>
              </View>
            ))}
          </SheetCard>
        </ScrollView>
      </View>
    </SheetErgoProvider>
  );
}

const s = StyleSheet.create({
  content: { padding: 16, paddingBottom: 132, gap: 12 },
  primary: { minHeight: 54, borderRadius: 17, overflow: 'hidden', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 14 },
  primaryText: { color: '#FFFFFF', fontFamily: FONTS.bold, fontSize: 15.5 },
  tag: { gap: 4, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: MISSION_COLORS.accentLine },
  code: { fontFamily: FONTS.bodySemi, fontSize: 13.5, color: MISSION_COLORS.accentStrong, backgroundColor: MISSION_COLORS.accentSoft, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, alignSelf: 'flex-start' },
});
