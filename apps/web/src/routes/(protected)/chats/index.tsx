import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/(protected)/chats/')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/(protected)/chats/"!</div>
}
