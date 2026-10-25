import { Fragment, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

/**
 * Re-renders the whole tree when the UI language changes so that
 * strings translated via `t()` outside of hooks are refreshed.
 */
export const I18nRoot = ({ children }: { children: ReactNode }) => {
  const { i18n } = useTranslation();
  return <Fragment key={i18n.language}>{children}</Fragment>;
};
