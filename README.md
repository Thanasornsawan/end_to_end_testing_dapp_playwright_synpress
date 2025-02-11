# E2E_blockchain_testing

.env file format
```
# Network RPCs
MAINNET_RPC_URL=https://eth-mainnet.g.alchemy.com/v2/<--your_alchemy_api_key-->
POLYGON_RPC_URL=https://polygon-mainnet.g.alchemy.com/v2/<--your_alchemy_api_key-->
LOCAL_RPC_URL=http://127.0.0.1:8545
SEPOLIA_RPC_URL=https://sepolia.infura.io/v3/<--your_infura_api_key-->

ALCHEMY_API_KEY=<--your_alchemy_api_key-->
MAINNET_PRIVATE_KEY=<--private_key_metamask-->
POLYGON_PRIVATE_KEY=<--private_key_metamask-->
SEPOLIA_PRIVATE_KEY=<--private_key_metamask-->

ETHERSCAN_API_KEY=<--your_etherscan_api_key-->
POLYGONSCAN_API_KEY=<--your_polygonscan_api_key-->

REPORT_GAS=true
COINMARKETCAP_API_KEY=<--your_coinmarketcap_api_key-->
```

Refer blog https://medium.com/coinmonks/qa-blockchain-testing-smart-contract-network-performance-with-hardhat-d01e99e331e7

Command to run all test cases
```sh
npm run test:main_network_fork_report
```