import { Info } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from './tooltip';

interface InfoTooltipProps {
  content: string;
}

export function InfoTooltip({ content }: InfoTooltipProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help flex-shrink-0" />
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">{content}</TooltipContent>
    </Tooltip>
  );
}
