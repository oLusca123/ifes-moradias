"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("reflect-metadata");
require("dotenv/config");
const express_1 = __importDefault(require("express"));
const path_1 = __importDefault(require("path"));
const express_session_1 = __importDefault(require("express-session"));
const BDConn_1 = require("./services/BDConn");
const routers_1 = require("./routers");
const app = (0, express_1.default)();
// ==========================================================
// MIDDLEWARE
// ==========================================================
app.use(express_1.default.urlencoded({
    extended: true
}));
app.use(express_1.default.json());
// ==========================================================
// SESSÃO
// ==========================================================
app.use((0, express_session_1.default)({
    secret: "moradia-ifes-segredo",
    resave: false,
    saveUninitialized: false,
    cookie: {
        maxAge: 1000 * 60 * 60 * 24
    }
}));
// ==========================================================
// EJS
// ==========================================================
app.set("view engine", "ejs");
const viewsPath = process.env.NODE_ENV === "production"
    ? path_1.default.join(__dirname, "views")
    : path_1.default.join(process.cwd(), "src", "views");
app.set("views", viewsPath);
// ==========================================================
// ARQUIVOS ESTÁTICOS
// ==========================================================
app.use(express_1.default.static(path_1.default.join(process.cwd(), "public")));
// ==========================================================
// ROTA PRINCIPAL
// ==========================================================
app.get("/", (req, res) => {
    res.redirect("/moradias");
});
// ==========================================================
// ROTAS
// ==========================================================
app.use("/", routers_1.router);
// ==========================================================
// BANCO + SERVIDOR
// ==========================================================
BDConn_1.BancoDeDados.initialize()
    .then(() => {
    console.log("Banco de dados conectado!");
    app.listen(3000, () => {
        console.log("Servidor rodando em http://localhost:3000");
    });
})
    .catch((err) => {
    console.error("Erro ao conectar ao banco:", err);
});
//# sourceMappingURL=index.js.map