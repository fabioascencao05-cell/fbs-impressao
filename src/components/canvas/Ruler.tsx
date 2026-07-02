import { DISPLAY_PX_PER_CM } from '@/lib/constants'

interface RulerProps {
  orientation: 'horizontal' | 'vertical'
  lengthCm: number
}

export default function Ruler({ orientation, lengthCm }: RulerProps) {
  const marks = Array.from({ length: Math.floor(lengthCm) + 1 }, (_, i) => i)
  const isHorizontal = orientation === 'horizontal'

  return (
    <div
      className={
        isHorizontal
          ? 'relative h-5 border-b bg-muted/60'
          : 'relative w-5 border-r bg-muted/60'
      }
      style={
        isHorizontal
          ? { width: lengthCm * DISPLAY_PX_PER_CM }
          : { height: lengthCm * DISPLAY_PX_PER_CM }
      }
    >
      {marks.map((cm) => (
        <div
          key={cm}
          className="absolute text-muted-foreground"
          style={
            isHorizontal
              ? { left: cm * DISPLAY_PX_PER_CM, top: 0 }
              : { top: cm * DISPLAY_PX_PER_CM, left: 0 }
          }
        >
          <div className={isHorizontal ? 'h-1.5 w-px bg-border' : 'h-px w-1.5 bg-border'} />
          {cm % 5 === 0 && (
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
