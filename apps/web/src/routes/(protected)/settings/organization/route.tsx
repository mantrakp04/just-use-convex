import { Tabs, TabsTrigger, TabsList } from '@/components/ui/tabs'
import { createFileRoute, Outlet, useNavigate, useLocation } from '@tanstack/react-router'
import { useCallback } from 'react'
import OrganizationListDropdown from '@/components/auth/organization/organization-list-dropdown'

export const Route = createFileRoute('/(protected)/settings/organization')({
  component: RouteComponent,
})

function RouteComponent() {
  const navigate = useNavigate()
  const location = useLocation()

  const handleChange = useCallback((value: string) => {
    const path = value ? `/settings/organization/${value}` : '/settings/organization'
    navigate({ to: path })
  }, [navigate])

  const paths = [
    { value: '', label: 'General' },
    { value: 'members', label: 'Members' },
    { value: 'teams', label: 'Teams' },
    { value: 'attachments', label: 'Attachments' },
  ]

  // Extract the part after /settings/organization/ or empty string if just /settings/organization
  const activeTab = location.pathname === '/settings/organization' ? '' : location.pathname.split('/settings/organization/')[1] || '';

  return (
    <Tabs value={activeTab}>
      <TabsList className="w-full justify-between bg-transparent px-0">
        <div className="flex items-center gap-2 bg-muted p-1 rounded-lg">
          {paths.map(({ value, label }) => (
            <TabsTrigger key={value} value={value} onClick={() => handleChange(value)}>
              {label}
            </TabsTrigger>
          ))}
        </div>
        <OrganizationListDropdown />
      </TabsList>
      <Outlet />
    </Tabs>
  )
}
