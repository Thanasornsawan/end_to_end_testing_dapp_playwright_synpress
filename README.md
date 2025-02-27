# 🏦 End-to-End Testing of a DeFi Lending Protocol with Synpress & Playwright

This repository provides a complete **end-to-end (E2E) testing setup** for a **DeFi lending smart contract** using **Synpress v4, Playwright, and Hardhat**. 
<br/>
It covers:
<br/>
✅ Smart contract deployment & interaction (Hardhat)  <br/>
✅ Automated testing with **Synpress + Playwright** (MetaMask interaction included!)  <br/>
✅ Local and **mainnet fork testing**  <br/>
✅ **Database integration testing** with PostgreSQL (Prisma ORM)  <br/>
<br/>
This project is perfect for **QA engineers, blockchain testers, and developers** who want to learn **end-to-end blockchain testing** using real-world tools. 🚀 <br/>

## ⭐ Why Use This Repo?
- **Hands-on Learning:** Learn how to test DeFi smart contracts with real tools.
- **Complete Setup:** Covers both frontend and backend testing, including **MetaMask interaction**.
- **Mainnet Forking:** Test against real Ethereum mainnet data using **Alchemy & Hardhat**.
- **Database Testing:** Use **PostgreSQL + Prisma** for off-chain integration testing.

🔹 If you find this repo useful, **please ⭐ star it** to support the project!

### 🛠️ How to Setup project 🛠️

1. Install dependencies:

1.1 Install dependencies for Backend (smart contract):
```bash
npm install
```
1.2 Install dependencies for Frontend (react + nexjs):
```bash
cd frontend & npm install
```
1.3 Install dependencies for Synpress and Playwright:
```bash
cd web3_test & npm install
```

2. Set up environment variables:

```bash
cp .env.example .env
```

Edit `.env` with your configuration:

3. Create wallet setup cache:

```bash
cd web3_test
npx synpress wallet-setup
```

4. Run Tests in Headed or Headless mode

```bash
npm run test:playwright:headful
```

or

```bash
npm run test:playwright:headless
```

### How to run project locally (DApp test cases)

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

![e2e](https://github.com/Thanasornsawan/E2E_blockchain_testing/blob/main/pictures/e2e.gif?raw=true)

### Topic Node Tesing on smart contract (Defi)

Refer blog https://medium.com/coinmonks/qa-blockchain-testing-smart-contract-network-performance-with-hardhat-d01e99e331e7

Command to run all test cases (refer backend test cases folder ./test/network)
```sh
# Terminal 1: Start local fork
npx hardhat node --fork https://eth-mainnet.alchemyapi.io/v2/YOUR_KEY

# Terminal 2: Run tests
npm run test:main_network_fork_report
```

### For DB setup (for integration testing with off-chain data)

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

### References

- [Playwright](https://playwright.dev/)
- [Synpress](https://synpress.io/)
- [MetaMask](https://metamask.io/)
- [Hardhat](https://hardhat.org/docs)