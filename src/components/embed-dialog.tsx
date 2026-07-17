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

  const publicUrl = `${appUrl}/b/${slug}`;
  const embedUrl = `${appUrl}/embed/b/${slug}`;
  const widgetScript = `<script src="${appUrl}/widget.js" async></script>`;

  // Tag-based install: modal popup on button click
  const popupTagCode = `${widgetScript}
<button data-schedule="${embedUrl}" style="padding:12px 24px;background:#6366f1;color:#fff;border:0;border-radius:8px;font-weight:500;cursor:pointer;">予約する</button>`;

  // Tag-based install: inline calendar rendered into a container
  const inlineTagCode = `${widgetScript}
<div data-schedule-inline="${embedUrl}" data-schedule-height="${height}" style="width:${width};"></div>`;

  const linkCode = `<a href="${publicUrl}" target="_blank" style="display:inline-block;padding:12px 24px;background:#6366f1;color:white;border-radius:8px;text-decoration:none;font-weight:500;">予約する</a>`;

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
          {/* Tag install: modal popup */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold">
              モーダル予約タグ（ボタン + ポップアップ）
            </h3>
            <p className="text-xs text-muted-foreground">
              サイトに設置したボタンをクリックすると、予約カレンダーがポップアップで開きます。1タグでOK・複数ボタンも可・ESCで閉じる。
            </p>
            <div className="relative">
              <pre className="bg-muted p-3 rounded-lg text-xs overflow-x-auto whitespace-pre-wrap break-all max-h-40">
                {popupTagCode}
              </pre>
              <Button
                variant="secondary"
                size="sm"
                className="absolute top-2 right-2"
                onClick={() => copyToClipboard(popupTagCode)}
              >
                コピー
              </Button>
            </div>
          </div>

          {/* Tag install: inline calendar */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold">
              カレンダー表示タグ（インライン）
            </h3>
            <p className="text-xs text-muted-foreground">
              指定した要素の中に予約カレンダーを直接表示します。サイズは調整可能。
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
                {inlineTagCode}
              </pre>
              <Button
                variant="secondary"
                size="sm"
                className="absolute top-2 right-2"
                onClick={() => copyToClipboard(inlineTagCode)}
              >
                コピー
              </Button>
            </div>
          </div>

          {/* Button link (page navigation) */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold">
              予約ボタンリンク（ページ移動）
            </h3>
            <p className="text-xs text-muted-foreground">
              サイトに予約ボタンを設置します。クリックすると別タブで予約ページが開きます。
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
                value={publicUrl}
                readOnly
                className="text-xs font-mono"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => copyToClipboard(publicUrl)}
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
