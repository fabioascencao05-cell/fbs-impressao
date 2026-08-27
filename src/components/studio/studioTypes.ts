export interface StudioAsset {
  id: string
  name: string
  /** Object URL of the untouched upload (kept for the before/after view). */
  originalUrl: string
  /** Current processed result (starts equal to the upload). */
  resultBlob: Blob
  resultUrl: string
  /** Last vectorization output, if any — downloadable as .svg for CorelDRAW. */
  svg: string | null
  /** Distinguishes an uploaded SVG from a raster image traced by the Studio. */
  vectorSource: 'original' | 'traced' | null
  /** Number of visible vector paths, useful to show that a tracing really completed. */
  vectorPathCount: number | null
  /** Editable dot SVG created by the one-colour halftone tool, if practical. */
  halftoneSvg: string | null
  width: number
  height: number
  /** Non-null while an operation runs; holds a human label for the spinner. */
  busy: string | null
  /** 0..1 progress for long operations (background model download), else null. */
  progress: number | null
}
