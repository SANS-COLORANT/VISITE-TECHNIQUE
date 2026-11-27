/**
 * Listes de référence — lecture d'un classeur Excel (pur, testé sous Node).
 * Reçoit un classeur déjà lu par SheetJS et propose chaque colonne non vide
 * comme liste possible (en-tête en première ligne).
 */
export function workbookColumns(workbook, XLSX) {
  const out = [];
  for (const sheet of workbook?.SheetNames || []) {
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheet], { header: 1, blankrows: false, defval: '' });
    if (!rows.length) continue;
    const width = Math.max(...rows.map((r) => r.length));
    for (let c = 0; c < width; c += 1) {
      const header = String(rows[0]?.[c] ?? '').trim();
      const seen = new Set();
      const values = [];
      for (const row of rows.slice(1)) {
        const value = String(row?.[c] ?? '').trim();
        if (!value || seen.has(value.toLowerCase())) continue;
        seen.add(value.toLowerCase());
        values.push(value);
      }
      if (values.length) out.push({ sheet, column: c, header: header || `Colonne ${c + 1}`, values });
    }
  }
  return out;
}
