# E2E_blockchain_testing

## Topic DApp Web3 testing (Defi) with Synpress V4 and Playwright

Command to setup Metamask wallet:
```sh
npx synpress wallet-setup
```

Command to run test cases with Synpress on hardhat local network
```sh
# Terminal 1: Start local network
npx hardhat node

# Terminal 2: Deploy smart contract to local network
npx hardhat run scripts/deploy/deployAndUpdateAddresses.ts --network local

# Terminal 3: Start the front-end server
cd frontend & npm run dev

# Terminal 4: Run test cases with Playwright
npm run test:playwright:headless
```

If you want to update oracle price manually, run command:
```sh
npx hardhat run scripts/utils/updatePrice.ts --network local
```

If you want to simulate time pass for interest rate when borrow on local network, run command:
```sh
npx hardhat run scripts/utils/simulate-time-passage.js --network local
```

## Topic Node Tesing on smart contract (Defi)

Refer blog https://medium.com/coinmonks/qa-blockchain-testing-smart-contract-network-performance-with-hardhat-d01e99e331e7

Command to run all test cases (refer backend test cases folder ./test/network)
```sh
# Terminal 1: Start local fork
npx hardhat node --fork https://eth-mainnet.alchemyapi.io/v2/YOUR_KEY

# Terminal 2: Run tests
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

**Delete all db data**
```sh
npx ts-node scripts/utils/clearDatabase.ts
```