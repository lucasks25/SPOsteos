"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";

type Opt = { value: string; label: string };

/** Select pesquisável (combobox ARIA). O valor vai num input hidden com o mesmo `name`. */
export function Combobox({
  name,
  options,
  placeholder,
  defaultValue,
  required,
  disabled,
  invalid,
  onChange,
  className,
}: {
  name: string;
  options: Opt[];
  placeholder: string;
  defaultValue?: string;
  required?: boolean;
  disabled?: boolean;
  invalid?: boolean;
  onChange?: (e: { target: { name: string; value: string } }) => void;
  className: string;
}) {
  const uid = useId();
  const listId = `${uid}-list`;
  const hiddenRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState(defaultValue ?? "");
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState("");
  const [ativo, setAtivo] = useState(0);
  const selecionado = options.find((o) => o.value === value);

  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options;
  }, [busca, options]);

  // validação "required" (o input hidden não valida sozinho)
  useEffect(() => {
    inputRef.current?.setCustomValidity(required && !value ? "Selecione uma opção." : "");
  }, [required, value]);

  // form.reset() volta ao defaultValue
  useEffect(() => {
    const form = hiddenRef.current?.form;
    if (!form) return;
    const onReset = () => {
      setValue(defaultValue ?? "");
      setBusca("");
      setAberto(false);
    };
    form.addEventListener("reset", onReset);
    return () => form.removeEventListener("reset", onReset);
  }, [defaultValue]);

  function escolher(v: string) {
    setValue(v);
    setBusca("");
    setAberto(false);
    if (hiddenRef.current) {
      hiddenRef.current.value = v;
      hiddenRef.current.dispatchEvent(new Event("input", { bubbles: true })); // avisa o Form (formulário sujo)
    }
    onChange?.({ target: { name, value: v } });
  }

  function abrir() {
    if (disabled) return;
    setAberto(true);
    setAtivo(Math.max(0, filtradas.findIndex((o) => o.value === value)));
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!aberto) return abrir();
      setAtivo((a) => Math.min(a + 1, filtradas.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setAtivo((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter" && aberto) {
      e.preventDefault();
      if (filtradas[ativo]) escolher(filtradas[ativo].value);
    } else if (e.key === "Escape" && aberto) {
      e.preventDefault();
      e.stopPropagation();
      setAberto(false);
      setBusca("");
    }
  }

  useEffect(() => {
    if (aberto) document.getElementById(`${listId}-${ativo}`)?.scrollIntoView({ block: "nearest" });
  }, [ativo, aberto, listId]);

  return (
    <div className="relative">
      <input type="hidden" ref={hiddenRef} name={name} value={value} disabled={disabled} readOnly />
      <input
        ref={inputRef}
        type="text"
        role="combobox"
        aria-expanded={aberto}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={aberto && filtradas[ativo] ? `${listId}-${ativo}` : undefined}
        aria-invalid={invalid || undefined}
        autoComplete="off"
        disabled={disabled}
        className={className}
        placeholder={selecionado ? undefined : placeholder || "Pesquisar..."}
        value={aberto ? busca : (selecionado?.label ?? "")}
        onFocus={abrir}
        onClick={abrir}
        onChange={(e) => {
          setBusca(e.target.value);
          setAtivo(0);
          setAberto(true);
        }}
        onBlur={() => {
          setAberto(false);
          setBusca("");
        }}
        onKeyDown={onKeyDown}
      />
      {aberto && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-30 mt-1 max-h-60 w-full overflow-auto rounded border border-slate-300 bg-white py-1 text-[13px] text-slate-900 shadow-lg"
        >
          {placeholder !== "" && !busca && (
            <li
              role="option"
              aria-selected={value === ""}
              onMouseDown={(e) => {
                e.preventDefault();
                escolher("");
              }}
              className="cursor-pointer px-2.5 py-1.5 text-slate-500 hover:bg-slate-100"
            >
              {placeholder}
            </li>
          )}
          {filtradas.length === 0 && <li className="px-2.5 py-1.5 text-slate-500">Nenhum resultado</li>}
          {filtradas.map((o, i) => (
            <li
              key={o.value}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={o.value === value}
              onMouseDown={(e) => {
                e.preventDefault();
                escolher(o.value);
              }}
              onMouseEnter={() => setAtivo(i)}
              className={"cursor-pointer px-2.5 py-1.5 " + (i === ativo ? "bg-slate-100" : "") + (o.value === value ? " font-medium" : "")}
            >
              {o.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
