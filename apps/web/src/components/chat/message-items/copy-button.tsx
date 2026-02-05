import { memo } from "react";
import { Copy, Check } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { useCopyToClipboard } from "@/hooks/use-chat";

export const CopyButton = memo(function CopyButton({ text }: { text: string }) {
  const { copied, handleCopy } = useCopyToClipboard(text);

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger
          onClick={handleCopy}
          aria-label={copied ? "Copied" : "Copy message"}
          render={<Button variant="ghost" size="icon" />}
        >
          {copied ? <Check size={16} /> : <Copy size={16} />}
        </TooltipTrigger>
        <TooltipContent>
          <p>{copied ? "Copied!" : "Copy message"}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
});
