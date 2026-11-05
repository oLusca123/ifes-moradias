import { Request, Response } from "express";
import { timingSafeEqual } from "crypto";
import { EntityManager, In } from "typeorm";
import { AsaasWebhookEvent, Locacao, LocacaoOperacao, PagamentoAluguel } from "../models/Locacao";
import { BancoDeDados } from "../services/BDConn";
import { canTransitionPaymentStatus, getPaymentStatus, PaymentStatus } from "../services/AsaasPaymentState";

type PaymentEvent = {
    id: string;
    value: number;
    dueDate?: string;
    status?: string;
    subscription?: string;
    externalReference?: string;
};

type StoredEvent = {
    event: string;
    payment?: PaymentEvent;
    subscription?: {
        id: string;
        status?: string;
        externalReference?: string;
        customer?: string;
    };
};

const subscriptionEventTypes = new Set([
    "SUBSCRIPTION_CREATED",
    "SUBSCRIPTION_UPDATED",
    "SUBSCRIPTION_DELETED",
    "SUBSCRIPTION_INACTIVATED"
]);

export class AsaasWebhookController {
    static async webhook(req: Request, res: Response) {
        const expected = process.env.ASAAS_WEBHOOK_TOKEN;
        if (!expected) return res.status(503).send("Webhook não configurado.");

        const received = req.header("asaas-access-token");
        const expectedBytes = Buffer.from(expected);
        const receivedBytes = Buffer.from(received || "");
        if (
            !received
            || expectedBytes.length !== receivedBytes.length
            || !timingSafeEqual(expectedBytes, receivedBytes)
        ) {
            return res.status(401).send("Não autorizado.");
        }

        const body = req.body && typeof req.body === "object"
            ? req.body as Record<string, unknown>
            : {};
        const eventId = typeof body.id === "string" ? body.id.trim() : "";
        const eventType = typeof body.event === "string" ? body.event.trim() : "";
        if (!eventId || eventId.length > 150 || !eventType || eventType.length > 100) {
            return res.status(400).send("Evento inválido.");
        }

        try {
            const stored = AsaasWebhookController.sanitize(body, eventType);
            const eventRepo = BancoDeDados.getRepository(AsaasWebhookEvent);
            let event = await eventRepo.findOneBy({ eventId });
            if (!event) {
                try {
                    await eventRepo.insert({
                        eventId,
                        eventType,
                        paymentId: stored.payment?.id || null,
                        subscriptionId: stored.payment?.subscription || stored.subscription?.id || null,
                        externalReference: stored.payment?.externalReference || stored.subscription?.externalReference || null,
                        payload: JSON.stringify(stored),
                        paymentValue: stored.payment?.value ?? null,
                        receivedAt: new Date(),
                        processingStartedAt: null,
                        processedAt: null,
                        lockedUntil: null,
                        attemptCount: 0,
                        result: "PENDING",
                        resultDetails: "Evento persistido; aguardando processamento."
                    });
                } catch (error) {
                    event = await eventRepo.findOneBy({ eventId });
                    if (!event) throw error;
                }
            }
            if (!event) {
                event = await eventRepo.findOneBy({ eventId });
            }
            if (!event) throw new Error("O evento persistido não pôde ser recuperado.");

            if (event.result === "PROCESSED" || event.result === "IGNORED") {
                return res.sendStatus(200);
            }

            await AsaasWebhookController.processEvent(eventId);
            return res.sendStatus(200);
        } catch (error) {
            console.error("Erro ao processar webhook Asaas:", error);
            try {
                await BancoDeDados.getRepository(AsaasWebhookEvent).update(
                    { eventId },
                    {
                        result: "FAILED",
                        resultDetails: "Falha temporária durante o processamento; o evento persistido será tentado novamente.",
                        processingStartedAt: null,
                        processedAt: null,
                        lockedUntil: null
                    }
                );
            } catch (recordError) {
                console.error("Erro ao registrar falha recuperável do webhook Asaas:", recordError);
            }
            return res.sendStatus(500);
        }
    }

    static async processPendingEvents(): Promise<void> {
        const events = await BancoDeDados.getRepository(AsaasWebhookEvent).find({
            where: { result: In(["PENDING", "PENDING_LINK", "FAILED", "PROCESSING"]) },
            order: { receivedAt: "ASC" },
            take: 50
        });
        for (const event of events) {
            try {
                await AsaasWebhookController.processEvent(event.eventId);
            } catch (error) {
                console.error("Falha recuperável ao reprocessar evento Asaas:", event.eventId, error);
                await BancoDeDados.getRepository(AsaasWebhookEvent).update(
                    { eventId: event.eventId, result: "PROCESSING" },
                    {
                        result: "FAILED",
                        resultDetails: "Falha temporária durante o processamento; nova tentativa agendada.",
                        processingStartedAt: null,
                        processedAt: null,
                        lockedUntil: null
                    }
                );
            }
        }
    }

    private static sanitize(body: Record<string, unknown>, eventType: string): StoredEvent {
        const rawPayment = body.payment && typeof body.payment === "object"
            ? body.payment as Record<string, unknown>
            : null;
        const rawSubscription = body.subscription && typeof body.subscription === "object"
            ? body.subscription as Record<string, unknown>
            : null;
        const paymentId = typeof rawPayment?.id === "string" ? rawPayment.id : undefined;
        const subscriptionId = typeof rawPayment?.subscription === "string"
            ? rawPayment.subscription
            : typeof rawSubscription?.id === "string"
                ? rawSubscription.id
                : undefined;
        const value = Number(rawPayment?.value);
        const payment = rawPayment && paymentId
            ? {
                id: paymentId,
                value: Number.isFinite(value) ? value : Number.NaN,
                dueDate: typeof rawPayment.dueDate === "string" ? rawPayment.dueDate : undefined,
                status: typeof rawPayment.status === "string" ? rawPayment.status : undefined,
                subscription: subscriptionId,
                externalReference: typeof rawPayment.externalReference === "string"
                    ? rawPayment.externalReference
                    : undefined
            }
            : undefined;
        const subscription = rawSubscription && typeof rawSubscription.id === "string"
            ? {
                id: rawSubscription.id,
                status: typeof rawSubscription.status === "string" ? rawSubscription.status : undefined,
                externalReference: typeof rawSubscription.externalReference === "string"
                    ? rawSubscription.externalReference
                    : undefined,
                customer: typeof rawSubscription.customer === "string" ? rawSubscription.customer : undefined
            }
            : undefined;
        return { event: eventType, payment, subscription };
    }

    private static async processEvent(eventId: string): Promise<void> {
        const eventRepo = BancoDeDados.getRepository(AsaasWebhookEvent);
        const prior = await eventRepo.findOneBy({ eventId });
        if (!prior || prior.result === "PROCESSED" || prior.result === "IGNORED") return;

        const now = new Date();
        const claim = await eventRepo.createQueryBuilder()
            .update(AsaasWebhookEvent)
            .set({
                result: "PROCESSING",
                processingStartedAt: now,
                lockedUntil: new Date(now.getTime() + 2 * 60 * 1000),
                attemptCount: prior.attemptCount + 1,
                resultDetails: "Evento em processamento."
            })
            .where("eventId = :eventId", { eventId })
            .andWhere(
                "(result IN (:...retryable) OR (result = :processing AND (lockedUntil IS NULL OR lockedUntil < :now)))",
                { retryable: ["PENDING", "PENDING_LINK", "FAILED"], processing: "PROCESSING", now }
            )
            .execute();
        if (claim.affected !== 1) return;

        await BancoDeDados.transaction(async (manager) => {
            const event = await manager.getRepository(AsaasWebhookEvent).findOneByOrFail({ eventId });
            let stored: StoredEvent;
            try {
                stored = JSON.parse(event.payload || "") as StoredEvent;
            } catch {
                await AsaasWebhookController.setResult(
                    manager,
                    eventId,
                    "IGNORED",
                    "O conteúdo persistido do evento não está em formato válido."
                );
                return;
            }

            const paymentEvent = stored.event.startsWith("PAYMENT_");
            if (paymentEvent) {
                await AsaasWebhookController.processPaymentEvent(manager, eventId, stored);
                return;
            }
            if (subscriptionEventTypes.has(stored.event)) {
                await AsaasWebhookController.processSubscriptionEvent(manager, eventId, stored);
                return;
            }
            await AsaasWebhookController.setResult(
                manager,
                eventId,
                "IGNORED",
                `Tipo de evento não suportado: ${stored.event}.`
            );
        });
    }

    private static async processPaymentEvent(
        manager: EntityManager,
        eventId: string,
        stored: StoredEvent
    ): Promise<void> {
        const payment = stored.payment;
        const targetStatus = getPaymentStatus(stored.event, payment?.status);
        if (!targetStatus) {
            await AsaasWebhookController.setResult(
                manager,
                eventId,
                "IGNORED",
                `Tipo ou status de pagamento não suportado: ${stored.event}.`
            );
            return;
        }
        if (!payment?.id || !Number.isFinite(payment.value) || payment.value < 0) {
            await AsaasWebhookController.setResult(
                manager,
                eventId,
                "IGNORED",
                "Evento sem identificador ou valor válido de pagamento."
            );
            return;
        }

        let locacao: Locacao | null = null;
        if (payment.subscription) {
            locacao = await manager.getRepository(Locacao).findOne({
                where: { asaasSubscriptionId: payment.subscription }
            });
        }
        if (!locacao) {
            const existingPayment = await manager.getRepository(PagamentoAluguel).findOne({
                where: { asaasPaymentId: payment.id }
            });
            if (existingPayment) {
                locacao = await manager.getRepository(Locacao).findOne({
                    where: { id: existingPayment.locacaoId }
                });
            }
        }

        const operation = await AsaasWebhookController.findOperation(
            manager,
            payment.subscription,
            payment.externalReference
        );
        if (!locacao && operation) {
            if (payment.subscription) operation.asaasSubscriptionId = payment.subscription;
            await manager.getRepository(LocacaoOperacao).save(operation);
            locacao = await AsaasWebhookController.ensureRental(
                manager,
                operation,
                payment.subscription || operation.asaasSubscriptionId || undefined
            );
        }
        if (!locacao) {
            await AsaasWebhookController.setResult(
                manager,
                eventId,
                "PENDING_LINK",
                "Pagamento persistido sem locação vinculada; será reprocessado após a reconciliação da assinatura.",
                true
            );
            return;
        }

        const result = await AsaasWebhookController.applyPayment(manager, locacao, payment, targetStatus);
        if (!result.applied) {
            await AsaasWebhookController.setResult(
                manager,
                eventId,
                "IGNORED",
                result.reason || "Transição antiga ou inválida ignorada."
            );
            return;
        }
        await AsaasWebhookController.setResult(manager, eventId, "PROCESSED", "Evento aplicado ao pagamento.");
    }

    private static async processSubscriptionEvent(
        manager: EntityManager,
        eventId: string,
        stored: StoredEvent
    ): Promise<void> {
        const subscription = stored.subscription;
        const subscriptionId = subscription?.id || stored.payment?.subscription;
        if (!subscriptionId) {
            await AsaasWebhookController.setResult(
                manager,
                eventId,
                "IGNORED",
                "Evento de assinatura sem identificador de assinatura."
            );
            return;
        }

        const operation = await AsaasWebhookController.findOperation(
            manager,
            subscriptionId,
            subscription?.externalReference
        );
        let locacao = await manager.getRepository(Locacao).findOne({
            where: { asaasSubscriptionId: subscriptionId }
        });
        if (!locacao && operation) {
            operation.asaasSubscriptionId = subscriptionId;
            if (subscription?.customer) operation.asaasCustomerId = subscription.customer;
            await manager.getRepository(LocacaoOperacao).save(operation);
            locacao = await AsaasWebhookController.ensureRental(manager, operation, subscriptionId);
        }
        if (!locacao) {
            await AsaasWebhookController.setResult(
                manager,
                eventId,
                "PENDING_LINK",
                "Assinatura persistida sem locação vinculada; será reprocessada após a reconciliação.",
                true
            );
            return;
        }

        const target = stored.event === "SUBSCRIPTION_DELETED" || stored.event === "SUBSCRIPTION_INACTIVATED"
            ? "INACTIVE"
            : subscription?.status?.toUpperCase();
        if (!target || !["ACTIVE", "INACTIVE", "EXPIRED"].includes(target)) {
            await AsaasWebhookController.setResult(
                manager,
                eventId,
                "IGNORED",
                "Status de assinatura ausente ou não suportado."
            );
            return;
        }
        const current = locacao.asaasSubscriptionStatus.toUpperCase();
        if (["INACTIVE", "EXPIRED"].includes(current) && target !== current) {
            await AsaasWebhookController.setResult(
                manager,
                eventId,
                "IGNORED",
                `Transição antiga de assinatura ignorada: ${current} → ${target}.`
            );
            return;
        }

        locacao.asaasSubscriptionStatus = target;
        if (["INACTIVE", "EXPIRED"].includes(target) && locacao.status === "AGUARDANDO_PAGAMENTO") {
            locacao.status = "CANCELADA";
        }
        await manager.getRepository(Locacao).save(locacao);
        await AsaasWebhookController.setResult(manager, eventId, "PROCESSED", "Evento aplicado à assinatura.");
    }

    private static async findOperation(
        manager: EntityManager,
        subscriptionId?: string,
        reference?: string
    ): Promise<LocacaoOperacao | null> {
        const repo = manager.getRepository(LocacaoOperacao);
        if (reference) {
            const operation = await repo.findOne({ where: { reference } });
            if (operation) return operation;
        }
        return subscriptionId
            ? repo.findOne({ where: { asaasSubscriptionId: subscriptionId } })
            : null;
    }

    private static async ensureRental(
        manager: EntityManager,
        operation: LocacaoOperacao,
        subscriptionId?: string
    ): Promise<Locacao | null> {
        const finalSubscriptionId = subscriptionId || operation.asaasSubscriptionId;
        if (!finalSubscriptionId || !operation.asaasCustomerId) return null;

        const repo = manager.getRepository(Locacao);
        let locacao = await repo.findOne({ where: { asaasSubscriptionId: finalSubscriptionId } });
        if (!locacao) {
            locacao = await repo.findOne({
                where: {
                    locatarioId: operation.locatarioId,
                    moradiaId: operation.moradiaId
                }
            });
        }
        if (locacao && locacao.asaasSubscriptionId !== finalSubscriptionId) {
            throw new Error("A operação aponta para uma contratação diferente da locação existente.");
        }
        if (!locacao) {
            locacao = repo.create({
                moradiaId: operation.moradiaId,
                locatarioId: operation.locatarioId,
                proprietarioId: operation.proprietarioId,
                asaasCustomerId: operation.asaasCustomerId,
                asaasSubscriptionId: finalSubscriptionId,
                asaasSubscriptionStatus: "ACTIVE",
                valorMensal: operation.valorMensal,
                status: "AGUARDANDO_PAGAMENTO"
            });
            locacao = await repo.save(locacao);
        }

        operation.asaasSubscriptionId = finalSubscriptionId;
        operation.locacaoId = locacao.id;
        operation.status = locacao.status;
        operation.stage = "COMPLETE";
        operation.lockedUntil = null;
        operation.updatedAt = new Date();
        await manager.getRepository(LocacaoOperacao).save(operation);
        return locacao;
    }

    private static async applyPayment(
        manager: EntityManager,
        locacao: Locacao,
        payment: PaymentEvent,
        targetStatus: PaymentStatus
    ): Promise<{ applied: boolean; reason?: string }> {
        const repo = manager.getRepository(PagamentoAluguel);
        let existing = await repo.findOne({ where: { asaasPaymentId: payment.id } });
        if (!existing) {
            await repo.save(repo.create({
                locacaoId: locacao.id,
                asaasPaymentId: payment.id,
                valor: payment.value,
                vencimento: payment.dueDate || null,
                status: targetStatus
            }));
            if (targetStatus === "RECEIVED" && locacao.status === "AGUARDANDO_PAGAMENTO") {
                locacao.status = "ATIVA";
                await manager.getRepository(Locacao).save(locacao);
            }
            return { applied: true };
        }
        if (existing.locacaoId !== locacao.id) {
            return { applied: false, reason: "O pagamento já está associado a outra locação." };
        }

        for (let attempt = 0; attempt < 3; attempt += 1) {
            if (!canTransitionPaymentStatus(existing.status, targetStatus)) {
                return {
                    applied: false,
                    reason: `Transição de pagamento antiga ou inválida ignorada: ${existing.status} → ${targetStatus}.`
                };
            }
            if (existing.status === targetStatus) return { applied: true };

            const update = await repo.createQueryBuilder()
                .update(PagamentoAluguel)
                .set({
                    status: targetStatus,
                    valor: payment.value,
                    vencimento: payment.dueDate || existing.vencimento
                })
                .where("id = :id AND status = :current", { id: existing.id, current: existing.status })
                .execute();
            if (update.affected === 1) {
                if (targetStatus === "RECEIVED" && locacao.status === "AGUARDANDO_PAGAMENTO") {
                    locacao.status = "ATIVA";
                    await manager.getRepository(Locacao).save(locacao);
                }
                return { applied: true };
            }
            const fresh = await repo.findOne({ where: { asaasPaymentId: payment.id } });
            if (!fresh) break;
            existing = fresh;
        }
        throw new Error("O pagamento foi atualizado em paralelo; o evento precisa ser tentado novamente.");
    }

    private static async setResult(
        manager: EntityManager,
        eventId: string,
        result: string,
        details: string,
        pendingLink = false
    ): Promise<void> {
        const now = new Date();
        const update = await manager.getRepository(AsaasWebhookEvent).update(
            { eventId },
            {
                result,
                resultDetails: details,
                processedAt: pendingLink ? null : now,
                processingStartedAt: null,
                lockedUntil: pendingLink ? new Date(now.getTime() + 60 * 1000) : null
            }
        );
        if (update.affected !== 1) throw new Error("Não foi possível registrar o resultado do evento.");
    }
}
