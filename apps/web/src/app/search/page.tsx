'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { Search, Database, Clock, ShieldAlert, Sparkles } from 'lucide-react';

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

interface SearchResult {
 dataset: Dataset;
 relevanceScore: number;
}

export default function SearchPage() {
 return (
   <Suspense fallback={<div className="text-center py-12 text-slate-400 text-sm">Initializing search engine...</div>}>
     <SearchContent />
   </Suspense>
 );
}

function SearchContent() {
 const searchParams = useSearchParams();
 const router = useRouter();
 const queryParam = searchParams.get('q') || '';

 const [inputVal, setInputVal] = useState(queryParam);
 const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';

 // Keep input in sync with URL changes
 useEffect(() => {
   setInputVal(queryParam);
 }, [queryParam]);

 // Query search endpoint
 const { data, isLoading, error, refetch } = useQuery<{ results: SearchResult[] }>({
   queryKey: ['search-datasets', queryParam],
   queryFn: async () => {
     const res = await fetch(`${apiBase}/search?q=${encodeURIComponent(queryParam)}`);
     if (!res.ok) throw new Error('Search request failed');
     return res.json();
   },
 });

 const handleSearchSubmit = (e: React.FormEvent) => {
   e.preventDefault();
   router.push(`/search?q=${encodeURIComponent(inputVal.trim())}`);
 };

 return (
   <div className="max-w-4xl mx-auto space-y-8">
     
     {/* Search Header Form */}
     <div className="space-y-4">
       <h1 className="text-2xl font-bold text-white tracking-tight">
         Search Dataset Registry
       </h1>
       <form onSubmit={handleSearchSubmit} className="flex gap-2">
         <div className="relative flex-1">
           <input
             type="text"
             placeholder="Search by keywords, tags, files, column headers..."
             value={inputVal}
             onChange={(e) => setInputVal(e.target.value)}
             className="w-full h-11 rounded-lg bg-slate-900 border border-slate-800 px-4 pl-11 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition-all"
           />
           <Search className="absolute left-4 top-3.5 h-4.5 w-4.5 text-slate-500" />
         </div>
         <button
           type="submit"
           className="h-11 px-5 rounded-lg btn-gradient text-sm font-semibold text-white shadow-md transition-all active:scale-95"
         >
           Search
         </button>
       </form>
     </div>

     <div className="h-px bg-slate-900"></div>

     {/* Results grid */}
     <div className="space-y-4">
       <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">
         {isLoading ? 'Searching...' : `Registry Results (${data?.results?.length || 0})`}
       </h2>

       {isLoading ? (
         <div className="space-y-4">
           {[...Array(3)].map((_, i) => (
             <div key={i} className="h-28 w-full bg-slate-900/60 rounded-xl animate-pulse" />
           ))}
         </div>
       ) : error ? (
         <div className="p-6 rounded-xl border border-rose-900/40 bg-rose-950/20 text-center space-y-2">
           <ShieldAlert className="h-8 w-8 text-rose-400 mx-auto" />
           <h3 className="text-sm font-semibold text-rose-300">Search Failed</h3>
           <p className="text-xs text-slate-500">Could not retrieve registry indices from database.</p>
         </div>
       ) : data?.results && data.results.length > 0 ? (
         <div className="space-y-4">
            {data.results.map(({ dataset, relevanceScore }: any) => {
              const ownerLabel = dataset.owner.username || dataset.owner.walletAddress.substring(0, 10);
              const latestVersion = dataset.versions?.[0];
              const fileCount = latestVersion?.files?.length || latestVersion?.fileCount || 0;
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
                  className="block glass p-5 rounded-xl border-slate-800/40 hover:border-violet-500/20 hover:bg-slate-900/20 transition-all shadow hover:shadow-violet-950/5 relative group"
                >
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 mb-2.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-mono text-slate-500">{ownerLabel}</span>
                      <ChevronSlash className="h-3 w-3 text-slate-700" />
                      <h3 className="font-bold text-slate-200 group-hover:text-violet-400 transition-colors text-base">
                        {dataset.name}
                      </h3>
                      {latestVersion?.status === 'ready' && (
                        <span className="text-[9px] text-emerald-400 font-bold bg-emerald-950/20 border border-emerald-900/30 px-1.5 py-0.5 rounded animate-pulse" title="Shelby Verified">
                          ✓ Verified
                        </span>
                      )}
                      <span className="text-[9px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-violet-950/40 text-violet-400 border border-violet-900/30">
                        {dataset.type}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 text-[10px] text-cyan-400 font-semibold bg-cyan-950/25 px-2 py-0.5 rounded border border-cyan-900/20">
                      <Sparkles className="h-3 w-3" />
                      <span>Relevance: {relevanceScore}</span>
                    </div>
                  </div>

                  <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed mb-3 max-w-3xl">
                    {dataset.description || 'No description provided.'}
                  </p>

                  <div className="grid grid-cols-3 gap-2 py-2 my-2 border-y border-slate-900/40 text-[10px] text-slate-400 max-w-xl">
                    <div>
                      <span className="text-slate-600 block uppercase font-semibold">Files</span>
                      <span className="text-slate-200 font-mono">{fileCount} files ({formatBytes(Number(totalBytes))})</span>
                    </div>
                    <div>
                      <span className="text-slate-600 block uppercase font-semibold">Quality Score</span>
                      <span className="text-violet-400 font-bold">{dataset.qualityScore || 0}%</span>
                    </div>
                    <div>
                      <span className="text-slate-600 block uppercase font-semibold">Forks</span>
                      <span className="text-slate-200 font-mono">{dataset.forksCount || 0}</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-4 pt-3">
                    <div className="flex items-center gap-3 text-[10px] text-slate-500">
                      <Clock className="h-3.5 w-3.5" />
                      <span>Updated {new Date(dataset.createdAt).toLocaleDateString()}</span>
                      <span>•</span>
                      <span className="font-mono">v{latestVersion?.version || '0.1.0'}</span>
                      <span>•</span>
                      <span>{dataset.license || 'Proprietary'}</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5 max-w-[50%] justify-end">
                      {dataset.tags.slice(0, 3).map((t: string) => (
                        <span key={t} className="text-[9px] bg-[#03050a] px-2 py-0.5 rounded text-slate-400 font-medium">
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
           <h3 className="text-sm font-semibold text-slate-400">No datasets found</h3>
           <p className="text-xs text-slate-500 mt-1">
             Try searching with more general keywords or click explore to browse.
           </p>
         </div>
       )}
     </div>

   </div>
 );
}

function ChevronSlash(props: React.SVGProps<SVGSVGElement>) {
 return (
   <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5" {...props}>
     <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
   </svg>
 );
}