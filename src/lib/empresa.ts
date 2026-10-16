/**
 * Dados cadastrais da empresa, lidos de variáveis de ambiente EMPRESA_* (ver .env.example).
 * É o ÚNICO lugar de onde os documentos impressos tiram nome, CNPJ, endereço e contatos.
 *
 * Os padrões são os dados públicos do CNPJ da SP OSTEOS na Receita Federal (consulta de 16/10/2026,
 * docs/ALINHAMENTO-SPOSTEOS.md §1): é o endereço fiscal, o mesmo que a NF-e tem de levar. Telefone e e-mail
 * não têm padrão (mudam com mais frequência): vêm só do .env. Campo vazio não aparece no impresso.
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
  cep: string;
  cidade: string;
  telefone: string;
  email: string;
};

export function empresa(): Empresa {
  return {
    nome: env("EMPRESA_NOME", "SP OSTEOS"),
    razaoSocial: env("EMPRESA_RAZAO_SOCIAL", "SP OSTEOS Distribuidora de Produtos para a Saúde Ltda"),
    cnpj: env("EMPRESA_CNPJ", "19.966.249/0001-84"),
    endereco: env("EMPRESA_ENDERECO", "Rua Alegre, 470, sala 1001 - Santa Paula"),
    cep: env("EMPRESA_CEP", "09550-250"),
    cidade: env("EMPRESA_CIDADE", "São Caetano do Sul - SP"),
    telefone: env("EMPRESA_TELEFONE"),
    email: env("EMPRESA_EMAIL"),
  };
}

/** Linhas de identificação para o cabeçalho impresso (só as preenchidas). */
export function linhasEmpresa(e: Empresa = empresa()): string[] {
  const l1 = [e.razaoSocial, e.cnpj && `CNPJ ${e.cnpj}`].filter(Boolean).join(" · ");
  const l2 = [e.endereco, e.cidade, e.cep && `CEP ${e.cep}`].filter(Boolean).join(" - ");
  const l3 = [e.telefone && `Tel. ${e.telefone}`, e.email].filter(Boolean).join(" · ");
  return [l1, l2, l3].filter(Boolean);
}
