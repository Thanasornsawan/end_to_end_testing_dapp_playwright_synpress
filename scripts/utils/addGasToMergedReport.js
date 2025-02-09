const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

function formatGasData(gasReport) {
    const methods = {};
    
    // Loop through all methods
    Object.entries(gasReport.data.methods).forEach(([key, value]) => {
      // Only process TestLendingProtocol methods
      if (key.startsWith('TestLendingProtocol_') && !value.isCall) {
        const methodName = value.method; // Use the actual method name
        methods[methodName] = {
          avg: value.executionGasAverage,
          min: value.min,
          max: value.max,
          calls: value.numberOfCalls
        };
      }
    });
  
    return {
      blockGasLimit: gasReport.options.blockGasLimit,
      methods
    };
  }
  
  try {
    const gasReportPath = path.join(__dirname, '../../gas-reports/hardhat-gas-report.json');
    const mergedReportPath = path.join(__dirname, '../../test-reports/merged.json');
    
    const gasReport = require(gasReportPath);
    const mergedReport = require(mergedReportPath);
  
    const formattedData = formatGasData(gasReport);
    
    // Add gas data to each suite's context
    mergedReport.results[0].suites.forEach(suite => {
      if (!suite.afterHooks) suite.afterHooks = [];
      
      // Add or update gas report hook
      suite.afterHooks = suite.afterHooks.filter(hook => 
        !hook.title.includes('gas report')
      );
  
      suite.afterHooks.push({
        title: "\"after all\" hook: after gas report",
        fullTitle: `${suite.title} "after all" hook: after gas report`,
        timedOut: false,
        duration: 0,
        state: null,
        speed: null,
        pass: false,
        fail: false,
        pending: false,
        context: JSON.stringify([{
          title: 'Gas Usage Report',
          value: formattedData
        }]),
        code: `try {
          const gasReport = require('./gas-reports/hardhat-gas-report.json');
          addContext(this, {
            title: 'Gas Usage Report',
            value: gasReport
          });
        } catch (error) {
          console.log('Gas report not ready yet, skipping...', error);
        }`,
        err: {},
        uuid: uuidv4(),
        parentUUID: suite.uuid,
        isHook: true,
        skipped: false
      });
    });
  
    fs.writeFileSync(mergedReportPath, JSON.stringify(mergedReport, null, 2));
    console.log('Successfully added gas data to merged report');
  
  } catch (error) {
    console.error('Error processing reports:', error);
    process.exit(1);
  }