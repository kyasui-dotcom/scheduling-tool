"use client";

import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { ja } from "date-fns/locale";

interface Props {
  memberUserIds: string[];
  durationMinutes: number;
  schedulingMode: "any_available" | "all_available" | "specific_person";
  slotMode: "fixed_slots" | "flexible_start";
  bufferBeforeMinutes?: number;
  bufferAfterMinutes?: number;
  minNoticeMinutes?: number;
  maxAdvanceDays?: number;
  excludeEventTypeId?: string;
  businessHours?:
    | Array<{ dayOfWeek: string; startTime: string; endTime: string }>
    | null;
}

interface DayResult {
  date: string;
  slotCount: number;
  firstStart?: string;
  lastEnd?: string;
}

export function AvailabilityPreview({
  memberUserIds,
  durationMinutes,
  schedulingMode,
  slotMode,
  bufferBeforeMinutes,
  bufferAfterMinutes,
  minNoticeMinutes,
  maxAdvanceDays,
  excludeEventTypeId,
  businessHours,
}: Props) {
  const [days, setDays] = useState<DayResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [timezone, setTimezone] = useState("Asia/Tokyo");

  useEffect(() => {
    setTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone);
  }, []);

  const fetchPreview = useCallback(async () => {
    if (memberUserIds.length === 0) return;
    setLoading(true);
    setError(null);
    try {
      const startDate = format(new Date(), "yyyy-MM-dd");
      const res = await fetch("/api/availability/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          memberUserIds,
          durationMinutes,
          schedulingMode,
          slotMode,
          bufferBeforeMinutes,
          bufferAfterMinutes,
          minNoticeMinutes,
          maxAdvanceDays,
          timezone,
          startDate,
          days: 7,
          excludeEventTypeId,
          businessHours,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setDays(data.days);
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error || `HTTP ${res.status}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "プレビュー取得に失敗");
    } finally {
      setLoading(false);
    }
  }, [
    memberUserIds,
    durationMinutes,
    schedulingMode,
    slotMode,
    bufferBeforeMinutes,
    bufferAfterMinutes,
    minNoticeMinutes,
    maxAdvanceDays,
    timezone,
    excludeEventTypeId,
    businessHours,
  ]);

  const formatTime = (iso: string) =>
    new Intl.DateTimeFormat("ja-JP", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: timezone,
      hour12: false,
    }).format(new Date(iso));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          現在の設定で先方が予約可能な空き状況（次の7日間 / {timezone}）
        </p>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={fetchPreview}
          disabled={loading || memberUserIds.length === 0}
        >
          {loading ? "計算中..." : days.length > 0 ? "再計算" : "プレビュー"}
        </Button>
      </div>

      {error && (
        <p className="text-xs text-destructive">エラー: {error}</p>
      )}

      {days.length === 0 && !loading && !error && (
        <p className="text-xs text-muted-foreground">
          「プレビュー」を押すと、現在のメンバー構成・所要時間・スケジューリングモードに基づいた空き状況を表示します
        </p>
      )}

      {days.length > 0 && (
        <div className="grid grid-cols-7 gap-1">
          {days.map((d) => {
            const date = new Date(`${d.date}T12:00:00Z`);
            const hasSlots = d.slotCount > 0;
            return (
              <div
                key={d.date}
                className={`rounded-md border p-2 text-center ${
                  hasSlots
                    ? "bg-primary/5 border-primary/20"
                    : "bg-muted/30 text-muted-foreground"
                }`}
              >
                <div className="text-[10px]">
                  {format(date, "M/d(E)", { locale: ja })}
                </div>
                <div className="text-base font-bold mt-1">
                  {d.slotCount}
                </div>
                <div className="text-[10px] text-muted-foreground">
                  {slotMode === "fixed_slots" ? "スロット" : "時間帯"}
                </div>
                {hasSlots && d.firstStart && d.lastEnd && (
                  <div className="text-[9px] font-mono mt-1 text-muted-foreground">
                    {formatTime(d.firstStart)}-{formatTime(d.lastEnd)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
