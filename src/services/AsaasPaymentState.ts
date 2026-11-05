export type PaymentStatus =
    | "PENDING"
    | "CONFIRMED"
    | "OVERDUE"
    | "RECEIVED"
    | "DELETED"
    | "CANCELED"
    | "REFUND_IN_PROGRESS"
    | "PARTIALLY_REFUNDED"
    | "REFUNDED";

const transitions: Record<PaymentStatus, PaymentStatus[]> = {
    PENDING: [
        "PENDING",
        "CONFIRMED",
        "OVERDUE",
        "RECEIVED",
        "DELETED",
        "CANCELED",
        "REFUND_IN_PROGRESS",
        "PARTIALLY_REFUNDED",
        "REFUNDED"
    ],
    CONFIRMED: [
        "CONFIRMED",
        "RECEIVED",
        "REFUND_IN_PROGRESS",
        "PARTIALLY_REFUNDED",
        "REFUNDED"
    ],
    OVERDUE: [
        "OVERDUE",
        "CONFIRMED",
        "RECEIVED",
        "DELETED",
        "CANCELED",
        "REFUND_IN_PROGRESS",
        "PARTIALLY_REFUNDED",
        "REFUNDED"
    ],
    RECEIVED: ["RECEIVED", "REFUND_IN_PROGRESS", "PARTIALLY_REFUNDED", "REFUNDED"],
    DELETED: ["DELETED"],
    CANCELED: ["CANCELED"],
    REFUND_IN_PROGRESS: ["REFUND_IN_PROGRESS", "PARTIALLY_REFUNDED", "REFUNDED"],
    PARTIALLY_REFUNDED: ["PARTIALLY_REFUNDED", "REFUNDED"],
    REFUNDED: ["REFUNDED"]
};

const statusByEvent: Record<string, PaymentStatus> = {
    PAYMENT_CREATED: "PENDING",
    PAYMENT_CONFIRMED: "CONFIRMED",
    PAYMENT_RECEIVED: "RECEIVED",
    PAYMENT_OVERDUE: "OVERDUE",
    PAYMENT_DELETED: "DELETED",
    PAYMENT_CANCELED: "CANCELED",
    PAYMENT_REFUND_IN_PROGRESS: "REFUND_IN_PROGRESS",
    PAYMENT_PARTIALLY_REFUNDED: "PARTIALLY_REFUNDED",
    PAYMENT_REFUNDED: "REFUNDED"
};

const statusByProviderStatus: Record<string, PaymentStatus> = {
    PENDING: "PENDING",
    CONFIRMED: "CONFIRMED",
    OVERDUE: "OVERDUE",
    RECEIVED: "RECEIVED",
    RECEIVED_IN_CASH: "RECEIVED",
    DELETED: "DELETED",
    CANCELED: "CANCELED",
    REFUND_IN_PROGRESS: "REFUND_IN_PROGRESS",
    PARTIALLY_REFUNDED: "PARTIALLY_REFUNDED",
    REFUNDED: "REFUNDED"
};

export function getPaymentStatus(eventType: string, providerStatus?: string): PaymentStatus | null {
    const eventStatus = statusByEvent[eventType];
    if (eventStatus) return eventStatus;
    if (eventType !== "PAYMENT_UPDATED" || !providerStatus) return null;
    return statusByProviderStatus[providerStatus.toUpperCase()] || null;
}

export function canTransitionPaymentStatus(current: string, next: string): boolean {
    return Boolean(transitions[current as PaymentStatus]?.includes(next as PaymentStatus));
}

export function isValidCpfCnpj(input: string): boolean {
    const digits = input.replace(/\D/g, "");
    if (!/^(?:\d{11}|\d{14})$/.test(digits) || /^(\d)\1+$/.test(digits)) {
        return false;
    }

    const calculateDigit = (values: number[], weights: number[]) => {
        const sum = values.reduce((total, value, index) => total + value * weights[index], 0);
        const remainder = sum % 11;
        return remainder < 2 ? 0 : 11 - remainder;
    };

    if (digits.length === 11) {
        const values = [...digits].map(Number);
        const first = calculateDigit(values.slice(0, 9), [10, 9, 8, 7, 6, 5, 4, 3, 2]);
        const second = calculateDigit(values.slice(0, 10), [11, 10, 9, 8, 7, 6, 5, 4, 3, 2]);
        return values[9] === first && values[10] === second;
    }

    const values = [...digits].map(Number);
    const first = calculateDigit(values.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
    const second = calculateDigit(values.slice(0, 13), [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
    return values[12] === first && values[13] === second;
}
