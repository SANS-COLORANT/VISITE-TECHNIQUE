"""
Passe de style « Verre chaud » appliquée APRÈS tous les patches du CI.

Les scripts patch_*.py injectent du code d'interface (Pré-allumage, éditeur
de rapport…) écrit dans l'ancien style. Le source, lui, est déjà converti ;
cette passe applique les mêmes transformations au code final :
polices FONTS, icônes dessinées, surfaces translucides / opaques selon
l'ombre, dégradé des boutons principaux. Chaque fichier est vérifié par
`node --check` ; en cas d'échec il est restauré tel quel.
"""
import re, sys, os, subprocess
from pathlib import Path

TARGETS = [
    'PreAllumageCompactField.js', 'PreAllumageHeatCurve.js', 'PreAllumageInstallationPanelV3.js',
    'PreAllumagePlanCard.js', 'PreAllumageInstallationPanelBusiness.js', 'PreAllumageModularPanel.js',
    'PreAllumageInfoPanelV3.js', 'ReportLayoutEditor.js', 'VisiteScreen.js', 'ParametresScreen.js',
    'SiteVisitesScreen.js', 'ReportScreen.js',
]

# ---- fontmod ----

_FONTMOD_SRC = r'''
import re, sys, os
MAP = {"900": "FONTS.black", "800": "FONTS.bold", "700": "FONTS.bodyBold", "600": "FONTS.bodySemi"}
SKIP = {"styles.js", "AppFonts.js", "premiumChrome.js"}
PAT = re.compile(r"fontWeight:\s*'(900|800|700|600)'")

def enclosing(s, i):
    d = 0; j = i
    while j > 0:
        j -= 1
        c = s[j]
        if c == '}': d += 1
        elif c == '{':
            if d == 0: break
            d -= 1
    d = 0; k = i
    while k < len(s):
        c = s[k]
        if c == '{': d += 1
        elif c == '}':
            if d == 0: break
            d -= 1
        k += 1
    return j, k

def transform(s):
    out = []; last = 0; changed = 0
    for m in PAT.finditer(s):
        a, b = enclosing(s, m.start())
        if 'fontFamily' in s[a:b]:
            continue
        out.append(s[last:m.start()]); out.append('fontFamily: ' + MAP[m.group(1)]); last = m.end(); changed += 1
    out.append(s[last:])
    s2 = ''.join(out)
    if changed and not re.search(r"import\s*\{[^}]*\bFONTS\b[^}]*\}\s*from\s*'\./styles\.js'", s2):
        m = re.search(r"import\s*\{([^}]*)\}\s*from\s*'\./styles\.js';", s2)
        if m:
            s2 = s2[:m.start(1)] + m.group(1).rstrip() + ', FONTS ' + s2[m.end(1):]
        else:
            imps = list(re.finditer(r"^import [^\n]*;\n", s2, re.M))
            pos = imps[-1].end() if imps else 0
            s2 = s2[:pos] + "import { FONTS } from './styles.js';\n" + s2[pos:]
    return s2, changed


'''

# ---- glyphmod ----

_GLYPHMOD_SRC = r'''
import re, sys, os
ICON = {'✕':'close','×':'close','⧉':'copy','✎':'edit','⌕':'search','›':'chevron-right','‹':'chevron-left','⋯':'more','⚙':'settings',
        '⚠':'warning','✓':'check','⌄':'chevron-down','⌃':'chevron-up','↻':'refresh','＋':'plus','→':'chevron-right','←':'chevron-left'}
SKIP = {'MetraCvcIcons.js','R1EasterEgg.js'}
G = '|'.join(re.escape(k) for k in ICON)
PAT = re.compile(r"<Text(?P<attrs>(?:\s+(?!style=)[a-zA-Z]+=(?:\{[^{}]*\}|\"[^\"]*\"))*)(?:\s+style=\{(?P<style>\{[^{}]*\}|\[[^\[\]{}]*(?:\{[^{}]*\}[^\[\]{}]*)*\]|[A-Za-z_.\[\]0-9]+)\})?\s*>\s*(?P<g>" + G + r")\s*</Text>")

def props(style):
    color = 'COLORS.orangeDark'; size = 16
    if style:
        m = re.findall(r"(?<![A-Za-z])color:\s*('[^']*'|\"[^\"]*\"|[^,}\]]+)", style)
        if m: color = m[-1].strip()
        m = re.findall(r"fontSize:\s*([0-9.]+)", style)
        if m: size = max(12, min(26, round(float(m[-1]) * 1.05)))
        if 'styles.chevron' in style: color, size = 'COLORS.orangeDark', 18
    if color in ('COLORS.muted', 'COLORS.primary'):
        color = '%s || COLORS.%s' % (color, 'inkSoft' if color.endswith('muted') else 'orangeDark')
    return color, size

def transform(s):
    n = 0
    def rep(m):
        nonlocal n
        n += 1
        color, size = props(m.group('style'))
        return '<CvcIcon name="%s" size={%d} color={%s} strokeWidth={2.1} />' % (ICON[m.group('g')], size, color)
    s2 = PAT.sub(rep, s)
    if n and not re.search(r"import\s*\{[^}]*\bCvcIcon\b[^}]*\}\s*from\s*'\./MetraCvcIcons\.js'", s2):
        imps = list(re.finditer(r"^import [^\n]*;\n", s2, re.M))
        pos = imps[-1].end() if imps else 0
        s2 = s2[:pos] + "import { CvcIcon } from './MetraCvcIcons.js';\n" + s2[pos:]
    if n and 'COLORS' in s2 and not re.search(r"\bCOLORS\b[^\n]*from '\./styles\.js'|import\s*\{[^}]*\bCOLORS\b[^}]*\}\s*from\s*'\./styles\.js'", s2):
        if re.search(r"(const|let|var)\s+COLORS\b", s2) is None:
            m = re.search(r"import\s*\{([^}]*)\}\s*from\s*'\./styles\.js';", s2)
            if m: s2 = s2[:m.start(1)] + m.group(1).rstrip() + ', COLORS ' + s2[m.end(1):]
            else:
                imps = list(re.finditer(r"^import [^\n]*;\n", s2, re.M)); pos = imps[-1].end()
                s2 = s2[:pos] + "import { COLORS } from './styles.js';\n" + s2[pos:]
    return s2, n


'''

# ---- surfacemod ----

_SURFACEMOD_SRC = r'''
import re, sys, os
SKIP = {'styles.js','MetraCvcIcons.js','premiumChrome.js','R1EasterEgg.js','BottomTabBar.js','QuickVisitSheet.js','AttachVisitSheet.js','VisitChrome.js'}
WHITE = r"backgroundColor:\s*(?:COLORS\.white|'#fff'|'#FFF'|'#ffffff'|'#FFFFFF'|MISSION_COLORS\.card)"
GREY = r"backgroundColor:\s*(?:'#F9FAFB'|'#F7F8FA'|'#F8FAFC'|'#FAFAFA')"
LINE = "borderColor: COLORS.line"
LINE2 = "borderColor:COLORS.line"

def transform(s, fname):
    n = 0; out = []; last = 0
    for m in re.finditer(WHITE + '|' + GREY + '|' + re.escape(LINE) + '|' + re.escape(LINE2), s):
        a, b = enclosing(s, m.start()); obj = s[a:b]
        # objet style : on ne touche ni aux positions absolues (menus, overlays),
        # ni aux feuilles de modale (fond sombre derrière), ni aux ombres portées fortes.
        if 'position:' in obj or 'modal' in s[max(0, a-120):a].lower():
            continue
        tok = m.group(0)
        if tok in (LINE, LINE2):
            rep = "borderColor: 'rgba(22,21,15,0.1)'"
        elif re.match(GREY, tok):
            rep = "backgroundColor: 'rgba(255,255,255,0.66)'"
        else:
            if 'borderRadius' in obj:
                rep = "backgroundColor: 'rgba(255,255,255,0.82)'"
            elif 'borderBottomWidth' in obj or 'borderTopWidth' in obj:
                rep = "backgroundColor: 'rgba(255,255,255,0.55)'"
            else:
                continue
        out.append(s[last:m.start()]); out.append(rep); last = m.end(); n += 1
    out.append(s[last:])
    return ''.join(out), n


'''

# ---- opaquemod ----

_OPAQUEMOD_SRC = r'''
import re, sys, os
SOLID = "'#FDFCFA'"
PAT = re.compile(r"backgroundColor: 'rgba\(255,\s*255,\s*255,\s*0?\.\d+\)'")

def transform(s):
    out = []; last = 0; n = 0
    for m in PAT.finditer(s):
        a, b = enclosing(s, m.start()); obj = s[a:b]
        em = re.search(r"elevation:\s*([0-9.]+)", obj)
        if not em or float(em.group(1)) <= 0:
            continue
        out.append(s[last:m.start()]); out.append('backgroundColor: ' + SOLID); last = m.end(); n += 1
    out.append(s[last:])
    return ''.join(out), n


'''

# ---- glowmod ----

_GLOWMOD_SRC = r'''
import re, sys, os
SKIP = {'ButtonGlow.js','styles.js','missionTheme.js'}

def open_tag_end(s, i):
    d = 0; q = None; j = i
    while j < len(s):
        c = s[j]
        if q:
            if c == '\\': j += 2; continue
            if c == q: q = None
        elif c in '"\'`' and d > 0: q = c
        elif c == '"' and d == 0: q = c
        elif c == '{': d += 1
        elif c == '}': d -= 1
        elif c == '>' and d == 0:
            return j
        j += 1
    return -1

def style_attr(tag):
    m = re.search(r"\sstyle=\{", tag)
    if not m: return ''
    d = 0; k = m.end() - 1
    for j in range(k, len(tag)):
        if tag[j] == '{': d += 1
        elif tag[j] == '}':
            d -= 1
            if d == 0: return tag[k:j+1]
    return ''

def transform(s):
    out = []; last = 0; n = 0
    for m in re.finditer(r"<TouchableOpacity\b", s):
        e = open_tag_end(s, m.start())
        if e < 0: continue
        tag = s[m.start():e+1]
        if tag.endswith('/>'): continue
        st = style_attr(tag)
        if not re.search(r"styles\.btnPrimary(?![A-Za-z])", st):
            continue
            continue
        if 'btnSecondary' in st or '?' in st or 'backgroundColor' in st:
            continue
        # déjà traité
        if s[e+1:e+60].lstrip().startswith('<ButtonGlow'):
            continue
        tone = ' tone="mission"' if 'missionStyles.primaryButton' in st else ''
        out.append(s[last:e+1]); out.append('<ButtonGlow%s />' % tone); last = e + 1; n += 1
    out.append(s[last:])
    s2 = ''.join(out)
    if n and "from './ButtonGlow.js'" not in s2:
        imps = list(re.finditer(r"^import [^\n]*;\n", s2, re.M))
        pos = imps[-1].end() if imps else 0
        s2 = s2[:pos] + "import { ButtonGlow } from './ButtonGlow.js';\n" + s2[pos:]
    return s2, n


'''

def _load(src, extra=None):
    g = {'re': re, 'sys': sys, 'os': os}
    if extra: g.update(extra)
    exec(src, g)
    return g

def main():
    font = _load(_FONTMOD_SRC)
    enclosing = font['enclosing']
    mods = [
        ('polices', font['transform']),
        ('icônes', _load(_GLYPHMOD_SRC)['transform']),
        ('surfaces', lambda s: _load(_SURFACEMOD_SRC, {'enclosing': enclosing})['transform'](s, '')),
        ('opacité', _load(_OPAQUEMOD_SRC, {'enclosing': enclosing})['transform']),
        ('boutons', _load(_GLOWMOD_SRC)['transform']),
    ]
    total = 0
    for name in TARGETS:
        p = Path(name)
        if not p.exists():
            continue
        original = p.read_text(encoding='utf-8')
        s = original
        counts = []
        for label, fn in mods:
            try:
                s, n = fn(s)
            except Exception as e:  # une passe qui échoue ne bloque jamais le build
                print(f'{name}: passe {label} ignorée ({e})')
                n = 0
            if n:
                counts.append(f'{label} {n}')
        if s == original:
            continue
        p.write_text(s, encoding='utf-8')
        check = subprocess.run(['node', '--check', name], capture_output=True, text=True)
        if check.returncode != 0:
            p.write_text(original, encoding='utf-8')
            print(f'{name}: restauré (node --check a échoué)')
            continue
        total += 1
        print(f'{name}: ' + ', '.join(counts))
    print(f'Passe de style Verre chaud : {total} fichier(s) harmonisé(s).')

if __name__ == '__main__':
    main()
