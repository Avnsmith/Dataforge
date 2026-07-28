const { chromium } = require('playwright');
const fs = require('fs');
const { Aptos, AptosConfig, Account, Ed25519PrivateKey } = require('@aptos-labs/ts-sdk');

const WALLET_ADDRESS = '0x73b074ca899d91953f5b76eb636ad67bb4507869e5a151c1154ac6bbdd1f17d4';
const PRIVATE_KEY_HEX = '0x77b1d86b889304d651703bd10a89c03548d27f96e88dc0c6ddf36beb9c79b5f4';

async function test() {
  const filePath = '/tmp/petra-verify-file.txt';
  fs.writeFileSync(filePath, 'Petra E2E real on-chain upload verification!');
  console.log(`Created temp file at ${filePath}`);

  const aptos = new Aptos(new AptosConfig({ network: 'custom', fullnode: 'https://api.shelbynet.shelby.xyz/v1' }));
  const privateKey = new Ed25519PrivateKey(PRIVATE_KEY_HEX);
  const signer = Account.fromPrivateKey({ privateKey });

  console.log("Launching headless browser...");
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  // Expose the real on-chain signer to the browser context
  await page.exposeFunction('signOnChain', async (txData) => {
    console.log("Injected signOnChain triggered inside Playwright Node process...");
    try {
      const convertedArgs = [...txData.payload?.arguments || txData.functionArguments || []];
      // Convert merkle root hex string to Uint8Array if needed
      if (typeof convertedArgs[2] === 'string' && convertedArgs[2].startsWith('0x')) {
        convertedArgs[2] = new Uint8Array(convertedArgs[2].replace(/^0x/i, '').match(/.{1,2}/g).map(b => parseInt(b, 16)));
      }

      const fileTxBuild = await aptos.transaction.build.simple({
        sender: signer.accountAddress,
        data: {
          function: txData.payload?.function || txData.function,
          typeArguments: txData.payload?.type_arguments || txData.typeArguments || [],
          functionArguments: convertedArgs
        }
      });
      const fileSig = aptos.transaction.sign({ signer, transaction: fileTxBuild });
      const pendingFileTx = await aptos.transaction.submit.simple({ transaction: fileTxBuild, senderAuthenticator: fileSig });
      await aptos.waitForTransaction({ transactionHash: pendingFileTx.hash });
      console.log(`Successfully signed & submitted on-chain: ${pendingFileTx.hash}`);
      return pendingFileTx.hash;
    } catch (e) {
      console.error("Sign on-chain failed:", e);
      throw e;
    }
  });

  await page.exposeFunction('signMessageOnChain', async (message) => {
    console.log("Injected signMessageOnChain triggered inside Playwright Node process...");
    try {
      const messageBytes = new TextEncoder().encode(message);
      const signature = signer.sign(messageBytes).toString();
      console.log(`Generated signature: ${signature}`);
      return signature;
    } catch (e) {
      console.error("Sign message failed:", e);
      throw e;
    }
  });

  // Inject Petra wallet object before navigation
  await page.addInitScript(() => {
    window.aptos = {
      connect: async () => ({
        address: "0x73b074ca899d91953f5b76eb636ad67bb4507869e5a151c1154ac6bbdd1f17d4",
        publicKey: "0xd7f33218589daa3da44b285bfff7528584d4d9daaf83699ae88db16999d91b45",
        status: 200
      }),
      disconnect: async () => {},
      isConnected: async () => true,
      account: async () => ({
        address: "0x73b074ca899d91953f5b76eb636ad67bb4507869e5a151c1154ac6bbdd1f17d4",
        publicKey: "0xd7f33218589daa3da44b285bfff7528584d4d9daaf83699ae88db16999d91b45"
      }),
      signAndSubmitTransaction: async (txData) => {
        console.log("window.aptos.signAndSubmitTransaction called in browser context!");
        // Extract inner payload from transaction data if wrapped by adapter
        const payload = txData.data || txData;
        const hash = await window.signOnChain(payload);
        return { hash };
      },
      signMessage: async (data) => {
        console.log("window.aptos.signMessage called in browser context!");
        const signature = await window.signMessageOnChain(data.message);
        return {
          signature,
          fullMessage: data.message
        };
      },
      network: async () => ({ name: "custom", url: "https://api.shelbynet.shelby.xyz/v1" })
    };
    window.dispatchEvent(new CustomEvent('aptos#initialized'));
  });

  let uploadRequest = null;
  let uploadResponse = null;

  page.on('request', request => {
    if (request.url().includes('files/upload')) {
      uploadRequest = {
        url: request.url(),
        method: request.method(),
        headers: request.headers(),
        payload: request.postData()
      };
    }
  });

  page.on('response', response => {
    if (response.url().includes('files/upload')) {
      response.text().then(text => {
        uploadResponse = {
          status: response.status(),
          body: text
        };
      }).catch(() => {});
    }
  });

  page.on('console', msg => console.log('BROWSER CONSOLE:', msg.text()));

  console.log("Navigating to production site...");
  await page.goto('https://web-gamma-green-wd3aonhbdz.vercel.app', { waitUntil: 'networkidle' });

  console.log("1. Connecting Injected Petra Wallet...");
  // Open wallet connect modal and click Petra
  await page.locator('button:has-text("Connect Wallet")').click();
  await page.waitForTimeout(1000);
  await page.locator('button:has-text("Petra Wallet")').click();
  await page.waitForTimeout(3000);

  console.log("2. Navigating to dataset creation page...");
  await page.locator('a[href="/new"]').first().click();
  await page.waitForTimeout(2000);

  const datasetName = `test-petra-${Math.random().toString(36).substring(2, 8)}`;
  console.log(`3. Filling form for dataset: ${datasetName}...`);
  await page.locator('input[placeholder="e.g. crypto-twitter-labeled"]').fill(datasetName);
  await page.locator('textarea[placeholder="A brief tagline or summary of the dataset."]').fill("Petra E2E validation upload.");
  
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
  const fileInput = page.locator('input[type="file"]').first();
  await fileInput.setInputFiles(filePath);
  await page.waitForTimeout(2000);

  console.log("7. Clicking Send button to trigger real on-chain signature...");
  const sendButton = page.locator('button:has-text("Send Selected Files to Backend"), button:has-text("Upload Files")').first();
  await sendButton.click();
  
  console.log("Waiting for E2E upload flow to complete...");
  await page.waitForTimeout(15000);

  console.log("=== VERIFYING PETRA UPLOAD DATA ===");
  if (uploadRequest) {
    console.log("POST /files/upload Request URL:", uploadRequest.url);
    console.log("POST /files/upload Request Headers:", JSON.stringify(uploadRequest.headers, null, 2));
    
    // Extract transaction hash from multipart form body
    const txHashMatch = uploadRequest.payload.match(/transactionHash\r\n\r\n(0x[a-f0-9]+)/i);
    const txHash = txHashMatch ? txHashMatch[1] : null;
    console.log("Captured Transaction Hash:", txHash);
    console.log("Is 64-hex format (plus 0x prefix)?", txHash && txHash.length === 66 && /^0x[a-f0-9]{64}$/i.test(txHash));
  } else {
    console.log("No request captured for files/upload!");
  }

  if (uploadResponse) {
    console.log("POST /files/upload Response Status:", uploadResponse.status);
    console.log("POST /files/upload Response Body:", uploadResponse.body);
  }

  // --- PART 2: Disconnect and test immediate abort error ---
  console.log("=== PART 2: Disconnecting Wallet & Retrying Upload ===");
  
  // Reload the page to clear states
  await page.goto(`https://web-gamma-green-wd3aonhbdz.vercel.app/user_73b074/${datasetName}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  // Clear window.aptos to simulate disconnected adapter state
  await page.evaluate(() => {
    window.aptos = null;
  });

  console.log("Clicking Upload / Manage tab...");
  await page.locator('button:has-text("Upload / Manage")').click();
  await page.waitForTimeout(2000);

  console.log("Selecting file for upload...");
  const fileInput2 = page.locator('input[type="file"]').first();
  await fileInput2.setInputFiles(filePath);
  await page.waitForTimeout(2000);

  // Intercept the browser alert
  page.once('dialog', async dialog => {
    console.log(`CAPTURED DIALOG MESSAGE: "${dialog.message()}"`);
    await dialog.dismiss();
  });

  console.log("Clicking Send button...");
  let uploadTriggeredAfterDisconnect = false;
  page.on('request', request => {
    if (request.url().includes('files/upload')) {
      uploadTriggeredAfterDisconnect = true;
    }
  });

  const sendButton2 = page.locator('button:has-text("Send Selected Files to Backend"), button:has-text("Upload Files")').first();
  await sendButton2.click();
  await page.waitForTimeout(5000);

  console.log("Did request reach backend after disconnect?", uploadTriggeredAfterDisconnect);

  await browser.close();
  try { fs.unlinkSync(filePath); } catch (e) {}
}

test().catch(console.error);
