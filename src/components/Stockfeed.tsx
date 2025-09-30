import React, { useEffect, useState, useRef } from "react";
import { TrendingUp, TrendingDown, Volume2, VolumeX, Sun, Moon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function Stockfeed() {
  const [messages, setMessages] = useState(() => {
    const saved = localStorage.getItem("stockfeed_messages");
    return saved ? JSON.parse(saved) : [];
  });

  const [, tick] = useState(0);
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
    if (acc[msg.symbol].length < 5) acc[msg.symbol].push(msg);
    return acc;
  }, {});

  const clearMessages = () => {
    setMessages([]);
    localStorage.removeItem("stockfeed_messages");
  };

  const handleEnableSounds = () => {
    dingSound.play().then(() => { dingSound.pause(); dingSound.currentTime = 0; }).catch(() => { });
    dongSound.play().then(() => { dongSound.pause(); dongSound.currentTime = 0; }).catch(() => { });
    setSoundsEnabled(true);
  };

  return (
    <div className="min-h-screen p-4 sm:p-6 bg-white dark:bg-black transition-colors duration-300">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl sm:text-5xl font-bold bg-gradient-to-r from-primary via-accent to-primary bg-clip-text text-transparent animate-pulse-glow">
              STOCKFEED
            </h1>
            <p className="mt-1 flex items-center gap-2 text-inherit">
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

        {/* Grid Header */}
        <Card className="mb-2 shadow-card border-border/50 backdrop-blur">
          <div className="grid grid-cols-7 gap-1 px-2 py-2 text-xs sm:text-sm font-semibold text-muted-foreground"
            style={{ gridTemplateColumns: 'repeat(7, minmax(0, 1fr))' }}>
            <div>Symbol</div>
            <div className="text-center">Time</div>
            <div className="text-center">Day Open</div>
            <div className="text-center">Current</div>
            <div className="text-center">vs Open</div>
            <div className="text-center">Trend</div>
            <div className="text-center">vs Last</div>
          </div>
        </Card>

        {/* Stock Rows */}
        <div className="space-y-1">
          {Object.entries(grouped)
            .sort((a, b) => Math.max(...b[1].map(m => m.pct_vs_day_open)) - Math.max(...a[1].map(m => m.pct_vs_day_open)))
            .map(([symbol, msgs]) =>
              msgs.map((msg, idx) => {
                const isRecent = Date.now() - msg._updated < 60 * 1000;
                const percentChange = msg.pct_vs_day_open;
                const lastClosePercent = msg.pct_vs_last_close;
                const percentClass = percentChange > 0 ? "text-success" : percentChange < 0 ? "text-destructive" : "text-muted-foreground";
                const lastCloseClass = lastClosePercent > 0 ? "text-success" : lastClosePercent < 0 ? "text-destructive" : "text-muted-foreground";

                return (
                  <Card
                    key={`${symbol}-${idx}`}
                    className={`shadow-card border-border/50 backdrop-blur transition-smooth hover:border-primary/50 ${isRecent
                      ? (percentChange > 0
                        ? 'border-success/50 bg-success/5 animate-fade-in text-gray-900 dark:text-inherit'
                        : 'border-destructive/50 bg-destructive/5 animate-fade-in text-gray-900 dark:text-inherit')
                      : ''
                      }`}
                  >
                    <div className="grid grid-cols-7 gap-1 px-2 py-1 items-center text-xs sm:text-sm"
                      style={{ gridTemplateColumns: 'repeat(7, minmax(0, 1fr))' }}>
                      <div className="flex items-center">
                        <Badge variant="outline" className="font-mono font-bold text-xs sm:text-sm border-primary/50 text-inherit dark:text-inherit">{msg.symbol}</Badge>
                      </div>
                      <div className="text-center font-mono text-inherit">{formatTime(msg.time)}</div>
                      <div className="text-center font-mono">{msg.day_open.toFixed(3)}</div>
                      <div className="text-center font-mono font-bold">{msg.price.toFixed(3)}</div>
                      <div className={`text-center font-mono font-bold ${percentClass}`}>{percentChange > 0 && "+"}{percentChange.toFixed(5)}%</div>
                      <div className="flex justify-center">{msg.direction === "🟢" ? <TrendingUp className="h-4 w-4 text-success" /> : <TrendingDown className="h-4 w-4 text-destructive" />}</div>
                      <div className={`text-center font-mono font-bold ${lastCloseClass}`}>{lastClosePercent > 0 && "+"}{lastClosePercent.toFixed(5)}%</div>
                    </div>
                  </Card>
                );
              })
            )}
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
