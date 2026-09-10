"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronDown, ChevronRight, File, Folder, RefreshCw } from "lucide-react";
import { fileAPI } from "@/lib/api/files";
import { useFileViewerStore } from "@/lib/fileViewerStore";
import { cn } from "@/lib/utils";
import type { FileEntry } from "@/lib/api/types";

const ROOT = "";

interface NodeProps {
  entry: FileEntry;
  depth: number;
  onNavigate?: () => void;
}

function TreeNode({ entry, depth, onNavigate }: NodeProps) {
  const loadAndOpen = useFileViewerStore((s) => s.loadAndOpen);
  const [expanded, setExpanded] = useState(false);
  const [children, setChildren] = useState<FileEntry[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = useCallback(async () => {
    if (entry.type === "file") {
      void loadAndOpen(entry.path);
      onNavigate?.();
      return;
    }
    const next = !expanded;
    setExpanded(next);
    if (next && children === null) {
      setLoading(true);
      setError(null);
      try {
        setChildren(await fileAPI.list(entry.path));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load");
      } finally {
        setLoading(false);
      }
    }
  }, [entry, expanded, children, loadAndOpen, onNavigate]);

  const isDir = entry.type === "directory";

  return (
    <li>
      <button
        onClick={toggle}
        style={{ paddingLeft: 8 + depth * 12 }}
        className={cn(
          "w-full flex items-center gap-1.5 pr-2 py-1 rounded text-left",
          "text-xs text-surface-300 hover:bg-surface-800/60 hover:text-surface-100 transition-colors"
        )}
        aria-expanded={isDir ? expanded : undefined}
      >
        {isDir ? (
          expanded ? (
            <ChevronDown className="w-3 h-3 flex-shrink-0 text-surface-500" aria-hidden="true" />
          ) : (
            <ChevronRight className="w-3 h-3 flex-shrink-0 text-surface-500" aria-hidden="true" />
          )
        ) : (
          <span className="w-3 flex-shrink-0" aria-hidden="true" />
        )}
        {isDir ? (
          <Folder className="w-3.5 h-3.5 flex-shrink-0 text-brand-400" aria-hidden="true" />
        ) : (
          <File className="w-3.5 h-3.5 flex-shrink-0 text-surface-500" aria-hidden="true" />
        )}
        <span className="truncate">{entry.name}</span>
      </button>

      {isDir && expanded && (
        <>
          {loading && (
            <p style={{ paddingLeft: 20 + depth * 12 }} className="py-1 text-[11px] text-surface-500">
              Loading…
            </p>
          )}
          {error && (
            <p style={{ paddingLeft: 20 + depth * 12 }} className="py-1 text-[11px] text-red-400">
              {error}
            </p>
          )}
          {children && children.length === 0 && !loading && (
            <p style={{ paddingLeft: 20 + depth * 12 }} className="py-1 text-[11px] text-surface-500">
              Empty
            </p>
          )}
          {children && children.length > 0 && (
            <ul>
              {children.map((child) => (
                <TreeNode key={child.path} entry={child} depth={depth + 1} onNavigate={onNavigate} />
              ))}
            </ul>
          )}
        </>
      )}
    </li>
  );
}

interface FileExplorerProps {
  onNavigate?: () => void;
}

export function FileExplorer({ onNavigate }: FileExplorerProps = {}) {
  const [entries, setEntries] = useState<FileEntry[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setEntries(await fileAPI.list(ROOT));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load files");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="flex flex-col min-h-0 flex-1">
      <div className="flex items-center justify-between px-3 py-2 flex-shrink-0">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-surface-500">
          Files
        </span>
        <button
          onClick={load}
          disabled={loading}
          title="Refresh"
          aria-label="Refresh file list"
          className="p-1 rounded text-surface-500 hover:text-surface-300 hover:bg-surface-800/60 transition-colors disabled:opacity-40"
        >
          <RefreshCw className={cn("w-3 h-3", loading && "animate-spin")} />
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto pb-2">
        {error && <p className="px-3 py-2 text-[11px] text-red-400">{error}</p>}
        {!error && entries && entries.length === 0 && !loading && (
          <p className="px-3 py-6 text-center text-[11px] text-surface-500">No files</p>
        )}
        {entries && entries.length > 0 && (
          <ul>
            {entries.map((entry) => (
              <TreeNode key={entry.path} entry={entry} depth={0} onNavigate={onNavigate} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
