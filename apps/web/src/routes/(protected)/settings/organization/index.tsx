import { useState, useEffect } from "react";
import { createFileRoute } from '@tanstack/react-router'
import { useForm } from "@tanstack/react-form";
import { z } from "zod";

import { useOrganization, normalizeSlug } from "@/hooks/auth/organization";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute('/(protected)/settings/organization/')({
  component: OrganizationTab,
})

function OrganizationTab() {
  const { organization, isPending, updateOrganization, deleteOrganization, isDeleting } = useOrganization();
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

  const form = useForm({
    defaultValues: {
      name: organization?.name ?? "",
      slug: organization?.slug ?? "",
    },
    onSubmit: async ({ value }) => {
      await updateOrganization(value);
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

  useEffect(() => {
    if (organization) {
      form.setFieldValue("name", organization.name);
      form.setFieldValue("slug", organization.slug);
    }
  }, [organization, form]);

  const handleDelete = async () => {
    if (!organization?.id) return;
    await deleteOrganization(organization.id);
    setIsDeleteDialogOpen(false);
  };

  if (isPending && !organization) {
    return (
      <div className="flex items-center justify-center p-8">
        <p className="text-muted-foreground">Loading organization...</p>
      </div>
    );
  }

  if (!organization) {
    return (
      <div className="flex items-center justify-center p-8">
        <p className="text-muted-foreground">No organization selected</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Organization Details</CardTitle>
          <CardDescription>Update your organization's information</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              e.stopPropagation();
              await form.handleSubmit();
            }}
            className="flex flex-col gap-2"
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
                    onChange={(e) => field.handleChange(e.target.value)}
                    placeholder="Organization name"
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
                    placeholder="organization-slug"
                  />
                  {field.state.meta.errors.map((error) => (
                    <p key={error?.message} className="text-destructive text-xs">
                      {error?.message}
                    </p>
                  ))}
                </div>
              )}
            </form.Field>

            <form.Subscribe>
              {(state) => (
                <Button type="submit" className="w-fit" disabled={!state.canSubmit || state.isSubmitting}>
                  {state.isSubmitting ? "Saving..." : "Save Changes"}
                </Button>
              )}
            </form.Subscribe>
          </form>
        </CardContent>
      </Card>

      <Separator />

      <Card className="border-destructive/50">
        <CardHeader>
          <CardTitle className="text-destructive">Danger Zone</CardTitle>
          <CardDescription>
            Permanently delete this organization and all of its data. This action cannot be undone.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
            <AlertDialogTrigger render={<Button variant="destructive" disabled={isDeleting} />}>
              {isDeleting ? "Deleting..." : "Delete Organization"}
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                <AlertDialogDescription>
                  This action cannot be undone. This will permanently delete the organization{" "}
                  <strong>{organization.name}</strong> and remove all associated data including members, teams, and
                  invitations.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                  Delete Organization
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardContent>
      </Card>
    </div>
  );
}
