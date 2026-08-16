const fs = require('fs');
const path = require('path');

const CHECK_DIRS = [
  path.resolve(__dirname, '../apps/api/src'),
  path.resolve(__dirname, '../apps/web/src'),
  path.resolve(__dirname, '../packages/shelby/src')
];

const FORBIDDEN_PATTERNS = [
  /Network\.TESTNET/i,
  /api\.testnet\.aptoslabs\.com/i,
  /aptoslabs\.com\/v1/i,
  /\btestnet\b/i
];

// List of allowed occurrences (e.g. comments or logs that specifically compare or discuss migration, if any)
const ALLOWED_EXCEPTIONS = [
  // Add file specific lines if necessary, e.g. "We migrated from testnet to shelbynet"
];

let failed = false;

function scanDir(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      scanDir(fullPath);
    } else if (stat.isFile() && /\.(ts|tsx|js|jsx)$/.test(file)) {
      if (file.endsWith('.spec.ts')) continue; // Skip test files
      const content = fs.readFileSync(fullPath, 'utf8');
      const lines = content.split('\n');
      lines.forEach((line, idx) => {
        for (const pattern of FORBIDDEN_PATTERNS) {
          if (pattern.test(line)) {
            // Check if it's an allowed exception
            const isException = ALLOWED_EXCEPTIONS.some(exc => fullPath.includes(exc.file) && line.includes(exc.text));
            if (!isException) {
              console.error(`ERROR: Forbidden pattern ${pattern} found in ${fullPath}:${idx + 1}`);
              console.error(`  Line: ${line.trim()}`);
              failed = true;
            }
          }
        }
      });
    }
  }
}

console.log('Running static check for Aptos Testnet configurations...');
CHECK_DIRS.forEach(dir => {
  if (fs.existsSync(dir)) {
    scanDir(dir);
  }
});

if (failed) {
  console.error('\nStatic check failed! Found active Testnet configurations.');
  process.exit(1);
} else {
  console.log('\nStatic check passed! Shelbynet consistency verified.');
  process.exit(0);
}
