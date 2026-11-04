/**
 * Pure geometry for the client patrimoine matrix. Shared across phone/tablet,
 * portrait/landscape and testable without React Native or SQLite.
 * The comfort profile preserves the historical row/column dimensions.
 */
export const PILOTAGE_DENSITY = Object.freeze({
  compact: 'compact',
  comfortable: 'comfortable',
});

const GEOMETRY = Object.freeze({
  compact: Object.freeze({ rowHeight: 48, headerHeight: 42, cellWidth: 84, cellInset: 2 }),
  comfortable: Object.freeze({ rowHeight: 72, headerHeight: 58, cellWidth: 98, cellInset: 3 }),
});

export function getPilotageMatrixGeometry({ mode = 'compact', screenWidth = 390, screenHeight = 800, rowCount = 0 } = {}) {
  const compact = mode !== PILOTAGE_DENSITY.comfortable;
  const profile = compact ? GEOMETRY.compact : GEOMETRY.comfortable;
  const width = Number.isFinite(Number(screenWidth)) ? Math.max(280, Number(screenWidth)) : 390;
  const height = Number.isFinite(Number(screenHeight)) ? Math.max(400, Number(screenHeight)) : 800;
  const rows = Number.isFinite(Number(rowCount)) ? Math.max(0, Math.floor(Number(rowCount))) : 0;
  const phone = width < 650;
  const leftWidth = compact ? (width < 390 ? 144 : (phone ? 164 : 190)) : 210;
  // Reserve room for Android's safe header, filters/actions and the bottom dock.
  // The matrix itself owns vertical scrolling; column headers stay in place.
  const ceiling = compact ? Math.max(240, height - (phone ? 284 : 318)) : 610;
  const matrixHeight = Math.min(ceiling, Math.max(compact ? 154 : 166, profile.headerHeight + rows * profile.rowHeight));
  return { ...profile, leftWidth, matrixHeight };
}
