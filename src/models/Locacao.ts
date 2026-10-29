import { Entity, PrimaryGeneratedColumn, Column, Index } from "typeorm";

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

    @Column()
    asaasCustomerId!: string;

    @Column({ unique: true })
    asaasSubscriptionId!: string;

    @Column("decimal", { precision: 10, scale: 2 })
    valorMensal!: number;

    @Column({ default: "ATIVA" })
    status!: string;
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

    @Column({ type: "datetime" })
    receivedAt!: Date;

    @Column({ type: "datetime", nullable: true })
    processingStartedAt!: Date | null;

    @Column({ type: "datetime", nullable: true })
    processedAt!: Date | null;

    @Column({ default: "PROCESSING" })
    result!: string;

    @Column({ type: "text", nullable: true })
    resultDetails!: string | null;
}
