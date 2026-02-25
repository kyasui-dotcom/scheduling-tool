"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface MemberInfo {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
  username: string | null;
}

interface EventWithMembers {
  id: string;
  title: string;
  slug: string;
  schedulingMode: string;
  isActive: boolean;
  color: string;
  members: MemberInfo[];
}

export default function MembersPage() {
  const [events, setEvents] = useState<EventWithMembers[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/events/with-members");
        if (res.ok) {
          const data = await res.json();
          setEvents(data);
        }
      } catch {
        console.error("Failed to load events");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  function getModeLabel(mode: string) {
    switch (mode) {
      case "any_available":
        return "誰かが空いていればOK";
      case "all_available":
        return "全員空いている時のみ";
      case "specific_person":
        return "指定メンバーのみ";
      default:
        return mode;
    }
  }

  function getModeBadgeVariant(mode: string) {
    switch (mode) {
      case "any_available":
        return "default" as const;
      case "all_available":
        return "secondary" as const;
      default:
        return "outline" as const;
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <p className="text-muted-foreground">読み込み中...</p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">チームメンバー管理</h1>
        <p className="text-muted-foreground">
          各イベントタイプに割り当てられたメンバーを確認・管理できます
        </p>
      </div>

      {events.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground mb-4">
              イベントタイプがまだありません
            </p>
            <Link href="/events/new">
              <Button>イベントタイプを作成</Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {events.map((event) => (
            <Card key={event.id}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: event.color }}
                    />
                    <CardTitle className="text-base">{event.title}</CardTitle>
                    {!event.isActive && (
                      <Badge variant="outline" className="text-xs">
                        無効
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={getModeBadgeVariant(event.schedulingMode)}>
                      {getModeLabel(event.schedulingMode)}
                    </Badge>
                    <Link href={`/events/${event.id}`}>
                      <Button variant="ghost" size="sm">
                        編集
                      </Button>
                    </Link>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground font-medium">
                    メンバー ({event.members.length}名)
                  </p>
                  {event.members.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      メンバーが登録されていません
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {event.members.map((member) => (
                        <div
                          key={member.id}
                          className="flex items-center gap-2 bg-muted rounded-lg px-3 py-1.5"
                        >
                          {member.image ? (
                            <img
                              src={member.image}
                              alt=""
                              className="w-5 h-5 rounded-full"
                            />
                          ) : (
                            <div className="w-5 h-5 rounded-full bg-muted-foreground/20 flex items-center justify-center text-[9px] font-medium">
                              {(member.name || member.email)[0].toUpperCase()}
                            </div>
                          )}
                          <div>
                            <p className="text-sm font-medium leading-tight">
                              {member.name || "名前未設定"}
                            </p>
                            <p className="text-[10px] text-muted-foreground leading-tight">
                              {member.email}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
