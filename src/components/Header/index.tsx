import { Button, Label } from "@/components";
import { cn } from "@/lib/utils";
import { ArrowLeftIcon } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { t } from "@/i18n";

interface HeaderProps {
  title: string;
  description: string;
  isMainTitle?: boolean;
  titleClassName?: string;
  descriptionClassName?: string;
  rightSlot?: React.ReactNode | null;
  showBorder?: boolean;
  className?: string;
  allowBackButton?: boolean;
}

export const Header = ({
  title,
  description,
  isMainTitle = false,
  titleClassName,
  descriptionClassName,
  rightSlot = null,
  showBorder = false,
  className,
  allowBackButton = false,
}: HeaderProps) => {
  const navigate = useNavigate();
  return (
    <div
      className={cn(
        `flex ${
          rightSlot ? "flex-row justify-between items-center" : "flex-col"
        } ${
          isMainTitle && (showBorder || !rightSlot)
            ? "border-b pb-3"
            : ""
        }`,
        className
      )}
    >
      <div className="flex items-center gap-2">
        {allowBackButton && (
          <Button size="icon" variant="outline" onClick={() => navigate(-1)}>
            <ArrowLeftIcon className="size-3 lg:size-4 transition-all duration-300" />
          </Button>
        )}
        <div className="flex flex-col">
          <Label
            className={`${cn(
              "font-semibold line-clamp-1",
              isMainTitle
                ? "text-[15px] tracking-tight"
                : "text-[13px]"
            )} ${titleClassName}`}
          >
            {t(title)}
          </Label>
          <p
            className={cn(
              `select-none text-muted-foreground leading-relaxed ${
                isMainTitle
                  ? "text-[12.5px]"
                  : "text-[12px]"
              } ${descriptionClassName}`
            )}
          >
            {t(description)}
          </p>
        </div>
      </div>
      {rightSlot}
    </div>
  );
};
