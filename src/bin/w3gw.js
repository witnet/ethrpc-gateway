#!/usr/bin/env node
require('dotenv').config();
const execSync = require('child_process').execSync;
const scripts = require('../../package.json').scripts;

if (process.argv.length >= 3) {
    for (var key in scripts) {
        if (key === process.argv[2]) {
            if (process.argv.length >= 4) {
                // a specific JSONRPC provider has been specified in the command line:
                var cmdline = scripts[key].split(" ");
                cmdline[cmdline.length - 2] = process.argv[3];
                if (process.env.W3GW_PORT) {
                    cmdline[cmdline.length - 1] = process.env.W3GW_PORT;
                }
                execSync("yarn ".concat(cmdline.join(" "), " ").concat(process.argv.slice(4).join(" ")), { stdio: 'inherit' });
            }
            else if (process.env.W3GW_PROVIDER_URL) {
                // the W3GW_PROVIDER_URL variable is set
                var cmdline = scripts[key].split(" ");
                cmdline[cmdline.length - 2] = process.env.W3GW_PROVIDER_URL;
                if (process.env.W3GW_PORT) {
                    cmdline[cmdline.length - 1] = process.env.W3GW_PORT;
                }
                execSync("yarn ".concat(cmdline.join(" "), " ").concat(process.argv.slice(3).join(" ")), { stdio: 'inherit' });
            }
            else if (process.env.W3GW_PORT) {
                // the W3GW_PORT variable is set while W3GW_PROVIDER_URL is not
                var cmdline = scripts[key].split(" ");
                cmdline[cmdline.length - 1] = process.env.W3GW_PORT;
                execSync("yarn ".concat(cmdline.join(" "), " ").concat(process.argv.slice(3).join(" ")), { stdio: 'inherit' });
            }
            else {
                execSync("yarn ".concat(scripts[key].replace("$W3GW_PROVIDER_KEY", process.env.W3GW_PROVIDER_KEY), " ").concat(process.argv.slice(3).join(" ")), { stdio: 'inherit' });
            }
            process.exit(0);
        }
    }
}
console.info("Usage:");
console.info();
console.info("  ", "$ ".concat(process.argv[0], " ").concat(process.argv[1], " <ecosystem>:<network>"));
console.info();
console.info("Supported values:");
console.info();
for (var key in scripts) {
    if (key.indexOf(":") > -1) {
        console.info("  ", "  ", key);
    }
}
console.info();
console.info("The following environment variables must be previously set (or included within an .env file):");
console.info();
console.info("  ", "W3GW_SEED_PHRASE", "\t=>", "Secret phrase from which wallet addresses will be derived.");
console.info("  ", "W3GW_NUM_WALLETS", "\t=>", "Number of wallet addresses to derive from given seed phrase (default: 3).");
console.info();
console.info("To connect to some specific ETH/JSONRPC endpoint different from the default one, you can also set:");
console.info();
console.info("  ", "W3GW_PROVIDER_URL", "\t=>", "ETH/RPC endpoint where to connect to.");
console.info();
console.info("To run the local gateway on a port different from the default one, please set:");
console.info();
console.info("  ", "W3GW_PORT", "\t=>", "ETH/RPC endpoint where to connect to.");
console.info();
