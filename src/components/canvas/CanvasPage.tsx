import { useEffect, useRef } from 'react'
import * as fabric from 'fabric'
import { CANVAS_WIDTH_CM } from '@/lib/constants'
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
  maxHeightCm: number
  pxPerCm: number
  onSelectionChange: (sel: SelectionInfo | null) => void
}

// Fabric objects carry the source PlacedItem id so edits map back to the store.
type TaggedImage = fabric.FabricImage & { itemId?: string }

export default function CanvasPage({
  page,
  maxHeightCm,
  pxPerCm,
  onSelectionChange,
}: CanvasPageProps) {
  const canvasElRef = useRef<HTMLCanvasElement>(null)
  const fabricRef = useRef<fabric.Canvas | null>(null)
  const updatePlacedItem = useGangSheetStore((s) => s.updatePlacedItem)

  const widthPx = CANVAS_WIDTH_CM * pxPerCm
  const heightPx = maxHeightCm * pxPerCm

  // (Re)create the Fabric canvas whenever the pixel dimensions change (zoom / max height).
  useEffect(() => {
    if (!canvasElRef.current) return

    const canvas = new fabric.Canvas(canvasElRef.current, {
      width: widthPx,
      height: heightPx,
      selection: false, // single-object selection only, no rubber-band group select
      uniformScaling: false, // free distort by default; hold Shift for proportional
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

    const reportSelection = () => {
      const obj = canvas.getActiveObject() as TaggedImage | undefined
      if (!obj?.itemId) {
        onSelectionChange(null)
        return
      }
      onSelectionChange({
        pageIndex,
        itemId: obj.itemId,
        widthCm: obj.getScaledWidth() / pxPerCm,
        heightCm: obj.getScaledHeight() / pxPerCm,
        angle: obj.angle ?? 0,
      })
    }

    // Keep the (possibly rotated) bounding box inside the sheet.
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
      updatePlacedItem(pageIndex, obj.itemId, {
        xCm: (obj.left ?? 0) / pxPerCm,
        yCm: (obj.top ?? 0) / pxPerCm,
        widthCm: obj.getScaledWidth() / pxPerCm,
        heightCm: obj.getScaledHeight() / pxPerCm,
        angle: obj.angle ?? 0,
      })
    }

    canvas.on('selection:created', reportSelection)
    canvas.on('selection:updated', reportSelection)
    canvas.on('selection:cleared', () => onSelectionChange(null))
    canvas.on('object:moving', onMoving)
    canvas.on('object:scaling', onScaling)
    canvas.on('object:rotating', onRotating)
    canvas.on('object:modified', onModified)

    let cancelled = false
    canvas.clear()

    Promise.all(
      page.items.map((item) =>
        fabric.FabricImage.fromURL(item.previewUrl, { crossOrigin: 'anonymous' }).then((img) => {
          const targetWidthPx = item.widthCm * pxPerCm
          const targetHeightPx = item.heightCm * pxPerCm
          img.set({
            left: item.xCm * pxPerCm,
            top: item.yCm * pxPerCm,
            originX: 'left',
            originY: 'top',
            angle: item.angle ?? 0,
            scaleX: targetWidthPx / (img.width ?? targetWidthPx),
            scaleY: targetHeightPx / (img.height ?? targetHeightPx),
            selectable: true,
            evented: true,
            cornerColor: '#0ea5e9',
            cornerStrokeColor: '#0369a1',
            borderColor: '#0ea5e9',
            cornerSize: 10,
            transparentCorners: false,
          })
          ;(img as TaggedImage).itemId = item.id
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

  return (
    <div
      className="gang-canvas-grid relative border bg-white shadow-sm"
      style={{
        width: widthPx,
        height: heightPx,
        backgroundSize: `${pxPerCm}px ${pxPerCm}px`,
      }}
    >
      <canvas ref={canvasElRef} />
    </div>
  )
}
