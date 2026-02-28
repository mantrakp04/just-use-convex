import { useNavigate, useLocation } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { Tabs, TabsTrigger, TabsList } from "../ui/tabs";
import { useHeader } from "@/hooks/use-header";
import { HomeIcon, BookIcon, KanbanIcon, MessageSquareIcon, WorkflowIcon, SettingsIcon } from "lucide-react";

export default function Header() {
  const navigate = useNavigate();
  const location = useLocation();
  const headerRef = useRef<HTMLDivElement>(null);
  const { setHeaderHeight } = useHeader();

  const links = [
    { to: "", label: "Home", icon: <HomeIcon /> },
    { to: "docs", label: "Docs", icon: <BookIcon /> },
    { to: "dashboard", label: "Dashboard", icon: <KanbanIcon /> },
    { to: "chats", label: "Chats", icon: <MessageSquareIcon /> },
    { to: "workflows", label: "Workflows", icon: <WorkflowIcon /> },
    { to: "settings", label: "Settings", icon: <SettingsIcon /> },
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
        // className="container mx-auto w-4xl border border-border rounded-lg px-.5 overflow-x-auto no-scrollbar z-50 backdrop-blur-xs"
      >
        <TabsList variant="default" className="p-0">
          {links.map(({ to, icon }) => (
            <TabsTrigger key={to} value={to} onClick={async () => void navigate({ to: `/${to}` })} className="px-2">
              {icon}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
    </div>
  );
}
