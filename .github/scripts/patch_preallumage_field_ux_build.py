from pathlib import Path


def run_patch(path: str) -> None:
    source = Path(path).read_text(encoding='utf-8')
    exec(compile(source, path, 'exec'), {'__name__': '__main__', '__file__': path})


# Conserve la passe terrain validée par la PR #42, puis applique la correction
# tactile/sticky/pop-up. Le workflow continue donc d'appeler un seul point
# d'entrée et livre les couches dans le bon ordre.
run_patch('.github/scripts/patch_preallumage_field_ux_base.py')
run_patch('.github/scripts/patch_preallumage_navigation_popup_fix.py')
run_patch('.github/scripts/patch_preallumage_layout_container_fix.py')
