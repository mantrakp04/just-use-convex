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
          render={(props) => (
            <Button {...props} variant="ghost" size="icon" onClick={onStartEdit} aria-label="Edit message">
              <Pencil size={16} />
            </Button>
          )}
        />
        <TooltipContent>
          <span>Edit message</span>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
});
