"use client";

import { useState } from "react";
import { Check, CornerDownRight, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { canAddAnnotations } from "@/lib/collaboration/permissions";
import { useCollaborationContextOptional } from "./CollaborationProvider";
import type { CollabAnnotation } from "@/lib/collaboration/types";

interface AnnotationThreadProps {
  messageId: string;
  onClose: () => void;
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function AnnotationThread({ messageId, onClose }: AnnotationThreadProps) {
  const ctx = useCollaborationContextOptional();
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  if (!ctx) return null;

  const annotations = ctx.annotations[messageId] ?? [];
  const canReply = ctx.myRole !== null && canAddAnnotations(ctx.myRole);

  const submitReply = (annotationId: string) => {
    const text = draft.trim();
    if (!text) return;
    ctx.replyAnnotation(annotationId, text);
    setDraft("");
    setReplyingTo(null);
  };

  return (
    <div
      className={cn(
        "rounded-lg border border-surface-700 bg-surface-900 shadow-xl",
        "max-h-96 overflow-y-auto"
      )}
      role="dialog"
      aria-label="Comment thread"
    >
      <div className="flex items-center justify-between px-3 py-2 border-b border-surface-800 sticky top-0 bg-surface-900">
        <span className="text-xs font-semibold text-surface-200">
          {annotations.length} comment{annotations.length !== 1 ? "s" : ""}
        </span>
        <button
          onClick={onClose}
          aria-label="Close thread"
          className="p-0.5 rounded text-surface-500 hover:text-surface-300 hover:bg-surface-800 transition-colors"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <ul className="divide-y divide-surface-800">
        {annotations.map((a: CollabAnnotation) => (
          <li key={a.id} className={cn("px-3 py-2.5", a.resolved && "opacity-60")}>
            <div className="flex items-start gap-2">
              <span
                className="mt-1 w-2 h-2 rounded-full flex-shrink-0"
                style={{ backgroundColor: a.author.color }}
                aria-hidden="true"
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <span className="text-xs font-medium text-surface-200 truncate">
                    {a.author.name}
                  </span>
                  <span className="text-[10px] text-surface-500">{formatTime(a.createdAt)}</span>
                </div>
                <p className="text-xs text-surface-300 whitespace-pre-wrap break-words mt-0.5">
                  {a.text}
                </p>

                {a.replies.length > 0 && (
                  <ul className="mt-2 space-y-1.5 border-l border-surface-800 pl-2">
                    {a.replies.map((r) => (
                      <li key={r.id}>
                        <div className="flex items-baseline gap-2">
                          <span className="text-[11px] font-medium text-surface-300 truncate">
                            {r.author.name}
                          </span>
                          <span className="text-[10px] text-surface-500">
                            {formatTime(r.createdAt)}
                          </span>
                        </div>
                        <p className="text-[11px] text-surface-400 whitespace-pre-wrap break-words">
                          {r.text}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}

                <div className="flex items-center gap-2 mt-1.5">
                  {canReply && (
                    <button
                      onClick={() => {
                        setReplyingTo(replyingTo === a.id ? null : a.id);
                        setDraft("");
                      }}
                      className="flex items-center gap-1 text-[10px] text-surface-500 hover:text-surface-300 transition-colors"
                    >
                      <CornerDownRight className="w-3 h-3" />
                      Reply
                    </button>
                  )}
                  <button
                    onClick={() => ctx.resolveAnnotation(a.id, !a.resolved)}
                    className={cn(
                      "flex items-center gap-1 text-[10px] transition-colors",
                      a.resolved
                        ? "text-emerald-400 hover:text-emerald-300"
                        : "text-surface-500 hover:text-surface-300"
                    )}
                  >
                    <Check className="w-3 h-3" />
                    {a.resolved ? "Resolved" : "Resolve"}
                  </button>
                </div>

                {replyingTo === a.id && (
                  <div className="mt-2 flex gap-1.5">
                    <input
                      autoFocus
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          submitReply(a.id);
                        }
                        if (e.key === "Escape") setReplyingTo(null);
                      }}
                      placeholder="Reply…"
                      aria-label="Reply to comment"
                      className={cn(
                        "flex-1 min-w-0 rounded border border-surface-700 bg-surface-800",
                        "px-2 py-1 text-[11px] text-surface-200 placeholder:text-surface-500",
                        "focus:outline-none focus:border-brand-500"
                      )}
                    />
                    <button
                      onClick={() => submitReply(a.id)}
                      disabled={!draft.trim()}
                      className={cn(
                        "px-2 py-1 rounded text-[11px] font-medium transition-colors",
                        "bg-brand-500 text-white hover:bg-brand-400",
                        "disabled:opacity-40 disabled:cursor-not-allowed"
                      )}
                    >
                      Send
                    </button>
                  </div>
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
