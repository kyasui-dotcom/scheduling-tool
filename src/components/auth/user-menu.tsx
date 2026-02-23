"use client";

import { signOut, useSession } from "next-auth/react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

export function UserMenu() {
  const { data: session } = useSession();

  if (!session?.user) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="gap-2">
          {session.user.image && (
            <img
              src={session.user.image}
              alt=""
              className="h-6 w-6 rounded-full"
            />
          )}
          <span className="text-sm">{session.user.name}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem className="text-sm text-muted-foreground">
          {session.user.email}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => signOut({ callbackUrl: "/" })}>
          サインアウト
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
