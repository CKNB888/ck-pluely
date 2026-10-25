import {
  Header,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components";
import { useApp } from "@/contexts";
import { CursorType } from "@/lib/storage";
import { MousePointer, Pointer, TextCursor } from "lucide-react";

import { t } from "@/i18n";

interface CursorSelectionProps {
  className?: string;
}

export const CursorSelection = ({ className }: CursorSelectionProps) => {
  const { customizable, setCursorType } = useApp();

  return (
    <div id="cursor" className={`space-y-2 ${className}`}>
      <Header
        title={t("Cursor")}
        description={t("Control pluely cursor visibility")}
        isMainTitle
        rightSlot={
          <Select
            value={customizable.cursor.type}
            onValueChange={(value) => setCursorType(value as CursorType)}
          >
            <SelectTrigger>
              <SelectValue placeholder={t("Select a cursor type")} />
            </SelectTrigger>
            <SelectContent position="popper" align="end">
              <SelectItem value="default">
                {t("Default (")}
                <MousePointer className="size-3" />)
              </SelectItem>
              <SelectItem value="auto">
                {t("Auto (")}
                <MousePointer className="size-3" />/
                <TextCursor className="size-3" /> /
                <Pointer className="size-3" />)
              </SelectItem>
            </SelectContent>
          </Select>
        }
      />
    </div>
  );
};
