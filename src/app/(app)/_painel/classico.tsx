import Link from "next/link";
import { Fragment, type ReactNode } from "react";
import { Icon, type IconName } from "@/components/icons";
import { StatusBadge } from "@/components/ui";
import { dateTime, money } from "@/lib/format";
import type { IndicadoresComerciais, proximasCirurgias } from "@/app/(app)/comercial/_lib/publico";
import type { Pendencia } from "./pendencias";
import { AbasJanela } from "./abas-janela";
import { FerramentaImprimir } from "./ferramenta-imprimir";

/*
 * Painel no visual clássico (protótipo; estilos/classico.css): janela com barra de título e de ferramentas, cabeçalho de
 * campos, trilha de etapas da cirurgia, abas de pasta com grades, quadro de indicadores com subtotais, botões com tecla de
 * acesso e barra de status. Mesmos dados e mesmas regras do painel atual: só leitura, cada item leva à tela do módulo dono.
 */

export type Tom = "default" | "info" | "warn" | "danger";
export type Etapa = { rotulo: string; qtd: number; href: string; tom: Tom };
export type LinhaIndicador = { rotulo: string; valor: string; href: string; tom?: Tom };
export type SecaoIndicadores = { titulo: string; linhas: LinhaIndicador[] };
export type Atalho = { rotulo: string; tecla: string; href: string; icone: IconName };

type Cirurgias = Awaited<ReturnType<typeof proximasCirurgias>>;

/** Rótulo com a tecla de acesso sublinhada (a primeira ocorrência da letra). */
function ComTecla({ texto, tecla }: { texto: string; tecla: string }) {
  const i = texto.toLowerCase().indexOf(tecla.toLowerCase());
  if (i < 0) return <>{texto}</>;
  return (
    <>
      {texto.slice(0, i)}
      <u>{texto[i]}</u>
      {texto.slice(i + 1)}
    </>
  );
}

function Etapas({ etapas }: { etapas: Etapa[] }) {
  return (
    <ol className="etapas" aria-label="Fluxo da cirurgia">
      {etapas.map((e, i) => (
        <li key={e.rotulo}>
          {i > 0 && (
            <span className="etapa-seta" aria-hidden="true">
              <Icon name="direita" size={16} />
            </span>
          )}
          <Link href={e.href} className="etapa" aria-label={`${e.rotulo}: ${e.qtd}`}>
            <span className="etapa-bola" data-tom={e.qtd > 0 ? e.tom : undefined}>{e.qtd}</span>
            <span className="etapa-rotulo">{e.rotulo}</span>
          </Link>
        </li>
      ))}
    </ol>
  );
}

function GradeCirurgias({ cirurgias }: { cirurgias: Cirurgias }) {
  if (cirurgias.length === 0) return <p className="p-3 text-slate-600">Nenhuma cirurgia agendada a partir de hoje.</p>;
  return (
    <div className="grade-rolagem">
      <table className="grade">
        <thead>
          <tr>
            <th>Data / hora</th>
            <th>Nº</th>
            <th>Médico</th>
            <th>Hospital</th>
            <th>Procedimento</th>
            <th>Vale</th>
            <th>Situação</th>
          </tr>
        </thead>
        <tbody>
          {cirurgias.map((c) => (
            <tr key={c.id}>
              <td className="num">{dateTime(c.dataHora).replace(/\/\d{4},/, "")}</td>
              <td className="num"><Link href={`/comercial/cirurgias/${c.id}`}>CIR-{c.numero}</Link></td>
              <td className="max-w-40 truncate" title={c.medico}>{c.medico}</td>
              <td className="max-w-40 truncate" title={c.hospital}>{c.hospital}</td>
              <td className="max-w-40 truncate" title={c.procedimento ?? undefined}>{c.procedimento ?? "—"}</td>
              <td>{c.temVale ? "Sim" : <span data-tom="warn">Não</span>}</td>
              <td><StatusBadge status={c.status} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function GradePendencias({ pendencias }: { pendencias: Pendencia[] }) {
  if (pendencias.length === 0) return <p className="p-3 text-slate-600">Nada pendente para o seu perfil.</p>;
  return (
    <div className="grade-rolagem">
      <table className="grade">
        <thead>
          <tr>
            <th className="w-14">Qtd</th>
            <th>Pendência</th>
            <th>Observação</th>
          </tr>
        </thead>
        <tbody>
          {pendencias.map((p) => (
            <tr key={p.key}>
              <td className="num" data-tom={p.tom}>{p.qtd}</td>
              <td><Link href={p.href}>{p.titulo.replace(/^\d+\s+/, "")}</Link></td>
              <td className="text-slate-600">{p.nota}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function GradeVendas({ meses }: { meses: IndicadoresComerciais["meses"] }) {
  const total = meses.reduce((s, m) => s + m.total, 0);
  const margem = meses.reduce((s, m) => s + m.margem, 0);
  return (
    <div className="grade-rolagem">
      <table className="grade">
        <thead>
          <tr>
            <th>Mês</th>
            <th className="text-right!">Vendido</th>
            <th className="text-right!">Margem</th>
            <th className="text-right!">%</th>
          </tr>
        </thead>
        <tbody>
          {meses.map((m) => (
            <tr key={m.chave}>
              <td className="capitalize">{m.label}</td>
              <td className="num">{money(m.total)}</td>
              <td className="num">{money(m.margem)}</td>
              <td className="num">{m.total ? `${((m.margem / m.total) * 100).toFixed(1).replace(".", ",")}%` : "—"}</td>
            </tr>
          ))}
          <tr className="grade-secao">
            <td>Total 6 meses</td>
            <td className="num">{money(total)}</td>
            <td className="num">{money(margem)}</td>
            <td className="num">{total ? `${((margem / total) * 100).toFixed(1).replace(".", ",")}%` : "—"}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function GradeIndicadores({ secoes }: { secoes: SecaoIndicadores[] }) {
  return (
    <table className="grade">
      <thead>
        <tr>
          <th>Indicador</th>
          <th className="text-right!">Valor</th>
        </tr>
      </thead>
      <tbody>
        {secoes.map((s) => (
          <Fragment key={s.titulo}>
            <tr className="grade-secao">
              <td colSpan={2}>{s.titulo}</td>
            </tr>
            {s.linhas.map((l) => (
              <tr key={l.rotulo}>
                <td><Link href={l.href}>{l.rotulo}</Link></td>
                <td className="num" data-tom={l.tom === "danger" || l.tom === "warn" ? l.tom : undefined}>{l.valor}</td>
              </tr>
            ))}
          </Fragment>
        ))}
      </tbody>
    </table>
  );
}

export function PainelClassico({ nome, perfil, versao, etapas, secoes, pendencias, cirurgias, meses, atalhos }: {
  nome: string;
  perfil: string;
  versao: string;
  etapas: Etapa[];
  secoes: SecaoIndicadores[];
  pendencias: Pendencia[];
  cirurgias: Cirurgias | null;
  meses: IndicadoresComerciais["meses"] | null;
  atalhos: Atalho[];
}) {
  const agora = new Date();
  const fmt = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", ...o }).format(agora);
  const criticas = pendencias.filter((p) => p.tom === "danger").length;
  const situacao = pendencias.length === 0 ? "Sem pendências para o seu perfil" : `${pendencias.length} pendência(s) em aberto${criticas ? `, ${criticas} crítica(s)` : ""}`;

  const abas: { rotulo: string; conteudo: ReactNode }[] = [{ rotulo: `1-Pendências (${pendencias.length})`, conteudo: <GradePendencias pendencias={pendencias} /> }];
  if (cirurgias) abas.push({ rotulo: `${abas.length + 1}-Próximas cirurgias`, conteudo: <GradeCirurgias cirurgias={cirurgias} /> });
  if (meses) abas.push({ rotulo: `${abas.length + 1}-Vendas 6 meses`, conteudo: <GradeVendas meses={meses} /> });

  return (
    <section className="janela" aria-labelledby="janela-titulo">
      <header className="janela-titulo">
        <Icon name="painel" size={16} className="text-teal-700" aria-hidden="true" />
        <h1 id="janela-titulo">Painel</h1>
        <span className="janela-codigo">PN0001 · Visão geral do dia</span>
      </header>

      <nav className="janela-barra" aria-label="Barra de ferramentas">
        {atalhos.map((a) => (
          <Link key={a.href} href={a.href} className="ferramenta">
            <Icon name={a.icone} size={18} aria-hidden="true" />
            {a.rotulo}
          </Link>
        ))}
        <span className="ferramenta-sep" aria-hidden="true" />
        <FerramentaImprimir />
      </nav>

      <div className="janela-corpo">
        <dl className="campos-cabecalho">
          <dt>Situação do dia</dt>
          <dd className="caixa-ro destaque linha-toda" data-tom={criticas ? "danger" : undefined}>{situacao}</dd>
          <dt>Data</dt>
          <dd className="caixa-ro tnum">{fmt({ day: "2-digit", month: "2-digit", year: "numeric" })} · <span className="capitalize">{fmt({ weekday: "short" }).replace(".", "")}</span></dd>
          <dt>Usuário</dt>
          <dd className="caixa-ro">{nome}</dd>
          <dt>Perfil</dt>
          <dd className="caixa-ro capitalize">{perfil.toLowerCase()}</dd>
          <dt>Pendências</dt>
          <dd className="caixa-ro tnum">{pendencias.length}</dd>
        </dl>

        {etapas.length > 0 && (
          <fieldset className="grupo">
            <legend>Fluxo da cirurgia (quantidade em cada etapa)</legend>
            <Etapas etapas={etapas} />
          </fieldset>
        )}

        <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1fr)_22rem]">
          <AbasJanela abas={abas} />
          {secoes.length > 0 && (
            <fieldset className="grupo self-start">
              <legend>Indicadores</legend>
              <GradeIndicadores secoes={secoes} />
            </fieldset>
          )}
        </div>
      </div>

      <div className="janela-botoes">
        {atalhos.map((a) => (
          <Link key={a.href} href={a.href} accessKey={a.tecla} title={`Tecla de acesso: Alt+${a.tecla.toUpperCase()} (no Mac, Ctrl+Option+${a.tecla.toUpperCase()})`} className="botao-classico">
            <ComTecla texto={a.rotulo} tecla={a.tecla} />
          </Link>
        ))}
      </div>

      <footer className="barra-status">
        <span>Usuário: {nome}</span>
        <span className="capitalize">{perfil.toLowerCase()}</span>
        <span className="tnum">{fmt({ day: "2-digit", month: "2-digit", year: "numeric" })}</span>
        <span>Versão {versao}</span>
        <span>Banco de dados: conectado</span>
        <span className="estica">PN0001 · Painel</span>
      </footer>
    </section>
  );
}
