# E2E_blockchain_testing

Refer blog https://medium.com/coinmonks/qa-blockchain-testing-smart-contract-network-performance-with-hardhat-d01e99e331e7

Command to run all test cases
```sh
npm run test:main_network_fork_report
```

## For DB setup (for integration testing with off-chain data)

**Install dependencies**
```sh
npm install @prisma/client
npm install prisma --save-dev
```
**Start postgresql db with Prisma on docker compose**
```sh
docker-compose up -d
```

![db4](https://github.com/Thanasornsawan/E2E_blockchain_testing/blob/main/pictures/db_set4.png?raw=true)
**Push schema to database**
Creates the tables according to your Prisma schema
```sh
npx prisma db push
```
![db2](https://github.com/Thanasornsawan/E2E_blockchain_testing/blob/main/pictures/db_set2.png?raw=true)

**Generate client**
Generates the TypeScript client for your application
```sh
npx prisma generate
```
**Check database tables**
```sh
npx prisma db pull
```

![db3](https://github.com/Thanasornsawan/E2E_blockchain_testing/blob/main/pictures/db_set3.png?raw=true)
**Test db connection**
```sh
npx ts-node test-db-connection.ts
```

![db1](https://github.com/Thanasornsawan/E2E_blockchain_testing/blob/main/pictures/db_set1.png?raw=true)


├── README.md
├── blockNumbers.json
├── contracts/
│   ├── core/
│   │   ├── TestLendingProtocol.sol
│   │   └── EnhancedLendingProtocol.sol
│   ├── integration/
│   │   ├── APIIntegrationManager.sol
│   │   └── EventIndexer.sol
│   ├── interfaces/
│   │   ├── IWETH.sol
│   │   ├── IPriceOracle.sol
│   │   └── IAPIIntegration.sol
│   └── mocks/
│       ├── MockUSDC.sol
│       ├── MockWETH.sol
│       └── MockPriceOracle.sol
├── frontend/
│   ├── components/
│   │   ├── ui
│   │       ├── card.tsx
│   │       ├──badge.tsx
│   │       ├──progress.tsx
│   │       ├──button.tsx
│   │       ├──input.tsx
│   │       ├──alert.tsx
│   │       ├── tabs.tsx
│   │   ├── EnhancedLendingDApp.tsx
│   │   ├── ProtocolStatistics.tsx
│   │   └── RiskMonitor.tsx
│   ├── pages/
│   │   └── index.tsx
│   │   └── app.tsx
│   ├── styles/
│   │   └── globals.css
│   └── lib/utils.ts
│   └── utils/
│       └── web3.ts
│   └── next-env.d.ts
│   └──next.config.js
│   └── postcss.config.js
│   └── tailwind.config.js
│   └── tsconfig.json
├── hardhat.config.ts
├── jest.config.ts
├── package.json
├── prisma/
│   └── schema.prisma
├── scripts/
│   ├── deploy/
│   │   ├── deployAndUpdateAddresses.ts
│   │   └── deployEnhancedProtocol.ts
│   └── utils/
│       ├── addGasToMergedReport.js
│       ├── getAndSaveBlockNumber.js
│       └── network-helpers.ts
├── test/
│   ├── config/
│   │   └── networks.json
│   ├── e2e/
│   │   ├── fixtures/
│   │   │   └── setup.ts
│   │   └── specs/
│   │       ├── lending.spec.ts
│   │       └── integration.spec.ts
│   ├── integration/
│   │   ├── APIIntegration.test.ts
│   │   └── EventIndexing.test.ts
│   ├── network/
│   │   ├── A_PerformanceTest.test.ts
│   │   ├── CrossNetworkTest.test.ts
│   │   └── NetworkConditionsTest.test.ts
│   └── setup.ts
├── tsconfig.json
├── .env
├── .env.example
└── docker-compose.yml