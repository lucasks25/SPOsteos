/** Código de barras Interleaved 2 of 5 (padrão do boleto bancário) como SVG. Só dígitos, quantidade par. */
const PADROES = ["nnwwn", "wnnnw", "nwnnw", "wwnnn", "nnwnw", "wnwnn", "nwwnn", "nnnww", "wnnwn", "nwnwn"];

export function barrasITF(digitos: string): { largura: number; barras: { x: number; w: number }[] } {
  if (!/^\d+$/.test(digitos) || digitos.length % 2) throw new Error("O código de barras precisa de dígitos em quantidade par.");
  const fino = 1;
  const largo = 3;
  const barras: { x: number; w: number }[] = [];
  let x = 0;
  const elemento = (preto: boolean, largura: number) => {
    if (preto) barras.push({ x, w: largura });
    x += largura;
  };
  // início: barra fina, espaço fino, barra fina, espaço fino
  elemento(true, fino);
  elemento(false, fino);
  elemento(true, fino);
  elemento(false, fino);
  for (let i = 0; i < digitos.length; i += 2) {
    const a = PADROES[Number(digitos[i])];
    const b = PADROES[Number(digitos[i + 1])];
    for (let k = 0; k < 5; k++) {
      elemento(true, a[k] === "w" ? largo : fino);
      elemento(false, b[k] === "w" ? largo : fino);
    }
  }
  // fim: barra larga, espaço fino, barra fina
  elemento(true, largo);
  elemento(false, fino);
  elemento(true, fino);
  return { largura: x, barras };
}
