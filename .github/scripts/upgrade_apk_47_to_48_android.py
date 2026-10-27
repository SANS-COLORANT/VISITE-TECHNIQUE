"""Android upgrade regression: real APK v47 -> v48 with persisted REMAR visit."""
from pathlib import Path
import json, re, subprocess, time, xml.etree.ElementTree as ET

PKG = 'com.visitetechnique.tablet'
OUT = Path('upgrade-shots')
OUT.mkdir(exist_ok=True)

def adb(*args):
    return subprocess.check_output(['adb', *args], stderr=subprocess.STDOUT, timeout=85)

def dump():
    adb('shell', 'uiautomator', 'dump', '/sdcard/metra-upgrade.xml')
    result = adb('shell', 'cat', '/sdcard/metra-upgrade.xml').decode(errors='replace')
    (OUT / 'current-ui.xml').write_text(result)
    return ET.fromstring(result)

def label_of(node):
    return (node.get('content-desc') or node.get('text') or '').strip()

def hit(label):
    matches = []
    for n in dump().iter('node'):
        terms = [n.get('text','').casefold(), n.get('content-desc','').casefold()]
        wanted = label.casefold()
        if not any(t == wanted or t.startswith(wanted + ',') for t in terms):
            continue
        b = list(map(int, re.findall(r'\d+', n.get('bounds', ''))))
        if len(b) != 4 or b[2] <= b[0] or b[3] <= b[1]: continue
        area = (b[2]-b[0]) * (b[3]-b[1])
        matches.append(((n.get('clickable') != 'true', area), ((b[0]+b[2])//2, (b[1]+b[3])//2)))
    return min(matches, key=lambda m:m[0])[1] if matches else None

def wait(label, seconds=95):
    deadline = time.monotonic() + seconds
    while time.monotonic() < deadline:
        try:
            point = hit(label)
            if point is not None: return point
        except (ET.ParseError, subprocess.CalledProcessError):
            pass
        time.sleep(1.5)
    raise AssertionError('Missing visible Android action: ' + label)

def tap(label):
    x,y = wait(label)
    adb('shell', 'input', 'tap', str(x), str(y))
    time.sleep(1.3)

def snapshot(name):
    (OUT/(name + '.png')).write_bytes(adb('exec-out','screencap','-p'))

def scroll_to(label, tries=17):
    for _ in range(tries):
        if hit(label): return
        size=list(map(int,re.findall(r'\d+', adb('shell','wm','size').decode())))
        w,h=size[-2:]
        adb('shell','input','swipe',str(w//2),str(3*h//4),str(w//2),str(h//3),'350')
        time.sleep(0.8)
    raise AssertionError('Unreachable Android choice: '+label)

def launch():
    adb('shell','monkey','-p',PKG,'-c','android.intent.category.LAUNCHER','1')
    wait('Réglages')

def version():
    output = adb('shell','dumpsys','package',PKG).decode(errors='replace')
    x=re.search(r'versionCode=(\d+)',output)
    if not x: raise AssertionError('No installed Android versionCode')
    return int(x.group(1))

def titles():
    return [label_of(n) for n in dump().iter('node') if 'visite rapide du' in label_of(n).casefold()]

def assert_visit(name):
    if name in titles(): return
    try: tap('Accueil')
    except Exception: pass
    if name not in titles(): raise AssertionError('The previously saved visit disappeared after APK update: '+name)

try:
    old=next(Path('old').rglob('*.apk'))
    new=next(Path('new').rglob('*.apk'))
    assert 'Success' in adb('install','-r',str(old)).decode(), 'Old APK install failed'
    adb('logcat','-c')
    old_version=version()
    launch()
    tap('Nouvelle visite')
    scroll_to('TRAME REMAR')
    tap('TRAME REMAR')
    tap('Démarrer la visite')
    wait('Informations')
    existing=titles()
    if not existing: raise AssertionError('Old APK could not create a local REMAR visit')
    visit=existing[0]
    snapshot('01-ancienne-version-remar')

    adb('shell','am','force-stop',PKG)
    result=adb('install','-r',str(new)).decode()
    if 'Success' not in result: raise AssertionError('Signed in-place upgrade rejected: '+result)
    current_version=version()
    if current_version <= old_version:
        raise AssertionError(f'Android versionCode did not increase: {old_version} -> {current_version}')
    adb('logcat','-c')
    launch()
    assert_visit(visit)
    snapshot('02-visite-conservee-apres-mise-a-jour')
    tap(visit)
    wait('Photo libre')
    wait('Informations')
    snapshot('03-ancienne-visite-ouverte-en-v48')
    adb('shell','am','force-stop',PKG)
    launch()
    assert_visit(visit)
    snapshot('04-visite-apres-deuxieme-redemarrage')
    crash=adb('logcat','-d','-b','crash').decode(errors='replace')
    if f'Process: {PKG}' in crash: raise AssertionError('App crashed during v47 -> v48 upgrade')
    (OUT/'result.json').write_text(json.dumps({
      'status':'passed','package':PKG,'oldVersionCode':old_version,
      'newVersionCode':current_version,'visit':visit,
      'checks':['signed_update_without_uninstall','version_code_increased',
                'REMAR_visit_persisted','existing_visit_opens',
                'new_photo_libre_action','restart_persists_visit',
                'no_android_crash']
    },ensure_ascii=False,indent=2))
    print('METRA signed in-place Android upgrade 47 -> 48: PASSED')
finally:
    try:
        (OUT/'logcat.txt').write_bytes(adb('logcat','-d'))
        snapshot('last-screen')
    except Exception: pass
