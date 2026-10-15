"use client";

import { createContext, useActionState, useContext, useEffect, useRef, useTransition, type FormEvent, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons";
import { btn, cx } from "@/components/ui";

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
export function Form({
  action,
  children,
  submitLabel = "Salvar",
  redirectTo,
  className,
  resetOnSuccess,
}: {
  action: Action;
  children: ReactNode;
  submitLabel?: string | null;
  redirectTo?: string;
  className?: string;
  resetOnSuccess?: boolean;
}) {
  const [state, formAction] = useActionState(action, undefined);
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();
  useEffect(() => {
    if (state?.ok && redirectTo) router.push(redirectTo);
    if (state?.ok && resetOnSuccess) formRef.current?.reset();
  }, [state, redirectTo, resetOnSuccess, router]);

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget, (e.nativeEvent as SubmitEvent).submitter);
    startTransition(() => formAction(fd));
  }

  return (
    <ErrorsCtx.Provider value={state?.fieldErrors ?? {}}>
      <PendingCtx.Provider value={pending}>
        <form ref={formRef} onSubmit={onSubmit} className={cx("space-y-4", className)}>
          {state?.error && (
            <div role="alert" className="flex items-start gap-2 rounded border border-rose-200 bg-rose-50 px-3 py-2 text-[13px] text-rose-700">
              <Icon name="alerta" size={16} className="mt-0.5 shrink-0 text-rose-600" />
              <span>{state.error}</span>
            </div>
          )}
          {state?.ok && state.aviso && (
            <div role="status" className="flex items-start gap-2 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-800">
              <Icon name="alerta" size={16} className="mt-0.5 shrink-0 text-amber-600" />
              <span>{state.aviso}</span>
            </div>
          )}
          {state?.ok && !state.aviso && !redirectTo && (
            <div role="status" className="flex items-center gap-2 rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-[13px] text-emerald-700">
              <Icon name="ok" size={16} className="shrink-0 text-emerald-600" />
              Salvo com sucesso.
            </div>
          )}
          {children}
          {submitLabel !== null && (
            <div className="border-t border-slate-100 pt-4">
              <SubmitButton>{submitLabel}</SubmitButton>
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
  return (
    <button
      type="submit"
      disabled={pending}
      className={btn[variant]}
      onClick={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
    >
      {pending && <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden="true" />}
      {pending ? "Processando..." : children}
    </button>
  );
}

const inputCls =
  "h-8 w-full rounded border border-slate-300 bg-white px-2.5 text-[13px] text-slate-900 placeholder:text-slate-500 transition-colors hover:border-slate-400 focus:border-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-700/25 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500 aria-[invalid=true]:border-rose-500 aria-[invalid=true]:focus:ring-rose-500/20";

function Wrap({ label, name, children, className, hint }: { label: string; name: string; children: ReactNode; className?: string; hint?: string }) {
  const errors = useContext(ErrorsCtx);
  const obrigatorio = /\*\s*$/.test(label);
  return (
    <label className={cx("block", className)}>
      <span className="mb-1 block text-xs text-slate-700">
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
  return (
    <Wrap label={label} name={name} className={className} hint={hint}>
      <input name={name} {...rest} className={inputCls} />
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
  return (
    <Wrap label={label} name={name} className={className} hint={hint}>
      <select name={name} {...rest} className={inputCls}>
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
      <textarea name={name} rows={3} {...rest} className={inputCls} />
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
  const [state, formAction] = useActionState(action, undefined);
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
