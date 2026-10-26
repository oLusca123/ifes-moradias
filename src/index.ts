import "reflect-metadata";

import express from "express";
import path from "path";
import session from "express-session";

import { BancoDeDados } from "./services/BDConn";
import { router } from "./routers";

const app = express();


// ==========================================================
// MIDDLEWARE
// ==========================================================

app.use(express.urlencoded({
    extended: true
}));

app.use(express.json());


// ==========================================================
// SESSÃO
// ==========================================================

app.use(
    session({
        secret: "moradia-ifes-segredo",
        resave: false,
        saveUninitialized: false,

        cookie: {
            maxAge: 1000 * 60 * 60 * 24
        }
    })
);


// ==========================================================
// EJS
// ==========================================================

app.set(
    "view engine",
    "ejs"
);

const viewsPath =
    process.env.NODE_ENV === "production"
        ? path.join(__dirname, "views")
        : path.join(process.cwd(), "src", "views");

app.set(
    "views",
    viewsPath
);


// ==========================================================
// ARQUIVOS ESTÁTICOS
// ==========================================================

app.use(
    express.static(
        path.join(
            process.cwd(),
            "public"
        )
    )
);


// ==========================================================
// ROTA PRINCIPAL
// ==========================================================

app.get("/", (req, res) => {

    res.redirect("/moradias");

});


// ==========================================================
// ROTAS
// ==========================================================

app.use("/", router);


// ==========================================================
// BANCO + SERVIDOR
// ==========================================================

BancoDeDados.initialize()

    .then(() => {

        console.log(
            "Banco de dados conectado!"
        );

        app.listen(
            3000,
            () => {

                console.log(
                    "Servidor rodando em http://localhost:3000"
                );

            }
        );

    })

    .catch((err) => {

        console.error(
            "Erro ao conectar ao banco:",
            err
        );

    });