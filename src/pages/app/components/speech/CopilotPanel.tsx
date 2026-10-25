// ck-pluely: real-time copilot controls (answer mode, preset, resume/notes).
import { useState } from "react";
import { Button } from "@/components";
import { SparklesIcon, ChevronDownIcon, ChevronUpIcon } from "lucide-react";
import { t } from "@/i18n";
import { cn } from "@/lib/utils";
import type { CopilotAnswerMode } from "@/hooks/useSystemAudio";
import type { QuestionSensitivity } from "@/lib/question-detect";

type Props = {
  answerMode: CopilotAnswerMode;
  setAnswerMode: (m: CopilotAnswerMode) => void;
  copilotPreset: string;
  setCopilotPreset: (p: string) => void;
  copilotNotes: string;
  setCopilotNotes: (n: string) => void;
  sensitivity: QuestionSensitivity;
  setSensitivity: (v: QuestionSensitivity) => void;
  pendingTranscript: string;
  answerNow: () => void;
  clearPending: () => void;
  isAIProcessing: boolean;
};

const MODES: { id: CopilotAnswerMode; label: string }[] = [
  { id: "questions", label: "Auto-answer questions" },
  { id: "always", label: "Answer everything" },
  { id: "manual", label: "Manual" },
];
const SENSITIVITIES: { id: QuestionSensitivity; label: string }[] = [
  { id: "conservative", label: "Conservative" },
  { id: "standard", label: "Standard" },
  { id: "sensitive", label: "Sensitive" },
];
const PRESETS = [
  { id: "none", label: "My system prompt" },
  { id: "interview", label: "Interview" },
  { id: "class", label: "Class Q&A" },
  { id: "meeting", label: "Meeting" },
];

export const CopilotPanel = (p: Props) => {
  const [showNotes, setShowNotes] = useState(false);
  const chip = (active: boolean) =>
    cn(
      "px-2.5 py-1 rounded-md text-xs border transition-colors whitespace-nowrap",
      active
        ? "bg-primary text-primary-foreground border-primary"
        : "bg-transparent border-input/50 hover:bg-muted"
    );
  return (
    <div className="space-y-2 rounded-lg border border-input/50 p-3">
      <div className="flex items-center gap-2 text-sm font-medium">
        <SparklesIcon className="h-4 w-4" />
        {t("Copilot")}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            className={chip(p.answerMode === m.id)}
            onClick={() => p.setAnswerMode(m.id)}
          >
            {t(m.label)}
          </button>
        ))}
      </div>
      {p.answerMode === "questions" ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-muted-foreground">
            {t("Question detection")}
          </span>
          {SENSITIVITIES.map((x) => (
            <button
              key={x.id}
              type="button"
              className={chip(p.sensitivity === x.id)}
              onClick={() => p.setSensitivity(x.id)}
            >
              {t(x.label)}
            </button>
          ))}
        </div>
      ) : null}
      <div className="flex flex-wrap gap-1.5">
        {PRESETS.map((x) => (
          <button
            key={x.id}
            type="button"
            className={chip(p.copilotPreset === x.id)}
            onClick={() => p.setCopilotPreset(x.id)}
          >
            {t(x.label)}
          </button>
        ))}
      </div>
      {p.pendingTranscript ? (
        <div className="space-y-1.5">
          <p className="text-xs text-muted-foreground line-clamp-3 break-words">
            {t("Heard so far:")} {p.pendingTranscript}
          </p>
          <div className="flex gap-2">
            <Button
              size="sm"
              className="h-7 text-xs"
              disabled={p.isAIProcessing}
              onClick={p.answerNow}
            >
              {t("Answer now")}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              onClick={p.clearPending}
            >
              {t("Clear")}
            </Button>
          </div>
        </div>
      ) : null}
      <button
        type="button"
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        onClick={() => setShowNotes((v) => !v)}
      >
        {showNotes ? (
          <ChevronUpIcon className="h-3 w-3" />
        ) : (
          <ChevronDownIcon className="h-3 w-3" />
        )}
        {t("Resume / notes context")}
      </button>
      {showNotes ? (
        <textarea
          className="w-full min-h-[90px] rounded-md border border-input/50 bg-transparent p-2 text-xs"
          placeholder={t(
            "Paste your resume, lesson notes or meeting agenda. It is sent with every answer request."
          )}
          value={p.copilotNotes}
          onChange={(e) => p.setCopilotNotes(e.target.value)}
        />
      ) : null}
    </div>
  );
};
