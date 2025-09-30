import React, { useEffect, useState, useRef } from "react";
import { TrendingUp, TrendingDown, Volume2, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function Stockfeed() {
  const [messages, setMessages] = useState(() => {
    const saved = localStorage.getItem("stockfeed_messages");
    return saved ? JSON.parse(saved) : [];
  });

  const [, tick] = useState(0);
  const wsRef = useRef(null);
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

  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      setCurrentTime(now.toLocaleTimeString("en-GB", { hour12: false }));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const formatTime = (isoString) => {
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
              dingSound.play().catch(err => console.error("dingSound error:", err));
            } else if (data.pct_vs_last_close < 0) {
              dongSound.currentTime = 0;
              dongSound.play().catch(err => console.error("dongSound error:", err));
            }
          }

          setMessages(prev => {
            const newList = [data, ...prev].slice(0, MAX_ENTRIES);
            localStorage.setItem("stockfeed_messages", JSON.stringify(newList));
            return newList;
          });
        } catch (err) {
          console.error("Error parsing message:", err);
        }
      };

      wsRef.current.onclose = () => {
        console.log("WebSocket disconnected, reconnecting in 3s...");
        setTimeout(connect, 3000);
      };

      wsRef.current.onerror = (err) => {
        console.error("WebSocket error:", err);
        wsRef.current.close();
      };
    }

    connect();
    return () => wsRef.current?.close();
  }, [STOCK_WS_URL]);

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
    dingSound.currentTime = 0;
    dingSound.play().then(() => {
      dingSound.pause();
      dingSound.currentTime = 0;
    }).catch(() => { });

    dongSound.currentTime = 0;
    dongSound.play().then(() => {
      dongSound.pause();
      dongSound.currentTime = 0;
    }).catch(() => { });

    setSoundsEnabled(true);
  };

  return (
    <div className="min-h-screen p-6 md:p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h1 className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-primary via-accent to-primary bg-clip-text text-transparent animate-pulse-glow">
                STOCKFEED
              </h1>
              <p className="text-muted-foreground mt-2 flex items-center gap-2">
                <span className="text-lg">{today}</span>
                <span className="text-primary font-mono text-xl">
                  {currentTime}
                </span>
              </p>
            </div>

            <div className="flex gap-3">
              <Button
                onClick={clearMessages}
                variant="secondary"
                className="transition-smooth hover:shadow-glow"
              >
                Clear All
              </Button>

              {!soundsEnabled ? (
                <Button
                  onClick={handleEnableSounds}
                  className="gradient-primary transition-smooth hover:shadow-glow"
                >
                  <VolumeX className="mr-2 h-4 w-4" />
                  Enable Sounds
                </Button>
              ) : (
                <Button
                  onClick={() => setSoundsEnabled(false)}
                  variant="outline"
                  className="border-destructive text-destructive transition-smooth"
                >
                  <Volume2 className="mr-2 h-4 w-4" />
                  Disable Sounds
                </Button>
              )}

            </div>
          </div>
        </div>

        {/* Grid Header */}
        <Card className="mb-2 shadow-card border-border/50 backdrop-blur">
          <div className="grid grid-cols-7 gap-4 p-4 text-sm font-semibold text-muted-foreground">
            <div>Symbol</div>
            <div className="text-center">Time</div>
            <div className="text-center">Day Open</div>
            <div className="text-center">Current</div>
            <div className="text-center">vs Day Open</div>
            <div className="text-center">Trend</div>
            <div className="text-center">vs Last Close</div>
          </div>
        </Card>

        {/* Stock Rows */}
        <div className="space-y-1">
          {Object.entries(grouped)
            .sort((a, b) => Math.max(...(b[1] as any[]).map((m: any) => m.pct_vs_day_open)) - Math.max(...(a[1] as any[]).map((m: any) => m.pct_vs_day_open)))
            .map(([symbol, msgs], groupIdx) => {
              return (msgs as any[]).map((msg: any, idx) => {
                const isRecent = Date.now() - msg._updated < 60 * 1000;
                const isPositive = msg.pct_vs_last_close > 0;
                const isNegative = msg.pct_vs_last_close < 0;

                let cardClasses = "shadow-card border-border/50 backdrop-blur transition-smooth hover:border-primary/50";
                if (isRecent && isPositive) {
                  cardClasses += " border-success/50 bg-success/5 animate-fade-in";
                } else if (isRecent && isNegative) {
                  cardClasses += " border-destructive/50 bg-destructive/5 animate-fade-in";
                }

                const percentChange = msg.pct_vs_day_open;
                const percentClass = percentChange > 0 ? "text-success" : percentChange < 0 ? "text-destructive" : "text-muted-foreground";

                const lastClosePercent = msg.pct_vs_last_close;
                const lastCloseClass = lastClosePercent > 0 ? "text-success" : lastClosePercent < 0 ? "text-destructive" : "text-muted-foreground";

                return (
                  <Card key={`${symbol}-${idx}`} className={cardClasses}>
                    <div className="grid grid-cols-7 gap-2 px-3 py-2 items-center">
                      <div>
                        <Badge variant="outline" className="font-mono font-bold text-base border-primary/50">
                          {msg.symbol}
                        </Badge>
                      </div>

                      <div className="text-center text-muted-foreground font-mono text-sm">
                        {formatTime(msg.time)}
                      </div>

                      <div className="text-center font-mono">
                        {msg.day_open.toFixed(3)}
                      </div>

                      <div className="text-center font-mono font-bold text-lg">
                        {msg.price.toFixed(3)}
                      </div>

                      <div className={`text-center font-mono font-bold ${percentClass}`}>
                        {percentChange > 0 && "+"}
                        {percentChange.toFixed(5)}%
                      </div>

                      <div className="flex justify-center">
                        {msg.direction === "🟢" ? (
                          <TrendingUp className="h-5 w-5 text-success" />
                        ) : (
                          <TrendingDown className="h-5 w-5 text-destructive" />
                        )}
                      </div>

                      <div className={`text-center font-mono font-bold ${lastCloseClass}`}>
                        {lastClosePercent > 0 && "+"}
                        {lastClosePercent.toFixed(5)}%
                      </div>
                    </div>
                  </Card>
                );
              });
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
