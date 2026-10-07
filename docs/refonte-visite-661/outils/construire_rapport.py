#!/usr/bin/env python3
"""Construit rapport.html (page autonome, images réduites et intégrées) à partir de ../README.md.
Usage : python3 construire_rapport.py [--fragment chemin_de_sortie]   (--fragment : sans <!doctype>, pour une publication en artefact)"""
import base64, html, io, os, re, sys
from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
MAXW = 900

CSS = """
:root{--bg:#F3F1EC;--fg:#1A1A18;--soft:#6B6B66;--line:rgba(22,21,15,.12);--card:#FDFCFA;--ac:#D9531A;--acl:#FCE4D3;--code:#EFEDE6;--th:#EAE7DF}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#171612;--fg:#F1EEE7;--soft:#A8A59B;--line:rgba(241,238,231,.14);--card:#201F1A;--ac:#FF8A4F;--acl:#3A2418;--code:#2A2823;--th:#2B2923;color-scheme:dark}}
:root[data-theme="dark"]{--bg:#171612;--fg:#F1EEE7;--soft:#A8A59B;--line:rgba(241,238,231,.14);--card:#201F1A;--ac:#FF8A4F;--acl:#3A2418;--code:#2A2823;--th:#2B2923;color-scheme:dark}
body{background:var(--bg);color:var(--fg);font:15px/1.6 'Inter','Segoe UI',system-ui,sans-serif;padding-inline:16px;padding-block:24px 64px}
main{max-width:920px;margin:0 auto}
h1{font:800 28px/1.15 'Sora','Segoe UI',system-ui,sans-serif;margin:.2em 0 .5em;text-wrap:balance}
h2{font:700 21px/1.25 'Sora','Segoe UI',system-ui,sans-serif;margin:2.2em 0 .6em;padding-top:.6em;border-top:1px solid var(--line);text-wrap:balance}
h3{font:700 17px/1.3 'Sora','Segoe UI',system-ui,sans-serif;margin:1.8em 0 .5em}
h4{font:700 15px 'Sora','Segoe UI',system-ui,sans-serif;margin:1.4em 0 .4em}
p,li{max-width:78ch}p{margin:.7em 0}ul,ol{padding-left:1.3em}li{margin:.25em 0}
a{color:var(--ac)}hr{border:0;border-top:1px solid var(--line);margin:2em 0}
blockquote{margin:1em 0;padding:.6em 1em;border-left:3px solid var(--ac);background:var(--card);border-radius:0 12px 12px 0;color:var(--soft)}
code{background:var(--code);padding:.1em .35em;border-radius:5px;font:13px ui-monospace,Menlo,Consolas,monospace}
pre{background:var(--code);padding:12px 14px;border-radius:12px;overflow-x:auto}pre code{background:none;padding:0}
.tw{overflow-x:auto;margin:1em 0;border:1px solid var(--line);border-radius:12px}
table{border-collapse:collapse;width:100%;font-size:13.5px}th,td{padding:8px 11px;text-align:left;vertical-align:top;border-bottom:1px solid var(--line)}th{background:var(--th);font-weight:700}tr:last-child td{border-bottom:0}
img{display:block;max-width:100%;height:auto;margin:1em auto;border-radius:14px;border:1px solid var(--line);background:var(--card)}
strong{font-weight:700}
"""

def slug(t):
    t = re.sub(r'<[^>]+>', '', t).lower().strip()
    t = re.sub(r'[^\w\s-]', '', t, flags=re.UNICODE)
    return re.sub(r'\s', '-', t)

def data_uri(rel):
    p = os.path.join(ROOT, rel)
    if not os.path.exists(p):
        return rel
    if p.endswith('.svg'):
        return 'data:image/svg+xml;base64,' + base64.b64encode(open(p, 'rb').read()).decode()
    im = Image.open(p).convert('RGB')
    if im.width > MAXW:
        im = im.resize((MAXW, int(im.height * MAXW / im.width)), Image.LANCZOS)
    b = io.BytesIO(); im.save(b, 'JPEG', quality=78, optimize=True)
    return 'data:image/jpeg;base64,' + base64.b64encode(b.getvalue()).decode()

def inline(s):
    s = html.escape(s, quote=False)
    s = re.sub(r'!\[([^\]]*)\]\(([^)]+)\)', lambda m: f'<img alt="{html.escape(m.group(1))}" src="{data_uri(m.group(2))}" loading="lazy">', s)
    s = re.sub(r'\[([^\]]+)\]\(([^)]+)\)', lambda m: f'<a href="{m.group(2)}"' + ('' if m.group(2).startswith('#') else ' target="_blank" rel="noopener"') + f'>{m.group(1)}</a>', s)
    s = re.sub(r'`([^`]+)`', lambda m: '<code>' + m.group(1) + '</code>', s)
    s = re.sub(r'\*\*([^*]+)\*\*', r'<strong>\1</strong>', s)
    s = re.sub(r'(?<![\w*])\*([^*\n]+)\*(?![\w*])', r'<em>\1</em>', s)
    return s

def convert(md):
    out, lines, i = [], md.split('\n'), 0
    while i < len(lines):
        l = lines[i]
        if l.startswith('```'):
            j = i + 1; buf = []
            while j < len(lines) and not lines[j].startswith('```'):
                buf.append(lines[j]); j += 1
            out.append('<pre><code>' + html.escape('\n'.join(buf)) + '</code></pre>'); i = j + 1; continue
        m = re.match(r'^(#{1,4})\s+(.*)$', l)
        if m:
            n = len(m.group(1)); t = m.group(2)
            out.append(f'<h{n} id="{slug(t)}">{inline(t)}</h{n}>'); i += 1; continue
        if l.strip() == '---':
            out.append('<hr>'); i += 1; continue
        if l.startswith('>'):
            buf = []
            while i < len(lines) and lines[i].startswith('>'):
                buf.append(lines[i].lstrip('> ').rstrip()); i += 1
            out.append('<blockquote>' + inline(' '.join(buf)) + '</blockquote>'); continue
        if l.startswith('|') and i + 1 < len(lines) and re.match(r'^\|[\s:|-]+\|$', lines[i + 1].strip()):
            hdr = [c.strip() for c in l.strip().strip('|').split('|')]; i += 2; rows = []
            while i < len(lines) and lines[i].startswith('|'):
                rows.append([c.strip() for c in lines[i].strip().strip('|').split('|')]); i += 1
            t = '<div class="tw"><table><thead><tr>' + ''.join(f'<th>{inline(c)}</th>' for c in hdr) + '</tr></thead><tbody>'
            for r in rows:
                t += '<tr>' + ''.join(f'<td>{inline(c)}</td>' for c in r) + '</tr>'
            out.append(t + '</tbody></table></div>'); continue
        m = re.match(r'^(\s*)(?:(\d+)\.|-)\s+(.*)$', l)
        if m:
            ordered = bool(m.group(2)); buf = []
            while i < len(lines):
                mm = re.match(r'^(\s*)(?:(\d+)\.|-)\s+(.*)$', lines[i])
                if not mm: break
                buf.append(inline(mm.group(3))); i += 1
            tag = 'ol' if ordered else 'ul'
            out.append(f'<{tag}>' + ''.join(f'<li>{b}</li>' for b in buf) + f'</{tag}>'); continue
        if l.strip() == '':
            i += 1; continue
        buf = [l]; i += 1
        while i < len(lines) and lines[i].strip() and not re.match(r'^(#{1,4}\s|```|\||>|---|(\s*)(\d+\.|-)\s)', lines[i]):
            buf.append(lines[i]); i += 1
        out.append('<p>' + inline(' '.join(buf)) + '</p>')
    return '\n'.join(out)

md = open(os.path.join(ROOT, 'README.md'), encoding='utf-8').read()
body = convert(md)
fragment = '--fragment' in sys.argv
head = '<title>Refonte des onglets de visite</title>\n<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Sora:wght@600;700;800&display=swap">\n<style>' + CSS + '</style>\n'
page = head + '<main>\n' + body + '\n</main>\n'
if fragment:
    dest = sys.argv[sys.argv.index('--fragment') + 1]
    open(dest, 'w', encoding='utf-8').write(page)
else:
    dest = os.path.join(ROOT, 'rapport.html')
    open(dest, 'w', encoding='utf-8').write('<!doctype html>\n<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">\n' + head + '</head><body>\n<main>\n' + body + '\n</main>\n</body></html>\n')
print(dest, round(os.path.getsize(dest) / 1e6, 1), 'Mo')
