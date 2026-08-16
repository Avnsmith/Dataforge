const { Account, Ed25519PrivateKey } = require('@aptos-labs/ts-sdk');

async function login() {
  const apiBase = process.argv[2] || 'http://localhost:4000/api';
  
  // 1. Generate new random keypair
  const privateKey = Ed25519PrivateKey.generate();
  const signer = Account.fromPrivateKey({ privateKey });
  const walletAddress = signer.accountAddress.toString();
  const publicKey = signer.publicKey.toString();

  // 2. Fetch Nonce
  const nonceRes = await fetch(`${apiBase}/auth/nonce`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ walletAddress })
  });
  if (!nonceRes.ok) {
    throw new Error(`Failed to fetch nonce: ${nonceRes.statusText}`);
  }
  const { nonce } = await nonceRes.json();

  // 3. Sign challenge message
  const timestamp = Date.now();
  const message = `DataForge Login\nNonce: ${nonce}\nTimestamp: ${timestamp}`;
  const messageBytes = new TextEncoder().encode(message);
  const signature = signer.sign(messageBytes).toString();

  // 4. Verify signature to get JWT token
  const verifyRes = await fetch(`${apiBase}/auth/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      walletAddress,
      publicKey,
      signature,
      message
    })
  });
  if (!verifyRes.ok) {
    throw new Error(`Verification failed: ${verifyRes.statusText}`);
  }
  const { token } = await verifyRes.json();
  console.log(token);
}

login().catch(err => {
  console.error(err.message);
  process.exit(1);
});
