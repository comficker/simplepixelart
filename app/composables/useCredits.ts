/**
 * The credit balance shown in the top bar's wallet.
 *
 * Shared state rather than a per-component ref, because anything that spends
 * credits (the agent, a generation) already gets the new balance back in its
 * response — writing it here means the wallet updates without another request.
 */
export const useCredits = () => {
    const balance = useState<number | null>('credits-balance', () => null)

    return {
        balance,
        setBalance: (n: number | null | undefined) => {
            if (typeof n === 'number' && Number.isFinite(n)) balance.value = n
        },
    }
}
