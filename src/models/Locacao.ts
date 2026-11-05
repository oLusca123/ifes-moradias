import {
    Column,
    Entity,
    Index,
    PrimaryGeneratedColumn
} from "typeorm";

@Entity("locacao")
@Index(["locatarioId", "moradiaId"], { unique: true })
export class Locacao {
    @PrimaryGeneratedColumn()
    id!: number;

    @Column()
    moradiaId!: number;

    @Column()
    locatarioId!: number;

    @Column()
    proprietarioId!: number;

    @Column({ type: "text", nullable: true })
    asaasCustomerId!: string | null;

    @Column({ type: "text", nullable: true, unique: true })
    asaasSubscriptionId!: string | null;

    @Column({ default: "PENDENTE" })
    asaasSubscriptionStatus!: string;

    @Column("decimal", { precision: 10, scale: 2 })
    valorMensal!: number;

    @Column({ default: "PENDENTE" })
    status!: string;
}

@Entity("locacao_operacao")
@Index(["locatarioId", "moradiaId"], { unique: true })
@Index(["reference"], { unique: true })
export class LocacaoOperacao {
    @PrimaryGeneratedColumn()
    id!: number;

    @Column()
    reference!: string;

    @Column()
    moradiaId!: number;

    @Column()
    locatarioId!: number;

    @Column()
    proprietarioId!: number;

    @Column("decimal", { precision: 10, scale: 2 })
    valorMensal!: number;

    @Column({ default: "PENDENTE" })
    status!: string;

    @Column({ default: "CUSTOMER_READY" })
    stage!: string;

    @Column({ type: "text", nullable: true })
    asaasCustomerId!: string | null;

    @Column({ type: "text", nullable: true })
    asaasSubscriptionId!: string | null;

    @Column({ type: "integer", nullable: true })
    locacaoId!: number | null;

    @Column({ type: "text", nullable: true })
    lastError!: string | null;

    @Column({ type: process.env.DATABASE_URL ? "timestamptz" : "datetime", nullable: true })
    lockedUntil!: Date | null;

    @Column({ type: process.env.DATABASE_URL ? "timestamptz" : "datetime", default: () => "CURRENT_TIMESTAMP" })
    createdAt!: Date;

    @Column({ type: process.env.DATABASE_URL ? "timestamptz" : "datetime", default: () => "CURRENT_TIMESTAMP" })
    updatedAt!: Date;
}

@Entity("pagamento_aluguel")
@Index(["locacaoId", "asaasPaymentId"], { unique: true })
export class PagamentoAluguel {
    @PrimaryGeneratedColumn()
    id!: number;

    @Column()
    locacaoId!: number;

    @Column({ unique: true })
    asaasPaymentId!: string;

    @Column("decimal", { precision: 10, scale: 2 })
    valor!: number;

    @Column({ type: "text", nullable: true })
    vencimento!: string | null;

    @Column({ default: "PENDING" })
    status!: string;
}

@Entity("asaas_webhook_event")
export class AsaasWebhookEvent {
    @PrimaryGeneratedColumn()
    id!: number;

    @Column({ unique: true })
    eventId!: string;

    @Column()
    eventType!: string;

    @Column({ type: "text", nullable: true })
    paymentId!: string | null;

    @Column({ type: "text", nullable: true })
    subscriptionId!: string | null;

    @Column({ type: "text", nullable: true })
    externalReference!: string | null;

    @Column({ type: "text", nullable: true })
    payload!: string | null;

    @Column({ type: "decimal", precision: 10, scale: 2, nullable: true })
    paymentValue!: number | null;

    @Column({ type: process.env.DATABASE_URL ? "timestamptz" : "datetime" })
    receivedAt!: Date;

    @Column({ type: process.env.DATABASE_URL ? "timestamptz" : "datetime", nullable: true })
    processingStartedAt!: Date | null;

    @Column({ type: process.env.DATABASE_URL ? "timestamptz" : "datetime", nullable: true })
    processedAt!: Date | null;

    @Column({ type: process.env.DATABASE_URL ? "timestamptz" : "datetime", nullable: true })
    lockedUntil!: Date | null;

    @Column({ default: 0 })
    attemptCount!: number;

    @Column({ default: "PENDING" })
    result!: string;

    @Column({ type: "text", nullable: true })
    resultDetails!: string | null;
}
