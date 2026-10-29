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
exports.AsaasWebhookEvent = exports.PagamentoAluguel = exports.Locacao = void 0;
const typeorm_1 = require("typeorm");
let Locacao = class Locacao {
};
exports.Locacao = Locacao;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)(),
    __metadata("design:type", Number)
], Locacao.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", Number)
], Locacao.prototype, "moradiaId", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", Number)
], Locacao.prototype, "locatarioId", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", Number)
], Locacao.prototype, "proprietarioId", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", String)
], Locacao.prototype, "asaasCustomerId", void 0);
__decorate([
    (0, typeorm_1.Column)({ unique: true }),
    __metadata("design:type", String)
], Locacao.prototype, "asaasSubscriptionId", void 0);
__decorate([
    (0, typeorm_1.Column)("decimal", { precision: 10, scale: 2 }),
    __metadata("design:type", Number)
], Locacao.prototype, "valorMensal", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: "ATIVA" }),
    __metadata("design:type", String)
], Locacao.prototype, "status", void 0);
exports.Locacao = Locacao = __decorate([
    (0, typeorm_1.Entity)("locacao"),
    (0, typeorm_1.Index)(["locatarioId", "moradiaId"], { unique: true })
], Locacao);
let PagamentoAluguel = class PagamentoAluguel {
};
exports.PagamentoAluguel = PagamentoAluguel;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)(),
    __metadata("design:type", Number)
], PagamentoAluguel.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", Number)
], PagamentoAluguel.prototype, "locacaoId", void 0);
__decorate([
    (0, typeorm_1.Column)({ unique: true }),
    __metadata("design:type", String)
], PagamentoAluguel.prototype, "asaasPaymentId", void 0);
__decorate([
    (0, typeorm_1.Column)("decimal", { precision: 10, scale: 2 }),
    __metadata("design:type", Number)
], PagamentoAluguel.prototype, "valor", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: "text", nullable: true }),
    __metadata("design:type", Object)
], PagamentoAluguel.prototype, "vencimento", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: "PENDING" }),
    __metadata("design:type", String)
], PagamentoAluguel.prototype, "status", void 0);
exports.PagamentoAluguel = PagamentoAluguel = __decorate([
    (0, typeorm_1.Entity)("pagamento_aluguel"),
    (0, typeorm_1.Index)(["locacaoId", "asaasPaymentId"], { unique: true })
], PagamentoAluguel);
let AsaasWebhookEvent = class AsaasWebhookEvent {
};
exports.AsaasWebhookEvent = AsaasWebhookEvent;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)(),
    __metadata("design:type", Number)
], AsaasWebhookEvent.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)({ unique: true }),
    __metadata("design:type", String)
], AsaasWebhookEvent.prototype, "eventId", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", String)
], AsaasWebhookEvent.prototype, "eventType", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: "text", nullable: true }),
    __metadata("design:type", Object)
], AsaasWebhookEvent.prototype, "paymentId", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: "datetime" }),
    __metadata("design:type", Date)
], AsaasWebhookEvent.prototype, "receivedAt", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: "datetime", nullable: true }),
    __metadata("design:type", Object)
], AsaasWebhookEvent.prototype, "processingStartedAt", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: "datetime", nullable: true }),
    __metadata("design:type", Object)
], AsaasWebhookEvent.prototype, "processedAt", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: "PROCESSING" }),
    __metadata("design:type", String)
], AsaasWebhookEvent.prototype, "result", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: "text", nullable: true }),
    __metadata("design:type", Object)
], AsaasWebhookEvent.prototype, "resultDetails", void 0);
exports.AsaasWebhookEvent = AsaasWebhookEvent = __decorate([
    (0, typeorm_1.Entity)("asaas_webhook_event")
], AsaasWebhookEvent);
//# sourceMappingURL=Locacao.js.map