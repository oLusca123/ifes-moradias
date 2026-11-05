export class AsaasApiError extends Error {
    status: number | null;
    ambiguous: boolean;
    validationCodes: string[];

    constructor(message: string, status: number | null, ambiguous: boolean, validationCodes: string[] = []) {
        super(message);
        this.name = "AsaasApiError";
        this.status = status;
        this.ambiguous = ambiguous;
        this.validationCodes = validationCodes;
    }
}

type AsaasValidationError = {
    code: string;
    description: string | null;
};

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

function extractValidationErrors(payload: unknown): AsaasValidationError[] {
    if (!payload || typeof payload !== "object" || !Array.isArray((payload as { errors?: unknown }).errors)) {
        return [];
    }

    return (payload as { errors: unknown[] }).errors.flatMap((item) => {
        if (!item || typeof item !== "object") return [];
        const error = item as { code?: unknown; description?: unknown };
        if (typeof error.code !== "string") return [];
        return [{
            code: error.code,
            description: typeof error.description === "string" ? error.description : null
        }];
    });
}

function safeEndpoint(path: string): string {
    const pathname = new URL(path, "https://asaas.invalid").pathname;
    return pathname
        .replace(/\/payments\/[^/]+\/pixQrCode$/, "/payments/:paymentId/pixQrCode")
        .replace(/\/subscriptions\/[^/]+\/payments$/, "/subscriptions/:subscriptionId/payments");
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
            let payload: unknown = null;
            try {
                payload = await response.json();
            } catch {
                payload = null;
            }
            const validationErrors = extractValidationErrors(payload);
            const validationCodes = validationErrors
                .map(({ code }) => code)
                .filter((code) => /^[A-Za-z0-9_.-]{1,100}$/.test(code));

            console.error("Asaas API request rejected", {
                method,
                endpoint: safeEndpoint(path),
                status: response.status,
                validationCodes
            });

            throw new AsaasApiError(
                "O Asaas não conseguiu concluir a solicitação.",
                response.status,
                method === "POST" && response.status >= 500,
                validationCodes
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
