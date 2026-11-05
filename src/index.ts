import "reflect-metadata";
import "dotenv/config";

import express from "express";
import path from "path";
import session from "express-session";
import { randomBytes } from "crypto";

import { BancoDeDados } from "./services/BDConn";
import { router } from "./routers";
import { AsaasWebhookController } from "./controllers/AsaasWebhookController";

const app = express();
const sessionSecret = process.env.SESSION_SECRET;
if (process.env.NODE_ENV === "production" && !sessionSecret) {
    throw new Error("SESSION_SECRET é obrigatória em produção.");
}
const activeSessionSecret = sessionSecret || randomBytes(32).toString("hex");
const port = Number(process.env.PORT) || 3000;

if (process.env.NODE_ENV === "production") {
    app.set("trust proxy", 1);
}


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
        secret: activeSessionSecret,
        resave: false,
        saveUninitialized: false,

        cookie: {
            maxAge: 1000 * 60 * 60 * 24,
            httpOnly: true,
            sameSite: "lax",
            secure: process.env.NODE_ENV === "production"
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

        void AsaasWebhookController.processPendingEvents().catch((err) => {
            console.error("Erro ao iniciar a reconciliação de webhooks Asaas:", err);
        });
        const webhookRetryTimer = setInterval(() => {
            void AsaasWebhookController.processPendingEvents().catch((err) => {
                console.error("Erro na reconciliação periódica de webhooks Asaas:", err);
            });
        }, 30_000);
        webhookRetryTimer.unref();

        app.listen(
            port,
            () => {

                console.log(
                    `Servidor rodando na porta ${port}`
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