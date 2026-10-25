import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { Button, Header, Input, Switch } from "@/components";
import {
  applyBackup,
  exportBackup,
  listAutoBackups,
  previewBackup,
  type ApplyResult,
  type Preview,
} from "@/lib/backup";

const TABLE_NAMES: Record<string, string> = {
  conversations: "对话",
  messages: "消息",
  system_prompts: "提示词",
};

const mb = (b: number) => (b < 1e6 ? `${Math.max(1, Math.round(b / 1e3))} KB` : `${(b / 1e6).toFixed(1)} MB`);
const when = (s: number) => new Date(s * 1000).toLocaleString("zh-CN", { hour12: false });
const today = () => new Date().toISOString().slice(0, 10);
const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

function Row({ label, hint, checked, onChange, disabled }: {
  label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean;
}) {
  return (
    <label className="flex items-center justify-between gap-4 py-1.5">
      <span className="min-w-0">
        <span className="block text-[13px]">{label}</span>
        {hint && <span className="block text-[12px] text-muted-foreground">{hint}</span>}
      </span>
      <Switch checked={checked} onCheckedChange={onChange} disabled={disabled} aria-label={label} />
    </label>
  );
}

export const Backup = () => {
  // 导出
  const [voice, setVoice] = useState(true);
  const [models, setModels] = useState(false);
  const [withKeys, setWithKeys] = useState(false);
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState<"" | "export" | "inspect" | "apply">("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string; path?: string } | null>(null);
  // 导入
  const [preview, setPreview] = useState<Preview | null>(null);
  const [merge, setMerge] = useState(false);
  const [restoreVoice, setRestoreVoice] = useState(true);
  const [restoreModels, setRestoreModels] = useState(false);
  const [importPw, setImportPw] = useState("");
  const [done, setDone] = useState<ApplyResult | null>(null);
  const [autos, setAutos] = useState<{ path: string; name: string; bytes: number; createdAt: number }[]>([]);

  useEffect(() => {
    listAutoBackups().then(setAutos).catch(() => setAutos([]));
  }, [done, msg]);

  const pwProblem = withKeys && (pw.length < 6 ? "口令至少 6 位" : pw !== pw2 ? "两次口令不一致" : "");

  const doExport = async () => {
    setMsg(null);
    const path = await save({
      defaultPath: `CK-Pluely-备份-${today()}.ckbak`,
      filters: [{ name: "CK Pluely 备份", extensions: ["ckbak"] }],
    }).catch(() => null);
    if (!path) return;
    setBusy("export");
    try {
      const r = await exportBackup(
        { includeVoiceprint: voice, includeModels: models, password: withKeys ? pw : undefined },
        path.endsWith(".ckbak") ? path : `${path}.ckbak`
      );
      setMsg({ ok: true, text: `已导出（${mb(r.bytes)}）`, path: r.path });
      setPw(""); setPw2("");
    } catch (e) {
      setMsg({ ok: false, text: `导出失败：${errText(e)}` });
    } finally {
      setBusy("");
    }
  };

  const pick = async (path?: string) => {
    setMsg(null); setDone(null); setPreview(null);
    const p = path ?? (await open({ multiple: false, filters: [{ name: "CK Pluely 备份", extensions: ["ckbak"] }] }).catch(() => null));
    if (!p || Array.isArray(p)) return;
    setBusy("inspect");
    try {
      const pv = await previewBackup(p, merge);
      setPreview(pv);
      setRestoreVoice(pv.inspection.hasVoiceprint);
      setRestoreModels(pv.inspection.modelFilesIncluded);
    } catch (e) {
      setMsg({ ok: false, text: errText(e) });
    } finally {
      setBusy("");
    }
  };

  const apply = async () => {
    if (!preview) return;
    setBusy("apply");
    try {
      const r = await applyBackup(preview, {
        merge, database: true, voiceprint: restoreVoice, models: restoreModels,
        password: importPw || undefined,
      });
      setDone(r); setPreview(null); setImportPw("");
    } catch (e) {
      setMsg({ ok: false, text: errText(e) });
    } finally {
      setBusy("");
    }
  };

  const i = preview?.inspection;
  const d = preview?.diff;

  return (
    <div id="backup" className="space-y-4">
      <Header
        title="备份与恢复"
        description="把设置、对话记录、提示词和声纹导出为一个 .ckbak 文件，换电脑或重装后导入。API Key 默认不导出。"
        isMainTitle
      />

      <section aria-labelledby="bk-export" className="space-y-1 rounded-lg border p-4">
        <h3 id="bk-export" className="text-[13px] font-medium">导出</h3>
        <Row label="包含声纹" hint="只保存在这个文件里，不会上传" checked={voice} onChange={setVoice} />
        <Row label="包含已下载的模型" hint="文件会大 250 MB 左右；不勾选时只记录模型名称和校验值，导入后可重新下载" checked={models} onChange={setModels} />
        <Row label="包含 API Key（需设置口令加密）" hint="AES-256-GCM 加密，口令不会保存，忘记后无法找回" checked={withKeys} onChange={setWithKeys} />
        {withKeys && (
          <div className="grid gap-2 pt-1 sm:grid-cols-2">
            <Input type="password" placeholder="口令（至少 6 位）" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" />
            <Input type="password" placeholder="再输入一次" value={pw2} onChange={(e) => setPw2(e.target.value)} autoComplete="new-password" />
          </div>
        )}
        <div className="flex items-center justify-between gap-3 pt-2">
          <span className="text-[12px] text-destructive" role="alert">{pwProblem || ""}</span>
          <Button onClick={doExport} disabled={!!busy || !!pwProblem}>
            {busy === "export" ? "正在导出" : "导出备份…"}
          </Button>
        </div>
      </section>

      <section aria-labelledby="bk-import" className="space-y-2 rounded-lg border p-4">
        <h3 id="bk-import" className="text-[13px] font-medium">恢复</h3>
        <p className="text-[12px] text-muted-foreground">
          先预览，确认后才会改动数据。恢复前会自动备份当前数据；中途出错会自动还原。
        </p>
        <Row label="合并到现有数据" hint="关闭时用备份替换现有记录和设置" checked={merge} onChange={(v) => { setMerge(v); setPreview(null); }} disabled={!!preview} />
        {!preview && (
          <div className="flex justify-end">
            <Button variant="outline" onClick={() => pick()} disabled={!!busy}>
              {busy === "inspect" ? "正在校验" : "选择备份文件…"}
            </Button>
          </div>
        )}

        {preview && i && d && (
          <div className="space-y-3 rounded-md bg-muted/50 p-3 text-[13px]" aria-live="polite">
            <div className="font-medium">预览：未做任何改动</div>
            <dl className="grid grid-cols-[6rem_1fr] gap-x-3 gap-y-1 text-[12px]">
              <dt className="text-muted-foreground">来自</dt>
              <dd>CK Pluely {i.manifest.appVersion}，{when(i.manifest.createdAt)}</dd>
              <dt className="text-muted-foreground">格式</dt>
              <dd>
                第 {i.manifest.schemaVersion} 版
                {preview.migrationSteps.length > 0 && `，将自动升级到当前格式`}
                {i.newerThanApp && "，来自更新的版本，只导入能识别的部分"}
              </dd>
              <dt className="text-muted-foreground">记录</dt>
              <dd>
                {Object.keys(i.dbCounts).length
                  ? Object.entries(i.dbCounts).map(([k, n]) => `${TABLE_NAMES[k] ?? k} ${n}`).join("，")
                  : "无"}
                {merge ? "（合并，同一条以备份为准）" : "（替换现有记录）"}
              </dd>
              <dt className="text-muted-foreground">设置</dt>
              <dd>新增 {d.added.length}，修改 {d.changed.length}，删除 {d.removed.length}，不变 {d.unchanged}</dd>
              <dt className="text-muted-foreground">模型</dt>
              <dd>
                {i.models.length ? i.models.map((m) => m.file).join("、") : "无"}
                {i.models.length > 0 && (i.modelFilesIncluded ? "（含文件）" : "（仅清单，需重新下载）")}
              </dd>
            </dl>
            {i.hasVoiceprint && <Row label="恢复声纹" checked={restoreVoice} onChange={setRestoreVoice} />}
            {i.modelFilesIncluded && <Row label="恢复模型文件" checked={restoreModels} onChange={setRestoreModels} />}
            {i.secretsEnc && (
              <div className="space-y-1">
                <span className="block text-[12px] text-muted-foreground">备份含加密的 API Key，输入口令可一起恢复；留空则跳过</span>
                <Input type="password" placeholder="口令" value={importPw} onChange={(e) => setImportPw(e.target.value)} autoComplete="off" />
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => { setPreview(null); invoke("ck_backup_discard").catch(() => {}); }} disabled={!!busy}>
                取消
              </Button>
              <Button onClick={apply} disabled={!!busy}>{busy === "apply" ? "正在恢复" : "确认恢复"}</Button>
            </div>
          </div>
        )}

        {done && (
          <div className="space-y-2 rounded-md border border-primary/30 p-3 text-[13px]" role="status">
            <div className="font-medium">恢复完成</div>
            <div className="text-[12px] text-muted-foreground">
              记录 {Object.values(done.rows).reduce((a, b) => a + b, 0)} 条，设置 {done.settings} 项
              {done.secrets ? `，API Key ${done.secrets} 个` : ""}。重启后生效。
            </div>
            <div className="flex justify-end">
              <Button size="sm" onClick={() => invoke("ck_restart_app")}>立即重启</Button>
            </div>
          </div>
        )}

        {msg && (
          <div className={`flex items-center justify-between gap-2 text-[12px] ${msg.ok ? "text-muted-foreground" : "text-destructive"}`} role={msg.ok ? "status" : "alert"}>
            <span className="min-w-0 truncate" title={msg.path}>{msg.text}</span>
            {msg.path && <Button size="sm" variant="ghost" onClick={() => revealItemInDir(msg.path!)}>在文件夹中显示</Button>}
          </div>
        )}
      </section>

      {autos.length > 0 && (
        <section aria-labelledby="bk-auto" className="space-y-2 rounded-lg border p-4">
          <h3 id="bk-auto" className="text-[13px] font-medium">自动备份</h3>
          <p className="text-[12px] text-muted-foreground">升级和每次恢复前自动生成，各保留最近 5 份，不含 API Key。</p>
          <ul className="divide-y text-[12px]">
            {autos.slice(0, 10).map((a) => (
              <li key={a.path} className="flex items-center justify-between gap-2 py-1.5">
                <span className="min-w-0 truncate">
                  {a.name.startsWith("pre-upgrade") ? "升级前" : a.name.startsWith("pre-import") ? "恢复前" : "自动"}
                  <span className="ml-2 tabular-nums text-muted-foreground">{when(a.createdAt)} · {mb(a.bytes)}</span>
                </span>
                <Button size="sm" variant="ghost" onClick={() => pick(a.path)} disabled={!!busy}>恢复…</Button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
};
