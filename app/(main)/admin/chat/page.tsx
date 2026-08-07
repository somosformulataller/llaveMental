'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { usePlayer } from '@/components/providers/PlayerProvider';
import {
  AdminChatListItem,
  ChatConversationStatus,
  ChatMessage,
  ChatQuickQuestion,
} from '@/types/chat';
import ChatAttachment from '@/components/chat/ChatAttachment';
import AudioRecorder from '@/components/chat/AudioRecorder';
import AdminNav from '@/components/admin/AdminNav';
import PlayerDetail from '@/components/admin/PlayerDetail';

const MAX_SIZE = 5 * 1024 * 1024;

const STATUS_LABEL: Record<ChatConversationStatus, string> = {
  pendiente: 'Pendiente',
  prioridad: 'Prioridad',
  resuelto: 'Resuelto',
};

interface ThreadInfo {
  id: string;
  player_id: string;
  status: ChatConversationStatus;
  username: string | null;
  email: string | null;
  tickets: number;
}

interface SearchResult {
  id: string;
  username: string | null;
  email: string | null;
}

const fmtDateTime = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString('es-VE', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '';

const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' });

// Chat de atención al cliente (lado ADMIN): lista de conversaciones
// con etiquetas y no leídos, hilo con respuesta (texto/adjunto/nota de
// voz), buscador para iniciar chats y gestión de preguntas rápidas.
export default function AdminChatPage() {
  const { player, isLoading, isStaff: isAdmin } = usePlayer();
  const router = useRouter();

  const [tab, setTab] = useState<'convos' | 'questions'>('convos');
  const [conversations, setConversations] = useState<AdminChatListItem[]>([]);
  const [questions, setQuestions] = useState<ChatQuickQuestion[]>([]);
  const [filter, setFilter] = useState<'todos' | ChatConversationStatus>('todos');
  const [selected, setSelected] = useState<string | null>(null);
  const [thread, setThread] = useState<ThreadInfo | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  // Ficha del jugador desplegada bajo el encabezado del hilo
  const [showDetail, setShowDetail] = useState(false);

  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);

  const [newQuestion, setNewQuestion] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const selectedRef = useRef<string | null>(null);

  // El sondeo lee el hilo seleccionado desde una ref para descartar
  // respuestas que llegan después de cambiar de conversación
  useEffect(() => {
    selectedRef.current = selected;
  }, [selected]);

  useEffect(() => {
    if (!isLoading && !isAdmin) router.replace(player ? '/game' : '/auth/login');
  }, [isLoading, isAdmin, player, router]);

  const loadList = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/chat', { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json();
      setConversations(data.conversations ?? []);
      setQuestions(data.questions ?? []);
    } catch {}
  }, []);

  const loadThread = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/admin/chat?conversation=${id}`, { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json();
      if (selectedRef.current !== id) return; // cambió de hilo mientras cargaba
      setThread(data.conversation ?? null);
      setMessages(data.messages ?? []);
    } catch {}
  }, []);

  // Sondeo de respaldo: lista + hilo abierto cada 10 s
  useEffect(() => {
    if (!isAdmin) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga asíncrona
    loadList();
    const interval = setInterval(() => {
      loadList();
      if (selectedRef.current) loadThread(selectedRef.current);
    }, 10_000);
    return () => clearInterval(interval);
  }, [isAdmin, loadList, loadThread]);

  // TIEMPO REAL: cualquier mensaje nuevo refresca la lista y el hilo
  // abierto al instante (RLS: el admin recibe todos). Migración 007.
  useEffect(() => {
    if (!isAdmin) return;
    const supabase = createClient();
    const channel = supabase
      .channel('chat-rt-admin')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chat_messages' },
        () => {
          loadList();
          if (selectedRef.current) loadThread(selectedRef.current);
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [isAdmin, loadList, loadThread]);

  const msgCount = messages.length;
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [selected, msgCount]);

  // Buscador de jugadores (desde 2 letras)
  useEffect(() => {
    if (!searchOpen) return;
    const q = search.trim();
    if (q.length < 2) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- limpieza síncrona del estado del buscador
      setResults([]);
      return;
    }
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/admin/chat?q=${encodeURIComponent(q)}`, {
          cache: 'no-store',
        });
        const data = await res.json();
        if (res.ok) setResults(data.results ?? []);
      } catch {
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [search, searchOpen]);

  // Llegada desde el menú de un jugador (/admin/chat?player=ID):
  // crea o abre su conversación directamente.
  useEffect(() => {
    if (!isAdmin) return;
    const pid = new URLSearchParams(window.location.search).get('player');
    if (!pid) return;
    window.history.replaceState(null, '', '/admin/chat');
    (async () => {
      try {
        const res = await fetch('/api/admin/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'start', player_id: pid }),
        });
        const data = await res.json();
        if (res.ok && data.conversation_id) {
          selectedRef.current = data.conversation_id;
          setSelected(data.conversation_id);
          setThread(null);
          setMessages([]);
          loadThread(data.conversation_id);
          loadList();
        }
      } catch {}
    })();
  }, [isAdmin, loadThread, loadList]);

  if (!isAdmin) return null;

  const openConversation = (id: string) => {
    selectedRef.current = id;
    setSelected(id);
    setThread(null);
    setMessages([]);
    setNotice(null);
    setShowDetail(false);
    loadThread(id);
    // Abrirla la marca como leída también en la lista
    setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, unread: 0 } : c)));
  };

  const action = async (body: Record<string, unknown>) => {
    const res = await fetch('/api/admin/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'No se pudo completar la acción');
    return data;
  };

  const send = async (payload: {
    text?: string;
    attachment?: { path: string; name: string; type: string };
  }) => {
    if (!selected) return false;
    setSending(true);
    setNotice(null);
    try {
      const data = await action({ action: 'send', conversation_id: selected, ...payload });
      if (data.message) setMessages((prev) => [...prev, data.message]);
      loadList();
      return true;
    } catch (e) {
      setNotice(e instanceof Error ? e.message : 'No se pudo enviar');
      return false;
    } finally {
      setSending(false);
    }
  };

  const sendText = async () => {
    const value = text.trim();
    if (!value || sending) return;
    const ok = await send({ text: value });
    if (ok) setText('');
  };

  const sendFile = async (file: File) => {
    if (!thread) return;
    setNotice(null);
    if (file.size > MAX_SIZE) {
      setNotice('El archivo supera los 5 MB.');
      return;
    }
    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('player_id', thread.player_id); // carpeta del jugador dueño del chat
      const res = await fetch('/api/chat/upload', { method: 'POST', body: form });
      const data = await res.json();
      if (!res.ok) {
        setNotice(data.error ?? 'No se pudo subir el archivo');
        return;
      }
      await send({ attachment: { path: data.path, name: data.name, type: data.type } });
    } catch {
      setNotice('No se pudo subir el archivo');
    } finally {
      setUploading(false);
    }
  };

  const setStatus = async (status: ChatConversationStatus) => {
    if (!selected) return;
    try {
      await action({ action: 'set_status', conversation_id: selected, status });
      setThread((prev) => (prev ? { ...prev, status } : prev));
      loadList();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : 'No se pudo cambiar la etiqueta');
    }
  };

  const startChat = async (r: SearchResult) => {
    try {
      const data = await action({ action: 'start', player_id: r.id });
      setSearchOpen(false);
      setSearch('');
      setResults([]);
      await loadList();
      if (data.conversation_id) openConversation(data.conversation_id);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'No se pudo crear la conversación');
    }
  };

  const addQuestion = async () => {
    const q = newQuestion.trim();
    if (!q) return;
    try {
      await action({ action: 'question_add', question: q });
      setNewQuestion('');
      loadList();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'No se pudo agregar');
    }
  };

  const visible =
    filter === 'todos' ? conversations : conversations.filter((c) => c.status === filter);

  return (
    <main className="admin-main">
      <h1 className="admin-title">💬 Chat de atención al cliente</h1>
      <p className="admin-subtitle">Conversaciones uno a uno con los jugadores</p>

      <div className="admin-shell">
        <AdminNav active="chat" />

        <div className="admin-content">
      <div className="admin-filter-row">
        <button
          className={`btn-mini ${tab === 'convos' ? 'btn-mini-active' : ''}`}
          onClick={() => setTab('convos')}
        >
          Conversaciones
        </button>
        <button
          className={`btn-mini ${tab === 'questions' ? 'btn-mini-active' : ''}`}
          onClick={() => setTab('questions')}
        >
          Preguntas rápidas
        </button>
      </div>

      {tab === 'questions' ? (
        <section className="admin-section">
          <div className="achat-qq-add">
            <input
              className="chat-input"
              value={newQuestion}
              maxLength={200}
              placeholder="Nueva pregunta rápida…"
              onChange={(e) => setNewQuestion(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') addQuestion();
              }}
            />
            <button className="btn-mini btn-mini-active" onClick={addQuestion}>
              + Agregar
            </button>
          </div>
          {questions.length === 0 ? (
            <p className="admin-hint">No hay preguntas rápidas.</p>
          ) : (
            <ul className="achat-qq-list">
              {questions.map((q) => (
                <li key={q.id} className="achat-qq-item">
                  <span className={q.active ? '' : 'achat-qq-off'}>{q.question}</span>
                  <span className="admin-actions">
                    <button
                      className="btn-mini"
                      onClick={async () => {
                        try {
                          await action({
                            action: 'question_toggle',
                            id: q.id,
                            active: !q.active,
                          });
                          loadList();
                        } catch {}
                      }}
                    >
                      {q.active ? 'Activa' : 'Inactiva'}
                    </button>
                    <button
                      className="btn-mini"
                      onClick={async () => {
                        if (!confirm('¿Eliminar esta pregunta rápida?')) return;
                        try {
                          await action({ action: 'question_delete', id: q.id });
                          loadList();
                        } catch {}
                      }}
                    >
                      🗑
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : (
        <div className={`achat-layout ${selected ? 'achat-has-sel' : ''}`}>
          {/* ── Lista de conversaciones ── */}
          <div className="achat-list">
            <div className="achat-list-tools">
              <div className="admin-filter-row">
                {(['todos', 'pendiente', 'prioridad', 'resuelto'] as const).map((f) => (
                  <button
                    key={f}
                    className={`btn-mini ${filter === f ? 'btn-mini-active' : ''}`}
                    onClick={() => setFilter(f)}
                  >
                    {f === 'todos' ? 'Todos' : STATUS_LABEL[f]}
                  </button>
                ))}
              </div>
              <button
                className="btn-mini"
                onClick={() => {
                  setSearchOpen((v) => !v);
                  setSearch('');
                  setResults([]);
                }}
              >
                {searchOpen ? '✕ Cerrar' : '＋ Nuevo chat'}
              </button>
            </div>

            {searchOpen && (
              <div className="achat-search">
                <input
                  className="chat-input"
                  value={search}
                  placeholder="Buscar usuario por nombre, correo o cédula…"
                  onChange={(e) => setSearch(e.target.value)}
                  autoFocus
                />
                <div className="achat-search-results">
                  {search.trim().length < 2 ? (
                    <p className="admin-hint">Escribe al menos 2 letras.</p>
                  ) : searching ? (
                    <p className="admin-hint">Buscando…</p>
                  ) : results.length === 0 ? (
                    <p className="admin-hint">Sin resultados.</p>
                  ) : (
                    results.map((r) => (
                      <button key={r.id} className="achat-result" onClick={() => startChat(r)}>
                        <strong>{r.username || r.id.slice(0, 8)}</strong>
                        {r.email && <span>{r.email}</span>}
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}

            {visible.length === 0 ? (
              <p className="admin-hint">
                {conversations.length === 0
                  ? 'Aún no hay conversaciones.'
                  : 'No hay chats con esta etiqueta.'}
              </p>
            ) : (
              visible.map((c) => (
                <button
                  key={c.id}
                  className={`achat-conv ${selected === c.id ? 'achat-conv-sel' : ''}`}
                  onClick={() => openConversation(c.id)}
                >
                  <span className="achat-conv-top">
                    <strong className="achat-conv-name">
                      {c.username || c.email || c.player_id.slice(0, 8)}
                    </strong>
                    <span className={`achat-pill achat-pill-${c.status}`}>
                      {STATUS_LABEL[c.status]}
                    </span>
                    {c.unread > 0 && (
                      <span className="chat-fab-badge achat-unread">
                        {c.unread > 9 ? '9+' : c.unread}
                      </span>
                    )}
                  </span>
                  <span className="achat-conv-preview">{c.preview}</span>
                  <span className="achat-conv-date">{fmtDateTime(c.last_message_at)}</span>
                </button>
              ))
            )}
          </div>

          {/* ── Hilo ── */}
          <div className="achat-thread">
            {!selected ? (
              <p className="admin-hint achat-thread-empty">
                Selecciona una conversación para ver los mensajes.
              </p>
            ) : (
              <>
                <div className="achat-thread-head">
                  <button
                    className="btn-mini achat-back"
                    onClick={() => {
                      setSelected(null);
                      setThread(null);
                    }}
                  >
                    ← Volver
                  </button>
                  <div className="achat-thread-who">
                    {thread ? (
                      <button
                        className={`pchip ${showDetail ? 'pchip-open' : ''}`}
                        onClick={() => setShowDetail((v) => !v)}
                      >
                        {thread.username || thread.player_id.slice(0, 8)}{' '}
                        <span className="pchip-caret">{showDetail ? '▴' : '▾'}</span>
                      </button>
                    ) : (
                      <strong>…</strong>
                    )}
                    {thread?.email && <span>{thread.email}</span>}
                    <span>🎟️ {thread?.tickets ?? 0}</span>
                  </div>
                  <div className="achat-thread-tools">
                    <span className="admin-hint">Etiqueta:</span>
                    {(['pendiente', 'prioridad', 'resuelto'] as const).map((s) => (
                      <button
                        key={s}
                        className={`btn-mini ${thread?.status === s ? 'btn-mini-active' : ''}`}
                        onClick={() => setStatus(s)}
                      >
                        {STATUS_LABEL[s]}
                      </button>
                    ))}
                  </div>
                </div>

                {showDetail && thread && (
                  <div className="achat-detail">
                    <PlayerDetail
                      playerId={thread.player_id}
                      username={thread.username}
                      onChanged={() => loadThread(thread.id)}
                      onDeleted={() => {
                        setShowDetail(false);
                        setSelected(null);
                        setThread(null);
                        loadList();
                      }}
                    />
                  </div>
                )}

                <div className="chat-msgs achat-msgs">
                  {messages.map((m) => (
                    <div
                      key={m.id}
                      className={`chat-msg ${m.sender === 'support' ? 'chat-msg-own' : 'chat-msg-support'}`}
                    >
                      {m.attachment_path && (
                        <ChatAttachment
                          path={m.attachment_path}
                          name={m.attachment_name}
                          type={m.attachment_type}
                        />
                      )}
                      {m.body && <p className="chat-msg-text">{m.body}</p>}
                      <span className="chat-msg-time">{fmtTime(m.created_at)}</span>
                    </div>
                  ))}
                  <div ref={bottomRef} />
                </div>

                {notice && <p className="chat-notice">{notice}</p>}

                <div className="chat-composer">
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*,application/pdf"
                    hidden
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) sendFile(f);
                      e.target.value = '';
                    }}
                  />
                  <button
                    type="button"
                    className="chat-icon-btn"
                    onClick={() => fileRef.current?.click()}
                    disabled={uploading || sending}
                    aria-label="Adjuntar imagen o PDF"
                  >
                    {uploading ? '…' : '📎'}
                  </button>
                  <AudioRecorder
                    disabled={uploading || sending}
                    onRecorded={sendFile}
                    onError={setNotice}
                  />
                  <input
                    className="chat-input"
                    type="text"
                    value={text}
                    maxLength={2000}
                    placeholder="Escribe tu respuesta…"
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') sendText();
                    }}
                  />
                  <button
                    type="button"
                    className="btn-mini btn-mini-active"
                    onClick={sendText}
                    disabled={!text.trim() || sending}
                  >
                    Enviar
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
        </div>
      </div>
    </main>
  );
}
