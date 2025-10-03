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
  const [sortColumn, setSortColumn] = useState<'vsOpen' | 'trend' | 'vsClose' | 'stars'>('vsOpen');
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

  const handleSort = (column: 'vsOpen' | 'trend' | 'vsClose' | 'stars') => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('desc');
    }
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

  // Sorting logic including stars
  const sortedSymbols = Object.entries(grouped)
    .filter(([symbol]) => filterSymbols.length === 0 || filterSymbols.includes(symbol))
    .sort((a, b) => {
      const rowsA = a[1].slice(0, rowsPerSection);
      const rowsB = b[1].slice(0, rowsPerSection);

      const starCount = (msgs: any[]) => msgs.filter(m => m.pct_vs_day_open > 0 && m.pct_vs_last_close > 0).length;

      if (sortColumn === 'stars') {
        return sortDirection === 'desc' ? starCount(rowsB) - starCount(rowsA) : starCount(rowsA) - starCount(rowsB);
      }

      const getSortValue = (msgs: any[]) => {
        if (sortColumn === 'vsOpen') return msgs.reduce((sum, m) => sum + m.pct_vs_day_open, 0);
        if (sortColumn === 'trend') return msgs.filter(m => m.direction === "🟢").length;
        if (sortColumn === 'vsClose') return msgs.reduce((sum, m) => sum + m.pct_vs_last_close, 0);
        return 0;
      };

      return sortDirection === 'desc' ? getSortValue(rowsB) - getSortValue(rowsA) : getSortValue(rowsA) - getSortValue(rowsB);
    });

  return (
    <div className="min-h-screen p-4 sm:p-6 bg-white dark:bg-black transition-colors duration-300">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl sm:text-5xl font-bold bg-gradient-to-r from-primary via-accent to-primary bg-clip-text text-transparent animate-pulse-glow">
              STOCKFEED
            </h1>
            <p className={`mt-1 flex items-center gap-2 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
              <span className="text-sm sm:text-lg">{today}</span>
              <span className="text-primary font-mono text-sm sm:text-xl">{currentTime}</span>
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={clearMessages} variant="secondary" className="transition-smooth hover:shadow-glow">Clear All</Button>
            {!soundsEnabled ? (
              <Button onClick={handleEnableSounds} className="gradient-primary transition-smooth hover:shadow-glow">
                <VolumeX className="mr-2 h-4 w-4" /> Enable Sounds
              </Button>
            ) : (
              <Button onClick={() => setSoundsEnabled(false)} variant="outline" className="border-destructive text-destructive transition-smooth">
                <Volume2 className="mr-2 h-4 w-4" /> Disable Sounds
              </Button>
            )}
            <Button onClick={() => setIsDarkMode(!isDarkMode)} variant="outline" className="flex items-center gap-1">
              {isDarkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              {isDarkMode ? "Light Mode" : "Dark Mode"}
            </Button>
          </div>
        </div>

        {/* Filter & Rows */}
        <div className="flex gap-2 mb-4 items-center">
          <div className="relative" ref={dropdownRef}>
            <Button onClick={() => setDropdownVisible(!dropdownVisible)} className="flex items-center gap-2" variant="outline">
              <Filter className="h-4 w-4" /> Filter Symbols
            </Button>
            {dropdownVisible && (
              <div className="absolute z-10 right-0 mt-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md p-2 w-48 max-h-56 overflow-y-auto text-black dark:text-white">
                {Object.keys(grouped).map(symbol => (
                  <label key={symbol} className="flex items-center text-black dark:text-white">
                    <input type="checkbox" checked={filterSymbols.includes(symbol)} onChange={() => toggleSymbolSelection(symbol)} className="mr-2" />
                    {symbol}
                  </label>
                ))}
              </div>
            )}
          </div>
          <Button onClick={selectAllSymbols} variant="outline" className="text-sm">Select All</Button>
          <Button onClick={deselectAllSymbols} variant="outline" className="text-sm">Deselect All</Button>
          <div className="flex items-center text-black dark:text-white">
            <span className="mr-2">No. of rows</span>
            <select value={rowsPerSection} onChange={handleRowsPerSectionChange} className="ml-2 p-2 border rounded-md text-black">
              {[...Array(10).keys()].map(i => <option key={i + 1} value={i + 1}>{i + 1}</option>)}
            </select>
          </div>
        </div>

        {/* Grid Header */}
        <Card className="mb-2 shadow-card border-border/50 backdrop-blur">
          <div className="grid grid-cols-8 gap-1 px-2 py-2 text-xs sm:text-sm font-semibold text-muted-foreground"
            style={{ gridTemplateColumns: '40px repeat(7, minmax(0, 1fr))' }}>
            <button
              onClick={() => handleSort('stars')}
              className={`text-center hover:text-primary transition-colors cursor-pointer flex items-center justify-center gap-1 ${sortColumn === 'stars' ? 'text-primary font-bold' : ''}`}
            >
              ⭐
              {sortColumn === 'stars' && (sortDirection === 'desc' ? '↓' : '↑')}
            </button>
            <div>Symbol</div>
            <div className="text-center">Time</div>
            <div className="text-center">Day Open</div>
            <div className="text-center">Current</div>
            <button
              onClick={() => handleSort('vsOpen')}
              className={`text-center hover:text-primary transition-colors cursor-pointer flex items-center justify-center gap-1 ${sortColumn === 'vsOpen' ? 'text-primary font-bold' : ''}`}
            >
              vs Open {sortColumn === 'vsOpen' && (sortDirection === 'desc' ? '↓' : '↑')}
            </button>
            <button
              onClick={() => handleSort('trend')}
              className={`text-center hover:text-primary transition-colors cursor-pointer flex items-center justify-center gap-1 ${sortColumn === 'trend' ? 'text-primary font-bold' : ''}`}
            >
              Trend {sortColumn === 'trend' && (sortDirection === 'desc' ? '↓' : '↑')}
            </button>
            <button
              onClick={() => handleSort('vsClose')}
              className={`text-center hover:text-primary transition-colors cursor-pointer flex items-center justify-center gap-1 ${sortColumn === 'vsClose' ? 'text-primary font-bold' : ''}`}
            >
              vs Last {sortColumn === 'vsClose' && (sortDirection === 'desc' ? '↓' : '↑')}
            </button>
          </div>
        </Card>


        {/* Stock Rows */}
        <div className="space-y-4">
          {sortedSymbols.map(([symbol, msgs], sectionIdx) => {
            const bgSection = sectionIdx % 2 === 0 ? "bg-gray-50 dark:bg-gray-900" : "bg-white dark:bg-black";
            return (
              <div key={symbol} className={`${bgSection} p-1 rounded-md border border-gray-300 dark:border-gray-700`}>
                {msgs.slice(0, rowsPerSection).map((msg, idx) => {
                  const isRecent = Date.now() - msg._updated < 60 * 1000;
                  const percentChange = msg.pct_vs_day_open;
                  const lastClosePercent = msg.pct_vs_last_close;
                  const percentClass = percentChange > 0 ? "text-success" : percentChange < 0 ? "text-destructive" : "text-muted-foreground";
                  const lastCloseClass = lastClosePercent > 0 ? "text-success" : lastClosePercent < 0 ? "text-destructive" : "text-muted-foreground";

                  let bgClass = "";
                  let textHighlightClass = "";

                  if (isRecent) {
                    if (lastClosePercent > 0) bgClass = "bg-green-100";
                    else if (lastClosePercent < 0) bgClass = "bg-pink-100";
                    textHighlightClass = "text-black";
                  }

                  return (
                    <Card key={`${symbol}-${idx}`} className={`shadow-card border-border/50 backdrop-blur transition-smooth hover:border-primary/50 ${bgClass} animate-fade-in`}>
                      <div className="grid grid-cols-8 gap-1 px-2 py-1 items-center text-xs sm:text-sm"
                        style={{ gridTemplateColumns: '40px repeat(7, minmax(0, 1fr))' }}>
                        <div className="flex justify-center">{(msg.pct_vs_day_open > 0 && msg.pct_vs_last_close > 0) ? "⭐" : ""}</div>
                        <div className={`flex items-center ${textHighlightClass}`}>
                          <Badge variant="outline" className={`font-mono font-bold text-xs sm:text-sm border-primary/50 ${textHighlightClass}`}>
                            {msg.symbol}
                          </Badge>
                        </div>
                        <div className={`text-center font-mono ${textHighlightClass}`}>{formatTime(msg.time)}</div>
                        <div className={`text-center font-mono ${textHighlightClass}`}>{msg.day_open.toFixed(3)}</div>
                        <div className={`text-center font-mono font-bold ${msg.price > msg.day_open ? "text-success" : msg.price < msg.day_open ? "text-destructive" : ""} ${textHighlightClass}`}>{msg.price.toFixed(3)}</div>
                        <div className={`text-center font-mono font-bold ${percentClass}`}>{percentChange > 0 && "+"}{percentChange.toFixed(5)}%</div>
                        <div className="flex justify-center">{msg.direction === "🟢" ? <TrendingUp className="h-4 w-4 text-success" /> : <TrendingDown className="h-4 w-4 text-destructive" />}</div>
                        <div className={`text-center font-mono font-bold ${lastCloseClass}`}>{lastClosePercent > 0 && "+"}{lastClosePercent.toFixed(5)}%</div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            );
          })}
        </div>

        {messages.length === 0 && (
          <Card className="shadow-card border-border/50 backdrop-blur p-12 text-center">
            <p className="text-muted-foreground text-lg">
              Waiting for live stock data...
            </p>
          </Card>
        )}
      </div>
    </div>
  );
}
