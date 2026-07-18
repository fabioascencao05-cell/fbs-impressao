import { memo } from 'react'
import { DISPLAY_PX_PER_CM } from '@/lib/constants'

interface RulerProps {
  orientation: 'horizontal' | 'vertical'
  lengthCm: number
  pxPerCm?: number
}

function Ruler({ orientation, lengthCm, pxPerCm = DISPLAY_PX_PER_CM }: RulerProps) {
  const marks = Array.from({ length: Math.floor(lengthCm) + 1 }, (_, i) => i)
  const isHorizontal = orientation === 'horizontal'

  // Thin out labels/ticks when zoomed far out so they don't collide.
  const labelEvery = pxPerCm < 14 ? 10 : 5

  return (
    <div
      className={
        isHorizontal
          ? 'relative h-5 border-b bg-muted/60'
          : 'relative w-5 border-r bg-muted/60'
      }
      style={
        isHorizontal
          ? { width: lengthCm * pxPerCm }
          : { height: lengthCm * pxPerCm }
      }
    >
      {marks.map((cm) => (
        <div
          key={cm}
          className="absolute text-muted-foreground"
          style={
            isHorizontal
              ? { left: cm * pxPerCm, top: 0 }
              : { top: cm * pxPerCm, left: 0 }
          }
        >
          <div className={isHorizontal ? 'h-1.5 w-px bg-border' : 'h-px w-1.5 bg-border'} />
          {cm % labelEvery === 0 && (
            <span
              className={
                isHorizontal
                  ? 'absolute left-0.5 top-1.5 text-[9px]'
                  : 'absolute left-1.5 top-0 text-[9px]'
              }
            >
              {cm}
            </span>
          )}
        </div>
      ))}
    </div>
  )
}

export default memo(Ruler)
