import React from 'react';
import { Compass, Trophy, History } from 'lucide-react';
import type { CrawlConfig, CrawlProgress, HistorySummary, PaperNode } from '../types/graph';
import { CrawlForm } from './CrawlForm';
import { RankingPanel } from './RankingPanel';
import { HistoryPanel } from './HistoryPanel';

export type SidebarTab = 'crawl' | 'ranking' | 'history';

interface CrawlSidebarProps {
  activeTab: SidebarTab;
  onTabChange: (tab: SidebarTab) => void;
  config: CrawlConfig;
  isCrawling: boolean;
  progress: CrawlProgress | null;
  errorMsg: string | null;
  onConfigChange: (next: CrawlConfig) => void;
  onStartCrawl: () => void;
  onStopCrawl: () => void;
  nodes: PaperNode[];
  selectedDoi: string | null;
  onSelectNode: (node: PaperNode) => void;
  historyItems: HistorySummary[];
  historyLoading: boolean;
  onRefreshHistory: () => void;
  onLoadHistory: (id: string) => void;
  onDeleteHistory: (id: string) => void;
}

export const CrawlSidebar: React.FC<CrawlSidebarProps> = ({
  activeTab,
  onTabChange,
  config,
  isCrawling,
  progress,
  errorMsg,
  onConfigChange,
  onStartCrawl,
  onStopCrawl,
  nodes,
  selectedDoi,
  onSelectNode,
  historyItems,
  historyLoading,
  onRefreshHistory,
  onLoadHistory,
  onDeleteHistory,
}) => {
  const tabs: { id: SidebarTab; label: string; icon: React.ReactNode; badge?: number }[] = [
    { id: 'crawl', label: 'Crawl', icon: <Compass className="w-3.5 h-3.5" /> },
    {
      id: 'ranking',
      label: 'Ranking',
      icon: <Trophy className="w-3.5 h-3.5" />,
      badge: nodes.length || undefined,
    },
    {
      id: 'history',
      label: 'Riwayat',
      icon: <History className="w-3.5 h-3.5" />,
      badge: historyItems.length || undefined,
    },
  ];

  return (
    <aside className="w-80 lg:w-96 shrink-0 border-r border-slate-800 bg-slate-900/75 flex flex-col h-full overflow-hidden">
      <div className="grid grid-cols-3 border-b border-slate-800 bg-slate-950/60 p-1 gap-1 shrink-0">
        {tabs.map((tab) => {
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onTabChange(tab.id)}
              className={`flex items-center justify-center gap-1.5 py-2 px-2 rounded-md text-xs font-medium transition-colors ${
                active
                  ? 'bg-slate-800 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
            >
              {tab.icon}
              <span>{tab.label}</span>
              {tab.badge !== undefined && (
                <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-slate-700/80 text-slate-200">
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="flex-1 min-h-0 overflow-hidden">
        {activeTab === 'crawl' && (
          <CrawlForm
            config={config}
            isCrawling={isCrawling}
            progress={progress}
            errorMsg={errorMsg}
            onChange={onConfigChange}
            onStart={onStartCrawl}
            onStop={onStopCrawl}
          />
        )}
        {activeTab === 'ranking' && (
          <RankingPanel
            nodes={nodes}
            selectedDoi={selectedDoi}
            onSelectNode={onSelectNode}
          />
        )}
        {activeTab === 'history' && (
          <HistoryPanel
            items={historyItems}
            loading={historyLoading}
            onRefresh={onRefreshHistory}
            onLoadItem={onLoadHistory}
            onDeleteItem={onDeleteHistory}
          />
        )}
      </div>
    </aside>
  );
};
