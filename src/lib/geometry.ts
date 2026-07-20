/**
 * Axis-aligned bounding box (in cm) of a `wCm` × `hCm` rectangle rotated by
 * `angleDeg` degrees. For 0°/180° it returns the rect unchanged; for 90°/270°
 * it swaps width/height; for arbitrary angles (manual rotation) it returns the
 * true enclosing box. Used to place/measure rotated art consistently across the
 * packer, the on-screen canvas and the export.
 */
export function rotatedAabbCm(wCm: number, hCm: number, angleDeg: number): { wCm: number; hCm: number } {
  const r = (angleDeg * Math.PI) / 180
  const c = Math.abs(Math.cos(r))
  const s = Math.abs(Math.sin(r))
  return { wCm: wCm * c + hCm * s, hCm: wCm * s + hCm * c }
}
