export const SAO_JOAO_DE_PETROPOLIS = "São João de Petrópolis (Barracão)";

const saoJoaoAliases = [
    "Barracão",
    "Barracao",
    "São João de Petrópolis",
    "Sao Joao de Petropolis",
    "SJP"
];

const saoJoaoPattern = /(?<![\p{L}])(?:Barrac[aã]o\s*\(\s*S[aã]o\s+Jo[aã]o\s+de\s+Petr[oó]polis\s*\)|S[aã]o\s+Jo[aã]o\s+de\s+Petr[oó]polis\s*\(\s*Barrac[aã]o\s*\)|Barrac[aã]o\s*[,/]\s*S[aã]o\s+Jo[aã]o\s+de\s+Petr[oó]polis|S[aã]o\s+Jo[aã]o\s+de\s+Petr[oó]polis\s*[,/]\s*Barrac[aã]o|Barrac[aã]o|S[aã]o\s+Jo[aã]o\s+de\s+Petr[oó]polis|S\.?\s*J\.?\s*P\.?)(?![\p{L}])/iu;

function normalizeText(value: string): string {
    return value
        .normalize("NFD")
        .replace(/\p{Diacritic}/gu, "")
        .toLowerCase()
        .replace(/[().,]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

export function isSaoJoaoDePetropolis(value: string): boolean {
    return saoJoaoPattern.test(value);
}

export function formatLocalidade(value: string | null | undefined): string {
    if (!value) return "";
    const normalized = normalizeText(value);
    if (normalized === normalizeText(SAO_JOAO_DE_PETROPOLIS)) {
        return SAO_JOAO_DE_PETROPOLIS;
    }

    let replaced = false;
    return value
        .replace(new RegExp(saoJoaoPattern.source, "giu"), () => {
            if (replaced) return "";
            replaced = true;
            return SAO_JOAO_DE_PETROPOLIS;
        })
        .replace(/\s*,\s*,+/g, ", ")
        .replace(/,\s*([,.;])/g, "$1")
        .replace(/\s{2,}/g, " ")
        .replace(/^[\s,.;]+|[\s,.;]+$/g, "")
        .trim();
}

export function getSaoJoaoSearchPatterns(): string[] {
    return [
        ...saoJoaoAliases,
        SAO_JOAO_DE_PETROPOLIS
    ].map((alias) => `%${alias.toLowerCase()}%`);
}
