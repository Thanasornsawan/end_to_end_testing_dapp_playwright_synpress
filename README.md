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

Complie all the smart contract to your local project:
```bash
npx hardhat compile
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

3. database setup (off-chain data for tracking events):<br/>

3.1 Install dependencies:
```sh
npm install @prisma/client
npm install prisma --save-dev
```
3.2 Start postgresql db with Prisma on docker compose:
```sh
docker-compose up -d
```

![db4](https://github.com/Thanasornsawan/E2E_blockchain_testing/blob/main/pictures/db_set4.png?raw=true)

3.3 Push schema to database:<br/>
Creates the tables according to your Prisma schema:

```sh
npx prisma db push
```
![db2](https://github.com/Thanasornsawan/E2E_blockchain_testing/blob/main/pictures/db_set2.png?raw=true)

Generate client<br/>
Generates the TypeScript client for your application
```sh
npx prisma generate
```
3.4 Check database tables:
```sh
npx prisma db pull
```

![db3](https://github.com/Thanasornsawan/E2E_blockchain_testing/blob/main/pictures/db_set3.png?raw=true)

3.5 Test db connection:
```sh
npx ts-node test-db-connection.ts
```

![db1](https://github.com/Thanasornsawan/E2E_blockchain_testing/blob/main/pictures/db_set1.png?raw=true)

Optional: Delete all db data
```sh
npx ts-node scripts/utils/clearDatabase.ts
```

4. Create wallet setup cache:

```bash
cd web3_test
npx synpress wallet-setup
```
![wallet](https://github.com/Thanasornsawan/E2E_blockchain_testing/blob/main/pictures/wallet_setup.gif?raw=true)

5. Setup anvil (for custom network chainId and gas)
```bash
curl -L https://foundry-paradigm.xyz
foundryup
```
![anvil](https://github.com/Thanasornsawan/E2E_blockchain_testing/blob/main/pictures/setup_anvil.png?raw=true)

### How to run project locally (DApp test cases)

```sh
# Terminal 1: Start local network (if you want to test single network on local)
npx hardhat node

# or use anvil to start 2 networks in the same time by custom script
node scripts/utils/run-local-l1-l2.js
```

![anvil_script1](https://github.com/Thanasornsawan/E2E_blockchain_testing/blob/main/pictures/anvil1.png?raw=true)
![anvil_script2](https://github.com/Thanasornsawan/E2E_blockchain_testing/blob/main/pictures/anvil2.png?raw=true)
![anvil_script3](https://github.com/Thanasornsawan/E2E_blockchain_testing/blob/main/pictures/anvil3.png?raw=true)

```sh
# Terminal 2: Deploy smart contract to both network
npx hardhat run scripts/deploy/deploy-l1.ts --network mainnetFork 
npx hardhat run scripts/deploy/deploy-l2.ts --network optimismFork

# Terminal 3: Start the front-end server (localhost:3000)
cd frontend & npm run dev

# Terminal 4: Run test cases with Playwright
npm run test:playwright:headless

## or with UI headful

npm run test:playwright:headful
```

If you want to update oracle price manually, run command:
```sh
npx hardhat run scripts/utils/updatePrice.ts --network local
```

If you want to simulate time pass for interest rate when borrow on local network, run command: <br/>

default time advance 15 seconds
```sh
npx hardhat run scripts/utils/simulate-time-passage.js --network local
```
or simulate time advance 30 day

```sh
SIMULATE_30_DAYS=true npx hardhat run scripts/utils/simulate-time-passage.js --network local
```

![e2e](https://github.com/Thanasornsawan/E2E_blockchain_testing/blob/main/pictures/e2e.gif?raw=true)

### Topic Node Tesing on smart contract (Defi)

Command to run all test cases (refer backend test cases folder ./test/network)
```sh
# Terminal 1: Start local fork
npx hardhat node --fork https://eth-mainnet.alchemyapi.io/v2/YOUR_KEY

# Terminal 2: Run tests
npm run test:main_network_fork_report
```
### References

- [Playwright](https://playwright.dev/)
- [Synpress](https://synpress.io/)
- [MetaMask](https://metamask.io/)
- [Hardhat](https://hardhat.org/docs)
- [Anvil](https://book.getfoundry.sh/reference/anvil/)

### Blog
[QA Blockchain Testing: Smart Contract & Network Performance with Hardhat](https://medium.com/coinmonks/qa-blockchain-testing-smart-contract-network-performance-with-hardhat-d01e99e331e7)