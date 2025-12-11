import React, { useEffect, useState, useRef, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import { TrendingUp, TrendingDown, Volume2, VolumeX, Sun, Moon, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

// --- Constants ---
const MAX_ENTRIES = 200;
const TIMER_INTERVAL = 1000;
const STOCK_WS_URL = "wss://memorykeeper.duckdns.org/ws/stockfeed";
const DEFAULT_ROWS_PER_SECTION = 1;
const DROPDOWN_WIDTH = 224;
const DROPDOWN_MAX_HEIGHT = 320;

// Gap constants for easy tuning
const GAP_CONSTANTS = {
  ROW_GAP: 0.5, // space-y value for main container
  SYMBOL_GAP: 0, // space-y value for symbol container
  GRID_GAP: 1, // gap value for grid layout
  PADDING_X: 1, // px value
  PADDING_Y: 0.5, // py value
  WRAPPER_PADDING: 0.5, // p value for symbol wrapper
  BORDER_RADIUS: 'md', // reduced from xl to md for less rounding
} as const;

// Sort column types - added 'time'
type SortColumn = 'stars' | 'vsOpen' | 'trend' | 'vsClose' | 'time';

export default function Stockfeed() {
  // --- State & refs ---
  const [messages, setMessages] = useState(() => {
    const saved = localStorage.getItem("stockfeed_messages");
    return saved ? JSON.parse(saved) : [];
  });

  const [, tick] = useState(0);
  const [sortColumn, setSortColumn] = useState<SortColumn>('time');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [filterSymbols, setFilterSymbols] = useState<string[]>([]);
  const [dropdownVisible, setDropdownVisible] = useState(false);
  const [rowsPerSection, setRowsPerSection] = useState(DEFAULT_ROWS_PER_SECTION);
  const toggleRef = useRef<HTMLDivElement | null>(null);
  const portalRef = useRef<HTMLDivElement | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const connectedRef = useRef(false);

  // audio
  const dingSound = useRef(new Audio(`${import.meta.env.BASE_URL}sounds/ding.mp3`)).current as HTMLAudioElement;
  const dongSound = useRef(new Audio(`${import.meta.env.BASE_URL}sounds/dong.mp3`)).current as HTMLAudioElement;

  const [soundsEnabled, setSoundsEnabled] = useState(false);
  const soundsEnabledRef = useRef(soundsEnabled);
  useEffect(() => { soundsEnabledRef.current = soundsEnabled; }, [soundsEnabled]);

  // Add ref for filterSymbols to avoid stale closure
  const filterSymbolsRef = useRef(filterSymbols);
  useEffect(() => {
    filterSymbolsRef.current = filterSymbols;
  }, [filterSymbols]);

  const [currentTime, setCurrentTime] = useState(() => {
    const now = new Date();
    return now.toLocaleTimeString("en-GB", { hour12: false });
  });

  // Default to dark mode
  const [isDarkMode, setIsDarkMode] = useState(true);
  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDarkMode);
  }, [isDarkMode]);

  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      setCurrentTime(now.toLocaleTimeString("en-GB", { hour12: false }));
    }, TIMER_INTERVAL);
    return () => clearInterval(timer);
  }, []);

  // Updated formatTime to include seconds
  const formatTime = (isoString: string) => {
    try {
      const dt = new Date(isoString);
      return `${dt.getHours().toString().padStart(2, "0")}:${dt.getMinutes().toString().padStart(2, "0")}:${dt.getSeconds().toString().padStart(2, "0")}`;
    } catch {
      return isoString;
    }
  };

  const today = new Date().toISOString().slice(0, 10);

  // --- WebSocket connect ---
  useEffect(() => {
    if (connectedRef.current) return;
    connectedRef.current = true;

    function connect() {
      wsRef.current = new WebSocket(STOCK_WS_URL);

      wsRef.current.onopen = () => console.log("WebSocket connected:", STOCK_WS_URL);

      wsRef.current.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          data._updated = Date.now();

          // --- Play sound only if symbol matches current filters ---
          if (soundsEnabledRef.current) {
            // Use ref to get current filter symbols to avoid stale closure
            const currentFilters = filterSymbolsRef.current;
            if (currentFilters.length === 0 || currentFilters.includes(data.symbol)) {
              if (data.pct_vs_last_close > 0) {
                dingSound.currentTime = 0;
                dingSound.play().catch(() => { });
              } else if (data.pct_vs_last_close < 0) {
                dongSound.currentTime = 0;
                dongSound.play().catch(() => { });
              }
            }
          }

          // --- Save message as before ---
          setMessages(prev => {
            const newList = [data, ...prev].slice(0, MAX_ENTRIES);
            localStorage.setItem("stockfeed_messages", JSON.stringify(newList));
            return newList;
          });
        } catch (err) {
          console.error(err);
        }
      };

      wsRef.current.onerror = (err) => {
        console.error(err);
        wsRef.current?.close();
      };
    }

    connect();
    return () => wsRef.current?.close();
  }, []);

  useEffect(() => {
    const interval = setInterval(() => tick(t => t + 1), TIMER_INTERVAL);
    return () => clearInterval(interval);
  }, []);

  // --- Data grouping / sorting ---
  const grouped = messages.reduce((acc: any, msg: any) => {
    if (!acc[msg.symbol]) acc[msg.symbol] = [];
    acc[msg.symbol].push(msg);
    return acc;
  }, {});

  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('desc');
    }
  };

  // Original calculateStars function
  const calculateStars = (msg: any) => {
    let stars = 0;
    if (msg.pct_vs_day_open > 0 && msg.pct_vs_last_close > 0) stars = 1;
    if (stars === 1 && msg.pct_vs_day_open > 3) stars = 2;
    if (stars === 1 && msg.pct_vs_day_open > 5) stars = 3;
    if (stars === 2 && msg.pct_vs_day_open > 5) stars = 3;
    return stars;
  };

  const getSortValue = (msgs: any[], column: SortColumn) => {
    const rows = msgs.slice(0, rowsPerSection);
    if (column === 'vsOpen') return rows.reduce((sum, m) => sum + (m.pct_vs_day_open || 0), 0);
    if (column === 'trend') return rows.filter(m => m.direction === "🟢").length;
    if (column === 'vsClose') return rows.reduce((sum, m) => sum + (m.pct_vs_last_close || 0), 0);
    if (column === 'stars') return rows.reduce((sum, m) => sum + calculateStars(m), 0);
    if (column === 'time') {
      // Sort by the most recent time in the group
      const latestTime = Math.max(...rows.map(m => new Date(m.time || 0).getTime()));
      return latestTime;
    }
    return 0;
  };

  const clearMessages = () => {
    setMessages([]);
    localStorage.removeItem("stockfeed_messages");
  };

  const handleEnableSounds = () => {
    dingSound.play().then(() => { dingSound.pause(); dingSound.currentTime = 0; }).catch(() => { });
    dongSound.play().then(() => { dongSound.pause(); dongSound.currentTime = 0; }).catch(() => { });
    setSoundsEnabled(true);
  };

  const toggleSymbolSelection = (symbol: string) => {
    setFilterSymbols(prev => prev.includes(symbol) ? prev.filter(s => s !== symbol) : [...prev, symbol]);
  };
  const selectAllSymbols = () => setFilterSymbols(Object.keys(grouped));

  const handleRowsPerSectionChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    setRowsPerSection(Number(event.target.value));
  };

  const sortedSymbols = Object.entries(grouped)
    .filter(([symbol]) => filterSymbols.length === 0 || filterSymbols.includes(symbol))
    .sort((a, b) => {
      const aValue = getSortValue(a[1] as any[], sortColumn);
      const bValue = getSortValue(b[1] as any[], sortColumn);
      return sortDirection === 'desc' ? bValue - aValue : aValue - bValue;
    });

  // --- Dropdown portal positioning & behavior ---
  const [portalPos, setPortalPos] = useState<{ top: number; left: number; width: number } | null>(null);

  const updatePortalPos = () => {
    const el = toggleRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();

    let left = rect.left;
    let top = rect.bottom + 8; // below button by default

    // horizontal collision
    if (left + DROPDOWN_WIDTH > window.innerWidth - 8) {
      left = Math.max(8, window.innerWidth - DROPDOWN_WIDTH - 8);
    }

    // vertical collision: if not enough space below, position above
    const spaceBelow = window.innerHeight - rect.bottom - 8;
    if (spaceBelow < 120) {
      top = rect.top - Math.min(DROPDOWN_MAX_HEIGHT, 200) - 8;
      if (top < 8) top = 8;
    }

    setPortalPos({
      top: Math.round(top + window.scrollY),
      left: Math.round(left + window.scrollX),
      width: DROPDOWN_WIDTH
    });
  };

  useLayoutEffect(() => {
    if (dropdownVisible) updatePortalPos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dropdownVisible, Object.keys(grouped).length]);

  useEffect(() => {
    if (!dropdownVisible) return;

    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (toggleRef.current?.contains(target)) return;
      if (portalRef.current?.contains(target)) return;
      setDropdownVisible(false);
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDropdownVisible(false);
    };

    const onScrollOrResize = () => updatePortalPos();

    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScrollOrResize, true);
    window.addEventListener('resize', onScrollOrResize);

    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScrollOrResize, true);
      window.removeEventListener('resize', onScrollOrResize);
    };
  }, [dropdownVisible]);

  // --- Render ---
  return (
    <div className="min-h-screen p-4 sm:p-8 bg-gradient-to-br from-white via-white to-accent/5 dark:from-background dark:via-background dark:to-accent/5 transition-colors duration-300">
      <div className="max-w-7xl mx-auto">
        {/* Header - Completely restructured */}
        <div className="mb-6 flex flex-col gap-4 p-4 bg-white dark:bg-card/50 backdrop-blur-sm rounded-xl border border-gray-600 dark:border-gray-300 shadow-card">
          {/* Top row with STOCKFEED and Time on right */}
          <div className="flex justify-between items-center">
            <h1 className="text-2xl sm:text-4xl font-bold bg-gradient-to-r from-primary via-accent to-primary bg-clip-text text-transparent animate-pulse-glow">STOCKFEED</h1>
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-muted-foreground dark:text-white">{today}</span>
              <span className="text-primary font-mono text-base sm:text-xl font-semibold tracking-wider">{currentTime}</span>
            </div>
          </div>

          {/* Buttons row - all buttons under STOCKFEED, all with gradient-primary class */}
          <div className="flex flex-wrap gap-2">
            <Button onClick={clearMessages} size="sm" className="gradient-primary transition-smooth hover:shadow-glow text-white">
              Clear All
            </Button>

            {!soundsEnabled ? (
              <Button onClick={handleEnableSounds} size="sm" className="gradient-primary transition-smooth hover:shadow-glow text-white">
                <VolumeX className="mr-1 h-3 w-3" /> Enable Sounds
              </Button>
            ) : (
              <Button onClick={() => setSoundsEnabled(false)} size="sm" className="gradient-primary transition-smooth hover:shadow-glow text-white">
                <Volume2 className="mr-1 h-3 w-3" /> Disable Sounds
              </Button>
            )}

            <Button onClick={() => setIsDarkMode(!isDarkMode)} size="sm" className="gradient-primary transition-smooth hover:shadow-glow text-white">
              {isDarkMode ? <Sun className="h-3 w-3 mr-1" /> : <Moon className="h-3 w-3 mr-1" />} {isDarkMode ? "Light" : "Dark"}
            </Button>
          </div>
        </div>

        {/* Filter & Rows - All buttons with gradient-primary class */}
        <div className="flex flex-wrap gap-2 mb-4 items-center p-3 bg-white dark:bg-card/30 backdrop-blur-sm rounded-lg border border-gray-600 dark:border-gray-300">
          <div className="relative" ref={toggleRef}>
            <Button onClick={() => setDropdownVisible(v => !v)} size="sm" className="flex items-center gap-1 gradient-primary text-white">
              <Filter className="h-3 w-3" /> Filter Symbols
            </Button>
          </div>

          <Button onClick={selectAllSymbols} size="sm" className="gradient-primary text-white">Select All</Button>

          <div className="flex items-center gap-2 ml-auto">
            <span className="text-xs font-medium text-black dark:text-white">Rows per symbol:</span>
            <select value={rowsPerSection} onChange={handleRowsPerSectionChange} className={`p-1 px-2 border border-border rounded-md bg-card text-foreground font-medium focus:ring-1 focus:ring-primary focus:border-primary transition-all text-sm ${isDarkMode ? "text-white" : "text-black"}`}>
              {[...Array(10).keys()].map(i => <option key={i + 1} value={i + 1}>{i + 1}</option>)}
            </select>
          </div>

          {/* Portal dropdown */}
          {dropdownVisible && portalPos && createPortal(
            <div
              ref={portalRef}
              className="bg-white text-black dark:bg-card dark:text-white border border-border rounded-lg shadow-xl p-3 max-h-80 overflow-y-auto"
              style={{ position: 'fixed', top: portalPos.top, left: portalPos.left, width: portalPos.width, zIndex: 9999 }}
            >
              {Object.keys(grouped).length === 0 ? (
                <div className="text-sm text-muted-foreground">No symbols</div>
              ) : (
                Object.keys(grouped).map(symbol => (
                  <label key={symbol} className="flex items-center hover:bg-accent/20 p-2 rounded cursor-pointer transition-colors">
                    <input type="checkbox" checked={filterSymbols.includes(symbol)} onChange={() => toggleSymbolSelection(symbol)} className="mr-3 h-4 w-4 rounded border-border accent-primary" />
                    <span className="font-mono font-semibold dark:text-white">{symbol}</span>
                  </label>
                ))
              )}
            </div>,
            document.body
          )}
        </div>

        {/* Grid Header - Changed to light grey (gray-300) */}
        <Card className="mb-3 shadow-glow border-border/50 backdrop-blur-sm bg-gray-300 text-gray-800">
          <div className="grid grid-cols-8 gap-1 px-2 py-2 text-xs sm:text-sm font-bold uppercase tracking-wide" style={{ gridTemplateColumns: '60px repeat(7, minmax(0, 1fr))' }}>
            <button onClick={() => handleSort('stars')} className={`text-center hover:text-primary hover:scale-110 transition-all cursor-pointer flex items-center justify-center gap-1 ${sortColumn === 'stars' ? 'text-primary scale-110' : ''}`}>
              ⭐ {sortColumn === 'stars' && (sortDirection === 'desc' ? '↓' : '↑')}
            </button>
            <div className="font-extrabold">Symbol</div>
            <button onClick={() => handleSort('time')} className={`text-center hover:text-primary hover:scale-105 transition-all cursor-pointer flex items-center justify-center gap-1 ${sortColumn === 'time' ? 'text-primary scale-105' : ''}`}>
              Time {sortColumn === 'time' && (sortDirection === 'desc' ? '↓' : '↑')}
            </button>
            <div className="text-center">Day Open</div>
            <div className="text-center">Current</div>
            <button onClick={() => handleSort('vsOpen')} className={`text-center hover:text-primary hover:scale-105 transition-all cursor-pointer flex items-center justify-center gap-1 ${sortColumn === 'vsOpen' ? 'text-primary scale-105' : ''}`}>vs Open {sortColumn === 'vsOpen' && (sortDirection === 'desc' ? '↓' : '↑')}</button>
            <button onClick={() => handleSort('trend')} className={`text-center hover:text-primary hover:scale-105 transition-all cursor-pointer flex items-center justify-center gap-1 ${sortColumn === 'trend' ? 'text-primary scale-105' : ''}`}>Trend {sortColumn === 'trend' && (sortDirection === 'desc' ? '↓' : '↑')}</button>
            <button onClick={() => handleSort('vsClose')} className={`text-center hover:text-primary hover:scale-105 transition-all cursor-pointer flex items-center justify-center gap-1 ${sortColumn === 'vsClose' ? 'text-primary scale-105' : ''}`}>vs Last {sortColumn === 'vsClose' && (sortDirection === 'desc' ? '↓' : '↑')}</button>
          </div>
        </Card>

        {/* Stock Rows - Using gap constants */}
        <div className={`space-y-${GAP_CONSTANTS.ROW_GAP}`}>
          {sortedSymbols.map(([symbol, msgs]: any) => (
            <div key={symbol} className={`p-${GAP_CONSTANTS.WRAPPER_PADDING} rounded-${GAP_CONSTANTS.BORDER_RADIUS} border border-gray-600 dark:border-gray-300 bg-white dark:bg-gradient-to-br from-card/50 to-accent/5 backdrop-blur-sm shadow-card hover:shadow-glow transition-all duration-300`}>
              <div className={`space-y-${GAP_CONSTANTS.SYMBOL_GAP}`}>
                {(msgs as any[]).slice(0, rowsPerSection).map((msg: any, idx: number) => {
                  const isRecent = Date.now() - msg._updated < 60 * 1000;
                  const percentChange = msg.pct_vs_day_open ?? 0;
                  const lastClosePercent = msg.pct_vs_last_close ?? 0;
                  const percentClass = percentChange > 0 ? "text-success" : percentChange < 0 ? "text-destructive" : "text-muted-foreground dark:text-white";
                  const lastCloseClass = lastClosePercent > 0 ? "text-success" : lastClosePercent < 0 ? "text-destructive" : "text-muted-foreground dark:text-white";
                  const trendArrow = msg.direction === "🟢" ? <TrendingUp className="h-5 w-5 text-success drop-shadow-glow" /> : <TrendingDown className="h-5 w-5 text-destructive drop-shadow-glow" />;

                  let bgClass = "";
                  if (isRecent) {
                    if (lastClosePercent > 0) bgClass = "bg-success/30 dark:bg-success/20";
                    else if (lastClosePercent < 0) bgClass = "bg-destructive/30 dark:bg-destructive/20";
                  }

                  const stars = calculateStars(msg);
                  const starStr = "⭐".repeat(stars);

                  return (
                    <Card key={`${symbol}-${idx}`} className={`shadow-sm border border-border/30 transition-all duration-300 hover:scale-[1.01] hover:shadow-glow rounded-${GAP_CONSTANTS.BORDER_RADIUS} ${bgClass} ${!bgClass && isDarkMode ? "dark:bg-gradient-to-br from-[#0b1e3b]/80 to-[#13294f]/80 text-white" : ""} ${!bgClass && !isDarkMode ? "bg-white text-black" : ""}`}>
                      <div className={`grid grid-cols-8 gap-${GAP_CONSTANTS.GRID_GAP} px-${GAP_CONSTANTS.PADDING_X} py-${GAP_CONSTANTS.PADDING_Y} items-center text-xs sm:text-sm`} style={{ gridTemplateColumns: '60px repeat(7, minmax(0, 1fr))' }}>
                        <div className="flex justify-center text-lg">{starStr}</div>
                        <div className={`flex items-center font-mono font-bold ${!isDarkMode && isRecent ? "text-black" : ""}`}>{msg.symbol ?? "-"}</div>
                        <div className={`text-center font-mono text-xs ${!isDarkMode && isRecent ? "text-black" : ""}`}>{formatTime(msg.time ?? "")}</div>
                        <div className={`text-center font-mono font-semibold ${!isDarkMode && isRecent ? "text-black" : ""}`}>{msg.day_open?.toFixed(3) ?? "-"}</div>
                        <div className={`text-center font-mono font-bold ${msg.price != null ? (msg.price > msg.day_open ? "text-success" : msg.price < msg.day_open ? "text-destructive" : "") : ""}`}>{msg.price?.toFixed(3) ?? "-"}</div>
                        <div className={`text-center font-semibold ${percentClass}`}>{percentChange != null ? percentChange.toFixed(2) + "%" : "-"}</div>
                        <div className="flex justify-center items-center">{trendArrow}</div>
                        <div className={`text-center font-semibold ${lastCloseClass}`}>{lastClosePercent != null ? lastClosePercent.toFixed(2) + "%" : "-"}</div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

      </div>
    </div>
  );
}