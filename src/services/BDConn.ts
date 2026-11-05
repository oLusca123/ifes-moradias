import "dotenv/config";
import "reflect-metadata";
import { DataSource } from "typeorm";

import { Moradia } from "../models/Moradia";
import { Usuario } from "../models/Usuario";
import { AsaasWebhookEvent, Locacao, LocacaoOperacao, PagamentoAluguel } from "../models/Locacao";
import { AddReliableAsaasFlow1762300000000 } from "../migrations/1762300000000-AddReliableAsaasFlow";

const databaseUrl = process.env.DATABASE_URL;
if (process.env.NODE_ENV === "production" && !databaseUrl) {
    throw new Error("DATABASE_URL é obrigatória em produção.");
}

const connectionOptions = databaseUrl
    ? {
        type: "postgres" as const,
        url: databaseUrl,
        ssl: { rejectUnauthorized: true },
        poolSize: 5
    }
    : {
        type: "better-sqlite3" as const,
        database: process.env.DATABASE_PATH || "database.sqlite"
    };

export const BancoDeDados = new DataSource({
    ...connectionOptions,

    synchronize: !databaseUrl && process.env.NODE_ENV !== "production",
    migrationsRun: false,
    migrationsTableName: "migrations",
    logging: false,

    entities: [
        Moradia,
        Usuario,
        Locacao,
        LocacaoOperacao,
        PagamentoAluguel,
        AsaasWebhookEvent
    ],

    migrations: [AddReliableAsaasFlow1762300000000],
    subscribers: [],
});