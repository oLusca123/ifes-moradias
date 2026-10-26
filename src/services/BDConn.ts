import "reflect-metadata";
import { DataSource } from "typeorm";

import { Moradia } from "../models/Moradia";
import { Usuario } from "../models/Usuario";

export const BancoDeDados = new DataSource({
    type: "better-sqlite3",
    database: "database.sqlite",

    synchronize: true,
    logging: false,

    entities: [
        Moradia,
        Usuario
    ],

    migrations: [],
    subscribers: [],
});