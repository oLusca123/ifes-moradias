import { BancoDeDados } from "./BDConn";
import { Usuario } from "../models/Usuario";

export const sandboxDemoWalletId = "ebbfc763-f0cb-47b3-9308-08c9f5deb3c5";

export function isStagingDemoRentalsEnabled(): boolean {
    return process.env.ASAAS_STAGING_DEMO_RENTALS === "true"
        && process.env.ASAAS_ENVIRONMENT === "sandbox"
        && process.env.RENDER_GIT_BRANCH === "staging-asaas";
}

export async function findStagingDemoOwner(): Promise<Usuario | null> {
    if (!isStagingDemoRentalsEnabled()) return null;

    const matches = await BancoDeDados.getRepository(Usuario).find({
        where: { asaasWalletId: sandboxDemoWalletId },
        take: 2
    });
    if (matches.length > 1) {
        throw new Error("A wallet de teste está associada a mais de uma conta.");
    }

    return matches[0] || null;
}
