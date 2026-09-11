from pathlib import Path


# Historical builds used to rewrite VisiteScreen here. The current pager/loader
# is now committed directly, so this pass only verifies the latency and safety
# invariants instead of replacing a fragile exact source block at build time.
s = Path('VisiteScreen.js').read_text(encoding='utf-8')


def require(marker, message):
    if marker not in s:
        raise SystemExit(message)


require('const charger = useCallback(async () => {', 'visit loader missing')
require('await preremplirVisiteDepuisContexte(db, visiteId);', 'visit prefill missing')
require('const v = await getVisite(visiteId);', 'minimal visit read missing')
require('if (!v) { setVisite(null); return; }', 'missing-visit guard missing')
require('setVisite(v);', 'visit is not painted from the local row')
require('void Promise.all([', 'visit cache warmup is no longer deferred')
require('const [caissons, progression] = await Promise.all([', 'VMC/progression work is no longer parallel')
require("useEffect(() => { charger(); }, [charger]);", 'visit loader effect missing')

# Once the visit row is available, expensive cache/progression work must not
# precede the first paint. New visits are prefilled before navigation by
# SiteVisitesScreen, so this still guarantees that their values never pop in.
paint = s.index('setVisite(v);')
warm = s.index('void Promise.all([', paint)
progress = s.index('const [caissons, progression] = await Promise.all([', paint)
if paint > warm or paint > progress:
    raise SystemExit('visit first paint is blocked by secondary work')

print('Modern visit loader validated: local row paints before cache/progression work and no legacy rewrite is required.')
