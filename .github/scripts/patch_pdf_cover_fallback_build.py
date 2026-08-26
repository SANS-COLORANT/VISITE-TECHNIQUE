from pathlib import Path

p = Path('reportBuilder.js')
s = p.read_text(encoding='utf-8')

# 1) Keep the original files in assets/report untouched, but normalize the
# Android-decoded image into a temporary PNG/JPEG before giving it to pdf-lib.
# This avoids the corrupted/black rendering seen in standalone APK PDFs.
old_embed = """  const embedBundledSafe = async (moduleId, format) => {\n    try {\n      const bytes = await lireAssetBinaire(moduleId);\n      return format === 'png' ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);\n    } catch (error) {\n      console.warn('Impossible de charger un asset PDF embarque', error);\n      return null;\n    }\n  };"""
new_embed = """  const embedBundledSafe = async (moduleId, format) => {\n    try {\n      const asset = Asset.fromModule(moduleId);\n      let uri = asset.localUri || null;\n\n      if (!uri) {\n        try {\n          const loaded = await Promise.race([\n            asset.downloadAsync(),\n            new Promise((_, reject) => setTimeout(\n              () => reject(new Error('Timeout de materialisation asset PDF')),\n              5000\n            )),\n          ]);\n          uri = loaded?.localUri || asset.localUri || null;\n        } catch (error) {\n          console.warn('Materialisation asset PDF impossible', error);\n        }\n      }\n\n      if (!uri) throw new Error('URI locale asset PDF indisponible');\n\n      // Important : on ne modifie jamais le fichier source dans assets/report.\n      // ImageManipulator produit uniquement une copie temporaire normalisee,\n      // lisible de facon fiable par pdf-lib dans un APK Android standalone.\n      const normalized = await ImageManipulator.manipulateAsync(\n        uri,\n        [],\n        {\n          compress: 1,\n          format: format === 'png'\n            ? ImageManipulator.SaveFormat.PNG\n            : ImageManipulator.SaveFormat.JPEG,\n          base64: true,\n        }\n      );\n\n      if (!normalized.base64) throw new Error('Normalisation asset PDF sans Base64');\n      return format === 'png'\n        ? await pdf.embedPng(normalized.base64)\n        : await pdf.embedJpg(normalized.base64);\n    } catch (error) {\n      console.warn('Impossible de charger un asset PDF embarque', error);\n      return null;\n    }\n  };"""

if old_embed in s:
    s = s.replace(old_embed, new_embed, 1)
elif 'ImageManipulator.SaveFormat.PNG' not in s:
    raise SystemExit('embedBundledSafe block not found')

# 2) Add a fallback for the two main cover visuals. Assets/report remains the
# primary source; fallback is used only if Android still cannot decode one.
old_cover = """  const [coverVisualImage, coverLogoImage, pageMarkImage, ...businessSpiralImages] = await Promise.all([\n    embedBundledSafe(REPORT_ASSET_MODULES.cover, 'png'),\n    embedBundledSafe(REPORT_ASSET_MODULES.logo, 'png'),\n    embedBundledSafe(REPORT_ASSET_MODULES.pageMark, 'png'),\n    ...REPORT_ASSET_MODULES.businessSpirals.map((moduleId) => embedBundledSafe(moduleId, 'jpg')),\n  ]);\n  const coverOpqibiImage = await embedJpgSafe(dataUriBase64(REPORT_OPQIBI));"""
new_cover = """  let [coverVisualImage, coverLogoImage, pageMarkImage, ...businessSpiralImages] = await Promise.all([\n    embedBundledSafe(REPORT_ASSET_MODULES.cover, 'png'),\n    embedBundledSafe(REPORT_ASSET_MODULES.logo, 'png'),\n    embedBundledSafe(REPORT_ASSET_MODULES.pageMark, 'png'),\n    ...REPORT_ASSET_MODULES.businessSpirals.map((moduleId) => embedBundledSafe(moduleId, 'jpg')),\n  ]);\n\n  if (!coverVisualImage) {\n    coverVisualImage = await embedJpgSafe(dataUriBase64(REPORT_COVER));\n  }\n  if (!coverLogoImage) {\n    coverLogoImage = await embedJpgSafe(dataUriBase64(REPORT_LOGO));\n  }\n\n  const coverOpqibiImage = await embedJpgSafe(dataUriBase64(REPORT_OPQIBI));"""

if old_cover in s:
    s = s.replace(old_cover, new_cover, 1)
elif 'coverVisualImage = await embedJpgSafe(dataUriBase64(REPORT_COVER))' not in s:
    raise SystemExit('PDF cover fallback block not found')

p.write_text(s, encoding='utf-8')
