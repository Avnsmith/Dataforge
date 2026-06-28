'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { User } from '@dataforge/shared';

import { apiUrl } from '@/lib/api';

interface AuthContextType {
  walletAddress: string | null;
  user: User | null;
  token: string | null;
  isConnected: boolean;
  isConnecting: boolean;
  connectMockWallet: () => Promise<void>;
  disconnectWallet: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);

  // Load from localStorage on init
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
        // Clear corrupt storage
        localStorage.removeItem('df_wallet_address');
        localStorage.removeItem('df_user');
        localStorage.removeItem('df_token');
      }
    }
  }, []);

  const connectMockWallet = async () => {
    setIsConnecting(true);
    try {
      // 0. Pre-flight health check to verify backend reachability
      const healthUrl = apiUrl('/health');
      try {
        const healthRes = await fetch(healthUrl, { method: 'GET' });
        if (!healthRes.ok) {
          throw new Error(`Health check returned status: ${healthRes.status}`);
        }
      } catch (healthErr: any) {
        console.error('DataForge backend server is unreachable at:', healthUrl, healthErr);
        throw new Error(
          `DataForge API backend is unreachable at ${healthUrl}. Please ensure the NestJS server is running on port 4000.\n(Network error: ${healthErr.message})`
        );
      }

      // 1. Generate Aptos-style mock address: 0x + 64 random hex characters
      const hexChars = '0123456789abcdef';
      let randomHex = '0x';
      for (let i = 0; i < 64; i++) {
        randomHex += hexChars[Math.floor(Math.random() * 16)];
      }

      // 2. Register/Login on backend
      const walletUrl = apiUrl('/auth/wallet');
      let response: Response;
      try {
        response = await fetch(walletUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ walletAddress: randomHex }),
        });
      } catch (netErr: any) {
        console.error('Network failure connecting to wallet auth endpoint:', walletUrl, netErr);
        throw new Error(`Network failure connecting to ${walletUrl}. Error: ${netErr.message}`);
      }

      if (!response.ok) {
        let errBody = '';
        try {
          errBody = await response.text();
        } catch (_) {}
        console.error('Wallet connection auth failed:', {
          url: walletUrl,
          status: response.status,
          statusText: response.statusText,
          body: errBody,
        });
        throw new Error(
          `Auth endpoint rejected request.\nURL: ${walletUrl}\nStatus: ${response.status} ${response.statusText}\nResponse: ${errBody}`
        );
      }

      const data = await response.json();
      
      // 3. Save states
      setWalletAddress(data.user.walletAddress);
      setUser(data.user);
      setToken(data.token);
      localStorage.setItem('df_wallet_address', data.user.walletAddress);
      localStorage.setItem('df_user', JSON.stringify(data.user));
      localStorage.setItem('df_token', data.token);
    } catch (error: any) {
      console.error('Wallet connection failed:', error);
      alert(`Could not connect mock wallet.\n\nError details:\n${error.message || error}`);
    } finally {
      setIsConnecting(false);
    }
  };

  const disconnectWallet = () => {
    setWalletAddress(null);
    setUser(null);
    setToken(null);
    localStorage.removeItem('df_wallet_address');
    localStorage.removeItem('df_user');
    localStorage.removeItem('df_token');
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
        disconnectWallet,
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
