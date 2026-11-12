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
    "doceria", "sorveteria", "bar do", "boteco",
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
  Lazer: [
    "cinema", "cinemark", "kinoplex", "uci cinemas", "ingresso", "sympla", "eventim", "ticketmaster", "steam", "epic games", "psn", "xbox", "nuuvem", "teatro",
    "show ", "parque", "hopi hari", "beto carrero", "hotel", "airbnb", "booking", "decolar", "cvc",
  ],
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
  for (const c of categories) {
    for (const pattern of DEFAULT_RULES[Object.keys(DEFAULT_RULES).find((k) => fold(k) === fold(c.name)) ?? ""] ?? []) {
      if (!have.has(fold(pattern))) out.push({ categoryId: c.id, pattern });
    }
  }
  return out;
}
