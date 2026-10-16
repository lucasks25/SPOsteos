import Link from "next/link";

/** Link discreto, só leitura, para a lista de documentos filtrada (os documentos vivem na Qualidade). */
export function VerDocumentos({ campo, id }: { campo: "fornecedorId" | "fabricanteId" | "produtoId"; id: string }) {
  return (
    <p className="mt-3 text-[13px]">
      <Link href={`/qualidade/documentos?${campo}=${encodeURIComponent(id)}`} className="text-teal-700 hover:underline">Ver documentos</Link>
    </p>
  );
}
