'use client';

import { useState, useEffect } from 'react';
import { useAlkanesSDK } from '@/context/AlkanesSDKContext';
import { ExternalLink, Image as ImageIcon, FileText, Code, AlertCircle } from 'lucide-react';

interface InscriptionRendererProps {
  inscriptionId: string;
  inscriptionNumber?: number;
  className?: string;
  showMetadata?: boolean;
}

interface InscriptionData {
  id: string;
  number: number;
  content_type?: string;
  content_length?: number;
  genesis_height?: number;
  genesis_fee?: number;
  sat?: number;
  timestamp?: number;
  address?: string;
  output?: string;
  offset?: number;
}

export default function InscriptionRenderer({
  inscriptionId,
  inscriptionNumber,
  className = '',
  showMetadata = true,
}: InscriptionRendererProps) {
  const { provider } = useAlkanesSDK();
  const [inscription, setInscription] = useState<InscriptionData | null>(null);
  const [contentUrl, setContentUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadInscription();
  }, [inscriptionId]);

  const loadInscription = async () => {
    if (!provider) return;

    setLoading(true);
    setError(null);

    try {
      const data = await provider.ordInscription(inscriptionId);
      setInscription(data);

      // Build content URL - typically served by ord server
      // For now, use ordiscan.com as fallback
      const ordServerUrl = `https://ordiscan.com/content/${inscriptionId}`;
      setContentUrl(ordServerUrl);
    } catch (err: any) {
      console.error('Failed to load inscription:', err);
      setError(err.message || 'Failed to load inscription');
      
      // Even if API fails, we can still show content from ordiscan
      const ordServerUrl = `https://ordiscan.com/content/${inscriptionId}`;
      setContentUrl(ordServerUrl);
    } finally {
      setLoading(false);
    }
  };

  const renderContent = () => {
    if (!contentUrl) return null;

    const contentType = inscription?.content_type || '';

    // Image types
    if (contentType.startsWith('image/')) {
      return (
        <div className="relative group">
          <img
            src={contentUrl}
            alt={`Inscription ${inscriptionNumber || inscriptionId}`}
            className="max-w-full h-auto rounded-lg"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none';
              setError('Failed to load image');
            }}
          />
          <a
            href={contentUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="absolute top-2 right-2 p-2 bg-black/60 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <ExternalLink size={16} className="text-white" />
          </a>
        </div>
      );
    }

    // Text types
    if (
      contentType.startsWith('text/plain') ||
      contentType === 'application/json' ||
      contentType === 'text/markdown'
    ) {
      return (
        <div className="relative">
          <iframe
            src={contentUrl}
            className="w-full h-64 rounded-lg bg-white/5 border border-white/10"
            sandbox="allow-same-origin"
            title={`Inscription ${inscriptionId}`}
          />
          <a
            href={contentUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="absolute top-2 right-2 p-2 bg-black/60 rounded-lg hover:bg-black/80 transition-colors"
          >
            <ExternalLink size={16} className="text-white" />
          </a>
        </div>
      );
    }

    // HTML content
    if (contentType.startsWith('text/html')) {
      return (
        <div className="relative">
          <iframe
            src={contentUrl}
            className="w-full h-96 rounded-lg bg-white border"
            sandbox="allow-scripts allow-same-origin"
            title={`Inscription ${inscriptionId}`}
          />
          <a
            href={contentUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="absolute top-2 right-2 p-2 bg-black/60 rounded-lg hover:bg-black/80 transition-colors z-10"
          >
            <ExternalLink size={16} className="text-white" />
          </a>
        </div>
      );
    }

    // Video types
    if (contentType.startsWith('video/')) {
      return (
        <video controls className="max-w-full rounded-lg">
          <source src={contentUrl} type={contentType} />
          Your browser does not support video playback.
        </video>
      );
    }

    // Audio types
    if (contentType.startsWith('audio/')) {
      return (
        <audio controls className="w-full">
          <source src={contentUrl} type={contentType} />
          Your browser does not support audio playback.
        </audio>
      );
    }

    // SVG
    if (contentType === 'image/svg+xml') {
      return (
        <div className="relative">
          <iframe
            src={contentUrl}
            className="w-full h-96 rounded-lg bg-white/5 border border-white/10"
            sandbox="allow-scripts allow-same-origin"
            title={`Inscription ${inscriptionId}`}
          />
          <a
            href={contentUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="absolute top-2 right-2 p-2 bg-black/60 rounded-lg hover:bg-black/80 transition-colors"
          >
            <ExternalLink size={16} className="text-white" />
          </a>
        </div>
      );
    }

    // Fallback for unknown types
    return (
      <div className="p-4 rounded-lg bg-white/5 border border-white/10 text-center">
        <FileText size={32} className="mx-auto mb-2 text-white/60" />
        <div className="text-sm text-white/80 mb-2">
          {contentType || 'Unknown content type'}
        </div>
        <a
          href={contentUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 text-blue-400 hover:text-blue-300 text-sm"
        >
          View Content <ExternalLink size={14} />
        </a>
      </div>
    );
  };

  const getContentTypeIcon = () => {
    const contentType = inscription?.content_type || '';
    if (contentType.startsWith('image/')) return <ImageIcon size={16} />;
    if (contentType.startsWith('text/')) return <FileText size={16} />;
    if (contentType.startsWith('application/')) return <Code size={16} />;
    return <FileText size={16} />;
  };

  if (loading) {
    return (
      <div className={`p-4 rounded-lg bg-white/5 border border-white/10 ${className}`}>
        <div className="flex items-center justify-center gap-2 text-white/60">
          <div className="animate-spin rounded-full h-4 w-4 border-2 border-white/20 border-t-white/60" />
          <span className="text-sm">Loading inscription...</span>
        </div>
      </div>
    );
  }

  if (error && !contentUrl) {
    return (
      <div className={`p-4 rounded-lg bg-red-500/10 border border-red-500/20 ${className}`}>
        <div className="flex items-center gap-2 text-red-400">
          <AlertCircle size={16} />
          <span className="text-sm">{error}</span>
        </div>
      </div>
    );
  }

  return (
    <div className={`space-y-3 ${className}`}>
      {/* Metadata */}
      {showMetadata && (
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-2">
            {getContentTypeIcon()}
            <span className="text-white/80">
              Inscription #{inscriptionNumber || inscription?.number || '?'}
            </span>
          </div>
          <a
            href={`https://ordiscan.com/inscription/${inscriptionId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-400 hover:text-blue-300 flex items-center gap-1"
          >
            View on Ordiscan <ExternalLink size={12} />
          </a>
        </div>
      )}

      {/* Content */}
      <div className="rounded-lg overflow-hidden bg-white/5 border border-white/10">
        {renderContent()}
      </div>

      {/* Additional Metadata */}
      {showMetadata && inscription && (
        <div className="text-xs space-y-1 text-white/60">
          {inscription.content_type && (
            <div>Type: {inscription.content_type}</div>
          )}
          {inscription.content_length && (
            <div>Size: {(inscription.content_length / 1024).toFixed(2)} KB</div>
          )}
          {inscription.genesis_height && (
            <div>Genesis Height: {inscription.genesis_height}</div>
          )}
          {inscription.sat !== undefined && (
            <div>Sat: {inscription.sat.toLocaleString()}</div>
          )}
        </div>
      )}
    </div>
  );
}
