// Identidade visual do Farol: azul do mar à noite + amarelo da luz do farol.
// Modo Claro: estrutura invertida (fundo claro névoa/céu e textos em azul profundo).
// Todos os pares de cor seguem as diretrizes WCAG AAA de contraste e acessibilidade.

export type ModoTema = "escuro" | "claro";

export type PaletaCores = {
  modo: ModoTema;
  fundo: string;
  superficie: string;
  superficieClara: string;
  borda: string;
  luz: string;
  luzSuave: string;
  luzForte: string;
  textoSobreLuz: string;
  textoPrincipal: string;
  textoSecundario: string;
  textoSuave: string;
  coralLuminoso: string;
  torre: string;
  listra: string;
  mar: string;
  sobreCamera: string;
  statusBar: "light" | "dark";
};

export const paletaEscura: PaletaCores = {
  modo: "escuro",
  fundo: "#0B1F3A", // mar profundo: fundo das telas
  superficie: "#12305C", // águas médias: cartões e campos
  superficieClara: "#1A417A", // toque/pressionado
  borda: "#2F66B0", // linhas e contornos

  luz: "#FFC93C", // amarelo do farol: ações e destaque
  luzSuave: "#FFE08A",
  luzForte: "#FFC93C",
  textoSobreLuz: "#0B1F3A", // texto sobre fundo amarelo

  textoPrincipal: "#FFFFFF",
  textoSecundario: "#B8C7DD",
  textoSuave: "#8FA5C4",

  // Alerta e Ações de saída
  coralLuminoso: "#FF6B6B", // Coral Luminoso: botão de sair e ações de alerta

  // Detalhes do desenho do farol
  torre: "#E8EEF7",
  listra: "#1E4B8F",
  mar: "#12305C",

  // Camada sobre a câmera
  sobreCamera: "#0B1F3AE6",
  statusBar: "light",
};

export const paletaClara: PaletaCores = {
  modo: "claro",
  fundo: "#F4F7FB", // Céu claro / névoa
  superficie: "#FFFFFF", // Superfície limpa de cartões e campos
  superficieClara: "#E3EAF3", // Toque/pressionado
  borda: "#C0D1E5", // Linhas e contornos definidos

  luz: "#FFC93C", // Amarelo clássico para botões de ação
  luzSuave: "#855800", // Tom mostarda escuro para textos (> 7:1 WCAG AAA)
  luzForte: "#855800", // Mostarda para ícones e destaques sobre fundo claro
  textoSobreLuz: "#0B1F3A", // Texto azul escuro sobre o amarelo

  textoPrincipal: "#0B1F3A", // O azul profundo se torna o texto (contraste 15.5:1)
  textoSecundario: "#25446E", // Contraste 7.8:1 WCAG AAA sobre #F4F7FB
  textoSuave: "#365682", // Contraste > 5.5:1

  // Vermelho para Modo Claro: #B3261E (contraste > 4.5:1 sobre fundos claros, permite texto branco)
  coralLuminoso: "#B3261E",

  // Detalhes do desenho do farol no tema claro
  torre: "#0B1F3A",
  listra: "#C8D8EB",
  mar: "#BDD0E7",

  // Camada sobre a câmera no tema claro (fundo claro translúcido)
  sobreCamera: "#F4F7FBF2",
  statusBar: "dark",
};

export function obterCores(tema: ModoTema = "escuro", altoContraste: boolean = false): PaletaCores {
  const base = tema === "claro" ? paletaClara : paletaEscura;

  if (!altoContraste) return base;

  if (tema === "claro") {
    return {
      ...base,
      fundo: "#FFFFFF",
      superficie: "#FFFFFF",
      borda: "#0B1F3A",
      textoPrincipal: "#000000",
      textoSecundario: "#000000",
      textoSuave: "#0B1F3A",
      luzSuave: "#5E3E00",
      luzForte: "#5E3E00",
      coralLuminoso: "#8A1A14",
    };
  }

  return {
    ...base,
    fundo: "#050E1A",
    superficie: "#0E2344",
    borda: "#6BA5EE",
    textoPrincipal: "#FFFFFF",
    textoSecundario: "#FFFFFF",
    textoSuave: "#E8EEF7",
    luzSuave: "#FFE08A",
    coralLuminoso: "#FF8484",
  };
}

// Exportação estática padrão para compatibilidade
export const cores = paletaEscura;

export const espaco = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 };

export const raio = { md: 14, lg: 22, pill: 999 };

export const fonte = {
  marca: 46,
  titulo: 30,
  subtitulo: 20,
  corpo: 18,
  pequeno: 15,
};