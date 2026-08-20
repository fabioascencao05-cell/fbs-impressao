// Default canvas width for DTF gang sheet printing (user-editable in the sidebar).
export const DEFAULT_CANVAS_WIDTH_CM = 57

// 300 DPI print resolution: 300 dots per inch / 2.54 cm per inch ≈ 118 px/cm.
export const EXPORT_PX_PER_CM = 300 / 2.54

// Lower-resolution scale used for interactive on-screen editing/preview,
// so the browser isn't rendering multi-thousand-pixel canvases while the
// user is just arranging artwork. Export always re-renders at EXPORT_PX_PER_CM.
export const DISPLAY_PX_PER_CM = 20

// Default gap left between packed images, in cm (cutting margin; user-editable).
export const DEFAULT_ITEM_GAP_CM = 0.3

export const DEFAULT_MAX_HEIGHT_CM = 100

// Browser safety limits for decoded uploads. They still allow large DTF art,
// while preventing malformed files from allocating unbounded canvas memory.
export const MAX_IMAGE_FILE_BYTES = 50 * 1024 * 1024
export const MAX_IMAGE_DIMENSION_PX = 30_000
export const MAX_IMAGE_PIXELS = 100_000_000
export const MAX_FILES_PER_BATCH = 50

// Interactive canvas zoom bounds (multiplies DISPLAY_PX_PER_CM).
export const ZOOM_MIN = 0.4
export const ZOOM_MAX = 2.5
export const ZOOM_STEP = 0.2
