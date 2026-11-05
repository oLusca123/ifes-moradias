import { MigrationInterface, QueryRunner } from "typeorm";

export class AddReliableAsaasFlow1762300000000 implements MigrationInterface {
    name = "AddReliableAsaasFlow1762300000000";

    async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "locacao"
            ADD COLUMN IF NOT EXISTS "asaasSubscriptionStatus" character varying NOT NULL DEFAULT 'PENDENTE'
        `);

        await queryRunner.query(`
            ALTER TABLE "locacao"
            ALTER COLUMN "asaasCustomerId" DROP NOT NULL
        `);

        await queryRunner.query(`
            ALTER TABLE "locacao"
            ALTER COLUMN "asaasSubscriptionId" DROP NOT NULL
        `);

        await queryRunner.query(`
            ALTER TABLE "locacao"
            ALTER COLUMN "status" SET DEFAULT 'PENDENTE'
        `);

        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "locacao_operacao" (
                "id" SERIAL PRIMARY KEY,
                "reference" character varying NOT NULL,
                "moradiaId" integer NOT NULL,
                "locatarioId" integer NOT NULL,
                "proprietarioId" integer NOT NULL,
                "valorMensal" numeric(10, 2) NOT NULL,
                "status" character varying NOT NULL DEFAULT 'PENDENTE',
                "stage" character varying NOT NULL DEFAULT 'CUSTOMER_READY',
                "asaasCustomerId" text,
                "asaasSubscriptionId" text,
                "locacaoId" integer,
                "lastError" text,
                "lockedUntil" timestamptz,
                "createdAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
                "updatedAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await queryRunner.query(`
            CREATE UNIQUE INDEX IF NOT EXISTS "IDX_locacao_operacao_reference"
            ON "locacao_operacao" ("reference")
        `);

        await queryRunner.query(`
            CREATE UNIQUE INDEX IF NOT EXISTS "IDX_locacao_operacao_locatario_moradia"
            ON "locacao_operacao" ("locatarioId", "moradiaId")
        `);

        await queryRunner.query(`
            ALTER TABLE "asaas_webhook_event"
            ADD COLUMN IF NOT EXISTS "subscriptionId" text,
            ADD COLUMN IF NOT EXISTS "externalReference" text,
            ADD COLUMN IF NOT EXISTS "payload" text,
            ADD COLUMN IF NOT EXISTS "paymentValue" numeric(10, 2),
            ADD COLUMN IF NOT EXISTS "lockedUntil" timestamptz,
            ADD COLUMN IF NOT EXISTS "attemptCount" integer NOT NULL DEFAULT 0
        `);

    }

    async down(): Promise<void> {
        throw new Error("Esta migração mantém operações e eventos financeiros para reconciliação; rollback destrutivo não é automático.");
    }
}

export default AddReliableAsaasFlow1762300000000;
