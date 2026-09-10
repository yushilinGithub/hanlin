"use client";

import { useMemo, useState } from "react";
import { Pin, Search, Trash2, X } from "lucide-react";
import { useChatStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import type { Conversation } from "@/lib/types";

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(ts).toLocaleDateString();
}

function preview(c: Conversation): string {
  const last = c.messages[c.messages.length - 1];
  if (!last) return "No messages yet";
  const text = typeof last.content === "string" ? last.content : "";
  return text.slice(0, 80).replace(/\s+/g, " ").trim() || "No messages yet";
}

interface ChatHistoryProps {
  onNavigate?: () => void;
}

export function ChatHistory({ onNavigate }: ChatHistoryProps = {}) {
  const {
    conversations,
    activeConversationId,
    pinnedIds,
    searchQuery,
    setSearchQuery,
    setActiveConversation,
    deleteConversation,
    pinConversation,
  } = useChatStore();

  const [confirmId, setConfirmId] = useState<string | null>(null);

  const { pinned, rest } = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const matches = q
      ? conversations.filter((c) => c.title.toLowerCase().includes(q))
      : conversations;
    const sorted = [...matches].sort((a, b) => b.updatedAt - a.updatedAt);
    return {
      pinned: sorted.filter((c) => pinnedIds.includes(c.id)),
      rest: sorted.filter((c) => !pinnedIds.includes(c.id)),
    };
  }, [conversations, pinnedIds, searchQuery]);

  const renderItem = (c: Conversation) => {
    const isActive = c.id === activeConversationId;
    const isPinned = pinnedIds.includes(c.id);
    return (
      <li key={c.id}>
        <div
          className={cn(
            "group relative rounded-md px-2.5 py-2 cursor-pointer transition-colors",
            isActive ? "bg-surface-800" : "hover:bg-surface-800/60"
          )}
          onClick={() => {
            setActiveConversation(c.id);
            onNavigate?.();
          }}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              setActiveConversation(c.id);
              onNavigate?.();
            }
          }}
        >
          <div className="flex items-center gap-1.5">
            {isPinned && <Pin className="w-3 h-3 text-brand-400 flex-shrink-0" aria-hidden="true" />}
            <span
              className={cn(
                "flex-1 min-w-0 truncate text-xs font-medium",
                isActive ? "text-surface-100" : "text-surface-300"
              )}
            >
              {c.title}
            </span>
            <span className="text-[10px] text-surface-500 flex-shrink-0">
              {relativeTime(c.updatedAt)}
            </span>
          </div>
          <p className="mt-0.5 truncate text-[11px] text-surface-500">{preview(c)}</p>

          <div
            className="absolute right-1.5 top-1.5 hidden group-hover:flex items-center gap-0.5"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => pinConversation(c.id)}
              title={isPinned ? "Unpin" : "Pin"}
              aria-label={isPinned ? "Unpin conversation" : "Pin conversation"}
              className="p-1 rounded bg-surface-900/90 text-surface-500 hover:text-brand-400 transition-colors"
            >
              <Pin className="w-3 h-3" />
            </button>
            <button
              onClick={() => setConfirmId(c.id)}
              title="Delete"
              aria-label="Delete conversation"
              className="p-1 rounded bg-surface-900/90 text-surface-500 hover:text-red-400 transition-colors"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        </div>

        {confirmId === c.id && (
          <div className="mx-2.5 mb-1 mt-1 rounded-md border border-red-900/50 bg-red-950/30 px-2 py-1.5">
            <p className="text-[11px] text-red-300">Delete this conversation?</p>
            <div className="mt-1 flex gap-1.5">
              <button
                onClick={() => {
                  deleteConversation(c.id);
                  setConfirmId(null);
                }}
                className="rounded bg-red-600 px-2 py-0.5 text-[10px] font-medium text-white hover:bg-red-500"
              >
                Delete
              </button>
              <button
                onClick={() => setConfirmId(null)}
                className="rounded bg-surface-800 px-2 py-0.5 text-[10px] text-surface-300 hover:bg-surface-700"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </li>
    );
  };

  return (
    <div className="flex flex-col min-h-0 flex-1">
      <div className="px-2.5 py-2 flex-shrink-0">
        <div className="relative">
          <Search
            className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-surface-500"
            aria-hidden="true"
          />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search conversations"
            aria-label="Search conversations"
            className={cn(
              "w-full rounded-md border border-surface-700 bg-surface-800",
              "pl-7 pr-7 py-1.5 text-xs text-surface-200 placeholder:text-surface-500",
              "focus:outline-none focus:border-brand-500"
            )}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-surface-500 hover:text-surface-300"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-1.5 pb-2">
        {pinned.length === 0 && rest.length === 0 && (
          <p className="px-2 py-6 text-center text-[11px] text-surface-500">
            {searchQuery ? "No matching conversations" : "No conversations yet"}
          </p>
        )}

        {pinned.length > 0 && (
          <>
            <p className="px-2 pt-1 pb-1 text-[10px] font-semibold uppercase tracking-wide text-surface-500">
              Pinned
            </p>
            <ul className="space-y-0.5">{pinned.map(renderItem)}</ul>
          </>
        )}

        {rest.length > 0 && (
          <>
            {pinned.length > 0 && (
              <p className="px-2 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wide text-surface-500">
                Recent
              </p>
            )}
            <ul className="space-y-0.5">{rest.map(renderItem)}</ul>
          </>
        )}
      </div>
    </div>
  );
}
