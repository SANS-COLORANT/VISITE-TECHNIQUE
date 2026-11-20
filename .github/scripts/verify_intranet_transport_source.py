#!/usr/bin/env python3
"""Offline source contract: not a substitute for Android and backend testing."""
from pathlib import Path
root = Path(__file__).resolve().parents[2]
native = (root / 'native/metra-dpop/MetraDpopModule.kt').read_text(encoding='utf-8')
api = (root / 'symfonyApi.js').read_text(encoding='utf-8')
for needle in (
    '.followRedirects(false)',
    '.followSslRedirects(false)',
    '.retryOnConnectionFailure(false)',
    'target.host != "intranet-energieetservice.com"',
    'target.scheme != "https"',
    'target.port != 443',
    'result.code in 300..399',
    'secureHttpRequest(',
    '64L * 1024L * 1024L',
):
    assert needle in native, 'Native strict HTTP contract missing: ' + needle
assert 'await fetch(' not in api, 'Intranet request must not call React Native fetch'
assert api.count('strictNativeRequest(') >= 3, 'Activation, refresh and photos must route via native'
assert "createProof(method, url, accessToken)" in api, 'DPoP proof binding required'
assert "protectedDownloadUrl(path)" in api, 'Photo URL whitelist required'
assert "body = typeof serializedPayload === 'string' ? serializedPayload : JSON.stringify(serializedPayload)" in api
assert 'secureMultipartPhotoUpload(' in api
assert 'fun secureMultipartPhotoUpload(' in native
print('ASTRA M04: source contract for native no-redirect DPoP transport PASS')
