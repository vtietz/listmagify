'use client';

import {
  Activity,
  BarChart3,
  Calendar,
  MessageSquare,
  Shield,
  Sparkles,
  RefreshCw,
  Globe,
  Trophy,
  Users,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { TooltipProvider } from '@/components/ui/tooltip';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { AuthenticationStatsCard } from './cards/AuthenticationStatsCard';
import { FeedbackStatsCard } from './cards/FeedbackStatsCard';
import { ErrorReportsCard } from './cards/ErrorReportsCard';
import { AccessRequestsCard } from './cards/AccessRequestsCard';
import { TrafficStatsCard } from './cards/TrafficStatsCard';
import {
  OverviewSection,
  ActivitySection,
  UsersSection,
  RankingsSection,
  RecsSection,
} from './StatsDashboardSections';
import type { StatsDashboardViewProps, TimeRange } from './types';

const sections = [
  { id: 'overview', label: 'Overview', icon: BarChart3 },
  { id: 'activity', label: 'Activity', icon: Activity },
  { id: 'users', label: 'Users', icon: Users },
  { id: 'traffic', label: 'Traffic', icon: Globe },
  { id: 'rankings', label: 'Rankings', icon: Trophy },
  { id: 'feedback', label: 'Feedback', icon: MessageSquare },
  { id: 'auth', label: 'Authentication', icon: Shield },
  { id: 'recs', label: 'Recommendations', icon: Sparkles },
] as const;

const timeRanges: { value: TimeRange; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: '7d', label: '7 Days' },
  { value: '30d', label: '30 Days' },
  { value: '90d', label: '90 Days' },
  { value: 'ytd', label: 'YTD' },
  { value: 'all', label: 'All Time' },
];

export function StatsDashboardView({
  timeRange,
  onTimeRangeChange,
  onRefresh,
  isRefreshing,
  dateRange,
  kpis,
  overviewData,
  overviewLoading,
  events,
  eventsLoading,
  recsData,
  recsLoading,
  registrationsLoading,
  registrationsData,
  feedbackSummaryLoading,
  feedbackSummary,
  errorReportsSummaryLoading,
  errorReportsSummary,
  errorReportsResolvedSummary,
  accessRequestsSummaryLoading,
  accessRequestsSummary,
  accessRequestsApprovedSummary,
}: StatsDashboardViewProps) {
  return (
    <TooltipProvider>
      <div className="space-y-6">
        <div className="sticky top-0 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 pb-4 -mx-4 px-4 border-b">
          <div className="flex items-center gap-2 mb-3">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Time Range:</span>
            <div className="md:hidden flex-1" suppressHydrationWarning>
              <Select value={timeRange} onValueChange={(value: string) => onTimeRangeChange(value as TimeRange)}>
                <SelectTrigger className="h-8 w-full" suppressHydrationWarning>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {timeRanges.map((r) => (
                    <SelectItem key={r.value} value={r.value}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="hidden md:flex gap-1 flex-1">
              {timeRanges.map((r) => (
                <Button
                  key={r.value}
                  variant={timeRange === r.value ? 'secondary' : 'ghost'}
                  size="sm"
                  onClick={() => onTimeRangeChange(r.value)}
                >
                  {r.label}
                </Button>
              ))}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={onRefresh}
              disabled={isRefreshing}
              className="ml-auto md:ml-0"
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Refresh</span>
            </Button>
          </div>

          <nav className="flex gap-1 flex-wrap">
            {sections.map((section) => {
              const Icon = section.icon;
              return (
                <a
                  key={section.id}
                  href={`#${section.id}`}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                >
                  <Icon className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">{section.label}</span>
                </a>
              );
            })}
          </nav>
        </div>

        <OverviewSection
          overviewLoading={overviewLoading}
          recsLoading={recsLoading}
          feedbackSummaryLoading={feedbackSummaryLoading}
          errorReportsSummaryLoading={errorReportsSummaryLoading}
          accessRequestsSummaryLoading={accessRequestsSummaryLoading}
          kpis={kpis}
          recsData={recsData}
          overviewData={overviewData}
          feedbackSummary={feedbackSummary}
          errorReportsSummary={errorReportsSummary}
          errorReportsResolvedSummary={errorReportsResolvedSummary}
          accessRequestsSummary={accessRequestsSummary}
          accessRequestsApprovedSummary={accessRequestsApprovedSummary}
          dateRange={dateRange}
        />

        <ActivitySection events={events} eventsLoading={eventsLoading} />

        <UsersSection
          events={events}
          eventsLoading={eventsLoading}
          registrationsLoading={registrationsLoading}
          registrationsData={registrationsData}
          dateRange={dateRange}
        />

        <RankingsSection events={events} eventsLoading={eventsLoading} dateRange={dateRange} />

        <section id="traffic" className="scroll-mt-28">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Globe className="h-5 w-5" />
            Traffic Analytics
          </h2>
          <div className="space-y-4">
            <TrafficStatsCard dateRange={dateRange} />
          </div>
        </section>

        <section id="feedback" className="scroll-mt-28">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            Feedback &amp; Reports
          </h2>
          <div className="space-y-4">
            <FeedbackStatsCard dateRange={dateRange} isLoading={overviewLoading} />
            <ErrorReportsCard dateRange={dateRange} />
          </div>
        </section>

        <section id="auth" className="scroll-mt-28">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Authentication &amp; Access
          </h2>
          <div className="space-y-4">
            <AuthenticationStatsCard dateRange={dateRange} />
            <AccessRequestsCard />
          </div>
        </section>

        <RecsSection recsData={recsData} recsLoading={recsLoading} />
      </div>
    </TooltipProvider>
  );
}
