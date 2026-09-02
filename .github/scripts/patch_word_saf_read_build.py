from pathlib import Path

p = Path('wordDocxExporter.js')
s = p.read_text(encoding='utf-8')

old = "await SAF.readAsStringAsync(destination, { encoding: FileSystem.EncodingType.Base64 })"
new = "await FileSystem.readAsStringAsync(destination, { encoding: FileSystem.EncodingType.Base64 })"

if new not in s:
    if old not in s:
        raise SystemExit('SAF read-back marker not found')
    s = s.replace(old, new, 1)

p.write_text(s, encoding='utf-8')
print('Word Android SAF read-back fixed: use FileSystem.readAsStringAsync for content:// URI.')
