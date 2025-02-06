const { getBlockNumber } = require("./getBlockNumber.js");
const fs = require("fs");

async function preload() {
  const blockNumbers = await getBlockNumber();
  fs.writeFileSync("./blockNumbers.json", JSON.stringify(blockNumbers, null, 2));
  console.log("✅ Block numbers saved!");
}

preload();