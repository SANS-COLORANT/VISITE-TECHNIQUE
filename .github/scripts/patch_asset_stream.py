from pathlib import Path

p = Path('.github/scripts/fix_native_pdf_cover.py')
s = p.read_text(encoding='utf-8')
start = s.index('def decode_piece(path):')
end = s.index('\n\nassets = {', start)
replacement = '''def encoded_piece(path):
    text = git_show(path)
    m = re.search(r"export default ['\\\"]([^'\\\"]+)['\\\"]", text, re.S)
    if not m:
        raise SystemExit(f'No Base64 payload in {path}')
    return re.sub(r'[^A-Za-z0-9+/=]', '', m.group(1))


def rebuild(paths):
    # V2 files are text slices of one Base64 stream. Join the text first,
    # then decode exactly once to recover the original JPEG bytes.
    raw = ''.join(encoded_piece(path) for path in paths)
    raw += '=' * ((4 - len(raw) % 4) % 4)
    data = base64.b64decode(raw, validate=True)
    if not (data.startswith(b'\\xff\\xd8') and data.endswith(b'\\xff\\xd9')):
        raise SystemExit(f'Invalid JPEG framing: {paths} ({len(data)} bytes)')
    return data
'''
p.write_text(s[:start] + replacement + s[end:], encoding='utf-8')
print('Asset stream reconstruction patched.')
