'use client';

import { useEffect, useState } from 'react';

interface ChatAttachmentProps {
  path: string;
  name: string | null;
  type: string | null;
}

// Muestra un adjunto del chat: imagen (miniatura que abre en grande),
// nota de voz (reproductor) o documento (enlace 📎). El archivo vive
// en un bucket privado, así que primero se pide un enlace firmado.
export default function ChatAttachment({ path, name, type }: ChatAttachmentProps) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`/api/chat/attachment?path=${encodeURIComponent(path)}`);
        const data = await res.json();
        if (!alive) return;
        if (res.ok && data.url) setUrl(data.url);
        else setFailed(true);
      } catch {
        if (alive) setFailed(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, [path]);

  if (failed) return <span className="chat-attach-error">📎 Adjunto no disponible</span>;
  if (!url) return <span className="chat-attach-loading">📎 Cargando…</span>;

  if (type?.startsWith('image/')) {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" className="chat-attach-img-link">
        {/* eslint-disable-next-line @next/next/no-img-element -- enlace firmado temporal, no optimizable */}
        <img src={url} alt={name ?? 'Imagen'} className="chat-attach-img" />
      </a>
    );
  }

  if (type?.startsWith('audio/')) {
    return <audio controls src={url} className="chat-attach-audio" preload="metadata" />;
  }

  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="chat-attach-doc">
      📎 {name ?? 'Documento'}
    </a>
  );
}
