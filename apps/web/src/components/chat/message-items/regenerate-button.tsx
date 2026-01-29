import { memo } from "react";
import { RotateCcw, Loader2 } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";

interface RegenerateButtonProps {
  onRegenerate: () => void;
  isRegenerating?: boolean;
}

export const RegenerateButton = memo(function RegenerateButton({
  onRegenerate,
  isRegenerating,
}: RegenerateButtonProps) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger
          onClick={onRegenerate}
          disabled={isRegenerating}
          aria-label="Regenerate response"
        >
          <Button variant="ghost" size="icon">
            {isRegenerating ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <RotateCcw size={16} />
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>{isRegenerating ? "Regenerating..." : "Regenerate response"}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
});
