'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { User } from '@dataforge/shared';
import { useWallet } from '@aptos-labs/wallet-adapter-react';
import { apiUrl } from '@/lib/api';

interface AuthContextType {
  walletAddress: string | null;
  user: User | null;
  token: string | null;
  isConnected: boolean;
  isConnecting: boolean;
  isRestoring: boolean;
  connectRealWallet: (walletName: any) => Promise<void>;
  disconnectWallet: () => void;
  wallets: readonly any[];
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const logDebug = (...args: any[]) => {
  if (process.env.NEXT_PUBLIC_DEBUG_WALLET === 'true') {
    console.info(...args);
  }
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { connected: adapterConnected, isLoading, account: adapterAccount, signMessage: adapterSignMessage, connect, disconnect, wallets, wallet, network, signAndSubmitTransaction } = useWallet();

  // Mock override for testing real login flow execution in headless browser
  const isMockMode = typeof window !== 'undefined' && window.location.search.includes('mock_wallet=true');
  const connected = isMockMode ? true : adapterConnected;
  
  const account = isMockMode ? {
    address: { toString: () => "0x73b074ca899d91953f5b76eb636ad67bb4507869e5a151c1154ac6bbdd1f17d4" },
    publicKey: { toString: () => "0xd7f33218589daa3da44b285bfff7528584d4d9daaf83699ae88db16999d91b45" }
  } as any : adapterAccount;

  const signMessage = isMockMode ? (async (data: any) => {
    console.log("Mock signMessage triggered in AuthContext override...");
    // Call the node exposed cryptographic function to sign using the real private key
    const sig = await (window as any).signMessageOnChain(data.message);
    return {
      signature: sig,
      fullMessage: data.message
    };
  }) as any : adapterSignMessage;
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isConnectingState, setIsConnectingState] = useState(false);
  const [isRestoring, setIsRestoring] = useState(true);

  // Computed connecting state: combines local API auth flow state with adapter connecting state
  const isConnecting = isConnectingState || isLoading;

  // 1. Restore session from sessionStorage on page load
  useEffect(() => {
    const restoreSession = () => {
      try {
        const savedAddress = sessionStorage.getItem('df_wallet_address');
        const savedUser = sessionStorage.getItem('df_user');
        const savedToken = sessionStorage.getItem('df_token');
        
        if (savedAddress && savedUser && savedToken) {
          setWalletAddress(savedAddress);
          setToken(savedToken);
          setUser(JSON.parse(savedUser));
        }
      } catch (e) {
        console.error('Failed to restore session from sessionStorage:', e);
        sessionStorage.removeItem('df_wallet_address');
        sessionStorage.removeItem('df_user');
        sessionStorage.removeItem('df_token');
      } finally {
        setIsRestoring(false);
      }
    };
    restoreSession();
  }, []);

  // 2. Cryptographic wallet signing handler once wallet is connected
  useEffect(() => {
    let active = true;
    const handleRealWalletLogin = async () => {
      console.log("[E2E LOGIN TRACE] Entry Parameters:", {
        connected,
        account,
        wallet,
        walletName: wallet?.name,
        network,
        publicKey: account?.publicKey?.toString(),
        signMessage,
        typeofSignMessage: typeof signMessage,
        signAndSubmitTransaction,
        typeofSignAndSubmitTransaction: typeof signAndSubmitTransaction,
        user,
        isConnectingState
      });

      if (connected && account && signMessage && !user && !isConnectingState) {
        setIsConnectingState(true);
        const walletAddr = account.address.toString();
        const publicKeyStr = account.publicKey.toString();

        console.log("[E2E LOGIN TRACE] Petra Details:", {
          connected,
          accountAddress: walletAddr,
          publicKey: publicKeyStr,
          signMessageExists: !!signMessage,
        });

        try {
          // 2.1 Fetch fresh nonce from backend
          const nonceUrl = apiUrl('/auth/nonce');
          const noncePayload = JSON.stringify({ walletAddress: walletAddr });
          const nonceHeaders = { 'Content-Type': 'application/json' };
          
          console.log("[E2E LOGIN TRACE] STEP 1: Request Nonce", {
            url: nonceUrl,
            method: 'POST',
            headers: nonceHeaders,
            body: noncePayload
          });

          const nonceRes = await fetch(nonceUrl, {
            method: 'POST',
            headers: nonceHeaders,
            body: noncePayload,
          });

          // Read response details
          const responseHeadersObj: Record<string, string> = {};
          nonceRes.headers.forEach((value, name) => {
            responseHeadersObj[name] = value;
          });

          console.log("[E2E LOGIN TRACE] STEP 1: Response Status", {
            status: nonceRes.status,
            ok: nonceRes.ok,
            headers: responseHeadersObj
          });

          if (!nonceRes.ok) {
            const errBody = await nonceRes.text();
            console.error("[E2E LOGIN TRACE] Nonce Request Failed Body:", errBody);
            throw new Error(`Failed to request login nonce: Status ${nonceRes.status} | Text: ${nonceRes.statusText} | Body: ${errBody}`);
          }

          const nonceData = await nonceRes.json();
          const { nonce } = nonceData;
          console.log("[E2E LOGIN TRACE] STEP 1: Response Body", nonceData);

          if (!active) return;

          // 2.2 Request wallet signature
          const timestamp = Date.now();
          const messageStr = `DataForge Login\nNonce: ${nonce}\nTimestamp: ${timestamp}`;
          
          console.log("SIGNMESSAGE CHECK")
          console.log({
              connected,
              account,
              wallet,
              walletName: wallet?.name,
              signMessage,
              typeofSignMessage: typeof signMessage,
              signAndSubmitTransaction,
              typeofSubmit: typeof signAndSubmitTransaction,
          })

          console.log("ENTER signMessage")
          let signResponse;
          try {
            signResponse = await signMessage({
              message: messageStr,
              nonce: nonce,
            });
          } catch(e: any) {
            console.error(e);
            if (e?.stack) console.error(e.stack);
            if (e?.name) console.error(e.name);
            if (e?.message) console.error(e.message);
            if (e?.cause) console.error(e.cause);
            throw e;
          }
          console.log("EXIT signMessage")
          console.log("Returned signature:", signResponse?.signature?.toString())

          if (!active) return;

          // 2.3 Verify signature on backend
          const verifyUrl = apiUrl('/auth/verify');
          const verifyPayload = JSON.stringify({
            walletAddress: walletAddr,
            publicKey: publicKeyStr,
            signature: signResponse.signature.toString(),
            message: signResponse.fullMessage || messageStr,
          });
          const verifyHeaders = { 'Content-Type': 'application/json' };

          console.log("[E2E LOGIN TRACE] STEP 3: POST Login Verify", {
            url: verifyUrl,
            method: 'POST',
            headers: verifyHeaders,
            body: verifyPayload
          });

          const verifyRes = await fetch(verifyUrl, {
            method: 'POST',
            headers: verifyHeaders,
            body: verifyPayload,
          });

          const verifyHeadersObj: Record<string, string> = {};
          verifyRes.headers.forEach((value, name) => {
            verifyHeadersObj[name] = value;
          });

          console.log("[E2E LOGIN TRACE] STEP 3: Response Status", {
            status: verifyRes.status,
            ok: verifyRes.ok,
            headers: verifyHeadersObj
          });

          if (!verifyRes.ok) {
            const errText = await verifyRes.text();
            console.error("[E2E LOGIN TRACE] Verification Failed Body:", errText);
            throw new Error(`Signature verification rejected: Status ${verifyRes.status} | Text: ${verifyRes.statusText} | Body: ${errText}`);
          }

          if (!active) return;
          const verifyData = await verifyRes.json();
          console.log("[E2E LOGIN TRACE] STEP 3: Response Body", verifyData);

          console.log("[E2E LOGIN TRACE] STEP 4: Saving session state", {
            walletAddress: verifyData.user.walletAddress,
            user: verifyData.user,
            tokenExists: !!verifyData.token
          });

          // 2.4 Save session state
          setWalletAddress(verifyData.user.walletAddress);
          setUser(verifyData.user);
          setToken(verifyData.token);

          sessionStorage.setItem('df_wallet_address', verifyData.user.walletAddress);
          sessionStorage.setItem('df_user', JSON.stringify(verifyData.user));
          sessionStorage.setItem('df_token', verifyData.token);

          console.log("[E2E LOGIN TRACE] STEP 5: Redirecting/Updated React state completed.");
        } catch (err: any) {
          console.error('[E2E LOGIN TRACE] Wallet cryptographic login failed catch block:');
          console.error(err);
          if (err?.stack) {
            console.error(err.stack);
          }
          if (err instanceof Response) {
            try {
              console.error("HTTP Response content:", await err.text());
            } catch (_) {}
          }
          alert(`Cryptographic wallet login failed.\n\nError details:\n${err.message || err}`);
          // Reset wallet connection state on signature failure
          try {
            disconnect();
          } catch (_) {}
          throw err;
        } finally {
          if (active) {
            setIsConnectingState(false);
          }
        }
      }
    };


    handleRealWalletLogin();

    return () => {
      active = false;
    };
  }, [connected, account, user, signMessage]);



  const connectRealWallet = async (walletName: any) => {
    setIsConnectingState(true);
    try {
      logDebug("[wallet] selected", walletName);
      logDebug("[wallet] connect started");

      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Wallet connection timed out. Please unlock Petra and try again.")), 15000)
      );

      await Promise.race([
        connect(walletName),
        timeoutPromise
      ]);
    } catch (error: any) {
      console.error('Failed to connect real wallet:', error);
      alert(`Could not connect wallet. Error: ${error.message || error}`);
    } finally {
      setIsConnectingState(false);
    }
  };

  const disconnectWallet = async () => {
    setWalletAddress(null);
    setUser(null);
    setToken(null);
    
    // Clear sessionStorage
    sessionStorage.removeItem('df_wallet_address');
    sessionStorage.removeItem('df_user');
    sessionStorage.removeItem('df_token');

    try {
      disconnect();
    } catch (_) {}
  };

  return (
    <AuthContext.Provider
      value={{
        walletAddress,
        user,
        token,
        isConnected: !!walletAddress,
        isConnecting,
        isRestoring,
        connectRealWallet,
        disconnectWallet,
        wallets: wallets || [],
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
