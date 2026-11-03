import "dotenv/config";
import "reflect-metadata";
import { DataSource } from "typeorm";

import { Moradia } from "../models/Moradia";
import { Usuario } from "../models/Usuario";
import { AsaasWebhookEvent, Locacao, PagamentoAluguel } from "../models/Locacao";

const databaseUrl = process.env.DATABASE_URL;
const connectionOptions = databaseUrl
    ? {
        type: "postgres" as const,
        url: databaseUrl,
        ssl: { rejectUnauthorized: true },
        poolSize: 5
    }
    : {
        type: "better-sqlite3" as const,
        database: "database.sqlite"
    };

export const BancoDeDados = new DataSource({
    ...connectionOptions,

    synchronize: true,
    logging: false,

    entities: [
        Moradia,
        Usuario,
        Locacao,
        PagamentoAluguel,
        AsaasWebhookEvent
    ],

    migrations: [],
    subscribers: [],
});