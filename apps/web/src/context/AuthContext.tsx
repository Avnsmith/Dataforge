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

  // Computed connecting state: combines local API auth flow state with adapter connecting state
  const isConnecting = isConnectingState || isLoading;

  // 1. Restore legacy mock session from localStorage on init
  useEffect(() => {
    const savedAddress = localStorage.getItem('df_wallet_address');
    const savedUser = localStorage.getItem('df_user');
    const savedToken = localStorage.getItem('df_token');
    
    if (savedAddress && savedUser && savedToken) {
      setWalletAddress(savedAddress);
      setToken(savedToken);
      try {
        setUser(JSON.parse(savedUser));
      } catch (e) {
        localStorage.removeItem('df_wallet_address');
        localStorage.removeItem('df_user');
        localStorage.removeItem('df_token');
      }
    }
  }, []);

  // 2. Restore secure real wallet session from HttpOnly cookie on page load
  useEffect(() => {
    const restoreCookieSession = async () => {
      if (connected && account && !user) {
        try {
          const sessionUrl = apiUrl('/auth/session');
          const response = await fetch(sessionUrl, {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
            },
          });
          if (response.ok) {
            const data = await response.json();
            setWalletAddress(account.address.toString());
            setUser(data.user);
            if (data.token) {
              setToken(data.token);
            }
          }
        } catch (err) {
          console.warn('Session restore via HttpOnly cookie failed:', err);
        }
      }
    };
    restoreCookieSession();
  }, [connected, account, user]);

  // 3. Cryptographic wallet signing handler once wallet is connected
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
          // 3.1 Fetch fresh nonce from backend
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

          // 3.2 Request wallet signature
          const timestamp = Date.now();
          const messageStr = `DataForge Login\nNonce: ${nonce}\nTimestamp: ${timestamp}`;
          
          logDebug("[auth] verify started");
          const signResponse = await signMessage({
            message: messageStr,
            nonce: nonce,
          });

          if (!active) return;

          // 3.3 Verify signature on backend
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
          // 3.4 Save session state
          setWalletAddress(verifyData.user.walletAddress);
          setUser(verifyData.user);
          setToken(verifyData.token);
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

      // Save to localStorage (only allowed in mock mode)
      localStorage.setItem('df_wallet_address', data.user.walletAddress);
      localStorage.setItem('df_user', JSON.stringify(data.user));
      localStorage.setItem('df_token', data.token);
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
    
    // Clear mock localStorage
    localStorage.removeItem('df_wallet_address');
    localStorage.removeItem('df_user');
    localStorage.removeItem('df_token');

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
