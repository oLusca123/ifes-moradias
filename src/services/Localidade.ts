export const BARRACAO = "Barracão";

const localityAlias = "(?:Barrac[aã]o|S[aã]o\\s+Jo[aã]o\\s+de\\s+Petr[oó]polis|S\\.?\\s*J\\.?\\s*P\\.?)";
const legacyLocalityPattern = new RegExp(
    `(?<![\\p{L}])(?:${localityAlias})(?![\\p{L}])`,
    "iu"
);
const legacyLocalitySequencePattern = new RegExp(
    `(?<![\\p{L}])(?:${localityAlias}\\s*\\(\\s*${localityAlias}\\s*\\)|${localityAlias}\\s*[,/]\\s*${localityAlias})(?![\\p{L}])`,
    "giu"
);

export function isBarracao(value: string): boolean {
    return legacyLocalityPattern.test(value);
}

export function formatLocalidade(value: string | null | undefined): string {
    if (!value) return "";

    return value
        .replace(legacyLocalitySequencePattern, BARRACAO)
        .replace(new RegExp(legacyLocalityPattern.source, "giu"), BARRACAO)
        .replace(/Barracão(?:\s*(?:,|\/|e)\s*Barracão)+/giu, BARRACAO)
        .replace(/\s*,\s*,+/g, ", ")
        .replace(/,\s*([,.;])/g, "$1")
        .replace(/\s{2,}/g, " ")
        .replace(/^[\s,.;]+|[\s,.;]+$/g, "")
        .trim();
}

export function getBarracaoSearchPatterns(): string[] {
    return [
        "Barracão",
        "Barracao",
        "São João de Petrópolis",
        "Sao Joao de Petropolis",
        "SJP",
        "S.J.P.",
        "Barracão (São João de Petrópolis)",
        "São João de Petrópolis (Barracão)",
        "Barracão, São João de Petrópolis",
        "São João de Petrópolis, Barracão"
    ].map((alias) => `%${alias.toLowerCase()}%`);
}
