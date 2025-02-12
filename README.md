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
```sh
npx prisma db push
```
![db2](https://github.com/Thanasornsawan/E2E_blockchain_testing/blob/main/pictures/db_set2.png?raw=true)

**Generate client**
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