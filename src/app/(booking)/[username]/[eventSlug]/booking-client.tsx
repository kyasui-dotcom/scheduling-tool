"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { format, addMonths, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isToday, isBefore, startOfDay } from "date-fns";
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

export function BookingClient({ eventType, organizer }: Props) {
  const router = useRouter();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [slots, setSlots] = useState<TimeSlot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [timezone, setTimezone] = useState("Asia/Tokyo");

  useEffect(() => {
    const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
    setTimezone(detected);
  }, []);

  const fetchSlots = useCallback(
    async (date: Date) => {
      setLoadingSlots(true);
      try {
        const dateStr = format(date, "yyyy-MM-dd");
        const res = await fetch(
          `/api/availability?eventTypeId=${eventType.id}&date=${dateStr}&timezone=${timezone}`
        );
        if (res.ok) {
          const data = await res.json();
          setSlots(data.slots || []);
        }
      } catch {
        setSlots([]);
      } finally {
        setLoadingSlots(false);
      }
    },
    [eventType.id, timezone]
  );

  useEffect(() => {
    if (selectedDate) {
      fetchSlots(selectedDate);
    }
  }, [selectedDate, fetchSlots]);

  function handleSelectSlot(slot: TimeSlot) {
    const params = new URLSearchParams({
      slot: slot.startTime,
      timezone,
    });
    router.push(`/${organizer.username}/${eventType.id}/confirm?${params}`);
    // Use eventSlug from URL for the confirm page
    const pathParts = window.location.pathname.split("/");
    const eventSlug = pathParts[pathParts.length - 1];
    router.push(
      `/${organizer.username}/${eventSlug}/confirm?${params}`
    );
  }

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });

  // Pad with days from previous month to start on Monday
  const startDayOfWeek = monthStart.getDay();
  const padBefore = startDayOfWeek === 0 ? 6 : startDayOfWeek - 1;

  const formatTime = (isoString: string) =>
    new Intl.DateTimeFormat("ja-JP", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: timezone,
      hour12: false,
    }).format(new Date(isoString));

  return (
    <div className="min-h-screen py-8 px-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
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
            <p className="text-muted-foreground mt-1">
              {eventType.description}
            </p>
          )}
          <Badge variant="secondary" className="mt-2">
            {eventType.durationMinutes}分
          </Badge>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Calendar */}
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    setCurrentMonth(addMonths(currentMonth, -1))
                  }
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
                  onClick={() =>
                    setCurrentMonth(addMonths(currentMonth, 1))
                  }
                >
                  &gt;
                </Button>
              </div>

              {/* Day headers */}
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

              {/* Days */}
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

          {/* Time Slots */}
          <div>
            {!selectedDate ? (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                日付を選択してください
              </div>
            ) : loadingSlots ? (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                空き時間を取得中...
              </div>
            ) : slots.length === 0 ? (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                この日は空きがありません
              </div>
            ) : (
              <div>
                <h3 className="font-medium mb-3">
                  {format(selectedDate, "M月d日(E)", { locale: ja })}
                  の空き時間
                </h3>
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {slots.map((slot) => (
                    <Button
                      key={slot.startTime}
                      variant="outline"
                      className="w-full justify-start text-left"
                      onClick={() => handleSelectSlot(slot)}
                    >
                      <span className="font-mono">
                        {formatTime(slot.startTime)} -{" "}
                        {formatTime(slot.endTime)}
                      </span>
                    </Button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
