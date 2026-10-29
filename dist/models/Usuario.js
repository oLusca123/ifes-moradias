"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Usuario = exports.TipoUsuario = void 0;
const typeorm_1 = require("typeorm");
var TipoUsuario;
(function (TipoUsuario) {
    TipoUsuario["COMUM"] = "COMUM";
    TipoUsuario["PROPRIETARIO"] = "PROPRIETARIO";
    TipoUsuario["ADMIN"] = "ADMIN";
})(TipoUsuario || (exports.TipoUsuario = TipoUsuario = {}));
let Usuario = class Usuario {
};
exports.Usuario = Usuario;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)(),
    __metadata("design:type", Number)
], Usuario.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", String)
], Usuario.prototype, "nome", void 0);
__decorate([
    (0, typeorm_1.Column)({ unique: true }),
    __metadata("design:type", String)
], Usuario.prototype, "email", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", String)
], Usuario.prototype, "senha", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true }),
    __metadata("design:type", String)
], Usuario.prototype, "telefone", void 0);
__decorate([
    (0, typeorm_1.Column)({
        type: "text",
        default: TipoUsuario.COMUM
    }),
    __metadata("design:type", String)
], Usuario.prototype, "tipo", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: "blob", nullable: true, select: false }),
    __metadata("design:type", Object)
], Usuario.prototype, "fotoDados", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: "text", nullable: true }),
    __metadata("design:type", Object)
], Usuario.prototype, "fotoTipo", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: "text", nullable: true, unique: true }),
    __metadata("design:type", Object)
], Usuario.prototype, "asaasWalletId", void 0);
exports.Usuario = Usuario = __decorate([
    (0, typeorm_1.Entity)("usuario")
], Usuario);
//# sourceMappingURL=Usuario.js.map