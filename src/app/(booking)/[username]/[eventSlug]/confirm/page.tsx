"use client";

import { useState, useEffect, use } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

interface CustomQuestion {
  id: string;
  question: string;
  type: "text" | "textarea" | "radio" | "checkbox" | "select" | "phone" | "number";
  required: boolean;
  description?: string;
  placeholder?: string;
  options?: string[];
}

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
  const rescheduleId = searchParams.get("reschedule");
  const rescheduleToken = searchParams.get("token");

  const [form, setForm] = useState({
    guestName: "",
    guestEmail: "",
    guestNotes: "",
  });
  const [customQuestions, setCustomQuestions] = useState<CustomQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    async function loadEventInfo() {
      try {
        const res = await fetch(
          `/api/booking-info?username=${username}&slug=${eventSlug}`
        );
        if (res.ok) {
          const data = await res.json();
          if (data.customQuestions && data.customQuestions.length > 0) {
            setCustomQuestions(data.customQuestions);
          }
        }
      } catch {
        // ignore
      }
    }
    loadEventInfo();
  }, [username, eventSlug]);

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
      const eventRes = await fetch(
        `/api/booking-info?username=${username}&slug=${eventSlug}`
      );
      if (!eventRes.ok) {
        toast.error("イベント情報の取得に失敗しました");
        return;
      }
      const eventData = await eventRes.json();

      const guestAnswers = customQuestions
        .filter((q) => {
          const val = answers[q.id];
          if (Array.isArray(val)) return val.length > 0;
          return !!val;
        })
        .map((q) => ({
          questionId: q.id,
          answer: answers[q.id],
        }));

      // If rescheduling, cancel old booking first
      if (rescheduleId && rescheduleToken) {
        await fetch(`/api/bookings/${rescheduleId}/cancel`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            reason: "リスケジュール",
            token: rescheduleToken,
          }),
        });
      }

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
          guestAnswers: guestAnswers.length > 0 ? guestAnswers : undefined,
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
            <CardTitle>
              {rescheduleId ? "予約の日時変更" : "予約の確認"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="mb-6 p-4 bg-muted rounded-lg">
              <p className="font-medium">{formatDateTime(startDate)}</p>
              <p className="text-sm text-muted-foreground mt-1">
                タイムゾーン: {timezone}
              </p>
              {rescheduleId && (
                <p className="text-xs text-amber-600 mt-1">
                  ※ 元の予約はキャンセルされ、新しい日時で再予約されます
                </p>
              )}
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

              {customQuestions.map((q) => (
                <div key={q.id} className="space-y-1.5">
                  <Label htmlFor={`q-${q.id}`}>
                    {q.question}
                    {q.required && (
                      <span className="text-destructive ml-1">*</span>
                    )}
                  </Label>
                  {q.description && (
                    <p className="text-xs text-muted-foreground">
                      {q.description}
                    </p>
                  )}

                  {/* Text input */}
                  {(!q.type || q.type === "text") && (
                    <Input
                      id={`q-${q.id}`}
                      value={(answers[q.id] as string) || ""}
                      onChange={(e) =>
                        setAnswers((prev) => ({
                          ...prev,
                          [q.id]: e.target.value,
                        }))
                      }
                      placeholder={q.placeholder || ""}
                      required={q.required}
                    />
                  )}

                  {/* Textarea */}
                  {q.type === "textarea" && (
                    <Textarea
                      id={`q-${q.id}`}
                      value={(answers[q.id] as string) || ""}
                      onChange={(e) =>
                        setAnswers((prev) => ({
                          ...prev,
                          [q.id]: e.target.value,
                        }))
                      }
                      placeholder={q.placeholder || ""}
                      rows={3}
                      required={q.required}
                    />
                  )}

                  {/* Radio buttons */}
                  {q.type === "radio" && (
                    <div className="space-y-2 pt-1">
                      {(q.options || []).map((opt, i) => (
                        <label
                          key={i}
                          className="flex items-center gap-2.5 text-sm cursor-pointer hover:bg-muted/50 rounded px-2 py-1.5 -mx-2"
                        >
                          <input
                            type="radio"
                            name={`q-${q.id}`}
                            value={opt}
                            checked={(answers[q.id] as string) === opt}
                            onChange={() =>
                              setAnswers((prev) => ({
                                ...prev,
                                [q.id]: opt,
                              }))
                            }
                            required={q.required}
                            className="accent-primary"
                          />
                          {opt}
                        </label>
                      ))}
                    </div>
                  )}

                  {/* Checkboxes (multiple selection) */}
                  {q.type === "checkbox" && (
                    <div className="space-y-2 pt-1">
                      {(q.options || []).map((opt, i) => {
                        const selected = (answers[q.id] as string[]) || [];
                        const isChecked = selected.includes(opt);
                        return (
                          <label
                            key={i}
                            className="flex items-center gap-2.5 text-sm cursor-pointer hover:bg-muted/50 rounded px-2 py-1.5 -mx-2"
                          >
                            <input
                              type="checkbox"
                              value={opt}
                              checked={isChecked}
                              onChange={() => {
                                setAnswers((prev) => {
                                  const current =
                                    (prev[q.id] as string[]) || [];
                                  const updated = isChecked
                                    ? current.filter((v) => v !== opt)
                                    : [...current, opt];
                                  return { ...prev, [q.id]: updated };
                                });
                              }}
                              className="accent-primary rounded"
                            />
                            {opt}
                          </label>
                        );
                      })}
                      {q.required && (
                        <input
                          type="text"
                          className="sr-only"
                          tabIndex={-1}
                          required={
                            q.required &&
                            ((answers[q.id] as string[]) || []).length === 0
                          }
                          value={
                            ((answers[q.id] as string[]) || []).length > 0
                              ? "ok"
                              : ""
                          }
                          onChange={() => {}}
                        />
                      )}
                    </div>
                  )}

                  {/* Dropdown select */}
                  {q.type === "select" && (
                    <Select
                      value={(answers[q.id] as string) || ""}
                      onValueChange={(v) =>
                        setAnswers((prev) => ({ ...prev, [q.id]: v }))
                      }
                      required={q.required}
                    >
                      <SelectTrigger id={`q-${q.id}`}>
                        <SelectValue placeholder="選択してください" />
                      </SelectTrigger>
                      <SelectContent>
                        {(q.options || []).map((opt, i) => (
                          <SelectItem key={i} value={opt}>
                            {opt}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}

                  {/* Phone */}
                  {q.type === "phone" && (
                    <Input
                      id={`q-${q.id}`}
                      type="tel"
                      value={(answers[q.id] as string) || ""}
                      onChange={(e) =>
                        setAnswers((prev) => ({
                          ...prev,
                          [q.id]: e.target.value,
                        }))
                      }
                      placeholder={q.placeholder || "090-1234-5678"}
                      required={q.required}
                    />
                  )}

                  {/* Number */}
                  {q.type === "number" && (
                    <Input
                      id={`q-${q.id}`}
                      type="number"
                      value={(answers[q.id] as string) || ""}
                      onChange={(e) =>
                        setAnswers((prev) => ({
                          ...prev,
                          [q.id]: e.target.value,
                        }))
                      }
                      placeholder={q.placeholder || ""}
                      required={q.required}
                    />
                  )}
                </div>
              ))}

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
                {submitting
                  ? "予約中..."
                  : rescheduleId
                  ? "日時を変更して予約する"
                  : "予約を確定する"}
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
