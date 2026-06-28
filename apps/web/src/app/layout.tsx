import type { Metadata } from 'next';
import './globals.css';
import { Providers } from '@/components/Providers';
import Link from 'next/link';
import NavbarActions from '@/components/NavbarActions';

export const metadata: Metadata = {
 title: 'DataForge AI | GitHub for AI Datasets',
 description: 'Upload, version, verify, fork, and reuse AI datasets on decentralized hot storage, powered by Shelby.',
};

export default function RootLayout({
 children,
}: {
 children: React.ReactNode;
}) {
 return (
   <html lang="en">
     <body className="min-h-screen bg-[#050811] text-slate-100 flex flex-col antialiased">
       <Providers>
         {/* Header Navbar */}
         <header className="sticky top-0 z-50 w-full border-b border-slate-800/80 bg-[#050811]/90 backdrop-blur-md">
           <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
             
             {/* Logo */}
             <div className="flex items-center gap-6">
               <Link href="/" className="flex items-center gap-2.5 group">
                 <div className="h-9 w-9 rounded-lg btn-gradient flex items-center justify-center shadow-[0_0_15px_rgba(124,58,237,0.3)]">
                   <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                     <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                   </svg>
                 </div>
                 <span className="font-bold text-lg tracking-tight bg-gradient-to-r from-violet-400 to-indigo-200 bg-clip-text text-transparent group-hover:opacity-90">
                   DataForge AI
                 </span>
               </Link>
               
               {/* Nav Links */}
               <nav className="hidden md:flex items-center gap-6">
                 <Link href="/" className="text-sm font-medium text-slate-300 hover:text-white transition-colors">
                   Explore
                 </Link>
                 <Link href="/search" className="text-sm font-medium text-slate-300 hover:text-white transition-colors">
                   Search
                 </Link>
               </nav>
             </div>

             {/* Actions & Search */}
             <div className="flex items-center gap-4 flex-1 md:flex-initial justify-end">
               <NavbarActions />
             </div>

           </div>
         </header>

         {/* Main Content */}
         <main className="flex-1 mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
           {children}
         </main>

         {/* Footer */}
         <footer className="border-t border-slate-900 bg-[#03050a] py-8 text-center text-xs text-slate-600">
           <div className="mx-auto max-w-7xl px-4">
             <p>DataForge AI © 2026 — Decenteralized Hot Datasets powered by Shelby Storage protocol.</p>
             <p className="mt-1 text-slate-700">Aptos Coordination Layer Integration</p>
           </div>
         </footer>
       </Providers>
     </body>
   </html>
 );
}