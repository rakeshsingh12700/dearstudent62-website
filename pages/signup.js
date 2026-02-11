import { useEffect } from "react";
import { useRouter } from "next/router";

export default function Signup() {
  const router = useRouter();

  useEffect(() => {
    const search = typeof window !== "undefined" ? window.location.search : "";
    const separator = search ? "&" : "?";
    router.replace(`/auth${search}${separator}mode=signup`);
  }, [router]);

  return null;
}
