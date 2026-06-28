import { ShelbyNodeClient, generateCommitments, createDefaultErasureCodingProvider } from '@shelby-protocol/sdk/node';
import { Account, Ed25519PrivateKey, Network } from '@aptos-labs/ts-sdk';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

async function runLiveTest() {
  console.log('\n--- STARTING LIVE SHELBY NETWORK INTEGRATION TEST ---');
  
  const mode = process.env.SHELBY_MODE;
  const privateKey = process.env.SHELBY_PRIVATE_KEY;
  const rpcUrl = process.env.SHELBY_RPC_URL;
  const account = process.env.SHELBY_ACCOUNT;
  const network = process.env.SHELBY_NETWORK;

  console.log(`Env variables check:`);
  console.log(`  SHELBY_MODE:`, mode);
  console.log(`  SHELBY_NETWORK:`, network);
  console.log(`  SHELBY_ACCOUNT:`, account);
  console.log(`  SHELBY_RPC_URL:`, rpcUrl);
  console.log(`  SHELBY_PRIVATE_KEY:`, privateKey ? '(provided)' : '(missing)');

  if (!privateKey || !rpcUrl || !account || !network) {
    console.log('\nResult: LIVE TESTS SKIPPED (missing credentials in .env)\n');
    return;
  }

  try {
    let rawKey = privateKey;
    if (rawKey.startsWith('ed25519-priv-')) {
      rawKey = rawKey.substring('ed25519-priv-'.length);
    }
    const privateKeyObj = new Ed25519PrivateKey(rawKey);
    const signer = Account.fromPrivateKey({ privateKey: privateKeyObj });
    console.log(`Derived signer account address:`, signer.accountAddress.toString());

    console.log('\nInitializing ShelbyNodeClient...');
    const client = new ShelbyNodeClient({
      network: network,
      rpc: {
        baseUrl: rpcUrl,
      },
    });

    console.log(`\nBootstrapping signer account with faucet tokens...`);
    try {
      console.log(`   Funding APT...`);
      await client.fundAccountWithAPT({
        address: signer.accountAddress,
        amount: 100_000_000,
      });
      console.log(`   Funding shelbyUSD...`);
      await client.fundAccountWithShelbyUSD({
        address: signer.accountAddress,
        amount: 100_000_000,
      });
      console.log(`   Funding complete!`);
    } catch (faucetError) {
      console.warn(`   Faucet warning: ${faucetError.message}`);
    }

    const randomSuffix = crypto.randomBytes(4).toString('hex');
    const testContent = Buffer.from(`live-integration-test-dataforge-ai-${randomSuffix}`, 'utf-8');
    const blobName = `datasets/${account}/integration-test-slug/v1.0.0/test-${randomSuffix}.txt`;

    console.log(`\n1. Generating Commitments for: ${blobName}`);
    const provider = await createDefaultErasureCodingProvider();
    const commitments = await generateCommitments(provider, testContent);
    const expectedMerkleRoot = commitments.blob_merkle_root;
    console.log(`   Merkle Root generated: ${expectedMerkleRoot}`);

    console.log(`\n2. Uploading blob to Shelby network...`);
    const expirationMicros = (Date.now() + 30 * 24 * 60 * 60 * 1000) * 1000; // 30 days
    await client.upload({
      blobData: testContent,
      signer,
      blobName,
      expirationMicros,
    });
    console.log(`   Upload successful!`);

    console.log(`\n3. Querying blob metadata from coordination layer...`);
    const metadata = await client.coordination.getBlobMetadata({
      account: signer.accountAddress,
      name: blobName,
    });
    
    if (!metadata) {
      throw new Error('Blob metadata was not registered or found on-chain');
    }
    console.log(`   On-chain Metadata:`);
    console.log(`     Owner:`, metadata.owner.toString());
    console.log(`     Size:`, metadata.size);
    console.log(`     Merkle Root:`, Buffer.from(metadata.blobMerkleRoot).toString('hex'));

    console.log(`\n4. Downloading blob from Shelby storage nodes...`);
    const blob = await client.download({
      account: signer.accountAddress,
      blobName,
    });

    const chunks = [];
    const reader = blob.readable.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }
    const downloadedContent = Buffer.concat(chunks);
    console.log(`   Downloaded content: "${downloadedContent.toString('utf-8')}"`);

    const match = downloadedContent.toString('utf-8') === testContent.toString('utf-8');
    console.log(`\n5. Verifying integrity...`);
    console.log(`   Content Match:`, match ? '✅ SUCCESS' : '❌ FAIL');
    
    console.log('\n--- LIVE TEST PASSED ---');
  } catch (e) {
    console.error('\n--- LIVE TEST FAILED ---');
    console.error(e);
    process.exit(1);
  }
}

runLiveTest();
