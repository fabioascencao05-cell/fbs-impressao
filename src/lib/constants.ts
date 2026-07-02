// Canvas width is fixed for DTF gang sheet printing.
export const CANVAS_WIDTH_CM = 57

// 300 DPI print resolution: 300 dots per inch / 2.54 cm per inch ≈ 118 px/cm.
export const EXPORT_PX_PER_CM = 118

// Lower-resolution scale used for interactive on-screen editing/preview,
// so the browser isn't rendering multi-thousand-pixel canvases while the
// user is just arranging artwork. Export always re-renders at EXPORT_PX_PER_CM.
export const DISPLAY_PX_PER_CM = 20

// Gap left between packed images, in cm (cutting margin).
export const ITEM_GAP_CM = 0.3

export const DEFAULT_MAX_HEIGHT_CM = 100

// Interactive canvas zoom bounds (multiplies DISPLAY_PX_PER_CM).
export const ZOOM_MIN = 0.4
export const ZOOM_MAX = 2.5
export const ZOOM_STEP = 0.2
