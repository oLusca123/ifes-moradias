import { Request, Response } from "express";
import bcrypt from "bcrypt";

import { BancoDeDados } from "../services/BDConn";
import { Usuario, TipoUsuario } from "../models/Usuario";

export class AuthController {

    // ==========================================================
    // PÁGINA DE LOGIN
    // ==========================================================

    static async loginPage(req: Request, res: Response) {
        const redirect = typeof req.query.redirect === "string" ? req.query.redirect : "/moradias";

        return res.render("auth/login", {
            erro: null,
            redirect
        });
    }


    // ==========================================================
    // REALIZAR LOGIN
    // ==========================================================

    static async login(req: Request, res: Response) {

        try {

            const { email, senha } = req.body;
            const redirect = typeof req.body.redirect === "string" && req.body.redirect ? req.body.redirect : "/moradias";

            if (!email || !senha) {
                return res.render("auth/login", {
                    erro: "Preencha todos os campos.",
                    redirect
                });
            }

            const repo = BancoDeDados.getRepository(Usuario);

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

            const senhaCorreta = await bcrypt.compare(
                senha,
                usuario.senha
            );

            if (!senhaCorreta) {
                return res.render("auth/login", {
                    erro: "E-mail ou senha incorretos.",
                    redirect
                });
            }

            // ==================================================
            // SESSÃO
            // ==================================================

            const sessao = req.session as any;

            sessao.usuarioId = usuario.id;
            sessao.usuarioNome = usuario.nome;
            sessao.usuarioTipo = usuario.tipo;
            sessao.usuarioFoto = Boolean(usuario.fotoTipo);

            return res.redirect(redirect);

        } catch (error) {

            console.error(
                "Erro ao realizar login:",
                error
            );

            return res.status(500).send(
                "Erro interno ao realizar login."
            );
        }
    }


    // ==========================================================
    // PÁGINA DE CADASTRO
    // ==========================================================

    static async cadastroPage(req: Request, res: Response) {

        return res.render("auth/cadastro", {
            erro: null
        });
    }


    // ==========================================================
    // REALIZAR CADASTRO
    // ==========================================================

    static async cadastro(req: Request, res: Response) {

        try {

            const {
                nome,
                email,
                senha,
                confirmarSenha,
                telefone
            } = req.body;

            if (
                !nome ||
                !email ||
                !senha ||
                !confirmarSenha
            ) {

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

            const repo = BancoDeDados.getRepository(Usuario);

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

            const senhaHash = await bcrypt.hash(
                senha,
                12
            );

            // ==================================================
            // CRIAR USUÁRIO
            // ==================================================

            const novoUsuario = repo.create({

                nome,

                email,

                senha: senhaHash,

                telefone,

                tipo: TipoUsuario.COMUM

            });

            await repo.save(novoUsuario);

            return res.redirect("/login");

        } catch (error) {

            console.error(
                "Erro ao cadastrar usuário:",
                error
            );

            return res.status(500).send(
                "Erro interno ao realizar cadastro."
            );
        }
    }


    // ==========================================================
    // LOGOUT
    // ==========================================================

    static async logout(req: Request, res: Response) {

        req.session.destroy((error) => {

            if (error) {

                console.error(
                    "Erro ao encerrar sessão:",
                    error
                );

                return res.status(500).send(
                    "Erro ao sair da conta."
                );
            }

            return res.redirect("/moradias");
        });
    }
}