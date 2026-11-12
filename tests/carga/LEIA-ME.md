# Teste de carga

Mede o Birion com muitos acessos ao mesmo tempo, **só contra o app local** (nunca o site publicado: gasta crédito do Netlify e mexe no banco real).

```bash
NEXT_DIST_DIR=.next-carga npx next build                    # cópia separada, não mexe no app em uso
NEXT_DIST_DIR=.next-carga LOCAL_HTTP=1 npx next start -p 3002
npm run carga:semear                                         # família grande de teste (@carga.test)
npm run test:carga antes                                     # grava tests/carga/resultado-antes.json
npm run carga:limpar                                         # apaga a família de teste
```

Leia os números como **relativos** (antes × depois): o banco local passa por um intermediário Node de uma sessão só, que serializa as consultas
(~4 páginas/s no máximo) e pode estourar a memória sob muita carga (`financas` já sobe com `--max-old-space-size=4096`). Não é a capacidade do Netlify DB.
