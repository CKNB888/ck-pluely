import { cn } from "@/lib/utils";
import { useLocation, useNavigate } from "react-router-dom";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useMenuItems, useVersion } from "@/hooks";
import logo from "@/assets/logo.svg";

import { t } from "@/i18n";

const itemClass =
  "flex h-8 w-full items-center gap-2.5 rounded-md px-2.5 text-[13px] text-sidebar-foreground/75 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground";

export const Sidebar = () => {
  const { version, isLoading } = useVersion();
  const { menu, footerLinks, footerItems } = useMenuItems();

  const navigate = useNavigate();
  const activeRoute = useLocation().pathname;
  return (
    <aside className="flex w-52 flex-col select-none border-r bg-sidebar pt-2">
      <div
        onClick={() => navigate("/dashboard")}
        className="flex items-center gap-2.5 px-4 pb-4 pt-10"
      >
        <img src={logo} alt="" className="size-7 rounded-[7px]" />
        <div className="flex flex-col leading-tight">
          <span className="text-[13px] font-semibold text-foreground">CK Pluely</span>
          <span className="text-[11px] text-muted-foreground">
            {isLoading ? t("Loading...") : `v${version}`}
          </span>
        </div>
      </div>

      <nav className="flex-1 space-y-0.5 px-2.5 py-2">
        {menu.map((item, index) => (
          <button
            onClick={() => navigate(item.href)}
            key={`${item.label}-${index}`}
            className={cn(
              itemClass,
              "justify-between",
              activeRoute.includes(item.href)
                ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                : ""
            )}
          >
            <span className="flex items-center gap-2.5">
              <item.icon className="size-4 text-muted-foreground" />
              {t(String(item.label))}
            </span>
            {item.count ? (
              <span className="min-w-5 rounded px-1 text-center text-[11px] tabular-nums text-muted-foreground">
                {item.count}
              </span>
            ) : null}
          </button>
        ))}
      </nav>

      <div className="flex flex-col gap-0.5 border-t px-2.5 py-2">
        {footerLinks.map((item, index) => (
          <button
            key={`${item.title}-${index}`}
            type="button"
            title="GitHub"
            onClick={() => openUrl(item.link)}
            className={itemClass}
          >
            <item.icon className="size-4 text-muted-foreground" />
            GitHub
          </button>
        ))}
        {footerItems.map((item, index) => (
          <a
            href={item.href}
            onClick={item.action}
            target="_blank"
            rel="noopener noreferrer"
            key={`${item.label}-${index}`}
            className={itemClass}
          >
            <item.icon className="size-4 text-muted-foreground" />
            {t(String(item.label))}
          </a>
        ))}
      </div>
    </aside>
  );
};
