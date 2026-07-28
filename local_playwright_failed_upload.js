const { chromium } = require('playwright');

async function test() {
  console.log("Launching headless browser...");
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  // Log all console messages
  page.on('console', msg => console.log('BROWSER CONSOLE:', msg.text()));

  let uploadRequest = null;
  let uploadResponse = null;

  // Track the failed upload request
  page.on('request', request => {
    const url = request.url();
    if (url.includes('files/upload')) {
      uploadRequest = {
        url,
        method: request.method(),
        headers: request.headers(),
        payload: request.postData()
      };
    }
  });

  page.on('response', response => {
    const url = response.url();
    if (url.includes('files/upload')) {
      uploadResponse = {
        status: response.status(),
        statusText: response.statusText()
      };
      response.text().then(text => {
        uploadResponse.body = text;
      }).catch(() => {});
    }
  });

  console.log("Navigating to production site...");
  await page.goto('https://web-gamma-green-wd3aonhbdz.vercel.app', { waitUntil: 'networkidle' });

  console.log("1. Connecting Mock Wallet...");
  await page.locator('button:has-text("Connect Wallet")').click();
  await page.locator('button:has-text("Sandbox Mock Wallet")').click();
  await page.waitForTimeout(2000);

  console.log("2. Navigating to dataset creation page...");
  await page.locator('a[href="/new"]').first().click();
  await page.waitForTimeout(1000);

  const datasetName = `test-upload-fail-${Math.random().toString(36).substring(2, 8)}`;
  console.log(`3. Filling form for dataset: ${datasetName}...`);
  await page.locator('input[placeholder="e.g. My Dataset"]').fill(datasetName);
  await page.locator('input[placeholder="e.g. my-dataset"]').fill(datasetName);
  await page.locator('textarea[placeholder="Describe your dataset..."]').fill("Testing live upload error path using emulated sandbox wallet.");
  
  console.log("Submitting dataset form...");
  await page.locator('button:has-text("Create Dataset")').click();
  await page.waitForTimeout(3000);

  console.log("4. Creating draft version...");
  await page.locator('button:has-text("Create Version")').click();
  await page.waitForTimeout(1000);
  await page.locator('input[placeholder="e.g. 1.0.0"]').fill("1.0.0");
  await page.locator('textarea[placeholder="What changed in this version..."]').fill("Initial release");
  await page.locator('button:has-text("Publish Draft")').click();
  await page.waitForTimeout(3000);

  console.log("5. Uploading file to draft version...");
  // Set up file input
  const fileInput = await page.locator('input[type="file"]');
  
  // Set file payload directly using page.setInputFiles
  await fileInput.setInputFiles({
    name: 'test-fail-file.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('Testing live transaction verification failure!')
  });

  console.log("Waiting for upload request to complete...");
  await page.waitForTimeout(10000);

  console.log("=== CAPTURED UPLOAD TRAFFIC ===");
  console.log("Request:", JSON.stringify(uploadRequest, null, 2));
  console.log("Response Status:", uploadResponse ? uploadResponse.status : "No Response");
  console.log("Response Body:", uploadResponse ? uploadResponse.body : "No Response");

  await browser.close();
}

test().catch(console.error);
