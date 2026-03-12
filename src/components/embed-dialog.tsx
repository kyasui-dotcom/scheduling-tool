"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";

interface EmbedDialogProps {
  username: string;
  slug: string;
  appUrl: string;
}

export function EmbedDialog({ username, slug, appUrl }: EmbedDialogProps) {
  const [width, setWidth] = useState("100%");
  const [height, setHeight] = useState("700");

  const embedUrl = `${appUrl}/embed/${username}/${slug}`;
  const iframeCode = `<iframe src="${embedUrl}" width="${width}" height="${height}px" frameborder="0" style="border: 1px solid #e5e7eb; border-radius: 8px;"></iframe>`;
  const linkCode = `<a href="${appUrl}/${username}/${slug}" target="_blank" style="display:inline-block;padding:12px 24px;background:#6366f1;color:white;border-radius:8px;text-decoration:none;font-weight:500;">予約する</a>`;

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text);
    toast.success("コピーしました");
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          埋め込み
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>埋め込みコード</DialogTitle>
        </DialogHeader>
        <div className="space-y-6">
          {/* Inline embed */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold">
              インライン埋め込み（iframe）
            </h3>
            <p className="text-xs text-muted-foreground">
              自社サイトにカレンダーを直接埋め込みます
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">横幅</Label>
                <Input
                  value={width}
                  onChange={(e) => setWidth(e.target.value)}
                  placeholder="100%"
                />
              </div>
              <div>
                <Label className="text-xs">高さ (px)</Label>
                <Input
                  value={height}
                  onChange={(e) => setHeight(e.target.value)}
                  placeholder="700"
                />
              </div>
            </div>
            <div className="relative">
              <pre className="bg-muted p-3 rounded-lg text-xs overflow-x-auto whitespace-pre-wrap break-all">
                {iframeCode}
              </pre>
              <Button
                variant="secondary"
                size="sm"
                className="absolute top-2 right-2"
                onClick={() => copyToClipboard(iframeCode)}
              >
                コピー
              </Button>
            </div>
          </div>

          {/* Button link */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold">予約ボタンリンク</h3>
            <p className="text-xs text-muted-foreground">
              サイトに予約ボタンを設置します。クリックすると予約ページが開きます。
            </p>
            <div className="relative">
              <pre className="bg-muted p-3 rounded-lg text-xs overflow-x-auto whitespace-pre-wrap break-all">
                {linkCode}
              </pre>
              <Button
                variant="secondary"
                size="sm"
                className="absolute top-2 right-2"
                onClick={() => copyToClipboard(linkCode)}
              >
                コピー
              </Button>
            </div>
          </div>

          {/* Direct URL */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold">直接リンク</h3>
            <div className="flex gap-2">
              <Input
                value={`${appUrl}/${username}/${slug}`}
                readOnly
                className="text-xs font-mono"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  copyToClipboard(`${appUrl}/${username}/${slug}`)
                }
              >
                コピー
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
