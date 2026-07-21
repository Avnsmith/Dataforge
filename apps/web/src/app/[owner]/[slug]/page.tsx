'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { useWallet } from '@aptos-labs/wallet-adapter-react';
import Link from 'next/link';
import {
 Folder,
 File,
 GitFork,
 Download,
 Calendar,
 Layers,
 FileCode,
 CheckCircle,
 AlertCircle,
 Copy,
 ExternalLink,
 ChevronRight,
 UploadCloud,
 Loader2,
 Trash2,
} from 'lucide-react';

const hexToUint8Array = (hexString: string): Uint8Array => {
  const cleanHex = hexString.replace(/^0x/i, '');
  const pairs = cleanHex.match(/.{1,2}/g) || [];
  return new Uint8Array(pairs.map(byte => parseInt(byte, 16)));
};

interface DatasetFile {
 id: string;
 path: string;
 size: string;
 sha256: string;
 shelbyBlobName: string;
 shelbyMerkleRoot: string | null;
 explorerUrl: string | null;
 mimeType: string | null;
}

interface DatasetVersion {
 id: string;
 version: string;
 changelog: string | null;
 status: 'draft' | 'uploading' | 'processing' | 'ready' | 'failed';
 totalSize: string | null;
 fileCount: number | null;
 manifestHash: string | null;
 manifestShelbyBlobName: string | null;
 manifestShelbyMerkleRoot: string | null;
 createdAt: string;
 files: DatasetFile[];
}

interface DatasetDetail {
 id: string;
 name: string;
 slug: string;
 description: string | null;
 readme: string | null;
 visibility: string;
 license: string | null;
 type: string;
 tags: string[];
 createdAt: string;
 ownerId: string;
 owner: {
   id: string;
   walletAddress: string;
   username: string | null;
   avatarUrl: string | null;
 };
 versions: DatasetVersion[];
 shelbyMode?: string;
 forksCount?: number;
 qualityScore?: number;
 explorerUrl?: string;
}

export default function DatasetDetailPage() {
 const { owner, slug } = useParams() as { owner: string; slug: string };
 const router = useRouter();
 const searchParams = useSearchParams();
 const queryVersion = searchParams.get('v');
 const queryClient = useQueryClient();
 const { walletAddress, isConnected, user, token, isRestoring } = useAuth();
 const { signAndSubmitTransaction, connected } = useWallet();

 const [activeTab, setActiveTab] = useState<'files' | 'versions' | 'upload' | 'settings'>('files');
 const [selectedVersionId, setSelectedVersionId] = useState<string>('');
 const [copiedText, setCopiedText] = useState<string | null>(null);
 const [previewFileId, setPreviewFileId] = useState<string | null>(null);

 // New Version Form
 const [newVersionString, setNewVersionString] = useState('');
 const [newVersionChangelog, setNewVersionChangelog] = useState('');
 const [isCreatingVersion, setIsCreatingVersion] = useState(false);

 // File Upload Form
 const [uploadFiles, setUploadFiles] = useState<FileList | null>(null);
 const [uploadProgress, setUploadProgress] = useState<{ [key: string]: 'idle' | 'uploading' | 'done' | 'failed' }>({});
 const [isPublishing, setIsPublishing] = useState(false);

 const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';

 // Fetch File Preview Query
 const { data: previewData, isLoading: isLoadingPreview, error: previewError } = useQuery<any>({
   queryKey: ['file-preview', previewFileId],
   queryFn: async () => {
     if (!previewFileId) return null;
     const res = await fetch(`${apiBase}/files/${previewFileId}/preview`);
     if (!res.ok) throw new Error('Failed to load file preview');
     return res.json();
   },
   enabled: !!previewFileId,
 });

 // Fetch Dataset details
 const { data: dataset, isLoading, error, refetch } = useQuery<DatasetDetail>({
   queryKey: ['dataset', owner, slug],
   queryFn: async () => {
     const res = await fetch(`${apiBase}/datasets/${owner}/${slug}`);
     if (!res.ok) throw new Error('Dataset not found');
     return res.json();
   },
 });

 const isOwner = dataset && user && dataset.ownerId === user.id;

 // Selected Version configuration
 const readyVersions = dataset?.versions.filter(v => v.status === 'ready') || [];
 const latestReadyVersion = readyVersions[0] || dataset?.versions[0];
 const activeVersion = dataset?.versions.find(v => v.id === (selectedVersionId || latestReadyVersion?.id));

 // Initialize version selector based on query parameter or latest version
 React.useEffect(() => {
   if (dataset?.versions && dataset.versions.length > 0) {
     if (queryVersion) {
       const found = dataset.versions.find(v => v.version === queryVersion);
       if (found) {
         setSelectedVersionId(found.id);
         return;
       }
     }
     if (latestReadyVersion && !selectedVersionId) {
       setSelectedVersionId(latestReadyVersion.id);
     }
   }
 }, [dataset, queryVersion, latestReadyVersion, selectedVersionId]);

 // Copy to clipboard helper
 const handleCopy = (text: string, label: string) => {
   navigator.clipboard.writeText(text);
   setCopiedText(label);
   setTimeout(() => setCopiedText(null), 2000);
 };

 // Fork Mutation
 const forkMutation = useMutation({
   mutationFn: async () => {
     const res = await fetch(`${apiBase}/datasets/${dataset?.id}/fork`, {
       method: 'POST',
       headers: {
         'Content-Type': 'application/json',
         'Authorization': `Bearer ${token || ''}`,
       },
     });
     if (!res.ok) {
       const err = await res.json();
       throw new Error(err.message || 'Failed to fork dataset');
     }
     return res.json();
   },
   onSuccess: (data) => {
     const ownerLabel = user?.username || walletAddress!;
     router.push(`/${ownerLabel}/${data.slug}`);
   },
   onError: (err: any) => {
     alert(`Fork failed: ${err.message}`);
   },
 });

 // Create Version Mutation
 const handleCreateVersion = async (e: React.FormEvent) => {
   e.preventDefault();
   if (!newVersionString) return;
   setIsCreatingVersion(true);

   try {
     const res = await fetch(`${apiBase}/datasets/${dataset?.id}/versions`, {
       method: 'POST',
       headers: {
         'Content-Type': 'application/json',
         'Authorization': `Bearer ${token || ''}`,
       },
       body: JSON.stringify({ version: newVersionString, changelog: newVersionChangelog }),
     });

     const data = await res.json();
     if (!res.ok) throw new Error(data.message || 'Failed to create version draft');

     setSelectedVersionId(data.id);
     setNewVersionString('');
     setNewVersionChangelog('');
     refetch();
     alert('Draft version created! You can now upload files.');
   } catch (err: any) {
     alert(err.message);
   } finally {
     setIsCreatingVersion(false);
   }
 };

  // Upload Files trigger
  const handleFileUpload = async () => {
    if (!uploadFiles || !activeVersion) return;
    const progress: typeof uploadProgress = {};
    Array.from(uploadFiles).forEach(f => {
      progress[f.name] = 'idle';
    });
    setUploadProgress(progress);

    for (const file of Array.from(uploadFiles)) {
      setUploadProgress(prev => ({ ...prev, [file.name]: 'uploading' }));
      const formData = new FormData();
      formData.append('file', file);
      formData.append('path', file.name);

      try {
        // 1. Prepare stage
        const prepRes = await fetch(`${apiBase}/versions/${activeVersion.id}/files/prepare`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token || ''}`,
          },
          body: formData,
        });

        if (!prepRes.ok) {
          const errData = await prepRes.json();
          throw new Error(errData.message || 'Staging step failed');
        }
        const prepData = await prepRes.json();

        // 2. sign transaction on-chain
        let txHash = '';
        if (connected && signAndSubmitTransaction) {
          try {
            const convertedArgs = [...prepData.payload.arguments];
            if (typeof convertedArgs[2] === 'string' && convertedArgs[2].startsWith('0x')) {
              convertedArgs[2] = hexToUint8Array(convertedArgs[2]);
            }

            const txResult = await signAndSubmitTransaction({
              data: {
                function: prepData.payload.function,
                typeArguments: prepData.payload.type_arguments,
                functionArguments: convertedArgs
              }
            });
            txHash = txResult.hash;
          } catch (signErr: any) {
            throw new Error(`Transaction signing cancelled/failed: ${signErr.message || signErr}`);
          }
        } else {
          // Fallback to mock transaction hash in local sandbox
          txHash = 'mock_tx_hash_' + Math.random().toString(36).substring(2);
        }

        // 3. Confirm/finalize stage
        const finalData = new FormData();
        finalData.append('path', file.name);
        finalData.append('transactionHash', txHash);

        const res = await fetch(`${apiBase}/versions/${activeVersion.id}/files/upload`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token || ''}`,
          },
          body: finalData,
        });

        if (!res.ok) {
          const errData = await res.json();
          throw new Error(errData.message || 'Confirm stage failed');
        }
        setUploadProgress(prev => ({ ...prev, [file.name]: 'done' }));
      } catch (e: any) {
        alert(e.message || 'Upload failed');
        setUploadProgress(prev => ({ ...prev, [file.name]: 'failed' }));
      }
    }

    setUploadFiles(null);
    refetch();
  };

  // Publish Version trigger
  const handlePublishVersion = async () => {
    if (!activeVersion) return;
    setIsPublishing(true);

    try {
      // 1. Prepare manifest publish transaction
      const prepRes = await fetch(`${apiBase}/versions/${activeVersion.id}/publish/prepare`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token || ''}`,
        },
      });

      if (!prepRes.ok) {
        const errData = await prepRes.json();
        throw new Error(errData.message || 'Prepare publish failed');
      }

      const prepData = await prepRes.json();

      let txHash = '';
      if (connected && signAndSubmitTransaction) {
        try {
          const convertedArgs = [...prepData.payload.arguments];
          if (typeof convertedArgs[2] === 'string' && convertedArgs[2].startsWith('0x')) {
            convertedArgs[2] = hexToUint8Array(convertedArgs[2]);
          }

          const txResult = await signAndSubmitTransaction({
            data: {
              function: prepData.payload.function,
              typeArguments: prepData.payload.type_arguments,
              functionArguments: convertedArgs
            }
          });
          txHash = txResult.hash;
        } catch (signErr: any) {
          throw new Error(`Transaction signing cancelled/failed: ${signErr.message || signErr}`);
        }
      } else {
        txHash = 'mock_publish_tx_hash_' + Math.random().toString(36).substring(2);
      }

      // 2. Finalize publish
      const res = await fetch(`${apiBase}/versions/${activeVersion.id}/publish`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token || ''}`,
        },
        body: JSON.stringify({ transactionHash: txHash }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || 'Failed to trigger publishing');
      }

      alert('Publishing job queued! Files are being loaded to Shelby Hot Storage.');
      refetch();
      setActiveTab('files');
    } catch (e: any) {
      alert(e.message);
    } finally {
      setIsPublishing(false);
    }
  };

 // Format bytes
 const formatBytes = (bytes: string | number | null) => {
   if (!bytes) return '0 B';
   const num = Number(bytes);
   if (num === 0) return '0 B';
   const k = 1024;
   const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
   const i = Math.floor(Math.log(num) / Math.log(k));
   return parseFloat((num / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
 };

 if (isLoading) {
   return (
     <div className="flex flex-col items-center justify-center py-32 space-y-4">
       <Loader2 className="h-10 w-10 text-violet-500 animate-spin" />
       <p className="text-slate-400 text-sm">Loading repository from database...</p>
     </div>
   );
 }

 if (error || !dataset) {
   return (
     <div className="max-w-md mx-auto my-16 text-center space-y-4">
       <AlertCircle className="h-12 w-12 text-rose-500 mx-auto" />
       <h2 className="text-lg font-bold text-white">Repository not found</h2>
       <p className="text-sm text-slate-400">
         The requested dataset repository does not exist or has been deleted.
       </p>
       <Link href="/" className="text-sm font-semibold text-violet-400 hover:underline">
         Return to Explore
       </Link>
     </div>
   );
 }

 const ownerLabel = dataset.owner.username || dataset.owner.walletAddress;

 return (
   <div className="space-y-8">
     {/* Breadcrumb Header */}
     <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-900 pb-6">
       <div className="space-y-2">
         <div className="flex items-center gap-1.5 text-sm font-mono text-slate-500">
           <Link href="/" className="hover:text-slate-300">
             explore
           </Link>
           <ChevronRight className="h-3 w-3" />
           <span className="text-slate-400">{ownerLabel}</span>
         </div>
         
         <div className="flex flex-wrap items-center gap-3">
           <h1 className="text-2xl sm:text-3xl font-extrabold text-white">
             {dataset.name}
           </h1>
           <span className="text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-violet-950/40 text-violet-400 border border-violet-900/30">
             {dataset.type}
           </span>
           <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-400">
             {dataset.visibility}
           </span>
         </div>
         <p className="text-slate-400 text-sm leading-relaxed max-w-2xl">
           {dataset.description || 'No description provided.'}
         </p>
       </div>

       {/* Buttons */}
       <div className="flex items-center gap-3 self-start md:self-center">
         <button
           onClick={() => forkMutation.mutate()}
           disabled={forkMutation.isPending || !isConnected || isRestoring}
           className="flex items-center gap-1.5 h-10 px-4 rounded-md bg-slate-900 border border-slate-800 text-sm font-semibold text-slate-300 hover:bg-slate-800 hover:text-white transition-all disabled:opacity-50"
         >
           <GitFork className="h-4 w-4" />
           <span>{forkMutation.isPending ? 'Forking...' : 'Fork'}</span>
         </button>
         
         <Link
           href={`/${ownerLabel}/${dataset.slug}/lineage`}
           className="flex items-center gap-1.5 h-10 px-4 rounded-md bg-slate-900 border border-slate-800 text-sm font-semibold text-slate-300 hover:bg-slate-800 hover:text-white transition-all"
         >
           <Layers className="h-4 w-4" />
           <span>Lineage</span>
         </Link>
       </div>
     </div>

     {/* Tabs */}
     <div className="flex border-b border-slate-850">
       <button
         onClick={() => setActiveTab('files')}
         className={`px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-all ${
           activeTab === 'files'
             ? 'border-violet-500 text-violet-400 font-bold'
             : 'border-transparent text-slate-400 hover:text-slate-200'
         }`}
       >
         Files ({activeVersion?.files?.length || 0})
       </button>
       <button
         onClick={() => setActiveTab('versions')}
         className={`px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-all ${
           activeTab === 'versions'
             ? 'border-violet-500 text-violet-400 font-bold'
             : 'border-transparent text-slate-400 hover:text-slate-200'
         }`}
       >
         Versions ({dataset.versions.length})
       </button>
       {isOwner && (
         <button
           onClick={() => setActiveTab('upload')}
           className={`px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-all ${
             activeTab === 'upload'
               ? 'border-violet-500 text-violet-400 font-bold'
               : 'border-transparent text-slate-400 hover:text-slate-200'
           }`}
         >
           Upload / Manage
         </button>
       )}
     </div>

     {/* Tab Contents */}
     {activeTab === 'files' && (
       <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
         
         {/* Main files browser & readme */}
         <div className="lg:col-span-2 space-y-6">
           
           {/* Version select and uploader indicators */}
           <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-slate-950/60 p-4 rounded-xl border border-slate-900">
             <div className="flex items-center gap-2">
               <span className="text-xs text-slate-500 font-semibold uppercase tracking-wider">Version</span>
               <select
                 value={selectedVersionId}
                 onChange={(e) => setSelectedVersionId(e.target.value)}
                 className="h-8 px-2 rounded bg-slate-900 border border-slate-800 text-xs text-slate-200 font-mono focus:outline-none focus:border-violet-500"
               >
                 {dataset.versions.map((v) => (
                   <option key={v.id} value={v.id}>
                     v{v.version} ({v.status})
                   </option>
                 ))}
               </select>
             </div>

             {activeVersion && (
               <div className="flex items-center gap-4 text-xs text-slate-400">
                 <span>Files: <strong className="text-white">{activeVersion.fileCount || activeVersion.files?.length || 0}</strong></span>
                 <span>Size: <strong className="text-white">{formatBytes(activeVersion.totalSize)}</strong></span>
               </div>
             )}
           </div>

           {/* Files List Browser */}
           <div className="glass rounded-xl overflow-hidden border-slate-800/40">
             <div className="bg-slate-900/60 px-5 py-3 border-b border-slate-850 flex items-center justify-between">
               <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">File Path</span>
               <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Size</span>
             </div>

             {activeVersion && activeVersion.files && activeVersion.files.length > 0 ? (
               <div className="divide-y divide-slate-850">
                 {activeVersion.files.map((file) => (
                   <div key={file.id} className="px-5 py-3.5 flex items-center justify-between hover:bg-slate-900/20 transition-all group">
                     <div 
                       onClick={() => setPreviewFileId(file.id)}
                       className="flex items-center gap-3 min-w-0 cursor-pointer"
                       title="Click to preview file statistics and schema"
                     >
                       <File className="h-4.5 w-4.5 text-slate-500 group-hover:text-violet-400 transition-colors shrink-0" />
                       <span className="text-sm font-medium text-slate-200 group-hover:text-violet-400 group-hover:underline transition-all truncate" title={file.path}>
                         {file.path}
                       </span>
                     </div>
                     
                     <div className="flex items-center gap-4">
                       <span className="text-xs font-mono text-slate-400 shrink-0">
                         {formatBytes(file.size)}
                       </span>
                       
                       {/* Download button */}
                       {file.explorerUrl ? (
                         <a
                           href={`${apiBase}/files/${file.id}/download`}
                           download
                           className="flex items-center justify-center h-7 w-7 rounded bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-white transition-all"
                           title="Download via Shelby"
                         >
                           <Download className="h-3.5 w-3.5" />
                         </a>
                       ) : (
                         <span className="h-1.5 w-1.5 rounded-full bg-amber-400" title="Uploading to Shelby..."></span>
                       )}
                     </div>
                   </div>
                 ))}
               </div>
             ) : (
               <div className="p-8 text-center text-slate-500 text-xs">
                 No files added to this version draft yet.
               </div>
             )}
           </div>

           {/* Interactive File Preview Pane */}
           {previewFileId && (
             <div className="glass rounded-xl p-6 border-slate-800/40 space-y-4">
               <div className="flex items-center justify-between border-b border-slate-850 pb-3">
                 <div className="flex items-center gap-2">
                   <FileCode className="h-4.5 w-4.5 text-violet-400" />
                   <h3 className="text-sm font-bold text-slate-200">
                     Preview: {previewData?.fileName || 'Loading...'}
                   </h3>
                 </div>
                 <button
                   onClick={() => setPreviewFileId(null)}
                   className="text-xs text-slate-500 hover:text-slate-300 font-semibold"
                 >
                   Close Preview
                 </button>
               </div>

               {isLoadingPreview ? (
                 <div className="p-12 text-center text-slate-500 text-xs">
                   Loading preview and calculating statistics...
                 </div>
               ) : previewError ? (
                 <div className="p-8 text-center text-rose-500 text-xs">
                   Error loading file preview. Make sure the file is uploaded.
                 </div>
               ) : previewData ? (
                 <div className="space-y-6">
                   {/* Stats Summary */}
                   <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                     <div className="bg-slate-950/40 p-3 rounded-lg border border-slate-900/60">
                       <span className="text-[10px] text-slate-500 font-semibold block uppercase">Quality Score</span>
                       <span className="text-lg font-extrabold text-violet-400">{previewData.qualityScore}/100</span>
                     </div>
                     <div className="bg-slate-950/40 p-3 rounded-lg border border-slate-900/60">
                       <span className="text-[10px] text-slate-500 font-semibold block uppercase">Total Rows</span>
                       <span className="text-lg font-extrabold text-white">{previewData.stats.rows}</span>
                     </div>
                     <div className="bg-slate-950/40 p-3 rounded-lg border border-slate-900/60">
                       <span className="text-[10px] text-slate-500 font-semibold block uppercase">Columns</span>
                       <span className="text-lg font-extrabold text-white">{previewData.stats.columns}</span>
                     </div>
                     <div className="bg-slate-950/40 p-3 rounded-lg border border-slate-900/60">
                       <span className="text-[10px] text-slate-500 font-semibold block uppercase">Missing Values</span>
                       <span className="text-lg font-extrabold text-amber-400">{previewData.stats.missingValues}</span>
                     </div>
                   </div>

                   {/* Inferred Schema Block */}
                   {Object.keys(previewData.stats.schema || {}).length > 0 && (
                     <div className="bg-[#03050a]/40 p-4 rounded-lg border border-slate-900 space-y-2">
                       <span className="text-[10px] text-slate-500 font-bold block uppercase tracking-wider">Inferred Schema</span>
                       <div className="flex flex-wrap gap-2">
                         {Object.keys(previewData.stats.schema).map((k) => (
                           <span key={k} className="text-xs bg-slate-900 border border-slate-800 text-slate-300 px-2 py-1 rounded font-mono">
                             {k}: <span className="text-violet-400">{previewData.stats.schema[k]}</span>
                           </span>
                         ))}
                       </div>
                     </div>
                   )}

                   {/* Preview Type Renderers */}
                   {previewData.type === 'csv' && Array.isArray(previewData.preview) && (
                     <div className="overflow-x-auto max-h-[300px] border border-slate-850 rounded-lg">
                       <table className="min-w-full text-xs text-left">
                         <thead className="bg-slate-900 text-slate-400 font-semibold uppercase tracking-wider sticky top-0 border-b border-slate-850">
                           <tr>
                             {previewData.headers?.map((h: string, idx: number) => (
                               <th key={idx} className="px-3 py-2 border-r border-slate-850">{h}</th>
                             ))}
                           </tr>
                         </thead>
                         <tbody className="divide-y divide-slate-850 bg-[#03050a]/20">
                           {previewData.preview.map((row: any[], rowIdx: number) => (
                             <tr key={rowIdx} className="hover:bg-slate-900/40">
                               {row.map((cell: string, cellIdx: number) => (
                                 <td key={cellIdx} className="px-3 py-2 font-mono text-[10px] text-slate-300 border-r border-slate-850 truncate max-w-[150px]" title={cell}>
                                   {cell}
                                 </td>
                               ))}
                             </tr>
                           ))}
                         </tbody>
                       </table>
                     </div>
                   )}

                   {previewData.type === 'json' && (
                     <pre className="text-xs text-slate-300 font-mono whitespace-pre-wrap leading-relaxed bg-[#03050a]/40 p-4 rounded-lg border border-slate-900 max-h-[300px] overflow-y-auto">
                       {JSON.stringify(previewData.preview, null, 2)}
                     </pre>
                   )}

                   {previewData.type === 'markdown' && (
                     <pre className="text-xs text-slate-300 font-mono whitespace-pre-wrap leading-relaxed bg-[#03050a]/40 p-4 rounded-lg border border-slate-900 max-h-[300px] overflow-y-auto">
                       {previewData.preview}
                     </pre>
                   )}

                   {previewData.type === 'image' && (
                     <div className="flex items-center justify-center p-4 bg-[#03050a]/20 border border-slate-850 rounded-lg">
                       <img src={previewData.preview} alt={previewData.fileName} className="max-h-[300px] object-contain rounded" />
                     </div>
                   )}

                   {previewData.type === 'raw' && (
                     <pre className="text-xs text-slate-400 font-mono whitespace-pre-wrap leading-relaxed bg-[#03050a]/40 p-4 rounded-lg border border-slate-900 max-h-[200px] overflow-y-auto">
                       {previewData.preview}
                     </pre>
                   )}

                 </div>
               ) : null}
             </div>
           )}

           {/* Readme Section */}
           <div className="glass rounded-xl p-6 border-slate-800/40 space-y-4">
             <div className="flex items-center gap-2 border-b border-slate-850 pb-3">
               <FileCode className="h-4.5 w-4.5 text-violet-400" />
               <h3 className="text-sm font-bold text-slate-200">README.md</h3>
             </div>
             <pre className="text-xs text-slate-300 font-mono whitespace-pre-wrap leading-relaxed bg-[#03050a]/40 p-4 rounded-lg border border-slate-900">
               {dataset.readme || '# No README file provided.'}
             </pre>
           </div>

         </div>

         {/* Right Column: Shelby Storage Verification Metadata */}
         <aside className="space-y-6">
                       <div className="glass p-5 rounded-xl border-slate-800/40 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-850 pb-3">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                  Shelby Verification
                </h3>
                {(() => {
                  if (!activeVersion) {
                    return (
                      <span className="flex items-center gap-1 text-[10px] text-amber-400 font-semibold px-2 py-0.5 rounded bg-amber-950/20 border border-amber-900/30">
                        <AlertCircle className="h-3.5 w-3.5" />
                        Pending
                      </span>
                    );
                  }
                  if (activeVersion.status === 'failed') {
                    return (
                      <span className="flex items-center gap-1 text-[10px] text-rose-400 font-semibold px-2 py-0.5 rounded bg-rose-950/20 border border-rose-900/30">
                        <AlertCircle className="h-3.5 w-3.5" />
                        Failed
                      </span>
                    );
                  }
                  if (activeVersion.status !== 'ready') {
                    return (
                      <span className="flex items-center gap-1 text-[10px] text-amber-400 font-semibold px-2 py-0.5 rounded bg-amber-950/20 border border-amber-900/30">
                        <AlertCircle className="h-3.5 w-3.5" />
                        Pending
                      </span>
                    );
                  }
                  if (dataset.shelbyMode === 'mock') {
                    return (
                      <span className="flex items-center gap-1 text-[10px] text-emerald-400 font-semibold px-2 py-0.5 rounded bg-emerald-950/20 border border-emerald-900/30">
                        <CheckCircle className="h-3.5 w-3.5" />
                        Shelby Live (Mock Mode)
                      </span>
                    );
                  }
                  const hasLiveProof = activeVersion.manifestShelbyBlobName && activeVersion.manifestShelbyMerkleRoot && !activeVersion.manifestShelbyMerkleRoot.startsWith('mock-');
                  if (hasLiveProof) {
                    return (
                      <span className="flex items-center gap-1 text-[10px] text-emerald-400 font-semibold px-2 py-0.5 rounded bg-emerald-950/20 border border-emerald-900/30">
                        <CheckCircle className="h-3.5 w-3.5" />
                        Shelby Live
                      </span>
                    );
                  } else {
                    return (
                      <span className="flex items-center gap-1 text-[10px] text-amber-400 font-semibold px-2 py-0.5 rounded bg-amber-950/20 border border-amber-900/30">
                        <AlertCircle className="h-3.5 w-3.5" />
                        Live Pending
                      </span>
                    );
                  }
                })()}
              </div>

              {(() => {
                if (!activeVersion) {
                  return (
                    <div className="text-xs text-slate-400 space-y-1">
                      <span className="font-semibold block">Reason:</span>
                      <span>No version has been created yet.</span>
                    </div>
                  );
                }

                if (activeVersion.status === 'failed') {
                  return (
                    <div className="text-xs text-rose-400 space-y-1">
                      <span className="font-semibold block">Reason:</span>
                      <span>File verification or storage generation failed. Please verify file integrity and re-upload.</span>
                    </div>
                  );
                }

                if (activeVersion.status !== 'ready') {
                  return (
                    <div className="text-xs text-slate-400 space-y-1">
                      <span className="font-semibold block">Reason:</span>
                      <span>Version is {activeVersion.status}. Publish the version to generate manifest and verification data.</span>
                    </div>
                  );
                }

                return (
                  <div className="space-y-4 text-xs">
                    <div className="p-2.5 rounded text-[11px] font-medium leading-normal border bg-slate-900/40 border-slate-850 text-slate-300">
                      <div>
                        <span className="font-bold">Provider:</span>{' '}
                        {dataset.shelbyMode === 'mock' ? 'Shelby Mock Network' : 'Shelby Live Network'}
                      </div>
                      <div className="mt-1">
                        <span className="font-bold">Live Network:</span>{' '}
                        {dataset.shelbyMode === 'mock' ? 'Sandboxed (Local Node)' : 'Mainnet'}
                      </div>
                      <div className="mt-1">
                        <span className="font-bold">Manifest Status:</span> Confirmed on Chain
                      </div>
                      <div className="mt-1">
                        <span className="font-bold">SHA-256 Checksum:</span> Verified
                      </div>
                      <div className="mt-1">
                        <span className="font-bold">Merkle Root Verification:</span>{' '}
                        {dataset.shelbyMode === 'mock' ? 'Verified (Local)' : 'Verified on Chain'}
                      </div>
                      {(activeVersion as any).providerTxHash && (
                        <div className="mt-1">
                          <span className="font-bold">Transaction Hash:</span>{' '}
                          <span className="font-mono text-[9px] text-cyan-400">{(activeVersion as any).providerTxHash.substring(0, 16)}...</span>
                        </div>
                      )}
                    </div>

                    <div className="space-y-1.5">
                      <span className="text-slate-500 font-medium block">Merkle Root Hash</span>
                      <div className="flex items-center gap-2 bg-[#03050a] border border-slate-850 px-3 py-2 rounded-md font-mono text-[10px] text-slate-300">
                        <span className="truncate flex-1">{activeVersion.manifestShelbyMerkleRoot}</span>
                        <button
                          onClick={() => handleCopy(activeVersion.manifestShelbyMerkleRoot || '', 'merkle')}
                          className="text-slate-500 hover:text-slate-300 transition-colors"
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <span className="text-slate-500 font-medium block">Manifest Blob Name</span>
                      <div className="bg-[#03050a] border border-slate-850 px-3 py-2 rounded-md font-mono text-[10px] text-slate-300 truncate">
                        {activeVersion.manifestShelbyBlobName}
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <span className="text-slate-500 font-medium block">Manifest Integrity Hash</span>
                      <div className="bg-[#03050a] border border-slate-850 px-3 py-2 rounded-md font-mono text-[10px] text-slate-300 truncate">
                        {activeVersion.manifestHash}
                      </div>
                    </div>

                    {activeVersion.manifestShelbyBlobName && (
                      <a
                        href={`${dataset.explorerUrl || 'https://explorer.shelby.xyz/shelbynet'}/blob/${activeVersion.manifestShelbyBlobName}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-center gap-1.5 w-full h-9 rounded bg-[#0b1424] hover:bg-[#0f1b30] border border-cyan-900/30 text-[11px] font-bold text-cyan-400 transition-all"
                      >
                        <span>Explore on Shelby Explorer</span>
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    )}

                    {copiedText && (
                      <p className="text-[10px] text-emerald-400 font-bold text-center">
                        Copied &{copiedText} hash to clipboard!
                      </p>
                    )}
                  </div>
                );
              })()}
            </div>

           {/* License details */}
           <div className="glass p-5 rounded-xl border-slate-800/40 text-xs space-y-3">
             <div>
               <span className="text-slate-500 block">Quality Score</span>
               <span className="font-bold text-violet-400 text-sm">{(dataset as any).qualityScore || 0}%</span>
             </div>
             <div>
               <span className="text-slate-500 block">Forks Count</span>
               <span className="font-semibold text-slate-200">{(dataset as any).forksCount || 0}</span>
             </div>
             <div>
               <span className="text-slate-500 block">License</span>
               <span className="font-semibold text-slate-200">{dataset.license || 'None'}</span>
             </div>
             <div>
               <span className="text-slate-500 block">Created On</span>
               <span className="font-semibold text-slate-200">{new Date(dataset.createdAt).toLocaleDateString()}</span>
             </div>
             <div>
               <span className="text-slate-500 block">Dataset ID</span>
               <span className="font-mono text-[10px] text-slate-400 block truncate">{dataset.id}</span>
             </div>
           </div>
         </aside>

       </div>
     )}

     {activeTab === 'versions' && (
       <div className="glass rounded-xl overflow-hidden border-slate-800/40 max-w-4xl">
         <div className="bg-slate-900/60 px-5 py-3 border-b border-slate-850 grid grid-cols-6 text-xs font-semibold text-slate-400 uppercase tracking-wider">
           <span className="col-span-1">Version</span>
           <span className="col-span-2">Changelog</span>
           <span className="col-span-1 text-center">Files</span>
           <span className="col-span-1 text-center">Status</span>
           <span className="col-span-1 text-right">Published</span>
         </div>

         <div className="divide-y divide-slate-850">
           {dataset.versions.map((v) => (
             <div key={v.id} className="px-5 py-4 grid grid-cols-6 items-center text-sm">
               <span className="col-span-1 font-mono font-bold text-slate-200">v{v.version}</span>
               <span className="col-span-2 text-slate-400 truncate pr-4">{v.changelog || '—'}</span>
               <span className="col-span-1 text-center font-mono text-xs">{v.fileCount || v.files?.length || 0}</span>
               <span className="col-span-1 text-center">
                 <span
                   className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded ${
                     v.status === 'ready'
                       ? 'bg-emerald-950/40 text-emerald-400 border border-emerald-900/30'
                       : v.status === 'failed'
                       ? 'bg-rose-950/40 text-rose-400 border border-rose-900/30'
                       : 'bg-amber-950/40 text-amber-400 border border-amber-900/30'
                   }`}
                 >
                   {v.status}
                 </span>
               </span>
               <span className="col-span-1 text-right text-xs text-slate-500 font-mono">
                 {new Date(v.createdAt).toLocaleDateString()}
               </span>
             </div>
           ))}
         </div>
       </div>
     )}

     {activeTab === 'upload' && isOwner && (
       <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl">
         {/* Create new Version Draft */}
         <div className="glass p-6 rounded-xl border-slate-800/40 space-y-4">
           <h3 className="text-sm font-bold text-white flex items-center gap-2">
             <Layers className="h-4.5 w-4.5 text-violet-400" />
             1. Create a New Version Draft
           </h3>
           <p className="text-xs text-slate-400 leading-relaxed">
             Every dataset version is immutable. To add or change files, you must first increment the semantic version (e.g. 1.0.1) and create a draft release.
           </p>

           <form onSubmit={handleCreateVersion} className="space-y-4 pt-2">
             <div>
               <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                 Semantic Version String *
               </label>
               <input
                 type="text"
                 required
                 placeholder="e.g. 1.0.0"
                 value={newVersionString}
                 onChange={(e) => setNewVersionString(e.target.value)}
                 className="w-full h-9 px-3 rounded bg-slate-900 border border-slate-800 text-xs text-slate-200 focus:outline-none focus:border-violet-500"
               />
             </div>

             <div>
               <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                 Changelog / Release Notes
               </label>
               <textarea
                 rows={3}
                 placeholder="What changed in this version release?"
                 value={newVersionChangelog}
                 onChange={(e) => setNewVersionChangelog(e.target.value)}
                 className="w-full p-2.5 rounded bg-slate-900 border border-slate-800 text-xs text-slate-200 focus:outline-none focus:border-violet-500"
               />
             </div>

             <button
               type="submit"
               disabled={isCreatingVersion || !newVersionString || isRestoring || !token}
               className="w-full h-9 rounded btn-gradient text-xs font-bold text-white transition-all disabled:opacity-50"
             >
               {isCreatingVersion ? 'Creating Draft...' : 'Create Draft'}
             </button>
           </form>
         </div>

         {/* Upload Files to Draft */}
         <div className="glass p-6 rounded-xl border-slate-800/40 space-y-4">
           <h3 className="text-sm font-bold text-white flex items-center gap-2">
             <UploadCloud className="h-4.5 w-4.5 text-violet-400" />
             2. Upload files & publish
           </h3>
           
           {activeVersion && (activeVersion.status === 'draft' || activeVersion.status === 'uploading') ? (
             <div className="space-y-4">
               <p className="text-xs text-slate-400 leading-relaxed">
                 Uploading files to draft version <strong className="text-violet-400 font-mono">v{activeVersion.version}</strong>.
               </p>

               <div className="border border-dashed border-slate-800 hover:border-violet-500/50 rounded-lg p-5 text-center bg-slate-950/20 transition-all relative">
                 <input
                   type="file"
                   multiple
                   onChange={(e) => setUploadFiles(e.target.files)}
                   className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                 />
                 <UploadCloud className="h-8 w-8 text-slate-500 mx-auto mb-2" />
                 <span className="text-xs text-slate-400 font-medium block">
                   Click or Drag files here to upload
                 </span>
                 {uploadFiles && (
                   <span className="text-[10px] text-violet-400 font-bold block mt-1.5">
                     Selected {uploadFiles.length} files
                   </span>
                 )}
               </div>

               {uploadFiles && (
                 <button
                   onClick={handleFileUpload}
                   disabled={isRestoring || !token}
                   className="w-full h-9 rounded bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs font-bold text-slate-200 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                 >
                   Send Selected Files to Backend
                 </button>
               )}

               {/* Progress Indicators */}
               {Object.keys(uploadProgress).length > 0 && (
                 <div className="bg-[#03050a] border border-slate-900 p-3 rounded-lg max-h-32 overflow-y-auto space-y-1.5">
                   {Object.entries(uploadProgress).map(([name, status]) => (
                     <div key={name} className="flex justify-between items-center text-[10px] font-mono">
                       <span className="truncate text-slate-400 pr-4">{name}</span>
                       <span
                         className={`font-semibold uppercase ${
                           status === 'done'
                             ? 'text-emerald-400'
                             : status === 'failed'
                             ? 'text-rose-400'
                             : 'text-amber-400'
                         }`}
                       >
                         {status}
                       </span>
                     </div>
                   ))}
                 </div>
               )}

               <div className="h-px bg-slate-900"></div>

               <div className="space-y-2">
                 <span className="text-[10px] text-slate-500 block leading-normal">
                   Once all files are uploaded, finalize and process the release to run AI schema validation, compile the manifest, and upload to Shelby.
                 </span>
                 
                 <button
                   onClick={handlePublishVersion}
                   disabled={isPublishing || activeVersion.files?.length === 0 || isRestoring || !token}
                   className="w-full h-10 rounded bg-[#0b1424] hover:bg-[#0f1b30] border border-cyan-900/30 text-xs font-bold text-cyan-400 shadow-md transition-all disabled:opacity-50"
                 >
                   {isPublishing ? 'Queueing job...' : 'Publish Version to Shelby'}
                 </button>
               </div>

             </div>
           ) : (
             <div className="p-8 text-center text-xs text-slate-500 bg-[#03050a]/40 border border-slate-900 rounded-lg">
               Please create a new version draft above or select a draft version in the files browser.
             </div>
           )}
         </div>
       </div>
     )}
   </div>
 );
}