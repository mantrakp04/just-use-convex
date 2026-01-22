import { useState } from "react";
import { useForm } from "@tanstack/react-form";
import { z } from "zod";
import { BuildingIcon, CheckIcon, ChevronDownIcon, PlusIcon, XIcon } from "lucide-react";

import {
  useActiveOrganization,
  useCreateOrganization,
  useOrganizations,
  useUserInvitations,
  normalizeSlug,
} from "@/hooks/auth/organization";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

function CreateOrganizationDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { createOrganization, isPending } = useCreateOrganization();

  const form = useForm({
    defaultValues: {
      name: "",
      slug: "",
    },
    onSubmit: async ({ value }) => {
      const result = await createOrganization(value);
      if (result) {
        form.reset();
        onOpenChange(false);
      }
    },
    validators: {
      onSubmit: z.object({
        name: z.string().min(2, "Name must be at least 2 characters"),
        slug: z
          .string()
          .min(2, "Slug must be at least 2 characters")
          .regex(/^[a-z0-9-]+$/, "Slug must only contain lowercase letters, numbers, and hyphens"),
      }),
    },
  });

  const handleNameChange = (value: string) => {
    form.setFieldValue("name", value);
    const currentSlug = form.getFieldValue("slug");
    const currentNameSlug = normalizeSlug(form.getFieldValue("name"));
    if (!currentSlug || currentSlug === currentNameSlug) {
      form.setFieldValue("slug", normalizeSlug(value));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Organization</DialogTitle>
          <DialogDescription>Create a new organization to manage your team</DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            e.stopPropagation();
            form.handleSubmit();
          }}
          className="flex flex-col gap-4"
        >
          <form.Field name="name">
            {(field) => (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={field.name}>Name</Label>
                <Input
                  id={field.name}
                  name={field.name}
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(e) => handleNameChange(e.target.value)}
                  placeholder="My Organization"
                />
                {field.state.meta.errors.map((error) => (
                  <p key={error?.message} className="text-destructive text-xs">
                    {error?.message}
                  </p>
                ))}
              </div>
            )}
          </form.Field>

          <form.Field name="slug">
            {(field) => (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={field.name}>Slug</Label>
                <Input
                  id={field.name}
                  name={field.name}
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(normalizeSlug(e.target.value))}
                  placeholder="my-organization"
                />
                {field.state.meta.errors.map((error) => (
                  <p key={error?.message} className="text-destructive text-xs">
                    {error?.message}
                  </p>
                ))}
              </div>
            )}
          </form.Field>

          <DialogFooter>
            <form.Subscribe>
              {(state) => (
                <Button
                  type="submit"
                  disabled={!state.canSubmit || state.isSubmitting || isPending}
                >
                  {state.isSubmitting || isPending ? "Creating..." : "Create Organization"}
                </Button>
              )}
            </form.Subscribe>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function OrganizationListDropdown() {
  const { organizations } = useOrganizations();
  const { activeOrganization, setActiveOrganization } = useActiveOrganization();
  const { invitations, acceptInvitation, rejectInvitation } = useUserInvitations();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);

  const pendingInvitations = invitations.filter((inv) => inv.status === "pending");

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" />}>
        <div className="flex items-center gap-2">
          <BuildingIcon className="size-4" />
          <span className="truncate">{activeOrganization?.data?.name ?? "Select Organization"}</span>
        </div>
        <ChevronDownIcon className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Organizations</DropdownMenuLabel>
          {organizations.length === 0 ? (
            <DropdownMenuItem disabled>No organizations</DropdownMenuItem>
          ) : (
            organizations.map((org) => (
              <DropdownMenuItem
                key={org.id}
                onClick={() => setActiveOrganization.mutateAsync(org.id)}
                className="justify-between"
              >
                <span className="truncate">{org.name}</span>
                {activeOrganization?.data?.id === org.id && <CheckIcon className="size-4" />}
              </DropdownMenuItem>
            ))
          )}
        </DropdownMenuGroup>

        {pendingInvitations.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuLabel>Invitations</DropdownMenuLabel>
              {pendingInvitations.map((invitation) => (
                <DropdownMenuItem
                  key={invitation.id}
                  className="flex-col items-start gap-2"
                  onSelect={(e) => e.preventDefault()}
                >
                  <div className="flex w-full items-center justify-between">
                    <span className="truncate text-sm">{invitation.organization?.name ?? "Unknown Organization"}</span>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        onClick={(e) => {
                          e.stopPropagation();
                          acceptInvitation(invitation.id);
                        }}
                        className="text-green-600 hover:text-green-700 hover:bg-green-50"
                      >
                        <CheckIcon className="size-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        onClick={(e) => {
                          e.stopPropagation();
                          rejectInvitation(invitation.id);
                        }}
                        className="text-destructive hover:text-destructive hover:bg-destructive/10"
                      >
                        <XIcon className="size-3" />
                      </Button>
                    </div>
                  </div>
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
          </>
        )}

        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => setCreateDialogOpen(true)}>
          <PlusIcon className="size-3.5" />
          New Organization
        </DropdownMenuItem>
      </DropdownMenuContent>

      <CreateOrganizationDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
      />
    </DropdownMenu>
  );
}
