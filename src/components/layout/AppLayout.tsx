import { useCallback, useEffect, useRef, useState } from 'react'
import { Menu, Layers } from 'lucide-react'
import Sidebar from '@/components/sidebar/Sidebar'
import CanvasWorkspace from '@/components/canvas/CanvasWorkspace'
import { Button } from '@/components/ui/button'

const SIDEBAR_MIN = 280
const SIDEBAR_MAX = 620
const SIDEBAR_DEFAULT = 340

export default function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [sidebarWidth, setSidebarWidth] = useState(SIDEBAR_DEFAULT)
  const draggingRef = useRef(false)

  // Drag the divider to grow/shrink the sidebar so nothing gets cut off.
  const onDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    draggingRef.current = true
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }, [])

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!draggingRef.current) return
      const next = Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, e.clientX))
      setSidebarWidth(next)
    }
    const onUp = () => {
      if (!draggingRef.current) return
      draggingRef.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [])

  return (
    <div className="flex h-screen w-full flex-col overflow-hidden md:flex-row">
      <div className="glass-panel flex items-center gap-2 border-b px-3 py-2 md:hidden">
        <Button variant="ghost" size="icon" onClick={() => setSidebarOpen(true)} title="Abrir menu">
          <Menu className="h-5 w-5" />
        </Button>
        <Layers className="h-4 w-4 text-primary" />
        <span className="text-sm font-semibold">Gang Sheet Builder</span>
      </div>

      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <div
        className={`fixed inset-y-0 left-0 z-50 w-[85vw] max-w-[340px] transition-transform duration-200 md:static md:z-auto md:w-auto md:max-w-none md:translate-x-0 md:transition-none ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
        style={{ ['--sidebar-w' as string]: `${sidebarWidth}px` }}
      >
        <Sidebar onClose={() => setSidebarOpen(false)} />
      </div>

      {/* Draggable divider (desktop only) — resize the sidebar with the mouse. */}
      <div
        onMouseDown={onDragStart}
        title="Arraste para redimensionar a barra lateral"
        className="hidden w-1.5 shrink-0 cursor-col-resize bg-border transition-colors hover:bg-primary md:block"
      />

      <CanvasWorkspace />
    </div>
  )
}
