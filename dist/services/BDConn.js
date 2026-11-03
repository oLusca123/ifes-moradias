"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BancoDeDados = void 0;
require("dotenv/config");
require("reflect-metadata");
const typeorm_1 = require("typeorm");
const Moradia_1 = require("../models/Moradia");
const Usuario_1 = require("../models/Usuario");
const Locacao_1 = require("../models/Locacao");
const databaseUrl = process.env.DATABASE_URL;
const connectionOptions = databaseUrl
    ? {
        type: "postgres",
        url: databaseUrl,
        ssl: { rejectUnauthorized: true },
        poolSize: 5
    }
    : {
        type: "better-sqlite3",
        database: "database.sqlite"
    };
exports.BancoDeDados = new typeorm_1.DataSource({
    ...connectionOptions,
    synchronize: true,
    logging: false,
    entities: [
        Moradia_1.Moradia,
        Usuario_1.Usuario,
        Locacao_1.Locacao,
        Locacao_1.PagamentoAluguel,
        Locacao_1.AsaasWebhookEvent
    ],
    migrations: [],
    subscribers: [],
});
//# sourceMappingURL=BDConn.js.map