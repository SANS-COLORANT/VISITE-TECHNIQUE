from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if new in text:
        return text
    if old not in text:
        raise SystemExit(f'{label}: marker not found')
    return text.replace(old, new, 1)


# ---------------------------------------------------------------------------
# 1. Installations Pré-allumage : ne prépare plus trois fois la même structure.
#    chargerPreAllumageModulaire() appelle déjà preparerStructurePreAllumage().
# ---------------------------------------------------------------------------
p = Path('PreAllumageInstallationPanelBusiness.js')
s = p.read_text(encoding='utf-8')
old = """      await chargerPreAllumageModulaire(props.visiteId);
      await assurerStructureSitePreAllumage(props.visiteId);
      await preparerStructurePreAllumage(props.visiteId);
      await chargerPreAllumageModulaire(props.visiteId);
"""
new = """      await assurerStructureSitePreAllumage(props.visiteId);
      await chargerPreAllumageModulaire(props.visiteId);
"""
s = replace_once(s, old, new, 'deduplicate preallumage installation preparation')
p.write_text(s, encoding='utf-8')


# ---------------------------------------------------------------------------
# 2. Préremplissage : remplace les SELECT champ-par-champ de la visite précédente
#    par une seule lecture SQLite, puis ne copie que les clés stables utiles.
# ---------------------------------------------------------------------------
p = Path('visitPrefillDb.js')
s = p.read_text(encoding='utf-8')
old = """async function copierChampsPersistantsMemeTrame(db, visiteId, precedenteId, trame) {
  if (!precedenteId) return;
  for (const [panelId, sections] of Object.entries(trame.ui?.panels || {})) {
    for (const [section, fields] of Object.entries(sections || {})) {
      for (const field of fields || []) {
        if (field.type !== 'champ' || (!field.stable && !field.carryForward)) continue;
        const code = sectionCode(panelId, section);
        const ancien = await db.getFirstAsync(`SELECT valeur FROM champs_visite WHERE visite_id=? AND section_code=? AND cle=?`, [precedenteId, code, field.cle]);
        if (ancien?.valeur) await insertIfEmpty(db, visiteId, panelId, section, field.cle, ancien.valeur);
      }
    }
  }
}
"""
new = """async function copierChampsPersistantsMemeTrame(db, visiteId, precedenteId, trame) {
  if (!precedenteId) return;
  const clesStables = new Map();
  for (const [panelId, sections] of Object.entries(trame.ui?.panels || {})) {
    for (const [section, fields] of Object.entries(sections || {})) {
      const code = sectionCode(panelId, section);
      for (const field of fields || []) {
        if (field.type !== 'champ' || (!field.stable && !field.carryForward)) continue;
        clesStables.set(`${code}||${field.cle}`, { panelId, section, cle: field.cle });
      }
    }
  }
  if (!clesStables.size) return;
  const anciens = await db.getAllAsync(
    `SELECT section_code,cle,valeur FROM champs_visite
     WHERE visite_id=? AND valeur IS NOT NULL AND trim(valeur)<>''`,
    [precedenteId]
  );
  for (const ancien of anciens || []) {
    const cible = clesStables.get(`${ancien.section_code}||${ancien.cle}`);
    if (!cible) continue;
    await insertIfEmpty(db, visiteId, cible.panelId, cible.section, cible.cle, ancien.valeur);
  }
}
"""
s = replace_once(s, old, new, 'batch previous visit stable fields')
p.write_text(s, encoding='utf-8')


# ---------------------------------------------------------------------------
# 3. Le handler de local accepte un mode test : VisiteScreen peut vérifier qu'un
#    voisin existe avant d'animer, puis ne change le local qu'au bon moment.
# ---------------------------------------------------------------------------
p = Path('PreAllumageInstallationPanelV3.js')
s = p.read_text(encoding='utf-8')
old = """    const handler = (direction) => {
      const currentIndex = locals.findIndex((l) => l.id === activeId);
      if (currentIndex < 0) return false;
      const targetIndex = direction > 0 ? currentIndex + 1 : currentIndex - 1;
      const target = locals[targetIndex];
      if (!target?.id) return false;
      setActiveId(target.id);
      requestAnimationFrame(() => {
        try { listRef.current?.scrollToOffset?.({ offset: 0, animated: false }); } catch {}
      });
      return true;
    };
"""
new = """    const handler = (direction, commit = true) => {
      const currentIndex = locals.findIndex((l) => l.id === activeId);
      if (currentIndex < 0) return false;
      const targetIndex = direction > 0 ? currentIndex + 1 : currentIndex - 1;
      const target = locals[targetIndex];
      if (!target?.id) return false;
      if (!commit) return true;
      setActiveId(target.id);
      requestAnimationFrame(() => {
        try { listRef.current?.scrollToOffset?.({ offset: 0, animated: false }); } catch {}
      });
      return true;
    };
"""
s = replace_once(s, old, new, 'dry-run local swipe handler')
p.write_text(s, encoding='utf-8')


# ---------------------------------------------------------------------------
# 4. Swipe local : la page entière suit le doigt, sort dans le sens du geste,
#    puis le local suivant/précédent entre depuis l'autre bord. Plus de changement
#    instantané du contenu pendant que la page revient au centre.
# ---------------------------------------------------------------------------
p = Path('VisiteScreen.js')
s = p.read_text(encoding='utf-8')
old = """    if (trame.id === 'pre_allumage' && activeTabRef.current === 'p-pa-batiments') {
      const thresholdLocal = Math.max(44, width * 0.065);
      const versSuivantLocal = g.dx < -thresholdLocal || g.vx < -0.42;
      const versPrecedentLocal = g.dx > thresholdLocal || g.vx > 0.42;
      const direction = versSuivantLocal ? 1 : versPrecedentLocal ? -1 : 0;
      if (direction) preAllumageLocalSwipeRef.current?.(direction);
      Animated.spring(translateX, { toValue: 0, speed: 25, bounciness: 0, useNativeDriver: true }).start();
      return;
    }
"""
new = """    if (trame.id === 'pre_allumage' && activeTabRef.current === 'p-pa-batiments') {
      const thresholdLocal = Math.max(44, width * 0.065);
      const versSuivantLocal = g.dx < -thresholdLocal || g.vx < -0.42;
      const versPrecedentLocal = g.dx > thresholdLocal || g.vx > 0.42;
      const direction = versSuivantLocal ? 1 : versPrecedentLocal ? -1 : 0;
      const peutChanger = direction ? preAllumageLocalSwipeRef.current?.(direction, false) : false;
      if (!peutChanger) {
        Animated.spring(translateX, { toValue: 0, speed: 25, bounciness: 0, useNativeDriver: true }).start();
        return;
      }
      transitionRef.current = true;
      const sortieX = direction > 0 ? -width : width;
      Animated.timing(translateX, {
        toValue: sortieX,
        duration: 115,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start(() => {
        const change = preAllumageLocalSwipeRef.current?.(direction, true);
        if (!change) {
          transitionRef.current = false;
          translateX.setValue(0);
          return;
        }
        translateX.setValue(direction > 0 ? width : -width);
        requestAnimationFrame(() => {
          Animated.timing(translateX, {
            toValue: 0,
            duration: 175,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }).start(() => { transitionRef.current = false; });
        });
      });
      return;
    }
"""
s = replace_once(s, old, new, 'full page local swipe transition')
old = """      if (trame.id === 'pre_allumage' && activeTabRef.current === 'p-pa-batiments') {
        translateX.setValue(g.dx * 0.22);
        return;
      }
"""
new = """      if (trame.id === 'pre_allumage' && activeTabRef.current === 'p-pa-batiments') {
        const direction = g.dx < 0 ? 1 : -1;
        const peutChanger = preAllumageLocalSwipeRef.current?.(direction, false);
        translateX.setValue(peutChanger ? g.dx : g.dx * 0.20);
        return;
      }
"""
s = replace_once(s, old, new, 'interactive full page local drag')


# ---------------------------------------------------------------------------
# 5. Ouverture d'une visite : le bandeau/écran apparaît dès que le contexte et
#    le préremplissage sont prêts. Le recalcul de progression et les préchargements
#    continuent ensuite sans bloquer l'écran complet.
# ---------------------------------------------------------------------------
old = """  const charger = useCallback(async () => {
    const db = await getDb();
    await preremplirVisiteDepuisContexte(db, visiteId);
    const v = await getVisite(visiteId);
    const estVmc = (v?.trame_id || DEFAULT_TRAME_ID) === 'vmc';
    const caissons = estVmc ? await chargerCaissonsVmc(visiteId) : [];
    const progression = await recalculerProgressionVisite(db, visiteId);
    invaliderCacheTrameGenerique(visiteId);
    invaliderCacheRegulation(visiteId);
    await Promise.all([
      prechargerDonneesTrameGenerique(visiteId, true),
      prechargerRegulation(visiteId, true),
    ]);
    setVmcCaissons(caissons);
    setVisite(v ? { ...v, progression_pct: progression } : v);
  }, [visiteId]);
"""
new = """  const charger = useCallback(async () => {
    const db = await getDb();
    await preremplirVisiteDepuisContexte(db, visiteId);
    const v = await getVisite(visiteId);
    const estVmc = (v?.trame_id || DEFAULT_TRAME_ID) === 'vmc';
    const caissons = estVmc ? await chargerCaissonsVmc(visiteId) : [];
    invaliderCacheTrameGenerique(visiteId);
    invaliderCacheRegulation(visiteId);
    const warmupPromise = Promise.all([
      prechargerDonneesTrameGenerique(visiteId, true),
      prechargerRegulation(visiteId, true),
    ]).catch((e) => console.warn('Préchargement visite incomplet', e));
    setVmcCaissons(caissons);
    setVisite(v);
    if (v) {
      try {
        const progression = await recalculerProgressionVisite(db, visiteId);
        setVisite((courante) => courante ? { ...courante, progression_pct: progression } : courante);
      } catch (e) {
        console.warn('Progression initiale non recalculée', e);
      }
    }
    await warmupPromise;
  }, [visiteId]);
"""
s = replace_once(s, old, new, 'non-blocking visit warmup')
p.write_text(s, encoding='utf-8')

print('Pré-allumage page swipe and loading performance applied.')
