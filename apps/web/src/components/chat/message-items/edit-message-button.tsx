import { memo } from "react";
import { Pencil } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";

interface EditMessageButtonProps {
  onStartEdit: () => void;
}

export const EditMessageButton = memo(function EditMessageButton({
  onStartEdit,
}: EditMessageButtonProps) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger
          onClick={onStartEdit}
          aria-label="Edit message"
        >
          <Button variant="ghost" size="icon">
            <Pencil size={16} />
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <span>Edit message</span>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
});
