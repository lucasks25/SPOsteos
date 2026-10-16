/**
 * Componentes de interface (docs/DESIGN-SYSTEM.md). Ficam divididos em src/components/ui/*.tsx;
 * este arquivo reexporta tudo para os imports de "@/components/ui" continuarem valendo.
 */
import { MaisAcoes } from "@/components/mais-acoes";

export { MaisAcoes };
export { cx, btn, campo, LinkButton, AcaoIcone, Dica } from "./ui/base";
export { PageHeader, SectionTitle, Abas } from "./ui/cabecalho";
export { Card, Dl } from "./ui/cartao";
export { Table, Td, Paginacao, EmptyState, type Coluna } from "./ui/tabela";
export { Badge, StatusBadge, Aviso, type BadgeColor } from "./ui/status";
export { Stat, KpiGrid, type TomStat } from "./ui/indicadores";
export { FilterBar, ListaComFiltros, SearchBar } from "./ui/filtros";
