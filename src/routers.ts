import { NextFunction, Request, Response, Router } from "express";
import multer from "multer";

import { MoradiaController } from "./controllers/MoradiaController";
import { AuthController } from "./controllers/AuthController";
import { PerfilController } from "./controllers/PerfilController";

const router = Router();
const maxImageSize = 5 * 1024 * 1024;

const receiveListingImage = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxImageSize },
    fileFilter: (_req, file, callback) => {
        const supportedTypes = ["image/jpeg", "image/png", "image/webp"];
        if (!supportedTypes.includes(file.mimetype)) {
            callback(new Error("Envie uma imagem no formato JPG, PNG ou WebP."));
            return;
        }
        callback(null, true);
    }
}).single("imagem");

const receiveProfilePhoto = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxImageSize },
    fileFilter: (_req, file, callback) => {
        const supportedTypes = ["image/jpeg", "image/png", "image/webp"];
        if (!supportedTypes.includes(file.mimetype)) {
            callback(new Error("Envie uma foto no formato JPG, PNG ou WebP."));
            return;
        }
        callback(null, true);
    }
}).single("foto");

const requireAuth = (req: any, res: any, next: any) => {
    const usuarioId = req.session && req.session.usuarioId;

    if (!usuarioId) {
        const redirect = req.originalUrl && req.originalUrl !== "/login" ? `?redirect=${encodeURIComponent(req.originalUrl)}` : "";
        return res.redirect(`/login${redirect}`);
    }

    return next();
};

const handleListingImageUpload = (req: Request, res: Response, next: NextFunction) => {
    receiveListingImage(req, res, (error) => {
        if (!error) {
            next();
            return;
        }

        if (
            !(error instanceof multer.MulterError)
            && error.message !== "Envie uma imagem no formato JPG, PNG ou WebP."
        ) {
            next(error);
            return;
        }

        const sessao = req.session as any;
        const erro = error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE"
            ? "A imagem deve ter no máximo 5 MB."
            : error instanceof multer.MulterError
                ? "Não foi possível receber a imagem. Tente novamente."
                : error.message;

        res.status(400).render("moradia_novo", {
            erro,
            form: req.body || {},
            usuario: sessao && sessao.usuarioNome ? {
                nome: sessao.usuarioNome,
                tipo: sessao.usuarioTipo
            } : null
        });
    });
};

const handleProfilePhotoUpload = (req: Request, res: Response, next: NextFunction) => {
    receiveProfilePhoto(req, res, (error) => {
        if (!error) {
            next();
            return;
        }

        if (!(error instanceof multer.MulterError) && error.message !== "Envie uma foto no formato JPG, PNG ou WebP.") {
            next(error);
            return;
        }

        const message = error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE"
            ? "A foto deve ter no máximo 5 MB."
            : error instanceof multer.MulterError
                ? "Não foi possível receber a foto. Tente novamente."
                : error.message;
        res.status(400).send(message);
    });
};


// ==========================================================
// MORADIAS
// ==========================================================

router.get(
    "/moradias",
    MoradiaController.list
);

router.get(
    "/moradias/novo",
    requireAuth,
    MoradiaController.novo
);

router.get(
    "/moradias/:id/imagem",
    MoradiaController.image
);

router.get(
    "/moradias/:id",
    requireAuth,
    MoradiaController.show
);

router.post(
    "/moradias/novo",
    requireAuth,
    handleListingImageUpload,
    MoradiaController.create
);

router.get(
    "/perfil",
    requireAuth,
    PerfilController.show
);

router.get(
    "/perfil/foto",
    requireAuth,
    PerfilController.photo
);

router.post(
    "/perfil",
    requireAuth,
    handleProfilePhotoUpload,
    PerfilController.update
);

router.post(
    "/perfil/senha",
    requireAuth,
    PerfilController.changePassword
);

router.post(
    "/perfil/foto/excluir",
    requireAuth,
    PerfilController.deletePhoto
);

router.post(
    "/perfil/moradias/:id/excluir",
    requireAuth,
    PerfilController.removeListing
);


// ==========================================================
// AUTENTICAÇÃO
// ==========================================================

router.get(
    "/login",
    AuthController.loginPage
);

router.post(
    "/login",
    AuthController.login
);


router.get(
    "/cadastro",
    AuthController.cadastroPage
);

router.post(
    "/cadastro",
    AuthController.cadastro
);


router.get(
    "/logout",
    AuthController.logout
);


export { router };