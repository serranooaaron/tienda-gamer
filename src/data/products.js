// Catalogo inicial de la tienda: lo usan el seed (Atlas) y el modo de desarrollo en memoria.
const products = [
  {
    title: "Microfono Quasar GM200",
    description:
      "El Quasar constituye el salto de calidad sonoro que necesitas para afrontar el streaming con profesionalismo. Un micrófono de condensador que captura la voz con nitidez excelente sin requerir de tu parte conocimientos técnicos sofisticados en ingeniería de sonido. Simple, práctico, efectivo.",
    code: "QUASAR-GM200",
    stock: 5,
    thumbnail: "/image/QUAZAR-1.png",
    price: 540,
    status: true,
    category: "microfonos"
  },
  {
    title: "Webcam Hitman GW800",
    description:
      "Transmite, enseña, entretiene; muéstrate haciendo lo que mejor haces. La Hitman es la herramienta perfecta para ello: una webcam diseñada específicamente para streaming, que se adapta a las necesidades precisas de los nuevos y futuros creadores de contenido del gaming y la tecnología.",
    code: "HITMAN-GW800",
    stock: 2,
    thumbnail: "/image/HITMAN-800.png",
    price: 310,
    status: true,
    category: "webcams"
  },
  {
    title: "Mouse King M724",
    description:
      "El K1ng es un raton hiper competitivo que esquiva los ornamentos innecesarios para concentrarse plenamente en el rendimiento.",
    code: "KING-M724",
    stock: 6,
    thumbnail: "/image/KING-M724-B.png",
    price: 300,
    status: true,
    category: "mouse"
  },
  {
    title: "Mouse M601RGB",
    description:
      "Por su muy buen diseño, por su excelente rendimiento, por su prolongada vida útil, el Centrophorus es y seguirá siendo uno de los grandes preferidos del público. Sencillamente, sabes que puedes confiar en él.",
    code: "M601-RGB",
    stock: 16,
    thumbnail: "/image/CETROPHORUS-RGB.png",
    price: 200,
    status: true,
    category: "mouse"
  },
  {
    title: "Auriculares Lamia 2 H320",
    description:
      "Todos los componentes de los Lamia2 están diseñados para durar. La diadema metálica y el brazo flexible del micrófono admiten una enorme amplitud de tensión, el cable resiste miles de flexiones, y la firme armazón de las copas, a prueba de golpes, protege fiablemente los componentes internos. Son muy sólidos.",
    code: "LAMIA2-H320",
    stock: 7,
    thumbnail: "/image/LAMIA.png",
    price: 260,
    status: true,
    category: "auriculares"
  },
  {
    title: "Auriculares Ares H120",
    description:
      "Con su bajo peso y sus generosas almohadillas en las copas y en la vincha, los Ares realmente minimizan el estrés del contacto y resultan muy cómodos, incluso en el uso prolongado.",
    code: "ARES-H120",
    stock: 8,
    thumbnail: "/image/ARES.png",
    price: 450,
    status: true,
    category: "auriculares"
  },
  {
    title: "Microfono Blazar GM300",
    description:
      "Microfono de condensador con brazo antivibracion y tripode incluido. Captura tu voz con claridad para streaming, podcasts y partidas en equipo.",
    code: "BLAZAR-GM300",
    stock: 4,
    thumbnail: "/image/BLAZAR.png",
    price: 620,
    status: true,
    category: "microfonos"
  },
  {
    title: "Auriculares Cybill H510",
    description:
      "Auriculares over-ear con almohadillas acolchadas y microfono desmontable. Sonido envolvente para escuchar cada paso en tus partidas.",
    code: "CYBILL-H510",
    stock: 7,
    thumbnail: "/image/Cybill.png",
    price: 410,
    status: true,
    category: "auriculares"
  },
  {
    title: "Mouse King Pro M916",
    description:
      "Mouse inalambrico ultraliviano con sensor de alta precision y bateria de larga duracion, pensado para juego competitivo.",
    code: "KING-PRO-M916",
    stock: 0,
    thumbnail: "/image/KING-PRO-1K-BLACK-M916.png",
    price: 480,
    status: true,
    category: "mouse"
  }
];

export default products;
