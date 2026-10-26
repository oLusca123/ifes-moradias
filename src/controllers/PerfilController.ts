import { Request, Response } from "express";
import bcrypt from "bcrypt";
import { BancoDeDados } from "../services/BDConn";
import { Moradia } from "../models/Moradia";
import { Usuario } from "../models/Usuario";

export class PerfilController {
    private static getUsuarioId(req: Request): number {
        return Number((req.session as any).usuarioId);
    }

    private static async renderPerfil(
        req: Request,
        res: Response,
        options: { erro?: string; usuario?: Usuario } = {}
    ) {
        const usuario = options.usuario || await BancoDeDados.getRepository(Usuario)
            .findOne({ where: { id: PerfilController.getUsuarioId(req) } });

        if (!usuario) {
            return res.status(404).send("Usuário não encontrado.");
        }

        const moradias = await BancoDeDados.getRepository(Moradia).find({
            where: { proprietarioId: usuario.id },
            order: { id: "DESC" }
        });

        return res.status(options.erro ? 400 : 200).render("perfil", {
            usuario,
            moradias,
            erro: options.erro || null,
            sucesso: req.query.sucesso === "1",
            senhaAtualizada: req.query.senhaAtualizada === "1",
            removida: req.query.removida === "1"
        });
    }

    static async show(req: Request, res: Response) {
        try {
            return await PerfilController.renderPerfil(req, res);
        } catch (error) {
            console.error("Erro ao carregar perfil:", error);
            return res.status(500).send("Erro ao carregar o perfil.");
        }
    }

    static async photo(req: Request, res: Response) {
        try {
            const usuario = await BancoDeDados.getRepository(Usuario)
                .createQueryBuilder("usuario")
                .addSelect("usuario.fotoDados")
                .where("usuario.id = :id", { id: PerfilController.getUsuarioId(req) })
                .getOne();

            if (!usuario?.fotoDados || !usuario.fotoTipo) {
                return res.status(404).send("Foto de perfil não encontrada.");
            }

            return res
                .type(usuario.fotoTipo)
                .set("X-Content-Type-Options", "nosniff")
                .set("Cache-Control", "private, max-age=3600")
                .send(usuario.fotoDados);
        } catch (error) {
            console.error("Erro ao carregar foto do perfil:", error);
            return res.status(500).send("Erro ao carregar a foto do perfil.");
        }
    }

    static async update(req: Request, res: Response) {
        try {
            const usuarioRepo = BancoDeDados.getRepository(Usuario);
            const usuario = await usuarioRepo.findOne({
                where: { id: PerfilController.getUsuarioId(req) }
            });

            if (!usuario) {
                return res.status(404).send("Usuário não encontrado.");
            }

            const nome = typeof req.body.nome === "string" ? req.body.nome.trim() : "";
            const email = typeof req.body.email === "string" ? req.body.email.trim().toLowerCase() : "";
            const telefone = typeof req.body.telefone === "string" ? req.body.telefone.trim() : "";

            if (!nome || nome.length > 100 || !email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
                return await PerfilController.renderPerfil(req, res, {
                    usuario: Object.assign(usuario, { nome, email, telefone }),
                    erro: "Informe um nome e um e-mail válidos."
                });
            }

            if (req.file) {
                const { mimetype, buffer } = req.file;
                const jpgValid = mimetype === "image/jpeg"
                    && buffer.length >= 3
                    && buffer[0] === 0xff
                    && buffer[1] === 0xd8
                    && buffer[2] === 0xff;
                const pngValid = mimetype === "image/png"
                    && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
                const webpValid = mimetype === "image/webp"
                    && buffer.subarray(0, 4).toString() === "RIFF"
                    && buffer.subarray(8, 12).toString() === "WEBP";

                if (!jpgValid && !pngValid && !webpValid) {
                    return await PerfilController.renderPerfil(req, res, {
                        usuario: Object.assign(usuario, { nome, email, telefone }),
                        erro: "O arquivo enviado não é uma imagem JPG, PNG ou WebP válida."
                    });
                }
            }

            const emailExistente = await usuarioRepo.findOne({ where: { email } });
            if (emailExistente && emailExistente.id !== usuario.id) {
                return await PerfilController.renderPerfil(req, res, {
                    usuario: Object.assign(usuario, { nome, email, telefone }),
                    erro: "Este e-mail já está sendo usado por outra conta."
                });
            }

            usuario.nome = nome;
            usuario.email = email;
            usuario.telefone = telefone;
            if (req.file) {
                usuario.fotoDados = req.file.buffer;
                usuario.fotoTipo = req.file.mimetype;
            }

            await usuarioRepo.save(usuario);
            (req.session as any).usuarioNome = usuario.nome;
            if (req.file) {
                (req.session as any).usuarioFoto = true;
            }

            return res.redirect("/perfil?sucesso=1");
        } catch (error) {
            console.error("Erro ao atualizar perfil:", error);
            return res.status(500).send("Erro ao atualizar o perfil.");
        }
    }

    static async changePassword(req: Request, res: Response) {
        try {
            const senhaAtual = typeof req.body.senhaAtual === "string" ? req.body.senhaAtual : "";
            const novaSenha = typeof req.body.novaSenha === "string" ? req.body.novaSenha : "";
            const confirmarSenha = typeof req.body.confirmarSenha === "string" ? req.body.confirmarSenha : "";

            const usuarioRepo = BancoDeDados.getRepository(Usuario);
            const usuario = await usuarioRepo.findOne({
                where: { id: PerfilController.getUsuarioId(req) }
            });

            if (!usuario) {
                return res.status(404).send("Usuário não encontrado.");
            }

            if (!senhaAtual || !await bcrypt.compare(senhaAtual, usuario.senha)) {
                return await PerfilController.renderPerfil(req, res, {
                    erro: "Digite sua senha atual corretamente para alterá-la."
                });
            }

            if (novaSenha.length < 6 || novaSenha !== confirmarSenha) {
                return await PerfilController.renderPerfil(req, res, {
                    erro: novaSenha.length < 6
                        ? "A nova senha deve ter pelo menos 6 caracteres."
                        : "A confirmação da nova senha não corresponde."
                });
            }

            usuario.senha = await bcrypt.hash(novaSenha, 12);
            await usuarioRepo.save(usuario);

            return res.redirect("/perfil?senhaAtualizada=1");
        } catch (error) {
            console.error("Erro ao alterar senha:", error);
            return res.status(500).send("Erro ao alterar a senha.");
        }
    }

    static async deletePhoto(req: Request, res: Response) {
        try {
            const usuarioRepo = BancoDeDados.getRepository(Usuario);
            const usuario = await usuarioRepo.findOne({
                where: { id: PerfilController.getUsuarioId(req) }
            });

            if (!usuario) {
                return res.status(404).send("Usuário não encontrado.");
            }

            usuario.fotoDados = null;
            usuario.fotoTipo = null;
            await usuarioRepo.save(usuario);
            (req.session as any).usuarioFoto = false;

            return res.redirect("/perfil?sucesso=1");
        } catch (error) {
            console.error("Erro ao remover foto do perfil:", error);
            return res.status(500).send("Erro ao remover a foto do perfil.");
        }
    }

    static async removeListing(req: Request, res: Response) {
        try {
            const id = Number(req.params.id);
            if (!Number.isInteger(id) || id < 1) {
                return res.status(400).send("Identificador de imóvel inválido.");
            }

            const resultado = await BancoDeDados.getRepository(Moradia).delete({
                id,
                proprietarioId: PerfilController.getUsuarioId(req)
            });

            if (!resultado.affected) {
                return res.status(404).send("Imóvel não encontrado entre seus anúncios.");
            }

            return res.redirect("/perfil?removida=1");
        } catch (error) {
            console.error("Erro ao excluir anúncio do perfil:", error);
            return res.status(500).send("Erro ao excluir o anúncio.");
        }
    }
}
