'use client';

import React from 'react';
import { useParams, useRouter } from 'next/navigation';

export default function TreeVersionRedirect() {
  const { owner, slug, version } = useParams() as { owner: string; slug: string; version: string };
  const router = useRouter();
  
  React.useEffect(() => {
    // Redirect to main page showing that version
    router.replace(`/${owner}/${slug}?v=${version}`);
  }, [owner, slug, version, router]);

  return (
    <div className="text-center py-16 text-slate-400 text-sm">
      Loading file tree for v{version}...
    </div>
  );
}
