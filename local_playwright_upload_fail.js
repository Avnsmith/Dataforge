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

  page.on('requestfailed', request => {
    const url = request.url();
    if (url.includes('files/upload')) {
      console.log(`files/upload REQUEST FAILED: ${request.method()} ${url} - ${request.failure() ? request.failure().errorText : 'Unknown'}`);
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
  await page.waitForTimeout(2000);

  const datasetName = `test-fail-${Math.random().toString(36).substring(2, 8)}`;
  console.log(`3. Filling form for dataset: ${datasetName}...`);
  await page.locator('input[placeholder="e.g. crypto-twitter-labeled"]').fill(datasetName);
  await page.locator('textarea[placeholder="A brief tagline or summary of the dataset."]').fill("Testing live upload error path using emulated sandbox wallet.");
  
  console.log("Submitting dataset form...");
  await page.locator('button:has-text("Create Repository")').click();
  await page.waitForTimeout(5000);

  console.log("4. Clicking Upload / Manage tab...");
  await page.locator('button:has-text("Upload / Manage")').click();
  await page.waitForTimeout(2000);

  console.log("5. Creating draft version...");
  await page.locator('input[placeholder="e.g. 1.0.0"]').fill("1.0.0");
  await page.locator('textarea[placeholder="What changed in this version release?"]').fill("Initial release");
  await page.locator('button:has-text("Create Draft")').click();
  await page.waitForTimeout(5500);

  console.log("6. Selecting file for upload...");
  // Playwright requires file input locator
  const fileInput = page.locator('input[type="file"]');
  await fileInput.setInputFiles({
    name: 'test-fail-file.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('Testing live transaction verification failure!')
  });
  await page.waitForTimeout(2000);

  console.log("7. Clicking Upload Files button...");
  await page.locator('button:has-text("Upload Files")').click();
  console.log("Waiting 15 seconds to monitor response...");
  await page.waitForTimeout(15000);

  console.log("=== CAPTURED UPLOAD TRAFFIC ===");
  if (uploadRequest) {
    console.log("Request URL:", uploadRequest.url);
    console.log("Request Method:", uploadRequest.method);
    console.log("Request PayloadLength:", uploadRequest.payload ? uploadRequest.payload.length : 0);
    console.log("Response Status:", uploadResponse ? uploadResponse.status : "No Response");
    console.log("Response Body:", uploadResponse ? uploadResponse.body : "No Response");
  } else {
    console.log("No request captured for files/upload!");
  }

  await browser.close();
}

test().catch(console.error);
