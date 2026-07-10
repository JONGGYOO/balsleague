"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";

// 링크 공유 시 OG 이미지 미리보기가 뜨도록 서버 리다이렉트 대신
// 클라이언트에서 이동 처리 (루트 경로는 항상 200 + 메타태그 포함 HTML을 반환해야 함)
export default function Home() {
  const router = useRouter();
  const { isLoaded, isSignedIn } = useAuth();

  useEffect(() => {
    if (!isLoaded) return;
    router.replace(isSignedIn ? "/leagues" : "/sign-in");
  }, [isLoaded, isSignedIn, router]);

  return (
    <div className="min-h-screen flex items-center justify-center text-gray-400">
      불러오는 중...
    </div>
  );
}
