import type { Todo } from "@/hooks/use-todos";
import type { Member, Team } from "@/hooks/auth/organization/types";
import { getInitials } from "@/hooks/auth/organization/utils";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarImage, AvatarFallback, AvatarGroup } from "@/components/ui/avatar";
import { Calendar, Clock, User, Users } from "lucide-react";
import { statusLabels, statusIcons, priorityColors } from "@/components/dashboard";

interface TodoViewProps {
  todo: Todo;
  creator: Member | null;
  assignedTeam: Team | null;
  assignedUsersDetails: Member[];
  formatDate: (timestamp: number) => string;
}

export function TodoView({
  todo,
  creator,
  assignedTeam,
  assignedUsersDetails,
  formatDate,
}: TodoViewProps) {
  const currentStatus = todo.status ?? "todo";
  const currentPriority = todo.priority ?? "medium";
  const StatusIcon = statusIcons[currentStatus];

  return (
    <>
      <div className="flex items-start gap-3">
        <StatusIcon
          className={`size-5 mt-0.5 ${
            currentStatus === "done"
              ? "text-primary"
              : currentStatus === "in_progress"
                ? "text-[var(--color-chart-2)]"
                : "text-muted-foreground"
          }`}
        />
        <div className="flex-1">
          <h3
            className={`font-medium ${
              currentStatus === "done" ? "line-through text-muted-foreground" : ""
            }`}
          >
            {todo.title}
          </h3>
        </div>
      </div>

      <div className="flex gap-2 pl-8">
        <Badge variant="outline">{statusLabels[currentStatus]}</Badge>
        <Badge variant={priorityColors[currentPriority]}>{currentPriority}</Badge>
      </div>

      {todo.description && (
        <div className="pl-8">
          <p className="text-muted-foreground text-sm whitespace-pre-wrap">
            {todo.description}
          </p>
        </div>
      )}

      {creator && (
        <div className="flex items-center gap-2 pl-8">
          <User className="size-3 text-muted-foreground" />
          <span className="text-muted-foreground text-xs">Created by:</span>
          <Avatar size="sm">
            <AvatarImage src={creator.user.image ?? undefined} />
            <AvatarFallback>{getInitials(creator.user.name)}</AvatarFallback>
          </Avatar>
          <span className="text-sm">{creator.user.name || creator.user.email}</span>
        </div>
      )}

      {assignedTeam && (
        <div className="flex items-center gap-2 pl-8">
          <Users className="size-3 text-muted-foreground" />
          <span className="text-muted-foreground text-xs">Team:</span>
          <Badge variant="outline">{assignedTeam.name}</Badge>
        </div>
      )}

      {assignedUsersDetails.length > 0 && (
        <div className="flex items-center gap-2 pl-8">
          <User className="size-3 text-muted-foreground" />
          <span className="text-muted-foreground text-xs">Assigned to:</span>
          <AvatarGroup>
            {assignedUsersDetails.slice(0, 5).map((member) => (
              <Avatar
                key={member.id}
                size="sm"
                title={member.user.name || member.user.email || undefined}
              >
                <AvatarImage src={member.user.image ?? undefined} />
                <AvatarFallback>{getInitials(member.user.name)}</AvatarFallback>
              </Avatar>
            ))}
          </AvatarGroup>
          {assignedUsersDetails.length > 5 && (
            <span className="text-xs text-muted-foreground">
              +{assignedUsersDetails.length - 5} more
            </span>
          )}
          {assignedUsersDetails.length <= 2 && (
            <span className="text-sm">
              {assignedUsersDetails.map((m) => m.user.name || m.user.email).join(", ")}
            </span>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-3 text-muted-foreground text-xs pl-8">
        {todo.dueDate && (
          <span className="flex items-center gap-1">
            <Calendar className="size-3" />
            Due: {new Date(todo.dueDate).toLocaleDateString()}
          </span>
        )}
        <span className="flex items-center gap-1">
          <Clock className="size-3" />
          Updated: {formatDate(todo.updatedAt)}
        </span>
      </div>
    </>
  );
}
