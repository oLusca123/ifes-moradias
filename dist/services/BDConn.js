"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BancoDeDados = void 0;
require("reflect-metadata");
const typeorm_1 = require("typeorm");
const Moradia_1 = require("../models/Moradia");
const Usuario_1 = require("../models/Usuario");
exports.BancoDeDados = new typeorm_1.DataSource({
    type: "sqlite",
    database: "database.sqlite",
    synchronize: true,
    logging: false,
    entities: [
        Moradia_1.Moradia,
        Usuario_1.Usuario
    ],
    migrations: [],
    subscribers: [],
});
//# sourceMappingURL=BDConn.js.map