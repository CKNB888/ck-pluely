import { useCallback, useEffect, useRef, useState } from "react";

type UseCopyToClipboardProps = {
  text: string;
  copyMessage?: string;
};

// Fallback for WebViews that reject the async Clipboard API (e.g. WebKitGTK
// without a user-gesture permission).
function legacyCopy(text: string): boolean {
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

export function useCopyToClipboard({ text }: UseCopyToClipboardProps) {
  const [isCopied, setIsCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
  }, []);

  const flash = useCallback((ok: boolean) => {
    setIsCopied(ok);
    setCopyFailed(!ok);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      setIsCopied(false);
      setCopyFailed(false);
    }, 2000);
  }, []);

  const handleCopy = useCallback(() => {
    const write = navigator.clipboard?.writeText
      ? navigator.clipboard.writeText(text)
      : Promise.reject(new Error("no clipboard"));
    write.then(
      () => flash(true),
      () => flash(legacyCopy(text))
    );
  }, [text, flash]);

  return { isCopied, copyFailed, handleCopy };
}
