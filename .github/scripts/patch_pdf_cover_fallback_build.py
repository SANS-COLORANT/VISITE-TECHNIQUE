from pathlib import Path

p = Path('reportBuilder.js')
s = p.read_text(encoding='utf-8')
old = """  const [coverVisualImage, coverLogoImage, pageMarkImage, ...businessSpiralImages] = await Promise.all([\n    embedBundledSafe(REPORT_ASSET_MODULES.cover, 'png'),\n    embedBundledSafe(REPORT_ASSET_MODULES.logo, 'png'),\n    embedBundledSafe(REPORT_ASSET_MODULES.pageMark, 'png'),\n    ...REPORT_ASSET_MODULES.businessSpirals.map((moduleId) => embedBundledSafe(moduleId, 'jpg')),\n  ]);\n  const coverOpqibiImage = await embedJpgSafe(dataUriBase64(REPORT_OPQIBI));"""
new = """  let [coverVisualImage, coverLogoImage, pageMarkImage, ...businessSpiralImages] = await Promise.all([\n    embedBundledSafe(REPORT_ASSET_MODULES.cover, 'png'),\n    embedBundledSafe(REPORT_ASSET_MODULES.logo, 'png'),\n    embedBundledSafe(REPORT_ASSET_MODULES.pageMark, 'png'),\n    ...REPORT_ASSET_MODULES.businessSpirals.map((moduleId) => embedBundledSafe(moduleId, 'jpg')),\n  ]);\n\n  if (!coverVisualImage) {\n    coverVisualImage = await embedJpgSafe(dataUriBase64(REPORT_COVER));\n  }\n  if (!coverLogoImage) {\n    coverLogoImage = await embedJpgSafe(dataUriBase64(REPORT_LOGO));\n  }\n\n  const coverOpqibiImage = await embedJpgSafe(dataUriBase64(REPORT_OPQIBI));"""
if old in s:
    s = s.replace(old, new, 1)
    p.write_text(s, encoding='utf-8')
elif 'coverVisualImage = await embedJpgSafe(dataUriBase64(REPORT_COVER))' not in s:
    raise SystemExit('PDF cover fallback block not found')
