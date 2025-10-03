import React, { useEffect, useState, useRef } from "react";
import { TrendingUp, TrendingDown, Volume2, VolumeX, Sun, Moon, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function Stockfeed() {
  const [messages, setMessages] = useState(() => {
    const saved = localStorage.getItem("stockfeed_messages");
    return saved ? JSON.parse(saved) : [];
  });

  const [, tick] = useState(0);
  const [sortColumn, setSortColumn] = useState<'stars' | 'vsOpen' | 'trend' | 'vsClose'>('vsOpen');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [filterSymbols, setFilterSymbols] = useState<string[]>([]);
  const [dropdownVisible, setDropdownVisible] = useState(false);
  const [rowsPerSection, setRowsPerSection] = useState(5);
  const dropdownRef = useRef(null);
  const wsRef = useRef<WebSocket | null>(null);
  const connectedRef = useRef(false);
  const MAX_ENTRIES = 200;

  const dingSound = useRef(new Audio(`${import.meta.env.BASE_URL}sounds/ding.mp3`)).current;
  const dongSound = useRef(new Audio(`${import.meta.env.BASE_URL}sounds/dong.mp3`)).current;

  const [soundsEnabled, setSoundsEnabled] = useState(false);
  const soundsEnabledRef = useRef(soundsEnabled);
  useEffect(() => { soundsEnabledRef.current = soundsEnabled; }, [soundsEnabled]);

  const [currentTime, setCurrentTime] = useState(() => {
    const now = new Date();
    return now.toLocaleTimeString("en-GB", { hour12: false });
  });

  const [isDarkMode, setIsDarkMode] = useState(false);
  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDarkMode);
  }, [isDarkMode]);

  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      setCurrentTime(now.toLocaleTimeString("en-GB", { hour12: false }));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const formatTime = (isoString: string) => {
    try {
      const dt = new Date(isoString);
      return `${dt.getHours().toString().padStart(2, "0")}:${dt.getMinutes().toString().padStart(2, "0")}`;
    } catch {
      return isoString;
    }
  };

  const today = new Date().toISOString().slice(0, 10);
  const STOCK_WS_URL = "wss://memorykeeper.duckdns.org/ws/stockfeed";

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

          if (soundsEnabledRef.current) {
            if (data.pct_vs_last_close > 0) {
              dingSound.currentTime = 0;
              dingSound.play().catch(err => console.error(err));
            } else if (data.pct_vs_last_close < 0) {
              dongSound.currentTime = 0;
              dongSound.play().catch(err => console.error(err));
            }
          }

          setMessages(prev => {
            const newList = [data, ...prev].slice(0, MAX_ENTRIES);
            localStorage.setItem("stockfeed_messages", JSON.stringify(newList));
            return newList;
          });
        } catch (err) { console.error(err); }
      };

      wsRef.current.onclose = () => {
        console.log("WebSocket disconnected, reconnecting in 3s...");
        setTimeout(connect, 3000);
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
    const interval = setInterval(() => tick(t => t + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  const grouped = messages.reduce((acc: any, msg: any) => {
    if (!acc[msg.symbol]) acc[msg.symbol] = [];
    acc[msg.symbol].push(msg);
    return acc;
  }, {});

  const handleSort = (column: 'stars' | 'vsOpen' | 'trend' | 'vsClose') => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('desc');
    }
  };

  const calculateStars = (msg: any) => {
    let stars = 0;
    if (msg.pct_vs_day_open > 0 && msg.pct_vs_last_close > 0) stars = 1;
    if (stars === 1 && msg.pct_vs_day_open > 3) stars = 2;
    if (stars === 1 && msg.pct_vs_day_open > 5) stars = 3;
    if (stars === 2 && msg.pct_vs_day_open > 5) stars = 3;
    return stars;
  };

  const getSortValue = (msgs: any[], column: 'stars' | 'vsOpen' | 'trend' | 'vsClose') => {
    const rows = msgs.slice(0, rowsPerSection);
    if (column === 'vsOpen') return rows.reduce((sum, m) => sum + m.pct_vs_day_open, 0);
    if (column === 'trend') return rows.filter(m => m.direction === "🟢").length;
    if (column === 'vsClose') return rows.reduce((sum, m) => sum + m.pct_vs_last_close, 0);
    if (column === 'stars') return rows.reduce((sum, m) => sum + calculateStars(m), 0);
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
  const deselectAllSymbols = () => setFilterSymbols([]);

  const handleClickOutside = (event: MouseEvent) => {
    if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
      setDropdownVisible(false);
    }
  };
  useEffect(() => {
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

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

  return (
    <div className="min-h-screen p-4 sm:p-8 bg-gradient-to-br from-background via-background to-accent/5 transition-colors duration-300">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6 p-6 bg-card/50 backdrop-blur-sm rounded-2xl border border-border/50 shadow-card">
          <div>
            <h1 className="text-4xl sm:text-6xl font-bold bg-gradient-to-r from-primary via-accent to-primary bg-clip-text text-transparent animate-pulse-glow mb-2">
              STOCKFEED
            </h1>
            <p className="flex items-center gap-3 text-muted-foreground">
              <span className="text-base sm:text-lg font-medium">{today}</span>
              <span className="text-primary font-mono text-lg sm:text-2xl font-semibold tracking-wider">{currentTime}</span>
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button onClick={clearMessages} variant="secondary" size="lg" className="transition-smooth hover:shadow-glow">
              Clear All
            </Button>
            {!soundsEnabled ? (
              <Button onClick={handleEnableSounds} size="lg" className="gradient-primary transition-smooth hover:shadow-glow">
                <VolumeX className="mr-2 h-4 w-4" /> Enable Sounds
              </Button>
            ) : (
              <Button onClick={() => setSoundsEnabled(false)} variant="outline" size="lg" className="border-destructive text-destructive hover:bg-destructive/10 transition-smooth">
                <Volume2 className="mr-2 h-4 w-4" /> Disable Sounds
              </Button>
            )}
            <Button onClick={() => setIsDarkMode(!isDarkMode)} variant="outline" size="lg" className="transition-smooth hover:shadow-glow">
              {isDarkMode ? <Sun className="h-4 w-4 mr-2" /> : <Moon className="h-4 w-4 mr-2" />}
              {isDarkMode ? "Light" : "Dark"}
            </Button>
          </div>
        </div>

        {/* Filter & Rows */}
        <div className="flex flex-wrap gap-3 mb-6 items-center p-4 bg-card/30 backdrop-blur-sm rounded-xl border border-border/50">
          <div className="relative" ref={dropdownRef}>
            <Button onClick={() => setDropdownVisible(!dropdownVisible)} size="lg" className="flex items-center gap-2" variant="outline">
              <Filter className="h-4 w-4" /> Filter Symbols
            </Button>
            {dropdownVisible && (
              <div className="absolute z-50 right-0 mt-2 bg-card border border-border rounded-lg p-3 w-52 max-h-64 overflow-y-auto shadow-glow">
                {Object.keys(grouped).map(symbol => (
                  <label key={symbol} className="flex items-center hover:bg-accent/20 p-2 rounded cursor-pointer transition-colors">
                    <input
                      type="checkbox"
                      checked={filterSymbols.includes(symbol)}
                      onChange={() => toggleSymbolSelection(symbol)}
                      className="mr-3 h-4 w-4 rounded border-border accent-primary"
                    />
                    <span className="font-mono font-semibold">{symbol}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
          <Button onClick={selectAllSymbols} variant="outline" size="lg">Select All</Button>
          <Button onClick={deselectAllSymbols} variant="outline" size="lg">Deselect All</Button>
          <div className="flex items-center gap-3 ml-auto">
            <span className="text-sm font-medium text-muted-foreground">Rows per symbol:</span>
            <select
              value={rowsPerSection}
              onChange={handleRowsPerSectionChange}
              className="p-2 px-3 border border-border rounded-lg bg-card text-foreground font-medium focus:ring-2 focus:ring-primary focus:border-primary transition-all"
            >
              {[...Array(10).keys()].map(i => <option key={i + 1} value={i + 1}>{i + 1}</option>)}
            </select>
          </div>
        </div>

        {/* Grid Header */}
        <Card className="mb-4 shadow-glow border-border/50 backdrop-blur-sm bg-gradient-to-r from-card/80 to-accent/10">
          <div className="grid grid-cols-8 gap-2 px-4 py-4 text-xs sm:text-sm font-bold uppercase tracking-wide text-muted-foreground"
            style={{ gridTemplateColumns: '60px repeat(7, minmax(0, 1fr))' }}>
            <button
              onClick={() => handleSort('stars')}
              className={`text-center hover:text-primary hover:scale-110 transition-all cursor-pointer flex items-center justify-center gap-1 ${sortColumn === 'stars' ? 'text-primary scale-110' : ''}`}
            >
              ⭐ {sortColumn === 'stars' && (sortDirection === 'desc' ? '↓' : '↑')}
            </button>
            <div className="font-extrabold">Symbol</div>
            <div className="text-center">Time</div>
            <div className="text-center">Day Open</div>
            <div className="text-center">Current</div>
            <button
              onClick={() => handleSort('vsOpen')}
              className={`text-center hover:text-primary hover:scale-105 transition-all cursor-pointer flex items-center justify-center gap-1 ${sortColumn === 'vsOpen' ? 'text-primary scale-105' : ''}`}
            >
              vs Open {sortColumn === 'vsOpen' && (sortDirection === 'desc' ? '↓' : '↑')}
            </button>
            <button
              onClick={() => handleSort('trend')}
              className={`text-center hover:text-primary hover:scale-105 transition-all cursor-pointer flex items-center justify-center gap-1 ${sortColumn === 'trend' ? 'text-primary scale-105' : ''}`}
            >
              Trend {sortColumn === 'trend' && (sortDirection === 'desc' ? '↓' : '↑')}
            </button>
            <button
              onClick={() => handleSort('vsClose')}
              className={`text-center hover:text-primary hover:scale-105 transition-all cursor-pointer flex items-center justify-center gap-1 ${sortColumn === 'vsClose' ? 'text-primary scale-105' : ''}`}
            >
              vs Last {sortColumn === 'vsClose' && (sortDirection === 'desc' ? '↓' : '↑')}
            </button>
          </div>
        </Card>

        {/* Stock Rows */}
        <div className="space-y-3">
          {sortedSymbols.map(([symbol, msgs], sectionIdx) => {
            return (
              <div key={symbol} className="p-2 rounded-xl border border-border/50 bg-gradient-to-br from-card/50 to-accent/5 backdrop-blur-sm shadow-card hover:shadow-glow transition-all duration-300">
                <div className="space-y-1.5">
                  {(msgs as any[]).slice(0, rowsPerSection).map((msg, idx) => {
                    const isRecent = Date.now() - msg._updated < 60 * 1000;
                    const percentChange = msg.pct_vs_day_open;
                    const lastClosePercent = msg.pct_vs_last_close;
                    const percentClass = percentChange > 0 ? "text-success" : percentChange < 0 ? "text-destructive" : "text-muted-foreground";
                    const lastCloseClass = lastClosePercent > 0 ? "text-success" : lastClosePercent < 0 ? "text-destructive" : "text-muted-foreground";

                    let bgClass = "";
                    let borderClass = "border-border/30";

                    if (isRecent) {
                      if (lastClosePercent > 0) {
                        bgClass = "bg-success/10 dark:bg-success/5";
                        borderClass = "border-success/50";
                      } else if (lastClosePercent < 0) {
                        bgClass = "bg-destructive/10 dark:bg-destructive/5";
                        borderClass = "border-destructive/50";
                      }
                    }

                    const stars = calculateStars(msg);
                    const starStr = "⭐".repeat(stars);

                    return (
                      <Card key={`${symbol}-${idx}`} className={`shadow-sm border ${borderClass} backdrop-blur-sm transition-all duration-300 hover:scale-[1.01] hover:shadow-glow ${bgClass} animate-fade-in`}>
                        <div className="grid grid-cols-8 gap-2 px-3 py-1.5 items-center text-xs sm:text-sm"
                          style={{ gridTemplateColumns: '60px repeat(7, minmax(0, 1fr))' }}>
                          <div className="flex justify-center text-lg">{starStr}</div>
                          <div className="flex items-center">
                            <Badge variant="outline" className="font-mono font-bold text-sm sm:text-base border-primary/50 bg-primary/5 px-3 py-1">
                              {msg.symbol}
                            </Badge>
                          </div>
                          <div className="text-center font-mono text-muted-foreground">{formatTime(msg.time)}</div>
                          <div className="text-center font-mono font-semibold">{msg.day_open.toFixed(3)}</div>
                          <div className={`text-center font-mono font-bold text-base ${msg.price > msg.day_open ? "text-success" : msg.price < msg.day_open ? "text-destructive" : ""}`}>
                            {msg.price.toFixed(3)}
                          </div>
                          <div className={`text-center font-mono font-bold text-base ${percentClass}`}>
                            {percentChange > 0 && "+"}{percentChange.toFixed(5)}%
                          </div>
                          <div className="flex justify-center">
                            {msg.direction === "🟢" ?
                              <TrendingUp className="h-5 w-5 text-success drop-shadow-glow" /> :
                              <TrendingDown className="h-5 w-5 text-destructive drop-shadow-glow" />
                            }
                          </div>
                          <div className={`text-center font-mono font-bold text-base ${lastCloseClass}`}>
                            {lastClosePercent > 0 && "+"}{lastClosePercent.toFixed(5)}%
                          </div>
                        </div>
                      </Card>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {messages.length === 0 && (
          <Card className="shadow-glow border-border/50 backdrop-blur-sm bg-gradient-to-br from-card/50 to-accent/5 p-16 text-center animate-pulse-glow">
            <p className="text-muted-foreground text-xl font-medium">
              Waiting for live stock data...
            </p>
          </Card>
        )}
      </div>
    </div>
  );
}