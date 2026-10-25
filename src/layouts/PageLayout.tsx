import { Header, ScrollArea } from "@/components";

export const PageLayout = ({
  children,
  title,
  description,
  rightSlot,
  allowBackButton = false,
  isMainTitle = true,
}: {
  children: React.ReactNode;
  title: string;
  description: string;
  rightSlot?: React.ReactNode;
  allowBackButton?: boolean;
  isMainTitle?: boolean;
}) => {
  return (
    <div className="flex flex-1 flex-col">
      <header className="mx-auto w-full max-w-3xl pr-6 pt-9">
        <Header
          isMainTitle={isMainTitle}
          showBorder={true}
          title={title}
          description={description}
          rightSlot={rightSlot}
          allowBackButton={allowBackButton}
        />
      </header>

      <ScrollArea className="h-[calc(100vh-5rem)] pr-6">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-1 pb-12 pt-5">{children}</div>
      </ScrollArea>
    </div>
  );
};
