"use client";

import { createContext, useActionState, useContext, useEffect, useRef, useTransition, type FormEvent, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons";
import { btn, campo, cx } from "@/components/ui";
import { Combobox } from "@/components/combobox";
import { confirmar } from "@/components/confirm-dialog";
import { MONEY_RE, maskFor, maskInitial, maskInput } from "@/components/masks";
import { toast } from "@/components/toast";

export type ActionState = { ok?: boolean; aviso?: string; error?: string; fieldErrors?: Record<string, string> } | undefined;
type Action = (state: ActionState, formData: FormData) => Promise<ActionState>;

const ErrorsCtx = createContext<Record<string, string>>({});
const PendingCtx = createContext(false);

/**
 * Formulário ligado a uma Server Action `(state, formData) => ActionState`.
 * Mostra erros gerais e por campo. Se `redirectTo` for informado, navega ao salvar com sucesso.
 * (A action também pode chamar `redirect()` diretamente.)
 *
 * O envio é feito por onSubmit + startTransition (e não pela prop `action` do <form>) porque o
 * React 19 limpa os campos não controlados após toda action de formulário — inclusive quando o
 * servidor devolve erro de validação, o que faria o usuário perder o que digitou.
 */
/** Envolve a action para avisar o sucesso assim que o servidor responde (o formulário pode sumir da tela logo depois). */
function comToast(action: Action, redirectTo?: string): Action {
  return async (prev, fd) => {
    const r = await action(prev, fd);
    if (r?.ok && !redirectTo) toast(r.aviso ?? "Salvo com sucesso.");
    return r;
  };
}

export function Form({
  action,
  children,
  submitLabel = "Salvar",
  redirectTo,
  className,
  resetOnSuccess,
  confirm,
}: {
  action: Action;
  children: ReactNode;
  submitLabel?: string | null;
  redirectTo?: string;
  className?: string;
  resetOnSuccess?: boolean;
  /** pede confirmação (diálogo) antes de enviar; use para avisos que o usuário decide */
  confirm?: string;
}) {
  const [state, formAction] = useActionState(comToast(action, redirectTo), undefined);
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();
  const sujo = useRef(false); // há alterações não salvas
  useEffect(() => {
    if (state?.ok && redirectTo) router.push(redirectTo);
    if (state?.ok && resetOnSuccess) formRef.current?.reset();
    if (state && !state.ok) {
      sujo.current = true; // os dados continuam na tela, ainda não salvos
      formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
    }
  }, [state, redirectTo, resetOnSuccess, router]);

  useEffect(() => {
    const aviso = (e: BeforeUnloadEvent) => {
      if (!sujo.current) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", aviso);
    return () => window.removeEventListener("beforeunload", aviso);
  }, []);

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    sujo.current = false;
    const fd = new FormData(e.currentTarget, (e.nativeEvent as SubmitEvent).submitter);
    startTransition(() => formAction(fd));
  }

  return (
    <ErrorsCtx.Provider value={state?.fieldErrors ?? {}}>
      <PendingCtx.Provider value={pending}>
        <form
          ref={formRef}
          onSubmit={onSubmit}
          onInput={() => (sujo.current = true)}
          onChange={() => (sujo.current = true)}
          onReset={() => (sujo.current = false)}
          className={cx("space-y-4", className)}>
          {state?.error && (
            <div role="alert" className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              <Icon name="alerta" size={16} className="mt-0.5 shrink-0 text-rose-600" />
              <span>{state.error}</span>
            </div>
          )}
          {state?.ok && state.aviso && (
            <div role="status" className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              <Icon name="alerta" size={16} className="mt-0.5 shrink-0 text-amber-600" />
              <span>{state.aviso}</span>
            </div>
          )}
          {children}
          {submitLabel !== null && (
            <div className="border-t border-slate-200 pt-4">
              <SubmitButton confirm={confirm}>{submitLabel}</SubmitButton>
            </div>
          )}
        </form>
      </PendingCtx.Provider>
    </ErrorsCtx.Provider>
  );
}

export function SubmitButton({ children, variant = "primary", confirm }: { children: ReactNode; variant?: keyof typeof btn; confirm?: string }) {
  const { pending: pendingAction } = useFormStatus(); // <form action> (ActionButton)
  const pendingForm = useContext(PendingCtx); // <Form> (envio por transição)
  const pending = pendingAction || pendingForm;
  const confirmado = useRef(false);
  return (
    <button
      type="submit"
      disabled={pending}
      className={btn[variant]}
      onClick={(e) => {
        if (!confirm) return;
        if (confirmado.current) {
          confirmado.current = false;
          return;
        }
        e.preventDefault();
        const botao = e.currentTarget;
        const form = botao.form;
        confirmar(confirm).then((ok) => {
          if (!ok || !form) return;
          confirmado.current = true;
          form.requestSubmit(botao);
        });
      }}
    >
      {pending && <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden="true" />}
      {pending ? "Processando..." : children}
    </button>
  );
}

const inputCls = campo; // estilo Horizon definido em ui.tsx

function Wrap({ label, name, children, className, hint }: { label: string; name: string; children: ReactNode; className?: string; hint?: string }) {
  const errors = useContext(ErrorsCtx);
  const obrigatorio = /\*\s*$/.test(label);
  return (
    <label className={cx("block", className)}>
      <span className="mb-1 block text-sm text-slate-600">
        {obrigatorio ? label.replace(/\s*\*$/, "") : label}
        {obrigatorio && <span className="ml-0.5 text-rose-600" aria-hidden="true">*</span>}
      </span>
      {children}
      {hint && !errors[name] && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
      {errors[name] && (
        <span role="alert" className="mt-1 block text-xs font-medium text-rose-600">
          {errors[name]}
        </span>
      )}
    </label>
  );
}

type InputProps = React.InputHTMLAttributes<HTMLInputElement> & { label: string; name: string; hint?: string };
export function Field({ label, name, className, hint, ...rest }: InputProps) {
  if (rest.type === "checkbox") {
    return (
      <label className={cx("flex items-center gap-2 text-sm text-slate-700", className)}>
        <input name={name} {...rest} className="h-4 w-4 rounded-sm border-slate-300" />
        {label}
      </label>
    );
  }
  return <TextField label={label} name={name} className={className} hint={hint} {...rest} />;
}

function TextField({ label, name, className, hint, ...rest }: InputProps) {
  const errors = useContext(ErrorsCtx);
  const invalido = !!errors[name];
  const mask = rest.type === undefined || rest.type === "text" ? maskFor(name) : null;
  const dinheiro = rest.type === "number" && MONEY_RE.test(name);
  const { onInput, defaultValue, ...resto } = rest;
  const input = (
    <input
      name={name}
      {...resto}
      defaultValue={mask ? maskInitial(mask, defaultValue) : defaultValue}
      aria-invalid={invalido || undefined}
      onInput={(e) => {
        if (mask) maskInput(e.currentTarget, mask);
        onInput?.(e);
      }}
      inputMode={resto.inputMode ?? (mask ? "numeric" : undefined)}
      className={dinheiro ? cx(inputCls, "tnum pl-8 text-right") : inputCls}
    />
  );
  return (
    <Wrap label={label} name={name} className={className} hint={hint}>
      {dinheiro ? (
        <span className="relative block">
          <span className="pointer-events-none absolute inset-y-0 left-2.5 flex items-center text-slate-500" aria-hidden="true">
            R$
          </span>
          {input}
        </span>
      ) : (
        input
      )}
    </Wrap>
  );
}

type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement> & {
  label: string;
  name: string;
  options: { value: string; label: string }[];
  placeholder?: string;
  hint?: string;
};
export function Select({ label, name, options, placeholder = "Selecione...", className, hint, ...rest }: SelectProps) {
  const errors = useContext(ErrorsCtx);
  if (options.length > 12) {
    return (
      <Wrap label={label} name={name} className={className} hint={hint}>
        <Combobox
          name={name}
          options={options}
          placeholder={placeholder}
          defaultValue={rest.defaultValue === undefined ? undefined : String(rest.defaultValue)}
          required={rest.required}
          disabled={rest.disabled}
          invalid={!!errors[name]}
          onChange={rest.onChange as never}
          className={inputCls}
        />
      </Wrap>
    );
  }
  return (
    <Wrap label={label} name={name} className={className} hint={hint}>
      <select name={name} aria-invalid={errors[name] ? true : undefined} {...rest} className={inputCls}>
        {placeholder !== "" && <option value="">{placeholder}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </Wrap>
  );
}

type AreaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; name: string };
export function TextArea({ label, name, className, ...rest }: AreaProps) {
  return (
    <Wrap label={label} name={name} className={className}>
      <textarea name={name} rows={3} aria-invalid={useContext(ErrorsCtx)[name] ? true : undefined} {...rest} className={cx(inputCls, "h-auto py-1.5")} />
    </Wrap>
  );
}

export function Grid({ children, cols = 3 }: { children: ReactNode; cols?: 2 | 3 | 4 }) {
  const c = { 2: "sm:grid-cols-2", 3: "sm:grid-cols-2 lg:grid-cols-3", 4: "sm:grid-cols-2 lg:grid-cols-4" }[cols];
  return <div className={cx("grid grid-cols-1 gap-4", c)}>{children}</div>;
}

/** Botão de ação única (ex.: excluir, liberar) ligado a uma Server Action simples. */
export function ActionButton({
  action,
  children,
  variant = "secondary",
  confirm,
  hidden,
}: {
  action: Action;
  children: ReactNode;
  variant?: keyof typeof btn;
  confirm?: string;
  hidden?: Record<string, string | number>;
}) {
  const [state, formAction] = useActionState(comToast(action), undefined);
  return (
    <form action={formAction} className="inline-flex flex-col items-start gap-1">
      {hidden && Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <SubmitButton variant={variant} confirm={confirm}>
        {children}
      </SubmitButton>
      {state?.error && <span className="text-xs text-rose-600">{state.error}</span>}
    </form>
  );
}
