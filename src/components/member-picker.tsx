"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

interface Member {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
  username: string | null;
}

interface MemberPickerProps {
  selectedMembers: Member[];
  onMembersChange: (members: Member[]) => void;
  schedulingMode: string;
}

export function MemberPicker({
  selectedMembers,
  onMembersChange,
  schedulingMode,
}: MemberPickerProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Member[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const searchUsers = useCallback(
    async (query: string) => {
      if (query.length < 2) {
        setSearchResults([]);
        setHasSearched(false);
        return;
      }

      setIsSearching(true);
      setHasSearched(false);
      try {
        const res = await fetch(
          `/api/users/search?q=${encodeURIComponent(query)}`
        );
        if (res.ok) {
          const data: Member[] = await res.json();
          // Filter out already selected members
          const filtered = data.filter(
            (user) => !selectedMembers.some((m) => m.id === user.id)
          );
          setSearchResults(filtered);
        }
      } catch {
        console.error("Search failed");
      } finally {
        setIsSearching(false);
        setHasSearched(true);
      }
    },
    [selectedMembers]
  );

  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    if (searchQuery.length >= 2) {
      searchTimeoutRef.current = setTimeout(() => {
        searchUsers(searchQuery);
      }, 300);
    } else {
      setSearchResults([]);
      setHasSearched(false);
    }

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [searchQuery, searchUsers]);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function addMember(member: Member) {
    onMembersChange([...selectedMembers, member]);
    setSearchQuery("");
    setSearchResults([]);
    setShowDropdown(false);
    setHasSearched(false);
    inputRef.current?.focus();
  }

  function removeMember(memberId: string) {
    onMembersChange(selectedMembers.filter((m) => m.id !== memberId));
  }

  if (schedulingMode === "specific_person") {
    return null;
  }

  const showNoResults =
    showDropdown && hasSearched && !isSearching && searchResults.length === 0 && searchQuery.length >= 2;

  return (
    <div className="space-y-3">
      <div>
        <p className="text-xs text-muted-foreground">
          {schedulingMode === "any_available"
            ? "メンバーの誰かが空いていれば予約可能です。予約時に自動でアサインされます。"
            : "全メンバーが空いている時間帯のみ予約可能になります。"}
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          ※ このアプリにGoogleでサインイン済みのユーザーのみ追加できます
        </p>
      </div>

      {/* Selected members */}
      {selectedMembers.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {selectedMembers.map((member) => (
            <Badge
              key={member.id}
              variant="secondary"
              className="flex items-center gap-1.5 py-1 px-2.5"
            >
              {member.image ? (
                <img
                  src={member.image}
                  alt=""
                  className="w-4 h-4 rounded-full"
                />
              ) : (
                <div className="w-4 h-4 rounded-full bg-muted-foreground/20 flex items-center justify-center text-[8px] font-medium">
                  {(member.name || member.email)[0].toUpperCase()}
                </div>
              )}
              <span className="text-xs">
                {member.name || member.email}
              </span>
              <button
                type="button"
                onClick={() => removeMember(member.id)}
                className="ml-0.5 text-muted-foreground hover:text-foreground"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M18 6 6 18" />
                  <path d="m6 6 12 12" />
                </svg>
              </button>
            </Badge>
          ))}
        </div>
      )}

      {/* Search input */}
      <div className="relative" ref={dropdownRef}>
        <Input
          ref={inputRef}
          type="text"
          placeholder="メンバーのメールアドレスまたは名前で検索..."
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value);
            setShowDropdown(true);
          }}
          onFocus={() => {
            setShowDropdown(true);
          }}
        />

        {/* Search results dropdown */}
        {showDropdown && (searchResults.length > 0 || isSearching || showNoResults) && (
          <div className="absolute z-50 mt-1 w-full bg-background border rounded-md shadow-lg max-h-48 overflow-y-auto">
            {isSearching ? (
              <div className="p-3 text-sm text-muted-foreground text-center">
                検索中...
              </div>
            ) : searchResults.length > 0 ? (
              searchResults.map((user) => (
                <button
                  key={user.id}
                  type="button"
                  className="w-full flex items-center gap-3 px-3 py-2 hover:bg-muted text-left transition-colors"
                  onClick={() => addMember(user)}
                >
                  {user.image ? (
                    <img
                      src={user.image}
                      alt=""
                      className="w-7 h-7 rounded-full"
                    />
                  ) : (
                    <div className="w-7 h-7 rounded-full bg-muted-foreground/20 flex items-center justify-center text-xs font-medium">
                      {(user.name || user.email)[0].toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">
                      {user.name || "（名前未設定）"}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {user.email}
                    </p>
                  </div>
                </button>
              ))
            ) : (
              <div className="p-3 text-center">
                <p className="text-sm text-muted-foreground">
                  該当するユーザーが見つかりません
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  追加したいメンバーに先にこのアプリへGoogleサインインしてもらってください
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {selectedMembers.length === 0 && (
        <p className="text-xs text-amber-600">
          ※ メンバーが追加されていません。あなたのみがメンバーとして登録されます。
        </p>
      )}
    </div>
  );
}
