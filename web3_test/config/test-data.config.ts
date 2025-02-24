// config/test-data.config.ts
export const TestData = {
    MESSAGES: {
        REPAYMENT: {
            SUCCESS: 'Full repayment successful'
        },
        AMOUNTS: {
            ZERO_ETH: '0.0 ETH',
            formatNumber: (num: number): string => {
                // Always show one decimal place
                return num.toFixed(1);
            },
            formatEthAmount: (amount: number | string): string => {
                const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
                return `${numAmount.toFixed(1)} ETH`;
            },
            formatDeposit: (amount: number | string): string => {
                const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
                return `Deposit: ${numAmount.toFixed(1)} ETH`;
            },
            formatBorrow: (amount: number | string): string => {
                const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
                return `Borrow: ${numAmount.toFixed(1)} ETH`;
            }
        }
    },
    SELECTORS: {
        BUTTONS: {
            CONNECT_WALLET: /Connect Wallet/i,
            CONNECTED_WALLET: /Connected: 0x/i,
            DEPOSIT: 'Deposit',
            BORROW: 'Borrow',
            REPAY_FULL: 'Repay Full Amount',
            WITHDRAW: 'Withdraw',
            SHOW_INTEREST: 'Show Interest Details',
            REFRESH_INTEREST: 'Refresh Interest Data'
        },
        TABS: {
            BORROW_REPAY: 'Borrow/Repay',
            DEPOSIT_WITHDRAW: 'Deposit/Withdraw'
        },
        INPUTS: {
            DEPOSIT: 'Amount to deposit',
            BORROW: 'Amount to borrow',
            WITHDRAW: 'Amount to withdraw'
        },
        LABELS: {
            DEPOSIT: 'Deposit:',
            INTEREST_ACCURED: 'Interest Accrued:',
        }
    },
    TIMEOUTS: {
        SHORT: 1000,
        MEDIUM: 2000,
        LONG: 5000
    }
};