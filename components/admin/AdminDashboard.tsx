'use client';

import { TooltipProvider } from '@/components/ui/tooltip';
import {
  Shield,
  BarChart3,
} from 'lucide-react';

// Import section components
import { AdminSection } from './sections/AdminSection';
import { StatsSection } from './sections/StatsSection';

// Section navigation items
const sections = [
  { id: 'admin', label: 'Admin', icon: Shield },
  { id: 'stats', label: 'Statistics', icon: BarChart3 },
];

export function AdminDashboard() {

  return (
    <TooltipProvider>
      <div className="space-y-6">
        {/* Section Navigation */}
        <nav className="sticky top-0 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 pb-4 -mx-4 px-4 border-b flex gap-1 flex-wrap">
          {sections.map((section) => {
            const Icon = section.icon;
            return (
              <a
                key={section.id}
                href={`#${section.id}`}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
              >
                <Icon className="h-3.5 w-3.5" />
                <span>{section.label}</span>
              </a>
            );
          })}
        </nav>

        {/* ============================================ */}
        {/* ADMIN SECTION - First Priority              */}
        {/* Shows all data (no time filtering)          */}
        {/* ============================================ */}
        <AdminSection />

        {/* ============================================ */}
        {/* STATS SECTION - Analytics & Metrics         */}
        {/* Has its own time range selector            */}
        {/* ============================================ */}
        <StatsSection />
      </div>
    </TooltipProvider>
  );
}
