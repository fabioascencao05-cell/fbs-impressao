import { useState } from 'react'
import { Menu, Layers } from 'lucide-react'
import Sidebar from '@/components/sidebar/Sidebar'
import CanvasWorkspace from '@/components/canvas/CanvasWorkspace'
import { Button } from '@/components/ui/button'

export default function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)

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
        className={`fixed inset-y-0 left-0 z-50 w-[85vw] max-w-[340px] transition-transform duration-200 md:static md:z-auto md:w-auto md:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <Sidebar onClose={() => setSidebarOpen(false)} />
      </div>

      <CanvasWorkspace />
    </div>
  )
}
