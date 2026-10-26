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
exports.Moradia = void 0;
const typeorm_1 = require("typeorm");
let Moradia = class Moradia {
};
exports.Moradia = Moradia;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)(),
    __metadata("design:type", Number)
], Moradia.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", String)
], Moradia.prototype, "titulo", void 0);
__decorate([
    (0, typeorm_1.Column)("decimal", { precision: 10, scale: 2, default: 0 }),
    __metadata("design:type", Number)
], Moradia.prototype, "preco", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: "Próximo ao IFES" }),
    __metadata("design:type", String)
], Moradia.prototype, "distancia", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: "Santa Teresa" }),
    __metadata("design:type", String)
], Moradia.prototype, "bairro", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: "Casa" }),
    __metadata("design:type", String)
], Moradia.prototype, "tipo", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: 1 }),
    __metadata("design:type", Number)
], Moradia.prototype, "quartos", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: 1 }),
    __metadata("design:type", Number)
], Moradia.prototype, "banheiros", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: 1 }),
    __metadata("design:type", Number)
], Moradia.prototype, "vagas", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: "Contato via plataforma" }),
    __metadata("design:type", String)
], Moradia.prototype, "telefone", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: "Próximo ao campus" }),
    __metadata("design:type", String)
], Moradia.prototype, "localizacao", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: "text", default: "" }),
    __metadata("design:type", String)
], Moradia.prototype, "descricao", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", String)
], Moradia.prototype, "imagem", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: "blob", nullable: true, select: false }),
    __metadata("design:type", Object)
], Moradia.prototype, "imagemDados", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: "text", nullable: true }),
    __metadata("design:type", Object)
], Moradia.prototype, "imagemTipo", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: "text", default: "[]" }),
    __metadata("design:type", String)
], Moradia.prototype, "comodidades", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: false }),
    __metadata("design:type", Boolean)
], Moradia.prototype, "demonstracao", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: "integer", nullable: true }),
    __metadata("design:type", Object)
], Moradia.prototype, "proprietarioId", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: true }),
    __metadata("design:type", Boolean)
], Moradia.prototype, "disponivel", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: false }),
    __metadata("design:type", Boolean)
], Moradia.prototype, "destaque", void 0);
exports.Moradia = Moradia = __decorate([
    (0, typeorm_1.Entity)("moradia")
], Moradia);
//# sourceMappingURL=Moradia.js.map