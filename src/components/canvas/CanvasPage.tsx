import { useEffect, useRef, useState } from 'react'
import * as fabric from 'fabric'
import { useGangSheetStore } from '@/store/useGangSheetStore'
import { rotatedAabbCm } from '@/lib/geometry'
import type { PackedPage } from '@/types'

export interface SelectionInfo {
  pageIndex: number
  itemId: string
  widthCm: number
  heightCm: number
  angle: number
}

interface CanvasPageProps {
  page: PackedPage
  canvasWidthCm: number
  maxHeightCm: number
  pxPerCm: number
  onSelectionChange: (sel: SelectionInfo | null) => void
}

interface HudInfo {
  left: number
  top: number
  widthCm: number
  heightCm: number
  angle: number
}

// Fabric objects are tagged with the source PlacedItem id so selection/resize
// events map straight back to the store entry they came from.
type TaggedImage = fabric.FabricImage & { itemId?: string }

const BACKGROUND_PRESETS: Record<string, string> = {
  checkerboard:
    'conic-gradient(#e5e5e5 0deg 90deg, #ffffff 90deg 180deg, #e5e5e5 180deg 270deg, #ffffff 270deg 360deg)',
}

export default function CanvasPage({
  page,
  canvasWidthCm,
  maxHeightCm,
  pxPerCm,
  onSelectionChange,
}: CanvasPageProps) {
  const canvasElRef = useRef<HTMLCanvasElement>(null)
  const fabricRef = useRef<fabric.Canvas | null>(null)
  const updatePlacedItem = useGangSheetStore((s) => s.updatePlacedItem)
  const sheetBackgroundColor = useGangSheetStore((s) => s.sheetBackgroundColor)
  const [hud, setHud] = useState<HudInfo | null>(null)

  const widthPx = canvasWidthCm * pxPerCm
  const heightPx = maxHeightCm * pxPerCm

  // (Re)create the Fabric canvas whenever the pixel dimensions change (zoom / max height).
  useEffect(() => {
    if (!canvasElRef.current) return

    const canvas = new fabric.Canvas(canvasElRef.current, {
      width: widthPx,
      height: heightPx,
      selection: false, // single-object selection only, no rubber-band group select
      uniformScaling: true, // corner-drag always keeps aspect ratio
      uniScaleKey: undefined, // no modifier key ever unlocks free distortion
      preserveObjectStacking: true,
      backgroundColor: 'transparent',
    })
    fabricRef.current = canvas

    return () => {
      canvas.dispose()
      fabricRef.current = null
    }
  }, [widthPx, heightPx])

  // Rebuild objects + rebind handlers when the page data or scale changes.
  useEffect(() => {
    const canvas = fabricRef.current
    if (!canvas) return

    const pageIndex = page.index

    // Real (unrotated) art size + bounding-box top-left in cm, read straight
    // from the Fabric object. The image is cropped to its content box and uses a
    // centre origin, so getScaledWidth/Height give the true art size (rotation
    // aside) and getBoundingRect gives the padding-free box on the sheet — this
    // stays correct whether the item just loaded, is mid-resize or mid-rotate.
    const contentRectCm = (obj: TaggedImage) => {
      obj.setCoords()
      const br = obj.getBoundingRect()
      return {
        widthCm: obj.getScaledWidth() / pxPerCm,
        heightCm: obj.getScaledHeight() / pxPerCm,
        xCm: br.left / pxPerCm,
        yCm: br.top / pxPerCm,
      }
    }

    const reportSelection = () => {
      const obj = canvas.getActiveObject() as TaggedImage | undefined
      if (!obj?.itemId) {
        onSelectionChange(null)
        setHud(null)
        return
      }
      const rect = contentRectCm(obj)
      const widthCm = rect?.widthCm ?? obj.getScaledWidth() / pxPerCm
      const heightCm = rect?.heightCm ?? obj.getScaledHeight() / pxPerCm
      const angle = obj.angle ?? 0
      onSelectionChange({ pageIndex, itemId: obj.itemId, widthCm, heightCm, angle })

      // Position the CorelDraw-style dimension readout above the object's
      // (rotated) bounding box — same coordinate space as the canvas element.
      obj.setCoords()
      const br = obj.getBoundingRect()
      setHud({ left: br.left + br.width / 2, top: br.top, widthCm, heightCm, angle })
    }

    // Keep the (possibly rotated) bounding box of the whole image — padding
    // included — inside the sheet. Slightly conservative (won't let padding
    // bleed past the edge), but simple and always safe.
    const clampToSheet = (obj: fabric.FabricObject) => {
      obj.setCoords()
      const br = obj.getBoundingRect()
      let dx = 0
      let dy = 0
      if (br.left < 0) dx = -br.left
      if (br.top < 0) dy = -br.top
      if (br.left + br.width > widthPx) dx = widthPx - (br.left + br.width)
      if (br.top + br.height > heightPx) dy = heightPx - (br.top + br.height)
      if (dx || dy) {
        obj.left = (obj.left ?? 0) + dx
        obj.top = (obj.top ?? 0) + dy
        obj.setCoords()
      }
    }

    const onMoving = (e: { target?: fabric.FabricObject }) => {
      if (e.target) clampToSheet(e.target)
      reportSelection()
    }
    const onScaling = (e: { target?: fabric.FabricObject }) => {
      if (e.target) clampToSheet(e.target)
      reportSelection()
    }
    const onRotating = () => reportSelection()

    const onModified = (e: { target?: fabric.FabricObject }) => {
      const obj = e.target as TaggedImage | undefined
      if (!obj?.itemId) return
      clampToSheet(obj)
      const rect = contentRectCm(obj)
      if (!rect) return
      updatePlacedItem(pageIndex, obj.itemId, {
        xCm: rect.xCm,
        yCm: rect.yCm,
        widthCm: rect.widthCm,
        heightCm: rect.heightCm,
        angle: obj.angle ?? 0,
      })
    }

    canvas.on('selection:created', reportSelection)
    canvas.on('selection:updated', reportSelection)
    canvas.on('selection:cleared', () => {
      onSelectionChange(null)
      setHud(null)
    })
    canvas.on('object:moving', onMoving)
    canvas.on('object:scaling', onScaling)
    canvas.on('object:rotating', onRotating)
    canvas.on('object:modified', onModified)

    let cancelled = false
    canvas.clear()

    Promise.all(
      page.items.map((item) =>
        fabric.FabricImage.fromURL(item.previewUrl, { crossOrigin: 'anonymous' }).then((img) => {
          // Crop the file down to just its visible content box so the Fabric
          // object *is* the art (no transparent padding), then use a centre
          // origin: rotation happens in place and the on-sheet bounding box maps
          // cleanly to xCm/yCm regardless of angle.
          const scale = (item.widthCm * pxPerCm) / item.contentWidthPx
          const box = rotatedAabbCm(item.widthCm, item.heightCm, item.angle ?? 0)
          img.set({
            cropX: item.contentXPx,
            cropY: item.contentYPx,
            width: item.contentWidthPx,
            height: item.contentHeightPx,
            originX: 'center',
            originY: 'center',
            left: (item.xCm + box.wCm / 2) * pxPerCm,
            top: (item.yCm + box.hCm / 2) * pxPerCm,
            angle: item.angle ?? 0,
            scaleX: scale,
            scaleY: scale,
            selectable: true,
            evented: true,
            cornerColor: '#0ea5e9',
            cornerStrokeColor: '#0369a1',
            borderColor: '#0ea5e9',
            cornerSize: 10,
            transparentCorners: false,
          })
          // Only the 4 corners (proportional resize) + rotation stay interactive.
          img.setControlsVisibility({ ml: false, mr: false, mt: false, mb: false })
          const tagged = img as TaggedImage
          tagged.itemId = item.id
          return img
        })
      )
    ).then((images) => {
      if (cancelled) return
      images.forEach((img) => canvas.add(img))
      canvas.renderAll()
    })

    return () => {
      cancelled = true
      canvas.off('selection:created', reportSelection)
      canvas.off('selection:updated', reportSelection)
      canvas.off('selection:cleared')
      canvas.off('object:moving', onMoving)
      canvas.off('object:scaling', onScaling)
      canvas.off('object:rotating', onRotating)
      canvas.off('object:modified', onModified)
    }
  }, [page, pxPerCm, widthPx, heightPx, onSelectionChange, updatePlacedItem])

  const backgroundStyle = BACKGROUND_PRESETS[sheetBackgroundColor]
    ? { backgroundImage: BACKGROUND_PRESETS[sheetBackgroundColor], backgroundSize: '20px 20px' }
    : { backgroundColor: sheetBackgroundColor }

  return (
    <div
      className="gang-canvas-grid relative border"
      style={{
        width: widthPx,
        height: heightPx,
        backgroundSize: `${pxPerCm}px ${pxPerCm}px`,
        ...backgroundStyle,
      }}
    >
      <canvas ref={canvasElRef} />

      {/* CorelDraw-style dimension readout: floats above the selected art,
          always fully visible and updates live while moving/scaling/rotating. */}
      {hud && (
        <div
          className="pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-md bg-zinc-900/90 px-2 py-1 text-[11px] font-medium tabular-nums text-white shadow-lg dark:bg-zinc-800/95"
          style={{ left: hud.left, top: hud.top - 6 }}
        >
          {hud.widthCm.toFixed(1)} × {hud.heightCm.toFixed(1)} cm
          {hud.angle ? ` · ${Math.round(hud.angle)}°` : ''}
        </div>
      )}
    </div>
  )
}
