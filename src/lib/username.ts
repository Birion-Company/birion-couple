/**
 * Nome de usuário (@fulano): único no Birion, 3 a 20 letras minúsculas, números, ponto ou "_".
 * Não pode ter palavrão nem ofensa (confere também trocando números por letras: "p0rr4" → "porra").
 */
export const USERNAME_MIN = 3;
export const USERNAME_MAX = 20;

const BAD = [
  // português
  "porra", "caralh", "buceta", "boceta", "xoxota", "xereca", "piroca", "pica", "rola", "cacete", "foder", "foda", "fodid", "fudid", "fuder",
  "puta", "puto", "putinha", "putaria", "prostitut", "vagabund", "vadia", "piranha", "cuzao", "cuzinho", "arromb", "babaca", "otario", "otaria",
  "merda", "bosta", "viado", "veado", "bicha", "sapatao", "traveco", "corno", "cornudo", "punheta", "siririca", "chupa", "mamada", "boquete",
  "escroto", "desgraca", "retardad", "mongol", "macaco", "crioulo", "nazi", "hitler", "estupr", "pedofil", "pedof", "porn", "xvideo",
  "transa", "tesao", "safad", "penis", "vagina", "anus", "bunda", "peitud", "rapariga", "quenga", "meretriz", "nojent", "imbecil", "idiota",
  // inglês
  "fuck", "shit", "bitch", "cunt", "dick", "cock", "pussy", "whore", "slut", "nigg", "fag", "rape", "sex", "asshole", "bastard", "retard",
];

/** "Ação.Sóbria" → "acao.sobria" (sem acento, minúsculas). */
export function normalizeUsername(raw: string) {
  return raw
    .trim()
    .replace(/^@/, "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

/** Troca números e símbolos parecidos por letras e tira separadores, para achar palavrão disfarçado. */
function unmask(s: string) {
  return s
    .replace(/0/g, "o")
    .replace(/1/g, "i")
    .replace(/3/g, "e")
    .replace(/4/g, "a")
    .replace(/5/g, "s")
    .replace(/7/g, "t")
    .replace(/8/g, "b")
    .replace(/[._]/g, "")
    .replace(/(.)\1+/g, "$1");
}

export function hasBadWord(s: string) {
  const plain = s.replace(/[._]/g, "");
  const masked = unmask(s);
  return BAD.some((w) => plain.includes(w) || masked.includes(w.replace(/(.)\1+/g, "$1")));
}

/** Confere o formato. Devolve o nome normalizado ou a mensagem de erro. */
export function checkUsername(raw: string): { ok: true; value: string } | { ok: false; error: string } {
  const v = normalizeUsername(raw);
  if (v.length < USERNAME_MIN) return { ok: false, error: `O nome de usuário precisa ter pelo menos ${USERNAME_MIN} caracteres.` };
  if (v.length > USERNAME_MAX) return { ok: false, error: `O nome de usuário pode ter até ${USERNAME_MAX} caracteres.` };
  if (!/^[a-z0-9._]+$/.test(v)) return { ok: false, error: "Use só letras, números, ponto ou _ (sem espaço)." };
  if (/^[._]|[._]$/.test(v) || /[._]{2}/.test(v)) return { ok: false, error: "Ponto e _ não podem ficar no começo, no fim ou repetidos." };
  if (/^\d+$/.test(v)) return { ok: false, error: "O nome de usuário precisa ter alguma letra." };
  if (hasBadWord(v)) return { ok: false, error: "Escolha outro nome de usuário: esse não é permitido." };
  return { ok: true, value: v };
}

/** Sugestão a partir do nome: "Felipe Gabriel" → "felipe.gabriel". */
export function suggestUsername(name: string) {
  const base = normalizeUsername(name)
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.+|\.+$/g, "")
    .slice(0, USERNAME_MAX - 4);
  return base.length >= USERNAME_MIN && !hasBadWord(base) ? base : "pessoa";
}
