"use client";

import { useState, use } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

export default function ConfirmBookingPage({
  params,
}: {
  params: Promise<{ username: string; eventSlug: string }>;
}) {
  const { username, eventSlug } = use(params);
  const searchParams = useSearchParams();
  const router = useRouter();

  const slotStart = searchParams.get("slot");
  const timezone = searchParams.get("timezone") || "Asia/Tokyo";
  const eventTypeId = searchParams.get("eventTypeId") || "";

  const [form, setForm] = useState({
    guestName: "",
    guestEmail: "",
    guestNotes: "",
  });
  const [submitting, setSubmitting] = useState(false);

  if (!slotStart) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">無効なリンクです</p>
      </div>
    );
  }

  const startDate = new Date(slotStart);
  const formatDateTime = (date: Date) =>
    new Intl.DateTimeFormat("ja-JP", {
      year: "numeric",
      month: "long",
      day: "numeric",
      weekday: "long",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: timezone,
      hour12: false,
    }).format(date);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);

    try {
      // First, we need to get the eventTypeId from the URL
      // Fetch event type info using username and slug
      const eventRes = await fetch(
        `/api/booking-info?username=${username}&slug=${eventSlug}`
      );
      if (!eventRes.ok) {
        toast.error("イベント情報の取得に失敗しました");
        return;
      }
      const eventData = await eventRes.json();

      const res = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventTypeId: eventData.eventTypeId,
          startTime: slotStart,
          guestName: form.guestName,
          guestEmail: form.guestEmail,
          guestTimezone: timezone,
          guestNotes: form.guestNotes || undefined,
        }),
      });

      if (res.ok) {
        const booking = await res.json();
        router.push(`/booking-success/${booking.id}`);
      } else {
        const data = await res.json();
        toast.error(data.error || "予約に失敗しました");
      }
    } catch {
      toast.error("予約に失敗しました");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center py-8 px-4">
      <div className="w-full max-w-md">
        <Card>
          <CardHeader>
            <CardTitle>予約の確認</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="mb-6 p-4 bg-muted rounded-lg">
              <p className="font-medium">{formatDateTime(startDate)}</p>
              <p className="text-sm text-muted-foreground mt-1">
                タイムゾーン: {timezone}
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label htmlFor="name">お名前</Label>
                <Input
                  id="name"
                  value={form.guestName}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      guestName: e.target.value,
                    }))
                  }
                  placeholder="山田太郎"
                  required
                />
              </div>
              <div>
                <Label htmlFor="email">メールアドレス</Label>
                <Input
                  id="email"
                  type="email"
                  value={form.guestEmail}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      guestEmail: e.target.value,
                    }))
                  }
                  placeholder="you@example.com"
                  required
                />
              </div>
              <div>
                <Label htmlFor="notes">メモ（任意）</Label>
                <Textarea
                  id="notes"
                  value={form.guestNotes}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      guestNotes: e.target.value,
                    }))
                  }
                  placeholder="事前に共有したいことがあればこちらに"
                  rows={3}
                />
              </div>
              <Button
                type="submit"
                className="w-full"
                disabled={submitting}
              >
                {submitting ? "予約中..." : "予約を確定する"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <div className="text-center mt-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.back()}
          >
            戻って日時を変更する
          </Button>
        </div>
      </div>
    </div>
  );
}
