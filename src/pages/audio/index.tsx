import { AudioSelection } from "./components";
import { PageLayout } from "@/layouts";
import { getPlatform } from "@/lib";

import { t } from "@/i18n";

const getOsInstructions = () => {
  const platform = getPlatform();

  switch (platform) {
    case "macos":
      return {
        mic: "System Preferences → Sound → Input",
        audio: "System Preferences → Sound → Output",
      };
    case "windows":
      return {
        mic: "Settings → System → Sound → Input",
        audio: "Settings → System → Sound → Output",
      };
    case "linux":
      return {
        mic: "Sound Settings → Input Devices",
        audio: "Sound Settings → Output Devices",
      };
    default:
      return {
        mic: "your system's sound settings",
        audio: "your system's sound settings",
      };
  }
};

const Audio = () => {
  const osInstructions = getOsInstructions();

  return (
    <PageLayout
      title={t("Audio Settings")}
      description={t(
        "Configure your audio input and output devices for voice interaction and system audio capture."
      )}
    >
      <AudioSelection />

      <div className="text-xs text-amber-600 bg-amber-500/10 p-3 rounded-md mb-4 space-y-2">
        <p>
          <strong>{t("⚠️ If selected devices don't work:")}</strong> {t("Please verify your default system audio settings. Go to")}{" "}
          <strong>{osInstructions.mic}</strong> {t("for microphone and")}{" "}
          <strong>{osInstructions.audio}</strong> {t(
            "for speakers/headphones. Ensure the correct devices are set as default in your operating system."
          )}</p>
        <p className="text-amber-600/80">
          <strong>{t("Note:")}</strong> {t(
            "If the selected device fails or is unavailable, Pluely will automatically fall back to your system's default audio devices."
          )}</p>
      </div>
    </PageLayout>
  );
};

export default Audio;
