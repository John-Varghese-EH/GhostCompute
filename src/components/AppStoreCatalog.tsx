import React, { useState, useEffect, useMemo } from 'react';
import { Icon } from './common/Icon';
import {
  listRecipes,
  getServiceStates,
  installAndRunService,
  stopService,
  refreshServiceStatus,
  getServiceLogs,
  ServiceRecipe,
  ServiceState,
  ToolCategory
} from '../lib/tauri';
import { Badge } from './common/Badge';
import { Button } from './common/Button';
import { IconBadge } from './common/IconBadge';

const getToolIconMeta = (recipeId: string, _category?: ToolCategory) => {
  switch (recipeId) {
    case 'ollama':
      return { icon: <Icon name="memory" size={20} />, variant: 'accent' as const };
    case 'lm-studio':
      return { icon: <Icon name="layers" size={20} />, variant: 'accent' as const };
    case 'jan':
      return { icon: <Icon name="chat" size={20} />, variant: 'accent' as const };
    case 'open-webui':
      return { icon: <Icon name="public" size={20} />, variant: 'blue' as const };
    case 'anythingllm':
      return { icon: <Icon name="psychology" size={20} />, variant: 'blue' as const };
    case 'comfyui':
      return { icon: <Icon name="image" size={20} />, variant: 'rose' as const };
    case 'whisper':
      return { icon: <Icon name="mic" size={20} />, variant: 'rose' as const };
    case 'n8n':
      return { icon: <Icon name="bolt" size={20} />, variant: 'amber' as const };
    case 'dify':
      return { icon: <Icon name="widgets" size={20} />, variant: 'amber' as const };
    case 'activepieces':
      return { icon: <Icon name="extension" size={20} />, variant: 'amber' as const };
    case 'flowise':
      return { icon: <Icon name="share" size={20} />, variant: 'amber' as const };
    case 'langflow':
      return { icon: <Icon name="hub" size={20} />, variant: 'amber' as const };
    case 'open-interpreter':
      return { icon: <Icon name="terminal" size={20} />, variant: 'amber' as const };
    case 'tabby':
      return { icon: <Icon name="code" size={20} />, variant: 'emerald' as const };
    case 'twinny':
      return { icon: <Icon name="description" size={20} />, variant: 'emerald' as const };
    case 'qdrant':
      return { icon: <Icon name="database" size={20} />, variant: 'emerald' as const };
    default:
      return { icon: <Icon name="memory" size={20} />, variant: 'neutral' as const };
  }
};

const CATEGORIES: { id: ToolCategory | 'all'; label: string }[] = [
  { id: 'all', label: 'All 16 Tools' },
  { id: 'llm_engine', label: 'LLM Engines' },
  { id: 'ai_chat', label: 'AI Chat & RAG' },
  { id: 'media_generation', label: 'Media & Voice' },
  { id: 'workflow_automation', label: 'Workflows & Agents' },
  { id: 'coding_assistant', label: 'Coding & Vector DBs' },
];

export const AppStoreCatalog: React.FC = () => {
  const [recipes, setRecipes] = useState<ServiceRecipe[]>([]);
  const [states, setStates] = useState<Record<string, ServiceState>>({});
  const [selectedCategory, setSelectedCategory] = useState<ToolCategory | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [selectedLogs, setSelectedLogs] = useState<{ id: string; name: string; content: string } | null>(null);

  const loadData = async () => {
    try {
      const [r, s] = await Promise.all([listRecipes(), getServiceStates()]);
      setRecipes(r);
      const stateMap: Record<string, ServiceState> = {};
      s.forEach(item => {
        stateMap[item.recipe_id] = item;
      });
      setStates(stateMap);
    } catch (e) {
      console.error('Failed to load catalog data:', e);
    }
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 4000);
    return () => clearInterval(interval);
  }, []);

  const handleInstallAndRun = async (recipeId: string) => {
    setLoadingAction(recipeId);
    try {
      await installAndRunService(recipeId);
      await refreshServiceStatus(recipeId);
      await loadData();
    } catch (e) {
      alert(`Failed to launch tool: ${e}`);
    } finally {
      setLoadingAction(null);
    }
  };

  const handleStop = async (recipeId: string) => {
    setLoadingAction(recipeId);
    try {
      await stopService(recipeId);
      await refreshServiceStatus(recipeId);
      await loadData();
    } catch (e) {
      alert(`Failed to stop tool: ${e}`);
    } finally {
      setLoadingAction(null);
    }
  };

  const handleViewLogs = async (recipe: ServiceRecipe) => {
    try {
      const logs = await getServiceLogs(recipe.id, 150);
      setSelectedLogs({
        id: recipe.id,
        name: recipe.name,
        content: logs || 'No logs recorded yet.',
      });
    } catch (e) {
      alert(`Failed to fetch logs: ${e}`);
    }
  };

  const filteredRecipes = useMemo(() => {
    return recipes.filter(r => {
      const matchesCat = selectedCategory === 'all' || r.category === selectedCategory;
      const matchesSearch = searchQuery === '' || 
        r.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        r.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        r.id.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesCat && matchesSearch;
    });
  }, [recipes, selectedCategory, searchQuery]);

  return (
    <div className="flex flex-col gap-6 animate-fade-in">
      
      {/* Header Bar */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 pb-4 border-b border-[var(--gc-border)]">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold tracking-tight text-[var(--gc-text)] flex items-center gap-2">
              <span>One-Click App Store</span>
            </h2>
            <span 
              className="text-[10px] font-mono px-2.5 py-0.5 rounded-[var(--gc-squircle-badge)] bg-violet-500/20 text-violet-400 border border-violet-500/30 uppercase tracking-widest font-semibold whitespace-nowrap shrink-0"
              style={{ borderRadius: 'var(--gc-squircle-badge)' }}
            >
              16 Verified Recipes
            </span>
          </div>
          <p className="text-xs text-[var(--gc-text-muted)] mt-1">
            Deploy local inference engines, AI agents, and workflows directly to your host GPU with automatic tunneling.
          </p>
        </div>

        {/* Search & Actions */}
        <div className="flex items-center gap-2 w-full md:w-auto">
          <div className="relative flex-1 md:w-64">
            <Icon name="search" size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--gc-text-muted)]" />
            <input
              type="text"
              placeholder="Search tools & models..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg bg-[var(--gc-surface-sunken)] border border-[var(--gc-border)] text-[var(--gc-text)] placeholder:text-[var(--gc-text-muted)] focus:outline-none focus:border-violet-500 transition-colors"
            />
          </div>
          <Button 
            size="sm" 
            variant="ghost" 
            onClick={loadData} 
            className="flex items-center gap-1.5 text-xs text-[var(--gc-text-muted)] hover:text-[var(--gc-text)] shrink-0"
          >
            <Icon name="refresh" size={13} />
            <span>Refresh</span>
          </Button>
        </div>
      </div>

      {/* Category Pills (Fluid Segmented Control with G2/G3 Curvature) */}
      <div className="flex flex-wrap items-center gap-1.5 bg-[var(--gc-surface-sunken)] p-1.5 rounded-2xl border border-[var(--gc-border)] w-fit">
        {CATEGORIES.map(cat => (
          <button
            key={cat.id}
            onClick={() => setSelectedCategory(cat.id)}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all duration-200 cursor-pointer ease-[cubic-bezier(0.32,0.72,0,1)] ${
              selectedCategory === cat.id
                ? 'bg-violet-600 text-white shadow-md shadow-violet-600/30 scale-[1.02]'
                : 'text-[var(--gc-text-muted)] hover:text-[var(--gc-text)] hover:bg-[var(--gc-border)]'
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Grid of Tools (Double-Bezel Architecture with G2 Continuous Curvature) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredRecipes.map(recipe => {
          const state = states[recipe.id];
          const isRunning = state?.status === 'running';
          const isStarting = state?.status === 'starting';
          const isError = state?.status === 'error';
          const isLoading = loadingAction === recipe.id;

          const primaryPort = recipe.ports[0]?.host_port;

          return (
            <div
              key={recipe.id}
              className={`double-bezel group transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:-translate-y-0.5 ${
                isRunning ? 'border-violet-500/40 shadow-[0_0_24px_rgba(139,92,246,0.15)]' : 'border-[var(--gc-border)] hover:border-violet-500/30'
              }`}
            >
              <div className="double-bezel-inner h-full flex flex-col justify-between p-4.5 bg-[var(--gc-surface)]">
                
                <div>
                  {/* Card Header: Icon, Name, Badge */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      {(() => {
                        const meta = getToolIconMeta(recipe.id, recipe.category);
                        return (
                          <IconBadge 
                            icon={meta.icon} 
                            variant={meta.variant} 
                            size="md" 
                            glow={isRunning} 
                            className="group-hover:scale-105"
                          />
                        );
                      })()}
                      <div>
                        <h3 className="text-sm font-bold text-[var(--gc-text)] group-hover:text-accent transition-colors tracking-tight">
                          {recipe.name}
                        </h3>
                        <div className="text-[11px] text-[var(--gc-text-muted)] font-mono mt-0.5 capitalize flex items-center gap-1.5">
                          <span>{recipe.deployment.replace('_', ' ')}</span>
                          {recipe.deployment === 'native_binary' && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded-[var(--gc-radius-squircle-sm)] bg-violet-500/20 text-violet-400 border border-violet-500/30 uppercase font-semibold whitespace-nowrap shrink-0">
                              Bare Metal
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <Badge
                      variant={
                        isRunning ? 'success' : isStarting ? 'warning' : isError ? 'danger' : 'neutral'
                      }
                    >
                      {isRunning ? 'Running' : isStarting ? 'Starting' : isError ? 'Error' : 'Ready'}
                    </Badge>
                  </div>

                  {/* Description */}
                  <p className="text-xs text-[var(--gc-text-muted)] mt-3 line-clamp-2 leading-relaxed">
                    {recipe.description}
                  </p>

                  {/* Badges / Hardware Specs */}
                  <div className="flex flex-wrap items-center gap-1.5 mt-3 text-[10px] text-[var(--gc-text-muted)] font-mono">
                    {primaryPort && (
                      <span className="px-2 py-0.5 rounded-md bg-[var(--gc-surface-sunken)] border border-[var(--gc-border)] text-[var(--gc-text)]">
                        :{primaryPort}
                      </span>
                    )}
                    {recipe.gpu.required && (
                      <span className="px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-500 border border-amber-500/20 flex items-center gap-1 font-semibold">
                        <Icon name="memory" size={11} /> {recipe.gpu.recommended_vram_mb / 1024}GB VRAM
                      </span>
                    )}
                    {recipe.web_ui && (
                      <span className="px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 font-semibold flex items-center gap-1">
                        <Icon name="public" size={11} /> Web UI
                      </span>
                    )}
                  </div>
                </div>

                {/* Bottom Actions: Logs, External Link & Launch/Stop */}
                <div className="flex items-center justify-between gap-2 mt-4 pt-3.5 border-t border-[var(--gc-border)]">
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleViewLogs(recipe)}
                      title="View Container / Engine Logs"
                      className="p-1.5 rounded-lg hover:bg-[var(--gc-border)] text-[var(--gc-text-muted)] hover:text-[var(--gc-text)] transition-colors cursor-pointer"
                    >
                      <Icon name="terminal" size={14} />
                    </button>
                    {recipe.web_ui && isRunning && primaryPort && (
                      <a
                        href={`http://localhost:${primaryPort}${recipe.web_ui_path || ''}`}
                        target="_blank"
                        rel="noreferrer"
                        title="Open Web Dashboard"
                        className="p-1.5 rounded-lg hover:bg-[var(--gc-border)] text-[var(--gc-text-muted)] hover:text-accent transition-colors cursor-pointer"
                      >
                        <Icon name="open_in_new" size={14} />
                      </a>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    {isRunning ? (
                      <Button
                        size="sm"
                        variant="danger"
                        onClick={() => handleStop(recipe.id)}
                        disabled={isLoading}
                        className="flex items-center gap-1.5 text-xs px-3.5 py-1.5 rounded-lg active:scale-[0.98]"
                      >
                        {isLoading ? <Icon name="refresh" size={12} className="animate-spin" /> : <Icon name="stop" size={12} />}
                        Stop
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="primary"
                        onClick={() => handleInstallAndRun(recipe.id)}
                        disabled={isLoading}
                        className="flex items-center gap-1.5 text-xs px-3.5 py-1.5 rounded-lg active:scale-[0.98] bg-violet-600 hover:bg-violet-500 shadow-sm"
                      >
                        {isLoading ? <Icon name="refresh" size={12} className="animate-spin" /> : <Icon name="play_arrow" size={12} />}
                        Launch
                      </Button>
                    )}
                  </div>
                </div>

              </div>
            </div>
          );
        })}
      </div>

      {filteredRecipes.length === 0 && (
        <div className="double-bezel">
          <div className="double-bezel-inner py-16 text-center text-muted">
            <p className="text-sm">No tools matching your search criteria.</p>
            <button 
              onClick={() => { setSelectedCategory('all'); setSearchQuery(''); }}
              className="mt-3 text-xs text-accent underline cursor-pointer"
            >
              Clear filters
            </button>
          </div>
        </div>
      )}

      {/* Logs Drawer Modal */}
      {selectedLogs && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-6 animate-fade-in">
          <div className="double-bezel w-full max-w-3xl h-[600px] shadow-2xl">
            <div className="double-bezel-inner h-full flex flex-col p-0 overflow-hidden bg-black">
              <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-white/5">
                <div className="flex items-center gap-2">
                  <Icon name="terminal" size={18} className="text-violet-400" />
                  <h3 className="font-semibold text-white text-sm">
                    Console Logs: <span className="text-violet-300 font-mono">{selectedLogs.name}</span>
                  </h3>
                </div>
                <Button size="sm" variant="ghost" onClick={() => setSelectedLogs(null)}>
                  Close
                </Button>
              </div>
              <div className="flex-1 p-5 overflow-y-auto font-mono text-xs text-zinc-300 whitespace-pre-wrap leading-relaxed select-text bg-[#07070b]">
                {selectedLogs.content}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
