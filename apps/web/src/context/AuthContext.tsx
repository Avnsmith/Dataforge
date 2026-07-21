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
  connectMockWallet: () => Promise<void>;
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
  const { connected, isLoading, account, signMessage, connect, disconnect, wallets } = useWallet();
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
      // Trigger login only if wallet is connected, account is active, and no app user is loaded
      if (connected && account && !user && !isConnectingState) {
        setIsConnectingState(true);
        logDebug("[wallet] connected", Boolean(account?.address));
        try {
          const walletAddr = account.address.toString();
          const publicKeyStr = account.publicKey.toString();

          logDebug("[auth] nonce requested");
          // 2.1 Fetch fresh nonce from backend
          const nonceUrl = apiUrl('/auth/nonce');
          const nonceRes = await fetch(nonceUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ walletAddress: walletAddr }),
          });
          if (!nonceRes.ok) {
            throw new Error(`Failed to request login nonce: ${nonceRes.statusText}`);
          }
          const { nonce } = await nonceRes.json();

          if (!active) return;

          // 2.2 Request wallet signature
          const timestamp = Date.now();
          const messageStr = `DataForge Login\nNonce: ${nonce}\nTimestamp: ${timestamp}`;
          
          logDebug("[auth] verify started");
          const signResponse = await signMessage({
            message: messageStr,
            nonce: nonce,
          });

          if (!active) return;

          // 2.3 Verify signature on backend
          const verifyUrl = apiUrl('/auth/verify');
          const verifyRes = await fetch(verifyUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              walletAddress: walletAddr,
              publicKey: publicKeyStr,
              signature: signResponse.signature.toString(),
              message: signResponse.fullMessage || messageStr,
            }),
          });

          if (!verifyRes.ok) {
            const errText = await verifyRes.text();
            throw new Error(`Signature verification rejected: ${errText}`);
          }

          if (!active) return;
          const verifyData = await verifyRes.json();

          logDebug("[auth] session created");
          // 2.4 Save session state
          setWalletAddress(verifyData.user.walletAddress);
          setUser(verifyData.user);
          setToken(verifyData.token);

          sessionStorage.setItem('df_wallet_address', verifyData.user.walletAddress);
          sessionStorage.setItem('df_user', JSON.stringify(verifyData.user));
          sessionStorage.setItem('df_token', verifyData.token);
        } catch (err: any) {
          console.error('Wallet cryptographic login failed:', err);
          alert(`Cryptographic wallet login failed.\n\nError details:\n${err.message || err}`);
          // Reset wallet connection state on signature failure
          try {
            disconnect();
          } catch (_) {}
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
  }, [connected, account, user]);

  const connectMockWallet = async () => {
    setIsConnectingState(true);
    try {
      // Health check first
      const healthUrl = apiUrl('/health');
      await fetch(healthUrl);

      // Generate random mock wallet address
      const hexChars = '0123456789abcdef';
      let randomHex = '0x';
      for (let i = 0; i < 64; i++) {
        randomHex += hexChars[Math.floor(Math.random() * 16)];
      }

      // Legacy auth endpoint
      const walletUrl = apiUrl('/auth/wallet');
      const response = await fetch(walletUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletAddress: randomHex }),
      });

      if (!response.ok) {
        throw new Error('Mock authentication rejected.');
      }

      const data = await response.json();
      setWalletAddress(data.user.walletAddress);
      setUser(data.user);
      setToken(data.token);

      // Save to sessionStorage
      sessionStorage.setItem('df_wallet_address', data.user.walletAddress);
      sessionStorage.setItem('df_user', JSON.stringify(data.user));
      sessionStorage.setItem('df_token', data.token);
    } catch (error: any) {
      console.error('Mock wallet connection failed:', error);
      alert(`Could not connect mock wallet.\n\nError details:\n${error.message || error}`);
    } finally {
      setIsConnectingState(false);
    }
  };

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
        connectMockWallet,
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
