"use client";

import { useState, useEffect, use } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

interface BookingInfo {
  id: string;
  guestName: string;
  guestEmail: string;
  startTime: string;
  endTime: string;
  guestTimezone: string;
  status: string;
  meetingUrl: string | null;
  meetingPlatform: string | null;
  eventTitle: string;
  organizerName: string;
  durationMinutes: number;
  eventTypeId: string;
  slug: string;
  username: string;
}

export default function BookingManagePage({
  params,
}: {
  params: Promise<{ bookingId: string }>;
}) {
  const { bookingId } = use(params);
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get("token");

  const [booking, setBooking] = useState<BookingInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState(false);
  const [showCancelForm, setShowCancelForm] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelled, setCancelled] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(
          `/api/bookings/${bookingId}/guest-info?token=${token || ""}`
        );
        if (res.ok) {
          const data = await res.json();
          setBooking(data);
          if (data.status === "cancelled") {
            setCancelled(true);
          }
        }
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [bookingId, token]);

  async function handleCancel() {
    setCancelling(true);
    try {
      const res = await fetch(`/api/bookings/${bookingId}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reason: cancelReason || undefined,
          token,
        }),
      });
      if (res.ok) {
        setCancelled(true);
      }
    } catch {
      // ignore
    } finally {
      setCancelling(false);
    }
  }

  function handleReschedule() {
    if (!booking) return;
    router.push(
      `/${booking.username}/${booking.slug}?reschedule=${bookingId}&token=${token}`
    );
  }

  const formatDateTime = (dateStr: string, tz: string) =>
    new Intl.DateTimeFormat("ja-JP", {
      year: "numeric",
      month: "long",
      day: "numeric",
      weekday: "long",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: tz,
      hour12: false,
    }).format(new Date(dateStr));

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">読み込み中...</p>
      </div>
    );
  }

  if (!booking) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">
              予約が見つからないか、アクセス権限がありません。
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center py-8 px-4">
      <div className="w-full max-w-md">
        <Card>
          <CardHeader className="text-center">
            {cancelled ? (
              <>
                <div className="text-4xl mb-2">&#10005;</div>
                <CardTitle>予約がキャンセルされました</CardTitle>
              </>
            ) : (
              <>
                <div className="text-4xl mb-2">&#128197;</div>
                <CardTitle>予約の管理</CardTitle>
              </>
            )}
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Booking details */}
            <div className="bg-muted rounded-lg p-4 space-y-2">
              <h3 className="font-semibold">{booking.eventTitle}</h3>
              <p className="text-sm">
                {booking.organizerName} さんとのミーティング
              </p>
              <p className="text-sm font-medium">
                {formatDateTime(booking.startTime, booking.guestTimezone)}
              </p>
              <p className="text-xs text-muted-foreground">
                {booking.durationMinutes}分 | タイムゾーン:{" "}
                {booking.guestTimezone}
              </p>
              <div className="flex items-center gap-2 mt-2">
                <Badge
                  variant={cancelled ? "destructive" : "default"}
                >
                  {cancelled ? "キャンセル済み" : "確定"}
                </Badge>
              </div>
            </div>

            {booking.meetingUrl && !cancelled && (
              <div className="space-y-2">
                <h4 className="text-sm font-medium">会議リンク</h4>
                <a
                  href={booking.meetingUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-primary hover:underline break-all"
                >
                  {booking.meetingUrl}
                </a>
              </div>
            )}

            {!cancelled && (
              <div className="space-y-3">
                {!showCancelForm ? (
                  <div className="flex flex-col gap-2">
                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={handleReschedule}
                    >
                      日時を変更する（リスケ）
                    </Button>
                    <Button
                      variant="destructive"
                      className="w-full"
                      onClick={() => setShowCancelForm(true)}
                    >
                      予約をキャンセルする
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3 border rounded-lg p-4">
                    <p className="text-sm font-medium">
                      本当にキャンセルしますか？
                    </p>
                    <div>
                      <Label htmlFor="reason">
                        キャンセル理由（任意）
                      </Label>
                      <Textarea
                        id="reason"
                        value={cancelReason}
                        onChange={(e) => setCancelReason(e.target.value)}
                        placeholder="キャンセルの理由があれば入力してください"
                        rows={2}
                      />
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="destructive"
                        className="flex-1"
                        onClick={handleCancel}
                        disabled={cancelling}
                      >
                        {cancelling ? "処理中..." : "キャンセルする"}
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => setShowCancelForm(false)}
                      >
                        戻る
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
