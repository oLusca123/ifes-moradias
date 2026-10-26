"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.router = void 0;
const express_1 = require("express");
const multer_1 = __importDefault(require("multer"));
const MoradiaController_1 = require("./controllers/MoradiaController");
const AuthController_1 = require("./controllers/AuthController");
const PerfilController_1 = require("./controllers/PerfilController");
const router = (0, express_1.Router)();
exports.router = router;
const maxImageSize = 5 * 1024 * 1024;
const receiveListingImage = (0, multer_1.default)({
    storage: multer_1.default.memoryStorage(),
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
const receiveProfilePhoto = (0, multer_1.default)({
    storage: multer_1.default.memoryStorage(),
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
const requireAuth = (req, res, next) => {
    const usuarioId = req.session && req.session.usuarioId;
    if (!usuarioId) {
        const redirect = req.originalUrl && req.originalUrl !== "/login" ? `?redirect=${encodeURIComponent(req.originalUrl)}` : "";
        return res.redirect(`/login${redirect}`);
    }
    return next();
};
const handleListingImageUpload = (req, res, next) => {
    receiveListingImage(req, res, (error) => {
        if (!error) {
            next();
            return;
        }
        if (!(error instanceof multer_1.default.MulterError)
            && error.message !== "Envie uma imagem no formato JPG, PNG ou WebP.") {
            next(error);
            return;
        }
        const sessao = req.session;
        const erro = error instanceof multer_1.default.MulterError && error.code === "LIMIT_FILE_SIZE"
            ? "A imagem deve ter no máximo 5 MB."
            : error instanceof multer_1.default.MulterError
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
const handleProfilePhotoUpload = (req, res, next) => {
    receiveProfilePhoto(req, res, (error) => {
        if (!error) {
            next();
            return;
        }
        if (!(error instanceof multer_1.default.MulterError) && error.message !== "Envie uma foto no formato JPG, PNG ou WebP.") {
            next(error);
            return;
        }
        const message = error instanceof multer_1.default.MulterError && error.code === "LIMIT_FILE_SIZE"
            ? "A foto deve ter no máximo 5 MB."
            : error instanceof multer_1.default.MulterError
                ? "Não foi possível receber a foto. Tente novamente."
                : error.message;
        res.status(400).send(message);
    });
};
// ==========================================================
// MORADIAS
// ==========================================================
router.get("/moradias", MoradiaController_1.MoradiaController.list);
router.get("/moradias/novo", requireAuth, MoradiaController_1.MoradiaController.novo);
router.get("/moradias/:id/imagem", MoradiaController_1.MoradiaController.image);
router.get("/moradias/:id", requireAuth, MoradiaController_1.MoradiaController.show);
router.post("/moradias/novo", requireAuth, handleListingImageUpload, MoradiaController_1.MoradiaController.create);
router.get("/perfil", requireAuth, PerfilController_1.PerfilController.show);
router.get("/perfil/foto", requireAuth, PerfilController_1.PerfilController.photo);
router.post("/perfil", requireAuth, handleProfilePhotoUpload, PerfilController_1.PerfilController.update);
router.post("/perfil/senha", requireAuth, PerfilController_1.PerfilController.changePassword);
router.post("/perfil/foto/excluir", requireAuth, PerfilController_1.PerfilController.deletePhoto);
router.post("/perfil/moradias/:id/excluir", requireAuth, PerfilController_1.PerfilController.removeListing);
// ==========================================================
// AUTENTICAÇÃO
// ==========================================================
router.get("/login", AuthController_1.AuthController.loginPage);
router.post("/login", AuthController_1.AuthController.login);
router.get("/cadastro", AuthController_1.AuthController.cadastroPage);
router.post("/cadastro", AuthController_1.AuthController.cadastro);
router.get("/logout", AuthController_1.AuthController.logout);
//# sourceMappingURL=routers.js.map