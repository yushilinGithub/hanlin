"use client";

import { Plus, Search, Settings } from "lucide-react";
import { useChatStore } from "@/lib/store";
import { cn } from "@/lib/utils";

interface QuickActionsProps {
  onNavigate?: () => void;
}

export function QuickActions({ onNavigate }: QuickActionsProps = {}) {
  const { createConversation, openSearch, openSettings } = useChatStore();

  const actions = [
    {
      icon: Plus,
      label: "New chat",
      onClick: () => {
        createConversation();
        onNavigate?.();
      },
      primary: true,
    },
    { icon: Search, label: "Search", onClick: openSearch, primary: false },
    {
      icon: Settings,
      label: "Settings",
      onClick: () => {
        openSettings();
        onNavigate?.();
      },
      primary: false,
    },
  ];

  return (
    <div className="flex-shrink-0 border-t border-surface-800 p-2 flex items-center gap-1">
      {actions.map(({ icon: Icon, label, onClick, primary }) => (
        <button
          key={label}
          onClick={onClick}
          title={label}
          aria-label={label}
          className={cn(
            "flex items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-medium transition-colors",
            primary
              ? "flex-1 bg-brand-500 text-white hover:bg-brand-400"
              : "px-2 text-surface-500 hover:text-surface-300 hover:bg-surface-800/60"
          )}
        >
          <Icon className="w-3.5 h-3.5 flex-shrink-0" aria-hidden="true" />
          {primary && <span>{label}</span>}
        </button>
      ))}
    </div>
  );
}
