'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { Database, Shield, Lock, FileText, HelpCircle, Wallet } from 'lucide-react';

export default function NewDatasetPage() {
 const router = useRouter();
 const { walletAddress, isConnected, isConnecting, connectMockWallet, user, token } = useAuth();

 const [name, setName] = useState('');
 const [description, setDescription] = useState('');
 const [visibility, setVisibility] = useState<'public' | 'private'>('public');
 const [license, setLicense] = useState('MIT');
 const [type, setType] = useState('tabular');
 const [tagsInput, setTagsInput] = useState('');
 const [readme, setReadme] = useState('');
 const [isSubmitting, setIsSubmitting] = useState(false);
 const [error, setError] = useState<string | null>(null);

 // Auto initialize README template when name changes
 const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
   const val = e.target.value;
   setName(val);
   if (!readme || readme.startsWith('# ')) {
     setReadme(`# ${val || 'Dataset Name'}\n\n## Description\nProvide a description of this dataset.\n\n## Intended Use\nWhat models or applications is this dataset designed for?\n\n## Verification\nCryptographically verified on Shelby Hot Storage.`);
   }
 };

 const handleSubmit = async (e: React.FormEvent) => {
   e.preventDefault();
   if (!name) return;
   setError(null);
   setIsSubmitting(true);

   const tags = tagsInput
     .split(',')
     .map(t => t.trim().toLowerCase())
     .filter(t => t.length > 0);

   const payload = {
     name,
     description,
     visibility,
     license,
     type,
     tags,
     readme,
   };

   try {
     const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api'}/datasets`, {
       method: 'POST',
       headers: {
         'Content-Type': 'application/json',
         'Authorization': `Bearer ${token || ''}`,
       },
       body: JSON.stringify(payload),
     });

     const data = await response.json();

     if (!response.ok) {
       throw new Error(data.message || 'Failed to create dataset repository');
     }

     // Success: Route to details page
     const ownerLabel = user?.username || walletAddress!;
     router.push(`/${ownerLabel}/${data.slug}`);
   } catch (err: any) {
     console.error(err);
     setError(err.message || 'An unexpected error occurred');
   } finally {
     setIsSubmitting(false);
   }
 };

 if (!isConnected) {
   return (
     <div className="max-w-md mx-auto my-16 glass p-8 rounded-2xl text-center space-y-6 border-slate-800/60 shadow-xl">
       <div className="h-12 w-12 rounded-full bg-violet-950/50 border border-violet-900/30 flex items-center justify-center mx-auto text-violet-400">
         <Database className="h-6 w-6" />
       </div>
       <div className="space-y-2">
         <h2 className="text-xl font-bold tracking-tight text-white">Create Dataset Repository</h2>
         <p className="text-sm text-slate-400 leading-relaxed">
           You must connect your decentralized wallet session to create, version, and sign AI datasets.
         </p>
       </div>
       <button
         onClick={connectMockWallet}
         disabled={isConnecting}
         className="flex items-center justify-center gap-2 w-full h-11 rounded-md btn-gradient text-sm font-semibold text-white transition-all disabled:opacity-50"
       >
         <Wallet className="h-4 w-4" />
         <span>{isConnecting ? 'Connecting...' : 'Connect Mock Wallet'}</span>
       </button>
     </div>
   );
 }

 return (
   <div className="max-w-3xl mx-auto space-y-8">
     <div>
       <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
         <Database className="h-6 w-6 text-violet-400" />
         Create a new dataset repository
       </h1>
       <p className="text-sm text-slate-400 mt-1">
         A repository contains all dataset versions, files, manifests, and lineage history.
       </p>
     </div>

     <div className="h-px bg-slate-800/80"></div>

     {error && (
       <div className="p-4 rounded-lg bg-rose-950/30 border border-rose-900/40 text-sm text-rose-300">
         {error}
       </div>
     )}

     <form onSubmit={handleSubmit} className="space-y-6">
       {/* Owner & Repository Name */}
       <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
         <div>
           <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
             Owner
           </label>
           <div className="h-10 px-3 flex items-center rounded-md bg-slate-900 border border-slate-800 text-xs font-mono text-slate-400">
             {user?.username || walletAddress?.substring(0, 12)}
           </div>
         </div>
         <div className="md:col-span-2">
           <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
             Dataset Repository Name <span className="text-rose-400">*</span>
           </label>
           <input
             type="text"
             required
             placeholder="e.g. crypto-twitter-labeled"
             value={name}
             onChange={handleNameChange}
             className="w-full h-10 px-3 rounded-md bg-slate-900 border border-slate-800 text-sm text-slate-200 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition-all"
           />
         </div>
       </div>

       {/* Short Description */}
       <div>
         <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
           Short Description
         </label>
         <textarea
           rows={2}
           placeholder="A brief tagline or summary of the dataset."
           value={description}
           onChange={(e) => setDescription(e.target.value)}
           className="w-full p-3 rounded-md bg-slate-900 border border-slate-800 text-sm text-slate-200 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition-all"
         />
       </div>

       {/* Type & License */}
       <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
         <div>
           <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
             Dataset Type
             <span title="Tabular, Text, Image etc.">
               <HelpCircle className="h-3 w-3 text-slate-500" />
             </span>
           </label>
           <select
             value={type}
             onChange={(e) => setType(e.target.value)}
             className="w-full h-10 px-3 rounded-md bg-slate-900 border border-slate-800 text-sm text-slate-300 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition-all"
           >
             <option value="tabular">Tabular (CSV, Parquet)</option>
             <option value="text">Text Corpus</option>
             <option value="image">Image Assets</option>
             <option value="audio">Audio / Speech</option>
             <option value="video">Video Assets</option>
             <option value="multimodal">Multimodal</option>
             <option value="json">JSON / Metadata</option>
           </select>
         </div>
         <div>
           <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
             License
           </label>
           <select
             value={license}
             onChange={(e) => setLicense(e.target.value)}
             className="w-full h-10 px-3 rounded-md bg-slate-900 border border-slate-800 text-sm text-slate-300 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition-all"
           >
             <option value="MIT">MIT</option>
             <option value="Apache-2.0">Apache 2.0</option>
             <option value="CC-BY-4.0">CC-BY-4.0 (Creative Commons)</option>
             <option value="CC0-1.0">CC0-1.0 (Public Domain)</option>
             <option value="other">Other / Custom</option>
           </select>
         </div>
       </div>

       {/* Tags */}
       <div>
         <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
           Tags (Comma separated)
         </label>
         <input
           type="text"
           placeholder="e.g. social-media, crypto, sentiment-analysis"
           value={tagsInput}
           onChange={(e) => setTagsInput(e.target.value)}
           className="w-full h-10 px-3 rounded-md bg-slate-900 border border-slate-800 text-sm text-slate-200 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition-all"
         />
       </div>

       {/* Readme Markdown */}
       <div>
         <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
           <FileText className="h-4 w-4" />
           README.md Template (Markdown)
         </label>
         <textarea
           rows={10}
           value={readme}
           onChange={(e) => setReadme(e.target.value)}
           className="w-full p-3 rounded-md bg-slate-900 border border-slate-800 text-sm font-mono text-slate-300 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition-all"
         />
       </div>

       {/* Visibility Setting */}
       <div className="p-4 rounded-lg bg-slate-950/60 border border-slate-900/80 space-y-4">
         <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">
           Repository Visibility
         </label>
         <div className="flex gap-6">
           <label className="flex items-center gap-2.5 cursor-pointer">
             <input
               type="radio"
               name="visibility"
               checked={visibility === 'public'}
               onChange={() => setVisibility('public')}
               className="text-violet-600 focus:ring-violet-500 bg-slate-900 border-slate-800 h-4 w-4"
             />
             <div className="flex items-center gap-1.5 text-sm font-semibold text-slate-200">
               <Shield className="h-4 w-4 text-emerald-400" />
               <span>Public</span>
             </div>
           </label>
           <label className="flex items-center gap-2.5 cursor-pointer">
             <input
               type="radio"
               name="visibility"
               checked={visibility === 'private'}
               onChange={() => setVisibility('private')}
               className="text-violet-600 focus:ring-violet-500 bg-slate-900 border-slate-800 h-4 w-4"
             />
             <div className="flex items-center gap-1.5 text-sm font-semibold text-slate-200">
               <Lock className="h-4 w-4 text-amber-400" />
               <span>Private</span>
             </div>
           </label>
         </div>
       </div>

       {/* Submit */}
       <div className="pt-4 flex justify-end">
         <button
           type="submit"
           disabled={isSubmitting || !name}
           className="h-11 px-6 rounded-md btn-gradient text-sm font-semibold text-white shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all"
         >
           {isSubmitting ? 'Creating Repository...' : 'Create Repository'}
         </button>
       </div>
     </form>
   </div>
 );
}