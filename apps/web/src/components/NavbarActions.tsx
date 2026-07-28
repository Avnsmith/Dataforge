'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import Link from 'next/link';
import { Search, Plus, Wallet, LogOut, X } from 'lucide-react';

export default function NavbarActions() {
  const router = useRouter();
  const { walletAddress, isConnected, isConnecting, connectRealWallet, disconnectWallet, wallets } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [showModal, setShowModal] = useState(false);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      router.push(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
    }
  };

  const truncateAddress = (addr: string) => {
    return `${addr.substring(0, 6)}...${addr.substring(addr.length - 4)}`;
  };

  const handleSelectWallet = async (walletName: string) => {
    setShowModal(false);
    await connectRealWallet(walletName);
  };

  return (
    <div className="flex items-center gap-4 w-full md:w-auto">
      {/* Search Input Bar */}
      <form onSubmit={handleSearchSubmit} className="relative hidden sm:block w-48 md:w-64">
        <input
          type="text"
          placeholder="Search datasets..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full h-9 rounded-md bg-slate-900 border border-slate-800 px-3 pl-9 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition-all"
        />
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
      </form>

      {/* New Dataset Button */}
      {isConnected && (
        <Link
          href="/new"
          className="flex items-center gap-1.5 h-9 px-3 rounded-md bg-slate-900 border border-slate-800 text-sm font-medium text-slate-200 hover:bg-slate-800 hover:border-slate-700 transition-all"
        >
          <Plus className="h-4 w-4" />
          <span>New</span>
        </Link>
      )}

      {/* Wallet Auth Button */}
      {isConnected ? (
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 h-9 px-3.5 rounded-md bg-slate-900/60 border border-violet-900/30 text-xs font-semibold text-violet-300">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
            {truncateAddress(walletAddress!)}
          </div>
          <button
            onClick={disconnectWallet}
            title="Disconnect Wallet"
            className="flex items-center justify-center h-9 w-9 rounded-md border border-slate-800 text-slate-400 hover:text-rose-400 hover:bg-slate-900 transition-all"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <button
          onClick={() => setShowModal(true)}
          disabled={isConnecting}
          className="flex items-center gap-2 h-9 px-4 rounded-md btn-gradient text-sm font-semibold text-white shadow-md hover:opacity-90 active:scale-95 transition-all disabled:opacity-50"
        >
          <Wallet className="h-4 w-4" />
          <span>{isConnecting ? 'Connecting...' : 'Connect Wallet'}</span>
        </button>
      )}

      {/* Sleek Connect Wallet Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="relative w-full max-w-sm rounded-xl border border-slate-800 bg-[#0b0f19] p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <button
              onClick={() => setShowModal(false)}
              className="absolute right-4 top-4 text-slate-400 hover:text-slate-200 transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
            <h3 className="text-lg font-bold text-slate-100 mb-4 flex items-center gap-2">
              <Wallet className="h-5 w-5 text-violet-400" />
              Connect Wallet
            </h3>
            <p className="text-xs text-slate-400 mb-6">
              Choose a connection method below. For production staging testing, use Petra Wallet.
            </p>
            <div className="flex flex-col gap-3">
              {/* Petra Wallet or other Aptos Wallets */}
              {wallets.map((w: any) => (
                <button
                  key={w.name}
                  onClick={() => handleSelectWallet(w.name)}
                  className="flex items-center justify-between w-full h-12 px-4 rounded-lg bg-slate-900 border border-slate-800 text-sm font-semibold text-slate-200 hover:bg-slate-800 hover:border-violet-600/50 transition-all"
                >
                  <div className="flex items-center gap-3">
                    {w.icon && <img src={w.icon} alt={w.name} className="h-6 w-6 rounded" />}
                    <span>{w.name}</span>
                  </div>
                  <span className="text-[10px] uppercase font-bold text-violet-400 bg-violet-950/40 px-2 py-0.5 rounded border border-violet-900/30">
                    Real Aptos
                  </span>
                </button>
              ))}

              {/* If no real wallet adapter detected, fallback button for Petra */}
              {!wallets.some((w: any) => w.name.toLowerCase().includes('petra')) && (
                <button
                  onClick={() => handleSelectWallet('Petra')}
                  className="flex items-center justify-between w-full h-12 px-4 rounded-lg bg-slate-900 border border-slate-800 text-sm font-semibold text-slate-200 hover:bg-slate-800 hover:border-violet-600/50 transition-all"
                >
                  <div className="flex items-center gap-3">
                    <div className="h-6 w-6 bg-violet-600 rounded flex items-center justify-center text-xs text-white font-bold">P</div>
                    <span>Petra Wallet</span>
                  </div>
                  <span className="text-[10px] uppercase font-bold text-violet-400 bg-violet-950/40 px-2 py-0.5 rounded border border-violet-900/30">
                    Petra
                  </span>
                </button>
              )}


            </div>
          </div>
        </div>
      )}
    </div>
  );
}