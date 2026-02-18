import { useState } from "react";
import { createFileRoute } from '@tanstack/react-router'
import { useForm } from "@tanstack/react-form";
import { z } from "zod";
import { format } from "date-fns";
import { PlusIcon, Trash2Icon, UsersIcon } from "lucide-react";

import { useTeams, useTeamMembers, useMembers, getInitials, type Team } from "@/hooks/auth/organization";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute(
  '/(protected)/settings/organization/teams',
)({
  component: TeamsTab,
})

function CreateTeamDialog({ onCreated }: { onCreated?: () => void }) {
  const [open, setOpen] = useState(false);
  const { createTeam, isCreating } = useTeams();

  const form = useForm({
    defaultValues: {
      name: "",
    },
    onSubmit: async ({ value }) => {
      const result = await createTeam(value.name);
      if (result) {
        form.reset();
        setOpen(false);
        onCreated?.();
      }
    },
    validators: {
      onSubmit: z.object({
        name: z.string().min(2, "Team name must be at least 2 characters"),
      }),
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" />}>
        <PlusIcon className="size-3.5" />
        Create Team
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Team</DialogTitle>
          <DialogDescription>Create a new team within your organization</DialogDescription>
        </DialogHeader>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            e.stopPropagation();
            await form.handleSubmit();
          }}
          className="flex flex-col gap-4"
        >
          <form.Field name="name">
            {(field) => (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={field.name}>Team Name</Label>
                <Input
                  id={field.name}
                  name={field.name}
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                  placeholder="Engineering"
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
                <Button type="submit" disabled={!state.canSubmit || state.isSubmitting || isCreating}>
                  {state.isSubmitting || isCreating ? "Creating..." : "Create Team"}
                </Button>
              )}
            </form.Subscribe>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function TeamDetailsDialog({ team, onClose }: { team: Team; onClose: () => void }) {
  const { deleteTeam, isDeleting } = useTeams();
  const { members: teamMembers, addTeamMember, removeTeamMember } = useTeamMembers(team.id);
  const { members: orgMembers } = useMembers();

  const teamMemberIds = new Set(teamMembers.map((m) => m.userId));
  const availableMembers = orgMembers.filter((m) => !teamMemberIds.has(m.userId));

  const handleDeleteTeam = async () => {
    await deleteTeam(team.id);
    onClose();
  };

  return (
    <DialogContent className="max-w-md">
      <DialogHeader>
        <DialogTitle>{team.name}</DialogTitle>
        <DialogDescription>Manage team members and settings</DialogDescription>
      </DialogHeader>

      <div className="flex flex-col gap-4">
        <Card size="sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Add Member</CardTitle>
          </CardHeader>
          <CardContent>
            {availableMembers.length === 0 ? (
              <p className="text-muted-foreground text-xs">All organization members are already in this team</p>
            ) : (
              <Select
                value={null}
                onValueChange={(value) => {
                  if (value) {
                    addTeamMember(value, team.id);
                  }
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select a member to add" />
                </SelectTrigger>
                <SelectContent>
                  {availableMembers.map((member) => (
                    <SelectItem key={member.userId} value={member.userId}>
                      <Avatar size="sm">
                        <AvatarImage src={member.user.image ?? undefined} alt={member.user.name} />
                        <AvatarFallback>{getInitials(member.user.name)}</AvatarFallback>
                      </Avatar>
                      {member.user.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </CardContent>
        </Card>

        <Card size="sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Team Members</CardTitle>
          </CardHeader>
          <CardContent>
            {teamMembers.length === 0 ? (
              <p className="text-muted-foreground text-xs">No members in this team</p>
            ) : (
              <div className="flex flex-col divide-y">
                {teamMembers.map((member) => (
                  <div
                    key={member.id}
                    className="flex items-center justify-between py-2 first:pt-0 last:pb-0"
                  >
                    <div className="flex items-center gap-2">
                      <Avatar size="sm">
                        <AvatarImage src={member.user?.image ?? undefined} alt={member.user?.name ?? ""} />
                        <AvatarFallback>{getInitials(member.user?.name ?? "")}</AvatarFallback>
                      </Avatar>
                      <div className="flex flex-col">
                        <span className="text-xs font-medium">{member.user?.name}</span>
                        <span className="text-muted-foreground text-[10px]">
                          {format(new Date(member.createdAt), "MMM d, yyyy")}
                        </span>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => removeTeamMember(member.userId, team.id)}
                    >
                      <Trash2Icon className="size-3" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <DialogFooter className="flex-row justify-between sm:justify-between">
        <AlertDialog>
          <AlertDialogTrigger render={<Button variant="destructive" size="sm" disabled={isDeleting} />}>
            {isDeleting ? "Deleting..." : "Delete Team"}
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Team</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete <strong>{team.name}</strong>? This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDeleteTeam}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogFooter>
    </DialogContent>
  );
}

function TeamsTab() {
  const { teams, isPending } = useTeams();
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null);

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Teams</CardTitle>
              <CardDescription>Manage teams within your organization</CardDescription>
            </div>
            <CreateTeamDialog />
          </div>
        </CardHeader>
        <CardContent>
          {isPending && teams.length === 0 ? (
            <p className="text-muted-foreground text-sm">Loading teams...</p>
          ) : teams.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <UsersIcon className="text-muted-foreground mb-2 size-8" />
              <p className="text-muted-foreground text-sm">No teams yet</p>
              <p className="text-muted-foreground text-xs">Create a team to organize your members</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {teams.map((team) => (
                <Dialog key={team.id} open={selectedTeam?.id === team.id} onOpenChange={(open) => setSelectedTeam(open ? team : null)}>
                  <DialogTrigger
                    render={
                      <Card
                        size="sm"
                        className="hover:bg-muted/50 cursor-pointer transition-colors"
                      />
                    }
                  >
                    <CardContent className="flex items-center gap-3 py-3">
                      <div className="bg-muted flex size-8 items-center justify-center rounded-md">
                        <UsersIcon className="size-4" />
                      </div>
                      <div className="flex flex-col">
                        <span className="text-sm font-medium">{team.name}</span>
                        <span className="text-muted-foreground text-xs">
                          Created {format(new Date(team.createdAt), "MMM d, yyyy")}
                        </span>
                      </div>
                    </CardContent>
                  </DialogTrigger>
                  {selectedTeam?.id === team.id && (
                    <TeamDetailsDialog team={team} onClose={() => setSelectedTeam(null)} />
                  )}
                </Dialog>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
