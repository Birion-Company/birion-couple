import { connect } from "./comum.mjs";
const c = await connect();
await c.query(`delete from households where name = 'Família Carga'`);
await c.query(`delete from users where email like '%@carga.test'`);
console.log("Família de carga apagada.");
await c.end();
