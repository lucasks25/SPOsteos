/**
 * Validação campo a campo (picture, conteúdo fixo, domínio, obrigatoriedade, datas) a partir das tabelas
 * declarativas de cnab-layout-sispag.ts. Usado por cnab-validador.ts.
 */
import type { Campo, Layout } from "./cnab-layout-sispag";
import { dataValida, horaValida, OCORRENCIAS_NOTA8 } from "./cnab-validador-regras";

export type Severidade = "erro" | "aviso";
export type Modo = "remessa" | "retorno";

/** Um apontamento no formato que o analista do banco devolve: linha, posição, campo, esperado, encontrado. */
export type Achado = {
  severidade: Severidade;
  linha: number;
  registro: string;
  ini: number;
  fim: number;
  campo: string;
  esperado: string;
  encontrado: string;
  regra: string;
  /** Ocorrência da nota 8 que o Itaú provavelmente devolveria. */
  ocorrencia?: string;
};

export type Coletor = (a: Achado) => void;

export const fatia = (t: string, ini: number, fim: number) => t.slice(ini - 1, fim);
export const vazio = (v: string) => /^ *$/.test(v) || /^0*$/.test(v);
export const mostrar = (v: string) => `"${v}"`;

export function novoAchado(sev: Severidade, linha: number, l: Layout | string, c: Pick<Campo, "ini" | "fim" | "nome" | "ref" | "ocorr">, esperado: string, encontrado: string, ocorrencia = c.ocorr): Achado {
  return {
    severidade: sev, linha, registro: typeof l === "string" ? l : l.nome, ini: c.ini, fim: c.fim, campo: c.nome,
    esperado, encontrado, regra: `Manual SISPAG v085, ${c.ref}`, ...(ocorrencia ? { ocorrencia } : {}),
  };
}

/** Valida todos os campos de um registro de 240 posições contra o layout. */
export function validarCampos(t: string, linha: number, layout: Layout, modo: Modo, add: Coletor) {
  for (const c of layout.campos) {
    const v = fatia(t, c.ini, c.fim);
    const tam = c.fim - c.ini + 1;
    const erro = (esperado: string, sev: "erro" | "aviso" = "erro", ocorr = c.ocorr) => add(novoAchado(sev, linha, layout, c, esperado, mostrar(v), ocorr));

    if (c.pic === "9" && !/^\d+$/.test(v)) {
      erro(`picture 9(${tam}): só dígitos, zeros à esquerda${/ /.test(v) ? " (campo numérico não usado vai com zeros, item 2.2.1)" : ""}`);
      continue;
    }
    if (c.pic === "X" && !c.caixaLivre && /[a-z]/.test(v)) erro(`picture X(${tam}): preferencialmente maiúsculas (item 2.2.1)`, "aviso", undefined);
    if (c.fixo !== undefined) {
      if (v !== c.fixo) erro(/^ +$/.test(c.fixo) ? `${tam} brancos` : /^0+$/.test(c.fixo) ? `${tam} zeros` : mostrar(c.fixo));
      continue;
    }
    if (c.soRetorno && modo === "remessa") {
      const ok = c.pic === "9" ? /^0+$/.test(v) : /^ +$/.test(v);
      if (!ok) erro(`campo (*) só do retorno: na remessa vai com ${c.pic === "9" ? "zeros" : "brancos"}`, "erro", undefined);
      continue;
    }
    if (c.obrig && vazio(v)) {
      erro("preenchimento obrigatório");
      continue;
    }
    if (c.dominio && !c.dominio.includes(v)) {
      erro(`um de: ${c.dominio.map((d) => (d.trim() ? d : "brancos")).join(", ")}${c.dominioAviso ? " (fora da tabela o banco assume o padrão)" : ""}`, c.dominioAviso ? "aviso" : "erro");
      continue;
    }
    if (c.tipo === "data" && !dataValida(v)) erro("data DDMMAAAA válida");
    if (c.tipo === "data-opcional" && !/^0+$/.test(v) && !dataValida(v)) erro("data DDMMAAAA válida ou zeros");
    if (c.tipo === "hora" && !horaValida(v)) erro("hora HHMMSS válida");
    if (c.tipo === "ocorrencias" && modo === "retorno") {
      const cods = (v.match(/.{2}/g) ?? []).map((s) => s.trim()).filter(Boolean);
      for (const cod of cods) if (!OCORRENCIAS_NOTA8.has(cod)) erro(`códigos de 2 posições da nota 8 (encontrado "${cod}")`, "aviso", undefined);
    }
  }
}
