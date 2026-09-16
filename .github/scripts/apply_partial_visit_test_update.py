from pathlib import Path

p = Path('.github/scripts/test_intranet_visit_upload.js')
s = p.read_text(encoding='utf-8')
old = """    await seed(server.db, 'missing-control');\n    await server.db.runAsync(`DELETE FROM controles_visite WHERE visite_id='missing-control'`);\n    await assert.rejects(() => payloadModule.buildIntranetVisitPayload('missing-control', '33333333-3333-4333-8333-333333333333'), /avis obligatoire/);\n    checks++; console.log(`OK ${checks}: missing required opinion blocks server upload before HTTP`);\n"""
new = """    await seed(server.db, 'missing-control');\n    await server.db.runAsync(`DELETE FROM controles_visite WHERE visite_id='missing-control'`);\n    const missingControl = await payloadModule.buildIntranetVisitPayload('missing-control', '33333333-3333-4333-8333-333333333333');\n    const missingOpinionCriterion = missingControl.payload.visites[0].criteres.find((criterion) => criterion.critereId === 100);\n    check(missingOpinionCriterion?.avis === 'N.V' && missingOpinionCriterion?.commentaire === '/',\n      'missing conformity is exported as N.V with slash comment instead of blocking the whole visit');\n\n    await seed(server.db, 'missing-counter');\n    await server.db.runAsync(`DELETE FROM compteurs WHERE visite_id='missing-counter'`);\n    const missingCounter = await payloadModule.buildIntranetVisitPayload('missing-counter', '34333333-3333-4333-8333-333333333333');\n    const missingCounterCriterion = missingCounter.payload.visites[0].criteres.find((criterion) => criterion.critereId === 104);\n    check(missingCounterCriterion?.avis === null && missingCounterCriterion?.commentaire === '/',\n      'missing counter is exported as an empty technical value instead of blocking the whole visit');\n"""
if new not in s:
    if old not in s:
        raise SystemExit('missing-control test marker not found')
    s = s.replace(old, new, 1)
p.write_text(s, encoding='utf-8')
print('Partial visit executable tests updated.')
