'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, CircleAlert, Eye, EyeOff, FlaskConical, Info, LoaderCircle, Save, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { clearModelConnection, connectionTestHeaders, openModelSettings, readModelConnection, saveModelConnection } from '@/lib/client/llm/settings';
import { emptyModelConnection, type ModelConnection, type ModelKind, type ModelTestResult } from '@/lib/types/model-settings';
import { modelConnectionSchema, modelTestResultSchema } from '@/lib/validators/model-settings';

const labels = { chat: '对话模型', embedding: '向量模型' };
const fields = [
  { name: 'baseUrl', label: 'API 地址', placeholder: 'https://your-provider.example/v1' },
  { name: 'apiKey', label: 'API Key', placeholder: '填写该模型服务的密钥' },
  { name: 'model', label: '模型名称', placeholder: '填写服务商提供的模型 ID' },
] as const;

function ConnectionForm({ kind }: { kind: ModelKind }) {
  const [initial] = useState(() => readModelConnection(kind));
  const [draft, setDraft] = useState(initial.value);
  const [shown, setShown] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<keyof ModelConnection, string>>>({});
  const [notice, setNotice] = useState(initial.error ?? '');
  const [failed, setFailed] = useState(!!initial.error);
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<ModelTestResult | null>(null);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);

  const update = (field: keyof ModelConnection, value: string) => {
    controller.current?.abort(); controller.current = null;
    setTesting(false); setResult(null); setNotice(''); setFailed(false);
    setErrors(current => ({ ...current, [field]: undefined }));
    setDraft(current => ({ ...current, [field]: value }));
  };
  const validate = () => {
    const parsed = modelConnectionSchema.safeParse(draft);
    if (!parsed.success) {
      const next: Partial<Record<keyof ModelConnection, string>> = {};
      for (const issue of parsed.error.issues) next[issue.path[0] as keyof ModelConnection] ??= issue.message;
      setErrors(next); setNotice('请检查标出的字段。'); setFailed(true);
      document.getElementById(`model-${kind}-${Object.keys(next)[0]}`)?.focus();
      return null;
    }
    setErrors({}); return parsed.data;
  };
  const save = () => {
    const value = validate();
    if (!value) return;
    try {
      saveModelConnection(kind, value); setDraft(value);
      setNotice('已保存到当前浏览器，新执行将使用此配置。'); setFailed(false);
    } catch { setNotice('保存失败，请检查浏览器存储权限；新配置尚未生效。'); setFailed(true); }
  };
  const clear = () => {
    try {
      clearModelConnection(kind);
      controller.current?.abort(); controller.current = null;
      setDraft(emptyModelConnection()); setErrors({}); setShown(false); setTesting(false); setResult(null);
      setNotice('已清除本机配置，不影响课堂和学习记录。'); setFailed(false);
    } catch { setNotice('清除失败，原配置仍保留，请检查浏览器存储权限。'); setFailed(true); }
  };
  const test = async () => {
    const value = validate();
    if (!value) return;
    controller.current?.abort();
    const current = new AbortController(); controller.current = current;
    setTesting(true); setResult(null); setNotice(''); setFailed(false);
    try {
      const response = await fetch('/api/model-settings/test', {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...connectionTestHeaders(kind, value) },
        body: JSON.stringify({ kind }), signal: AbortSignal.any([current.signal, AbortSignal.timeout(65000)]),
      });
      const parsed = modelTestResultSchema.safeParse(await response.json());
      if (controller.current !== current || current.signal.aborted) return;
      if (!response.ok || !parsed.success) throw new Error('Invalid model test result');
      setResult(parsed.data);
    } catch {
      if (controller.current === current && !current.signal.aborted) {
        setNotice('测试未完成或超时，请检查地址、密钥和模型能力后重试。'); setFailed(true);
      }
    } finally {
      if (controller.current === current) { controller.current = null; setTesting(false); }
    }
  };

  return <FieldSet className="model-settings-group min-w-0 rounded-xl border border-border p-4 sm:p-5" data-testid={`model-${kind}-form`}>
    <FieldLegend className="px-1">{labels[kind]}</FieldLegend>
    <FieldDescription>{kind === 'chat' ? '用于课程生成、课堂问答与简答批改，三名教师共用此配置。'
      : '使用 PDF 资料检索时需要，当前要求 1024 维；无知识库时可不配置。'}</FieldDescription>
    <FieldGroup className="gap-4">
      {fields.map(field => {
        const id = `model-${kind}-${field.name}`;
        return <Field key={field.name} data-invalid={!!errors[field.name]}>
          <FieldLabel htmlFor={id}>{field.label}</FieldLabel>
          <div className="flex min-w-0 items-center gap-2">
            <Input id={id} type={field.name === 'apiKey' && !shown ? 'password' : 'text'} autoComplete="off"
              spellCheck={false} autoCapitalize="none" className="h-9 min-w-0" placeholder={field.placeholder}
              maxLength={field.name === 'apiKey' ? 8192 : field.name === 'baseUrl' ? 2048 : 256}
              value={draft[field.name]} onChange={event => update(field.name, event.target.value)}
              aria-invalid={!!errors[field.name]} aria-describedby={errors[field.name] ? `${id}-error` : undefined} />
            {field.name === 'apiKey' && <Button type="button" variant="outline" size="icon-lg" onClick={() => setShown(!shown)}
              aria-label={`${shown ? '隐藏' : '显示'}${labels[kind]}密钥`} aria-pressed={shown}>
              {shown ? <EyeOff /> : <Eye />}
            </Button>}
          </div>
          {errors[field.name] && <FieldError id={`${id}-error`}>{errors[field.name]}</FieldError>}
        </Field>;
      })}
    </FieldGroup>
    <div className="flex flex-wrap items-center gap-2 pt-1">
      <Button type="button" variant="action" onClick={save}><Save data-icon="inline-start" />保存{labels[kind]}</Button>
      <Button type="button" variant="outline" onClick={() => void test()} disabled={testing}>
        {testing ? <LoaderCircle className="animate-spin motion-reduce:animate-none" data-icon="inline-start" /> : <FlaskConical data-icon="inline-start" />}
        {testing ? '测试中…' : `测试${labels[kind]}`}
      </Button>
      <Button type="button" variant="ghost" onClick={clear}><Trash2 data-icon="inline-start" />清除</Button>
    </div>
    {notice && <Alert variant={failed ? 'destructive' : 'default'} role={failed ? 'alert' : 'status'}>
      <AlertDescription>{notice}</AlertDescription>
    </Alert>}
    {result && <div role="status" className="flex flex-col gap-2">
      {result.checks.map(check => <p key={check.name} className="flex items-start gap-2 text-sm [overflow-wrap:anywhere]">
        {check.ok ? <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
          : <CircleAlert className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden="true" />}
        <span><span className="font-medium">{check.name}：{check.ok ? '通过' : '未通过'}</span><br />{check.message}</span>
      </p>)}
      <p className="text-xs text-muted-foreground">仅说明本次测试结果，不保证所有业务成功；测试不会保存配置。</p>
    </div>}
  </FieldSet>;
}

/** Mounted once in the root layout so every page and error recovery entry opens the same dialog. */
export function ModelSettingsDialog() {
  const [open, setOpen] = useState(false);
  const returnFocus = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const show = () => {
      returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      setOpen(true);
    };
    window.addEventListener('mindflow:open-model-settings', show);
    return () => window.removeEventListener('mindflow:open-model-settings', show);
  }, []);
  return <Dialog open={open} onOpenChange={setOpen}>
    <DialogContent className="mindflow-surface model-settings-dialog max-h-[calc(100dvh-2rem)] gap-5 overflow-y-auto rounded-2xl p-4 sm:max-w-4xl sm:p-6" onCloseAutoFocus={event => {
      event.preventDefault();
      if (returnFocus.current?.isConnected) returnFocus.current.focus({ preventScroll: true });
    }}>
      <DialogHeader className="gap-3 pr-8">
        <DialogTitle>模型设置</DialogTitle>
        <DialogDescription>填写 OpenAI 兼容服务的 API 根地址、密钥与模型名称，两组配置可以使用不同服务商。</DialogDescription>
      </DialogHeader>
      <Alert><Info aria-hidden="true" /><AlertDescription>配置及 API Key 以明文保存在当前浏览器，不会同步到其他设备，可随时清除。测试会发起实际模型请求，可能产生少量用量。</AlertDescription></Alert>
      {open && <div className="grid min-w-0 items-start gap-5 md:grid-cols-2"><ConnectionForm kind="chat" /><ConnectionForm kind="embedding" /></div>}
      <DialogFooter className="mx-0 mb-0 rounded-none border-0 p-0 pt-1"><DialogClose asChild><Button type="button" variant="outline">关闭</Button></DialogClose></DialogFooter>
    </DialogContent>
  </Dialog>;
}

export function ModelSettingsButton({ label = '打开模型设置' }: { label?: string }) {
  return <Button type="button" variant="outline" size="sm" onClick={openModelSettings}>{label}</Button>;
}
