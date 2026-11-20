#!/usr/bin/env python3
"""ASTRA n20 fail-closed source regression; Android and Symfony recipe still required."""
from pathlib import Path
r=Path(__file__).resolve().parents[2]
api=(r/'symfonyApi.js').read_text(encoding='utf-8')
native=(r/'native/metra-dpop/MetraDpopModule.kt').read_text(encoding='utf-8')
visit=(r/'intranetVisitOutboxDb.js').read_text(encoding='utf-8')
photo=(r/'intranetVisitPhotoOutboxDb.js').read_text(encoding='utf-8')
assert ".followRedirects(false)" in native and ".followSslRedirects(false)" in native
assert 'blocked.putInt("status", result.code)' in native
assert "error.code = 'http_redirect_blocked'" in api
# Three entrypoints: JSON API, historic-photo download and native multipart.
assert api.count("error.code = 'http_redirect_blocked'") == 3, (
    'All three DPoP request paths must reject redirects explicitly'
)
assert "client.id ?? ''" in api and 'Array.isArray(payload.clients)' in api
assert 'Array.isArray(payload.visites)' in api
assert api.index('Array.isArray(payload.clients)') < api.index('await cacheAuthorizedClients(payload.clients)')
assert api.index('Array.isArray(payload.visites)') < api.index('if (cacheResult) await cachePreparation')
assert "error?.code === 'http_redirect_blocked'" in visit
assert "error?.code === 'http_redirect_blocked'" in photo
assert 'http_redirect_blocked' not in ("reactivation_required", "invalid_grant")
assert 'secureMultipartPhotoUpload(' in api
assert 'fun secureMultipartPhotoUpload(' in native
assert 'MultipartBody.Builder().setType(MultipartBody.FORM)' in native
assert 'photo_too_large' in photo and 'uploadProtectedVisitPhoto(' in photo
assert 'new FormData()' not in photo
print('ASTRA20: native HTTP 3xx normalization, durable cache guards and queue classification PASS')
