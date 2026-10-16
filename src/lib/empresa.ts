/**
 * Dados cadastrais da empresa, lidos de variáveis de ambiente EMPRESA_* (ver .env.example).
 * É o ÚNICO lugar de onde os documentos impressos tiram nome, CNPJ, endereço e contatos.
 * Campos não informados ficam vazios e simplesmente não aparecem no impresso.
 */
function env(nome: string, padrao = ""): string {
  const v = process.env[nome]?.trim();
  return v ? v : padrao;
}

export type Empresa = {
  nome: string;
  razaoSocial: string;
  cnpj: string;
  endereco: string;
  cidade: string;
  telefone: string;
  email: string;
};

export function empresa(): Empresa {
  return {
    nome: env("EMPRESA_NOME", "SP OSTEOS"),
    razaoSocial: env("EMPRESA_RAZAO_SOCIAL"),
    cnpj: env("EMPRESA_CNPJ"),
    endereco: env("EMPRESA_ENDERECO"),
    cidade: env("EMPRESA_CIDADE", "São Caetano do Sul - SP"),
    telefone: env("EMPRESA_TELEFONE"),
    email: env("EMPRESA_EMAIL"),
  };
}

/** Linhas de identificação para o cabeçalho impresso (só as preenchidas). */
export function linhasEmpresa(e: Empresa = empresa()): string[] {
  const l1 = [e.razaoSocial, e.cnpj && `CNPJ ${e.cnpj}`].filter(Boolean).join(" · ");
  const l2 = [e.endereco, e.cidade].filter(Boolean).join(" - ");
  const l3 = [e.telefone && `Tel. ${e.telefone}`, e.email].filter(Boolean).join(" · ");
  return [l1, l2, l3].filter(Boolean);
}
