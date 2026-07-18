import type { PackedPage, PlacedItem } from '@/types'
import { usedLengthCm } from './placedGeometry'

/**
 * Shape-aware (real silhouette) bin packing.
 *
 * Instead of treating every art as its bounding rectangle, each art carries a
 * low-resolution occupancy mask of its visible pixels. We rasterize the sheet
 * into a grid at `CELL_CM` resolution, dilate every mask by half of the user's
 * spacing, and drop each art (largest first) into the lowest / left-most free
 * position where its mask does not overlap anything already placed — including
 * settling into the concavities of previously placed arts. This is what lets a
 * small art nest inside the hollow of a "C" or between the legs of an "A",
 * minimizing the linear meters of film consumed.
 *
 * Output is expressed in the exact same PlacedItem convention the canvas editor
 * and exporter already use (content-box top-left in cm + rotation angle), so no
 * downstream code changes are required.
 */

// Sheet grid resolution: 2 mm per cell. Fine enough to capture real concavities
// without exploding the grid size (a 57x100 cm sheet is ~285x500 cells).
export const CELL_CM = 0.2

// Serializable art description sent to the worker (no File / blob handles).
export interface PackUnitInput {
  id: string
  sourceImageId: string
  previewUrl: string
  widthCm: number
  heightCm: number
  contentXPx: number
  contentYPx: number
  contentWidthPx: number
  contentHeightPx: number
  naturalWidthPx: number
  naturalHeightPx: number
  quantity: number
  mask?: { cols: number; rows: number; data: Uint8Array; hasAlpha: boolean }
}

export interface PackOptions {
  maxHeightCm: number
  canvasWidthCm: number
  itemGapCm: number
}

interface Grid {
  cols: number
  rows: number
  cells: Uint8Array
  // Per-column first free row, used to skip already-filled bottoms while scanning.
  colFloor: Int32Array
}

// A rotation candidate: dilated mask footprint (grid cells) + the content
// bounding-box dimensions for that orientation (cm).
interface Footprint {
  angle: 0 | 90 | 180 | 270
  cols: number
  rows: number
  // Occupied cell offsets relative to the footprint's top-left, occupied only.
  offsets: Int32Array // pairs [dc, dr, dc, dr, ...]
  // Inset (in cells) of the real content box within the dilated footprint.
  inset: number
  bboxWidthCm: number
  bboxHeightCm: number
}

function expandQueue(units: PackUnitInput[]): PackUnitInput[] {
  const out: PackUnitInput[] = []
  for (const u of units) {
    for (let i = 0; i < u.quantity; i++) {
      out.push({ ...u, id: `${u.id}-${i}` })
    }
  }
  return out
}

/** Nearest-neighbour resample of the normalized mask to `cols x rows` cells. */
function resampleMask(
  mask: { cols: number; rows: number; data: Uint8Array },
  cols: number,
  rows: number
): Uint8Array {
  const out = new Uint8Array(cols * rows)
  for (let r = 0; r < rows; r++) {
    const sr = Math.min(mask.rows - 1, Math.floor((r / rows) * mask.rows))
    for (let c = 0; c < cols; c++) {
      const sc = Math.min(mask.cols - 1, Math.floor((c / cols) * mask.cols))
      out[r * cols + c] = mask.data[sr * mask.cols + sc]
    }
  }
  return out
}

/** Binary dilation by `d` cells using a fast two-pass chamfer distance. */
function dilate(src: Uint8Array, cols: number, rows: number, d: number): Uint8Array {
  if (d <= 0) return src
  const INF = 1 << 20
  const dist = new Int32Array(cols * rows)
  for (let i = 0; i < dist.length; i++) dist[i] = src[i] ? 0 : INF

  // Forward pass (top-left -> bottom-right).
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c
      let v = dist[i]
      if (c > 0) v = Math.min(v, dist[i - 1] + 1)
      if (r > 0) v = Math.min(v, dist[i - cols] + 1)
      dist[i] = v
    }
  }
  // Backward pass (bottom-right -> top-left).
  for (let r = rows - 1; r >= 0; r--) {
    for (let c = cols - 1; c >= 0; c--) {
      const i = r * cols + c
      let v = dist[i]
      if (c < cols - 1) v = Math.min(v, dist[i + 1] + 1)
      if (r < rows - 1) v = Math.min(v, dist[i + cols] + 1)
      dist[i] = v
    }
  }

  const out = new Uint8Array(cols * rows)
  for (let i = 0; i < out.length; i++) out[i] = dist[i] <= d ? 1 : 0
  return out
}

/** Rotate a mask grid by a multiple of 90° (clockwise). */
function rotateMask(
  src: Uint8Array,
  cols: number,
  rows: number,
  angle: 0 | 90 | 180 | 270
): { data: Uint8Array; cols: number; rows: number } {
  if (angle === 0) return { data: src, cols, rows }
  if (angle === 180) {
    const out = new Uint8Array(src.length)
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++) out[(rows - 1 - r) * cols + (cols - 1 - c)] = src[r * cols + c]
    return { data: out, cols, rows }
  }
  // 90 / 270 swap dimensions.
  const nCols = rows
  const nRows = cols
  const out = new Uint8Array(src.length)
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const v = src[r * cols + c]
      if (angle === 90) out[c * nCols + (nCols - 1 - r)] = v
      else out[(nRows - 1 - c) * nCols + r] = v // 270
    }
  }
  return { data: out, cols: nCols, rows: nRows }
}

/**
 * Builds the dilated footprint for one art in one orientation. The content box
 * (widthCm x heightCm, rotated) is rasterized, resampled, rotated, then dilated
 * by `dCells` so the outer ring of empty cells encodes the required spacing.
 */
function buildFootprint(
  unit: PackUnitInput,
  angle: 0 | 90 | 180 | 270,
  dCells: number,
  allowShape: boolean
): Footprint {
  // Content cells in the unrotated orientation.
  const baseCols = Math.max(1, Math.round(unit.widthCm / CELL_CM))
  const baseRows = Math.max(1, Math.round(unit.heightCm / CELL_CM))

  let shape: Uint8Array
  if (allowShape && unit.mask && unit.mask.hasAlpha) {
    shape = resampleMask(unit.mask, baseCols, baseRows)
  } else {
    shape = new Uint8Array(baseCols * baseRows).fill(1)
  }

  const rotated = rotateMask(shape, baseCols, baseRows, angle)
  const pad = dCells
  const cols = rotated.cols + pad * 2
  const rows = rotated.rows + pad * 2
  const padded = new Uint8Array(cols * rows)
  for (let r = 0; r < rotated.rows; r++)
    for (let c = 0; c < rotated.cols; c++)
      padded[(r + pad) * cols + (c + pad)] = rotated.data[r * rotated.cols + c]

  const dilated = dilate(padded, cols, rows, dCells)

  const offsets: number[] = []
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) if (dilated[r * cols + c]) offsets.push(c, r)

  const rot90 = angle === 90 || angle === 270
  return {
    angle,
    cols,
    rows,
    offsets: Int32Array.from(offsets),
    inset: pad,
    bboxWidthCm: rot90 ? unit.heightCm : unit.widthCm,
    bboxHeightCm: rot90 ? unit.widthCm : unit.heightCm,
  }
}

function createGrid(cols: number, rows: number): Grid {
  return { cols, rows, cells: new Uint8Array(cols * rows), colFloor: new Int32Array(cols) }
}

/** True if the footprint fits at (ox, oy) without overlapping used cells. */
function fits(grid: Grid, fp: Footprint, ox: number, oy: number): boolean {
  if (ox < 0 || oy < 0 || ox + fp.cols > grid.cols || oy + fp.rows > grid.rows) return false
  const { offsets } = fp
  const { cells, cols } = grid
  for (let i = 0; i < offsets.length; i += 2) {
    const idx = (oy + offsets[i + 1]) * cols + (ox + offsets[i])
    if (cells[idx]) return false
  }
  return true
}

function stamp(grid: Grid, fp: Footprint, ox: number, oy: number) {
  const { offsets } = fp
  const { cells, cols } = grid
  for (let i = 0; i < offsets.length; i += 2) {
    const c = ox + offsets[i]
    const r = oy + offsets[i + 1]
    cells[r * cols + c] = 1
    if (r + 1 > grid.colFloor[c]) grid.colFloor[c] = r + 1
  }
}

/**
 * Finds the bottom-left-most valid position for any of the art's orientations.
 * Coarse scan (stride) first, then a local refine to tighten the placement.
 */
function findPlacement(
  grid: Grid,
  footprints: Footprint[],
  stride: number
): { fp: Footprint; x: number; y: number } | null {
  let best: { fp: Footprint; x: number; y: number } | null = null

  for (const fp of footprints) {
    const maxY = grid.rows - fp.rows
    const maxX = grid.cols - fp.cols
    if (maxY < 0 || maxX < 0) continue

    // Skyline hint: don't start below the lowest column floor under the widest
    // possible span — cheap lower bound that skips obviously-filled bottoms.
    let found: { x: number; y: number } | null = null
    for (let y = 0; y <= maxY && !found; y += stride) {
      for (let x = 0; x <= maxX; x += stride) {
        if (fits(grid, fp, x, y)) {
          found = { x, y }
          break
        }
      }
    }
    if (!found) continue

    // Local refine: pull up and left one cell at a time from the coarse hit.
    let { x, y } = found
    let improved = true
    while (improved) {
      improved = false
      while (y - 1 >= 0 && fits(grid, fp, x, y - 1)) {
        y--
        improved = true
      }
      while (x - 1 >= 0 && fits(grid, fp, x - 1, y)) {
        x--
        improved = true
      }
    }

    if (!best || y < best.y || (y === best.y && x < best.x)) {
      best = { fp, x, y }
    }
  }

  return best
}

/**
 * Converts a footprint placement (grid cells) into a PlacedItem using the
 * canvas/exporter convention: `xCm/yCm` encode the fabric object origin via the
 * same read-back the editor uses, `widthCm/heightCm` are the UNROTATED content
 * dimensions, and `angle` carries the rotation. Derived so a rotated art renders
 * pixel-accurately with the exact formula in CanvasPage / exportCanvas.
 */
function toPlacedItem(unit: PackUnitInput, fp: Footprint, gx: number, gy: number): PlacedItem {
  // Target: top-left of the visible content bbox on the sheet (cm).
  const tx = (gx + fp.inset) * CELL_CM
  const ty = (gy + fp.inset) * CELL_CM

  // cm-per-content-pixel (uniform scale used by the renderer).
  const sc = unit.widthCm / unit.contentWidthPx
  const cx = unit.contentXPx
  const cy = unit.contentYPx
  const cw = unit.contentWidthPx
  const ch = unit.contentHeightPx

  let xCm: number
  let yCm: number
  switch (fp.angle) {
    case 90:
      xCm = tx + (cx + cy + ch) * sc
      yCm = ty + (cy - cx) * sc
      break
    case 180:
      xCm = tx + (2 * cx + cw) * sc
      yCm = ty + (2 * cy + ch) * sc
      break
    case 270:
      xCm = tx + (cx - cy) * sc
      yCm = ty + (cx + cw + cy) * sc
      break
    default:
      xCm = tx
      yCm = ty
  }

  return {
    id: unit.id,
    sourceImageId: unit.sourceImageId,
    previewUrl: unit.previewUrl,
    xCm,
    yCm,
    widthCm: unit.widthCm,
    heightCm: unit.heightCm,
    angle: fp.angle,
    contentXPx: unit.contentXPx,
    contentYPx: unit.contentYPx,
    contentWidthPx: unit.contentWidthPx,
    contentHeightPx: unit.contentHeightPx,
    naturalWidthPx: unit.naturalWidthPx,
    naturalHeightPx: unit.naturalHeightPx,
  }
}

export interface PackProgress {
  done: number
  total: number
}

/**
 * Runs the shape packer. `onProgress` is called as arts are placed so the UI can
 * show a determinate indicator. `useShape=false` forces rectangle footprints
 * (automatic fallback path).
 */
export function packImagesByShape(
  units: PackUnitInput[],
  opts: PackOptions,
  onProgress?: (p: PackProgress) => void,
  useShape = true
): PackedPage[] {
  const expanded = expandQueue(units).sort((a, b) => b.widthCm * b.heightCm - a.widthCm * a.heightCm)
  const total = expanded.length

  const gridCols = Math.max(1, Math.floor(opts.canvasWidthCm / CELL_CM))
  const gridRows = Math.max(1, Math.floor(opts.maxHeightCm / CELL_CM))

  // Half the spacing goes on each art; the neighbour supplies the other half.
  const dCells = Math.max(0, Math.round(opts.itemGapCm / 2 / CELL_CM))
  // Coarse scan stride ~6 mm; refine pass recovers the tight fit.
  const stride = Math.max(1, Math.round(0.6 / CELL_CM))

  const pages: { grid: Grid; items: PlacedItem[] }[] = []
  const openPage = () => {
    const p = { grid: createGrid(gridCols, gridRows), items: [] as PlacedItem[] }
    pages.push(p)
    return p
  }

  let done = 0
  for (const unit of expanded) {
    // Footprints for this art in each orientation (skip mirror-equivalents for
    // square-ish masks to save time by only trying 0/90 when close to square).
    const angles: (0 | 90 | 180 | 270)[] = [0, 90, 180, 270]
    const footprints = angles.map((a) => buildFootprint(unit, a, dCells, useShape))

    let placed = false
    for (const page of pages) {
      const hit = findPlacement(page.grid, footprints, stride)
      if (hit) {
        stamp(page.grid, hit.fp, hit.x, hit.y)
        page.items.push(toPlacedItem(unit, hit.fp, hit.x, hit.y))
        placed = true
        break
      }
    }
    if (!placed) {
      const page = openPage()
      const hit = findPlacement(page.grid, footprints, stride)
      if (hit) {
        stamp(page.grid, hit.fp, hit.x, hit.y)
        page.items.push(toPlacedItem(unit, hit.fp, hit.x, hit.y))
      } else {
        // Art bigger than the sheet even alone — place at origin, angle 0, so it
        // is at least visible and editable rather than silently dropped.
        page.items.push(toPlacedItem(unit, footprints[0], 0, 0))
      }
    }

    done++
    onProgress?.({ done, total })
  }

  if (pages.length === 0) openPage()

  return pages.map((p, index) => ({
    index,
    items: p.items,
    usedHeightCm: usedLengthCm(p.items),
  }))
}
