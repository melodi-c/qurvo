import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface TruncatedTextProps {
  text: string;
  className?: string;
}

/**
 * Renders text with truncation styling and a tooltip showing the full text on hover.
 * Use this wrapper wherever series names or labels are truncated via CSS.
 */
export function TruncatedText({ text, className }: TruncatedTextProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={className}>{text}</span>
      </TooltipTrigger>
      <TooltipContent side="top">{text}</TooltipContent>
    </Tooltip>
  );
}
