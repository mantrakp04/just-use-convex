import { createFileRoute } from '@tanstack/react-router'
import { useForm } from "@tanstack/react-form";
import { z } from "zod";
import { format } from "date-fns";
import { Trash2Icon } from "lucide-react";

import {
  useMembers,
  useInvitations,
  useActiveMember,
  ROLES,
  getInitials,
  canManageRole,
  type MemberRole,
} from "@/hooks/auth/organization";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { Separator } from "@/components/ui/separator";

export const Route = createFileRoute(
  '/(protected)/settings/organization/members',
)({
  component: MembersTab,
})

function MembersTab() {
  const { members, isPending, inviteMember, removeMember, updateMemberRole } = useMembers();
  const { invitations, cancelInvitation } = useInvitations();
  const { currentUserRole } = useActiveMember();

  const inviteForm = useForm({
    defaultValues: {
      email: "",
      role: "member",
    },
    onSubmit: async ({ value }) => {
      await inviteMember(value.email, value.role as MemberRole);
      inviteForm.reset();
    },
    validators: {
      onSubmit: z.object({
        email: z.email("Please enter a valid email address"),
        role: z.string().min(1, "Please select a role"),
      }),
    },
  });

  const canManage = (targetRole: string) => canManageRole(currentUserRole, targetRole);
  const pendingInvitations = invitations.filter((inv) => inv.status === "pending");

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Invite Member</CardTitle>
          <CardDescription>Send an invitation to add a new member to your organization</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={async (e) => {
              e.stopPropagation();
              await inviteForm.handleSubmit();
            }}
            className="flex flex-col gap-2"
          >
            <div className="flex gap-2">
              <inviteForm.Field name="email">
                {(field) => (
                  <div className="flex flex-1 flex-col gap-1.5">
                    <Label htmlFor={field.name}>Email</Label>
                    <Input
                      id={field.name}
                      name={field.name}
                      type="email"
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(e) => field.handleChange(e.target.value)}
                      placeholder="member@example.com"
                    />
                    {field.state.meta.errors.map((error) => (
                      <p key={error?.message} className="text-destructive text-xs">
                        {error?.message}
                      </p>
                    ))}
                  </div>
                )}
              </inviteForm.Field>

              <inviteForm.Field name="role">
                {(field) => (
                  <div className="flex w-32 flex-col gap-1.5">
                    <Label htmlFor={field.name}>Role</Label>
                    <Select value={field.state.value} onValueChange={(value) => value && field.handleChange(value)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select role" />
                      </SelectTrigger>
                      <SelectContent>
                        {ROLES.filter((role) => canManage(role.value) || role.value === "member").map((role) => (
                          <SelectItem key={role.value} value={role.value}>
                            {role.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {field.state.meta.errors.map((error) => (
                      <p key={error?.message} className="text-destructive text-xs">
                        {error?.message}
                      </p>
                    ))}
                  </div>
                )}
              </inviteForm.Field>
            </div>

            <inviteForm.Subscribe>
              {(state) => (
                <Button type="submit" className="w-fit" disabled={!state.canSubmit || state.isSubmitting}>
                  {state.isSubmitting ? "Sending..." : "Send Invitation"}
                </Button>
              )}
            </inviteForm.Subscribe>
          </form>
        </CardContent>
      </Card>

      <Separator />

      <Card>
        <CardHeader>
          <CardTitle>Members</CardTitle>
          <CardDescription>Manage the members of your organization</CardDescription>
        </CardHeader>
        <CardContent>
          {isPending && members.length === 0 ? (
            <p className="text-muted-foreground text-sm">Loading members...</p>
          ) : members.length === 0 ? (
            <p className="text-muted-foreground text-sm">No members found</p>
          ) : (
            <div className="flex flex-col divide-y">
              {members.map((member) => (
                <div key={member.id} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
                  <div className="flex items-center gap-3">
                    <Avatar size="sm">
                      <AvatarImage src={member.user.image ?? undefined} alt={member.user.name} />
                      <AvatarFallback>{getInitials(member.user.name)}</AvatarFallback>
                    </Avatar>
                    <div className="flex flex-col">
                      <span className="text-sm font-medium">{member.user.name}</span>
                      <span className="text-muted-foreground text-xs">{member.user.email}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-muted-foreground text-xs">
                      {format(new Date(member.createdAt), "MMM d, yyyy")}
                    </span>
                    {canManage(member.role) ? (
                      <Select
                        value={member.role}
                        onValueChange={(newRole) => newRole && updateMemberRole(member.id, newRole as MemberRole)}
                      >
                        <SelectTrigger className="w-24">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {ROLES.filter((role) => canManage(role.value) || role.value === member.role).map(
                            (role) => (
                              <SelectItem key={role.value} value={role.value}>
                                {role.label}
                              </SelectItem>
                            )
                          )}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Badge variant="secondary" className="capitalize">
                        {member.role}
                      </Badge>
                    )}
                    {canManage(member.role) && (
                      <AlertDialog>
                        <AlertDialogTrigger render={<Button variant="ghost" size="icon-sm" />}>
                          <Trash2Icon className="size-3.5" />
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Remove Member</AlertDialogTitle>
                            <AlertDialogDescription>
                              Are you sure you want to remove <strong>{member.user.name}</strong> from the
                              organization? They will lose access to all organization resources.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => removeMember(member.id)}
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                              Remove
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {pendingInvitations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Pending Invitations</CardTitle>
            <CardDescription>Invitations that are waiting to be accepted</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col divide-y">
              {pendingInvitations.map((invitation) => (
                <div key={invitation.id} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
                  <div className="flex items-center gap-3">
                    <Avatar size="sm">
                      <AvatarFallback>{invitation.email[0].toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <div className="flex flex-col">
                      <span className="text-sm font-medium">{invitation.email}</span>
                      <span className="text-muted-foreground text-xs capitalize">{invitation.role}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge variant="outline">Pending</Badge>
                    <span className="text-muted-foreground text-xs">
                      {format(new Date(invitation.createdAt), "MMM d, yyyy")}
                    </span>
                    <AlertDialog>
                      <AlertDialogTrigger render={<Button variant="ghost" size="icon-sm" />}>
                        <Trash2Icon className="size-3.5" />
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Cancel Invitation</AlertDialogTitle>
                          <AlertDialogDescription>
                            Are you sure you want to cancel the invitation for <strong>{invitation.email}</strong>?
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Keep Invitation</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => cancelInvitation(invitation.id)}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          >
                            Cancel Invitation
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
