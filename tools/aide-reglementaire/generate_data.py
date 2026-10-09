#!/usr/bin/env python3
"""Génère aideReglementaireData.js depuis METRA_catalogue_aides.json (dossier des aides du 9 octobre 2026).

Usage : python3 tools/aide-reglementaire/generate_data.py METRA_catalogue_aides.json aideReglementaireData.js
Le JSON n'est pas versionné : le fichier généré est la source embarquée dans l'application (hors connexion).
"""
import json
import re
import sys


def section_code(panel, section):
    return panel.replace('p-', '', 1) + '.' + re.sub(r'[^a-z0-9]+', '_', str(section).lower())


def main(src, dst):
    d = json.load(open(src, encoding='utf8'))
    themes = {}
    for t in d['themes']:
        themes[t['id']] = {
            'id': t['id'], 'title': t['title'], 'nature': t['nature'], 'scope': t['scope'], 'popup': t['popup'],
            'detail': t['detail'], 'checks': t['checks'], 'evidence': t['evidence'], 'sources': t['source_ids'],
            'pending': t['pending'], 'review': t['review_state'],
        }
    actions, action_index = [], {}
    onglets, lignes = {}, {}
    for b in d['bindings']:
        tr = b['trame']
        panels = onglets.setdefault(tr, {})
        ids = panels.setdefault(b['panel'], [])
        if b['theme_id'] not in ids:
            ids.append(b['theme_id'])
        a = (b.get('action') or '').strip()
        if a not in action_index:
            action_index[a] = len(actions)
            actions.append(a)
        key = section_code(b['panel'], b['section']) + '||' + str(b['cle']).strip()
        lignes.setdefault(tr, {})[key] = [b['theme_id'], action_index[a]]
    out = '/* Généré par tools/aide-reglementaire/generate_data.py : ne pas modifier à la main.\n'
    out += ' * Source : dossier des aides réglementaires et techniques METRA du %s (%s).\n' % (d.get('date'), d.get('commit', '')[:7])
    out += ' * Aide de lecture : aucune règle ne vaut décision de conformité ; plusieurs fiches restent « à compléter ». */\n'
    out += 'export const AIDE_VERSION = %s;\n' % json.dumps(d.get('date'))
    out += 'export const AIDE_THEMES = %s;\n' % json.dumps(themes, ensure_ascii=False, separators=(',', ':'))
    out += 'export const AIDE_SOURCES = %s;\n' % json.dumps(d['sources'], ensure_ascii=False, separators=(',', ':'))
    out += 'export const AIDE_ONGLETS = %s;\n' % json.dumps(onglets, ensure_ascii=False, separators=(',', ':'))
    out += 'export const AIDE_ACTIONS = %s;\n' % json.dumps(actions, ensure_ascii=False, separators=(',', ':'))
    out += 'export const AIDE_LIGNES = %s;\n' % json.dumps(lignes, ensure_ascii=False, separators=(',', ':'))
    open(dst, 'w', encoding='utf8').write(out)
    print('themes', len(themes), 'lignes', sum(len(v) for v in lignes.values()), 'actions', len(actions), 'octets', len(out.encode('utf8')))


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
