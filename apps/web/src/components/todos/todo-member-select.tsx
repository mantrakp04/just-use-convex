import { getInitials } from "@/hooks/auth/organization/utils";
import type { Member } from "@/hooks/auth/organization/types";
import { Avatar, AvatarImage, AvatarFallback, AvatarGroup } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ChevronDown, X } from "lucide-react";

interface TodoMemberSelectProps {
  members: Member[];
  selectedUserIds: string[];
  onSelectionChange: (userIds: string[]) => void;
}

export function TodoMemberSelect({
  members,
  selectedUserIds,
  onSelectionChange,
}: TodoMemberSelectProps) {
  const selectedMembers = selectedUserIds
    .map((userId) => members.find((m) => m.userId === userId))
    .filter(Boolean) as Member[];

  const handleToggleMember = (userId: string) => {
    const isSelected = selectedUserIds.includes(userId);
    onSelectionChange(
      isSelected
        ? selectedUserIds.filter((id) => id !== userId)
        : [...selectedUserIds, userId]
    );
  };

  return (
    <Popover>
      <PopoverTrigger className="flex h-9 w-full items-center justify-between whitespace-nowrap rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs ring-offset-background placeholder:text-muted-foreground focus:outline-hidden focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50 [&>span]:line-clamp-1">
        <span className="flex items-center gap-2 overflow-hidden">
          {selectedUserIds.length === 0 ? (
            <span className="text-muted-foreground">Select members...</span>
          ) : (
            <AvatarGroup>
              {selectedMembers.slice(0, 3).map((member) => (
                <Avatar key={member.id} size="sm">
                  <AvatarImage src={member.user.image ?? undefined} />
                  <AvatarFallback>{getInitials(member.user.name)}</AvatarFallback>
                </Avatar>
              ))}
              {selectedUserIds.length > 3 && (
                <span className="text-xs text-muted-foreground ml-1">
                  +{selectedUserIds.length - 3}
                </span>
              )}
            </AvatarGroup>
          )}
        </span>
        <ChevronDown className="size-4 opacity-50" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[280px] p-0">
        <div className="max-h-64 overflow-y-auto p-1">
          {members.length === 0 ? (
            <div className="p-2 text-center text-muted-foreground text-sm">
              No members found
            </div>
          ) : (
            members.map((member) => {
              const isSelected = selectedUserIds.includes(member.userId);
              return (
                <div
                  key={member.id}
                  className="flex items-center gap-2 rounded-md px-2 py-1.5 cursor-pointer hover:bg-accent"
                  onClick={() => handleToggleMember(member.userId)}
                >
                  <Checkbox checked={isSelected} />
                  <Avatar size="sm">
                    <AvatarImage src={member.user.image ?? undefined} />
                    <AvatarFallback>{getInitials(member.user.name)}</AvatarFallback>
                  </Avatar>
                  <span className="flex-1 truncate text-sm">
                    {member.user.name || member.user.email}
                  </span>
                </div>
              );
            })
          )}
        </div>
        {selectedUserIds.length > 0 && (
          <div className="border-t p-2">
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-xs"
              onClick={() => onSelectionChange([])}
            >
              <X className="size-3 mr-1" />
              Clear all
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
