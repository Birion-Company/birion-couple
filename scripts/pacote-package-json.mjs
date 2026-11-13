// Gera o package.json do pacote da Hostinger: lista as dependências que o Next deixou em node_modules do pacote
// (a Hostinger apaga node_modules e roda `npm install`, então elas precisam estar declaradas aqui).
import { readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const dir = process.argv[2] ?? "dist";
const nm = join(dir, "node_modules");
const dependencies = {};
const version = (p) => JSON.parse(readFileSync(join(p, "package.json"), "utf8")).version;
for (const d of existsSync(nm) ? readdirSync(nm) : []) {
  if (d.startsWith(".")) continue;
  if (d.startsWith("@")) for (const s of readdirSync(join(nm, d))) dependencies[`${d}/${s}`] = version(join(nm, d, s));
  else dependencies[d] = version(join(nm, d));
}
const pkg = {
  name: "birion-couple",
  private: true,
  scripts: { build: "node -e \"console.log('pacote pronto, nada para compilar')\"", start: "node server.js" },
  engines: { node: ">=20.9.0" },
  dependencies,
};
writeFileSync(join(dir, "package.json"), JSON.stringify(pkg, null, 2) + "\n");
console.log(`package.json do pacote: ${Object.keys(dependencies).length} dependências`);
