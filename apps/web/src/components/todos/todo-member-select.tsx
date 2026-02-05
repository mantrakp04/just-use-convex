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
  selectedMemberIds: string[];
  onSelectionChange: (memberIds: string[]) => void;
}

export function TodoMemberSelect({
  members,
  selectedMemberIds,
  onSelectionChange,
}: TodoMemberSelectProps) {
  const selectedMembers = selectedMemberIds
    .map((memberId) => members.find((m) => m.id === memberId))
    .filter(Boolean) as Member[];
  const displayedCount = Math.min(selectedMembers.length, 3);
  const hiddenCount = Math.max(selectedMemberIds.length - displayedCount, 0);

  const handleToggleMember = (memberId: string) => {
    const isSelected = selectedMemberIds.includes(memberId);
    onSelectionChange(
      isSelected
        ? selectedMemberIds.filter((id) => id !== memberId)
        : [...selectedMemberIds, memberId]
    );
  };

  return (
    <Popover>
      <PopoverTrigger className="flex h-9 w-full items-center justify-between whitespace-nowrap rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs ring-offset-background placeholder:text-muted-foreground focus:outline-hidden focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50 [&>span]:line-clamp-1">
        <span className="flex items-center gap-2 overflow-hidden">
          {selectedMemberIds.length === 0 ? (
            <span className="text-muted-foreground">Select members...</span>
          ) : (
            <AvatarGroup>
              {selectedMembers.slice(0, 3).map((member) => (
                <Avatar key={member.id} size="sm">
                  <AvatarImage src={member.user.image ?? undefined} />
                  <AvatarFallback>{getInitials(member.user.name)}</AvatarFallback>
                </Avatar>
              ))}
              {hiddenCount > 0 && (
                <span className="text-xs text-muted-foreground ml-1">
                  +{hiddenCount}
                </span>
              )}
            </AvatarGroup>
          )}
        </span>
        <ChevronDown className="size-4 opacity-50" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[280px] p-0 gap-0">
        <div className="max-h-64 overflow-y-auto">
          {members.length === 0 ? (
            <div className="p-2 text-center text-muted-foreground text-sm">
              No members found
            </div>
          ) : (
            members.map((member) => {
              const isSelected = selectedMemberIds.includes(member.id);
              return (
                <div
                  key={member.id}
                  className="flex items-center gap-2 rounded-md px-2 py-1.5 cursor-pointer hover:bg-accent"
                  onClick={() => handleToggleMember(member.id)}
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
        {selectedMemberIds.length > 0 && (
          <div className="border-t">
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-xs"
              onClick={() => onSelectionChange([])}
            >
              <X className="size-3" />
              Clear all
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
