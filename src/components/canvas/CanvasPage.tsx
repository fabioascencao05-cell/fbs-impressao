import { useEffect, useRef } from 'react'
import * as fabric from 'fabric'
import { CANVAS_WIDTH_CM, DISPLAY_PX_PER_CM } from '@/lib/constants'
import type { PackedPage } from '@/types'

interface CanvasPageProps {
  page: PackedPage
  maxHeightCm: number
}

export default function CanvasPage({ page, maxHeightCm }: CanvasPageProps) {
  const canvasElRef = useRef<HTMLCanvasElement>(null)
  const fabricRef = useRef<fabric.Canvas | null>(null)

  const widthPx = CANVAS_WIDTH_CM * DISPLAY_PX_PER_CM
  const heightPx = maxHeightCm * DISPLAY_PX_PER_CM

  useEffect(() => {
    if (!canvasElRef.current) return

    const canvas = new fabric.Canvas(canvasElRef.current, {
      width: widthPx,
      height: heightPx,
      selection: false,
      backgroundColor: 'transparent',
    })
    fabricRef.current = canvas

    return () => {
      canvas.dispose()
      fabricRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [widthPx, heightPx])

  useEffect(() => {
    const canvas = fabricRef.current
    if (!canvas) return

    canvas.clear()

    let cancelled = false

    Promise.all(
      page.items.map((item) =>
        fabric.FabricImage.fromURL(item.previewUrl, { crossOrigin: 'anonymous' }).then((img) => {
          const targetWidthPx = item.widthCm * DISPLAY_PX_PER_CM
          const targetHeightPx = item.heightCm * DISPLAY_PX_PER_CM
          img.set({
            left: item.xCm * DISPLAY_PX_PER_CM,
            top: item.yCm * DISPLAY_PX_PER_CM,
            scaleX: targetWidthPx / (img.width ?? targetWidthPx),
            scaleY: targetHeightPx / (img.height ?? targetHeightPx),
            selectable: false,
            evented: false,
          })
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
    }
  }, [page])

  return (
    <div
      className="gang-canvas-grid relative border bg-white shadow-sm"
      style={{
        width: widthPx,
        height: heightPx,
        backgroundSize: `${DISPLAY_PX_PER_CM}px ${DISPLAY_PX_PER_CM}px`,
      }}
    >
      <canvas ref={canvasElRef} />
    </div>
  )
}
