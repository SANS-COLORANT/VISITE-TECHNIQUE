from pathlib import Path


def run_patch(path: str) -> None:
    source = Path(path).read_text(encoding='utf-8')
    exec(compile(source, path, 'exec'), {'__name__': '__main__', '__file__': path})


# Conserve les passes Pré-allumage déjà validées, puis applique la transition
# pleine page et les optimisations de chargement sur le code réellement livré.
run_patch('.github/scripts/patch_preallumage_field_ux_base.py')
run_patch('.github/scripts/patch_preallumage_navigation_popup_fix.py')
run_patch('.github/scripts/patch_preallumage_layout_container_fix.py')
run_patch('.github/scripts/patch_preallumage_swipe_performance.py')
