// Gera o package.json do pacote da Hostinger (a Hostinger apaga node_modules e roda `npm install`).
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const dir = process.argv[2] ?? "dist";
// As dependências do app (a Hostinger roda `npm install` com elas; o node_modules do pacote é descartado).
const dependencies = JSON.parse(readFileSync("package.json", "utf8")).dependencies;
const pkg = {
  name: "birion-couple",
  private: true,
  scripts: { build: "node -e \"console.log('pacote pronto, nada para compilar')\"", start: "node server.js" },
  engines: { node: ">=20.9.0" },
  dependencies,
};
writeFileSync(join(dir, "package.json"), JSON.stringify(pkg, null, 2) + "\n");
console.log(`package.json do pacote: ${Object.keys(dependencies).length} dependências`);
