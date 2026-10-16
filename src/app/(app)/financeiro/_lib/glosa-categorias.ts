/** Categorias e situações do recurso de glosa (rótulos e ordem). Sem dependência de servidor: usado por formulário, lista e relatório. */
export const CATEGORIAS_GLOSA = ["SEM_AUTORIZACAO", "DIVERGENCIA_MATERIAL_GUIA", "SEM_JUSTIFICATIVA_TECNICA", "ADMINISTRATIVA", "TECNICA", "LINEAR", "OUTRA"] as const;
export type CategoriaGlosaKey = (typeof CATEGORIAS_GLOSA)[number];

export const ROTULO_CATEGORIA_GLOSA: Record<CategoriaGlosaKey, string> = {
  SEM_AUTORIZACAO: "Falta de autorização prévia",
  DIVERGENCIA_MATERIAL_GUIA: "Material diferente do descrito na guia",
  SEM_JUSTIFICATIVA_TECNICA: "Falta de justificativa técnica",
  ADMINISTRATIVA: "Administrativa",
  TECNICA: "Técnica",
  LINEAR: "Linear",
  OUTRA: "Outra",
};

export const RECURSOS_GLOSA = ["NENHUM", "EM_RECURSO", "REVERTIDA", "MANTIDA"] as const;
export type RecursoGlosaKey = (typeof RECURSOS_GLOSA)[number];
export const ROTULO_RECURSO_GLOSA: Record<RecursoGlosaKey, string> = {
  NENHUM: "Sem recurso",
  EM_RECURSO: "Em recurso",
  REVERTIDA: "Revertida",
  MANTIDA: "Mantida",
};
