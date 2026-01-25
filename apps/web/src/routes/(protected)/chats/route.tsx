import { createFileRoute } from '@tanstack/react-router'
import { Outlet } from '@tanstack/react-router'

export const Route = createFileRoute('/(protected)/chats')({
  component: RouteComponent,
})

function RouteComponent() {
  return (
    <div className="h-full">
      <Outlet />
    </div>
  )
}
