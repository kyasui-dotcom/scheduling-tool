"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { format, addMonths, startOfMonth, endOfMonth, eachDayOfInterval, isToday, isBefore, startOfDay } from "date-fns";
import { ja } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface Props {
  eventType: {
    id: string;
    title: string;
    description: string | null;
    durationMinutes: number;
    color: string | null;
    slotMode: "fixed_slots" | "flexible_start";
  };
  organizer: {
    name: string;
    username: string;
    image: string | null;
  };
}

interface TimeSlot {
  startTime: string;
  endTime: string;
}

interface FlexibleWindow {
  startTime: string;
  latestStartTime: string;
}

const FLEX_STEP_MINUTES = 15;

export function BookingClient({ eventType, organizer }: Props) {
  const router = useRouter();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [slots, setSlots] = useState<TimeSlot[]>([]);
  const [windows, setWindows] = useState<FlexibleWindow[]>([]);
  const [loading, setLoading] = useState(false);
  const [timezone, setTimezone] = useState("Asia/Tokyo");

  useEffect(() => {
    setTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone);
  }, []);

  const fetchAvailability = useCallback(
    async (date: Date) => {
      setLoading(true);
      try {
        const dateStr = format(date, "yyyy-MM-dd");
        const res = await fetch(
          `/api/availability?eventTypeId=${eventType.id}&date=${dateStr}&timezone=${timezone}`
        );
        if (res.ok) {
          const data = await res.json();
          setSlots(data.slots || []);
          setWindows(data.windows || []);
        }
      } catch {
        setSlots([]);
        setWindows([]);
      } finally {
        setLoading(false);
      }
    },
    [eventType.id, timezone]
  );

  useEffect(() => {
    if (selectedDate) fetchAvailability(selectedDate);
  }, [selectedDate, fetchAvailability]);

  function navigateToConfirm(startIso: string) {
    const pathParts = window.location.pathname.split("/");
    const eventSlug = pathParts[pathParts.length - 1];
    const params = new URLSearchParams({
      slot: startIso,
      timezone,
    });
    const urlParams = new URLSearchParams(window.location.search);
    const rescheduleId = urlParams.get("reschedule");
    const rescheduleToken = urlParams.get("token");
    if (rescheduleId) params.set("reschedule", rescheduleId);
    if (rescheduleToken) params.set("token", rescheduleToken);
    router.push(`/${organizer.username}/${eventSlug}/confirm?${params}`);
  }

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const startDayOfWeek = monthStart.getDay();
  const padBefore = startDayOfWeek === 0 ? 6 : startDayOfWeek - 1;

  const formatTime = (iso: string) =>
    new Intl.DateTimeFormat("ja-JP", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: timezone,
      hour12: false,
    }).format(new Date(iso));

  const hasAvailability =
    eventType.slotMode === "flexible_start" ? windows.length > 0 : slots.length > 0;

  return (
    <div className="min-h-screen py-8 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8 text-center">
          {organizer.image && (
            <img
              src={organizer.image}
              alt=""
              className="w-12 h-12 rounded-full mx-auto mb-2"
            />
          )}
          <p className="text-sm text-muted-foreground">{organizer.name}</p>
          <h1 className="text-2xl font-bold mt-1">{eventType.title}</h1>
          {eventType.description && (
            <p className="text-muted-foreground mt-1">{eventType.description}</p>
          )}
          <Badge variant="secondary" className="mt-2">
            {eventType.durationMinutes}分
          </Badge>
          {eventType.slotMode === "flexible_start" && (
            <Badge variant="outline" className="mt-2 ml-2">
              開始時刻を自由に選択
            </Badge>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setCurrentMonth(addMonths(currentMonth, -1))}
                  disabled={isBefore(
                    endOfMonth(addMonths(currentMonth, -1)),
                    startOfDay(new Date())
                  )}
                >
                  &lt;
                </Button>
                <h2 className="font-semibold">
                  {format(currentMonth, "yyyy年M月", { locale: ja })}
                </h2>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
                >
                  &gt;
                </Button>
              </div>

              <div className="grid grid-cols-7 gap-1 mb-2">
                {["月", "火", "水", "木", "金", "土", "日"].map((d) => (
                  <div
                    key={d}
                    className="text-center text-xs text-muted-foreground py-1"
                  >
                    {d}
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-7 gap-1">
                {Array.from({ length: padBefore }).map((_, i) => (
                  <div key={`pad-${i}`} />
                ))}
                {days.map((day) => {
                  const isPast = isBefore(day, startOfDay(new Date()));
                  const isSelected =
                    selectedDate &&
                    format(day, "yyyy-MM-dd") ===
                      format(selectedDate, "yyyy-MM-dd");
                  return (
                    <button
                      key={day.toISOString()}
                      className={`
                        aspect-square flex items-center justify-center rounded-md text-sm
                        transition-colors
                        ${isPast ? "text-muted-foreground/50 cursor-not-allowed" : "hover:bg-primary/10 cursor-pointer"}
                        ${isSelected ? "bg-primary text-primary-foreground hover:bg-primary" : ""}
                        ${isToday(day) && !isSelected ? "border border-primary" : ""}
                      `}
                      disabled={isPast}
                      onClick={() => setSelectedDate(day)}
                    >
                      {format(day, "d")}
                    </button>
                  );
                })}
              </div>

              <div className="mt-4 text-xs text-muted-foreground text-center">
                タイムゾーン: {timezone}
              </div>
            </CardContent>
          </Card>

          <div>
            {!selectedDate ? (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                日付を選択してください
              </div>
            ) : loading ? (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                空き時間を取得中...
              </div>
            ) : !hasAvailability ? (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                この日は空きがありません
              </div>
            ) : (
              <div>
                <h3 className="font-medium mb-3">
                  {format(selectedDate, "M月d日(E)", { locale: ja })}
                  の空き時間
                </h3>
                {eventType.slotMode === "flexible_start" ? (
                  <FlexiblePicker
                    windows={windows}
                    durationMinutes={eventType.durationMinutes}
                    timezone={timezone}
                    formatTime={formatTime}
                    onConfirm={navigateToConfirm}
                  />
                ) : (
                  <div className="space-y-2 max-h-96 overflow-y-auto">
                    {slots.map((slot) => (
                      <Button
                        key={slot.startTime}
                        variant="outline"
                        className="w-full justify-start text-left"
                        onClick={() => navigateToConfirm(slot.startTime)}
                      >
                        <span className="font-mono">
                          {formatTime(slot.startTime)} - {formatTime(slot.endTime)}
                        </span>
                      </Button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function FlexiblePicker({
  windows,
  durationMinutes,
  timezone,
  formatTime,
  onConfirm,
}: {
  windows: FlexibleWindow[];
  durationMinutes: number;
  timezone: string;
  formatTime: (iso: string) => string;
  onConfirm: (iso: string) => void;
}) {
  const [selectedStart, setSelectedStart] = useState<string>("");

  // Generate selectable start times every FLEX_STEP_MINUTES within each window
  const options = useMemo(() => {
    const out: { iso: string; label: string; windowIdx: number }[] = [];
    windows.forEach((w, wi) => {
      const winStart = new Date(w.startTime).getTime();
      const latest = new Date(w.latestStartTime).getTime();
      // Round up winStart to next FLEX_STEP boundary in guest TZ
      const stepMs = FLEX_STEP_MINUTES * 60 * 1000;
      let t = Math.ceil(winStart / stepMs) * stepMs;
      while (t <= latest) {
        out.push({
          iso: new Date(t).toISOString(),
          label: formatTime(new Date(t).toISOString()),
          windowIdx: wi,
        });
        t += stepMs;
      }
    });
    return out;
  }, [windows, formatTime]);

  const previewEnd = selectedStart
    ? new Date(
        new Date(selectedStart).getTime() + durationMinutes * 60 * 1000
      ).toISOString()
    : null;

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <p className="text-xs text-muted-foreground">
          利用可能な時間帯
        </p>
        {windows.map((w, i) => (
          <div key={i} className="text-xs font-mono text-muted-foreground">
            {formatTime(w.startTime)} 〜{" "}
            {formatTime(
              new Date(
                new Date(w.latestStartTime).getTime() +
                  durationMinutes * 60 * 1000
              ).toISOString()
            )}
          </div>
        ))}
      </div>

      <div>
        <p className="text-sm font-medium mb-2">
          開始時刻を選択（{FLEX_STEP_MINUTES}分刻み）
        </p>
        <div className="grid grid-cols-3 gap-2 max-h-80 overflow-y-auto">
          {options.map((o) => (
            <Button
              key={o.iso}
              variant={selectedStart === o.iso ? "default" : "outline"}
              size="sm"
              className="font-mono"
              onClick={() => setSelectedStart(o.iso)}
            >
              {o.label}
            </Button>
          ))}
        </div>
      </div>

      {selectedStart && previewEnd && (
        <div className="rounded-md border bg-muted/30 p-3 text-sm">
          <p className="font-medium">
            {formatTime(selectedStart)} - {formatTime(previewEnd)}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {durationMinutes}分間 / {timezone}
          </p>
        </div>
      )}

      <Button
        className="w-full"
        disabled={!selectedStart}
        onClick={() => onConfirm(selectedStart)}
      >
        この時間で予約に進む
      </Button>
    </div>
  );
}
