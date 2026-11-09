import { Request, Response } from "express";
import { randomUUID, timingSafeEqual } from "crypto";
import { EntityManager, In } from "typeorm";
import { BancoDeDados } from "../services/BDConn";
import { AsaasWebhookEvent, Locacao, LocacaoOperacao, PagamentoAluguel } from "../models/Locacao";
import { Moradia } from "../models/Moradia";
import { Usuario } from "../models/Usuario";
import { AsaasApiError, asaasRequest, isAsaasConfigured } from "../services/AsaasService";
import {
    findStagingDemoOwner,
    isStagingDemoRentalsEnabled,
    sandboxDemoWalletId
} from "../services/AsaasSandboxDemoRentals";
import {
    canTransitionPaymentStatus,
    getPaymentStatus,
    isValidCpfCnpj,
    PaymentStatus
} from "../services/AsaasPaymentState";

type AsaasPayment = {
    id: string;
    value: number;
    dueDate?: string;
    status?: string;
    subscription?: string;
    externalReference?: string;
};

type AsaasList<T> = {
    data: T[];
    hasMore?: boolean;
};

type StoredWebhook = {
    event: string;
    payment?: AsaasPayment;
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

export class LocacaoController {
    static calcularCobranca(valorCobrado: number) {
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

    static async dashboard(req: Request, res: Response) {
        try {
            const locatarioId = Number((req.session as any).usuarioId);
            const locacoes = await BancoDeDados.getRepository(Locacao).find({
                where: [{ locatarioId }, { proprietarioId: locatarioId }],
                order: { id: "DESC" }
            });
            const moradiaIds = [...new Set(locacoes.map((locacao) => locacao.moradiaId))];
            const pagamentos = locacoes.length
                ? await BancoDeDados.getRepository(PagamentoAluguel).find({
                    where: locacoes.map((locacao) => ({ locacaoId: locacao.id })),
                    order: { id: "DESC" }
                })
                : [];
            const moradias = moradiaIds.length
                ? await BancoDeDados.getRepository(Moradia).find({ where: { id: In(moradiaIds) } })
                : [];
            const usuarios = [...new Set(locacoes.flatMap((locacao) => [locacao.locatarioId, locacao.proprietarioId]))];
            const pessoas = usuarios.length
                ? await BancoDeDados.getRepository(Usuario).find({ where: { id: In(usuarios) } })
                : [];

            return res.render("alugueis", {
                locacoes,
                pagamentos,
                moradias,
                pessoas,
                usuarioId: locatarioId,
                asaasConfigurado: isAsaasConfigured(),
                erro: req.query.erro === "1" ? "Não foi possível concluir a operação. Confira o cadastro de pagamento e tente novamente." : null
            });
        } catch (error) {
            console.error("Erro ao carregar painel de aluguéis:", error);
            return res.status(500).send("Erro ao carregar seus aluguéis.");
        }
    }

    static async checkout(req: Request, res: Response) {
        try {
            const id = Number(req.params.moradiaId);
            const moradia = await BancoDeDados.getRepository(Moradia).findOne({ where: { id } });
            if (!moradia || !moradia.disponivel) {
                return res.status(404).send("Este imóvel não está disponível para contratação pelo site.");
            }
            const demoRental = moradia.demonstracao && isStagingDemoRentalsEnabled();
            if (moradia.demonstracao && !demoRental) {
                return res.status(404).send("Este imóvel não está disponível para contratação pelo site.");
            }
            if (!demoRental && !moradia.proprietarioId) {
                return res.status(404).send("Este imóvel não está disponível para contratação pelo site.");
            }
            const proprietario = demoRental
                ? await findStagingDemoOwner()
                : await BancoDeDados.getRepository(Usuario).findOne({
                    where: { id: moradia.proprietarioId! }
                });
            if (!proprietario) {
                return res.status(409).render("pagamento", {
                    moradia,
                    asaasConfigurado: isAsaasConfigured(),
                    erro: "O proprietário ainda precisa concluir o cadastro de recebimento."
                });
            }
            const walletId = demoRental ? sandboxDemoWalletId : proprietario.asaasWalletId;
            if (process.env.ASAAS_API_KEY && !walletId) {
                return res.status(409).render("pagamento", {
                    moradia,
                    asaasConfigurado: true,
                    erro: "O proprietário ainda precisa concluir o cadastro de recebimento no Asaas."
                });
            }

            const valorCobrado = Number(moradia.preco) * 1.01;
            return res.render("pagamento", {
                moradia,
                asaasConfigurado: isAsaasConfigured(),
                erro: null,
                breakdown: LocacaoController.calcularCobranca(valorCobrado),
                chavePixPlataforma: "27996568893"
            });
        } catch (error) {
            console.error("Erro ao preparar contratação:", error);
            return res.status(500).send("Erro ao preparar o pagamento.");
        }
    }

    static async createRental(req: Request, res: Response) {
        const locatarioId = Number((req.session as any).usuarioId);
        const moradiaId = Number(req.params.moradiaId);
        let operation: LocacaoOperacao | null = null;
        try {
            const moradia = await BancoDeDados.getRepository(Moradia).findOne({ where: { id: moradiaId } });
            if (!moradia || !moradia.disponivel) {
                return res.status(404).send("Este imóvel não está disponível para contratação pelo site.");
            }
            const demoRental = moradia.demonstracao && isStagingDemoRentalsEnabled();
            if (moradia.demonstracao && !demoRental) {
                return res.status(404).send("Este imóvel não está disponível para contratação pelo site.");
            }
            if (!demoRental && !moradia.proprietarioId) {
                return res.status(404).send("Este imóvel não está disponível para contratação pelo site.");
            }
            const proprietario = demoRental
                ? await findStagingDemoOwner()
                : await BancoDeDados.getRepository(Usuario).findOne({
                    where: { id: moradia.proprietarioId! }
                });
            if (!proprietario) {
                return LocacaoController.renderCheckoutError(
                    res,
                    moradia,
                    "O proprietário ainda precisa concluir o cadastro de recebimento.",
                    409
                );
            }
            if (proprietario.id === locatarioId) {
                return res.status(400).send("Você não pode contratar o próprio imóvel.");
            }
            const locacaoRepo = BancoDeDados.getRepository(Locacao);
            const existente = await locacaoRepo.findOne({ where: { locatarioId, moradiaId } });
            if (existente) {
                return res.redirect(`/alugueis/${existente.id}`);
            }

            const locatario = await BancoDeDados.getRepository(Usuario).findOne({ where: { id: locatarioId } });
            const cpf = typeof req.body.cpfCnpj === "string" ? req.body.cpfCnpj.replace(/\D/g, "") : "";
            if (!locatario) {
                return res.status(409).send("Usuário locatário não encontrado.");
            }
            if (!isAsaasConfigured()) {
                return LocacaoController.renderCheckoutError(
                    res,
                    moradia,
                    "Os pagamentos online ainda não estão ativos. Nenhuma cobrança foi criada.",
                    503
                );
            }
            const walletId = demoRental ? sandboxDemoWalletId : proprietario.asaasWalletId;
            if (!walletId) {
                return LocacaoController.renderCheckoutError(
                    res,
                    moradia,
                    "O cadastro de recebimento do proprietário está incompleto.",
                    409
                );
            }
            if (!isValidCpfCnpj(cpf)) {
                return LocacaoController.renderCheckoutError(
                    res,
                    moradia,
                    "Informe um CPF ou CNPJ válido para gerar as cobranças.",
                    400
                );
            }

            const valorCobrado = Number(moradia.preco) * 1.01;
            operation = await LocacaoController.getOrCreateOperation(
                moradia,
                locatarioId,
                proprietario.id,
                valorCobrado
            );
            if (operation.locacaoId) {
                return res.redirect(`/alugueis/${operation.locacaoId}`);
            }

            const operationRepo = BancoDeDados.getRepository(LocacaoOperacao);
            const now = new Date();
            const claim = await operationRepo.createQueryBuilder()
                .update(LocacaoOperacao)
                .set({
                    status: "PROCESSANDO",
                    lockedUntil: new Date(now.getTime() + 2 * 60 * 1000),
                    lastError: null,
                    updatedAt: now
                })
                .where("id = :id", { id: operation.id })
                .andWhere("(status <> :processing OR lockedUntil IS NULL OR lockedUntil < :now)", {
                    processing: "PROCESSANDO",
                    now
                })
                .andWhere("status IN (:...statuses)", {
                    statuses: ["PENDENTE", "PROCESSANDO", "RECONCILIACAO_NECESSARIA", "FALHA"]
                })
                .execute();

            if (claim.affected !== 1) {
                const current = await operationRepo.findOneByOrFail({ id: operation.id });
                if (current.locacaoId) return res.redirect(`/alugueis/${current.locacaoId}`);
                return LocacaoController.renderCheckoutError(
                    res,
                    moradia,
                    current.status === "PROCESSANDO"
                        ? "Sua contratação já está sendo processada. Aguarde alguns instantes e atualize a página antes de tentar novamente."
                        : "Esta contratação precisa ser reconciliada antes de uma nova tentativa. Atualize a página em instantes.",
                    202
                );
            }

            operation = await operationRepo.findOneByOrFail({ id: operation.id });
            let customerId = operation.asaasCustomerId;
            let subscriptionId = operation.asaasSubscriptionId;

            if (!customerId) {
                const customers = await LocacaoController.findByExternalReference<{ id: string }>(
                    "/customers",
                    `${operation.reference}-customer`
                );
                if (customers.length > 1) {
                    return LocacaoController.releaseOperation(
                        res, operation, moradia,
                        "Foram encontradas várias contas vinculadas a esta tentativa. A contratação foi pausada para conferência.",
                        "RECONCILIACAO_NECESSARIA", 409
                    );
                }
                if (customers.length === 1) {
                    customerId = customers[0].id;
                    operation = await LocacaoController.updateOperationStage(
                        operation,
                        { asaasCustomerId: customerId, stage: "SUBSCRIPTION_READY" }
                    );
                } else if (operation.stage === "CUSTOMER_CREATE_UNKNOWN") {
                    return LocacaoController.releaseOperation(
                        res, operation, moradia,
                        "Ainda não foi possível confirmar a criação da conta no Asaas. A tentativa foi preservada para evitar duplicidade; tente novamente mais tarde.",
                        "RECONCILIACAO_NECESSARIA", 202
                    );
                } else if (operation.stage === "CUSTOMER_READY") {
                    const advanced = await operationRepo.createQueryBuilder()
                        .update(LocacaoOperacao)
                        .set({ stage: "CUSTOMER_CREATE_UNKNOWN", updatedAt: new Date() })
                        .where("id = :id AND stage = :stage", { id: operation.id, stage: "CUSTOMER_READY" })
                        .execute();
                    if (advanced.affected !== 1) {
                        operation = await operationRepo.findOneByOrFail({ id: operation.id });
                        return LocacaoController.releaseOperation(
                            res, operation, moradia,
                            "A contratação foi alterada por outra solicitação. Atualize a página para conferir o status.",
                            "RECONCILIACAO_NECESSARIA", 202
                        );
                    }

                    try {
                        const customer = await asaasRequest<{ id: string }>("/customers", {
                            method: "POST",
                            body: {
                                name: locatario.nome,
                                email: locatario.email,
                                cpfCnpj: cpf,
                                phone: locatario.telefone || undefined,
                                externalReference: `${operation.reference}-customer`
                            }
                        });
                        customerId = customer.id;
                        operation = await LocacaoController.updateOperationStage(
                            operation,
                            { asaasCustomerId: customerId, stage: "SUBSCRIPTION_READY" },
                            "CUSTOMER_CREATE_UNKNOWN"
                        );
                    } catch (error) {
                        if (error instanceof AsaasApiError && !error.ambiguous) {
                            operation = await LocacaoController.updateOperationStage(
                                operation,
                                { stage: "CUSTOMER_READY" },
                                "CUSTOMER_CREATE_UNKNOWN"
                            );
                        }
                        throw error;
                    }
                } else {
                    return LocacaoController.releaseOperation(
                        res, operation, moradia,
                        "A conta do pagador ainda não foi confirmada. Nenhuma nova conta será criada automaticamente.",
                        "RECONCILIACAO_NECESSARIA", 202
                    );
                }
            }

            if (!subscriptionId) {
                operation = await operationRepo.findOneByOrFail({ id: operation.id });
                const subscriptions = await LocacaoController.findByExternalReference<{ id: string }>(
                    "/subscriptions",
                    operation.reference
                );
                if (subscriptions.length > 1) {
                    return LocacaoController.releaseOperation(
                        res, operation, moradia,
                        "Foram encontradas várias assinaturas vinculadas a esta tentativa. A contratação foi pausada para conferência.",
                        "RECONCILIACAO_NECESSARIA", 409
                    );
                }
                if (subscriptions.length === 1) {
                    subscriptionId = subscriptions[0].id;
                } else if (operation.stage === "SUBSCRIPTION_CREATE_UNKNOWN") {
                    return LocacaoController.releaseOperation(
                        res, operation, moradia,
                        "Ainda não foi possível confirmar a assinatura no Asaas. A tentativa foi preservada para evitar cobranças duplicadas; tente novamente mais tarde.",
                        "RECONCILIACAO_NECESSARIA", 202
                    );
                } else if (operation.stage === "SUBSCRIPTION_READY") {
                    const advanced = await operationRepo.createQueryBuilder()
                        .update(LocacaoOperacao)
                        .set({ stage: "SUBSCRIPTION_CREATE_UNKNOWN", updatedAt: new Date() })
                        .where("id = :id AND stage = :stage", { id: operation.id, stage: "SUBSCRIPTION_READY" })
                        .execute();
                    if (advanced.affected !== 1) {
                        operation = await operationRepo.findOneByOrFail({ id: operation.id });
                        return LocacaoController.releaseOperation(
                            res, operation, moradia,
                            "A contratação foi alterada por outra solicitação. Atualize a página para conferir o status.",
                            "RECONCILIACAO_NECESSARIA", 202
                        );
                    }

                    const due = new Date();
                    due.setDate(due.getDate() + 1);
                    const nextDueDate = `${due.getFullYear()}-${String(due.getMonth() + 1).padStart(2, "0")}-${String(due.getDate()).padStart(2, "0")}`;
                    try {
                        const subscription = await asaasRequest<{ id: string }>("/subscriptions", {
                            method: "POST",
                            body: {
                                customer: customerId,
                                billingType: "PIX",
                                value: valorCobrado,
                                nextDueDate,
                                cycle: "MONTHLY",
                                description: `Aluguel mensal com taxa da plataforma: ${moradia.titulo}`,
                                externalReference: operation.reference,
                                split: [{
                                    walletId,
                                    percentualValue: 99
                                }]
                            }
                        });
                        subscriptionId = subscription.id;
                    } catch (error) {
                        if (error instanceof AsaasApiError && !error.ambiguous) {
                            operation = await LocacaoController.updateOperationStage(
                                operation,
                                { stage: "SUBSCRIPTION_READY" },
                                "SUBSCRIPTION_CREATE_UNKNOWN"
                            );
                        }
                        throw error;
                    }
                } else if (operation.stage !== "LOCAL_PERSIST") {
                    return LocacaoController.releaseOperation(
                        res, operation, moradia,
                        "A assinatura ainda não foi confirmada. Nenhuma nova cobrança será enviada até a reconciliação.",
                        "RECONCILIACAO_NECESSARIA", 202
                    );
                }

                if (subscriptionId) {
                    operation = await LocacaoController.updateOperationStage(
                        operation,
                        { asaasSubscriptionId: subscriptionId, stage: "LOCAL_PERSIST" }
                    );
                }
            }

            if (!customerId || !subscriptionId) {
                operation = await operationRepo.findOneByOrFail({ id: operation.id });
                return LocacaoController.releaseOperation(
                    res, operation, moradia,
                    "A contratação ainda está sendo reconciliada com o Asaas. Nenhuma nova cobrança foi enviada.",
                    "RECONCILIACAO_NECESSARIA", 202
                );
            }

            const locacao = await BancoDeDados.transaction(async (manager) => {
                const rentalRepo = manager.getRepository(Locacao);
                const currentOperation = await manager.getRepository(LocacaoOperacao).findOneByOrFail({ id: operation!.id });
                let rental = await rentalRepo.findOne({
                    where: { locatarioId, moradiaId }
                });
                if (rental && rental.asaasSubscriptionId !== subscriptionId) {
                    throw new Error("Já existe uma contratação diferente para este imóvel e locatário.");
                }
                if (!rental) {
                    rental = rentalRepo.create({
                        moradiaId,
                        locatarioId,
                        proprietarioId: proprietario.id,
                        asaasCustomerId: customerId!,
                        asaasSubscriptionId: subscriptionId!,
                        asaasSubscriptionStatus: "ACTIVE",
                        valorMensal: valorCobrado,
                        status: "AGUARDANDO_PAGAMENTO"
                    });
                    rental = await rentalRepo.save(rental);
                }
                currentOperation.asaasCustomerId = customerId!;
                currentOperation.asaasSubscriptionId = subscriptionId!;
                currentOperation.locacaoId = rental.id;
                currentOperation.status = rental.status;
                currentOperation.stage = "COMPLETE";
                currentOperation.lockedUntil = null;
                currentOperation.lastError = null;
                currentOperation.updatedAt = new Date();
                await manager.getRepository(LocacaoOperacao).save(currentOperation);
                return rental;
            });

            try {
                const paymentList = await asaasRequest<AsaasList<AsaasPayment>>(
                    `/subscriptions/${encodeURIComponent(subscriptionId)}/payments?limit=100`
                );
                await LocacaoController.savePayments(locacao.id, paymentList.data || []);
            } catch (error) {
                console.error("Não foi possível sincronizar as cobranças iniciais do Asaas; o webhook continuará sendo processado.", error);
            }

            return res.redirect(`/alugueis/${locacao.id}`);
        } catch (error) {
            console.error("Erro ao criar ou reconciliar cobrança recorrente:", error);
            if (operation) {
                const current = await BancoDeDados.getRepository(LocacaoOperacao).findOneBy({ id: operation.id });
                if (current?.status === "PROCESSANDO") {
                    const ambiguousStage = current.stage.endsWith("_CREATE_UNKNOWN");
                    await LocacaoController.releaseOperationState(
                        current,
                        ambiguousStage ? "RECONCILIACAO_NECESSARIA" : "FALHA",
                        error instanceof AsaasApiError && !error.ambiguous
                            ? "O Asaas recusou a solicitação. Confira os dados e tente novamente."
                            : "A resposta do Asaas não foi confirmada. A tentativa será reconciliada antes de novo envio."
                    );
                }
            }
            const moradia = await BancoDeDados.getRepository(Moradia).findOne({ where: { id: moradiaId } });
            if (!moradia) return res.status(404).send("Imóvel não encontrado.");
            return LocacaoController.renderCheckoutError(
                res,
                moradia,
                error instanceof AsaasApiError
                    ? error.message
                    : "Não foi possível confirmar a contratação. Atualize a página antes de tentar novamente.",
                error instanceof AsaasApiError && error.status && error.status < 500 ? 422 : 502
            );
        }
    }

    static async showRental(req: Request, res: Response) {
        try {
            const id = Number(req.params.id);
            const usuarioId = Number((req.session as any).usuarioId);
            const locacao = await BancoDeDados.getRepository(Locacao).findOne({ where: { id } });
            if (!locacao || (locacao.locatarioId !== usuarioId && locacao.proprietarioId !== usuarioId)) {
                return res.status(404).send("Aluguel não encontrado.");
            }
            const [moradia, pagamentos] = await Promise.all([
                BancoDeDados.getRepository(Moradia).findOne({ where: { id: locacao.moradiaId } }),
                BancoDeDados.getRepository(PagamentoAluguel).find({
                    where: { locacaoId: locacao.id },
                    order: { id: "DESC" }
                })
            ]);
            return res.render("aluguel_detalhes", {
                locacao,
                moradia,
                pagamentos,
                locatario: usuarioId === locacao.locatarioId,
                asaasConfigurado: isAsaasConfigured()
            });
        } catch (error) {
            console.error("Erro ao carregar aluguel:", error);
            return res.status(500).send("Erro ao carregar o aluguel.");
        }
    }

    static async pix(req: Request, res: Response) {
        try {
            const id = Number(req.params.paymentId);
            const usuarioId = Number((req.session as any).usuarioId);
            const pagamento = await BancoDeDados.getRepository(PagamentoAluguel).findOne({ where: { id } });
            const locacao = pagamento
                ? await BancoDeDados.getRepository(Locacao).findOne({ where: { id: pagamento.locacaoId } })
                : null;
            if (!pagamento || !locacao || locacao.locatarioId !== usuarioId) {
                return res.status(404).send("Cobrança não encontrada.");
            }

            if (!isAsaasConfigured()) {
                return res.status(503).send("Os pagamentos online estão desativados. Nenhum QR Code Pix pode ser gerado.");
            }
            if (["RECEIVED", "CONFIRMED", "PARTIALLY_REFUNDED", "REFUNDED"].includes(pagamento.status)) {
                return res.status(409).send("Esta cobrança não está disponível para pagamento.");
            }

            const pix = await asaasRequest<{ encodedImage: string; payload: string; expirationDate?: string }>(
                `/payments/${encodeURIComponent(pagamento.asaasPaymentId)}/pixQrCode`
            );
            return res.render("pix", { pagamento, pix, manual: false });
        } catch (error) {
            console.error("Erro ao carregar QR Pix:", error);
            return res.status(502).send("Não foi possível carregar o QR Pix. Tente novamente mais tarde.");
        }
    }

    static async webhook(req: Request, res: Response) {
        const expected = process.env.ASAAS_WEBHOOK_TOKEN;
        const received = req.header("asaas-access-token");
        const expectedBuffer = Buffer.from(expected || "");
        const receivedBuffer = Buffer.from(received || "");
        if (
            !expected
            || !received
            || expectedBuffer.length !== receivedBuffer.length
            || !timingSafeEqual(expectedBuffer, receivedBuffer)
        ) {
            return res.status(401).send("Não autorizado.");
        }

        const body = req.body && typeof req.body === "object"
            ? req.body as Record<string, unknown>
            : {};
        const payloadEventId = typeof body.id === "string" ? body.id.trim() : "";
        const eventId = payloadEventId || `missing-id-${randomUUID()}`;
        const eventType = typeof body.event === "string" && body.event.trim()
            ? body.event.trim()
            : "UNKNOWN";
        const payment = body.payment && typeof body.payment === "object"
            ? body.payment as Partial<AsaasPayment>
            : undefined;
        const paymentId = typeof payment?.id === "string" ? payment.id : null;
        let claimedEvent = false;

        try {
            if (payloadEventId.length > 150) {
                await LocacaoController.recordIgnoredWebhook(
                    eventId,
                    eventType,
                    paymentId,
                    "O identificador do evento excede o tamanho permitido."
                );
                return res.status(400).send("Identificador de evento inválido.");
            }

            const claim = await LocacaoController.claimWebhookEvent(eventId, eventType, paymentId);
            if (claim === "DUPLICATE") return res.sendStatus(200);
            if (claim === "BUSY") return res.sendStatus(503);
            claimedEvent = true;

            if (!payloadEventId) {
                await LocacaoController.finishWebhookEvent(
                    eventId,
                    "IGNORED",
                    "Payload sem identificador de evento; não é possível deduplicar com segurança."
                );
                return res.status(400).send("Identificador de evento ausente.");
            }

            await BancoDeDados.transaction(async (manager) => {
                const eventRepo = manager.getRepository(AsaasWebhookEvent);
                const markResult = async (result: string, details: string) => {
                    const update = await eventRepo.update(
                        { eventId },
                        { result, resultDetails: details, processedAt: new Date() }
                    );
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

                const paymentRepo = manager.getRepository(PagamentoAluguel);
                let locacao: Locacao | null = null;
                if (typeof payment?.subscription === "string" && payment.subscription) {
                    locacao = await manager.getRepository(Locacao).findOne({
                        where: { asaasSubscriptionId: payment.subscription }
                    });
                }
                if (!locacao) {
                    const existingPayment = await paymentRepo.findOne({ where: { asaasPaymentId: paymentId } });
                    if (existingPayment) {
                        locacao = await manager.getRepository(Locacao).findOne({
                            where: { id: existingPayment.locacaoId }
                        });
                    }
                }
                if (!locacao) {
                    await markResult(
                        "IGNORED",
                        "Não foi encontrada locação vinculada à assinatura ou pagamento recebido."
                    );
                    return;
                }

                const existing = await paymentRepo.findOne({ where: { asaasPaymentId: paymentId } });
                if (existing && existing.locacaoId !== locacao.id) {
                    await markResult("IGNORED", "O pagamento já está associado a outra locação.");
                    return;
                }
                if (existing && !LocacaoController.canTransitionPaymentStatus(existing.status, targetStatus)) {
                    await markResult(
                        "IGNORED",
                        `Transição de status antiga ou inválida ignorada: ${existing.status} → ${targetStatus}.`
                    );
                    return;
                }

                const dueDate = typeof payment?.dueDate === "string" ? payment.dueDate : null;
                if (existing) {
                    existing.valor = Number(payment!.value);
                    existing.vencimento = dueDate || existing.vencimento;
                    existing.status = targetStatus;
                    await paymentRepo.save(existing);
                } else {
                    await paymentRepo.save(paymentRepo.create({
                        locacaoId: locacao.id,
                        asaasPaymentId: paymentId,
                        valor: Number(payment!.value),
                        vencimento: dueDate,
                        status: targetStatus
                    }));
                }
                await markResult("PROCESSED", "Evento aplicado ao pagamento.");
            });

            return res.sendStatus(200);
        } catch (error) {
            console.error("Erro ao processar webhook Asaas:", error);
            if (claimedEvent) {
                try {
                    await LocacaoController.finishWebhookEvent(
                        eventId,
                        "FAILED",
                        "Falha temporária ao processar o evento. O Asaas pode reenviá-lo."
                    );
                } catch (recordError) {
                    console.error("Erro ao registrar falha do webhook Asaas:", recordError);
                }
            }
            return res.sendStatus(500);
        }
    }

    private static getWebhookPaymentStatus(
        eventType: string,
        paymentStatus?: string
    ): PaymentStatus | null {
        const statusByEvent: Record<string, PaymentStatus> = {
            PAYMENT_CREATED: "PENDING",
            PAYMENT_CONFIRMED: "CONFIRMED",
            PAYMENT_RECEIVED: "RECEIVED",
            PAYMENT_OVERDUE: "OVERDUE",
            PAYMENT_DELETED: "DELETED",
            PAYMENT_CANCELED: "CANCELED",
            PAYMENT_REFUND_IN_PROGRESS: "REFUND_IN_PROGRESS",
            PAYMENT_REFUNDED: "REFUNDED",
            PAYMENT_PARTIALLY_REFUNDED: "PARTIALLY_REFUNDED"
        };
        if (statusByEvent[eventType]) return statusByEvent[eventType];
        if (eventType !== "PAYMENT_UPDATED" || !paymentStatus) return null;

        const normalizedStatus = paymentStatus.toUpperCase();
        const statusByPayment: Record<string, PaymentStatus> = {
            PENDING: "PENDING",
            OVERDUE: "OVERDUE",
            CONFIRMED: "CONFIRMED",
            RECEIVED: "RECEIVED",
            RECEIVED_IN_CASH: "RECEIVED",
            APPROVED_BY_RISK_ANALYSIS: "RECEIVED",
            DELETED: "DELETED",
            CANCELED: "CANCELED",
            REFUND_IN_PROGRESS: "REFUND_IN_PROGRESS",
            PARTIALLY_REFUNDED: "PARTIALLY_REFUNDED",
            REFUNDED: "REFUNDED"
        };
        return statusByPayment[normalizedStatus] || null;
    }

    private static canTransitionPaymentStatus(current: string, next: PaymentStatus): boolean {
        return canTransitionPaymentStatus(current, next);
    }

    private static async claimWebhookEvent(
        eventId: string,
        eventType: string,
        paymentId: string | null
    ): Promise<"CLAIMED" | "DUPLICATE" | "BUSY"> {
        const repo = BancoDeDados.getRepository(AsaasWebhookEvent);
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
        } catch (error) {
            const existing = await repo.findOne({ where: { eventId } });
            if (!existing) throw error;
            if (existing.result === "PROCESSED" || existing.result === "IGNORED") return "DUPLICATE";

            const staleBefore = new Date(Date.now() - 5 * 60 * 1000);
            const claim = await repo.createQueryBuilder()
                .update(AsaasWebhookEvent)
                .set({
                    eventType,
                    paymentId,
                    processingStartedAt: now,
                    processedAt: null,
                    result: "PROCESSING",
                    resultDetails: null
                })
                .where("eventId = :eventId", { eventId })
                .andWhere(
                    "(result = :failed OR (result = :processing AND processingStartedAt < :staleBefore))",
                    { failed: "FAILED", processing: "PROCESSING", staleBefore }
                )
                .execute();
            if (claim.affected === 1) return "CLAIMED";
            return "BUSY";
        }
    }

    private static async finishWebhookEvent(eventId: string, result: string, details: string) {
        const update = await BancoDeDados.getRepository(AsaasWebhookEvent).update(
            { eventId },
            { result, resultDetails: details, processedAt: new Date() }
        );
        if (update.affected !== 1) {
            throw new Error("O resultado final do evento não pôde ser registrado.");
        }
    }

    private static async recordIgnoredWebhook(
        eventId: string,
        eventType: string,
        paymentId: string | null,
        reason: string
    ) {
        const repo = BancoDeDados.getRepository(AsaasWebhookEvent);
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
        } catch (error) {
            const existing = await repo.findOne({ where: { eventId } });
            if (!existing) throw error;
        }
    }

    private static async savePayments(locacaoId: number, asaasPayments: AsaasPayment[]) {
        await BancoDeDados.transaction(async (manager) => {
            const locacao = await manager.getRepository(Locacao).findOneByOrFail({ id: locacaoId });
            for (const payment of asaasPayments) {
                if (!payment.id || !Number.isFinite(Number(payment.value)) || Number(payment.value) < 0) continue;
                const status = getPaymentStatus("PAYMENT_UPDATED", payment.status || "PENDING");
                if (!status) continue;
                await LocacaoController.applyPaymentUpdate(manager, locacao, {
                    ...payment,
                    value: Number(payment.value)
                }, status);
            }
        });
    }

    private static async applyPaymentUpdate(
        manager: EntityManager,
        locacao: Locacao,
        payment: AsaasPayment,
        targetStatus: PaymentStatus
    ): Promise<void> {
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
            return;
        }
        if (existing.locacaoId !== locacao.id) {
            throw new Error("Pagamento recebido associado a uma locação diferente.");
        }

        for (let attempt = 0; attempt < 3; attempt += 1) {
            if (!canTransitionPaymentStatus(existing.status, targetStatus) || existing.status === targetStatus) return;
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
                return;
            }
            const current = await repo.findOne({ where: { asaasPaymentId: payment.id } });
            if (!current) return;
            existing = current;
        }
    }

    private static async getOrCreateOperation(
        moradia: Moradia,
        locatarioId: number,
        proprietarioId: number,
        valorMensal: number
    ): Promise<LocacaoOperacao> {
        const repo = BancoDeDados.getRepository(LocacaoOperacao);
        let operation = await repo.findOne({ where: { locatarioId, moradiaId: moradia.id } });
        if (operation) return operation;

        operation = repo.create({
            reference: randomUUID(),
            moradiaId: moradia.id,
            locatarioId,
            proprietarioId,
            valorMensal,
            status: "PENDENTE",
            stage: "CUSTOMER_READY",
            asaasCustomerId: null,
            asaasSubscriptionId: null,
            locacaoId: null,
            lastError: null,
            lockedUntil: null,
            createdAt: new Date(),
            updatedAt: new Date()
        });
        try {
            return await repo.save(operation);
        } catch (error) {
            const concurrent = await repo.findOne({ where: { locatarioId, moradiaId: moradia.id } });
            if (concurrent) return concurrent;
            throw error;
        }
    }

    private static async findByExternalReference<T extends { id: string }>(
        resource: "/customers" | "/subscriptions",
        reference: string
    ): Promise<T[]> {
        const result = await asaasRequest<AsaasList<T>>(
            `${resource}?externalReference=${encodeURIComponent(reference)}&limit=10`
        );
        return Array.isArray(result.data) ? result.data : [];
    }

    private static async updateOperationStage(
        operation: LocacaoOperacao,
        changes: Partial<LocacaoOperacao>,
        expectedStage?: string
    ): Promise<LocacaoOperacao> {
        const query = BancoDeDados.getRepository(LocacaoOperacao).createQueryBuilder()
            .update(LocacaoOperacao)
            .set({ ...changes, updatedAt: new Date() })
            .where("id = :id", { id: operation.id });
        if (expectedStage) {
            query.andWhere("stage = :expectedStage", { expectedStage });
        } else {
            query.andWhere("stage <> :complete", { complete: "COMPLETE" });
        }
        await query.execute();
        return BancoDeDados.getRepository(LocacaoOperacao).findOneByOrFail({ id: operation.id });
    }

    private static async releaseOperationState(
        operation: LocacaoOperacao,
        status: string,
        reason: string
    ): Promise<void> {
        await BancoDeDados.getRepository(LocacaoOperacao).createQueryBuilder()
            .update(LocacaoOperacao)
            .set({ status, lastError: reason, lockedUntil: null, updatedAt: new Date() })
            .where("id = :id AND status = :processing", { id: operation.id, processing: "PROCESSANDO" })
            .execute();
    }

    private static async releaseOperation(
        res: Response,
        operation: LocacaoOperacao,
        moradia: Moradia,
        message: string,
        status: string,
        httpStatus: number
    ) {
        await LocacaoController.releaseOperationState(operation, status, message);
        return LocacaoController.renderCheckoutError(res, moradia, message, httpStatus);
    }

    private static renderCheckoutError(res: Response, moradia: Moradia, erro: string, status = 400) {
        const valorCobrado = Number(moradia.preco) * 1.01;
        return res.status(status).render("pagamento", {
            moradia,
            asaasConfigurado: isAsaasConfigured(),
            erro,
            breakdown: LocacaoController.calcularCobranca(valorCobrado),
            chavePixPlataforma: "27996568893"
        });
    }
}
