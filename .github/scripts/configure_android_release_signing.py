from pathlib import Path
import re

BUILD_GRADLE = Path('android/app/build.gradle')


def find_block(text: str, token: str, start: int = 0, end: int | None = None):
    limit = len(text) if end is None else end
    token_index = text.find(token, start, limit)
    if token_index < 0:
        raise SystemExit(f'Bloc Android introuvable: {token}')
    open_index = text.find('{', token_index, limit)
    if open_index < 0:
        raise SystemExit(f'Accolade ouvrante introuvable pour: {token}')
    depth = 0
    for index in range(open_index, limit):
        char = text[index]
        if char == '{':
            depth += 1
        elif char == '}':
            depth -= 1
            if depth == 0:
                return token_index, open_index, index
    raise SystemExit(f'Accolade fermante introuvable pour: {token}')


def main():
    if not BUILD_GRADLE.exists():
        raise SystemExit('android/app/build.gradle absent; exécuter Expo prebuild avant ce script.')

    source = BUILD_GRADLE.read_text(encoding='utf-8')

    if 'METRA_STABLE_RELEASE_SIGNING_V1' not in source:
        _, signing_open, _ = find_block(source, 'signingConfigs')
        release_signing = '''
        // METRA_STABLE_RELEASE_SIGNING_V1
        // Cette identité de publication doit rester identique entre toutes les mises à jour.
        release {
            storeFile file("metra-release.keystore")
            storePassword System.getenv("METRA_RELEASE_STORE_PASSWORD")
            keyAlias System.getenv("METRA_RELEASE_KEY_ALIAS")
            keyPassword System.getenv("METRA_RELEASE_KEY_PASSWORD")
        }
'''
        source = source[:signing_open + 1] + release_signing + source[signing_open + 1:]

    _, build_types_open, build_types_close = find_block(source, 'buildTypes')
    _, release_open, release_close = find_block(source, 'release', build_types_open + 1, build_types_close)
    release_body = source[release_open + 1:release_close]

    signing_pattern = re.compile(r'(^\s*)signingConfig\s+signingConfigs\.\w+\s*$', re.MULTILINE)
    if signing_pattern.search(release_body):
        release_body = signing_pattern.sub(r'\1signingConfig signingConfigs.release', release_body, count=1)
    else:
        release_body = '\n        signingConfig signingConfigs.release' + release_body

    source = source[:release_open + 1] + release_body + source[release_close:]

    if 'signingConfig signingConfigs.release' not in source:
        raise SystemExit('La configuration release METRA n’a pas été appliquée.')

    BUILD_GRADLE.write_text(source, encoding='utf-8')
    print('Signature Android release stable configurée pour METRA.')


if __name__ == '__main__':
    main()
