import { useEffect, useRef } from "react";
import { useLocation } from "@tanstack/react-router";
import { motion, AnimatePresence } from "motion/react";
import { useHeader } from "@/hooks/use-header";
import { springExpand } from "@/lib/motion";
import Header from "./header";
import { HeaderChatsDropdown } from "./chats";

const CHAT_DETAIL_PATTERN = /^\/chats\/[^/]+$/;

function useIsChatDetailRoute() {
  const { pathname } = useLocation();
  return CHAT_DETAIL_PATTERN.test(pathname);
}

export default function HeaderIndex() {
  const blockRef = useRef<HTMLDivElement>(null);
  const { setHeaderHeight } = useHeader();
  const isChatDetail = useIsChatDetailRoute();

  useEffect(() => {
    const el = blockRef.current;
    if (!el) return;

    const update = () => setHeaderHeight(el.getBoundingClientRect().height);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [setHeaderHeight]);

  return (
    <div
      ref={blockRef}
      className="relative z-50 flex items-center justify-center mt-2 w-full pointer-events-none"
    >
      <div className="relative flex items-center pointer-events-auto">
        {/* Before slot - extensible for dynamic content */}
        <div className="absolute right-full mr-2 flex items-center justify-end">
          <AnimatePresence mode="popLayout">
            {isChatDetail ? (
              <motion.div
                key="header-before"
                layout
                initial={{ opacity: 0, x: 16, filter: "blur(4px)" }}
                animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
                exit={{ opacity: 0, x: 16, filter: "blur(4px)" }}
                transition={{ ...springExpand, opacity: { duration: 0.15 } }}
                className="overflow-hidden whitespace-nowrap"
              >
                <HeaderChatsDropdown />
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>

        <Header />

        {/* After slot - extensible for dynamic content */}
        <div className="absolute left-full ml-2 flex items-center justify-start">
          <AnimatePresence mode="popLayout">
            {/* Future dynamic content */}
            <motion.div
              key="header-after"
              layout
              initial={{ opacity: 0, x: -16, filter: "blur(4px)" }}
              animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
              exit={{ opacity: 0, x: -16, filter: "blur(4px)" }}
              transition={{ ...springExpand, opacity: { duration: 0.15 } }}
              className="overflow-hidden whitespace-nowrap"
            >
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
