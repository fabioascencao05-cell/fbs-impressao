import { EXPORT_PX_PER_CM } from './constants'

export const PRINT_TARGET_DPI = 300

export function defaultPrintWidthCm(contentWidthPx: number): number {
  if (!Number.isFinite(contentWidthPx) || contentWidthPx <= 0) return 0.1
  // Preserve the exact physical size at 300 DPI. Rounding belongs only in
  // the display; rounding down here used to shrink every metadata-free import.
  return contentWidthPx / EXPORT_PX_PER_CM
}

export function effectivePrintDpi(contentWidthPx: number, widthCm: number): number {
  if (!Number.isFinite(contentWidthPx) || !Number.isFinite(widthCm) || contentWidthPx <= 0 || widthCm <= 0) return 0
  return (contentWidthPx / widthCm) * 2.54
}

export function isPrintReadyDpi(dpi: number): boolean {
  return Number.isFinite(dpi) && dpi + Number.EPSILON >= PRINT_TARGET_DPI
}

export function minimumEffectivePrintDpi(contentWidthPx: number, widthsCm: number[]): number {
  if (widthsCm.length === 0) return 0
  return Math.min(...widthsCm.map((widthCm) => effectivePrintDpi(contentWidthPx, widthCm)))
}
