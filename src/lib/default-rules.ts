/**
 * Regras de categoria prontas ("uber" → Transporte). Toda família nova já nasce com elas, e as que já existem
 * recebem as que faltam (sem mexer no que a família criou). Os textos são comparados sem acento e sem diferença
 * de maiúsculas; quando mais de uma regra bate, a mais específica (o texto mais longo) vence: "uber eats" ganha de "uber".
 */
export const DEFAULT_RULES: Record<string, string[]> = {
  Transporte: [
    "uber", "99 tecnologia", "99pop", "99 pop", "99app", "99 taxi", "cabify", "indriver", "taxi", "bilhete unico", "metro sp", "cptm",
    "onibus", "sptrans", "estacionamento", "zona azul", "estapar", "pedagio", "sem parar", "conectcar", "veloe", "posto ", "ipiranga", "shell",
    "petrobras", "br mania", "gasolina", "etanol", "combustivel", "lavagem", "oficina", "detran", "ipva", "latam", "gol linhas", "azul linhas",
    "passagem aerea", "rodoviaria", "buser", "clickbus",
  ],
  Restaurantes: [
    "uber eats", "ubereats", "ifood", "rappi", "99food", "mcdonald", "burger king", "bk brasil", "subway", "outback", "habibs", "giraffas", "spoleto",
    "china in box", "pizza", "pizzaria", "restaurante", "lanchonete", "hamburgueria", "churrascaria", "sushi", "starbucks", "cafeteria", "padaria",
    "doceria", "sorveteria", "bar do", "boteco", "kfc", "pizza hut", "dominos", "domino s", "bobs", "bob s", "madero", "coco bambu", "ze delivery",
    "lanche", "lanches", "marmita", "marmitex", "acai", "pastelaria", "esfiha", "japones", "temakeria", "cafe ", "bistro", "rodizio", "cantina",
    "ifood *", "rest ", "grill", "bakery", "confeitaria", "casa do pao", "kopenhagen", "cacau show", "brasil cacau", "ben jerry", "gelato",
  ],
  Mercado: [
    "supermercado", "carrefour", "pao de acucar", "assai", "atacadao", "extra hiper", "dia supermercado", "hortifruti", "sacolao",
    "acougue", "mercadinho", "big bompreco", "bompreco", "mambo", "st marche", "oba hortifruti", "sams club", "makro", "tenda atacado", "guanabara",
    "prezunic", "zaffari", "angeloni", "condor",
  ],
  Saude: [
    "farmacia", "drogaria", "drogasil", "droga raia", "pacheco", "ultrafarma", "pague menos", "panvel", "onofre", "unimed", "amil saude", "bradesco saude",
    "sulamerica saude", "hapvida", "notredame", "hospital", "clinica", "laboratorio", "fleury", "lavoisier", "exame", "dentista",
    "odonto", "psicolog", "fisioterap", "academia", "smart fit", "smartfit", "bluefit", "bio ritmo",
  ],
  Assinaturas: [
    "netflix", "spotify", "disney", "hbo", "max.com", "prime video", "amazon prime", "youtube premium", "youtubepremium", "apple.com/bill", "apple music",
    "icloud", "google one", "google storage", "deezer", "globoplay", "paramount", "star+", "crunchyroll", "telecine", "chatgpt", "openai", "microsoft 365",
    "adobe", "dropbox", "canva", "linkedin premium", "playstation plus", "xbox game pass", "nintendo online",
  ],
  Moradia: [
    "aluguel", "condominio", "iptu", "enel", "cpfl", "light ", "cemig", "energisa", "equatorial", "neoenergia", "sabesp", "copasa", "sanepar", "cedae",
    "comgas", "naturgy", "vivo fibra", "claro net", "claro residencial", "oi fibra", "net virtua", "tim live", "leroy merlin", "telhanorte", "c&c",
    "tok&stok", "tok stok", "madeira madeira",
  ],
  Educacao: [
    "escola", "colegio", "faculdade", "universidade", "curso", "udemy", "alura", "coursera", "duolingo", "wizard", "ccaa",
    "fisk", "cultura inglesa", "livraria", "saraiva", "estante virtual", "kindle",
  ],
  Compras: [
    "amazon", "mercado livre", "mercadolivre", "shopee", "aliexpress", "shein", "magazine luiza", "magalu", "americanas", "submarino", "casas bahia",
    "ponto frio", "kabum", "fast shop", "carrefour.com", "renner", "c&a", "riachuelo", "marisa", "zara", "hering", "farm rio", "netshoes", "centauro",
    "decathlon", "dafiti", "zattini", "natura", "boticario", "o boticario", "sephora", "miniso", "daiso", "etna", "camicado", "havaianas",
    "arezzo", "schutz",
  ],
  Lazer: [
    "cinema", "cinemark", "kinoplex", "uci cinemas", "ingresso", "sympla", "eventim", "ticketmaster", "steam", "epic games", "psn", "xbox", "nuuvem", "teatro",
    "show ", "parque", "hopi hari", "beto carrero", "hotel", "airbnb", "booking", "decolar", "cvc",
  ],
};

/** Outros nomes que as famílias dão às categorias ("Comida" recebe as regras de Restaurantes). */
const ALIASES: Record<string, string[]> = {
  comida: ["Restaurantes"],
  alimentacao: ["Restaurantes", "Mercado"],
  refeicoes: ["Restaurantes"],
  delivery: ["Restaurantes"],
  lanches: ["Restaurantes"],
  restaurante: ["Restaurantes"],
  "comer fora": ["Restaurantes"],
  supermercado: ["Mercado"],
  feira: ["Mercado"],
  shopping: ["Compras"],
  roupas: ["Compras"],
  "compras gerais": ["Compras"],
  carro: ["Transporte"],
  veiculo: ["Transporte"],
  combustivel: ["Transporte"],
  farmacia: ["Saude"],
  academia: ["Saude"],
  streaming: ["Assinaturas"],
  casa: ["Moradia"],
  contas: ["Moradia"],
  escola: ["Educacao"],
  estudos: ["Educacao"],
  diversao: ["Lazer"],
  viagem: ["Lazer"],
};

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** "Saúde" e "saude" são a mesma categoria. */
export const categoryKey = fold;

/**
 * Regras que faltam para uma família: só para categorias que ela tem (pelo nome) e que ainda não têm esse texto.
 * Nunca mexe nas regras que ela já criou.
 */
export function missingDefaultRules(categories: { id: string; name: string }[], existingPatterns: string[]) {
  const have = new Set(existingPatterns.map(fold));
  const out: { categoryId: string; pattern: string }[] = [];
  const keyOf = (name: string) => Object.keys(DEFAULT_RULES).find((k) => fold(k) === fold(name));
  for (const c of categories) {
    const keys = [...new Set([keyOf(c.name), ...(ALIASES[fold(c.name)] ?? []).map(keyOf)].filter((k): k is string => !!k))];
    for (const key of keys) {
      for (const pattern of DEFAULT_RULES[key]) {
        if (have.has(fold(pattern))) continue;
        have.add(fold(pattern));
        out.push({ categoryId: c.id, pattern });
      }
    }
  }
  return out;
}

/** Para a migração: pares (nome da categoria sem acento, texto) de tudo o que as regras prontas cobrem. */
export function defaultRulePairs(): [string, string][] {
  const names = [...Object.keys(DEFAULT_RULES).map(fold), ...Object.keys(ALIASES)];
  const pairs: [string, string][] = [];
  for (const n of names) {
    const keys = [...(Object.keys(DEFAULT_RULES).find((k) => fold(k) === n) ? [Object.keys(DEFAULT_RULES).find((k) => fold(k) === n)!] : []), ...(ALIASES[n] ?? [])];
    for (const k of new Set(keys)) for (const p of DEFAULT_RULES[Object.keys(DEFAULT_RULES).find((x) => fold(x) === fold(k))!]) pairs.push([n, fold(p)]);
  }
  return pairs;
}
