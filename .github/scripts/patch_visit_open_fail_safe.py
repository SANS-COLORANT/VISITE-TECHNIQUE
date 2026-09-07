from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if new in text:
        return text
    if old not in text:
        raise SystemExit(f'{label}: marker not found')
    return text.replace(old, new, 1)


p = Path('VisiteScreen.js')
s = p.read_text(encoding='utf-8')

# Marqueur explicite pour rendre cette passe idempotente dans les workflows.
if 'VISIT_OPEN_FAIL_SAFE_V1' in s:
    print('Visit open fail-safe already applied.')
    raise SystemExit(0)

# 1. Une erreur d'ouverture ne doit jamais rester représentée par un spinner éternel.
state_old = "  const [visite, setVisite] = useState(null);\n"
state_new = """  const [visite, setVisite] = useState(null);
  const [chargementErreur, setChargementErreur] = useState(null); // VISIT_OPEN_FAIL_SAFE_V1
"""
s = replace_once(s, state_old, state_new, 'visit load error state')

# 2. À ce stade du build, patch_preallumage_swipe_performance.py a déjà rendu
#    progression/préchargements non bloquants, mais le préremplissage reste encore
#    AVANT setVisite(). Un rejet ou un blocage de cette étape laisse donc l'écran
#    sur ActivityIndicator. On charge d'abord l'enregistrement minimal et on rend
#    l'écran immédiatement. Toutes les préparations secondaires sont isolées.
loader_old = """  const charger = useCallback(async () => {
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

  useEffect(() => { charger(); }, [charger]);
"""
loader_new = """  const charger = useCallback(async () => {
    setChargementErreur(null);
    setVisite(null);

    let v = null;
    try {
      // getVisite() est la lecture minimale nécessaire pour afficher l'écran.
      // Rien d'autre ne doit empêcher l'utilisateur d'entrer dans sa visite.
      v = await getVisite(visiteId);
      if (!v) throw new Error('Visite introuvable dans la base locale.');
      setVisite(v);
    } catch (e) {
      console.warn('Ouverture visite impossible', e);
      setChargementErreur(String(e?.message || e || 'Erreur inconnue'));
      return;
    }

    // Préremplissage, VMC, progression et caches sont utiles mais secondaires.
    // Chaque bloc est protégé : aucun d'eux ne peut remettre l'écran dans un
    // chargement infini après que la visite a été trouvée.
    void (async () => {
      try {
        const db = await getDb();

        try {
          await preremplirVisiteDepuisContexte(db, visiteId);
        } catch (e) {
          console.warn('Préremplissage visite incomplet', e);
        }

        const estVmc = (v?.trame_id || DEFAULT_TRAME_ID) === 'vmc';
        if (estVmc) {
          try {
            const caissons = await chargerCaissonsVmc(visiteId);
            setVmcCaissons(caissons || []);
          } catch (e) {
            console.warn('Caissons VMC non chargés', e);
          }
        } else {
          setVmcCaissons([]);
        }

        invaliderCacheTrameGenerique(visiteId);
        invaliderCacheRegulation(visiteId);

        void Promise.all([
          prechargerDonneesTrameGenerique(visiteId, true),
          prechargerRegulation(visiteId, true),
        ]).catch((e) => console.warn('Préchargement visite incomplet', e));

        try {
          const progression = await recalculerProgressionVisite(db, visiteId);
          setVisite((courante) => courante ? { ...courante, progression_pct: progression } : courante);
        } catch (e) {
          console.warn('Progression initiale non recalculée', e);
        }
      } catch (e) {
        console.warn('Initialisation secondaire de la visite incomplète', e);
      }
    })();
  }, [visiteId]);

  useEffect(() => {
    charger().catch((e) => {
      console.warn('Chargement visite interrompu', e);
      setChargementErreur(String(e?.message || e || 'Erreur inconnue'));
    });
  }, [charger]);
"""
s = replace_once(s, loader_old, loader_new, 'fail-safe visit loader')

# 3. Même en cas de visite incohérente/import partiel, l'utilisateur récupère la
#    main et peut revenir ou retenter au lieu de devoir forcer l'arrêt de METRA.
spinner_old = "  if (!visite) return <View style={styles.center}><ActivityIndicator size=\"large\" color={COLORS.orange} /></View>;\n"
spinner_new = """  if (!visite && chargementErreur) return <View style={[styles.center, { paddingHorizontal: 24 }]}>
    <Text style={{ color: COLORS.ink, fontSize: 17, fontWeight: '900', textAlign: 'center' }}>Impossible d’ouvrir la visite</Text>
    <Text style={{ color: COLORS.inkSoft, fontSize: 12, marginTop: 8, textAlign: 'center' }}>{chargementErreur}</Text>
    <View style={{ flexDirection: 'row', gap: 10, marginTop: 18 }}>
      <TouchableOpacity style={styles.btnSecondary} onPress={retourSecurise}><Text style={styles.btnSecondaryText}>Retour</Text></TouchableOpacity>
      <TouchableOpacity style={styles.btnPrimary} onPress={charger}><Text style={styles.btnPrimaryText}>Réessayer</Text></TouchableOpacity>
    </View>
  </View>;
  if (!visite) return <View style={styles.center}><ActivityIndicator size="large" color={COLORS.orange} /></View>;
"""
s = replace_once(s, spinner_old, spinner_new, 'visit load error UI')

p.write_text(s, encoding='utf-8')
print('Visit open fail-safe applied.')
