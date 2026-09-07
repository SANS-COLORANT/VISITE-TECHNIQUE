from pathlib import Path

p = Path('PreAllumageInstallationPanelV3.js')
s = p.read_text(encoding='utf-8')
old = '<SectionList ref={listRef}'
new = '<SectionList style={{ flex: 1 }} ref={listRef}'
if new not in s:
    if old not in s:
        raise SystemExit('SectionList Pré-allumage introuvable pour le layout fixe')
    s = s.replace(old, new, 1)
p.write_text(s, encoding='utf-8')
print('Pré-allumage fixed local layout constrained.')
