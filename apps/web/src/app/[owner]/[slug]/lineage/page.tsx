'use client';

import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import ReactFlow, {
 Background,
 Controls,
 MiniMap,
 MarkerType,
 Node,
 Edge,
 Handle,
 Position,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { GitFork, Layers, ArrowLeft, Loader2, Info } from 'lucide-react';
import Link from 'next/link';

interface LineageData {
 nodes: Array<{
   id: string;
   label: string;
   datasetName: string;
   owner: string;
   version: string;
   isCurrent: boolean;
 }>;
 edges: Array<{
   id: string;
   source: string;
   target: string;
   label: string;
   animated: boolean;
 }>;
}

// Custom CustomNode component for ReactFlow
const CustomNode = ({ data }: { data: any }) => {
 return (
   <div
     className={`px-4 py-3 rounded-lg border text-left shadow-lg transition-all min-w-[180px] ${
       data.isCurrent
         ? 'bg-slate-900/90 border-violet-500/80 shadow-violet-950/20'
         : 'bg-[#080d1a]/95 border-slate-800'
     }`}
   >
     <Handle type="target" position={Position.Left} className="w-2 h-2 !bg-slate-700" />
     
     <div className="space-y-1">
       <span className="text-[9px] font-mono text-slate-500 block truncate">
         {data.owner || 'unknown'}
       </span>
       <h4 className="text-xs font-bold text-slate-200 truncate">
         {data.datasetName}
       </h4>
       <div className="flex items-center justify-between gap-2 mt-1">
         <span className="text-[10px] font-bold font-mono text-cyan-400 bg-cyan-950/25 px-1.5 py-0.5 rounded">
           v{data.version}
         </span>
         {data.isCurrent && (
           <span className="text-[9px] font-semibold text-violet-400 bg-violet-950/40 px-1.5 py-0.5 rounded border border-violet-900/30 animate-pulse">
             active
           </span>
         )}
       </div>
     </div>

     <Handle type="source" position={Position.Right} className="w-2 h-2 !bg-slate-700" />
   </div>
 );
};

export default function LineageGraphPage() {
 const { owner, slug } = useParams() as { owner: string; slug: string };
 const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';

 // 1. Fetch dataset id first
 const { data: dataset, isLoading: isLoadingDataset } = useQuery<any>({
   queryKey: ['dataset', owner, slug],
   queryFn: async () => {
     const res = await fetch(`${apiBase}/datasets/${owner}/${slug}`);
     if (!res.ok) throw new Error('Dataset not found');
     return res.json();
   },
 });

 // 2. Fetch lineage nodes and edges
 const { data: lineage, isLoading: isLoadingLineage } = useQuery<LineageData>({
   queryKey: ['lineage', dataset?.id],
   queryFn: async () => {
     const res = await fetch(`${apiBase}/datasets/id/${dataset.id}/lineage`);
     if (!res.ok) throw new Error('Failed to fetch lineage');
     return res.json();
   },
   enabled: !!dataset?.id,
 });

 // Types map for custom nodes
 const nodeTypes = useMemo(() => ({ customNode: CustomNode }), []);

 // Format ReactFlow components
 const flowNodes = useMemo(() => {
   if (!lineage?.nodes) return [];
   
   // Arrange nodes horizontally to show progression
   return lineage.nodes.map((node, index) => {
     // Very simple spacing layout
     const x = 50 + index * 260;
     // Zigzag vertical alignment to prevent overlap
     const y = 150 + (index % 2 === 0 ? 0 : 80);

     return {
       id: node.id,
       type: 'customNode',
       position: { x, y },
       data: {
         datasetName: node.datasetName,
         owner: node.owner,
         version: node.version,
         isCurrent: node.isCurrent,
       },
     } as Node;
   });
 }, [lineage]);

 const flowEdges = useMemo(() => {
   if (!lineage?.edges) return [];
   return lineage.edges.map((edge) => ({
     id: edge.id,
     source: edge.source,
     target: edge.target,
     label: edge.label,
     animated: edge.animated,
     style: { stroke: '#6366f1', strokeWidth: 1.5 },
     markerEnd: {
       type: MarkerType.ArrowClosed,
       color: '#6366f1',
     },
     labelStyle: { fill: '#a78bfa', fontSize: 10, fontFamily: 'monospace', fontWeight: 600 },
     labelBgPadding: [6, 4],
     labelBgBorderRadius: 4,
     labelBgStyle: { fill: '#0b0f19', fillOpacity: 0.8 },
   }) as Edge);
 }, [lineage]);

 const isLoading = isLoadingDataset || isLoadingLineage;

 return (
   <div className="space-y-6 flex flex-col h-[calc(100vh-140px)]">
     
     {/* Lineage Header */}
     <div className="flex items-center justify-between border-b border-slate-900 pb-4">
       <div className="flex items-center gap-3">
         <Link
           href={`/${owner}/${slug}`}
           className="flex items-center justify-center h-8 w-8 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-white transition-all"
         >
           <ArrowLeft className="h-4 w-4" />
         </Link>
         <div>
           <h1 className="text-xl font-bold text-white flex items-center gap-2">
             <Layers className="h-5 w-5 text-violet-400" />
             Dataset Lineage Graph
           </h1>
           <p className="text-xs text-slate-400">
             Provenance tracker for version histories, forks, and merged subsets.
           </p>
         </div>
       </div>

       <div className="flex items-center gap-2 px-3 py-1.5 rounded bg-slate-950/60 border border-slate-900 text-[10px] text-slate-400 font-medium">
         <Info className="h-3.5 w-3.5 text-cyan-400" />
         <span>Forks show origin parents cryptographically linked on Shelby coordination node</span>
       </div>
     </div>

     {/* ReactFlow Canvas Container */}
     <div className="flex-1 rounded-xl glass border-slate-800/40 relative overflow-hidden bg-[#03050a]/40 shadow-inner">
       {isLoading ? (
         <div className="absolute inset-0 flex flex-col items-center justify-center space-y-3 bg-[#050811]/60 backdrop-blur-sm z-50">
           <Loader2 className="h-8 w-8 text-violet-500 animate-spin" />
           <span className="text-xs text-slate-400">Constructing DAG graph...</span>
         </div>
       ) : flowNodes.length > 0 ? (
         <ReactFlow
           nodes={flowNodes}
           edges={flowEdges}
           nodeTypes={nodeTypes}
           fitView
           className="font-sans"
         >
           <Background color="#1e293b" gap={16} size={1} />
           <Controls className="!bg-slate-900 !border-slate-800 !text-slate-300" />
           <MiniMap
             nodeColor={() => '#4f46e5'}
             maskColor="rgba(5, 8, 17, 0.7)"
             className="!bg-slate-950 !border-slate-800"
           />
         </ReactFlow>
       ) : (
         <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center space-y-4">
           <GitFork className="h-10 w-10 text-slate-600" />
           <div className="space-y-1">
             <h3 className="text-sm font-semibold text-slate-400">No Lineage Node Available</h3>
             <p className="text-xs text-slate-500 max-w-xs leading-normal">
               This repository has no parents or forks yet. Create a fork or import parent versions to visualize relationships.
             </p>
           </div>
         </div>
       )}
     </div>

   </div>
 );
}