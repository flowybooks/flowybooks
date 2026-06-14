'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Home, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { signOut } from '@/app/(login)/actions';
import type { SafeUser } from '@/lib/db/queries';

export function UserMenuClient(props: { user: SafeUser | null }) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const router = useRouter();

  async function handleSignOut() {
    await signOut();
    router.refresh();
    router.push('/');
  }

  if (!props.user) {
    return (
      <div className="flex items-center gap-2">
        <Button
          asChild
          variant="outline"
          className="min-w-[112px] rounded-full border-border/70 bg-background/45 px-5 text-xs uppercase tracking-[0.16em] text-muted-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] backdrop-blur-sm hover:border-primary/35 hover:bg-background/65 hover:text-foreground"
        >
          <Link href="/sign-up">Sign Up</Link>
        </Button>
        <Button
          asChild
          className="min-w-[112px] rounded-full bg-primary/95 px-5 text-xs uppercase tracking-[0.16em] text-primary-foreground shadow-[0_12px_30px_rgba(97,112,255,0.28)] hover:bg-primary"
        >
          <Link href="/sign-in">Sign In</Link>
        </Button>
      </div>
    );
  }

  return (
    <DropdownMenu open={isMenuOpen} onOpenChange={setIsMenuOpen}>
      <DropdownMenuTrigger id="user-menu-trigger">
        <Avatar className="cursor-pointer size-9">
          <AvatarImage alt={props.user.name || ''} />
          <AvatarFallback>
            {props.user.email
              .split(' ')
              .map((n) => n[0])
              .join('')}
          </AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="flex flex-col gap-1">
        <DropdownMenuItem asChild>
          <Link href="/dashboard" className="flex w-full items-center">
            <Home className="mr-2 h-4 w-4" />
            <span>Dashboard</span>
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <button type="button" onClick={handleSignOut} className="flex w-full items-center">
            <LogOut className="mr-2 h-4 w-4" />
            <span>Sign out</span>
          </button>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
