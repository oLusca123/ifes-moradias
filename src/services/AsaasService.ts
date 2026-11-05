export class AsaasApiError extends Error {
    status: number | null;
    ambiguous: boolean;

    constructor(message: string, status: number | null, ambiguous: boolean) {
        super(message);
        this.name = "AsaasApiError";
        this.status = status;
        this.ambiguous = ambiguous;
    }
}

type AsaasRequestOptions = {
    method?: string;
    timeoutMs?: number;
    body?: unknown;
};

function apiUrl(path: string): string {
    const environment = process.env.ASAAS_ENVIRONMENT || "sandbox";
    if (environment !== "sandbox" && environment !== "production") {
        throw new AsaasApiError("A configuração de pagamentos está inválida.", null, false);
    }

    const base = environment === "production"
        ? "https://api.asaas.com/v3"
        : "https://api-sandbox.asaas.com/v3";

    return `${base}${path}`;
}

export async function asaasRequest<T>(path: string, options: AsaasRequestOptions = {}): Promise<T> {
    const apiKey = process.env.ASAAS_API_KEY;
    if (!apiKey) {
        throw new AsaasApiError("Os pagamentos online ainda não estão ativos.", null, false);
    }

    const method = options.method || "GET";
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs || 15000);

    try {
        const response = await fetch(apiUrl(path), {
            method,
            headers: {
                "Content-Type": "application/json",
                access_token: apiKey
            },
            body: options.body === undefined ? undefined : JSON.stringify(options.body),
            signal: controller.signal
        });

        if (!response.ok) {
            throw new AsaasApiError(
                "O Asaas não conseguiu concluir a solicitação.",
                response.status,
                method === "POST" && response.status >= 500
            );
        }

        try {
            return await response.json() as T;
        } catch {
            throw new AsaasApiError("O Asaas retornou uma resposta inválida.", response.status, method === "POST");
        }
    } catch (error) {
        if (error instanceof AsaasApiError) throw error;
        throw new AsaasApiError(
            "Não foi possível confirmar a resposta do Asaas. A operação será reconciliada antes de uma nova tentativa.",
            null,
            method === "POST"
        );
    } finally {
        clearTimeout(timeout);
    }
}

export function isAsaasConfigured(): boolean {
    return Boolean(process.env.ASAAS_API_KEY);
}
