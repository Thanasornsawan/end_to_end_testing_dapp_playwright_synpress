// config/test-data.config.ts
export const TestData = {
    DEFAULT_HARDHAT_ACCOUNT: {
        ACCOUNT_1: {
            ACCOUNT_NAME: 'Account 1',
            ACCOUNT_ADDRESS: '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266',
        },
        ACCOUNT_2: {
            ACCOUNT_NAME: 'Account 2',
            ACCOUNT_ADDRESS: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8'
        }
    },
    NETWORK_LIST: {
        NETWORK_ETH: {
            NETWORK_NAME: 'Local Ethereum',
            CHAIN_ID: 31337
        },
        NETWORK_OPTIMISM: {
            NETWORK_NAME: 'Local Optimism',
            CHIAN_ID: 420
        }
    },
    EVENT_NAME: {
        DEPOSIT_EVENT: 'DEPOSIT',
        WITHDRAW_EVENT: 'WITHDRAW',
        BORROW_EVENT: 'BORROW',
        REPAY_EVENT: 'REPAY',
        FULL_REPAY_EVENT: 'FULL_REPAY',
        LIQUIDATE_EVENT: 'LIQUIDATE'
    },
    MESSAGES: {
        REPAYMENT: {
            SUCCESS: 'Full repayment successful'
        },
        LIQUIDATION: {
            SUCCESS: 'Liquidation successful'
        },
        LIQUIDATION_WARNING: 'Position At Risk of Liquidation',
        AMOUNTS: {
            ZERO_ETH: '0.0 ETH',
            formatNumber: (num: number, preserveDecimal = false): string => {
                // If preserveDecimal is true, keep the original decimal places if num has 2 decimals
                if (preserveDecimal && num.toString().includes('.')) {
                    const parts = num.toString().split('.');
                    if (parts.length > 1 && parts[1] && parts[1].length >= 2) {
                        // Preserve at least 2 decimals
                        return num.toFixed(Math.max(2, parts[1].length));
                    }
                }
                // Otherwise show one decimal place
                return num.toFixed(1);
            },
            formatEthAmount: (amount: number | string): string => {
                const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
                
                // Preserve decimal places from original string if string was passed
                if (typeof amount === 'string' && amount.includes('.')) {
                    const parts = amount.split('.');
                    if (parts.length > 1 && parts[1] && parts[1].length > 1) {
                        return `${numAmount.toFixed(parts[1].length)} ETH`;
                    }
                }
                
                return `${numAmount.toFixed(1)} ETH`;
            },
            formatDeposit: (amount: number | string): string => {
                const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
                
                // Preserve decimal places from original string if string was passed
                if (typeof amount === 'string' && amount.includes('.')) {
                    const parts = amount.split('.');
                    if (parts.length > 1 && parts[1] && parts[1].length > 1) {
                        return `Deposit: ${numAmount.toFixed(parts[1].length)} ETH`;
                    }
                }
                
                return `Deposit: ${numAmount.toFixed(1)} ETH`;
            },
            formatBorrow: (amount: number | string): string => {
                const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
                
                // Preserve decimal places from original string if string was passed
                if (typeof amount === 'string' && amount.includes('.')) {
                    const parts = amount.split('.');
                    if (parts.length > 1 && parts[1] && parts[1].length > 1) {
                        return `Borrow: ${numAmount.toFixed(parts[1].length)} ETH`;
                    }
                }
                
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
            REFRESH_INTEREST: 'Refresh Interest Data',
            LIQUIDATE: /Liquidate Position/i,
            CANCEL_LIQUIDATION: 'Cancel'
        },
        TABS: {
            BORROW_REPAY: 'Borrow/Repay',
            DEPOSIT_WITHDRAW: 'Deposit/Withdraw',
            LIQUIDATE: 'Liquidate',
            STAKE: 'Stake WETH'
        },
        INPUTS: {
            DEPOSIT: 'Amount to deposit',
            BORROW: 'Amount to borrow',
            WITHDRAW: 'Amount to withdraw',
            LIQUIDATE: 'Enter ETH amount'
        },
        LABELS: {
            DEPOSIT: 'Deposit:',
            INTEREST_ACCURED: 'Interest Accrued:',
            HEALTH_FACTOR: 'Health Factor',
            LIQUIDATION_RISK: 'Liquidation Risk',
            COLLATERAL_VALUE: 'Collateral Value',
            HEALTH_STATUS: {
                SAFE: 'Safe',
                WARNING: 'Warning',
                DANGER: 'Danger'
            },
            LIQUIDATION: {
                POSITION_DETAILS: 'Position Details',
                YOUR_POSITION: 'Your Position',
                LIQUIDATABLE: 'Liquidatable'
            }
        },
        TEST_IDS: {
            // Tab IDs
            DEPOSIT_WITHDRAW_TAB: 'deposit-withdraw-tab',
            BORROW_REPAY_TAB: 'borrow-repay-tab',
            LIQUIDATE_TAB: 'liquidate-tab',
            STAKE_TAB: 'stake-tab',
            
            // Button IDs
            DEPOSIT_BUTTON: 'deposit-button',
            BORROW_BUTTON: 'borrow-button',
            REPAY_FULL_BUTTON: 'repay-full-button',
            WITHDRAW_BUTTON: 'withdraw-button',
            LIQUIDATE_BUTTON: 'liquidate-button',
            CANCEL_LIQUIDATION_BUTTON: 'cancel-liquidation',
            
            // Input IDs
            DEPOSIT_INPUT: 'deposit-input',
            BORROW_INPUT: 'borrow-input',
            WITHDRAW_INPUT: 'withdraw-input',
            LIQUIDATION_AMOUNT_INPUT: 'liquidation-amount-input',
            
            // Position IDs
            POSITION_INFO: 'position-info',
            DEPOSIT_AMOUNT: 'deposit-amount',
            BORROW_AMOUNT: 'borrow-amount',
            INTEREST_ACCRUED: 'interest-accrued',
            HEALTH_FACTOR: 'health-factor',
            HEALTH_FACTOR_PROGRESS: 'health-factor-progress',
            
            // Liquidation IDs
            LIQUIDATABLE_POSITION: 'liquidatable-position',
            OWN_LIQUIDATABLE_POSITION: 'own-liquidatable-position',
            LIQUIDATION_DETAILS: 'liquidation-details',
            
            // Message IDs
            SUCCESS_MESSAGE: 'success-message',
            SUCCESS_MESSAGE_DETAILS: 'success-message-details'
        }
    },
    TIMEOUTS: {
        SHORT: 1000,
        MEDIUM: 2000,
        LONG: 5000
    }
};