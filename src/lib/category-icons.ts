import {
  Baby,
  BookOpen,
  Bus,
  Car,
  Coffee,
  Droplets,
  Dumbbell,
  Fuel,
  Gamepad2,
  Gift,
  GraduationCap,
  HeartPulse,
  House,
  PartyPopper,
  PawPrint,
  Pill,
  Plane,
  Scissors,
  Shirt,
  ShoppingCart,
  Smartphone,
  Tag,
  Tv,
  UtensilsCrossed,
  Wallet,
  Wifi,
  Wrench,
  Zap,
  type LucideIcon,
} from "lucide-react";

/** Ícones que dá para escolher para uma categoria (a chave é o que fica salvo no banco). */
export const CATEGORY_ICONS: { key: string; label: string; Icon: LucideIcon }[] = [
  { key: "cart", label: "Mercado", Icon: ShoppingCart },
  { key: "home", label: "Casa", Icon: House },
  { key: "car", label: "Carro", Icon: Car },
  { key: "bus", label: "Ônibus", Icon: Bus },
  { key: "fuel", label: "Combustível", Icon: Fuel },
  { key: "health", label: "Saúde", Icon: HeartPulse },
  { key: "pill", label: "Remédio", Icon: Pill },
  { key: "party", label: "Lazer", Icon: PartyPopper },
  { key: "education", label: "Educação", Icon: GraduationCap },
  { key: "book", label: "Livros", Icon: BookOpen },
  { key: "tv", label: "Assinaturas", Icon: Tv },
  { key: "food", label: "Restaurante", Icon: UtensilsCrossed },
  { key: "coffee", label: "Café", Icon: Coffee },
  { key: "shirt", label: "Roupas", Icon: Shirt },
  { key: "gift", label: "Presentes", Icon: Gift },
  { key: "plane", label: "Viagem", Icon: Plane },
  { key: "pet", label: "Pet", Icon: PawPrint },
  { key: "baby", label: "Filhos", Icon: Baby },
  { key: "phone", label: "Celular", Icon: Smartphone },
  { key: "wifi", label: "Internet", Icon: Wifi },
  { key: "bolt", label: "Luz", Icon: Zap },
  { key: "water", label: "Água", Icon: Droplets },
  { key: "tools", label: "Manutenção", Icon: Wrench },
  { key: "gym", label: "Academia", Icon: Dumbbell },
  { key: "game", label: "Jogos", Icon: Gamepad2 },
  { key: "beauty", label: "Beleza", Icon: Scissors },
  { key: "money", label: "Dinheiro", Icon: Wallet },
  { key: "tag", label: "Outros", Icon: Tag },
];

export const ICON_KEYS = CATEGORY_ICONS.map((i) => i.key) as [string, ...string[]];
const BY_KEY = new Map(CATEGORY_ICONS.map((i) => [i.key, i.Icon]));

export function iconFor(key: string | null | undefined): LucideIcon {
  return (key && BY_KEY.get(key)) || Tag;
}

const normalize = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/** Ícone sugerido pelo nome da categoria (para as padrões e para categorias novas). */
export function suggestIcon(name: string): string {
  const n = normalize(name);
  const rules: [RegExp, string][] = [
    [/mercado|supermerc|feira|compra/, "cart"],
    [/moradia|casa|aluguel|condominio/, "home"],
    [/transporte|uber|taxi|carro/, "car"],
    [/onibus|metro/, "bus"],
    [/combust|gasolina|posto/, "fuel"],
    [/saude|medic|consulta|hospital/, "health"],
    [/remedio|farmacia/, "pill"],
    [/lazer|diversao|festa/, "party"],
    [/educa|escola|faculdade|curso/, "education"],
    [/livro/, "book"],
    [/assinatura|streaming|netflix|spotify/, "tv"],
    [/restaurante|comida|delivery|ifood|lanche/, "food"],
    [/cafe|padaria/, "coffee"],
    [/roupa|vestu/, "shirt"],
    [/presente/, "gift"],
    [/viagem|passagem|hotel/, "plane"],
    [/pet|cachorro|gato|veterin/, "pet"],
    [/filho|bebe|crianca/, "baby"],
    [/celular|telefone/, "phone"],
    [/internet|wifi/, "wifi"],
    [/luz|energia/, "bolt"],
    [/agua/, "water"],
    [/manutencao|reforma|conserto/, "tools"],
    [/academia|esporte/, "gym"],
    [/jogo|game/, "game"],
    [/beleza|salao|cabelo/, "beauty"],
    [/salario|renda|dinheiro|investimento/, "money"],
  ];
  return rules.find(([r]) => r.test(n))?.[1] ?? "tag";
}
