from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if new in text:
        return text
    if old not in text:
        raise SystemExit(f'{label}: marker not found')
    return text.replace(old, new, 1)


# ---------------------------------------------------------------------------
# 1. SiteVisites : getDb est réellement utilisé pour savoir si le client local
#    provient de l'Intranet. Un ancien patch de build supprimait cet import et
#    provoquait « Property getDb doesn't exist » sur la tablette.
# ---------------------------------------------------------------------------
p = Path('SiteVisitesScreen.js')
s = p.read_text(encoding='utf-8')
has_site_getdb_import = (
    "import { listerVisitesSite, getDb } from './db.js';" in s
    or "import { listerVisitesSite, listerVisitesLocal, getDb } from './db.js';" in s
)
if "const database = await getDb();" in s and not has_site_getdb_import:
    s = replace_once(
        s,
        "import { listerVisitesSite } from './db.js';",
        "import { listerVisitesSite, getDb } from './db.js';",
        'restore SiteVisites getDb import',
    )
p.write_text(s, encoding='utf-8')


# ---------------------------------------------------------------------------
# 2. Envoi Intranet : l'absence d'un compteur n'est pas une incohérence.
#    Le contrat accepte « / » comme valeur vide. Seul le cas de plusieurs
#    compteurs correspondant au même critère reste bloquant car il est ambigu.
# ---------------------------------------------------------------------------
p = Path('intranetVisitPayload.js')
s = p.read_text(encoding='utf-8')
old_counter = """function counterValue(counters, criterion, candidate) {
  const keys = new Set([cleanCounterLabel(criterion?.nom), cleanCounterLabel(candidate?.label), cleanCounterLabel(candidate?.cle)].filter(Boolean));
  const exact = counters.filter((counter) => keys.has(cleanCounterLabel(counter.label)));
  if (exact.length === 1) return exact[0].valeur;
  return undefined;
}
"""
new_counter = """function counterValue(counters, criterion, candidate) {
  const keys = new Set([cleanCounterLabel(criterion?.nom), cleanCounterLabel(candidate?.label), cleanCounterLabel(candidate?.cle)].filter(Boolean));
  const exact = counters.filter((counter) => keys.has(cleanCounterLabel(counter.label)));
  if (exact.length === 1) return { value: exact[0].valeur, ambiguous: false };
  // Aucun compteur renseigné est un cas métier valide : exactComment(undefined)
  // l'enverra sous forme de « / ». Plusieurs correspondances restent bloquantes.
  return { value: undefined, ambiguous: exact.length > 1 };
}
"""
s = replace_once(s, old_counter, new_counter, 'allow missing counter value')
old_counter_call = """            value = counterValue(counters, criterion, candidate);
            if (value === undefined) issues.push(`${path} : compteur correspondant introuvable ou ambigu.`);
"""
new_counter_call = """            const counter = counterValue(counters, criterion, candidate);
            value = counter.value;
            if (counter.ambiguous) issues.push(`${path} : plusieurs compteurs locaux correspondent à ce critère.`);
"""
s = replace_once(s, old_counter_call, new_counter_call, 'block only ambiguous counters')
p.write_text(s, encoding='utf-8')


# ---------------------------------------------------------------------------
# 3. Nouvelle visite d'un client déjà importé : si la dernière visite Intranet
#    a déjà été matérialisée APRES le dernier rafraîchissement du cache LOCAL,
#    ne pas refaire tout le mapping critères/réseaux/remarques à chaque création.
# ---------------------------------------------------------------------------
p = Path('apiLatestVisitImportDb.js')
s = p.read_text(encoding='utf-8')
old_import = """  const ref = await getCachedLocalReference(remoteIdLocal);
  if (!ref) return { imported: false, reason: 'no_cached_reference' };
  const db = await getDb();
  let result = { imported: false, reason: 'not_processed' };
"""
new_import = """  const ref = await getCachedLocalReference(remoteIdLocal);
  if (!ref) return { imported: false, reason: 'no_cached_reference' };
  const db = await getDb();

  const cachedRemoteVisitId = remoteId(ref?.derniereVisite?.id);
  if (cachedRemoteVisitId) {
    const existing = await findImportedVisit(db, cachedRemoteVisitId);
    if (existing?.id) {
      const [cacheState, importedState] = await Promise.all([
        db.getFirstAsync(`SELECT synced_at FROM api_local_links WHERE remote_local_id=? LIMIT 1`, [remoteIdLocal]),
        db.getFirstAsync(`SELECT importe_le FROM provenances
          WHERE entite_type='visite' AND entite_id=? AND origine='api_symfony' AND reference_externe=?
          ORDER BY importe_le DESC LIMIT 1`, [existing.id, cachedRemoteVisitId]),
      ]);
      const cacheStamp = String(cacheState?.synced_at || '');
      const importedStamp = String(importedState?.importe_le || '');
      if (importedStamp && (!cacheStamp || importedStamp >= cacheStamp)) {
        return {
          imported: true,
          visiteId: existing.id,
          remoteVisitId: cachedRemoteVisitId,
          created: false,
          reused: true,
          reason: 'cached_latest_visit_already_materialized',
        };
      }
    }
  }

  let result = { imported: false, reason: 'not_processed' };
"""
s = replace_once(s, old_import, new_import, 'reuse unchanged imported latest visit')
p.write_text(s, encoding='utf-8')


# ---------------------------------------------------------------------------
# 4. Pré-allumage : toutes les valeurs de tous les locaux sont déjà chargées en
#    une fois. On prépare également les structures de page de TOUS les locaux
#    dès le chargement, afin que gauche/droite ne reconstruise pas la page au
#    moment exact du swipe.
# ---------------------------------------------------------------------------
p = Path('PreAllumageInstallationPanelV3.js')
s = p.read_text(encoding='utf-8')
old_reload = """  const reload = useCallback(async (select = null) => {
    await chargerPreAllumageModulaire(visiteId); await normaliserLocauxPreAllumage(visiteId);
    const [m, c, ct] = await Promise.all([chargerPreAllumageModulaire(visiteId), getChampsVisite(visiteId), getControlesVisite(visiteId)]);
    setModel(m); setChamps(mapChamps(c)); setControls(mapControles(ct)); if (select) setActiveId(select);
  }, [visiteId]);
"""
new_reload = """  const reload = useCallback(async (select = null) => {
    await normaliserLocauxPreAllumage(visiteId);
    const [m, c, ct] = await Promise.all([
      chargerPreAllumageModulaire(visiteId),
      getChampsVisite(visiteId),
      getControlesVisite(visiteId),
    ]);
    setModel(m); setChamps(mapChamps(c)); setControls(mapControles(ct)); if (select) setActiveId(select);
  }, [visiteId]);
"""
s = replace_once(s, old_reload, new_reload, 'deduplicate V3 local model load')

old_derived = """  const rubriquesFor = useCallback((local) => {
    if (!local) return [];
    return (model?.rubriques || []).filter((r) => r.local_id === local.id).map((r) => filtrerConfig(r, local)).filter((r) => r && (r.champs || []).length).sort((a, b) => (PANEL_ORDER[a.panel_id] ?? 99) - (PANEL_ORDER[b.panel_id] ?? 99) || Number(a.ordre || 0) - Number(b.ordre || 0));
  }, [model]);
  const rubriques = useMemo(() => rubriquesFor(active), [rubriquesFor, active]);
  const stats = useMemo(() => statsRubriques(rubriques, champs, controls), [rubriques, champs, controls]);
  const sections = useMemo(() => rubriques.map((r) => {
    const raw = (r.champs || []).map((c) => ({ key: `${r.section_code}||${c.field.cle}`, field: { ...c.field, displayLabel: c.libelle, modularFieldId: c.id } }));
    const data = r.panel_id === 'p-pa-regulation' ? groupRegulationItems(raw) : groupItems(raw, twoCols);
    return { ...r, title: titreRubrique(r), raw, data: collapsed[r.id] ? [] : data, collapsed: Boolean(collapsed[r.id]) };
  }), [rubriques, collapsed, twoCols]);
"""
new_derived = """  const rubriquesParLocal = useMemo(() => {
    const map = new Map();
    for (const local of locals) {
      const rubriquesLocal = (model?.rubriques || [])
        .filter((r) => r.local_id === local.id)
        .map((r) => filtrerConfig(r, local))
        .filter((r) => r && (r.champs || []).length)
        .sort((a, b) => (PANEL_ORDER[a.panel_id] ?? 99) - (PANEL_ORDER[b.panel_id] ?? 99) || Number(a.ordre || 0) - Number(b.ordre || 0));
      map.set(local.id, rubriquesLocal);
    }
    return map;
  }, [model, locals]);
  const rubriquesFor = useCallback((local) => local ? (rubriquesParLocal.get(local.id) || []) : [], [rubriquesParLocal]);
  const sectionsParLocal = useMemo(() => {
    const map = new Map();
    for (const local of locals) {
      const prepared = (rubriquesParLocal.get(local.id) || []).map((r) => {
        const raw = (r.champs || []).map((c) => ({ key: `${r.section_code}||${c.field.cle}`, field: { ...c.field, displayLabel: c.libelle, modularFieldId: c.id } }));
        const data = r.panel_id === 'p-pa-regulation' ? groupRegulationItems(raw) : groupItems(raw, twoCols);
        return { ...r, title: titreRubrique(r), raw, data: collapsed[r.id] ? [] : data, collapsed: Boolean(collapsed[r.id]) };
      });
      map.set(local.id, prepared);
    }
    return map;
  }, [locals, rubriquesParLocal, collapsed, twoCols]);
  const rubriques = useMemo(() => rubriquesFor(active), [rubriquesFor, active]);
  const sections = useMemo(() => active ? (sectionsParLocal.get(active.id) || []) : [], [sectionsParLocal, active]);
  const stats = useMemo(() => statsRubriques(rubriques, champs, controls), [rubriques, champs, controls]);
"""
s = replace_once(s, old_derived, new_derived, 'precompute all preallumage local pages')

# Le haut de la page suivante/précédente doit être immédiatement rempli après
# la transition, sans attendre plusieurs batches de 50 ms.
s = s.replace(
    'initialNumToRender={12} maxToRenderPerBatch={12} windowSize={7}',
    'initialNumToRender={20} maxToRenderPerBatch={20} windowSize={9} updateCellsBatchingPeriod={16}',
    1,
)
p.write_text(s, encoding='utf-8')

# Le conteneur métier ne doit pas rebâtir une structure déjà préparée pendant
# creerVisiteProduction. Pour une ancienne visite non préparée, il conserve le
# bootstrap complet en fallback.
p = Path('PreAllumageInstallationPanelBusiness.js')
s = p.read_text(encoding='utf-8')
old_business_source = """      await chargerPreAllumageModulaire(props.visiteId);
      await assurerStructureSitePreAllumage(props.visiteId);
      await preparerStructurePreAllumage(props.visiteId);
      await chargerPreAllumageModulaire(props.visiteId);
"""
old_business_build = """      await assurerStructureSitePreAllumage(props.visiteId);
      await chargerPreAllumageModulaire(props.visiteId);
"""
new_business = """      const initialModel = await chargerPreAllumageModulaire(props.visiteId);
      if (!(initialModel?.locaux || []).length) {
        await assurerStructureSitePreAllumage(props.visiteId);
        await chargerPreAllumageModulaire(props.visiteId);
      }
"""
if new_business not in s:
    if old_business_source in s:
        s = s.replace(old_business_source, new_business, 1)
    elif old_business_build in s:
        s = s.replace(old_business_build, new_business, 1)
    else:
        raise SystemExit('warm preallumage business bootstrap marker not found')
p.write_text(s, encoding='utf-8')


# ---------------------------------------------------------------------------
# 5. Garde-fous explicites : le build doit échouer si une régression réapparaît.
# ---------------------------------------------------------------------------
site = Path('SiteVisitesScreen.js').read_text(encoding='utf-8')
payload = Path('intranetVisitPayload.js').read_text(encoding='utf-8')
creation = Path('visitCreationDb.js').read_text(encoding='utf-8')
v3 = Path('PreAllumageInstallationPanelV3.js').read_text(encoding='utf-8')
business = Path('PreAllumageInstallationPanelBusiness.js').read_text(encoding='utf-8')

has_site_getdb_import = (
    "import { listerVisitesSite, getDb } from './db.js';" in site
    or "import { listerVisitesSite, listerVisitesLocal, getDb } from './db.js';" in site
)
if "const database = await getDb();" in site and not has_site_getdb_import:
    raise SystemExit('SiteVisites getDb runtime regression still present')
if "compteur correspondant introuvable ou ambigu" in payload:
    raise SystemExit('Missing counter still blocks Intranet upload')
if 'counter.ambiguous' not in payload:
    raise SystemExit('Ambiguous counter protection missing')
if 'await preremplirVisiteDepuisContexte(db, id);' not in creation:
    raise SystemExit('New visit no longer prepares stable data before navigation')
if "trame.id === 'pre_allumage'" not in creation or 'await assurerStructureSitePreAllumage(id);' not in creation:
    raise SystemExit('Pre-allumage locals are no longer prepared during visit creation')
if 'const sectionsParLocal = useMemo(() =>' not in v3:
    raise SystemExit('Pre-allumage adjacent local page cache missing')
if 'const initialModel = await chargerPreAllumageModulaire(props.visiteId);' not in business:
    raise SystemExit('Pre-allumage warm bootstrap optimization missing')
if 'cached_latest_visit_already_materialized' not in Path('apiLatestVisitImportDb.js').read_text(encoding='utf-8'):
    raise SystemExit('Imported latest-visit fast path missing')

print('Runtime regressions fixed: getDb, missing counters, cached imported visit and pre-allumage adjacent-local warmup.')
