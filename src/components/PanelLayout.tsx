import { Outlet } from 'react-router-dom'
import { PanelSidebar } from '@/components/PanelSidebar'
import { usePersonalEdgy } from '@/hooks/usePersonalEdgy'

export function PanelLayout() {
  const { nombre } = usePersonalEdgy()

  return (
    <div className="flex">
      <PanelSidebar nombreStaff={nombre} />
      <main className="flex-1 overflow-y-auto bg-gray-50 p-8">
        <Outlet />
      </main>
    </div>
  )
}
