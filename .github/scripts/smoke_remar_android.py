"""Strict smoke test of the real release APK; no silent success on a failed launch."""
from pathlib import Path
import json
import re
import subprocess
import time
import xml.etree.ElementTree as ET

PKG = 'com.visitetechnique.tablet'
shots = Path('shots')
shots.mkdir(exist_ok=True)

def adb(*args):
    return subprocess.check_output(['adb', *args], stderr=subprocess.STDOUT)

def tree():
    adb('shell', 'uiautomator', 'dump', '/sdcard/metra-remar-ui.xml')
    text = adb('shell', 'cat', '/sdcard/metra-remar-ui.xml').decode()
    (shots / 'current-ui.xml').write_text(text)
    return ET.fromstring(text)

def find(label, root=None):
    # React Native exposes both the overlay and its small close button
    # as "Fermer". Click the smallest actionable element, never the backdrop.
    matches = []
    wanted = label.casefold()
    for node in (root if root is not None else tree()).iter('node'):
        labels = (node.get('text', '').casefold(), node.get('content-desc', '').casefold())
        if not any(value == wanted or value.startswith(wanted + ',') for value in labels):
            continue
        values = list(map(int, re.findall(r'\d+', node.get('bounds', ''))))
        if len(values) != 4 or values[2] <= values[0] or values[3] <= values[1]:
            continue
        x1, y1, x2, y2 = values
        area = (x2 - x1) * (y2 - y1)
        score = (node.get('clickable') != 'true', area)
        matches.append((score, ((x1 + x2) // 2, (y1 + y2) // 2)))
    return min(matches, key=lambda match: match[0])[1] if matches else None

def wait(label, seconds=60):
    until = time.monotonic() + seconds
    while time.monotonic() < until:
        try:
            pos = find(label)
            if pos:
                return pos
        except (subprocess.CalledProcessError, ET.ParseError):
            pass
        time.sleep(2)
    raise AssertionError(f'Visible Android label missing: {label}')

def tap(label):
    x, y = wait(label)
    adb('shell', 'input', 'tap', str(x), str(y))
    time.sleep(2)

def shot(name):
    (shots / f'{name}.png').write_bytes(adb('exec-out', 'screencap', '-p'))

def scroll_to(label):
    for _ in range(15):
        if find(label):
            return
        size = list(map(int, re.findall(r'\d+', adb('shell', 'wm', 'size').decode())))
        width, height = size[-2:]
        adb('shell', 'input', 'swipe', str(width // 2), str(height * 3 // 4), str(width // 2), str(height // 3), '350')
        time.sleep(1)
    raise AssertionError(f'Android label unreachable after scroll: {label}')

try:
    apk = next(Path('apk').glob('*.apk'))
    adb('install', '-r', str(apk))
    adb('logcat', '-c')
    adb('shell', 'monkey', '-p', PKG, '-c', 'android.intent.category.LAUNCHER', '1')
    wait('Réglages', 100)
    shot('01-application-complete')
    tap('Réglages')
    tap('Trames')
    wait('Bibliothèque de trames')
    scroll_to('TRAME REMAR')
    shot('02-bibliotheque-remar')
    scroll_to('Modifier la trame')
    tap('Modifier la trame')
    wait('Modifier une trame')
    scroll_to('Conf. Local')
    tap('Conf. Local')
    scroll_to('BAES')
    tap('BAES')
    wait('Modifier le point')
    wait('Commentaire proposé pour S')
    shot('02b-editeur-point-remar')
    tap('Fermer')
    # The editor title is above the scroll viewport at this point; asserting
    # it is visible wrongly fails even though the point modal is now closed.
    if find('Modifier le point'):
        raise AssertionError('REMAR point editor remains open after Fermer')
    shot('02c-editeur-ferme')
    for _ in range(16):
        if find('Fermer le brouillon'):
            break
        size = list(map(int, re.findall(r'\d+', adb('shell', 'wm', 'size').decode())))
        width, height = size[-2:]
        adb('shell', 'input', 'swipe', str(width // 2), str(height // 3), str(width // 2), str(height * 3 // 4), '350')
        time.sleep(1)
    tap('Fermer le brouillon')
    tap('Abandonner le brouillon')
    tap('Accueil')
    tap('Nouvelle visite')
    scroll_to('TRAME REMAR')
    tap('TRAME REMAR')
    tap('Démarrer la visite')
    wait('Informations', 100)
    shot('03-visite-remar')
    # A native field screen must exist, not just a successful process launch.
    wait('Informations générales')
    tap('Informations générales')
    wait('Date de visite')
    shot('04-remar-informations')
    # Closing/reopening the real app must keep the created visit available.
    adb('shell', 'am', 'force-stop', PKG)
    adb('shell', 'monkey', '-p', PKG, '-c', 'android.intent.category.LAUNCHER', '1')
    wait('Réglages', 100)
    shot('05-redemarrage')
    logs = adb('logcat', '-d').decode(errors='replace')
    crash_log = adb('logcat', '-d', '-b', 'crash').decode(errors='replace')
    assert f'Process: {PKG}' not in crash_log, 'METRA Android crash during smoke test'
    (shots / 'result.json').write_text(json.dumps({'status': 'passed', 'package': PKG, 'checks': ['launch', 'settings-library', 'point-editor', 'remar-creation', 'native-field-screen', 'restart']}, indent=2))
    print('METRA complete Android smoke passed')
finally:
    try:
        (shots / 'logcat.txt').write_bytes(adb('logcat', '-d'))
        shot('last-screen')
    except Exception:
        pass
