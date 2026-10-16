import { Badge } from "@/components/ui";
import { COR_SITUACAO, situacaoDocumento, textoSituacao } from "./documentos";

/** Selo da situação do documento pela validade (calculada na hora, nunca gravada). */
export function SituacaoBadge({ validade, hoje }: { validade: Date | null; hoje: Date }) {
  return <Badge color={COR_SITUACAO[situacaoDocumento(validade, hoje)]}>{textoSituacao(validade, hoje)}</Badge>;
}
