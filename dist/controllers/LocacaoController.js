"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LocacaoController = void 0;
const crypto_1 = require("crypto");
const typeorm_1 = require("typeorm");
const BDConn_1 = require("../services/BDConn");
const Locacao_1 = require("../models/Locacao");
const Moradia_1 = require("../models/Moradia");
const Usuario_1 = require("../models/Usuario");
const paymentStatusTransitions = {
    PENDING: ["PENDING", "OVERDUE", "RECEIVED", "DELETED", "PARTIALLY_REFUNDED", "REFUNDED"],
    OVERDUE: ["OVERDUE", "RECEIVED", "DELETED", "PARTIALLY_REFUNDED", "REFUNDED"],
    RECEIVED: ["RECEIVED", "PARTIALLY_REFUNDED", "REFUNDED"],
    DELETED: ["DELETED"],
    PARTIALLY_REFUNDED: ["PARTIALLY_REFUNDED", "REFUNDED"],
    REFUNDED: ["REFUNDED"]
};
class LocacaoController {
    static calcularCobranca(valorCobrado) {
        const total = Number(valorCobrado || 0);
        const valorAnunciado = Number((total / 1.01).toFixed(2));
        const taxaPlataforma = Number((total - valorAnunciado).toFixed(2));
        const valorParaDono = Number((valorAnunciado).toFixed(2));
        return {
            valorCobrado: total,
            valorAnunciado,
            taxaPlataforma,
            valorParaDono,
            chavePixPlataforma: "27996568893"
        };
    }
    static apiBase() {
        return process.env.ASAAS_ENVIRONMENT === "production"
            ? "https://api.asaas.com/v3"
            : "https://api-sandbox.asaas.com/v3";
    }
    static async asaas(path, method = "GET", body) {
        const apiKey = process.env.ASAAS_API_KEY;
        if (!apiKey) {
            throw new Error("Os pagamentos ainda não foram ativados pela plataforma.");
        }
        const response = await fetch(`${LocacaoController.apiBase()}${path}`, {
            method,
            headers: {
                "Content-Type": "application/json",
                "access_token": apiKey
            },
            body: body === undefined ? undefined : JSON.stringify(body)
        });
        const result = await response.json();
        if (!response.ok) {
            const message = result.errors?.map((error) => error.description).filter(Boolean).join(" ");
            throw new Error(message || "O Asaas não conseguiu processar a solicitação.");
        }
        return result;
    }
    static async dashboard(req, res) {
        try {
            const locatarioId = Number(req.session.usuarioId);
            const locacoes = await BDConn_1.BancoDeDados.getRepository(Locacao_1.Locacao).find({
                where: [{ locatarioId }, { proprietarioId: locatarioId }],
                order: { id: "DESC" }
            });
            const moradiaIds = [...new Set(locacoes.map((locacao) => locacao.moradiaId))];
            const pagamentos = locacoes.length
                ? await BDConn_1.BancoDeDados.getRepository(Locacao_1.PagamentoAluguel).find({
                    where: locacoes.map((locacao) => ({ locacaoId: locacao.id })),
                    order: { id: "DESC" }
                })
                : [];
            const moradias = moradiaIds.length
                ? await BDConn_1.BancoDeDados.getRepository(Moradia_1.Moradia).find({ where: { id: (0, typeorm_1.In)(moradiaIds) } })
                : [];
            const usuarios = [...new Set(locacoes.flatMap((locacao) => [locacao.locatarioId, locacao.proprietarioId]))];
            const pessoas = usuarios.length
                ? await BDConn_1.BancoDeDados.getRepository(Usuario_1.Usuario).find({ where: { id: (0, typeorm_1.In)(usuarios) } })
                : [];
            return res.render("alugueis", {
                locacoes,
                pagamentos,
                moradias,
                pessoas,
                usuarioId: locatarioId,
                asaasConfigurado: Boolean(process.env.ASAAS_API_KEY),
                erro: req.query.erro === "1" ? "Não foi possível concluir a operação. Confira o cadastro de pagamento e tente novamente." : null
            });
        }
        catch (error) {
            console.error("Erro ao carregar painel de aluguéis:", error);
            return res.status(500).send("Erro ao carregar seus aluguéis.");
        }
    }
    static async checkout(req, res) {
        try {
            const id = Number(req.params.moradiaId);
            const moradia = await BDConn_1.BancoDeDados.getRepository(Moradia_1.Moradia).findOne({ where: { id } });
            if (!moradia || moradia.demonstracao || !moradia.disponivel || !moradia.proprietarioId) {
                return res.status(404).send("Este imóvel não está disponível para contratação pelo site.");
            }
            const proprietario = await BDConn_1.BancoDeDados.getRepository(Usuario_1.Usuario).findOne({
                where: { id: moradia.proprietarioId }
            });
            if (!proprietario) {
                return res.status(409).render("pagamento", {
                    moradia,
                    asaasConfigurado: Boolean(process.env.ASAAS_API_KEY),
                    erro: "O proprietário ainda precisa concluir o cadastro de recebimento."
                });
            }
            if (process.env.ASAAS_API_KEY && !proprietario.asaasWalletId) {
                return res.status(409).render("pagamento", {
                    moradia,
                    asaasConfigurado: true,
                    erro: "O proprietário ainda precisa concluir o cadastro de recebimento no Asaas."
                });
            }
            const valorCobrado = Number(moradia.preco) * 1.01;
            return res.render("pagamento", {
                moradia,
                asaasConfigurado: Boolean(process.env.ASAAS_API_KEY),
                erro: null,
                breakdown: LocacaoController.calcularCobranca(valorCobrado),
                chavePixPlataforma: "27996568893"
            });
        }
        catch (error) {
            console.error("Erro ao preparar contratação:", error);
            return res.status(500).send("Erro ao preparar o pagamento.");
        }
    }
    static async createRental(req, res) {
        const locatarioId = Number(req.session.usuarioId);
        const moradiaId = Number(req.params.moradiaId);
        try {
            const moradia = await BDConn_1.BancoDeDados.getRepository(Moradia_1.Moradia).findOne({ where: { id: moradiaId } });
            if (!moradia || moradia.demonstracao || !moradia.disponivel || !moradia.proprietarioId) {
                return res.status(404).send("Este imóvel não está disponível para contratação pelo site.");
            }
            if (moradia.proprietarioId === locatarioId) {
                return res.status(400).send("Você não pode contratar o próprio imóvel.");
            }
            const locacaoRepo = BDConn_1.BancoDeDados.getRepository(Locacao_1.Locacao);
            const existente = await locacaoRepo.findOne({ where: { locatarioId, moradiaId } });
            if (existente) {
                return res.redirect(`/alugueis/${existente.id}`);
            }
            const proprietario = await BDConn_1.BancoDeDados.getRepository(Usuario_1.Usuario).findOne({
                where: { id: moradia.proprietarioId }
            });
            const locatario = await BDConn_1.BancoDeDados.getRepository(Usuario_1.Usuario).findOne({ where: { id: locatarioId } });
            const cpf = typeof req.body.cpfCnpj === "string" ? req.body.cpfCnpj.replace(/\D/g, "") : "";
            if (!locatario) {
                return res.status(409).send("Usuário locatário não encontrado.");
            }
            if (process.env.ASAAS_API_KEY && !proprietario?.asaasWalletId) {
                return res.status(409).render("pagamento", {
                    moradia,
                    asaasConfigurado: Boolean(process.env.ASAAS_API_KEY),
                    erro: "O cadastro de recebimento do proprietário está incompleto."
                });
            }
            if (!cpf || !/^\d{11}$|^\d{14}$/.test(cpf)) {
                return res.status(400).render("pagamento", {
                    moradia,
                    asaasConfigurado: Boolean(process.env.ASAAS_API_KEY),
                    erro: "Informe um CPF ou CNPJ válido para gerar as cobranças."
                });
            }
            const valorCobrado = Number(moradia.preco) * 1.01;
            if (!process.env.ASAAS_API_KEY) {
                return res.status(503).render("pagamento", {
                    moradia,
                    asaasConfigurado: false,
                    erro: "Os pagamentos online ainda não estão ativos. Nenhuma cobrança foi criada; tente novamente quando a integração estiver configurada."
                });
            }
            const breakdown = LocacaoController.calcularCobranca(valorCobrado);
            const customer = await LocacaoController.asaas("/customers", "POST", {
                name: locatario.nome,
                email: locatario.email,
                cpfCnpj: cpf,
                phone: locatario.telefone || undefined
            });
            const due = new Date();
            due.setDate(due.getDate() + 1);
            const nextDueDate = `${due.getFullYear()}-${String(due.getMonth() + 1).padStart(2, "0")}-${String(due.getDate()).padStart(2, "0")}`;
            const subscription = await LocacaoController.asaas("/subscriptions", "POST", {
                customer: customer.id,
                billingType: "PIX",
                value: valorCobrado,
                nextDueDate,
                cycle: "MONTHLY",
                description: `Aluguel mensal com taxa da plataforma: ${moradia.titulo}`,
                externalReference: `moradia-${moradia.id}-locatario-${locatarioId}`,
                split: [{
                        walletId: proprietario.asaasWalletId,
                        percentualValue: 99
                    }]
            });
            const locacao = locacaoRepo.create({
                moradiaId: moradia.id,
                locatarioId,
                proprietarioId: proprietario.id,
                asaasCustomerId: customer.id,
                asaasSubscriptionId: subscription.id,
                valorMensal: valorCobrado,
                status: "ATIVA"
            });
            await locacaoRepo.save(locacao);
            const paymentList = await LocacaoController.asaas(`/payments?subscription=${encodeURIComponent(subscription.id)}&limit=100`);
            await LocacaoController.savePayments(locacao.id, paymentList.data || []);
            return res.redirect(`/alugueis/${locacao.id}`);
        }
        catch (error) {
            console.error("Erro ao criar cobrança recorrente:", error);
            const moradia = await BDConn_1.BancoDeDados.getRepository(Moradia_1.Moradia).findOne({ where: { id: moradiaId } });
            if (!moradia)
                return res.status(404).send("Imóvel não encontrado.");
            return res.status(502).render("pagamento", {
                moradia,
                asaasConfigurado: Boolean(process.env.ASAAS_API_KEY),
                erro: error instanceof Error ? error.message : "Não foi possível gerar a cobrança."
            });
        }
    }
    static async showRental(req, res) {
        try {
            const id = Number(req.params.id);
            const usuarioId = Number(req.session.usuarioId);
            const locacao = await BDConn_1.BancoDeDados.getRepository(Locacao_1.Locacao).findOne({ where: { id } });
            if (!locacao || (locacao.locatarioId !== usuarioId && locacao.proprietarioId !== usuarioId)) {
                return res.status(404).send("Aluguel não encontrado.");
            }
            const [moradia, pagamentos] = await Promise.all([
                BDConn_1.BancoDeDados.getRepository(Moradia_1.Moradia).findOne({ where: { id: locacao.moradiaId } }),
                BDConn_1.BancoDeDados.getRepository(Locacao_1.PagamentoAluguel).find({
                    where: { locacaoId: locacao.id },
                    order: { id: "DESC" }
                })
            ]);
            return res.render("aluguel_detalhes", {
                locacao,
                moradia,
                pagamentos,
                locatario: usuarioId === locacao.locatarioId,
                asaasConfigurado: Boolean(process.env.ASAAS_API_KEY)
            });
        }
        catch (error) {
            console.error("Erro ao carregar aluguel:", error);
            return res.status(500).send("Erro ao carregar o aluguel.");
        }
    }
    static async pix(req, res) {
        try {
            const id = Number(req.params.paymentId);
            const usuarioId = Number(req.session.usuarioId);
            const pagamento = await BDConn_1.BancoDeDados.getRepository(Locacao_1.PagamentoAluguel).findOne({ where: { id } });
            const locacao = pagamento
                ? await BDConn_1.BancoDeDados.getRepository(Locacao_1.Locacao).findOne({ where: { id: pagamento.locacaoId } })
                : null;
            if (!pagamento || !locacao || (locacao.locatarioId !== usuarioId && locacao.proprietarioId !== usuarioId)) {
                return res.status(404).send("Cobrança não encontrada.");
            }
            if (!process.env.ASAAS_API_KEY) {
                return res.status(503).send("Os pagamentos online estão desativados. Nenhum QR Code Pix pode ser gerado.");
            }
            const pix = await LocacaoController.asaas(`/payments/${encodeURIComponent(pagamento.asaasPaymentId)}/pixQrCode`);
            return res.render("pix", { pagamento, pix, manual: false });
        }
        catch (error) {
            console.error("Erro ao carregar QR Pix:", error);
            return res.status(502).send(error instanceof Error ? error.message : "Não foi possível carregar o QR Pix.");
        }
    }
    static async webhook(req, res) {
        const expected = process.env.ASAAS_WEBHOOK_TOKEN;
        const received = req.header("asaas-access-token");
        const expectedBuffer = Buffer.from(expected || "");
        const receivedBuffer = Buffer.from(received || "");
        if (!expected
            || !received
            || expectedBuffer.length !== receivedBuffer.length
            || !(0, crypto_1.timingSafeEqual)(expectedBuffer, receivedBuffer)) {
            return res.status(401).send("Não autorizado.");
        }
        const body = req.body && typeof req.body === "object"
            ? req.body
            : {};
        const payloadEventId = typeof body.id === "string" ? body.id.trim() : "";
        const eventId = payloadEventId || `missing-id-${(0, crypto_1.randomUUID)()}`;
        const eventType = typeof body.event === "string" && body.event.trim()
            ? body.event.trim()
            : "UNKNOWN";
        const payment = body.payment && typeof body.payment === "object"
            ? body.payment
            : undefined;
        const paymentId = typeof payment?.id === "string" ? payment.id : null;
        let claimedEvent = false;
        try {
            if (payloadEventId.length > 150) {
                await LocacaoController.recordIgnoredWebhook(eventId, eventType, paymentId, "O identificador do evento excede o tamanho permitido.");
                return res.status(400).send("Identificador de evento inválido.");
            }
            const claim = await LocacaoController.claimWebhookEvent(eventId, eventType, paymentId);
            if (claim === "DUPLICATE")
                return res.sendStatus(200);
            if (claim === "BUSY")
                return res.sendStatus(503);
            claimedEvent = true;
            if (!payloadEventId) {
                await LocacaoController.finishWebhookEvent(eventId, "IGNORED", "Payload sem identificador de evento; não é possível deduplicar com segurança.");
                return res.status(400).send("Identificador de evento ausente.");
            }
            await BDConn_1.BancoDeDados.transaction(async (manager) => {
                const eventRepo = manager.getRepository(Locacao_1.AsaasWebhookEvent);
                const markResult = async (result, details) => {
                    const update = await eventRepo.update({ eventId }, { result, resultDetails: details, processedAt: new Date() });
                    if (update.affected !== 1) {
                        throw new Error("O resultado do evento não pôde ser registrado.");
                    }
                };
                const targetStatus = LocacaoController.getWebhookPaymentStatus(eventType, payment?.status);
                if (!targetStatus) {
                    await markResult("IGNORED", `Tipo de evento ou estado não suportado: ${eventType}.`);
                    return;
                }
                if (!paymentId) {
                    await markResult("IGNORED", "Evento sem identificador de pagamento.");
                    return;
                }
                if (!Number.isFinite(Number(payment?.value)) || Number(payment?.value) < 0) {
                    await markResult("IGNORED", "Pagamento sem valor numérico válido.");
                    return;
                }
                const paymentRepo = manager.getRepository(Locacao_1.PagamentoAluguel);
                let locacao = null;
                if (typeof payment?.subscription === "string" && payment.subscription) {
                    locacao = await manager.getRepository(Locacao_1.Locacao).findOne({
                        where: { asaasSubscriptionId: payment.subscription }
                    });
                }
                if (!locacao) {
                    const existingPayment = await paymentRepo.findOne({ where: { asaasPaymentId: paymentId } });
                    if (existingPayment) {
                        locacao = await manager.getRepository(Locacao_1.Locacao).findOne({
                            where: { id: existingPayment.locacaoId }
                        });
                    }
                }
                if (!locacao) {
                    await markResult("IGNORED", "Não foi encontrada locação vinculada à assinatura ou pagamento recebido.");
                    return;
                }
                const existing = await paymentRepo.findOne({ where: { asaasPaymentId: paymentId } });
                if (existing && existing.locacaoId !== locacao.id) {
                    await markResult("IGNORED", "O pagamento já está associado a outra locação.");
                    return;
                }
                if (existing && !LocacaoController.canTransitionPaymentStatus(existing.status, targetStatus)) {
                    await markResult("IGNORED", `Transição de status antiga ou inválida ignorada: ${existing.status} → ${targetStatus}.`);
                    return;
                }
                const dueDate = typeof payment?.dueDate === "string" ? payment.dueDate : null;
                if (existing) {
                    existing.valor = Number(payment.value);
                    existing.vencimento = dueDate || existing.vencimento;
                    existing.status = targetStatus;
                    await paymentRepo.save(existing);
                }
                else {
                    await paymentRepo.save(paymentRepo.create({
                        locacaoId: locacao.id,
                        asaasPaymentId: paymentId,
                        valor: Number(payment.value),
                        vencimento: dueDate,
                        status: targetStatus
                    }));
                }
                await markResult("PROCESSED", "Evento aplicado ao pagamento.");
            });
            return res.sendStatus(200);
        }
        catch (error) {
            console.error("Erro ao processar webhook Asaas:", error);
            if (claimedEvent) {
                try {
                    await LocacaoController.finishWebhookEvent(eventId, "FAILED", "Falha temporária ao processar o evento. O Asaas pode reenviá-lo.");
                }
                catch (recordError) {
                    console.error("Erro ao registrar falha do webhook Asaas:", recordError);
                }
            }
            return res.sendStatus(500);
        }
    }
    static getWebhookPaymentStatus(eventType, paymentStatus) {
        const statusByEvent = {
            PAYMENT_CREATED: "PENDING",
            PAYMENT_CONFIRMED: "RECEIVED",
            PAYMENT_RECEIVED: "RECEIVED",
            PAYMENT_OVERDUE: "OVERDUE",
            PAYMENT_DELETED: "DELETED",
            PAYMENT_REFUNDED: "REFUNDED",
            PAYMENT_PARTIALLY_REFUNDED: "PARTIALLY_REFUNDED"
        };
        if (statusByEvent[eventType])
            return statusByEvent[eventType];
        if (eventType !== "PAYMENT_UPDATED" || !paymentStatus)
            return null;
        const normalizedStatus = paymentStatus.toUpperCase();
        const statusByPayment = {
            PENDING: "PENDING",
            OVERDUE: "OVERDUE",
            CONFIRMED: "RECEIVED",
            RECEIVED: "RECEIVED",
            RECEIVED_IN_CASH: "RECEIVED",
            APPROVED_BY_RISK_ANALYSIS: "RECEIVED",
            DELETED: "DELETED",
            PARTIALLY_REFUNDED: "PARTIALLY_REFUNDED",
            REFUNDED: "REFUNDED"
        };
        return statusByPayment[normalizedStatus] || null;
    }
    static canTransitionPaymentStatus(current, next) {
        const normalizedCurrent = current;
        const allowed = paymentStatusTransitions[normalizedCurrent];
        return Boolean(allowed?.includes(next));
    }
    static async claimWebhookEvent(eventId, eventType, paymentId) {
        const repo = BDConn_1.BancoDeDados.getRepository(Locacao_1.AsaasWebhookEvent);
        const now = new Date();
        try {
            await repo.insert({
                eventId,
                eventType,
                paymentId,
                receivedAt: now,
                processingStartedAt: now,
                processedAt: null,
                result: "PROCESSING",
                resultDetails: null
            });
            return "CLAIMED";
        }
        catch (error) {
            const existing = await repo.findOne({ where: { eventId } });
            if (!existing)
                throw error;
            if (existing.result === "PROCESSED" || existing.result === "IGNORED")
                return "DUPLICATE";
            const staleBefore = new Date(Date.now() - 5 * 60 * 1000);
            const claim = await repo.createQueryBuilder()
                .update(Locacao_1.AsaasWebhookEvent)
                .set({
                eventType,
                paymentId,
                processingStartedAt: now,
                processedAt: null,
                result: "PROCESSING",
                resultDetails: null
            })
                .where("eventId = :eventId", { eventId })
                .andWhere("(result = :failed OR (result = :processing AND processingStartedAt < :staleBefore))", { failed: "FAILED", processing: "PROCESSING", staleBefore })
                .execute();
            if (claim.affected === 1)
                return "CLAIMED";
            return "BUSY";
        }
    }
    static async finishWebhookEvent(eventId, result, details) {
        const update = await BDConn_1.BancoDeDados.getRepository(Locacao_1.AsaasWebhookEvent).update({ eventId }, { result, resultDetails: details, processedAt: new Date() });
        if (update.affected !== 1) {
            throw new Error("O resultado final do evento não pôde ser registrado.");
        }
    }
    static async recordIgnoredWebhook(eventId, eventType, paymentId, reason) {
        const repo = BDConn_1.BancoDeDados.getRepository(Locacao_1.AsaasWebhookEvent);
        try {
            await repo.insert({
                eventId,
                eventType,
                paymentId,
                receivedAt: new Date(),
                processingStartedAt: null,
                processedAt: new Date(),
                result: "IGNORED",
                resultDetails: reason
            });
        }
        catch (error) {
            const existing = await repo.findOne({ where: { eventId } });
            if (!existing)
                throw error;
        }
    }
    static async savePayments(locacaoId, asaasPayments) {
        const repo = BDConn_1.BancoDeDados.getRepository(Locacao_1.PagamentoAluguel);
        for (const payment of asaasPayments) {
            if (!payment.id || !Number.isFinite(Number(payment.value)))
                continue;
            let record = await repo.findOne({ where: { asaasPaymentId: payment.id } });
            if (!record) {
                record = repo.create({
                    locacaoId,
                    asaasPaymentId: payment.id,
                    valor: Number(payment.value),
                    vencimento: payment.dueDate || null,
                    status: payment.status || "PENDING"
                });
            }
            else {
                record.valor = Number(payment.value);
                record.vencimento = payment.dueDate || record.vencimento;
                record.status = payment.status || record.status;
            }
            await repo.save(record);
        }
    }
}
exports.LocacaoController = LocacaoController;
//# sourceMappingURL=LocacaoController.js.map