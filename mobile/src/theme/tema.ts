// Identidade visual do Farol: azul do mar à noite + amarelo da luz do farol.
// Todos os pares de cor de texto/fundo abaixo têm contraste alto (acima de 7:1).

export const cores = {
    // Azuis (mar)
    fundo: "#0B1F3A", // mar profundo: fundo das telas
    superficie: "#12305C", // águas médias: cartões e campos
    superficieClara: "#1A417A", // toque/pressionado
    borda: "#2F66B0", // linhas e contornos

    // Amarelos (luz)
    luz: "#FFC93C", // amarelo do farol: ações e destaque
    luzSuave: "#FFE08A",
    textoSobreLuz: "#0B1F3A", // texto sobre fundo amarelo

    // Textos sobre o azul
    textoPrincipal: "#FFFFFF",
    textoSecundario: "#B8C7DD",
    textoSuave: "#8FA5C4",

    // Detalhes do desenho do farol
    torre: "#E8EEF7",
    listra: "#1E4B8F",

    // Camada sobre a câmera
    sobreCamera: "#0B1F3AE6",
};

export const espaco = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 };

export const raio = { md: 14, lg: 22, pill: 999 };

export const fonte = {
    marca: 46,
    titulo: 30,
    subtitulo: 20,
    corpo: 18,
    pequeno: 15,
};