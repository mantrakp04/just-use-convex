import { useNavigate, useLocation } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { Tabs, TabsTrigger, TabsList } from "../ui/tabs";
import { useHeader } from "@/hooks/use-header";

export default function Header() {
  const navigate = useNavigate();
  const location = useLocation();
  const headerRef = useRef<HTMLDivElement>(null);
  const { setHeaderHeight } = useHeader();

  const links = [
    { to: "", label: "Home" },
    { to: "docs", label: "Docs" },
    { to: "dashboard", label: "Dashboard" },
    { to: "chats", label: "Chats" },
    { to: "settings", label: "Settings" },
  ] as const;

  const activeTab = location.pathname === "/" ? "" : Object.values(links).filter(({ to }) => to !== "").find(({ to }) =>
    location.pathname.includes(to))?.to;

  useEffect(() => {
    const element = headerRef.current;
    if (!element) return;

    const updateHeaderHeight = () => {
      setHeaderHeight(element.getBoundingClientRect().height);
    };

    updateHeaderHeight();

    const observer = new ResizeObserver(updateHeaderHeight);
    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, [setHeaderHeight]);

  return (
    <div ref={headerRef} className="relative z-50 w-fit mx-auto">
      <Tabs
        value={activeTab ?? ""}
        className="container mx-auto w-4xl border border-border rounded-lg px-.5 overflow-x-auto no-scrollbar z-50 backdrop-blur-xs"
      >
        <TabsList variant="line" className={`w-full justify-between`}>
          {links.map(({ to, label }) => (
            <TabsTrigger key={to} value={to} onClick={() => navigate({ to: `/${to}` })} className='cursor-pointer' >{label}</TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
    </div>
  );
}
