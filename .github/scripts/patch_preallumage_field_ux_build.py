from pathlib import Path


# Les anciens patches Pré-allumage contiennent encore quelques remplacements
# strictement liés à l'ancien swipe global de VisiteScreen. Le pager v4 porte
# désormais ces comportements directement dans le runtime. Pour conserver la
# vérification stricte de tous les autres patches, on n'assouplit en mémoire que
# ces marqueurs obsolètes, et uniquement lorsque le nouveau pager est présent.
MODERN_VISIT_PAGER = 'const pagerX = useRef(new Animated.Value(0)).current' in Path('VisiteScreen.js').read_text(encoding='utf-8')
MODERN_PAGER_SKIP_LABELS = {
    '.github/scripts/patch_preallumage_field_ux_base.py': {
        'disable global swipe on preallumage installations',
    },
    '.github/scripts/patch_preallumage_navigation_popup_fix.py': {
        'reactivate robust global responder for local swipe',
        'route swipe to preallumage local',
        'terminerSwipe dependency',
        'local swipe drag feedback',
        'visit local swipe registration callback',
        'pass local swipe registration',
    },
    '.github/scripts/patch_preallumage_swipe_performance.py': {
        'full page local swipe transition',
        'interactive full page local drag',
    },
}


def run_patch(path: str) -> None:
    source = Path(path).read_text(encoding='utf-8')
    skip_labels = MODERN_PAGER_SKIP_LABELS.get(path) if MODERN_VISIT_PAGER else None
    if skip_labels:
        old = """    if old not in text:\n        raise SystemExit(f'{label}: marker not found')\n"""
        labels_literal = repr(skip_labels)
        new = f"""    if old not in text:\n        if label in {labels_literal}:\n            return text\n        raise SystemExit(f'{{label}}: marker not found')\n"""
        if old not in source:
            raise SystemExit(f'{path}: replace_once compatibility marker not found')
        source = source.replace(old, new, 1)
    exec(compile(source, path, 'exec'), {'__name__': '__main__', '__file__': path})


# Conserve les passes Pré-allumage déjà validées, puis applique la transition
# pleine page, les optimisations de chargement et enfin les garde-fous communs
# de création/export sur le code réellement livré à la tablette.
run_patch('.github/scripts/patch_preallumage_field_ux_base.py')
run_patch('.github/scripts/patch_preallumage_navigation_popup_fix.py')
run_patch('.github/scripts/patch_preallumage_layout_container_fix.py')
run_patch('.github/scripts/patch_preallumage_swipe_performance.py')
# Version API-aware : préserve l'association Symfony LOCAL -> installation
# METRA et les visites préparées tout en conservant les exports typés existants.
run_patch('.github/scripts/patch_visit_creation_export_type_v2.py')
# Doit rester après les patches qui réécrivent le loader de VisiteScreen.
run_patch('.github/scripts/patch_visit_open_fail_safe.py')
