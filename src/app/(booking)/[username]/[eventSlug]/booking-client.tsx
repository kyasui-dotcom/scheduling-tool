"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { format, addMonths, addDays, startOfMonth, endOfMonth, eachDayOfInterval, isToday, isBefore, isAfter, startOfDay, endOfDay, differenceInCalendarDays } from "date-fns";
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
    bookingWindowStart: string | null;
    bookingWindowEnd: string | null;
    maxAdvanceDays: number;
    minNoticeMinutes: number;
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
  availableUserIds?: string[];
}

interface FlexibleWindow {
  startTime: string;
  latestStartTime: string;
  availableUserIds?: string[];
}

const FLEX_STEP_MINUTES = 15;

interface DayData {
  slots: TimeSlot[];
  windows: FlexibleWindow[];
}

export function BookingClient({ eventType, organizer }: Props) {
  const router = useRouter();
  // Compute the bookable window once from props
  const bookableWindow = useMemo(() => {
    const now = new Date();
    const minNoticeMs = (eventType.minNoticeMinutes || 0) * 60 * 1000;
    let earliest = new Date(now.getTime() + minNoticeMs);
    let latest = addDays(now, eventType.maxAdvanceDays || 60);
    if (eventType.bookingWindowStart) {
      const wStart = startOfDay(new Date(`${eventType.bookingWindowStart}T00:00:00`));
      if (wStart.getTime() > earliest.getTime()) earliest = wStart;
    }
    if (eventType.bookingWindowEnd) {
      const wEnd = endOfDay(new Date(`${eventType.bookingWindowEnd}T00:00:00`));
      if (wEnd.getTime() < latest.getTime()) latest = wEnd;
    }
    return { earliest, latest };
  }, [
    eventType.bookingWindowStart,
    eventType.bookingWindowEnd,
    eventType.maxAdvanceDays,
    eventType.minNoticeMinutes,
  ]);

  // Initial month = the month containing the earliest bookable day
  const [currentMonth, setCurrentMonth] = useState(() =>
    startOfMonth(bookableWindow.earliest)
  );
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [cache, setCache] = useState<Map<string, DayData>>(new Map());
  const [loadingDates, setLoadingDates] = useState<Set<string>>(new Set());
  const [timezone, setTimezone] = useState("Asia/Tokyo");
  const inFlightRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    setTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone);
  }, []);

  const fetchDays = useCallback(
    async (startDateStr: string, days: number) => {
      const dateKeys: string[] = [];
      const baseDate = new Date(`${startDateStr}T00:00:00`);
      for (let i = 0; i < days; i++) {
        dateKeys.push(format(addDays(baseDate, i), "yyyy-MM-dd"));
      }
      // Skip dates already cached or in-flight
      const toFetch = dateKeys.filter(
        (d) => !cache.has(d) && !inFlightRef.current.has(d)
      );
      if (toFetch.length === 0) return;

      toFetch.forEach((d) => inFlightRef.current.add(d));
      setLoadingDates((prev) => {
        const next = new Set(prev);
        toFetch.forEach((d) => next.add(d));
        return next;
      });

      try {
        const res = await fetch(
          `/api/availability?eventTypeId=${eventType.id}&date=${startDateStr}&days=${days}&timezone=${timezone}`
        );
        if (res.ok) {
          const data = await res.json();
          const arr: Array<{ date: string; slots?: TimeSlot[]; windows?: FlexibleWindow[] }> =
            data.days || [];
          setCache((prev) => {
            const next = new Map(prev);
            for (const d of arr) {
              next.set(d.date, {
                slots: d.slots || [],
                windows: d.windows || [],
              });
            }
            return next;
          });
        }
      } catch {
        // network error: leave dates uncached so a retry can happen
      } finally {
        toFetch.forEach((d) => inFlightRef.current.delete(d));
        setLoadingDates((prev) => {
          const next = new Set(prev);
          toFetch.forEach((d) => next.delete(d));
          return next;
        });
      }
    },
    [eventType.id, timezone, cache]
  );

  // Prefetch the bookable portion of the currently displayed month whenever
  // the user navigates months. Clamped to bookable window so we never query
  // dates that are definitively unbookable.
  useEffect(() => {
    if (!timezone) return;
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    const start =
      monthStart.getTime() < bookableWindow.earliest.getTime()
        ? startOfDay(bookableWindow.earliest)
        : monthStart;
    const end =
      monthEnd.getTime() > bookableWindow.latest.getTime()
        ? bookableWindow.latest
        : monthEnd;
    if (end.getTime() < start.getTime()) return;
    const days = Math.min(differenceInCalendarDays(end, start) + 1, 31);
    if (days <= 0) return;
    fetchDays(format(start, "yyyy-MM-dd"), days);
  }, [currentMonth, timezone, bookableWindow, fetchDays]);

  // When user selects a date: fetch immediately if not cached (jumps the queue)
  useEffect(() => {
    if (!selectedDate) return;
    const key = format(selectedDate, "yyyy-MM-dd");
    if (!cache.has(key) && !inFlightRef.current.has(key)) {
      fetchDays(key, 1);
    }
  }, [selectedDate, cache, fetchDays]);

  const selectedKey = selectedDate ? format(selectedDate, "yyyy-MM-dd") : null;
  const dayData = selectedKey ? cache.get(selectedKey) : null;
  const loading = selectedKey ? loadingDates.has(selectedKey) && !dayData : false;
  const slots = dayData?.slots || [];
  const windows = dayData?.windows || [];

  async function navigateToConfirm(startIso: string) {
    const params = new URLSearchParams({
      slot: startIso,
      timezone,
    });
    // Pre-decide the assignee at slot click so the final POST can skip the
    // redundant Google FreeBusy re-check. Pick from the slot's known candidates.
    const dayKey = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .formatToParts(new Date(startIso))
      .reduce<Record<string, string>>((acc, p) => {
        acc[p.type] = p.value;
        return acc;
      }, {});
    const isoDate = `${dayKey.year}-${dayKey.month}-${dayKey.day}`;
    const cached = cache.get(isoDate);
    let candidates: string[] = [];
    if (cached) {
      if (eventType.slotMode === "fixed_slots") {
        const match = cached.slots.find((s) => s.startTime === startIso);
        if (match?.availableUserIds) candidates = match.availableUserIds;
      } else {
        const t = new Date(startIso).getTime();
        const match = cached.windows.find(
          (w) =>
            t >= new Date(w.startTime).getTime() &&
            t <= new Date(w.latestStartTime).getTime()
        );
        if (match?.availableUserIds) candidates = match.availableUserIds;
      }
    }
    let chosenAssignee: string | null = null;
    if (candidates.length > 0) {
      chosenAssignee =
        candidates[Math.floor(Math.random() * candidates.length)];
      params.set("assignee", chosenAssignee);
    }

    // 仮押さえ: 選択の瞬間にサーバー側で hold を取り、他の予約者を弾く
    if (chosenAssignee) {
      try {
        const holdRes = await fetch("/api/bookings/hold", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            eventTypeId: eventType.id,
            startTime: startIso,
            assignedUserId: chosenAssignee,
            guestTimezone: timezone,
          }),
        });
        if (holdRes.ok) {
          const hold = await holdRes.json();
          if (hold.holdId) params.set("hold", hold.holdId);
        }
        // hold 失敗 (409 など) は無視して確認画面に進む。POST時に最終検証が走る
      } catch {
        // ネットワークエラーも無視
      }
    }

    const urlParams = new URLSearchParams(window.location.search);
    const rescheduleId = urlParams.get("reschedule");
    const rescheduleToken = urlParams.get("token");
    if (rescheduleId) params.set("reschedule", rescheduleId);
    if (rescheduleToken) params.set("token", rescheduleToken);
    // Works for both /<username>/<slug> and /b/<slug> — just tack /confirm on
    const currentPath = window.location.pathname.replace(/\/$/, "");
    router.push(`${currentPath}/confirm?${params}`);
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
          <h1 className="text-2xl font-bold">{eventType.title}</h1>
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
                    bookableWindow.earliest
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
                  disabled={isAfter(
                    startOfMonth(addMonths(currentMonth, 1)),
                    bookableWindow.latest
                  )}
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
                  // Out of booking window — known unbookable without server check
                  const isOutsideWindow =
                    isBefore(endOfDay(day), bookableWindow.earliest) ||
                    isAfter(startOfDay(day), bookableWindow.latest);
                  const isSelected =
                    selectedDate &&
                    format(day, "yyyy-MM-dd") ===
                      format(selectedDate, "yyyy-MM-dd");
                  const dayKey = format(day, "yyyy-MM-dd");
                  const cached = cache.get(dayKey);
                  const isPrefetching = loadingDates.has(dayKey);
                  const cachedCount = cached
                    ? eventType.slotMode === "fixed_slots"
                      ? cached.slots.length
                      : cached.windows.length
                    : null;
                  const isCachedEmpty = cached !== undefined && cachedCount === 0;
                  const isDisabled = isPast || isOutsideWindow || isCachedEmpty;
                  return (
                    <button
                      key={day.toISOString()}
                      className={`
                        relative aspect-square flex items-center justify-center rounded-md text-sm
                        transition-colors
                        ${isDisabled ? "text-muted-foreground/40 cursor-not-allowed" : "hover:bg-primary/10 cursor-pointer"}
                        ${isSelected ? "bg-primary text-primary-foreground hover:bg-primary" : ""}
                        ${isToday(day) && !isSelected ? "border border-primary" : ""}
                      `}
                      disabled={isDisabled}
                      title={
                        isOutsideWindow
                          ? "予約可能期間外"
                          : isPast
                          ? "過去の日付"
                          : cached
                          ? `空き ${cachedCount} ${eventType.slotMode === "fixed_slots" ? "スロット" : "時間帯"}`
                          : isPrefetching
                          ? "読み込み中..."
                          : undefined
                      }
                      onMouseEnter={() => {
                        // Prefetch on hover if inside window, not cached, not in flight
                        if (
                          !isDisabled &&
                          !cache.has(dayKey) &&
                          !inFlightRef.current.has(dayKey)
                        ) {
                          fetchDays(dayKey, 1);
                        }
                      }}
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
