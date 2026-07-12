import { useEffect, useRef, useState } from 'react'
import * as fabric from 'fabric'
import { Copy, X } from 'lucide-react'
import { useGangSheetStore } from '@/store/useGangSheetStore'
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

interface ContentBox {
  contentXPx: number
  contentYPx: number
  contentWidthPx: number
  contentHeightPx: number
}

interface HudInfo {
  left: number
  top: number
  widthCm: number
  heightCm: number
  angle: number
}

// Fabric objects carry the source PlacedItem id + its content bounding box
// (in the original file's px space) so edits map back to the store using
// the visible artwork's rect, not the full (possibly padded) image file.
type TaggedImage = fabric.FabricImage & { itemId?: string; contentBox?: ContentBox }

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
  const removePlacedItem = useGangSheetStore((s) => s.removePlacedItem)
  const duplicatePlacedItem = useGangSheetStore((s) => s.duplicatePlacedItem)
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

    // Content-box dims/position in cm, derived from the object's own scale —
    // works whether the item just loaded or the user is mid-resize.
    const contentRectCm = (obj: TaggedImage) => {
      const box = obj.contentBox
      if (!box) return null
      const scaleX = obj.scaleX ?? 1
      const scaleY = obj.scaleY ?? 1
      return {
        widthCm: (box.contentWidthPx * scaleX) / pxPerCm,
        heightCm: (box.contentHeightPx * scaleY) / pxPerCm,
        xCm: ((obj.left ?? 0) + box.contentXPx * scaleX) / pxPerCm,
        yCm: ((obj.top ?? 0) + box.contentYPx * scaleY) / pxPerCm,
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
          // item.xCm/yCm/widthCm/heightCm describe the visible content box, not
          // the whole (possibly padded) file — scale/position the full image so
          // its content box lands exactly on that rect.
          const scale = (item.widthCm * pxPerCm) / item.contentWidthPx
          const fabricLeft = item.xCm * pxPerCm - item.contentXPx * scale
          const fabricTop = item.yCm * pxPerCm - item.contentYPx * scale
          img.set({
            left: fabricLeft,
            top: fabricTop,
            originX: 'left',
            originY: 'top',
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
          tagged.contentBox = {
            contentXPx: item.contentXPx,
            contentYPx: item.contentYPx,
            contentWidthPx: item.contentWidthPx,
            contentHeightPx: item.contentHeightPx,
          }
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

      {/* Action buttons per item (duplicate + delete), always available without selecting. */}
      {page.items.map((item) => (
        <div key={item.id} className="absolute z-10 flex gap-0.5" style={{
          left: (item.xCm + item.widthCm) * pxPerCm - 26,
          top: item.yCm * pxPerCm - 10,
        }}>
          <button
            type="button"
            title="Duplicar esta arte"
            className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground opacity-60 shadow transition-opacity hover:opacity-100"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation()
              duplicatePlacedItem(page.index, item.id)
            }}
          >
            <Copy className="h-3 w-3" />
          </button>
          <button
            type="button"
            title="Excluir esta arte"
            className="flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-destructive-foreground opacity-60 shadow transition-opacity hover:opacity-100"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation()
              removePlacedItem(page.index, item.id)
            }}
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      ))}

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
