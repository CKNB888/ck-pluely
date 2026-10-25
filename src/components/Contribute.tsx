import { CK_HIDE_UPSTREAM_PAID } from "@/config/ck";
import { Button, Card, CardContent, CardDescription, CardTitle } from "./ui";

import { t } from "@/i18n";

const Contribute = () => {
  if (CK_HIDE_UPSTREAM_PAID) return null;
  return (
    <Card className="w-full">
      <CardContent className="flex flex-col gap-4 p-4 py-0 md:flex-row md:items-center md:justify-between">
        <div className="space-y-2 md:max-w-[70%]">
          <CardTitle className="text-xs lg:text-sm">
            {t("Contribute to Pluely, Earn Lifetime Access")}
          </CardTitle>
          <CardDescription className="text-[10px] lg:text-xs">
            {t(
              "Fix a listed critical issue and earn a lifetime Dev Pro license valued at $120. Only issues on our contribute page qualify. read more at pluely.com/contribute"
            )}
          </CardDescription>
        </div>
        <Button asChild className="w-full md:w-auto text-[10px] lg:text-xs">
          <a
            href="https://pluely.com/contribute"
            rel="noopener noreferrer"
            target="_blank"
          >
            {t("pluely.com/contribute")}
          </a>
        </Button>
      </CardContent>
    </Card>
  );
};

export default Contribute;
