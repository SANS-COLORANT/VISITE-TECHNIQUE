#!/usr/bin/env python3
"""Génère `MetraPictos.data.js` (racine du dépôt) depuis `pictos/<famille>/*.svg`.

Chaque pictogramme est réduit à une liste d'éléments compacts, les couleurs
étant remplacées par un rôle : 'i' (encre), 'a' (accent orange), 'w' (eau,
bleu-vert). Le rendu est fait par `MetraPictos.js` avec react-native-svg.

    python3 docs/refonte-visite-661/outils/generer_pictos_rn.py
"""
import json
import re
import xml.etree.ElementTree as ET
from pathlib import Path

ICI = Path(__file__).resolve().parent
PICTOS = ICI.parent / 'pictos'
SORTIE = ICI.parents[2] / 'MetraPictos.data.js'
ROLES = {'#1A1A18': 'i', '#F26426': 'a', '#0F7C8C': 'w'}
NS = '{http://www.w3.org/2000/svg}'


def role(valeur):
    if not valeur or valeur == 'none':
        return 0
    return ROLES[valeur.upper()]


def num(v):
    f = round(float(v), 3)
    return int(f) if f == int(f) else f


def element(el):
    tag = el.tag.replace(NS, '')
    stroke, fill = role(el.get('stroke')), role(el.get('fill'))
    op = el.get('fill-opacity')
    style = [stroke, fill] + ([num(op)] if op else [])
    if tag == 'path':
        return ['p', el.get('d'), *style]
    if tag == 'circle':
        return ['c', num(el.get('cx')), num(el.get('cy')), num(el.get('r')), *style]
    if tag == 'g':
        m = re.match(r'translate\(([-\d.]+) ([-\d.]+)\) scale\(([-\d.]+)\)', el.get('transform', ''))
        if not m:
            raise ValueError(f'transform inattendu : {el.get("transform")}')
        return ['g', num(m.group(1)), num(m.group(2)), num(m.group(3)), [element(c) for c in el]]
    raise ValueError(f'élément non géré : {tag}')


def main():
    index = json.loads((PICTOS / 'index.json').read_text(encoding='utf-8'))
    donnees = {}
    for entree in index:
        cle = entree['fichier'][:-4]
        racine = ET.parse(PICTOS / entree['fichier']).getroot()
        donnees[cle] = [element(c) for c in racine]
    lignes = [
        '/* Fichier généré par docs/refonte-visite-661/outils/generer_pictos_rn.py — ne pas modifier à la main. */',
        '/* Éléments : [p, d, trait, fond, opacité?] · [c, cx, cy, r, trait, fond, opacité?] · [g, tx, ty, échelle, enfants]. */',
        '/* Rôles de couleur : i = encre, a = accent, w = eau, 0 = aucun. */',
        'export const PICTO_DATA = {',
    ]
    for cle, elements in donnees.items():
        lignes.append(f'  {json.dumps(cle)}: {json.dumps(elements, ensure_ascii=False, separators=(",", ":"))},')
    lignes.append('};')
    SORTIE.write_text('\n'.join(lignes) + '\n', encoding='utf-8')
    print(f'{len(donnees)} pictogrammes -> {SORTIE}')


if __name__ == '__main__':
    main()
