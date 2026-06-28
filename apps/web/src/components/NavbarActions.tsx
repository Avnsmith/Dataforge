'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import Link from 'next/link';
import { Search, Plus, Wallet, LogOut } from 'lucide-react';

export default function NavbarActions() {
 const router = useRouter();
 const { walletAddress, isConnected, isConnecting, connectMockWallet, disconnectWallet } = useAuth();
 const [searchQuery, setSearchQuery] = useState('');

 const handleSearchSubmit = (e: React.FormEvent) => {
   e.preventDefault();
   if (searchQuery.trim()) {
     router.push(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
   }
 };

 const truncateAddress = (addr: string) => {
   return `${addr.substring(0, 6)}...${addr.substring(addr.length - 4)}`;
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
         onClick={connectMockWallet}
         disabled={isConnecting}
         className="flex items-center gap-2 h-9 px-4 rounded-md btn-gradient text-sm font-semibold text-white shadow-md hover:opacity-90 active:scale-95 transition-all disabled:opacity-50"
       >
         <Wallet className="h-4 w-4" />
         <span>{isConnecting ? 'Connecting...' : 'Connect Wallet'}</span>
       </button>
     )}
   </div>
 );
}