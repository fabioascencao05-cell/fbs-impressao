import Sidebar from '@/components/sidebar/Sidebar'
import CanvasWorkspace from '@/components/canvas/CanvasWorkspace'

export default function AppLayout() {
  return (
    <div className="flex h-screen w-full overflow-hidden">
      <Sidebar />
      <CanvasWorkspace />
    </div>
  )
}
