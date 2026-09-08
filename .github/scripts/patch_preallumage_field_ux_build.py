from pathlib import Path


def run_patch(path: str) -> None:
    source = Path(path).read_text(encoding='utf-8')
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
