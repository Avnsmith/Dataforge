'use client';

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { Search, Database, Tags, Clock, ShieldCheck, ArrowRight } from 'lucide-react';

interface Dataset {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  type: string;
  tags: string[];
  license: string | null;
  createdAt: string;
  owner: {
    walletAddress: string;
    username: string | null;
  };
  versions?: {
    id: string;
    version: string;
    status: string;
  }[];
}

export default function ExplorePage() {
 const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';

 // Fetch trending datasets
 const { data: trending, isLoading: isLoadingTrending } = useQuery<Dataset[]>({
   queryKey: ['trending-datasets'],
   queryFn: async () => {
     const res = await fetch(`${apiBase}/datasets/trending`);
     if (!res.ok) throw new Error('Failed to fetch trending datasets');
     return res.json();
   },
 });

 // Fetch popular tags
 const { data: tags, isLoading: isLoadingTags } = useQuery<string[]>({
   queryKey: ['dataset-tags'],
   queryFn: async () => {
     const res = await fetch(`${apiBase}/datasets/tags`);
     if (!res.ok) throw new Error('Failed to fetch tags');
     return res.json();
   },
 });

 return (
   <div className="space-y-12">
     
     {/* Premium Hero Banner */}
     <section className="relative overflow-hidden rounded-2xl glass-accent py-16 px-8 sm:px-12 flex flex-col md:flex-row items-center justify-between gap-8">
       {/* Background Glowing Orb */}
       <div className="absolute top-0 right-0 -mt-16 -mr-16 h-64 w-64 rounded-full bg-violet-600/10 blur-3xl"></div>
       <div className="absolute bottom-0 left-0 -mb-16 -ml-16 h-64 w-64 rounded-full bg-cyan-600/10 blur-3xl"></div>
       
       <div className="max-w-2xl space-y-6 z-10">
         <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-violet-950/50 border border-violet-850/40 text-xs font-semibold text-violet-400">
           <span className="h-1.5 w-1.5 rounded-full bg-cyan-400"></span>
           Powered by Shelby Hot Storage
         </div>
         <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight leading-tight">
           AI datasets need <span className="text-gradient">provenance</span>, not just hosting.
         </h1>
         <p className="text-slate-400 text-base sm:text-lg leading-relaxed">
           DataForge AI turns datasets into verifiable repositories. Upload, version, verify, and fork machine-learning ready datasets with cryptographic Shelby integration.
         </p>
         <div className="flex flex-wrap gap-4">
           <Link
             href="/new"
             className="flex items-center gap-2 h-11 px-5 rounded-md btn-gradient text-sm font-semibold text-white shadow-lg hover:shadow-violet-600/20 active:scale-95 transition-all"
           >
             <span>Publish Dataset</span>
             <ArrowRight className="h-4 w-4" />
           </Link>
           <Link
             href="/search"
             className="flex items-center gap-2 h-11 px-5 rounded-md bg-slate-900 border border-slate-800 text-sm font-semibold text-slate-300 hover:bg-slate-800 hover:text-white transition-all"
           >
             <Search className="h-4 w-4" />
             <span>Search Registry</span>
           </Link>
         </div>
       </div>

       {/* Hero Visual Card */}
       <div className="hidden lg:block w-80 glass p-6 rounded-xl space-y-4 border-violet-900/10 shadow-2xl relative z-10">
         <div className="flex items-center justify-between">
           <span className="text-xs font-mono text-cyan-400">SHELBYNET METADATA</span>
           <ShieldCheck className="h-4 w-4 text-cyan-400" />
         </div>
         <div className="space-y-3 font-mono text-[11px] text-slate-400">
           <div>
             <span className="text-slate-600">blob_name: </span>
             <span className="text-slate-300">datasets/crypto-x/.../train.csv</span>
           </div>
           <div>
             <span className="text-slate-600">merkle_root: </span>
             <span className="text-slate-300">0x3f5c9e2b10ad82...7a8d</span>
           </div>
           <div>
             <span className="text-slate-600">storage_nodes: </span>
             <span className="text-slate-300">Active (Erasure Coded)</span>
           </div>
         </div>
         <div className="h-px bg-slate-800/80"></div>
         <div className="flex justify-between items-center text-xs">
           <span className="text-slate-400">Data Quality Score</span>
           <span className="font-bold text-violet-400">95%</span>
         </div>
       </div>
     </section>

     {/* Main Content Grid */}
     <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
       
       {/* Left Column: Popular Tags */}
       <aside className="space-y-6 lg:col-span-1">
         <div className="glass p-5 rounded-xl border-slate-800/50">
           <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-2 mb-4">
             <Tags className="h-4 w-4 text-violet-400" />
             Popular Tags
           </h3>
           {isLoadingTags ? (
             <div className="flex flex-wrap gap-2">
               {[...Array(5)].map((_, i) => (
                 <div key={i} className="h-6 w-16 bg-slate-900 rounded animate-pulse" />
               ))}
             </div>
           ) : tags && tags.length > 0 ? (
             <div className="flex flex-wrap gap-2">
               {tags.map((tag) => (
                 <Link
                   key={tag}
                   href={`/search?q=${encodeURIComponent(tag)}`}
                   className="text-xs bg-slate-900 hover:bg-slate-800 border border-slate-800/80 text-slate-400 hover:text-slate-200 px-2.5 py-1 rounded-full transition-all"
                 >
                   #{tag}
                 </Link>
               ))}
             </div>
           ) : (
             <p className="text-xs text-slate-500">No tags indexed yet.</p>
           )}
         </div>
       </aside>

       {/* Right Column: Datasets Listing */}
       <section className="space-y-6 lg:col-span-3">
         <div className="flex items-center justify-between border-b border-slate-800 pb-3">
           <h2 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
             <Database className="h-5 w-5 text-violet-400" />
             Trending Datasets
           </h2>
           <Link
             href="/search"
             className="text-xs font-semibold text-violet-400 hover:text-violet-300 transition-colors"
           >
             View all datasets
           </Link>
         </div>

         {isLoadingTrending ? (
           <div className="space-y-4">
             {[...Array(3)].map((_, i) => (
               <div key={i} className="h-32 w-full bg-slate-900/60 rounded-xl animate-pulse" />
             ))}
           </div>
         ) : trending && trending.length > 0 ? (
           <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {trending.map((dataset: any) => {
                const ownerLabel = dataset.owner.username || dataset.owner.walletAddress.substring(0, 10);
                const latestVersion = dataset.versions?.[0];
                const fileCount = latestVersion?.files?.length || latestVersion?.fileCount || 0;
                
                // Sum size
                const totalBytes = latestVersion?.totalSize || latestVersion?.files?.reduce((acc: number, f: any) => acc + Number(f.size), 0) || 0;
                const formatBytes = (bytes: number) => {
                  if (!bytes) return '0 B';
                  const k = 1024;
                  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
                  const i = Math.floor(Math.log(bytes) / Math.log(k));
                  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
                };

                return (
                  <Link
                    key={dataset.id}
                    href={`/${ownerLabel}/${dataset.slug}`}
                    className="group glass p-5 rounded-xl border-slate-800/40 hover:border-violet-500/30 hover:bg-slate-900/40 transition-all flex flex-col justify-between min-h-[13.5rem] shadow-lg hover:shadow-violet-950/10"
                  >
                    <div className="space-y-2">
                       <div className="flex items-center justify-between gap-2">
                         <span className="text-xs text-slate-500 font-mono">
                           {ownerLabel}
                         </span>
                         <div className="flex items-center gap-1.5">
                           {latestVersion?.status === 'ready' && (
                             <span className="text-[9px] text-emerald-400 font-bold bg-emerald-950/20 border border-emerald-900/30 px-1.5 py-0.5 rounded animate-pulse" title="Shelby Verified">
                               ✓ Verified
                             </span>
                           )}
                           <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-violet-950/40 text-violet-400 border border-violet-900/30">
                             {dataset.type}
                           </span>
                         </div>
                       </div>
                       <h3 className="font-bold text-slate-200 group-hover:text-violet-300 transition-colors text-base truncate">
                         {dataset.name}
                       </h3>
                       <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed">
                         {dataset.description || 'No description provided.'}
                       </p>
                    </div>

                    <div className="grid grid-cols-3 gap-2 py-2 my-2 border-y border-slate-900/60 text-[10px] text-slate-400">
                      <div>
                        <span className="text-slate-600 block uppercase font-semibold">Files</span>
                        <span className="text-slate-200 font-mono">{fileCount} files ({formatBytes(Number(totalBytes))})</span>
                      </div>
                      <div>
                        <span className="text-slate-600 block uppercase font-semibold">Quality</span>
                        <span className="text-violet-400 font-bold">{dataset.qualityScore || 0}%</span>
                      </div>
                      <div>
                        <span className="text-slate-600 block uppercase font-semibold">Forks</span>
                        <span className="text-slate-200 font-mono">{dataset.forksCount || 0}</span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3 text-[10px] text-slate-500">
                        <span className="font-mono">v{latestVersion?.version || '0.1.0'}</span>
                        <span>•</span>
                        <span>{dataset.license || 'Proprietary'}</span>
                      </div>
                      <div className="flex flex-wrap gap-1 max-w-[65%] overflow-hidden justify-end">
                        {dataset.tags.slice(0, 3).map((t: string) => (
                          <span key={t} className="text-[9px] bg-slate-900 px-2 py-0.5 rounded text-slate-400">
                            #{t}
                          </span>
                        ))}
                      </div>
                    </div>
                  </Link>
                );
              })}
           </div>
         ) : (
           <div className="glass p-12 text-center rounded-xl border-slate-800/40">
             <Database className="mx-auto h-10 w-10 text-slate-600 mb-3" />
             <h3 className="text-sm font-semibold text-slate-400">No public datasets</h3>
             <p className="text-xs text-slate-500 mt-1">Be the first to upload and index an AI dataset!</p>
             <Link
               href="/new"
               className="inline-flex items-center gap-1.5 h-9 px-4 rounded-md btn-gradient text-xs font-semibold text-white mt-4"
             >
               <Plus className="h-3.5 w-3.5" />
               <span>Upload Dataset</span>
             </Link>
           </div>
         )}
       </section>

     </div>

   </div>
 );
}

// Add simple Plus icon helper
function Plus(props: React.SVGProps<SVGSVGElement>) {
 return (
   <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5" {...props}>
     <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
   </svg>
 );
}