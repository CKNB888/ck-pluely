import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { t } from "@/i18n";

/** True when `version` (e.g. "14.1.2") is older than 14.2. */
export const isBelowMacOs142 = (version: string): boolean => {
  const [major = 0, minor = 0] = version
    .split(".")
    .map((n) => parseInt(n, 10) || 0);
  return major < 14 || (major === 14 && minor < 2);
};

/**
 * ck-pluely: system-audio capture uses Core Audio process taps, which need
 * macOS 14.2 or newer. Show a notice instead of failing silently.
 */
export const MacOsVersionNotice = () => {
  const [version, setVersion] = useState<string | null>(null);

  useEffect(() => {
    invoke<string | null>("ck_macos_version")
      .then((v) => setVersion(v ?? null))
      .catch(() => setVersion(null));
  }, []);

  if (!version || !isBelowMacOs142(version)) return null;

  return (
    <div className="text-xs text-red-600 bg-red-500/10 p-3 rounded-md mb-4">
      <strong>
        {t("Your macOS version is {{v0}}.", { v0: version })}
      </strong>{" "}
      {t(
        "Capturing system audio (meeting / interviewer voice) requires macOS 14.2 or later. Microphone input still works; please update macOS to use system audio."
      )}
    </div>
  );
};
