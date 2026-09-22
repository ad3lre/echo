const readline = require('node:readline');
const input = readline.createInterface({ input: process.stdin });
input.on('line', () => process.stdout.write('not-a-valid-engine-response\n'));
