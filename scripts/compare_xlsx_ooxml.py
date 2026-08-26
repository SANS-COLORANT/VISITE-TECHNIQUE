#!/usr/bin/env python3
"""Compare deux .xlsx au niveau OOXML avec une liste blanche de cellules modifiées.

Usage:
  python3 scripts/compare_xlsx_ooxml.py original.xlsx export.xlsx \
    --allow 'TRAME ICPE!C134' --allow 'REMARQUES!A21'
"""
from __future__ import annotations

import argparse
import sys
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path

NS_MAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
NS_REL_DOC = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
NS_REL_PKG = 'http://schemas.openxmlformats.org/package/2006/relationships'


def _norm_target(target: str) -> str:
    parts: list[str] = []
    for part in ('xl/' + target).split('/'):
        if not part or part == '.':
            continue
        if part == '..':
            if parts:
                parts.pop()
        else:
            parts.append(part)
    return '/'.join(parts)


def sheet_paths(entries: dict[str, bytes]) -> dict[str, str]:
    workbook = ET.fromstring(entries['xl/workbook.xml'])
    rels = ET.fromstring(entries['xl/_rels/workbook.xml.rels'])
    rel_map: dict[str, str] = {}
    for rel in rels.findall(f'{{{NS_REL_PKG}}}Relationship'):
        rid = rel.attrib.get('Id')
        target = rel.attrib.get('Target')
        if rid and target:
            rel_map[rid] = _norm_target(target)
    result: dict[str, str] = {}
    for sheet in workbook.findall(f'.//{{{NS_MAIN}}}sheet'):
        name = sheet.attrib.get('name')
        rid = sheet.attrib.get(f'{{{NS_REL_DOC}}}id')
        if name and rid in rel_map:
            result[name] = rel_map[rid]
    return result


def normalize_allowed_cells(xml_bytes: bytes, allowed: set[str]) -> bytes:
    root = ET.fromstring(xml_bytes)
    for cell in root.findall(f'.//{{{NS_MAIN}}}c'):
        ref = cell.attrib.get('r')
        if ref not in allowed:
            continue
        style = cell.attrib.get('s')
        cell.attrib.clear()
        cell.attrib['r'] = ref
        if style is not None:
            cell.attrib['s'] = style
        cell.attrib['allowed-diff'] = '1'
        for child in list(cell):
            cell.remove(child)
    return ET.tostring(root, encoding='utf-8')


def load_zip(path: Path) -> dict[str, bytes]:
    with zipfile.ZipFile(path, 'r') as zf:
        return {name: zf.read(name) for name in zf.namelist() if not name.endswith('/')}


def compare(original: Path, exported: Path, allowed_refs: list[str]) -> list[str]:
    a = load_zip(original)
    b = load_zip(exported)
    errors: list[str] = []
    if set(a) != set(b):
        missing = sorted(set(a) - set(b))
        extra = sorted(set(b) - set(a))
        if missing:
            errors.append('Entrées OOXML perdues: ' + ', '.join(missing))
        if extra:
            errors.append('Entrées OOXML ajoutées: ' + ', '.join(extra))

    paths_a = sheet_paths(a)
    paths_b = sheet_paths(b)
    if paths_a != paths_b:
        errors.append(f'Ordre/noms/relations de feuilles différents: {paths_a!r} != {paths_b!r}')
        return errors

    allowed_by_path: dict[str, set[str]] = {}
    for item in allowed_refs:
        if '!' not in item:
            raise ValueError(f'Référence invalide: {item}; attendu Feuille!A1')
        sheet, ref = item.rsplit('!', 1)
        if sheet not in paths_a:
            raise ValueError(f'Feuille inconnue dans --allow: {sheet}')
        allowed_by_path.setdefault(paths_a[sheet], set()).add(ref.upper())

    for name in sorted(set(a) & set(b)):
        if a[name] == b[name]:
            continue
        allowed = allowed_by_path.get(name)
        if allowed and name.startswith('xl/worksheets/'):
            if normalize_allowed_cells(a[name], allowed) == normalize_allowed_cells(b[name], allowed):
                continue
        errors.append(f'Différence OOXML non autorisée: {name}')
    return errors


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument('original', type=Path)
    parser.add_argument('exported', type=Path)
    parser.add_argument('--allow', action='append', default=[], help='Cellule autorisée, ex: TRAME ICPE!C134')
    args = parser.parse_args()
    errors = compare(args.original, args.exported, args.allow)
    if errors:
        print('\n'.join(errors), file=sys.stderr)
        return 1
    print('OOXML conforme; différences limitées à la liste blanche.')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
