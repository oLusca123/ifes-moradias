"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthController = void 0;
const bcrypt_1 = __importDefault(require("bcrypt"));
const BDConn_1 = require("../services/BDConn");
const Usuario_1 = require("../models/Usuario");
class AuthController {
    // ==========================================================
    // PÁGINA DE LOGIN
    // ==========================================================
    static async loginPage(req, res) {
        const redirect = typeof req.query.redirect === "string" ? req.query.redirect : "/moradias";
        return res.render("auth/login", {
            erro: null,
            redirect
        });
    }
    // ==========================================================
    // REALIZAR LOGIN
    // ==========================================================
    static async login(req, res) {
        try {
            const { email, senha } = req.body;
            const redirect = typeof req.body.redirect === "string" && req.body.redirect ? req.body.redirect : "/moradias";
            if (!email || !senha) {
                return res.render("auth/login", {
                    erro: "Preencha todos os campos.",
                    redirect
                });
            }
            const repo = BDConn_1.BancoDeDados.getRepository(Usuario_1.Usuario);
            const usuario = await repo.findOne({
                where: {
                    email
                }
            });
            if (!usuario) {
                return res.render("auth/login", {
                    erro: "E-mail ou senha incorretos.",
                    redirect
                });
            }
            const senhaCorreta = await bcrypt_1.default.compare(senha, usuario.senha);
            if (!senhaCorreta) {
                return res.render("auth/login", {
                    erro: "E-mail ou senha incorretos.",
                    redirect
                });
            }
            // ==================================================
            // SESSÃO
            // ==================================================
            const sessao = req.session;
            sessao.usuarioId = usuario.id;
            sessao.usuarioNome = usuario.nome;
            sessao.usuarioTipo = usuario.tipo;
            sessao.usuarioFoto = Boolean(usuario.fotoTipo);
            return res.redirect(redirect);
        }
        catch (error) {
            console.error("Erro ao realizar login:", error);
            return res.status(500).send("Erro interno ao realizar login.");
        }
    }
    // ==========================================================
    // PÁGINA DE CADASTRO
    // ==========================================================
    static async cadastroPage(req, res) {
        return res.render("auth/cadastro", {
            erro: null
        });
    }
    // ==========================================================
    // REALIZAR CADASTRO
    // ==========================================================
    static async cadastro(req, res) {
        try {
            const { nome, email, senha, confirmarSenha, telefone } = req.body;
            if (!nome ||
                !email ||
                !senha ||
                !confirmarSenha) {
                return res.render("auth/cadastro", {
                    erro: "Preencha todos os campos obrigatórios."
                });
            }
            if (senha !== confirmarSenha) {
                return res.render("auth/cadastro", {
                    erro: "As senhas não coincidem."
                });
            }
            if (senha.length < 6) {
                return res.render("auth/cadastro", {
                    erro: "A senha deve possuir pelo menos 6 caracteres."
                });
            }
            const repo = BDConn_1.BancoDeDados.getRepository(Usuario_1.Usuario);
            // ==================================================
            // VERIFICAR E-MAIL
            // ==================================================
            const usuarioExistente = await repo.findOne({
                where: {
                    email
                }
            });
            if (usuarioExistente) {
                return res.render("auth/cadastro", {
                    erro: "Já existe uma conta utilizando este e-mail."
                });
            }
            // ==================================================
            // CRIPTOGRAFAR SENHA
            // ==================================================
            const senhaHash = await bcrypt_1.default.hash(senha, 12);
            // ==================================================
            // CRIAR USUÁRIO
            // ==================================================
            const novoUsuario = repo.create({
                nome,
                email,
                senha: senhaHash,
                telefone,
                tipo: Usuario_1.TipoUsuario.COMUM
            });
            await repo.save(novoUsuario);
            return res.redirect("/login");
        }
        catch (error) {
            console.error("Erro ao cadastrar usuário:", error);
            return res.status(500).send("Erro interno ao realizar cadastro.");
        }
    }
    // ==========================================================
    // LOGOUT
    // ==========================================================
    static async logout(req, res) {
        req.session.destroy((error) => {
            if (error) {
                console.error("Erro ao encerrar sessão:", error);
                return res.status(500).send("Erro ao sair da conta.");
            }
            return res.redirect("/moradias");
        });
    }
}
exports.AuthController = AuthController;
//# sourceMappingURL=AuthController.js.map